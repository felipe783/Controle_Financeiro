import datetime as dt
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.auth import current_user
from app.db import get_db
from app.models import TX_SIGN, Account, Category, InvestmentOperation, RecurrenceRule, Transaction, User
from app.schemas import (
    AccountIn,
    BulkIdsIn,
    BulkSettleIn,
    AccountOut,
    CategoryIn,
    CategoryOut,
    DuplicateIn,
    ImportRow,
    ReconcileIn,
    RecurrenceIn,
    RecurrenceOut,
    TransactionIn,
    TransactionOut,
    TransactionPage,
    TransferIn,
)
from app.money import ZERO
from app.services import csv_io, ledger
from app.services.common import Conflict, DomainError, audit, get_or_404, snapshot

router = APIRouter(dependencies=[Depends(current_user)])
MAX_UPLOAD = 2 * 1024 * 1024


def tx_out(t: Transaction) -> TransactionOut:
    o = TransactionOut.model_validate(t)
    o.account_name = t.account.name if t.account else None
    o.category_name = t.category.name if t.category else None
    o.overdue = ledger.is_overdue(t)
    return o


# ---------- Contas ----------
@router.get("/accounts", response_model=list[AccountOut])
def list_accounts(db: Session = Depends(get_db)):
    bal = ledger.balances(db)
    pend = ledger.pending_by_account(db)
    out = []
    for a in db.scalars(select(Account).order_by(Account.archived, Account.name)).all():
        o = AccountOut.model_validate(a)
        o.balance = bal.get(a.id, a.initial_balance)
        o.pending_in, o.pending_out = pend.get(a.id, (ZERO, ZERO))
        out.append(o)
    return out


