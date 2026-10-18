"""Dashboard, orçamentos, metas e previsões. Somente leitura: tudo calculado dos dados persistidos."""

import datetime as dt
from decimal import Decimal

from sqlalchemy import extract, func, select
from sqlalchemy.orm import Session, aliased

from app.config import get_settings
from app.models import (
    Budget,
    Category,
    Goal,
    GoalContribution,
    InvestmentOperation,
    Transaction,
)
from app.money import ZERO, money, safe_div
from app.services import investments, ledger, networth


def _settled_sum(db: Session, kind: str, start: dt.date, end: dt.date) -> Decimal:
    return Decimal(db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.kind == kind, Transaction.status == "settled",
        Transaction.settle_date.between(start, end))))


def monthly_series(db: Session, start: dt.date, end: dt.date) -> list[dict]:
    """Receitas e despesas efetivadas por mês (regime de caixa: data de efetivação).
    Transferências, ajustes e movimentações de investimento não entram."""
    y, m = extract("year", Transaction.settle_date), extract("month", Transaction.settle_date)
    rows = db.execute(
        select(y, m, Transaction.kind, func.sum(Transaction.amount))
        .where(Transaction.status == "settled", Transaction.kind.in_(ledger.CASH_FLOW_KINDS),
               Transaction.settle_date.between(start, end))
        .group_by(y, m, Transaction.kind)).all()
    data = {(int(a), int(b), k): Decimal(v) for a, b, k, v in rows}
    out = []
    for d in networth.month_ends(start, end):
        inc, exp = data.get((d.year, d.month, "income"), ZERO), data.get((d.year, d.month, "expense"), ZERO)
        out.append({"month": f"{d.year:04d}-{d.month:02d}", "income": inc, "expense": exp, "result": inc - exp})
    return out


def expenses_by_category(db: Session, start: dt.date, end: dt.date) -> list[dict]:
    parent = aliased(Category)
    name = func.coalesce(parent.name, Category.name, "Sem categoria")
    rows = db.execute(
        select(name, func.sum(Transaction.amount))
        .select_from(Transaction)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .outerjoin(parent, parent.id == Category.parent_id)
        .where(Transaction.kind == "expense", Transaction.status == "settled",
               Transaction.settle_date.between(start, end))
        .group_by(name).order_by(func.sum(Transaction.amount).desc())).all()
    return [{"category": n, "amount": Decimal(v)} for n, v in rows]


def investment_flows(db: Session, start: dt.date, end: dt.date) -> list[dict]:
    """Aportes (compras), resgates (vendas/amortizações) e proventos recebidos por mês, em BRL."""
    ops = db.scalars(select(InvestmentOperation).where(InvestmentOperation.date.between(start, end))).all()
    months = {f"{d.year:04d}-{d.month:02d}": {"contributions": ZERO, "withdrawals": ZERO, "income": ZERO}
              for d in networth.month_ends(start, end)}
    for op in ops:
        key = f"{op.date.year:04d}-{op.date.month:02d}"
        effect = investments.cash_effect(op.asset, op) if op.kind != "adjustment" else None
        if effect is None or key not in months:
            continue
        kind, value = effect
        bucket = {"investment_out": "contributions", "investment_in": "withdrawals", "income": "income"}.get(kind)
        if bucket:
            months[key][bucket] += value
    return [{"month": k, **v} for k, v in months.items()]


