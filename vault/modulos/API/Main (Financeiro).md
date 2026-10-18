# Sobre o Arquivo

O arquivo `backend/app/main.py` é o **ponto de entrada da API**. Ele lê as configurações (`config.py`), configura os logs, cria a aplicação e registra os routers com prefixo `/api`.

Responsabilidades:
- criar o `FastAPI` (documentação `/api/docs` **desligada** quando `APP_ENV=production`);
- habilitar o CORS só se `CORS_ORIGINS` estiver preenchido (o padrão é a mesma origem, via Nginx);
- barrar requisições de alteração sem o cabeçalho `X-Requested-With` (CSRF);
- converter erros de domínio e de validação em respostas JSON;
- expor `/api/health` e as rotas `/api/auth/login`, `/logout` e `/me`.

# Funcionalidades

## Proteção CSRF

O cookie de sessão é `SameSite=Strict`. Além disso, todo `POST/PUT/PATCH/DELETE` sob `/api/` precisa do cabeçalho `X-Requested-With: fetch`, que formulários de outros sites não conseguem enviar. O middleware também aplica `Cache-Control: no-store` às respostas.

````python
@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    # Cabeçalho que formulários de outros sites não conseguem enviar (complementa SameSite=Strict).
    if request.method in UNSAFE and request.url.path.startswith("/api/") \
            and request.headers.get("x-requested-with") != "fetch":
        return JSONResponse({"detail": "Requisição recusada (cabeçalho X-Requested-With ausente)."}, 403)
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    return response
````

## Saúde da aplicação

O serviço só é considerado saudável se o banco responde **e** a versão aplicada é a mais recente do Alembic. O resultado é usado pelo healthcheck do container `api` e pelo `deploy.sh` (ver [[Scripts (Financeiro)|Scripts]]).

````python
@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    """Saudável só se o banco responde e o schema está na versão esperada (migrações aplicadas)."""
    try:
        current = db.scalar(text("SELECT version_num FROM alembic_version"))
    except Exception:  # noqa: BLE001 - qualquer falha de banco torna o serviço indisponível
        log.exception("health: banco indisponível")
        return JSONResponse({"status": "error", "database": "unavailable"}, 503)
    if current != migration_head():
        return JSONResponse({"status": "error", "database": "ok", "migration": "pending"}, 503)
    has_user = bool(db.scalar(select(func.count()).select_from(User)))
    return {"status": "ok", "database": "ok", "migration": current, "has_user": has_user}
````

> [!note] Verificado em 2026-10-18
> Com `uvicorn` local, `GET /api/health` retornou `{"status":"ok","database":"ok","migration":"0001","has_user":true}`. O teste `test_health_checks_database_and_migrations` cobre esse retorno.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo API (Financeiro)|!Modulo API]]
