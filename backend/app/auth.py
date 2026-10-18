"""Autenticação de usuário único (ou poucos usuários) com sessão em cookie HttpOnly.

- Senhas com Argon2id; nunca em texto puro nem em log.
- O token da sessão é aleatório (256 bits); no banco fica só o SHA-256 dele.
- Cookie SameSite=Strict + cabeçalho X-Requested-With obrigatório em métodos que alteram dados
  (formulários de outros sites não conseguem enviá-lo) → proteção contra CSRF.
- Bloqueio temporário após tentativas falhas (em memória do processo; ver limitações no README).
"""

import datetime as dt
import hashlib
import re
import secrets
import threading

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db, set_session_user
from app.models import User, UserSession
from app.seed import seed_user

COOKIE = "fin_session"
_ph = PasswordHasher()
_failures: dict[str, list[dt.datetime]] = {}
_lock = threading.Lock()
# Hash válido usado quando o usuário não existe, para o tempo de resposta não revelar isso.
_DUMMY_HASH = _ph.hash(secrets.token_hex(16))


def hash_password(password: str) -> str:
    return _ph.hash(password)


def validate_new_password(password: str, username: str) -> None:
    if len(password) < 12:
        raise ValueError("A senha deve ter pelo menos 12 caracteres.")
    if password.lower() == username.lower() or len(set(password)) < 5:
        raise ValueError("Senha fraca demais.")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _locked(key: str) -> bool:
    s = get_settings()
    now = dt.datetime.now(dt.timezone.utc)
    with _lock:
        recent = [t for t in _failures.get(key, []) if now - t < dt.timedelta(minutes=s.login_lock_minutes)]
        _failures[key] = recent
        return len(recent) >= s.login_max_attempts


def _register_failure(key: str) -> None:
    with _lock:
        if len(_failures) > 10_000:  # evita crescimento ilimitado com chaves aleatórias
            _failures.clear()
        _failures.setdefault(key, []).append(dt.datetime.now(dt.timezone.utc))


def login(db: Session, request: Request, response: Response, username: str, password: str) -> User:
    # Normaliza uma vez: " Felipe" e "felipe" são o mesmo usuário e dividem o mesmo limite de tentativas.
    username = username.strip().lower()
    key = f"{username}|{request.client.host if request.client else '-'}"
    if _locked(key):
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.")
    user = db.scalar(select(User).where(func.lower(User.username) == username))
    try:
        ok = _ph.verify(user.password_hash if user else _DUMMY_HASH, password) and user is not None
    except (VerificationError, InvalidHashError):
        ok = False
    if not ok or not user.is_active:
        _register_failure(key)
        raise HTTPException(401, "Usuário ou senha inválidos.")
    with _lock:
        _failures.pop(key, None)
    if _ph.check_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    s = get_settings()
    token = secrets.token_urlsafe(32)
    expires = dt.datetime.now(dt.timezone.utc) + dt.timedelta(hours=s.session_hours)
    db.execute(delete(UserSession).where(UserSession.expires_at < dt.datetime.now(dt.timezone.utc)))
    db.add(UserSession(user_id=user.id, token_hash=_token_hash(token), expires_at=expires))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=s.session_hours * 3600, httponly=True, samesite="strict",
                        secure=s.cookie_secure, path="/api")
    return user


def logout(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == _token_hash(token)))
        db.commit()
    # Mesmos atributos do set_cookie: alguns navegadores ignoram a remoção de um cookie Secure sem eles.
    response.delete_cookie(COOKIE, path="/api", httponly=True, samesite="strict", secure=get_settings().cookie_secure)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    if sess is None or sess.expires_at < dt.datetime.now(dt.timezone.utc) or not sess.user.is_active:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    user = sess.user
    set_session_user(db, user.id)  # daqui em diante o banco só mostra e aceita dados deste usuário
    return user


USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,64}$")


class DuplicateUser(ValueError):
    pass


def require_admin(user: User = Depends(current_user)) -> User:
    """Permissão verificada no servidor: esconder o menu no frontend não basta."""
    if not user.is_admin:
        raise HTTPException(403, "Apenas administradores podem gerenciar usuários.")
    return user


def create_user(db: Session, username: str, password: str, is_admin: bool = False, commit: bool = True) -> User:
    username = username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise ValueError("Nome de usuário inválido: use de 3 a 64 letras, números, ponto, hífen ou sublinhado.")
    validate_new_password(password, username)
    if db.scalar(select(User).where(func.lower(User.username) == username.lower())):
        raise DuplicateUser("Já existe um usuário com esse nome.")
    user = User(username=username, password_hash=hash_password(password), is_active=True, is_admin=is_admin)
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # cadastro simultâneo com o mesmo nome
        db.rollback()
        raise DuplicateUser("Já existe um usuário com esse nome.") from exc
    seed_user(db, user.id)  # categorias padrão na mesma transação: ou o usuário nasce completo, ou não nasce
    if commit:
        db.commit()
    return user


def set_password(db: Session, username: str, password: str) -> None:
    user = db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))
    if user is None:
        raise ValueError("Usuário não encontrado.")
    validate_new_password(password, username)
    user.password_hash = hash_password(password)
    db.execute(delete(UserSession).where(UserSession.user_id == user.id))  # derruba sessões antigas
    db.commit()
