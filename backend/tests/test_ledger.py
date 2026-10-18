import datetime as dt
from decimal import Decimal

from sqlalchemy import func, select

from app.models import RecurrenceRule, Transaction
from app.services import ledger
from tests.conftest import cat_id

D0 = dt.date(2026, 1, 1)


def account(client, name="Corrente", balance="1000.00", type_="checking", date=D0):
    r = client.post("/api/accounts", json={"name": name, "type": type_, "initial_balance": balance,
                                           "initial_balance_date": date.isoformat()})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def tx(client, acc, kind="expense", amount="100.00", status="settled", date="2026-01-10", **kw):
    body = {"kind": kind, "status": status, "description": kw.pop("description", "Teste"), "amount": amount,
            "date": date, "account_id": acc, **kw}
    r = client.post("/api/transactions", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def balance(client, acc):
    return Decimal(next(a for a in client.get("/api/accounts").json() if a["id"] == acc)["balance"])


def test_income_expense_crud_and_balance(client, db):
    acc = account(client)
    inc = tx(client, acc, "income", "2500.00", category_id=cat_id(db, "Salário", "income"))
    exp = tx(client, acc, "expense", "300.50", category_id=cat_id(db, "Moradia", "expense"))
    assert balance(client, acc) == Decimal("3199.50")

    body = {**exp, "amount": "400.00"}
    r = client.put(f"/api/transactions/{exp['id']}", json={k: body[k] for k in (
        "kind", "status", "description", "amount", "date", "account_id", "category_id")})
    assert r.status_code == 200, r.text
    assert balance(client, acc) == Decimal("3100.00")

    assert client.delete(f"/api/transactions/{inc['id']}").status_code == 204
    assert balance(client, acc) == Decimal("600.00")
    assert client.get(f"/api/transactions/{inc['id']}").status_code == 404
    # exclusão fica registrada na auditoria
    log = client.get("/api/audit", params={"entity": "transaction", "entity_id": inc["id"]}).json()
    assert [e["action"] for e in log] == ["delete", "create"]


def test_planned_expense_does_not_affect_balance(client):
    acc = account(client)
    t = tx(client, acc, "expense", "250.00", status="planned", due_date="2026-01-05")
    assert balance(client, acc) == Decimal("1000.00")
    assert t["settle_date"] is None and t["overdue"] is True
    body = {k: t[k] for k in ("kind", "description", "amount", "date", "account_id")}
    r = client.put(f"/api/transactions/{t['id']}", json={**body, "status": "settled", "settle_date": "2026-01-06"})
    assert r.status_code == 200 and r.json()["overdue"] is False
    assert balance(client, acc) == Decimal("750.00")


def test_category_kind_must_match(client, db):
    acc = account(client)
    r = client.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                               "amount": "10.00", "date": "2026-01-02", "account_id": acc,
                                               "category_id": cat_id(db, "Salário", "income")})
    assert r.status_code == 422


def test_money_precision_rejected_and_validation_messages(client):
    acc = account(client)
    r = client.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                               "amount": "10.001", "date": "2026-01-02", "account_id": acc})
    assert r.status_code == 422
    r = client.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                               "amount": "-5", "date": "2026-01-02", "account_id": acc})
    assert r.status_code == 422


def test_settle_before_initial_balance_rejected(client):
    acc = account(client, date=dt.date(2026, 2, 1))
    r = client.post("/api/transactions", json={"kind": "income", "status": "settled", "description": "x",
                                               "amount": "10.00", "date": "2026-01-15", "account_id": acc})
    assert r.status_code == 422
    assert "saldo inicial" in r.json()["detail"]