@router.post("/accounts", response_model=AccountOut, status_code=201)
def create_account(data: AccountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if db.scalar(select(Account).where(func.lower(Account.name) == data.name.lower())):
        raise Conflict("Já existe uma conta com esse nome.")
    acc = Account(**data.model_dump())
    db.add(acc)
    db.flush()
    audit(db, "account", acc.id, "create", after=snapshot(acc), user_id=user.id)
    db.commit()
    o = AccountOut.model_validate(acc)
    o.balance = acc.initial_balance
    return o


@router.put("/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountIn, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    acc = get_or_404(db, Account, account_id, "Conta")
    dup = db.scalar(select(Account).where(func.lower(Account.name) == data.name.lower(), Account.id != acc.id))
    if dup:
        raise Conflict("Já existe uma conta com esse nome.")
    if data.initial_balance_date > acc.initial_balance_date:
        earlier = db.scalar(select(func.count()).select_from(Transaction).where(
            Transaction.account_id == acc.id, Transaction.status == "settled",
            Transaction.settle_date < data.initial_balance_date))
        if earlier:
            raise DomainError("Há lançamentos efetivados antes da nova data do saldo inicial; "
                              "eles deixariam de contar no saldo.")
    before = snapshot(acc)
    for k, v in data.model_dump().items():
        setattr(acc, k, v)
    db.flush()
    audit(db, "account", acc.id, "update", before=before, after=snapshot(acc), user_id=user.id)
    db.commit()
    o = AccountOut.model_validate(acc)
    o.balance = ledger.account_balance(db, acc.id)
    return o


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    acc = get_or_404(db, Account, account_id, "Conta")
    used = sum(db.scalar(select(func.count()).select_from(m).where(m.account_id == acc.id)) or 0
               for m in (Transaction, RecurrenceRule, InvestmentOperation))
    if used:
        raise Conflict("A conta possui lançamentos, recorrências ou operações; arquive-a em vez de excluir.")
    audit(db, "account", acc.id, "delete", before=snapshot(acc), user_id=user.id)
    db.delete(acc)
    db.commit()


@router.post("/accounts/{account_id}/reconcile", response_model=TransactionOut | None)
def reconcile(account_id: int, data: ReconcileIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    tx = ledger.reconcile(db, account_id, data.date, data.actual_balance, data.note, user.id)
    return tx_out(tx) if tx else None


# ---------- Categorias ----------
@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.scalars(select(Category).order_by(Category.kind, Category.name)).all()


def _check_parent(db: Session, data: CategoryIn, self_id: int | None = None) -> None:
    if data.parent_id is None:
        return
    parent = get_or_404(db, Category, data.parent_id, "Categoria pai")
    if parent.kind != data.kind or parent.parent_id is not None or parent.id == self_id:
        raise DomainError("A categoria pai deve ser do mesmo tipo e de primeiro nível.")


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, db: Session = Depends(get_db)):
    _check_parent(db, data)
    if db.scalar(select(Category).where(Category.kind == data.kind, Category.parent_id.is_(data.parent_id)
                                        if data.parent_id is None else Category.parent_id == data.parent_id,
                                        func.lower(Category.name) == data.name.lower())):
        raise Conflict("Categoria já existe.")
    cat = Category(**data.model_dump(), is_system=False)
    db.add(cat)
    db.commit()
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryIn, db: Session = Depends(get_db)):
    cat = get_or_404(db, Category, category_id, "Categoria")
    if cat.is_system and (data.name != cat.name or data.kind != cat.kind or data.archived):
        raise Conflict("Categorias de sistema só podem ter a categoria pai alterada.")
    if data.kind != cat.kind and db.scalar(select(func.count()).select_from(Transaction)
                                           .where(Transaction.category_id == cat.id)):
        raise Conflict("Categoria em uso não pode mudar de tipo.")
    _check_parent(db, data, cat.id)
    for k, v in data.model_dump().items():
        setattr(cat, k, v)
    db.commit()
    return cat


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    cat = get_or_404(db, Category, category_id, "Categoria")
    if cat.is_system:
        raise Conflict("Categorias de sistema não podem ser excluídas.")
    used = db.scalar(select(func.count()).select_from(Transaction).where(Transaction.category_id == cat.id))
    children = db.scalar(select(func.count()).select_from(Category).where(Category.parent_id == cat.id))
    rules = db.scalar(select(func.count()).select_from(RecurrenceRule).where(RecurrenceRule.category_id == cat.id))
    if used or children or rules:
        raise Conflict("Categoria em uso; arquive-a em vez de excluir.")
    db.delete(cat)
    db.commit()


# ---------- Lançamentos ----------
SORTS = {"date": Transaction.date, "amount": Transaction.amount, "description": Transaction.description}


def _filtered(start, end, kind, status, account_id, category_id, q, overdue):
    stmt = select(Transaction)
    if start:
        stmt = stmt.where(Transaction.date >= start)
    if end:
        stmt = stmt.where(Transaction.date <= end)
    if kind == "income":
        stmt = stmt.where(Transaction.kind == "income")
    elif kind == "expense":
        stmt = stmt.where(Transaction.kind == "expense")
    elif kind == "transfer":
        stmt = stmt.where(Transaction.kind.in_(("transfer_in", "transfer_out")))
    elif kind == "investment":
        stmt = stmt.where(Transaction.investment_operation_id.is_not(None))
    elif kind == "adjustment":
        stmt = stmt.where(Transaction.kind.in_(("adjustment_in", "adjustment_out")))
    if status:
        stmt = stmt.where(Transaction.status == status)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)
    if category_id:
        sub = select(Category.id).where(or_(Category.id == category_id, Category.parent_id == category_id))
        stmt = stmt.where(Transaction.category_id.in_(sub))
    if q:
        stmt = stmt.where(Transaction.description.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    if overdue:
        stmt = stmt.where(Transaction.kind == "expense", Transaction.status != "settled",
                          func.coalesce(Transaction.due_date, Transaction.date) < dt.date.today())
    return stmt


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    db: Session = Depends(get_db),
    start: dt.date | None = None, end: dt.date | None = None,
    kind: Literal["income", "expense", "transfer", "investment", "adjustment"] | None = None,
    status: Literal["planned", "pending", "settled"] | None = None,
    account_id: int | None = None, category_id: int | None = None,
    q: str | None = Query(None, max_length=100), overdue: bool = False,
    sort: Literal["date", "amount", "description"] = "date", order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=500),
):
    stmt = _filtered(start, end, kind, status, account_id, category_id, q, overdue)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    sub = stmt.subquery()
    sums = db.execute(select(
        func.coalesce(func.sum(sub.c.amount).filter(sub.c.kind.in_([k for k, s in TX_SIGN.items() if s > 0])), 0),
        func.coalesce(func.sum(sub.c.amount).filter(sub.c.kind.in_([k for k, s in TX_SIGN.items() if s < 0])), 0),
    )).one()
    col = SORTS[sort]
    stmt = stmt.options(joinedload(Transaction.account), joinedload(Transaction.category)).order_by(
        col.asc() if order == "asc" else col.desc(), Transaction.id.desc()
    ).offset((page - 1) * page_size).limit(page_size)
    items = [tx_out(t) for t in db.scalars(stmt).all()]
    return TransactionPage(items=items, total=total, page=page, page_size=page_size, sum_in=sums[0], sum_out=sums[1])


@router.get("/transactions/export")
def export_transactions(
    db: Session = Depends(get_db), start: dt.date | None = None, end: dt.date | None = None,
    kind: Literal["income", "expense"] | None = None, status: Literal["planned", "pending", "settled"] | None = None,
    account_id: int | None = None, category_id: int | None = None, q: str | None = Query(None, max_length=100),
):
    stmt = _filtered(start, end, kind, status, account_id, category_id, q, False).where(
        Transaction.kind.in_(ledger.CASH_FLOW_KINDS)).options(
        joinedload(Transaction.account), joinedload(Transaction.category)).order_by(Transaction.date, Transaction.id)
    body = csv_io.export(list(db.scalars(stmt).all()))
    return Response("﻿" + body, media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="lancamentos-{dt.date.today()}.csv"'})


async def _read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD + 1)
    if len(content) > MAX_UPLOAD:
        raise DomainError("Arquivo maior que 2 MB.")
    return content


