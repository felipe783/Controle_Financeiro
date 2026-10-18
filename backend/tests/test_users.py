"""Logout real e gestão de usuários com permissão verificada no servidor."""

import os

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import select, text

from app import auth
from app.db import new_session
from app.models import User
from tests.conftest import PASSWORD

OTHER = "outra-senha-forte-456"


def login(username, password=PASSWORD):
    from app.main import app

    c = TestClient(app, headers={"X-Requested-With": "fetch"})
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


def test_logout_invalidates_session_on_server(client):
    old_cookie = client.cookies.get("fin_session")
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/transactions").status_code == 401
    # Reapresentar o cookie antigo (ex.: copiado antes de sair) não reabre a sessão.
    from app.main import app

    with TestClient(app, cookies={"fin_session": old_cookie}) as replay:
        assert replay.get("/api/auth/me").status_code == 401
    assert "fin_session" not in client.cookies


def test_me_exposes_role(client):
    assert client.get("/api/auth/me").json() == {"id": 1, "username": "felipe", "is_admin": True}


def test_admin_creates_user_persisted_with_hash(client, db):
    r = client.post("/api/users", json={"username": "maria", "password": OTHER})
    assert r.status_code == 201, r.text
    assert r.json()["is_admin"] is False and r.json()["is_active"] is True
    row = db.scalar(select(User).where(User.username == "maria"))
    assert row.password_hash.startswith("$argon2") and OTHER not in row.password_hash
    maria = login("Maria", OTHER)  # login não diferencia maiúsculas
    assert maria.get("/api/auth/me").json()["is_admin"] is False
    assert maria.get("/api/accounts").status_code == 200  # usuário comum usa o sistema normalmente
    assert [u["username"] for u in client.get("/api/users").json()] == ["felipe", "maria"]


def test_duplicate_and_invalid_users_rejected(client):
    assert client.post("/api/users", json={"username": "maria", "password": OTHER}).status_code == 201
    dup = client.post("/api/users", json={"username": "MARIA", "password": OTHER})
    assert dup.status_code == 409 and "Já existe" in dup.json()["detail"]
    assert client.post("/api/users", json={"username": "ma ria", "password": OTHER}).status_code == 422
    assert client.post("/api/users", json={"username": "jo", "password": OTHER}).status_code == 422
    weak = client.post("/api/users", json={"username": "joao", "password": "curta"})
    assert weak.status_code == 422
    same = client.post("/api/users", json={"username": "joao123456789", "password": "joao123456789"})
    assert same.status_code == 422 and "fraca" in same.json()["detail"]


def test_regular_user_cannot_manage_users(client, db):
    auth.create_user(db, "comum", OTHER)
    user = login("comum", OTHER)
    assert user.get("/api/users").status_code == 403
    assert user.post("/api/users", json={"username": "hacker", "password": OTHER, "is_admin": True}).status_code == 403
    me_id = user.get("/api/auth/me").json()["id"]
    assert user.put(f"/api/users/{me_id}", json={"is_admin": True, "is_active": True}).status_code == 403
    db.expire_all()
    assert db.scalar(select(User.is_admin).where(User.id == me_id)) is False
    assert db.scalar(select(User).where(User.username == "hacker")) is None


def test_unauthenticated_cannot_create_users(anon):
    assert anon.post("/api/users", json={"username": "x123", "password": OTHER}).status_code == 401


def test_admin_guards_and_deactivation(client, db):
    me = client.get("/api/auth/me").json()
    r = client.put(f"/api/users/{me['id']}", json={"is_admin": False, "is_active": True})
    assert r.status_code == 409  # não remove o próprio acesso
    uid = client.post("/api/users", json={"username": "maria", "password": OTHER}).json()["id"]
    maria = login("maria", OTHER)
    r = client.put(f"/api/users/{uid}", json={"is_admin": False, "is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    assert maria.get("/api/auth/me").status_code == 401  # sessão encerrada ao desativar
    from app.main import app

    with TestClient(app, headers={"X-Requested-With": "fetch"}) as c:
        assert c.post("/api/auth/login", json={"username": "maria", "password": OTHER}).status_code == 401
    # promover e depois rebaixar o outro admin funciona; o último admin ativo é protegido
    assert client.put(f"/api/users/{uid}", json={"is_admin": True, "is_active": True}).status_code == 200
    assert client.put(f"/api/users/{uid}", json={"is_admin": False, "is_active": True}).status_code == 200
    log = client.get("/api/audit", params={"entity": "user", "entity_id": uid}).json()
    assert [e["action"] for e in log] == ["update", "update", "update", "create"]


def test_migration_promotes_existing_users_to_admin():
    """Quem existia antes da 0002 foi criado por create-admin e precisa continuar administrador."""
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.attributes["skip_logging"] = True
    command.downgrade(cfg, "0001")
    try:
        with new_session() as db:
            db.execute(text("INSERT INTO users (username, password_hash, is_active) VALUES ('antigo', 'x', true)"))
            db.commit()
        command.upgrade(cfg, "head")
        with new_session() as db:
            assert db.scalar(text("SELECT is_admin FROM users WHERE username = 'antigo'")) is True
    finally:
        command.upgrade(cfg, "head")
