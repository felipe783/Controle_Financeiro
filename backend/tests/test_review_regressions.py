"""Regressões dos achados da revisão de código (cada teste falhava antes da correção)."""

import datetime as dt
from decimal import Decimal

from app.services.csv_io import parse_amount
from tests.conftest import cat_id
from tests.test_api import upload
from tests.test_investments import asset, op, pos
from tests.test_ledger import account, tx

TODAY = dt.date.today()


def test_zero_cash_operation_is_business_error_not_500(client):
    acc = account(client)
    aid = asset(client)
    op(client, aid, "buy", quantity="1", unit_price="10", account_id=acc)
    r = client.post("/api/operations", json={"asset_id": aid, "kind": "income", "date": "2026-01-11",
                                             "gross_amount": "5.00", "taxes": "5.00", "account_id": acc})
    assert r.status_code == 422 and "maior que zero" in r.json()["detail"]
    r = client.post("/api/operations", json={"asset_id": aid, "kind": "buy", "date": "2026-01-11", "quantity": "1",
                                             "unit_price": "0", "account_id": acc})
    assert r.status_code == 422


def test_amortization_taxes_cannot_exceed_gross(client):
    aid = asset(client, None, "cdb", name="CDB")
    op(client, aid, "buy", quantity="1", unit_price="100")
    r = client.post("/api/operations", json={"asset_id": aid, "kind": "amortization", "date": "2026-01-11",
                                             "gross_amount": "5.00", "taxes": "8.00"})
    assert r.status_code == 422
    assert Decimal(pos(client, aid)["cost_brl"]) == Decimal("100.00")


def test_future_dated_operation_does_not_shrink_net_worth(client):
    acc = account(client, balance="1000.00")
    aid = asset(client)
    op(client, aid, "buy", (TODAY + dt.timedelta(days=10)).isoformat(), quantity="5", unit_price="100",
       account_id=acc)
    assert Decimal(client.get("/api/networth").json()["gross"]) == Decimal("1000.00")


def test_recurrence_update_validates_category_and_account(client, db):
    acc = account(client)
    r = client.post("/api/recurrences", json={"kind": "expense", "description": "Luz", "amount": "100.00",
                                              "account_id": acc, "frequency": "monthly", "start_date": "2026-01-05"})
    rule = r.json()
    body = {k: rule[k] for k in ("kind", "description", "amount", "account_id", "frequency", "start_date")}
    bad_cat = client.put(f"/api/recurrences/{rule['id']}", json={**body, "category_id": cat_id(db, "Salário", "income")})
    assert bad_cat.status_code == 422
    assert client.put(f"/api/recurrences/{rule['id']}", json={**body, "account_id": 9999}).status_code == 404


def test_account_referenced_by_rule_cannot_be_deleted(client):
    acc = account(client)
    client.post("/api/recurrences", json={"kind": "expense", "description": "Luz", "amount": "100.00",
                                          "account_id": acc, "frequency": "monthly",
                                          "start_date": (TODAY + dt.timedelta(days=90)).isoformat()})
    assert client.delete(f"/api/accounts/{acc}").status_code == 409


def test_csv_thousands_without_comma():
    assert parse_amount("1.500") == Decimal("1500")
    assert parse_amount("R$ 1.234") == Decimal("1234")
    assert parse_amount("12.50") == Decimal("12.50")
    assert parse_amount("1.234,56") == Decimal("1234.56")


def test_csv_export_reimport_roundtrip_keeps_prefixed_text(client):
    acc = account(client, name="-Conta")
    tx(client, acc, "expense", "10.00", description="-Estorno", notes="obs 1")
    body = client.get("/api/transactions/export").text.lstrip("﻿")
    rows = upload(client, "/api/transactions/import/preview", body).json()
    assert rows[0]["errors"] == [] and rows[0]["description"] == "-Estorno" and rows[0]["notes"] == "obs 1"
    assert rows[0]["duplicate"] is True
