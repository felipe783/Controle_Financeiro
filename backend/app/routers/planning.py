import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_db
from app.models import AuditLog, Budget, Category, Goal, GoalContribution, Liability, LiabilityBalance, User
from app.routers.finance import tx_out
from app.schemas import BudgetIn, GoalContributionIn, GoalIn, LiabilityBalanceIn, LiabilityIn
from app.serialize import plain
from app.services import networth, reports
from app.services.common import Conflict, DomainError, audit, get_or_404, snapshot

router = APIRouter(dependencies=[Depends(current_user)])


def period_range(period: str, start: dt.date | None, end: dt.date | None) -> tuple[dt.date, dt.date]:
    today = dt.date.today()
    first = today.replace(day=1)
    month_end = networth.month_end(first)
    if period == "custom":
        if not start or not end or start > end:
            raise DomainError("Informe um período personalizado válido.")
        if (end - start).days > 3660:
            raise DomainError("Período máximo de 10 anos.")
        return start, end
    if period == "3m":
        y, m = divmod(first.month - 3, 12)
        return dt.date(first.year + y, m + 1, 1), month_end
    if period == "6m":
        y, m = divmod(first.month - 6, 12)
        return dt.date(first.year + y, m + 1, 1), month_end
    if period == "year":
        return dt.date(today.year, 1, 1), dt.date(today.year, 12, 31)
    return first, month_end


def previous_range(period: str, start: dt.date, end: dt.date) -> tuple[dt.date, dt.date]:
    """Período imediatamente anterior, de mesmo tamanho, para comparação no painel.
    Períodos de meses inteiros recuam o mesmo número de meses (fevereiro não vira "28 dias antes")."""
    months = {"month": 1, "3m": 3, "6m": 6, "year": 12}.get(period)
    if months is None:
        length = end - start
        return start - length - dt.timedelta(days=1), start - dt.timedelta(days=1)
    y, m = divmod(start.month - 1 - months, 12)
    prev_start = dt.date(start.year + y, m + 1, 1)
    return prev_start, start - dt.timedelta(days=1)


@router.get("/dashboard")
def dashboard(period: Literal["month", "3m", "6m", "year", "custom"] = "month",
              start: dt.date | None = None, end: dt.date | None = None, db: Session = Depends(get_db)):
    s, e = period_range(period, start, end)
    d = reports.dashboard(db, s, e, previous_range(period, s, e))
    d["upcoming"] = [tx_out(t) for t in d["upcoming"]]
    d["recent"] = [tx_out(t) for t in d["recent"]]
    return plain(d)


# ---------- Patrimônio ----------
@router.get("/networth")
def get_networth(db: Session = Depends(get_db)):
    nw = networth.compute(db)
    nw.pop("portfolio")
    nw["liability_items"] = [{"id": l["liability"].id, "name": l["liability"].name, "kind": l["liability"].kind,
                              "archived": l["liability"].archived, "notes": l["liability"].notes,
                              "balance": l["balance"], "reference_date": l["reference_date"]}
                             for l in nw["liability_items"]]
    return plain(nw)


@router.get("/networth/history")
def networth_history(start: dt.date | None = None, end: dt.date | None = None, db: Session = Depends(get_db)):
    end = end or dt.date.today()
    start = start or (end.replace(day=1) - dt.timedelta(days=365)).replace(day=1)
    if (end - start).days > 3660:
        raise DomainError("Período máximo de 10 anos.")
    return plain(networth.history(db, start, end))


@router.post("/networth/snapshot", status_code=201)
def snapshot_now(db: Session = Depends(get_db)):
    s = networth.take_snapshot(db)
    return plain({"snapshot_date": s.snapshot_date, "net": s.net, "gross": s.gross})


