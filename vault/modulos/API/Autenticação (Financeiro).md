# Sobre o Arquivo

`backend/app/auth.py` implementa o **login de usuário único** (ou de poucos usuários com os mesmos dados). Não existe senha padrão: o primeiro usuário é criado por comando interativo (`scripts/create-admin.sh` → `python -m app.cli create-admin`, ver [[Worker e CLI (Financeiro)|Worker e CLI]]).

Responsabilidades:
- hash de senhas com **Argon2id** e regra mínima: 12 caracteres, pelo menos 5 caracteres distintos e diferente do usuário;
- sessão com token aleatório de 256 bits no cookie `fin_session` (HttpOnly, `SameSite=Strict`, `Secure` conforme `COOKIE_SECURE`, `path=/api`). O banco guarda **só o SHA-256** do token;
- expiração em `SESSION_HOURS` (padrão 12 h). A troca de senha encerra todas as sessões;
- bloqueio de `LOGIN_MAX_ATTEMPTS` (5) tentativas por usuário + IP durante `LOGIN_LOCK_MINUTES` (15);
- quando o usuário não existe, a senha é verificada contra um hash fictício, para o tempo de resposta não revelar isso.

# Funcionalidades

## Login

````python
def login(db: Session, request: Request, response: Response, username: str, password: str) -> User:
    key = f"{username.lower()}|{request.client.host if request.client else '-'}"
    if _locked(key):
        raise HTTPException(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.")
    user = db.scalar(select(User).where(User.username == username))
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
````

## Sessão em cada requisição

````python
def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    if sess is None or sess.expires_at < dt.datetime.now(dt.timezone.utc) or not sess.user.is_active:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    return sess.user
````

> [!warning] Limitação conhecida
> O contador de tentativas (`_failures`) fica **em memória** do processo da API: zera quando ela reinicia, e o dicionário é esvaziado ao passar de 10 000 chaves. Por isso o uvicorn roda com 1 processo. Para exposição pública, use também o rate limit do proxy ou o fail2ban.

> [!note] Verificado em 2026-10-18
> Testes `test_auth_required_and_csrf`, `test_login_lockout`, `test_weak_password_rejected` e `test_password_stored_hashed`.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo API (Financeiro)|!Modulo API]]
