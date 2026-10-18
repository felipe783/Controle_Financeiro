import datetime as dt
from decimal import Decimal
from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from app.models import AuditLog


class DomainError(Exception):
    """Regra de negócio violada. A mensagem é exibida ao usuário (pt-BR)."""

    status_code = 422

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


def get_or_404(db: Session, model, obj_id: int, label: str):
    obj = db.get(model, obj_id)
    if obj is None:
        raise NotFound(f"{label} não encontrado(a).")
    return obj


def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return value


def snapshot(obj) -> dict[str, Any]:
    return {c.key: _jsonable(getattr(obj, c.key)) for c in inspect(obj).mapper.column_attrs}


def audit(db: Session, entity: str, entity_id: int | None, action: str,
          before: dict | None = None, after: dict | None = None, user_id: int | None = None) -> None:
    db.add(AuditLog(entity=entity, entity_id=entity_id, action=action, before=before, after=after,
                    user_id=user_id))
