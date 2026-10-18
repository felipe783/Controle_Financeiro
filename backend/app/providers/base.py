"""Interface dos provedores de cotação. Os provedores não conhecem banco nem regras financeiras."""

import datetime as dt
import logging
import time
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

import httpx

log = logging.getLogger("app.providers")
SP_TZ = ZoneInfo("America/Sao_Paulo")


@dataclass
class QuoteResult:
    symbol: str
    price: Decimal
    currency: str
    reference_date: dt.date


class ProviderError(Exception):
    """status: error | not_found | rate_limited | auth"""

    def __init__(self, status: str, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def to_decimal(value) -> Decimal:
    try:
        d = Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise ProviderError("error", f"Valor numérico inválido na resposta: {value!r}") from exc
    if not d.is_finite() or d <= 0:
        raise ProviderError("error", f"Preço inválido na resposta: {value!r}")
    return d


def get_json(client: httpx.Client, url: str, *, params=None, headers=None, retries: int = 2) -> dict:
    """GET com retentativas limitadas para falhas transitórias (rede, 5xx, 429).
    Nunca registra parâmetros nem cabeçalhos: eles podem conter chaves de API."""
    attempt = 0
    while True:
        try:
            resp = client.get(url, params=params, headers=headers)
        except httpx.TimeoutException:
            err = ProviderError("error", "Tempo limite excedido ao consultar o provedor.")
        except httpx.TransportError as exc:
            err = ProviderError("error", f"Falha de rede: {type(exc).__name__}.")
        else:
            if resp.status_code in (401, 403):
                raise ProviderError("auth", f"Acesso negado pelo provedor (HTTP {resp.status_code}); verifique a chave.")
            if resp.status_code == 404:
                raise ProviderError("not_found", "Ativo não encontrado no provedor.")
            if resp.status_code == 429:
                err = ProviderError("rate_limited", "Limite de requisições do provedor atingido.")
            elif resp.status_code >= 500:
                err = ProviderError("error", f"Provedor indisponível (HTTP {resp.status_code}).")
            elif resp.status_code >= 400:
                raise ProviderError("error", f"Requisição recusada (HTTP {resp.status_code}).")
            else:
                try:
                    return resp.json()
                except ValueError as exc:
                    raise ProviderError("error", "Resposta não é JSON válido.") from exc
        if attempt >= retries:
            raise err
        attempt += 1
        time.sleep(min(0.5 * 2 ** attempt, 8))
