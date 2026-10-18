"""Cada usuário só enxerga, altera e referencia os próprios dados financeiros (Row-Level Security)."""

import datetime as dt
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError

from app import auth
from app.db import new_session, set_session_user
from app.models import Account, Category, NetWorthSnapshot, Quote, Transaction
from app.providers.base import QuoteResult
from app.seed import DEFAULT_CATEGORIES
from app.services import ledger, networth, quotes
from tests.conftest import PASSWORD, cat_id
from tests.test_api import upload

OTHER = "senha-da-maria-123"
TODAY = dt.date.today()


def login(username, password):
    from app.main import app

    c = TestClient(app, headers={"X-Requested-With": "fetch"})
    assert c.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200
    return c


@pytest.fixture
def two_users(client, db):
    """Felipe (admin, usuário 1) com um conjunto completo de dados; Maria (usuária 2) sem nada."""
    f = {}
    post = lambda path, body, code=201: _ok(client.post(path, json=body), code)  # noqa: E731
    f["acc"] = post("/api/accounts", {"name": "Corrente", "type": "checking", "initial_balance": "1000.00",
                                      "initial_balance_date": "2026-01-01"})["id"]
    f["acc2"] = post("/api/accounts", {"name": "Poupança", "type": "savings", "initial_balance": "0",
                                       "initial_balance_date": "2026-01-01"})["id"]
    f["cat"] = cat_id(db, "Moradia", "expense")
    f["tx"] = post("/api/transactions", {"kind": "expense", "status": "settled", "description": "Aluguel",
                                         "amount": "900.00", "date": "2026-01-05", "account_id": f["acc"],
                                         "category_id": f["cat"]})["id"]
    f["transfer"] = post("/api/transfers", {"from_account_id": f["acc"], "to_account_id": f["acc2"],
                                            "amount": "50.00", "date": "2026-01-06"})["transfer_id"]
    f["rule"] = post("/api/recurrences", {"kind": "expense", "description": "Luz", "amount": "100.00",
                                          "account_id": f["acc"], "frequency": "monthly",
                                          "start_date": "2026-01-10"})["id"]
    f["asset"] = post("/api/assets", {"name": "Petrobras", "ticker": "PETR4", "asset_class": "br_stock",
                                      "currency": "BRL"})["id"]
    f["op"] = post("/api/operations", {"asset_id": f["asset"], "kind": "buy", "date": "2026-01-07", "quantity": "10",
                                       "unit_price": "30", "account_id": f["acc"]})["id"]
    f["quote"] = post(f"/api/assets/{f['asset']}/quotes", {"price": "35", "reference_date": "2026-01-20"})["id"]
    f["fx"] = post("/api/fx", {"currency": "USD", "rate": "5.10", "reference_date": "2026-01-20"})["id"]
    f["lia"] = post("/api/liabilities", {"name": "Cartão", "balance": "300.00",
                                         "reference_date": TODAY.isoformat()})["id"]
    _ok(client.put("/api/budgets", json={"category_id": f["cat"], "month": "2026-01-01", "amount": "1000.00"}), 200)
    f["budget"] = client.get("/api/budgets", params={"month": "2026-01-01"}).json()[0]["id"]
    f["goal"] = post("/api/goals", {"name": "Reserva", "target_amount": "5000.00"})["id"]
    post(f"/api/goals/{f['goal']}/contributions", {"date": "2026-01-10", "amount": "500.00"})
    post("/api/networth/snapshot", {})
    auth.create_user(db, "maria", OTHER)
    return f, login("maria", OTHER)


def _ok(r, code):
    assert r.status_code == code, r.text
    return r.json() if r.content else None


