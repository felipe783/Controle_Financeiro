"""Importação e exportação CSV de receitas/despesas.

Formato (o mesmo na exportação, então um arquivo exportado pode ser reimportado):
    data;descricao;valor;tipo;status;categoria;conta;observacoes
- separador ';' ou ','; data dd/mm/aaaa ou aaaa-mm-dd; valor '1.234,56' ou '1234.56' (sempre positivo)
- tipo: receita | despesa; status: prevista | pendente | efetivada (aceita paga/recebida)
"""

import csv
import datetime as dt
import hashlib
import io
import re
from decimal import Decimal, InvalidOperation

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Account, Category, Transaction
from app.money import money
from app.schemas import ImportRow
from app.services.common import DomainError, audit

HEADER = ["data", "descricao", "valor", "tipo", "status", "categoria", "conta", "observacoes"]
KIND_IN = {"receita": "income", "income": "income", "despesa": "expense", "expense": "expense"}
STATUS_IN = {"prevista": "planned", "previsto": "planned", "planned": "planned", "pendente": "pending",
             "pending": "pending", "efetivada": "settled", "paga": "settled", "pago": "settled",
             "recebida": "settled", "recebido": "settled", "settled": "settled"}
KIND_OUT = {"income": "receita", "expense": "despesa"}
STATUS_OUT = {"planned": "prevista", "pending": "pendente", "settled": "efetivada"}
MAX_ROWS = 5000


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def row_hash(d: dt.date, amount: Decimal, description: str, account_id: int, kind: str) -> str:
    raw = f"{d.isoformat()}|{money(amount)}|{_norm(description)}|{account_id}|{kind}"
    return hashlib.sha256(raw.encode()).hexdigest()


def parse_amount(raw: str) -> Decimal:
    s = raw.strip().replace("R$", "").replace(" ", "")
    if "," in s:  # formato brasileiro: ponto como milhar
        s = s.replace(".", "").replace(",", ".")
    value = Decimal(s)
    if not value.is_finite():
        raise InvalidOperation
    return value


def parse_date(raw: str) -> dt.date:
    raw = raw.strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise ValueError


def preview(db: Session, content: bytes, default_account_id: int | None = None) -> list[ImportRow]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    sample = text[:2048]
    delimiter = ";" if sample.count(";") >= sample.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    if not reader.fieldnames:
        raise DomainError("Arquivo vazio.")
    fields = {f.strip().lower() for f in reader.fieldnames if f}
    missing = {"data", "descricao", "valor", "tipo"} - fields
    if missing:
        raise DomainError(f"Colunas obrigatórias ausentes: {', '.join(sorted(missing))}.")

    accounts = {_norm(a.name): a for a in db.scalars(select(Account)).all()}
    accounts_by_id = {a.id: a for a in accounts.values()}
    categories = {(c.kind, _norm(c.name)): c for c in db.scalars(select(Category)).all()}
    rows: list[ImportRow] = []
    seen: set[str] = set()
    for i, raw in enumerate(reader, start=2):
        if i - 1 > MAX_ROWS:
            raise DomainError(f"Arquivo excede o limite de {MAX_ROWS} linhas.")
        rec = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        if not any(rec.values()):
            continue
        row = ImportRow(line=i)
        try:
            row.date = parse_date(rec.get("data", ""))
        except ValueError:
            row.errors.append("Data inválida.")
        row.description = rec.get("descricao") or None
        if not row.description:
            row.errors.append("Descrição vazia.")
        elif len(row.description) > 200:
            row.errors.append("Descrição maior que 200 caracteres.")
        try:
            row.amount = money(parse_amount(rec.get("valor", "")))
            if row.amount <= 0:
                row.errors.append("Valor deve ser positivo (o tipo indica receita ou despesa).")
        except (InvalidOperation, ValueError):
            row.errors.append("Valor inválido.")
        row.kind = KIND_IN.get(_norm(rec.get("tipo", "")))
        if not row.kind:
            row.errors.append("Tipo deve ser 'receita' ou 'despesa'.")
        row.status = STATUS_IN.get(_norm(rec.get("status", "") or "efetivada"))
        if not row.status:
            row.errors.append("Status inválido.")
        acc_name = rec.get("conta", "")
        acc = accounts.get(_norm(acc_name)) if acc_name else accounts_by_id.get(default_account_id or -1)
        if acc is None:
            row.errors.append(f"Conta não encontrada: '{acc_name}'." if acc_name else "Informe a conta.")
        else:
            row.account_id, row.account_name = acc.id, acc.name
            if acc.archived:
                row.errors.append(f"A conta '{acc.name}' está arquivada.")
            if row.status == "settled" and row.date and row.date < acc.initial_balance_date:
                row.errors.append("Data anterior ao saldo inicial da conta.")
        cat_name = rec.get("categoria", "")
        if cat_name and row.kind:
            cat = categories.get((row.kind, _norm(cat_name)))
            if cat is None:
                row.errors.append(f"Categoria não encontrada: '{cat_name}'.")
            else:
                row.category_id, row.category_name = cat.id, cat.name
        if not row.errors:
            row.import_hash = row_hash(row.date, row.amount, row.description, row.account_id, row.kind)
            row.duplicate = row.import_hash in seen or _exists(db, row)
            seen.add(row.import_hash)
        rows.append(row)
    return rows


def _exists(db: Session, row: ImportRow) -> bool:
    """Duplicado provável: mesmo hash de importação ou mesmo lançamento já digitado manualmente."""
    return bool(db.scalar(select(func.count()).select_from(Transaction).where(
        (Transaction.import_hash == row.import_hash)
        | ((Transaction.account_id == row.account_id) & (Transaction.date == row.date)
           & (Transaction.amount == row.amount) & (Transaction.kind == row.kind)
           & (func.lower(func.trim(Transaction.description)) == _norm(row.description))))))


def commit(db: Session, content: bytes, default_account_id: int | None, include_duplicates: bool,
           user_id: int | None = None) -> dict:
    """Reprocessa o arquivo no servidor (não confia na pré-visualização) e grava tudo numa transação."""
    rows = preview(db, content, default_account_id)
    invalid = [r for r in rows if r.errors]
    if invalid:
        raise DomainError(f"{len(invalid)} linha(s) com erro; corrija o arquivo antes de importar.")
    created = skipped = 0
    for r in rows:
        if r.duplicate and not include_duplicates:
            skipped += 1
            continue
        tx = Transaction(kind=r.kind, status=r.status, description=r.description, amount=r.amount, date=r.date,
                         settle_date=r.date if r.status == "settled" else None, account_id=r.account_id,
                         category_id=r.category_id, import_hash=r.import_hash, reconciled=False)
        db.add(tx)
        created += 1
    db.flush()
    audit(db, "import", None, "create", after={"created": created, "skipped_duplicates": skipped}, user_id=user_id)
    db.commit()
    return {"created": created, "skipped_duplicates": skipped}


def _cell(value: str) -> str:
    """Evita injeção de fórmula ao abrir o CSV numa planilha."""
    return "'" + value if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value


def export(rows: list[Transaction]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", lineterminator="\n")
    w.writerow(HEADER)
    for t in rows:
        if t.kind not in KIND_OUT:
            continue
        w.writerow([t.date.strftime("%d/%m/%Y"), _cell(t.description), f"{t.amount:.2f}".replace(".", ","),
                    KIND_OUT[t.kind], STATUS_OUT[t.status], t.category.name if t.category else "",
                    _cell(t.account.name), _cell((t.notes or "").replace("\n", " "))])
    return buf.getvalue()