def dashboard(db: Session, start: dt.date, end: dt.date) -> dict:
    today = dt.date.today()
    nw = networth.compute(db)
    income = _settled_sum(db, "income", start, end)
    expense = _settled_sum(db, "expense", start, end)
    result = income - expense
    planned_expenses = Decimal(db.scalar(select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.kind == "expense", Transaction.status != "settled",
        Transaction.date.between(start, end))))
    upcoming = db.scalars(select(Transaction).where(
        Transaction.kind == "expense", Transaction.status != "settled",
        func.coalesce(Transaction.due_date, Transaction.date) <= today + dt.timedelta(days=7))
        .order_by(func.coalesce(Transaction.due_date, Transaction.date)).limit(20)).all()
    recent = db.scalars(select(Transaction).order_by(Transaction.date.desc(), Transaction.id.desc()).limit(10)).all()
    pf = nw["portfolio"]
    history_start = min(start, today.replace(day=1) - dt.timedelta(days=365)).replace(day=1)
    return {
        "period": {"start": start, "end": end},
        "kpis": {
            "cash_available": nw["cash_available"],
            "cash_investment_accounts": nw["cash_investment_accounts"],
            "income": money(income),
            "expense": money(expense),
            "result": money(result),
            "savings_rate": safe_div(result, income),
            "invested_cost": pf["totals"]["cost_brl"],
            "portfolio_value": pf["totals"]["market_value_brl"],
            "portfolio_unrealized": pf["totals"]["unrealized_brl"],
            "portfolio_total_return": pf["totals"]["total_return_brl"],
            "portfolio_xirr": pf["xirr"],
            "gross_worth": nw["gross"],
            "liabilities": nw["liabilities"],
            "net_worth": nw["net"],
            "planned_expenses": money(planned_expenses),
            "upcoming_count": len(upcoming),
        },
        "warnings": nw["warnings"],
        "monthly": monthly_series(db, start.replace(day=1), end),
        "expenses_by_category": expenses_by_category(db, start, end),
        "allocation": [{"asset_class": k, "value": v} for k, v in sorted(pf["by_class"].items(),
                                                                          key=lambda kv: -kv[1])],
        "net_worth_history": networth.history(db, history_start, today),
        "investment_flows": investment_flows(db, start.replace(day=1), end),
        "upcoming": upcoming,
        "recent": recent,
    }


# ---------- Orçamentos ----------
def budget_report(db: Session, month: dt.date) -> list[dict]:
    month = month.replace(day=1)
    end = networth.month_end(month)
    threshold = Decimal(get_settings().budget_alert_percent) / 100
    out = []
    for b in db.scalars(select(Budget).where(Budget.month == month)).all():
        cat_ids = [b.category_id] + list(db.scalars(select(Category.id).where(Category.parent_id == b.category_id)))
        base = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.kind == "expense", Transaction.category_id.in_(cat_ids),
            Transaction.date.between(month, end))
        spent = Decimal(db.scalar(base.where(Transaction.status == "settled")))
        committed = Decimal(db.scalar(base.where(Transaction.status != "settled")))
        pct = safe_div(spent, b.amount) or ZERO
        status = "exceeded" if spent > b.amount else "warning" if pct >= threshold else "ok"
        cat = db.get(Category, b.category_id)
        out.append({"id": b.id, "category_id": b.category_id, "category_name": cat.name if cat else None,
                    "month": month, "amount": b.amount, "spent": money(spent), "committed": money(committed),
                    "remaining": money(b.amount - spent), "percent": pct, "status": status})
    return out


# ---------- Metas ----------
def goals_report(db: Session) -> list[dict]:
    sums = dict(db.execute(select(GoalContribution.goal_id, func.sum(GoalContribution.amount))
                           .group_by(GoalContribution.goal_id)).all())
    out = []
    today = dt.date.today()
    for g in db.scalars(select(Goal).order_by(Goal.archived, Goal.target_date.nulls_last(), Goal.name)).all():
        saved = Decimal(sums.get(g.id, 0))
        remaining = max(g.target_amount - saved, ZERO)
        months_left = None
        monthly_needed = None
        if g.target_date and g.target_date > today and remaining:
            months_left = max((g.target_date.year - today.year) * 12 + g.target_date.month - today.month, 1)
            monthly_needed = money(remaining / months_left)
        out.append({"goal": g, "saved": money(saved), "remaining": money(remaining),
                    "progress": safe_div(saved, g.target_amount), "months_left": months_left,
                    "monthly_needed": monthly_needed})
    return out


# ---------- Previsão ----------
def forecast(db: Session, days: int = 30) -> dict:
    today = dt.date.today()
    end = today + dt.timedelta(days=days)
    rows = db.scalars(select(Transaction).where(
        Transaction.status != "settled",
        func.coalesce(Transaction.due_date, Transaction.date) <= end)
        .order_by(func.coalesce(Transaction.due_date, Transaction.date))).all()
    inflow = sum((t.amount for t in rows if t.kind == "income"), ZERO)
    outflow = sum((t.amount for t in rows if t.kind == "expense"), ZERO)
    current = sum(ledger.balances(db).values(), ZERO)
    return {"until": end, "current_cash": money(current), "expected_in": money(inflow),
            "expected_out": money(outflow), "projected_cash": money(current + inflow - outflow),
            "items": rows, "overdue": [t for t in rows if ledger.is_overdue(t, today)]}

