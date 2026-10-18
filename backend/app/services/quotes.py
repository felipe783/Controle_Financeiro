"""Orquestra a atualização de cotações e câmbio.

- Um único processo atualiza por vez (advisory lock do PostgreSQL), seja o worker ou o botão manual.
- Falha nunca apaga cotação anterior nem cria preço substituto: só registra o erro em quote_fetch_logs.
- Cotações automáticas do mesmo dia de referência são atualizadas no lugar; cotações manuais nunca são
  sobrescritas (a política de prioridade está em investments.effective_quote).
"""

import datetime as dt
import logging
import time

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Asset, FxRate, Quote, QuoteFetchLog, SystemStatus
from app.providers.base import ProviderError
from app.providers.sources import AlphaVantageProvider, BcbPtaxProvider, BrapiProvider
from app.services.common import Conflict

log = logging.getLogger("app.quotes")
QUOTES_LOCK_KEY = 815_001  # identificador arbitrário e fixo do advisory lock
MANUAL_CACHE_MINUTES = 5


def configured_providers():
    s = get_settings()
    out = []
    if s.brapi_token:
        out.append(BrapiProvider(s.brapi_token, s.quotes_max_retries))
    if s.alphavantage_api_key:
        out.append(AlphaVantageProvider(s.alphavantage_api_key, s.quotes_max_retries))
    return out


def provider_for(asset: Asset, providers):
    return next((p for p in providers if p.supports(asset.asset_class, asset.currency)), None)


def _log(db: Session, **kw) -> None:
    db.add(QuoteFetchLog(**kw))
    db.commit()


def _set_status(db: Session, key: str, value: dict) -> None:
    stmt = pg_insert(SystemStatus).values(key=key, value=value)
    db.execute(stmt.on_conflict_do_update(index_elements=["key"], set_={"value": value, "updated_at": func.now()}))
    db.commit()


def _daily_count(db: Session, provider: str) -> int:
    start = dt.datetime.combine(dt.date.today(), dt.time.min).astimezone()
    return db.scalar(select(func.count()).select_from(QuoteFetchLog).where(
        QuoteFetchLog.provider == provider, QuoteFetchLog.received_at >= start,
        QuoteFetchLog.status.in_(("ok", "error", "not_found")))) or 0


def _recent_auto(db: Session, asset_id: int, minutes: int) -> bool:
    since = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=minutes)
    return db.scalar(select(func.count()).select_from(QuoteFetchLog).where(
        QuoteFetchLog.asset_id == asset_id, QuoteFetchLog.status == "ok",
        QuoteFetchLog.received_at >= since)) > 0


