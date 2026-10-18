from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.models import Asset, FxRate, InvestmentOperation, Quote, QuoteFetchLog, SystemStatus, Transaction, User
from app.schemas import AssetIn, FxRateIn, ManualQuoteIn, OperationIn, OperationOut, QuoteOut
from app.serialize import plain
from app.services import investments, quotes
from app.services.common import Conflict, audit, get_or_404, snapshot

router = APIRouter(dependencies=[Depends(current_user)])


def asset_out(a: Asset, v: dict | None = None) -> dict:
    base = {k: getattr(a, k) for k in ("id", "name", "ticker", "asset_class", "institution", "currency",
                                       "auto_quote", "indexer", "contracted_rate", "maturity_date", "liquidity",
                                       "archived", "notes")}
    base["provider"] = getattr(quotes.provider_for(a, quotes.configured_providers()), "name", None)
    if v:
        base.update({k: val for k, val in v.items() if not k.startswith("_") and k != "asset"})
    return plain(base)


@router.get("/portfolio")
def get_portfolio(db: Session = Depends(get_db)):
    pf = investments.portfolio(db)
    return plain({
        "items": [asset_out(it["asset"], it) for it in pf["items"]],
        "totals": pf["totals"], "simple_return": pf["simple_return"], "xirr": pf["xirr"],
        "by_class": pf["by_class"],
        "providers": [p.name for p in quotes.configured_providers()],
    })


@router.get("/assets/{asset_id}")
def get_asset(asset_id: int, db: Session = Depends(get_db)):
    a = get_or_404(db, Asset, asset_id, "Ativo")
    return asset_out(a, investments.valuation(db, a, investments.asset_ops(db, a.id)))