@router.post("/liabilities", status_code=201)
def create_liability(data: LiabilityIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    lia = Liability(name=data.name, kind=data.kind, archived=data.archived, notes=data.notes)
    db.add(lia)
    db.flush()
    if data.balance is not None:
        db.add(LiabilityBalance(liability_id=lia.id, balance=data.balance,
                                reference_date=data.reference_date or dt.date.today()))
    audit(db, "liability", lia.id, "create", after=snapshot(lia), user_id=user.id)
    db.commit()
    return {"id": lia.id}


@router.put("/liabilities/{liability_id}", status_code=204)
def update_liability(liability_id: int, data: LiabilityIn, db: Session = Depends(get_db)):
    lia = get_or_404(db, Liability, liability_id, "Dívida")
    lia.name, lia.kind, lia.archived, lia.notes = data.name, data.kind, data.archived, data.notes
    db.commit()


@router.get("/liabilities/{liability_id}/balances")
def liability_balances(liability_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(select(LiabilityBalance).where(LiabilityBalance.liability_id == liability_id)
                      .order_by(LiabilityBalance.reference_date.desc())).all()
    return plain([{"id": r.id, "reference_date": r.reference_date, "balance": r.balance, "note": r.note}
                  for r in rows])


@router.post("/liabilities/{liability_id}/balances", status_code=201)
def add_liability_balance(liability_id: int, data: LiabilityBalanceIn, db: Session = Depends(get_db),
                          user: User = Depends(current_user)):
    get_or_404(db, Liability, liability_id, "Dívida")
    existing = db.scalar(select(LiabilityBalance).where(LiabilityBalance.liability_id == liability_id,
                                                        LiabilityBalance.reference_date == data.reference_date))
    before = snapshot(existing) if existing else None
    row = existing or LiabilityBalance(liability_id=liability_id, reference_date=data.reference_date)
    row.balance, row.note = data.balance, data.note
    db.add(row)
    db.flush()
    audit(db, "liability_balance", row.id, "update" if before else "create", before=before, after=snapshot(row),
          user_id=user.id)
    db.commit()
    return {"id": row.id}


@router.delete("/liabilities/{liability_id}", status_code=204)
def delete_liability(liability_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    lia = get_or_404(db, Liability, liability_id, "Dívida")
    audit(db, "liability", lia.id, "delete", before=snapshot(lia), user_id=user.id)
    db.delete(lia)
    db.commit()


# ---------- Orçamentos ----------
@router.get("/budgets")
def list_budgets(month: dt.date = Query(default_factory=dt.date.today), db: Session = Depends(get_db)):
    return plain(reports.budget_report(db, month))


@router.put("/budgets")
def upsert_budget(data: BudgetIn, db: Session = Depends(get_db)):
    cat = get_or_404(db, Category, data.category_id, "Categoria")
    if cat.kind != "expense":
        raise DomainError("Orçamentos são definidos para categorias de despesa.")
    b = db.scalar(select(Budget).where(Budget.category_id == data.category_id, Budget.month == data.month))
    if b is None:
        b = Budget(category_id=data.category_id, month=data.month)
        db.add(b)
    b.amount = data.amount
    db.commit()
    return {"id": b.id}


@router.post("/budgets/copy")
def copy_budgets(source: dt.date, target: dt.date, db: Session = Depends(get_db)):
    """Copia os orçamentos de um mês para outro (sem sobrescrever os que já existem)."""
    source, target = source.replace(day=1), target.replace(day=1)
    existing = set(db.scalars(select(Budget.category_id).where(Budget.month == target)))
    n = 0
    for b in db.scalars(select(Budget).where(Budget.month == source)).all():
        if b.category_id not in existing:
            db.add(Budget(category_id=b.category_id, month=target, amount=b.amount))
            n += 1
    db.commit()
    return {"copied": n}


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, Budget, budget_id, "Orçamento"))
    db.commit()


# ---------- Metas ----------
@router.get("/goals")
def list_goals(db: Session = Depends(get_db)):
    out = []
    for r in reports.goals_report(db):
        g = r.pop("goal")
        out.append({"id": g.id, "name": g.name, "target_amount": g.target_amount, "target_date": g.target_date,
                    "archived": g.archived, "notes": g.notes, **r})
    return plain(out)


@router.post("/goals", status_code=201)
def create_goal(data: GoalIn, db: Session = Depends(get_db)):
    g = Goal(**data.model_dump())
    db.add(g)
    db.commit()
    return {"id": g.id}


@router.put("/goals/{goal_id}", status_code=204)
def update_goal(goal_id: int, data: GoalIn, db: Session = Depends(get_db)):
    g = get_or_404(db, Goal, goal_id, "Meta")
    for k, v in data.model_dump().items():
        setattr(g, k, v)
    db.commit()


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, Goal, goal_id, "Meta"))
    db.commit()


@router.get("/goals/{goal_id}/contributions")
def list_contributions(goal_id: int, db: Session = Depends(get_db)):
    rows = db.scalars(select(GoalContribution).where(GoalContribution.goal_id == goal_id)
                      .order_by(GoalContribution.date.desc())).all()
    return plain([{"id": r.id, "date": r.date, "amount": r.amount, "notes": r.notes} for r in rows])


@router.post("/goals/{goal_id}/contributions", status_code=201)
def add_contribution(goal_id: int, data: GoalContributionIn, db: Session = Depends(get_db)):
    get_or_404(db, Goal, goal_id, "Meta")
    c = GoalContribution(goal_id=goal_id, **data.model_dump())
    db.add(c)
    db.commit()
    return {"id": c.id}


@router.delete("/goals/{goal_id}/contributions/{cid}", status_code=204)
def delete_contribution(goal_id: int, cid: int, db: Session = Depends(get_db)):
    c = get_or_404(db, GoalContribution, cid, "Aporte")
    if c.goal_id != goal_id:
        raise Conflict("Aporte não pertence a esta meta.")
    db.delete(c)
    db.commit()


# ---------- Previsão e auditoria ----------
@router.get("/forecast")
def get_forecast(days: int = Query(30, ge=1, le=365), db: Session = Depends(get_db)):
    f = reports.forecast(db, days)
    f["items"] = [tx_out(t) for t in f["items"]]
    f["overdue"] = [tx_out(t) for t in f["overdue"]]
    return plain(f)


@router.get("/audit")
def audit_log(entity: str | None = None, entity_id: int | None = None, limit: int = Query(100, le=1000),
              db: Session = Depends(get_db)):
    q = select(AuditLog)
    if entity:
        q = q.where(AuditLog.entity == entity)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)
    rows = db.scalars(q.order_by(AuditLog.id.desc()).limit(limit)).all()
    return plain([{"id": r.id, "at": r.at, "entity": r.entity, "entity_id": r.entity_id, "action": r.action,
                   "label": _audit_label(r), "before": r.before, "after": r.after, "user_id": r.user_id}
                  for r in rows])


def _audit_label(r: AuditLog) -> str | None:
    """Nome legível do registro afetado (descrição, nome ou ticker), tirado do próprio snapshot da auditoria."""
    for snap in (r.after, r.before):
        if isinstance(snap, dict):
            for key in ("description", "name", "ticker"):
                if snap.get(key):
                    return str(snap[key])
    return None