def test_transfer_is_atomic_and_not_income_or_expense(client):
    a = account(client, "A", "1000.00")
    b = account(client, "B", "0.00")
    r = client.post("/api/transfers", json={"from_account_id": a, "to_account_id": b, "amount": "400.00",
                                            "date": "2026-01-10"})
    assert r.status_code == 201, r.text
    tid = r.json()["transfer_id"]
    assert balance(client, a) == Decimal("600.00") and balance(client, b) == Decimal("400.00")

    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-01-01", "end": "2026-01-31"}).json()
    assert Decimal(d["kpis"]["income"]) == 0 and Decimal(d["kpis"]["expense"]) == 0
    assert Decimal(d["kpis"]["gross_worth"]) == Decimal("1000.00")  # transferir não cria nem destrói patrimônio

    # excluir uma perna exclui a transferência inteira
    leg = client.get("/api/transactions", params={"kind": "transfer"}).json()["items"][0]
    assert client.delete(f"/api/transactions/{leg['id']}").status_code == 204
    assert balance(client, a) == Decimal("1000.00") and balance(client, b) == Decimal("0.00")
    assert client.get(f"/api/transfers/{tid}").status_code == 409


def test_transfer_failure_leaves_no_leg(client, db):
    a = account(client, "A")
    r = client.post("/api/transfers", json={"from_account_id": a, "to_account_id": 9999, "amount": "10.00",
                                            "date": "2026-01-10"})
    assert r.status_code == 404
    assert db.scalar(select(func.count()).select_from(Transaction)) == 0


def test_transfer_edit_updates_both_legs(client):
    a, b = account(client, "A"), account(client, "B", "0.00")
    tid = client.post("/api/transfers", json={"from_account_id": a, "to_account_id": b, "amount": "100.00",
                                              "date": "2026-01-10"}).json()["transfer_id"]
    r = client.put(f"/api/transfers/{tid}", json={"from_account_id": a, "to_account_id": b, "amount": "250.00",
                                                  "date": "2026-01-11"})
    assert r.status_code == 204
    assert balance(client, a) == Decimal("750.00") and balance(client, b) == Decimal("250.00")
    leg = client.get("/api/transactions", params={"kind": "transfer"}).json()["items"][0]
    r = client.put(f"/api/transactions/{leg['id']}", json={"kind": "expense", "status": "settled",
                                                           "description": "x", "amount": "1.00",
                                                           "date": "2026-01-11", "account_id": a})
    assert r.status_code == 409  # perna isolada não pode ser editada


def test_reconcile_creates_adjustment_with_history(client):
    acc = account(client)
    tx(client, acc, "expense", "100.00")
    r = client.post(f"/api/accounts/{acc}/reconcile", json={"date": "2026-01-31", "actual_balance": "880.00",
                                                             "note": "extrato"})
    assert r.status_code == 200 and r.json()["kind"] == "adjustment_out" and r.json()["amount"] == "20.00"
    assert balance(client, acc) == Decimal("880.00")
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-01-01", "end": "2026-01-31"}).json()
    assert Decimal(d["kpis"]["expense"]) == Decimal("100.00")  # ajuste não é despesa
    assert client.post(f"/api/accounts/{acc}/reconcile",
                       json={"date": "2026-01-31", "actual_balance": "880.00"}).json() is None


def test_period_totals_and_savings_rate(client):
    acc = account(client)
    tx(client, acc, "income", "4000.00", date="2026-03-05")
    tx(client, acc, "expense", "1000.00", date="2026-03-10")
    tx(client, acc, "expense", "500.00", status="pending", date="2026-03-20")
    tx(client, acc, "expense", "999.00", date="2026-04-01")
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-03-01", "end": "2026-03-31"}).json()
    k = d["kpis"]
    assert Decimal(k["income"]) == 4000 and Decimal(k["expense"]) == 1000 and Decimal(k["result"]) == 3000
    assert Decimal(k["savings_rate"]) == Decimal("0.75")
    assert Decimal(k["planned_expenses"]) == 500
    march = next(m for m in d["monthly"] if m["month"] == "2026-03")
    assert Decimal(march["expense"]) == 1000


