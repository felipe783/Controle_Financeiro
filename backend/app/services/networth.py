"""Patrimônio consolidado.

ativos   = saldo de todas as contas (inclusive o caixa parado na corretora) + valor dos investimentos
passivos = último saldo devedor registrado de cada dívida até a data
líquido  = ativos − passivos

Não há dupla contagem: comprar um ativo tira o dinheiro da conta (investment_out) e cria a posição;
o caixa da corretora conta só como caixa. Metas não entram (são destinação de valores existentes).
"""

import datetime as dt
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Account, Liability, LiabilityBalance, NetWorthSnapshot
from app.money import ZERO, money
from app.services import investments, ledger


def liabilities_at(db: Session, as_of: dt.date | None = None) -> list[dict]:
    out = []
    for lia in db.scalars(select(Liability).order_by(Liability.name)).all():
        q = select(LiabilityBalance).where(LiabilityBalance.liability_id == lia.id)
        if as_of:
            q = q.where(LiabilityBalance.reference_date <= as_of)
        last = db.scalars(q.order_by(LiabilityBalance.reference_date.desc()).limit(1)).first()
        out.append({"liability": lia, "balance": last.balance if last else ZERO,
                    "reference_date": last.reference_date if last else None})
    return out


def compute(db: Session, as_of: dt.date | None = None) -> dict:
    bal = ledger.balances(db, as_of)
    accounts = {a.id: a for a in db.scalars(select(Account)).all()}
    cash_available = sum((v for k, v in bal.items() if accounts[k].type != "investment"), ZERO)
    cash_investment = sum((v for k, v in bal.items() if accounts[k].type == "investment"), ZERO)
    pf = investments.portfolio(db, as_of)
    lias = liabilities_at(db, as_of)
    liabilities = sum((l["balance"] for l in lias), ZERO)
    inv_value = pf["totals"]["market_value_brl"]
    gross = cash_available + cash_investment + inv_value
    warnings = sorted({f"{it['asset'].ticker or it['asset'].name}: {w}" for it in pf["items"]
                       for w in it["warnings"] if it["quantity"] or it["cost_brl"]})
    return {
        "as_of": as_of or dt.date.today(),
        "cash_available": money(cash_available),
        "cash_investment_accounts": money(cash_investment),
        "cash_total": money(cash_available + cash_investment),
        "investments_market_value": inv_value,
        "invested_cost": pf["totals"]["cost_brl"],
        "liabilities": money(liabilities),
        "gross": money(gross),
        "net": money(gross - liabilities),
        "portfolio": pf,
        "liability_items": lias,
        "warnings": warnings,
    }


def _details(nw: dict) -> dict:
    return {
        "cash_available": str(nw["cash_available"]),
        "cash_investment_accounts": str(nw["cash_investment_accounts"]),
        "assets": [{
            "asset_id": it["asset"].id, "ticker": it["asset"].ticker, "class": it["asset"].asset_class,
            "quantity": str(it["quantity"]), "market_value_brl": str(it["market_value_brl"]),
            "cost_brl": str(it["cost_brl"]), "method": it["valuation_method"],
            "quote_date": it["quote_reference_date"].isoformat() if it["quote_reference_date"] else None,
            "quote_source": it["quote_source"],
        } for it in nw["portfolio"]["items"] if it["quantity"] or it["market_value_brl"]],
        "by_class": {k: str(v) for k, v in nw["portfolio"]["by_class"].items()},
        "warnings": nw["warnings"],
    }


def take_snapshot(db: Session) -> NetWorthSnapshot:
    """Registra o patrimônio de hoje com as avaliações disponíveis agora. Snapshots de dias anteriores
    são imutáveis; o de hoje pode ser atualizado ao longo do dia."""
    today = dt.date.today()
    nw = compute(db, today)
    values = dict(snapshot_date=today, cash=nw["cash_total"], investments=nw["investments_market_value"],
                  invested_cost=nw["invested_cost"], liabilities=nw["liabilities"], gross=nw["gross"],
                  net=nw["net"], details=_details(nw))
    stmt = pg_insert(NetWorthSnapshot).values(**values)
    db.execute(stmt.on_conflict_do_update(index_elements=["snapshot_date"],
                                          set_={**{k: v for k, v in values.items() if k != "snapshot_date"},
                                                "created_at": func.now()}))
    db.commit()
    return db.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.snapshot_date == today))


def month_ends(start: dt.date, end: dt.date) -> list[dt.date]:
    out, y, m = [], start.year, start.month
    while (y, m) <= (end.year, end.month):
        nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
        out.append(min(nxt - dt.timedelta(days=1), end))
        y, m = nxt.year, nxt.month
    return out


def history(db: Session, start: dt.date, end: dt.date) -> list[dict]:
    """Série de patrimônio: snapshots registrados (estimate=False) e, para os fins de mês sem snapshot,
    estimativas calculadas com os lançamentos e as cotações conhecidas até aquela data (estimate=True)."""
    snaps = {s.snapshot_date: s for s in db.scalars(
        select(NetWorthSnapshot).where(NetWorthSnapshot.snapshot_date.between(start, end))).all()}
    points = [{"date": d, "cash": s.cash, "investments": s.investments, "invested_cost": s.invested_cost,
               "liabilities": s.liabilities, "gross": s.gross, "net": s.net, "estimate": False}
              for d, s in snaps.items()]
    snap_months = {(d.year, d.month) for d in snaps}
    for d in month_ends(start, end):
        if (d.year, d.month) in snap_months:
            continue
        nw = compute(db, d)
        points.append({"date": d, "cash": nw["cash_total"], "investments": nw["investments_market_value"],
                       "invested_cost": nw["invested_cost"], "liabilities": nw["liabilities"],
                       "gross": nw["gross"], "net": nw["net"], "estimate": True})
    return sorted(points, key=lambda p: p["date"])


def total_liabilities(db: Session) -> Decimal:
    return sum((l["balance"] for l in liabilities_at(db)), ZERO)