def update_all(db: Session, trigger: str = "auto", asset_ids: list[int] | None = None,
               client: httpx.Client | None = None, providers=None, fx_provider=None) -> dict:
    """Atualiza cotações e câmbio. Retorna um resumo; nunca lança por falha de um ativo."""
    # Conexão dedicada: o Session devolve a conexão ao pool a cada commit, o que perderia o lock de sessão.
    lock_conn = db.get_bind().connect()
    if not lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": QUOTES_LOCK_KEY}):
        lock_conn.close()
        raise Conflict("Já existe uma atualização de cotações em andamento.")
    s = get_settings()
    own_client = client is None
    client = client or httpx.Client(timeout=s.quotes_request_timeout_seconds,
                                    headers={"User-Agent": "financeiro-pessoal/1.0"})
    providers = configured_providers() if providers is None else providers
    if fx_provider is None and s.fx_bcb_enabled:
        fx_provider = BcbPtaxProvider(s.quotes_max_retries)
    summary = {"ok": 0, "errors": 0, "skipped": 0, "unsupported": 0, "fx_ok": 0, "fx_errors": 0,
               "providers": [p.name for p in providers], "trigger": trigger}
    try:
        q = select(Asset).where(Asset.archived.is_(False), Asset.auto_quote.is_(True), Asset.ticker.is_not(None))
        if asset_ids:
            q = q.where(Asset.id.in_(asset_ids))
        cache_minutes = MANUAL_CACHE_MINUTES if trigger == "manual" else max(s.quotes_update_interval_minutes - 1, 1)
        last_call: dict[str, float] = {}
        for asset in db.scalars(q).all():
            prov = provider_for(asset, providers)
            if prov is None:
                summary["unsupported"] += 1
                continue
            if _recent_auto(db, asset.id, cache_minutes):
                summary["skipped"] += 1
                continue
            if prov.name == "alphavantage" and _daily_count(db, prov.name) >= s.alphavantage_daily_limit:
                _log(db, asset_id=asset.id, provider=prov.name, status="rate_limited", trigger=trigger,
                     error_message="Limite diário configurado (ALPHAVANTAGE_DAILY_LIMIT) atingido.")
                summary["errors"] += 1
                continue
            wait = s.quotes_min_seconds_between_requests - (time.monotonic() - last_call.get(prov.name, 0))
            if wait > 0:
                time.sleep(wait)
            last_call[prov.name] = time.monotonic()
            try:
                r = prov.fetch(client, asset.ticker)
            except ProviderError as exc:
                log.warning("cotacao falhou ativo=%s provedor=%s status=%s", asset.id, prov.name, exc.status)
                _log(db, asset_id=asset.id, provider=prov.name, status=exc.status, error_message=exc.message,
                     trigger=trigger)
                summary["errors"] += 1
                continue
            currency = r.currency or asset.currency
            if currency != asset.currency:
                _log(db, asset_id=asset.id, provider=prov.name, status="error", trigger=trigger,
                     error_message=f"Moeda retornada ({currency}) difere da cadastrada ({asset.currency}).")
                summary["errors"] += 1
                continue
            stmt = pg_insert(Quote).values(asset_id=asset.id, source="auto", provider=prov.name, price=r.price,
                                           currency=currency, reference_date=r.reference_date)
            db.execute(stmt.on_conflict_do_update(
                index_elements=["asset_id", "provider", "reference_date"], index_where=text("source = 'auto'"),
                set_={"price": r.price, "received_at": func.now()}))
            _log(db, asset_id=asset.id, provider=prov.name, status="ok", price=r.price, currency=currency,
                 reference_date=r.reference_date, trigger=trigger)
            summary["ok"] += 1
        if fx_provider is not None:
            currencies = db.scalars(select(Asset.currency).where(Asset.currency != "BRL").distinct()).all()
            for cur in currencies:
                try:
                    r = fx_provider.fetch_rate(client, cur, dt.date.today())
                except ProviderError as exc:
                    _log(db, currency_pair=f"{cur}BRL", provider=fx_provider.name, status=exc.status,
                         error_message=exc.message, trigger=trigger)
                    summary["fx_errors"] += 1
                    continue
                stmt = pg_insert(FxRate).values(currency=cur, rate=r.price, reference_date=r.reference_date,
                                                source=fx_provider.name)
                db.execute(stmt.on_conflict_do_update(constraint="uq_fx_currency_date_source",
                                                      set_={"rate": r.price, "received_at": func.now()}))
                _log(db, currency_pair=f"{cur}BRL", provider=fx_provider.name, status="ok", price=r.price,
                     currency="BRL", reference_date=r.reference_date, trigger=trigger)
                summary["fx_ok"] += 1
        summary["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        _set_status(db, "quotes_last_run", summary)
        log.info("cotacoes atualizadas ok=%s erros=%s ignoradas=%s", summary["ok"], summary["errors"],
                 summary["skipped"])
        return summary
    finally:
        if own_client:
            client.close()
        db.rollback()
        lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": QUOTES_LOCK_KEY})
        lock_conn.close()


def add_manual_fx(db: Session, currency: str, rate, reference_date: dt.date) -> FxRate:
    stmt = pg_insert(FxRate).values(currency=currency, rate=rate, reference_date=reference_date, source="manual")
    db.execute(stmt.on_conflict_do_update(constraint="uq_fx_currency_date_source",
                                          set_={"rate": rate, "received_at": func.now()}))
    db.commit()
    return db.scalar(select(FxRate).where(FxRate.currency == currency, FxRate.reference_date == reference_date,
                                          FxRate.source == "manual"))