@router.post("/transactions/import/preview", response_model=list[ImportRow])
async def import_preview(file: UploadFile = File(...), default_account_id: int | None = Form(None),
                         db: Session = Depends(get_db)):
    return csv_io.preview(db, await _read_upload(file), default_account_id)


@router.post("/transactions/import/commit")
async def import_commit(file: UploadFile = File(...), default_account_id: int | None = Form(None),
                        include_duplicates: bool = Form(False), db: Session = Depends(get_db),
                        user: User = Depends(current_user)):
    return csv_io.commit(db, await _read_upload(file), default_account_id, include_duplicates, user.id)


@router.post("/transactions/bulk/settle")
def bulk_settle(data: BulkSettleIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"changed": ledger.settle_transactions(db, data.ids, data.settle_date, user.id)}


@router.post("/transactions/bulk/delete")
def bulk_delete(data: BulkIdsIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"deleted": ledger.delete_transactions(db, data.ids, user.id)}


@router.get("/transactions/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: Session = Depends(get_db)):
    return tx_out(get_or_404(db, Transaction, tx_id, "Lançamento"))


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return tx_out(ledger.create_transaction(db, data, user.id))


@router.put("/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, data: TransactionIn, db: Session = Depends(get_db),
                       user: User = Depends(current_user)):
    return tx_out(ledger.update_transaction(db, tx_id, data, user.id))


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ledger.delete_transaction(db, tx_id, user.id)


@router.post("/transactions/{tx_id}/duplicate", response_model=TransactionOut, status_code=201)
def duplicate(tx_id: int, data: DuplicateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return tx_out(ledger.duplicate_transaction(db, tx_id, data.date, data.status, user.id))


# ---------- Transferências ----------
@router.post("/transfers", status_code=201)
def create_transfer(data: TransferIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"transfer_id": ledger.create_transfer(db, data, user.id)}


@router.get("/transfers/{transfer_id}")
def get_transfer(transfer_id: str, db: Session = Depends(get_db)):
    out_leg, in_leg = ledger.transfer_legs(db, transfer_id)
    return {"transfer_id": transfer_id, "from_account_id": out_leg.account_id, "to_account_id": in_leg.account_id,
            "amount": str(out_leg.amount), "date": out_leg.date, "description": out_leg.description,
            "notes": out_leg.notes}


@router.put("/transfers/{transfer_id}", status_code=204)
def update_transfer(transfer_id: str, data: TransferIn, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    ledger.update_transfer(db, transfer_id, data, user.id)


@router.delete("/transfers/{transfer_id}", status_code=204)
def delete_transfer(transfer_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    ledger.delete_transfer(db, transfer_id, user.id)


# ---------- Recorrências ----------
@router.get("/recurrences", response_model=list[RecurrenceOut])
def list_recurrences(db: Session = Depends(get_db)):
    return db.scalars(select(RecurrenceRule).order_by(RecurrenceRule.active.desc(), RecurrenceRule.description)).all()


def _check_rule(db: Session, data: RecurrenceIn) -> None:
    acc = get_or_404(db, Account, data.account_id, "Conta")
    if acc.archived and data.active:
        raise DomainError(f"A conta '{acc.name}' está arquivada.")
    if data.category_id:
        cat = get_or_404(db, Category, data.category_id, "Categoria")
        if cat.kind != data.kind:
            raise DomainError("A categoria não corresponde ao tipo.")


@router.post("/recurrences", response_model=RecurrenceOut, status_code=201)
def create_recurrence(data: RecurrenceIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _check_rule(db, data)
    rule = RecurrenceRule(**data.model_dump())
    db.add(rule)
    db.flush()
    audit(db, "recurrence", rule.id, "create", after=snapshot(rule), user_id=user.id)
    db.commit()
    ledger.generate_recurrences(db)
    db.refresh(rule)
    return rule


@router.put("/recurrences/{rule_id}", response_model=RecurrenceOut)
def update_recurrence(rule_id: int, data: RecurrenceIn, db: Session = Depends(get_db),
                      user: User = Depends(current_user)):
    """Alterações valem para ocorrências ainda não geradas; as já geradas são editadas individualmente."""
    rule = get_or_404(db, RecurrenceRule, rule_id, "Recorrência")
    _check_rule(db, data)
    if data.start_date != rule.start_date and rule.generated_until:
        raise DomainError("Não é possível mudar a data inicial de uma recorrência que já gerou lançamentos; "
                          "encerre-a e crie outra.")
    before = snapshot(rule)
    for k, v in data.model_dump().items():
        setattr(rule, k, v)
    db.flush()
    audit(db, "recurrence", rule.id, "update", before=before, after=snapshot(rule), user_id=user.id)
    db.commit()
    return rule


@router.post("/recurrences/{rule_id}/stop")
def stop_recurrence(rule_id: int, delete_future_planned: bool = True, db: Session = Depends(get_db),
                    user: User = Depends(current_user)):
    return {"removed_planned": ledger.stop_rule(db, rule_id, delete_future_planned, user.id)}


@router.post("/recurrences/generate")
def generate(db: Session = Depends(get_db)):
    return {"created": ledger.generate_recurrences(db)}