def test_other_user_sees_nothing(two_users):
    f, maria = two_users
    assert maria.get("/api/accounts").json() == []
    page = maria.get("/api/transactions").json()
    assert page["total"] == 0 and Decimal(page["sum_out"]) == 0
    assert maria.get("/api/recurrences").json() == []
    assert maria.get("/api/portfolio").json()["items"] == []
    assert maria.get("/api/operations").json() == []
    assert maria.get("/api/goals").json() == []
    assert maria.get("/api/budgets", params={"month": "2026-01-01"}).json() == []
    assert maria.get("/api/audit").json() == []
    assert [r for r in maria.get("/api/fx").json() if r["source"] == "manual"] == []
    nw = maria.get("/api/networth").json()
    assert Decimal(nw["gross"]) == 0 and Decimal(nw["liabilities"]) == 0 and nw["liability_items"] == []
    k = maria.get("/api/dashboard", params={"period": "custom", "start": "2026-01-01", "end": "2026-01-31"}).json()["kpis"]
    assert Decimal(k["expense"]) == 0 and Decimal(k["net_worth"]) == 0
    history = maria.get("/api/networth/history").json()
    assert history and all(p["estimate"] for p in history)  # nenhum snapshot dela; só estimativas
    assert all(Decimal(p["gross"]) == 0 and Decimal(p["liabilities"]) == 0 for p in history)
    assert maria.get("/api/transactions/export").text.lstrip("﻿").strip().count("\n") == 0  # só o cabeçalho
    assert maria.get("/api/quotes/status").json()["last_run"] is None


def test_other_user_cannot_read_by_id(two_users):
    f, maria = two_users
    assert maria.get(f"/api/transactions/{f['tx']}").status_code == 404
    assert maria.get(f"/api/assets/{f['asset']}").status_code == 404
    assert maria.get(f"/api/transfers/{f['transfer']}").status_code in (404, 409)
    assert maria.get(f"/api/assets/{f['asset']}/quotes").json() == []
    assert maria.get(f"/api/goals/{f['goal']}/contributions").json() == []
    assert maria.get(f"/api/liabilities/{f['lia']}/balances").json() == []


def test_other_user_cannot_change_or_delete(two_users, client):
    f, maria = two_users
    before = client.get("/api/transactions", params={"page_size": 500}).json()
    acc_body = {"name": "Hack", "type": "checking", "initial_balance": "0", "initial_balance_date": "2026-01-01"}
    tx_body = {"kind": "expense", "status": "settled", "description": "x", "amount": "1.00", "date": "2026-01-05",
               "account_id": f["acc"]}
    attempts = [
        maria.put(f"/api/accounts/{f['acc']}", json=acc_body),
        maria.delete(f"/api/accounts/{f['acc']}"),
        maria.post(f"/api/accounts/{f['acc']}/reconcile", json={"date": "2026-01-31", "actual_balance": "0"}),
        maria.put(f"/api/transactions/{f['tx']}", json=tx_body),
        maria.delete(f"/api/transactions/{f['tx']}"),
        maria.post(f"/api/transactions/{f['tx']}/duplicate", json={}),
        maria.delete(f"/api/transfers/{f['transfer']}"),
        maria.post(f"/api/recurrences/{f['rule']}/stop"),
        maria.put(f"/api/categories/{f['cat']}", json={"name": "x", "kind": "expense"}),
        maria.delete(f"/api/operations/{f['op']}"),
        maria.delete(f"/api/quotes/{f['quote']}"),
        maria.delete(f"/api/assets/{f['asset']}"),
        maria.delete(f"/api/budgets/{f['budget']}"),
        maria.delete(f"/api/goals/{f['goal']}"),
        maria.delete(f"/api/liabilities/{f['lia']}"),
    ]
    assert all(r.status_code in (404, 409, 422) for r in attempts), [(r.request.url.path, r.status_code) for r in attempts]
    # nada do Felipe mudou
    assert len(client.get("/api/accounts").json()) == 2
    after = client.get("/api/transactions", params={"page_size": 500}).json()
    assert after == before  # nenhum lançamento do Felipe foi alterado, duplicado ou excluído
    assert client.get(f"/api/transfers/{f['transfer']}").status_code == 200
    assert len(client.get("/api/goals").json()) == 1 and len(client.get("/api/portfolio").json()["items"]) == 1


