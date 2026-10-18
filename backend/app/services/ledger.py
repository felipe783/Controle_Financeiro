"""Contas, lançamentos, transferências, conciliação e recorrências.

Saldo nunca é armazenado: saldo = saldo inicial + soma dos lançamentos efetivados (status 'settled')
com data de efetivação entre a data do saldo inicial e a data consultada. Assim não há saldo
"desatualizado" nem condição de corrida entre operações simultâneas.
"""

import calendar
import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import TX_SIGN, Account, Category, RecurrenceRule, Transaction
from app.money import ZERO, money
from app.services.common import Conflict, DomainError, audit, get_or_404, snapshot

SIGNED_AMOUNT = case(
    *[(Transaction.kind == k, Transaction.amount * s) for k, s in TX_SIGN.items()], else_=0
)
CASH_FLOW_KINDS = ("income", "expense")  # só estes contam como receita/despesa


def today() -> dt.date:
    return dt.date.today()


# ---------- Saldos ----------
def balances(db: Session, as_of: dt.date | None = None) -> dict[int, Decimal]:
    """Saldo efetivado de todas as contas numa data (padrão: tudo até hoje e futuro já efetivado)."""
    accounts = db.scalars(select(Account)).all()
    q = (
        select(Transaction.account_id, func.coalesce(func.sum(SIGNED_AMOUNT), 0))
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.status == "settled", Transaction.settle_date >= Account.initial_balance_date)
        .group_by(Transaction.account_id)
    )
    if as_of is not None:
        q = q.where(Transaction.settle_date <= as_of)
    movements = dict(db.execute(q).all())
    out: dict[int, Decimal] = {}
    for a in accounts:
        if as_of is not None and a.initial_balance_date > as_of:
            out[a.id] = ZERO
            continue
        out[a.id] = money(a.initial_balance + Decimal(movements.get(a.id, 0)))
    return out


def account_balance(db: Session, account_id: int, as_of: dt.date | None = None) -> Decimal:
    return balances(db, as_of).get(account_id, ZERO)


def pending_by_account(db: Session) -> dict[int, tuple[Decimal, Decimal]]:
    rows = db.execute(
        select(Transaction.account_id, Transaction.kind, func.sum(Transaction.amount))
        .where(Transaction.status != "settled")
        .group_by(Transaction.account_id, Transaction.kind)
    ).all()
    out: dict[int, list[Decimal]] = {}
    for acc, kind, total in rows:
        slot = out.setdefault(acc, [ZERO, ZERO])
        slot[0 if TX_SIGN[kind] > 0 else 1] += Decimal(total)
    return {k: (v[0], v[1]) for k, v in out.items()}


# ---------- Validações ----------
def _check_account(db: Session, account_id: int, allow_archived: bool = False) -> Account:
    acc = get_or_404(db, Account, account_id, "Conta")
    if acc.archived and not allow_archived:
        raise DomainError(f"A conta '{acc.name}' está arquivada.")
    return acc


def _check_category(db: Session, category_id: int | None, kind: str) -> None:
    if category_id is None:
        return
    cat = get_or_404(db, Category, category_id, "Categoria")
    if cat.kind != kind:
        raise DomainError("A categoria não corresponde ao tipo do lançamento (receita/despesa).")


def _check_settle_date(acc: Account, settle_date: dt.date | None) -> None:
    if settle_date is not None and settle_date < acc.initial_balance_date:
        raise DomainError(
            f"A data de efetivação é anterior à data do saldo inicial da conta '{acc.name}' "
            f"({acc.initial_balance_date:%d/%m/%Y}); esse movimento já estaria incluído no saldo inicial."
        )


def is_overdue(tx: Transaction, ref: dt.date | None = None) -> bool:
    if tx.status == "settled" or tx.kind != "expense":
        return False
    return (tx.due_date or tx.date) < (ref or today())


# ---------- Receitas e despesas ----------
TX_FIELDS = ("kind", "status", "description", "amount", "date", "due_date", "settle_date", "account_id",
             "category_id", "origin", "payment_method", "expense_type", "notes", "reconciled")


def create_transaction(db: Session, data, user_id: int | None = None, commit: bool = True) -> Transaction:
    acc = _check_account(db, data.account_id)
    _check_category(db, data.category_id, data.kind)
    _check_settle_date(acc, data.settle_date)
    tx = Transaction(**{f: getattr(data, f) for f in TX_FIELDS})
    db.add(tx)
    db.flush()
    audit(db, "transaction", tx.id, "create", after=snapshot(tx), user_id=user_id)
    if commit:
        db.commit()
    return tx


