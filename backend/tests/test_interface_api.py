"""Endpoints que sustentam a interface: ações em lote, comparação com o período anterior e auditoria legível."""

import datetime as dt
from decimal import Decimal

from app.routers.planning import previous_range
from tests.conftest import cat_id
from tests.test_isolation import two_users  # noqa: F401  (fixture)
from tests.test_ledger import account, balance, tx


def test_bulk_settle_marks_pending_and_moves_balance(client):
    acc = account(client)
    a = tx(client, acc, "expense", "100.00", status="pending", date="2026-02-01")
    b = tx(client, acc, "income", "40.00", status="planned", date="2026-02-02")
    c = tx(client, acc, "expense", "10.00", status="settled", date="2026-02-03")
    r = client.post("/api/transactions/bulk/settle", json={"ids": [a["id"], b["id"], c["id"]],
                                                           "settle_date": "2026-02-05"})
    assert r.status_code == 200, r.text
    assert r.json()["changed"] == 2  # o já efetivado é ignorado
    got = client.get(f"/api/transactions/{a['id']}").json()
    assert got["status"] == "settled" and got["settle_date"] == "2026-02-05"
    assert balance(client, acc) == Decimal("1000.00") - 100 + 40 - 10


def test_bulk_is_all_or_nothing(client):
    acc, acc2 = account(client), account(client, "Poupança")
    a = tx(client, acc, "expense", "100.00", status="pending")
    client.post("/api/transfers", json={"from_account_id": acc, "to_account_id": acc2, "amount": "5.00",
                                        "date": "2026-01-10"})
    leg = next(t for t in client.get("/api/transactions").json()["items"] if t["transfer_id"])
    for path in ("/api/transactions/bulk/settle", "/api/transactions/bulk/delete"):
        r = client.post(path, json={"ids": [a["id"], leg["id"]]})
        assert r.status_code == 409, r.text
    assert client.get(f"/api/transactions/{a['id']}").json()["status"] == "pending"


def test_bulk_delete_and_audit_label(client):
    acc = account(client)
    a = tx(client, acc, description="Mercado")
    b = tx(client, acc, description="Farmácia")
    r = client.post("/api/transactions/bulk/delete", json={"ids": [a["id"], b["id"]]})
    assert r.status_code == 200 and r.json()["deleted"] == 2
    assert client.get("/api/transactions").json()["total"] == 0
    deletions = [e for e in client.get("/api/audit").json() if e["action"] == "delete"]
    assert {e["label"] for e in deletions} == {"Mercado", "Farmácia"}


def test_bulk_rejects_settle_before_initial_balance(client):
    acc = account(client, date=dt.date(2026, 3, 1))
    a = tx(client, acc, status="pending", date="2026-03-02")
    r = client.post("/api/transactions/bulk/settle", json={"ids": [a["id"]], "settle_date": "2026-02-01"})
    assert r.status_code == 422


def test_bulk_validates_payload(client):
    assert client.post("/api/transactions/bulk/settle", json={"ids": []}).status_code == 422
    assert client.post("/api/transactions/bulk/delete", json={"ids": list(range(501))}).status_code == 422


def test_other_user_cannot_bulk_change(two_users, client):  # noqa: F811
    f, maria = two_users
    for path in ("/api/transactions/bulk/settle", "/api/transactions/bulk/delete"):
        assert maria.post(path, json={"ids": [f["tx"]]}).status_code == 404
    assert client.get(f"/api/transactions/{f['tx']}").status_code == 200


def test_previous_range():
    assert previous_range("month", dt.date(2026, 3, 1), dt.date(2026, 3, 31)) == (dt.date(2026, 2, 1),
                                                                                    dt.date(2026, 2, 28))
    assert previous_range("3m", dt.date(2026, 1, 1), dt.date(2026, 3, 31)) == (dt.date(2025, 10, 1),
                                                                                 dt.date(2025, 12, 31))
    assert previous_range("year", dt.date(2026, 1, 1), dt.date(2026, 12, 31)) == (dt.date(2025, 1, 1),
                                                                                    dt.date(2025, 12, 31))
    assert previous_range("custom", dt.date(2026, 1, 11), dt.date(2026, 1, 20)) == (dt.date(2026, 1, 1),
                                                                                      dt.date(2026, 1, 10))


def test_dashboard_compares_with_previous_period_and_links_categories(client, db):
    acc = account(client)
    food = cat_id(db, "Alimentação", "expense")
    tx(client, acc, "expense", "80.00", date="2026-01-10", category_id=food)
    tx(client, acc, "expense", "30.00", date="2026-02-10", category_id=food)
    tx(client, acc, "income", "500.00", date="2026-01-05")
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-02-01",
                                             "end": "2026-02-28"}).json()
    assert d["previous"]["start"] == "2026-01-04" and d["previous"]["end"] == "2026-01-31"
    assert Decimal(d["previous"]["expense"]) == 80 and Decimal(d["previous"]["income"]) == 500
    assert d["expenses_by_category"] == [{"category_id": food, "category": "Alimentação", "amount": "30.00"}]


def test_dashboard_daily_series_covers_every_day_with_cash_flow_only(client):
    acc, other = account(client), account(client, name="Reserva")
    tx(client, acc, "expense", "40.00", date="2026-02-03")
    tx(client, acc, "expense", "10.00", date="2026-02-03")
    tx(client, acc, "income", "300.00", date="2026-02-05")
    tx(client, acc, "expense", "99.00", status="pending", date="2026-02-04")  # não efetivado: fora
    client.post("/api/transfers", json={"from_account_id": acc, "to_account_id": other, "amount": "70.00",
                                        "date": "2026-02-04"})  # transferência não é receita nem despesa
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-02-01",
                                             "end": "2026-02-07"}).json()
    days = {x["date"]: x for x in d["daily"]}
    assert len(d["daily"]) == 7 and d["daily"][0]["date"] == "2026-02-01"
    assert Decimal(days["2026-02-03"]["expense"]) == 50 and Decimal(days["2026-02-03"]["income"]) == 0
    assert Decimal(days["2026-02-04"]["expense"]) == 0 and Decimal(days["2026-02-04"]["income"]) == 0
    assert Decimal(days["2026-02-05"]["result"]) == 300
