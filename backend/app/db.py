from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_settings


class Base(DeclarativeBase):
    pass


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def get_engine():
    global _engine, _SessionLocal
    if _engine is None:
        _engine = create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True, future=True)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def reset_engine() -> None:
    """Usado pelos testes para trocar de banco."""
    global _engine, _SessionLocal
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None


def new_session() -> Session:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal()


def get_db() -> Iterator[Session]:
    db = new_session()
    try:
        yield db
    finally:
        db.close()


# ---------- Dono dos dados (Row-Level Security) ----------
# As políticas do PostgreSQL só mostram e aceitam linhas cujo user_id seja app.user_id. O valor é local à
# transação (set_config(..., true)) e é reaplicado a cada transação, porque os serviços fazem vários commits.
# Sem usuário no contexto, app.user_id fica vazio e o banco não devolve nenhuma linha financeira.

_SET_USER = "SELECT set_config('app.user_id', :uid, true)"


@event.listens_for(Session, "after_begin")
def _apply_user(session: Session, transaction, connection) -> None:
    uid = session.info.get("user_id")
    connection.execute(text(_SET_USER), {"uid": str(uid) if uid else ""})


def set_session_user(session: Session, user_id: int | None) -> None:
    """Define o dono dos dados para esta sessão (requisição ou iteração do worker)."""
    previous = session.info.get("user_id")
    if previous is not None and previous != user_id:
        session.expunge_all()  # nada carregado para o usuário anterior pode ser reaproveitado pelo próximo
    session.info["user_id"] = user_id
    if session.in_transaction():
        session.execute(text(_SET_USER), {"uid": str(user_id) if user_id else ""})


@contextmanager
def acting_as(session: Session, user_id: int):
    """Grava em nome de outro usuário dentro da transação atual (ex.: categorias de um usuário recém-criado)."""
    previous = session.info.get("user_id")
    session.flush()
    session.execute(text(_SET_USER), {"uid": str(user_id)})
    yield  # se algo falhar aqui, a transação está abortada e a exceção original sobe sem ser mascarada
    session.flush()
    session.execute(text(_SET_USER), {"uid": str(previous) if previous else ""})