@router.post("/assets", status_code=201)
def create_asset(data: AssetIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if data.ticker and db.scalar(select(Asset).where(Asset.ticker == data.ticker, Asset.institution.is_not_distinct_from(
            data.institution))):
        raise Conflict("Já existe um ativo com esse código nessa instituição.")
    a = Asset(**data.model_dump())
    db.add(a)
    db.flush()
    audit(db, "asset", a.id, "create", after=snapshot(a), user_id=user.id)
    db.commit()
    return asset_out(a)


@router.put("/assets/{asset_id}")
def update_asset(asset_id: int, data: AssetIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_or_404(db, Asset, asset_id, "Ativo")
    has_ops = db.scalar(select(func.count()).select_from(InvestmentOperation)
                        .where(InvestmentOperation.asset_id == a.id))
    if has_ops and data.currency != a.currency:
        raise Conflict("Não é possível mudar a moeda de um ativo com operações.")
    before = snapshot(a)
    for k, v in data.model_dump().items():
        setattr(a, k, v)
    db.flush()
    audit(db, "asset", a.id, "update", before=before, after=snapshot(a), user_id=user.id)
    db.commit()
    return asset_out(a)


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    a = get_or_404(db, Asset, asset_id, "Ativo")
    if db.scalar(select(func.count()).select_from(InvestmentOperation).where(InvestmentOperation.asset_id == a.id)):
        raise Conflict("O ativo possui operações; arquive-o em vez de excluir.")
    audit(db, "asset", a.id, "delete", before=snapshot(a), user_id=user.id)
    db.delete(a)
    db.commit()


def op_out(db: Session, op: InvestmentOperation) -> OperationOut:
    o = OperationOut.model_validate(op)
    tx = db.scalar(select(Transaction).where(Transaction.investment_operation_id == op.id))
    if tx:
        o.transaction_id, o.cash_amount = tx.id, tx.amount
    return o


@router.get("/operations", response_model=list[OperationOut])
def list_operations(asset_id: int | None = None, kind: str | None = None, db: Session = Depends(get_db),
                    limit: int = Query(500, le=2000)):
    q = select(InvestmentOperation)
    if asset_id:
        q = q.where(InvestmentOperation.asset_id == asset_id)
    if kind:
        q = q.where(InvestmentOperation.kind == kind)
    ops = db.scalars(q.order_by(InvestmentOperation.date.desc(), InvestmentOperation.id.desc()).limit(limit)).all()
    return [op_out(db, o) for o in ops]


@router.post("/operations", response_model=OperationOut, status_code=201)
def create_operation(data: OperationIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return op_out(db, investments.save_operation(db, data, None, user.id))


@router.put("/operations/{op_id}", response_model=OperationOut)
def update_operation(op_id: int, data: OperationIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return op_out(db, investments.save_operation(db, data, op_id, user.id))


@router.delete("/operations/{op_id}", status_code=204)
def delete_operation(op_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    investments.delete_operation(db, op_id, user.id)


# ---------- Cotações ----------
@router.get("/assets/{asset_id}/quotes", response_model=list[QuoteOut])
def list_quotes(asset_id: int, db: Session = Depends(get_db), limit: int = Query(200, le=2000)):
    return db.scalars(select(Quote).where(Quote.asset_id == asset_id)
                      .order_by(Quote.reference_date.desc(), Quote.received_at.desc()).limit(limit)).all()


@router.post("/assets/{asset_id}/quotes", response_model=QuoteOut, status_code=201)
def manual_quote(asset_id: int, data: ManualQuoteIn, db: Session = Depends(get_db),
                 user: User = Depends(current_user)):
    return investments.add_manual_quote(db, asset_id, data, user.id)


@router.delete("/quotes/{quote_id}", status_code=204)
def delete_quote(quote_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    q = get_or_404(db, Quote, quote_id, "Cotação")
    if q.source != "manual":
        raise Conflict("Somente cotações manuais podem ser removidas.")
    audit(db, "quote", q.id, "delete", before=snapshot(q), user_id=user.id)
    db.delete(q)
    db.commit()


@router.post("/quotes/update")
def update_quotes(asset_id: int | None = None, db: Session = Depends(get_db)):
    """Atualização manual sob demanda (respeita cache curto e limites dos provedores)."""
    return quotes.update_all(db, trigger="manual", asset_ids=[asset_id] if asset_id else None)


@router.get("/quotes/status")
def quotes_status(db: Session = Depends(get_db)):
    last = db.get(SystemStatus, "quotes_last_run")
    worker = db.get(SystemStatus, "worker_heartbeat")
    logs = db.scalars(select(QuoteFetchLog).order_by(QuoteFetchLog.received_at.desc()).limit(50)).all()
    names = dict(db.execute(select(Asset.id, Asset.ticker)).all())
    return plain({
        "providers": [p.name for p in quotes.configured_providers()],
        "fx_provider": "bcb_ptax" if quotes.get_settings().fx_bcb_enabled else None,
        "auto_update": quotes.get_settings().quotes_auto_update,
        "interval_minutes": quotes.get_settings().quotes_update_interval_minutes,
        "last_run": last.value if last else None,
        "worker_heartbeat": worker.updated_at if worker else None,
        "logs": [{"id": l.id, "asset_id": l.asset_id, "ticker": names.get(l.asset_id), "pair": l.currency_pair,
                  "provider": l.provider, "status": l.status, "price": l.price, "currency": l.currency,
                  "reference_date": l.reference_date, "received_at": l.received_at, "error": l.error_message,
                  "trigger": l.trigger} for l in logs],
    })


@router.get("/fx")
def list_fx(db: Session = Depends(get_db)):
    rows = db.scalars(select(FxRate).order_by(FxRate.reference_date.desc()).limit(200)).all()
    return plain([{"id": r.id, "currency": r.currency, "rate": r.rate, "reference_date": r.reference_date,
                   "source": r.source, "received_at": r.received_at} for r in rows])


@router.post("/fx", status_code=201)
def manual_fx(data: FxRateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    r = quotes.add_manual_fx(db, data.currency, data.rate, data.reference_date)
    audit(db, "fx_rate", r.id, "manual", after=snapshot(r), user_id=user.id)
    db.commit()
    return plain({"id": r.id, "currency": r.currency, "rate": r.rate, "reference_date": r.reference_date,
                  "source": r.source})