def test_other_user_cannot_reference_foreign_ids(two_users):
    """A checagem de chave estrangeira do PostgreSQL ignora o RLS: a aplicação precisa recusar ids alheios."""
    f, maria = two_users
    mine = maria.post("/api/accounts", json={"name": "Corrente", "type": "checking", "initial_balance": "0",
                                            "initial_balance_date": "2026-01-01"})
    assert mine.status_code == 201  # o mesmo nome de conta é permitido para outro usuário
    acc = mine.json()["id"]
    asset = maria.post("/api/assets", json={"name": "Vale", "ticker": "VALE3", "asset_class": "br_stock"}).json()["id"]
    attempts = [
        maria.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                              "amount": "1.00", "date": "2026-01-05", "account_id": f["acc"]}),
        maria.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                              "amount": "1.00", "date": "2026-01-05", "account_id": acc,
                                              "category_id": f["cat"]}),
        maria.post("/api/transfers", json={"from_account_id": acc, "to_account_id": f["acc"], "amount": "1.00",
                                           "date": "2026-01-05"}),
        maria.post("/api/recurrences", json={"kind": "expense", "description": "x", "amount": "1.00",
                                             "account_id": f["acc"], "frequency": "monthly", "start_date": "2026-01-01"}),
        maria.post("/api/operations", json={"asset_id": f["asset"], "kind": "buy", "date": "2026-01-07",
                                            "quantity": "1", "unit_price": "1"}),
        maria.post("/api/operations", json={"asset_id": asset, "kind": "buy", "date": "2026-01-07",
                                            "quantity": "1", "unit_price": "1", "account_id": f["acc"]}),
        maria.post(f"/api/assets/{f['asset']}/quotes", json={"price": "1", "reference_date": "2026-01-20"}),
        maria.put("/api/budgets", json={"category_id": f["cat"], "month": "2026-01-01", "amount": "10.00"}),
        maria.post(f"/api/goals/{f['goal']}/contributions", json={"date": "2026-01-10", "amount": "1.00"}),
        maria.post(f"/api/liabilities/{f['lia']}/balances", json={"reference_date": "2026-01-10", "balance": "1.00"}),
        maria.post("/api/categories", json={"name": "Sub", "kind": "expense", "parent_id": f["cat"]}),
    ]
    assert all(r.status_code in (404, 422) for r in attempts), [(r.request.url.path, r.status_code) for r in attempts]
    assert maria.get("/api/transactions").json()["total"] == 0


def test_csv_import_resolves_names_within_owner(two_users):
    f, maria = two_users
    rows = upload(maria, "/api/transactions/import/preview",
                  "data;descricao;valor;tipo;status;categoria;conta\n05/01/2026;X;10,00;despesa;paga;Moradia;Corrente\n").json()
    assert rows[0]["errors"] == ["Conta não encontrada: 'Corrente'."]  # a conta "Corrente" do Felipe não existe para ela


def test_database_rejects_rows_for_another_owner(two_users, db):
    """Mesmo um bug que tentasse gravar com o user_id de outro usuário é barrado pelo banco (WITH CHECK)."""
    with pytest.raises(DBAPIError, match="row-level security"):
        db.execute(text("INSERT INTO accounts (name, type, initial_balance, initial_balance_date, archived, user_id) "
                        "VALUES ('Intrusa', 'cash', 0, '2026-01-01', false, 2)"))
    db.rollback()
    with pytest.raises(DBAPIError, match="row-level security"):
        db.execute(text("UPDATE accounts SET user_id = 2"))  # tentar "doar" as próprias linhas também falha
    db.rollback()