def _editable(tx: Transaction) -> None:
    if tx.investment_operation_id is not None:
        raise Conflict("Este lançamento pertence a uma operação de investimento; edite-o pelo módulo de investimentos.")
    if tx.transfer_id is not None:
        raise Conflict("Este lançamento é parte de uma transferência; edite a transferência.")
    if tx.kind not in CASH_FLOW_KINDS:
        raise Conflict("Ajustes de conciliação não podem ser editados; registre uma nova conciliação.")


def update_transaction(db: Session, tx_id: int, data, user_id: int | None = None) -> Transaction:
    tx = get_or_404(db, Transaction, tx_id, "Lançamento")
    _editable(tx)
    acc = _check_account(db, data.account_id, allow_archived=data.account_id == tx.account_id)
    _check_category(db, data.category_id, data.kind)
    _check_settle_date(acc, data.settle_date)
    before = snapshot(tx)
    for f in TX_FIELDS:
        setattr(tx, f, getattr(data, f))
    db.flush()
    audit(db, "transaction", tx.id, "update", before=before, after=snapshot(tx), user_id=user_id)
    db.commit()
    return tx


def delete_transaction(db: Session, tx_id: int, user_id: int | None = None) -> None:
    tx = get_or_404(db, Transaction, tx_id, "Lançamento")
    if tx.investment_operation_id is not None:
        raise Conflict("Exclua a operação de investimento correspondente; o lançamento será removido junto.")
    if tx.transfer_id is not None:
        delete_transfer(db, tx.transfer_id, user_id)
        return
    audit(db, "transaction", tx.id, "delete", before=snapshot(tx), user_id=user_id)
    db.delete(tx)
    db.commit()


def duplicate_transaction(db: Session, tx_id: int, new_date: dt.date | None, status: str | None,
                          user_id: int | None = None) -> Transaction:
    src = get_or_404(db, Transaction, tx_id, "Lançamento")
    _editable(src)
    tx = Transaction(**{f: getattr(src, f) for f in TX_FIELDS})
    tx.date = new_date or today()
    tx.status = status or ("planned" if src.status == "settled" else src.status)
    tx.settle_date = tx.date if tx.status == "settled" else None
    tx.due_date = tx.date + (src.due_date - src.date) if src.due_date else None
    tx.reconciled = False
    _check_settle_date(_check_account(db, tx.account_id), tx.settle_date)
    db.add(tx)
    db.flush()
    audit(db, "transaction", tx.id, "create", after={**snapshot(tx), "duplicated_from": src.id}, user_id=user_id)
    db.commit()
    return tx


# ---------- Transferências ----------
def create_transfer(db: Session, data, user_id: int | None = None) -> str:
    """Débito e crédito na mesma transação de banco: ou os dois lados existem, ou nenhum."""
    src = _check_account(db, data.from_account_id)
    dst = _check_account(db, data.to_account_id)
    for acc in (src, dst):
        _check_settle_date(acc, data.date)
    tid = str(uuid.uuid4())
    desc = data.description or f"Transferência {src.name} → {dst.name}"
    legs = [
        Transaction(kind="transfer_out", account_id=src.id, transfer_id=tid),
        Transaction(kind="transfer_in", account_id=dst.id, transfer_id=tid),
    ]
    for leg in legs:
        leg.status = "settled"
        leg.description = desc
        leg.amount = data.amount
        leg.date = leg.settle_date = data.date
        leg.notes = data.notes
        db.add(leg)
    db.flush()
    audit(db, "transfer", None, "create", after={"transfer_id": tid, "legs": [snapshot(l) for l in legs]},
          user_id=user_id)
    db.commit()
    return tid


def transfer_legs(db: Session, transfer_id: str) -> list[Transaction]:
    legs = db.scalars(select(Transaction).where(Transaction.transfer_id == transfer_id)
                      .order_by(Transaction.kind.desc())).all()
    if len(legs) != 2:
        raise Conflict("Transferência inconsistente ou inexistente.")
    return list(legs)  # [transfer_out, transfer_in]


def update_transfer(db: Session, transfer_id: str, data, user_id: int | None = None) -> None:
    legs = transfer_legs(db, transfer_id)
    before = [snapshot(l) for l in legs]
    src = _check_account(db, data.from_account_id, allow_archived=data.from_account_id == legs[0].account_id)
    dst = _check_account(db, data.to_account_id, allow_archived=data.to_account_id == legs[1].account_id)
    for acc in (src, dst):
        _check_settle_date(acc, data.date)
    for leg, acc in zip(legs, (src, dst)):
        leg.account_id = acc.id
        leg.amount = data.amount
        leg.date = leg.settle_date = data.date
        leg.description = data.description or f"Transferência {src.name} → {dst.name}"
        leg.notes = data.notes
    db.flush()
    audit(db, "transfer", None, "update", before={"legs": before},
          after={"transfer_id": transfer_id, "legs": [snapshot(l) for l in legs]}, user_id=user_id)
    db.commit()


