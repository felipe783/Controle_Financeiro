import datetime as dt
from decimal import Decimal

from sqlalchemy import func, select

from app.db import new_session, reset_engine, set_session_user
from app.models import Transaction
from app.services import networth
from tests.conftest import PASSWORD, cat_id
from tests.test_ledger import account, balance, tx

CSV = (
    "data;descricao;valor;tipo;status;categoria;conta\n"
    "05/01/2026;Mercado;1.234,56;despesa;paga;Alimentação;Corrente\n"
    "2026-01-06;Salário;5000.00;receita;recebida;Salário;Corrente\n"
    "07/01/2026;Errada;abc;despesa;paga;;Corrente\n"
)


def upload(client, path, content, **form):
    return client.post(path, files={"file": ("x.csv", content.encode(), "text/csv")}, data=form)


def test_csv_preview_validates_and_flags_duplicates(client):
    acc = account(client)
    rows = upload(client, "/api/transactions/import/preview", CSV).json()
    assert len(rows) == 3
    assert rows[0]["amount"] == "1234.56" and rows[0]["kind"] == "expense" and not rows[0]["errors"]
    assert rows[2]["errors"] == ["Valor inválido."]
    # arquivo com erro não é importado parcialmente
    assert upload(client, "/api/transactions/import/commit", CSV).status_code == 422
    good = "\n".join(CSV.splitlines()[:3]) + "\n"
    r = upload(client, "/api/transactions/import/commit", good)
    assert r.json() == {"created": 2, "skipped_duplicates": 0}
    assert balance(client, acc) == Decimal("4765.44")
    rows = upload(client, "/api/transactions/import/preview", good).json()
    assert all(r["duplicate"] for r in rows)
    assert upload(client, "/api/transactions/import/commit", good).json() == {"created": 0, "skipped_duplicates": 2}


def test_duplicate_detection_matches_manual_entry(client, db):
    acc = account(client)
    tx(client, acc, "expense", "1234.56", description="Mercado", date="2026-01-05")
    rows = upload(client, "/api/transactions/import/preview", "\n".join(CSV.splitlines()[:2])).json()
    assert rows[0]["duplicate"] is True


def test_csv_export_roundtrip(client, db):
    acc = account(client)
    tx(client, acc, "expense", "10.50", description="=cmd()", category_id=cat_id(db, "Lazer", "expense"))
    body = client.get("/api/transactions/export").text
    assert "'=cmd()" in body and "10,50" in body and "Lazer" in body  # proteção contra fórmula
    assert body.lstrip("﻿").splitlines()[0] == "data;descricao;valor;tipo;status;categoria;conta;observacoes"


def test_auth_required_and_csrf(anon, client):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as raw:
        assert raw.get("/api/accounts").status_code == 401
        r = raw.post("/api/auth/login", json={"username": "felipe", "password": PASSWORD})
        assert r.status_code == 403  # sem X-Requested-With
    assert client.get("/api/accounts").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/accounts").status_code == 401


def test_login_lockout(anon, db):
    from app import auth

    auth.create_user(db, "user1", PASSWORD)
    for _ in range(5):
        assert anon.post("/api/auth/login", json={"username": "user1", "password": "errada"}).status_code == 401
    assert anon.post("/api/auth/login", json={"username": "user1", "password": PASSWORD}).status_code == 429


def test_weak_password_rejected(db):
    import pytest

    from app import auth

    with pytest.raises(ValueError):
        auth.create_user(db, "x", "curta")


def test_password_stored_hashed(db):
    from app import auth

    u = auth.create_user(db, "user2", PASSWORD)
    assert PASSWORD not in u.password_hash and u.password_hash.startswith("$argon2")


def test_health_checks_database_and_migrations(anon):
    r = anon.get("/api/health")
    from app.main import migration_head

    assert r.status_code == 200 and r.json()["database"] == "ok" and r.json()["migration"] == migration_head()


def test_data_persists_after_restart(client):
    acc = account(client)
    tx(client, acc, "income", "123.45")
    reset_engine()  # simula reinício do processo: descarta conexões e caches
    with new_session() as db:
        assert db.scalar(select(func.count()).select_from(Transaction)) == 0  # sem dono no contexto: nada
        set_session_user(db, 1)
        assert db.scalar(select(func.count()).select_from(Transaction)) == 1


def test_budget_report_and_alert(client, db):
    acc = account(client)
    food = cat_id(db, "Alimentação", "expense")
    month = dt.date.today().replace(day=1)
    sub = client.post("/api/categories", json={"name": "Restaurante", "kind": "expense", "parent_id": food}).json()
    assert client.put("/api/budgets", json={"category_id": food, "month": month.isoformat(),
                                            "amount": "1000.00"}).status_code == 200
    tx(client, acc, "expense", "500.00", date=month.replace(day=15).isoformat(), category_id=food)
    tx(client, acc, "expense", "9.00", date=(month - dt.timedelta(days=1)).isoformat(), category_id=food)
    tx(client, acc, "expense", "350.00", date=month.isoformat(), category_id=sub["id"])
    tx(client, acc, "expense", "200.00", status="planned", date=month.isoformat(), category_id=food)
    b = client.get("/api/budgets", params={"month": month.isoformat()}).json()[0]
    assert Decimal(b["spent"]) == 850 and Decimal(b["committed"]) == 200 and b["status"] == "warning"
    assert Decimal(b["percent"]) == Decimal("0.85")


def test_goals_progress_not_counted_as_asset(client):
    account(client, balance="1000.00")
    gid = client.post("/api/goals", json={"name": "Reserva", "target_amount": "6000.00"}).json()["id"]
    client.post(f"/api/goals/{gid}/contributions", json={"date": "2026-01-10", "amount": "1500.00"})
    g = client.get("/api/goals").json()[0]
    assert Decimal(g["saved"]) == 1500 and Decimal(g["progress"]) == Decimal("0.25")
    assert Decimal(client.get("/api/networth").json()["gross"]) == 1000


def test_forecast_and_upcoming(client):
    acc = account(client)
    soon = (dt.date.today() + dt.timedelta(days=3)).isoformat()
    tx(client, acc, "expense", "120.00", status="pending", date=soon, due_date=soon)
    tx(client, acc, "income", "300.00", status="planned", date=soon)
    f = client.get("/api/forecast", params={"days": 10}).json()
    assert Decimal(f["projected_cash"]) == Decimal("1180.00")
    d = client.get("/api/dashboard").json()
    assert d["kpis"]["upcoming_count"] == 1 and d["upcoming"][0]["amount"] == "120.00"


def test_system_category_protected(client, db):
    pid = cat_id(db, "Proventos", "income")
    assert client.delete(f"/api/categories/{pid}").status_code == 409


def test_current_month_covers_whole_month(client):
    acc = account(client)
    last = networth.month_end(dt.date.today())
    tx(client, acc, "income", "100.00", date=last.isoformat())
    tx(client, acc, "expense", "40.00", date=last.replace(day=15).isoformat())
    d = client.get("/api/dashboard", params={"period": "month"}).json()
    assert d["period"]["end"] == last.isoformat()
    assert Decimal(d["kpis"]["income"]) == 100 and Decimal(d["kpis"]["expense"]) == 40


def test_dashboard_periods(client):
    for p in ("month", "3m", "6m", "year"):
        assert client.get("/api/dashboard", params={"period": p}).status_code == 200
    assert client.get("/api/dashboard", params={"period": "custom"}).status_code == 422