def test_new_user_gets_default_categories(two_users, db):
    f, maria = two_users
    cats = maria.get("/api/categories").json()
    assert len(cats) == len(DEFAULT_CATEGORIES)
    assert {c["name"] for c in cats if c["is_system"]} == {"Proventos", "Taxas de investimento"}
    assert not {c["id"] for c in cats} & {f["cat"]}


def test_worker_runs_each_user_in_own_context(two_users, monkeypatch):
    f, maria = two_users
    acc = maria.post("/api/accounts", json={"name": "Conta", "type": "checking", "initial_balance": "200.00",
                                           "initial_balance_date": "2026-01-01"}).json()["id"]
    maria.post("/api/recurrences", json={"kind": "income", "description": "Bolsa", "amount": "700.00",
                                         "account_id": acc, "frequency": "monthly", "start_date": "2026-01-15"})
    from app import worker

    monkeypatch.setattr(worker.get_settings(), "quotes_auto_update", False)
    worker.run_once({})
    with new_session() as s:
        for uid, expected_net in ((1, None), (2, Decimal("200.00"))):
            set_session_user(s, uid)
            snap = s.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.snapshot_date == TODAY))
            assert snap is not None and s.scalar(select(func.count()).select_from(NetWorthSnapshot)) == 1
            if expected_net is not None:
                assert snap.net == expected_net
            descriptions = set(s.scalars(select(Transaction.description).where(Transaction.recurrence_id.is_not(None))))
            assert descriptions == ({"Luz"} if uid == 1 else {"Bolsa"})


def test_same_ticker_for_two_users_is_fetched_once(two_users):
    f, maria = two_users
    maria.post("/api/assets", json={"name": "Petrobras", "ticker": "PETR4", "asset_class": "br_stock"})

    class Fake:
        name, calls = "fake", 0

        def supports(self, asset_class, currency):
            return True

        def fetch(self, client, symbol):
            Fake.calls += 1
            return QuoteResult(symbol, Decimal("36.50"), "BRL", TODAY)

    cache: dict = {}
    with new_session() as s:
        for uid in (1, 2):
            set_session_user(s, uid)
            assert quotes.update_all(s, providers=[Fake()], fx_provider=None, cache=cache)["ok"] == 1
        for uid in (1, 2):
            set_session_user(s, uid)
            assert s.scalar(select(func.count()).select_from(Quote).where(Quote.source == "auto")) == 1
    assert Fake.calls == 1


def test_update_without_owner_is_refused(db):
    with new_session() as s, pytest.raises(RuntimeError, match="sem usuário"):
        quotes.update_all(s, providers=[], fx_provider=None)


def test_ledger_without_owner_sees_nothing(two_users):
    with new_session() as s:
        assert ledger.balances(s) == {}
        assert s.scalar(select(func.count()).select_from(Category)) == 0
        assert s.scalar(select(func.count()).select_from(Account)) == 0
        assert networth.compute(s)["gross"] == 0