def test_savings_rate_undefined_without_income(client):
    account(client)
    d = client.get("/api/dashboard", params={"period": "month"}).json()
    assert d["kpis"]["savings_rate"] is None


def test_recurrence_generates_once_and_deleted_not_recreated(client, db):
    acc = account(client)
    r = client.post("/api/recurrences", json={"kind": "expense", "description": "Aluguel", "amount": "1500.00",
                                              "account_id": acc, "frequency": "monthly",
                                              "start_date": "2026-01-31", "end_date": "2026-04-30"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    ledger.generate_recurrences(db, dt.date(2026, 12, 31))
    ledger.generate_recurrences(db, dt.date(2026, 12, 31))
    dates = sorted(db.scalars(select(Transaction.date).where(Transaction.recurrence_id == rid)).all())
    assert dates == [dt.date(2026, 1, 31), dt.date(2026, 2, 28), dt.date(2026, 3, 31), dt.date(2026, 4, 30)]
    assert all(t.status == "planned" for t in db.scalars(select(Transaction)).all())

    first = db.scalar(select(Transaction).where(Transaction.recurrence_id == rid, Transaction.date == dates[0]))
    client.delete(f"/api/transactions/{first.id}")
    ledger.generate_recurrences(db, dt.date(2027, 1, 31))
    db.expire_all()
    assert db.scalar(select(func.count()).select_from(Transaction).where(Transaction.recurrence_id == rid)) == 3


def test_recurrence_weekly_occurrences():
    rule = RecurrenceRule(frequency="weekly", interval_count=2, start_date=dt.date(2026, 1, 1), end_date=None)
    assert ledger.occurrences(rule, dt.date(2026, 1, 1), dt.date(2026, 2, 1)) == [
        dt.date(2026, 1, 1), dt.date(2026, 1, 15), dt.date(2026, 1, 29)]


def test_duplicate_transaction(client):
    acc = account(client)
    t = tx(client, acc, "expense", "80.00", due_date="2026-01-15")
    r = client.post(f"/api/transactions/{t['id']}/duplicate", json={"date": "2026-02-10"})
    assert r.status_code == 201
    d = r.json()
    assert d["status"] == "planned" and d["date"] == "2026-02-10" and d["due_date"] == "2026-02-15"
    assert balance(client, acc) == Decimal("920.00")


def test_filters_search_sort_pagination(client):
    acc = account(client)
    for i in range(5):
        tx(client, acc, "expense", f"{10 + i}.00", description=f"Mercado {i}", date=f"2026-01-{10 + i}")
    tx(client, acc, "income", "50.00", description="Freela")
    page = client.get("/api/transactions", params={"q": "mercado", "sort": "amount", "order": "asc",
                                                   "page_size": 2, "page": 2}).json()
    assert page["total"] == 5 and [i["amount"] for i in page["items"]] == ["12.00", "13.00"]
    assert Decimal(page["sum_out"]) == Decimal("60.00")


def test_archived_account_rejects_new_movement(client):
    acc = account(client)
    client.put(f"/api/accounts/{acc}", json={"name": "Corrente", "type": "checking", "initial_balance": "1000.00",
                                             "initial_balance_date": "2026-01-01", "archived": True})
    r = client.post("/api/transactions", json={"kind": "income", "status": "settled", "description": "x",
                                               "amount": "1.00", "date": "2026-01-02", "account_id": acc})
    assert r.status_code == 422


def test_account_with_movements_cannot_be_deleted(client):
    acc = account(client)
    tx(client, acc)
    assert client.delete(f"/api/accounts/{acc}").status_code == 409


def test_balance_as_of_date(client, db):
    acc = account(client)
    tx(client, acc, "income", "100.00", date="2026-01-05")
    tx(client, acc, "income", "100.00", date="2026-02-05")
    assert ledger.account_balance(db, acc, dt.date(2026, 1, 31)) == Decimal("1100.00")
    assert ledger.account_balance(db, acc, dt.date(2025, 12, 31)) == Decimal("0")
