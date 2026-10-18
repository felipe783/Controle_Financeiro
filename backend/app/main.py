import logging
from functools import lru_cache
from pathlib import Path

from fastapi import Depends, FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import auth
from app.config import get_settings
from app.db import get_db
from app.logging_setup import configure_logging
from app.models import User
from app.routers import finance, invest, planning
from app.schemas import LoginIn, UserOut
from app.services.common import DomainError

settings = get_settings()
configure_logging(settings.log_level)
log = logging.getLogger("app")

app = FastAPI(title="Financeiro Pessoal", docs_url="/api/docs" if settings.app_env != "production" else None,
              redoc_url=None, openapi_url="/api/openapi.json" if settings.app_env != "production" else None)

if settings.cors_list:
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    # Cabeçalho que formulários de outros sites não conseguem enviar (complementa SameSite=Strict).
    if request.method in UNSAFE and request.url.path.startswith("/api/") \
            and request.headers.get("x-requested-with") != "fetch":
        return JSONResponse({"detail": "Requisição recusada (cabeçalho X-Requested-With ausente)."}, 403)
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(DomainError)
async def domain_error(_: Request, exc: DomainError):
    return JSONResponse({"detail": exc.message}, exc.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = ".".join(str(p) for p in e["loc"] if p not in ("body", "query", "path"))
        msg = e["msg"].removeprefix("Value error, ")
        errors.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse({"detail": "; ".join(errors) or "Dados inválidos."}, 422)


@lru_cache
def migration_head() -> str | None:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    return ScriptDirectory.from_config(config).get_current_head()


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


@app.post("/api/auth/login", response_model=UserOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    return auth.login(db, request, response, data.username, data.password)


@app.post("/api/auth/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    auth.logout(db, request, response)
    response.status_code = 204
    return response


@app.get("/api/auth/me", response_model=UserOut)
def me(user: User = Depends(auth.current_user)):
    return user


app.include_router(finance.router, prefix="/api")
app.include_router(invest.router, prefix="/api")
app.include_router(planning.router, prefix="/api")