def test_other_user_cannot_use_foreign_ids_when_editing(two_users, db):
    """Mesmo recurso da Maria, editado para apontar a ids do Felipe: tem de ser recusado."""
    f, maria = two_users
    acc = maria.post("/api/accounts", json={"name": "Minha", "type": "checking", "initial_balance": "0",
                                           "initial_balance_date": "2026-01-01"}).json()["id"]
    acc2 = maria.post("/api/accounts", json={"name": "Outra", "type": "cash", "initial_balance": "0",
                                            "initial_balance_date": "2026-01-01"}).json()["id"]
    tx = maria.post("/api/transactions", json={"kind": "expense", "status": "settled", "description": "x",
                                               "amount": "1.00", "date": "2026-01-05", "account_id": acc}).json()["id"]
    tid = maria.post("/api/transfers", json={"from_account_id": acc, "to_account_id": acc2, "amount": "1.00",
                                             "date": "2026-01-05"}).json()["transfer_id"]
    rule = maria.post("/api/recurrences", json={"kind": "expense", "description": "x", "amount": "1.00",
                                                "account_id": acc, "frequency": "monthly",
                                                "start_date": "2026-01-01"}).json()["id"]
    asset = maria.post("/api/assets", json={"name": "Vale", "ticker": "VALE3", "asset_class": "br_stock"}).json()["id"]
    op = maria.post("/api/operations", json={"asset_id": asset, "kind": "buy", "date": "2026-01-07", "quantity": "1",
                                             "unit_price": "1", "account_id": acc}).json()["id"]
    cat = maria.post("/api/categories", json={"name": "Própria", "kind": "expense"}).json()["id"]
    tx_body = {"kind": "expense", "status": "settled", "description": "x", "amount": "1.00", "date": "2026-01-05"}
    attempts = [
        maria.put(f"/api/transactions/{tx}", json={**tx_body, "account_id": f["acc"]}),
        maria.put(f"/api/transactions/{tx}", json={**tx_body, "account_id": acc, "category_id": f["cat"]}),
        maria.put(f"/api/transfers/{tid}", json={"from_account_id": acc, "to_account_id": f["acc"], "amount": "1.00",
                                                 "date": "2026-01-05"}),
        maria.put(f"/api/recurrences/{rule}", json={"kind": "expense", "description": "x", "amount": "1.00",
                                                    "account_id": f["acc"], "frequency": "monthly",
                                                    "start_date": "2026-01-01"}),
        maria.put(f"/api/operations/{op}", json={"asset_id": asset, "kind": "buy", "date": "2026-01-07",
                                                 "quantity": "1", "unit_price": "1", "account_id": f["acc"]}),
        maria.put(f"/api/categories/{cat}", json={"name": "Própria", "kind": "expense", "parent_id": f["cat"]}),
    ]
    assert all(r.status_code in (404, 422) for r in attempts), [(r.request.url.path, r.status_code) for r in attempts]


def test_fx_rates_belong_to_each_user(two_users):
    """Câmbio (PTAX ou manual) e o log da consulta não revelam a outro usuário em que moedas alguém investe."""
    f, maria = two_users

    class FakeFx:
        name, calls = "fake_fx", 0

        def fetch_rate(self, client, currency, today):
            FakeFx.calls += 1
            return QuoteResult(currency, Decimal("5.40"), "BRL", today)

    maria.post("/api/assets", json={"name": "Apple", "ticker": "AAPL", "asset_class": "international",
                                    "currency": "USD"})
    cache: dict = {}
    with new_session() as s:
        set_session_user(s, 2)
        assert quotes.update_all(s, providers=[], fx_provider=FakeFx(), cache=cache)["fx_ok"] == 1
    assert FakeFx.calls == 1
    felipe_fx = [r for r in maria.get("/api/fx").json()]  # Maria: só a PTAX dela
    assert [(r["currency"], r["source"]) for r in felipe_fx] == [("USD", "fake_fx")]
    with new_session() as s:
        set_session_user(s, 1)  # Felipe não tem ativo em USD; não vê a taxa nem o log da Maria
        assert s.scalar(text("SELECT count(*) FROM fx_rates WHERE source = 'fake_fx'")) == 0
        assert s.scalar(text("SELECT count(*) FROM quote_fetch_logs WHERE currency_pair IS NOT NULL")) == 0


def test_worker_retries_quotes_postponed_by_manual_update(two_users, monkeypatch):
    from app import worker
    from app.services.common import Conflict

    monkeypatch.setattr(worker.get_settings(), "quotes_auto_update", True)

    def busy(*args, **kwargs):
        raise Conflict("Já existe uma atualização de cotações em andamento.")

    monkeypatch.setattr(worker.quotes, "update_all", busy)
    last: dict = {}
    worker.run_once(last)
    assert "quotes" not in last  # adiada: o próximo ciclo tenta de novo, sem esperar o intervalo inteiro
