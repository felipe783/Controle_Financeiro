# Sobre o Arquivo

`backend/app/auth.py` implementa o login, as sessões e os papéis. Não existe senha padrão: o primeiro usuário é um **administrador** criado por comando interativo (`scripts/create-admin.sh` → `python -m app.cli create-admin`, ver [[Worker e CLI (Financeiro)|Worker e CLI]]). Os demais são criados por um administrador na tela Usuários (`/api/users`, ver [[Routers (Financeiro)|Routers]]).

Responsabilidades:
- hash de senhas com **Argon2id** e regra mínima: 12 caracteres, pelo menos 5 caracteres distintos e diferente do usuário;
- sessão com token aleatório de 256 bits no cookie `fin_session` (HttpOnly, `SameSite=Strict`, `Secure` conforme `COOKIE_SECURE`, `path=/api`). O banco guarda **só o SHA-256** do token;
- expiração em `SESSION_HOURS` (padrão 12 h). A troca de senha e a desativação do usuário encerram todas as sessões;
- nome de usuário **sem diferenciar maiúsculas** no login, no cadastro e no `reset-password` (índice único em `lower(username)`);
- bloqueio de `LOGIN_MAX_ATTEMPTS` (5) tentativas por usuário normalizado + IP durante `LOGIN_LOCK_MINUTES` (15);
- quando o usuário não existe, a senha é verificada contra um hash fictício, para o tempo de resposta não revelar isso;
- papéis: `is_admin` só controla a gestão de usuários (`require_admin`). Os dados financeiros são compartilhados.

# Funcionalidades

## Login

````python
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
````

## Sessão em cada requisição e permissão de administrador

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

````python
def require_admin(user: User = Depends(current_user)) -> User:
    """Permissão verificada no servidor: esconder o menu no frontend não basta."""
    if not user.is_admin:
        raise HTTPException(403, "Apenas administradores podem gerenciar usuários.")
    return user
````

## Logout

No servidor, a sessão é apagada e o cookie é removido com os mesmos atributos com que foi criado:

````python
def logout(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        db.execute(delete(UserSession).where(UserSession.token_hash == _token_hash(token)))
        db.commit()
    # Mesmos atributos do set_cookie: alguns navegadores ignoram a remoção de um cookie Secure sem eles.
    response.delete_cookie(COOKIE, path="/api", httponly=True, samesite="strict", secure=get_settings().cookie_secure)
````

No frontend (`frontend/src/App.tsx`), sair zera a query `me` que a tela observa, descarta os dados financeiros em cache e volta ao login. Só redireciona se havia sessão; abrir um link já deslogado preserva a URL para depois do login.

````tsx
  function endSession() {
    // Sem sessão anterior (ex.: abrir /lancamentos já deslogado), mantém a URL para voltar a ela após entrar.
    const hadSession = !!qc.getQueryData(["me"]);
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    setMenuOpen(false);
    if (hadSession) navigate("/", { replace: true });
  }

  async function logout() {
    setLeaving(true);
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // 401 = a sessão já tinha expirado; qualquer outra falha deixa a sessão aberta no servidor.
      if (!(err instanceof ApiError && err.status === 401)) {
        setLeaving(false);
        notify(`Não foi possível sair: ${err instanceof Error ? err.message : "erro desconhecido"}`, "error");
        return;
      }
    }
    setLeaving(false);
    endSession();
  }
````

> [!success] Corrigido em 2026-10-18
> Antes, o `logout` chamava `qc.clear()` e só depois `setQueryData(["me"], null)`. O `useQuery` continuava preso à query descartada, então a tela seguia na página protegida com os dados à mostra, embora o servidor já respondesse 401. Reproduzido e verificado no navegador.

> [!warning] Limitação conhecida
> O contador de tentativas (`_failures`) fica **em memória** do processo da API: zera quando ela reinicia, e o dicionário é esvaziado ao passar de 10 000 chaves. Por isso o uvicorn roda com 1 processo. Para exposição pública, use também o rate limit do proxy ou o fail2ban.

> [!note] Verificado em 2026-10-18
> Testes em `tests/test_api.py` e `tests/test_users.py`:
> - logout invalidando a sessão e reapresentando o cookie antigo;
> - bloqueio com variantes do nome (espaços, maiúsculas);
> - 403 para usuário comum em `/api/users`, inclusive na tentativa de se promover;
> - duplicatas e senha fraca;
> - último admin com concorrência;
> - migração `0002`.

---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo API (Financeiro)|!Modulo API]]