def delete_transfer(db: Session, transfer_id: str, user_id: int | None = None) -> None:
    legs = transfer_legs(db, transfer_id)
    audit(db, "transfer", None, "delete", before={"transfer_id": transfer_id, "legs": [snapshot(l) for l in legs]},
          user_id=user_id)
    for leg in legs:
        db.delete(leg)
    db.commit()


# ---------- Conciliação ----------
def reconcile(db: Session, account_id: int, on: dt.date, actual: Decimal, note: str | None,
              user_id: int | None = None) -> Transaction | None:
    """Corrige o saldo calculado para o saldo real com um lançamento de ajuste (nunca reescreve o histórico)."""
    acc = _check_account(db, account_id)
    _check_settle_date(acc, on)
    computed = account_balance(db, account_id, on)
    diff = money(actual - computed)
    if diff == 0:
        return None
    tx = Transaction(
        kind="adjustment_in" if diff > 0 else "adjustment_out", status="settled", amount=abs(diff),
        description="Ajuste de conciliação", date=on, settle_date=on, account_id=acc.id, reconciled=True,
        notes=note,
    )
    db.add(tx)
    db.flush()
    audit(db, "account", acc.id, "reconcile",
          before={"computed_balance": str(computed)},
          after={"actual_balance": str(actual), "adjustment_id": tx.id, "note": note}, user_id=user_id)
    db.commit()
    return tx


# ---------- Recorrências ----------
def _add_months(d: dt.date, months: int, anchor_day: int) -> dt.date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return dt.date(year, month, min(anchor_day, calendar.monthrange(year, month)[1]))


def occurrences(rule: RecurrenceRule, start: dt.date, until: dt.date) -> list[dt.date]:
    """Datas da regra no intervalo [start, until]. Dia 31 vira o último dia em meses curtos."""
    out: list[dt.date] = []
    end = min(until, rule.end_date) if rule.end_date else until
    n = 0
    while True:
        if rule.frequency == "weekly":
            d = rule.start_date + dt.timedelta(weeks=n * rule.interval_count)
        elif rule.frequency == "monthly":
            d = _add_months(rule.start_date, n * rule.interval_count, rule.start_date.day)
        else:
            d = _add_months(rule.start_date, 12 * n * rule.interval_count, rule.start_date.day)
        if d > end:
            return out
        if d >= start:
            out.append(d)
        n += 1


def generate_recurrences(db: Session, until: dt.date | None = None) -> int:
    """Gera lançamentos previstos até `until` (padrão: hoje + 31 dias). Idempotente:
    `generated_until` evita regerar ocorrências excluídas e a chave única (regra, data) evita duplicar
    se duas execuções concorrerem."""
    until = until or today() + dt.timedelta(days=31)
    created = 0
    rules = db.scalars(select(RecurrenceRule).where(RecurrenceRule.active.is_(True))
                       .with_for_update(skip_locked=True)).all()
    for rule in rules:
        start = rule.generated_until + dt.timedelta(days=1) if rule.generated_until else rule.start_date
        for d in occurrences(rule, start, until):
            stmt = pg_insert(Transaction).values(
                kind=rule.kind, status="planned", description=rule.description, amount=rule.amount,
                date=d, due_date=d + dt.timedelta(days=rule.due_day_offset) if rule.kind == "expense" else None,
                account_id=rule.account_id, category_id=rule.category_id, origin=rule.origin,
                payment_method=rule.payment_method, expense_type=rule.expense_type, notes=rule.notes,
                recurrence_id=rule.id, recurrence_date=d, reconciled=False,
            ).on_conflict_do_nothing(constraint="uq_transactions_recurrence_occurrence")
            created += db.execute(stmt).rowcount or 0
        rule.generated_until = max(until, rule.generated_until or until)
    db.commit()
    return created


def stop_rule(db: Session, rule_id: int, delete_future_planned: bool, user_id: int | None = None) -> int:
    rule = get_or_404(db, RecurrenceRule, rule_id, "Recorrência")
    rule.active = False
    removed = 0
    if delete_future_planned:
        future = db.scalars(select(Transaction).where(
            Transaction.recurrence_id == rule.id, Transaction.status == "planned", Transaction.date > today()
        )).all()
        for tx in future:
            db.delete(tx)
        removed = len(future)
    audit(db, "recurrence", rule.id, "stop", after={"removed_planned": removed}, user_id=user_id)
    db.commit()
    return removed
