import datetime as dt
from decimal import Decimal

from pydantic import BaseModel


def plain(value):
    """Converte resultados para JSON sem perder precisão: Decimal vira string (como no Pydantic)."""
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, dict):
        return {k: plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value
