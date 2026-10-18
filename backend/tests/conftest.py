"""Testes rodam contra um PostgreSQL ISOLADO (TEST_DATABASE_URL), nunca contra o banco real.

O nome do banco precisa conter 'test'; o schema é recriado do zero pelas migrações.
Exemplo: TEST_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55432/financeiro_test
"""

import os

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, make_url, text

TEST_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_URL:
    pytest.exit("Defina TEST_DATABASE_URL apontando para um banco de teste PostgreSQL.", returncode=2)
if "test" not in (make_url(TEST_URL).database or ""):
    pytest.exit("Por segurança, o banco de teste precisa ter 'test' no nome.", returncode=2)

os.environ["DATABASE_URL"] = TEST_URL
os.environ.setdefault("APP_ENV", "test")
os.environ["QUOTES_MIN_SECONDS_BETWEEN_REQUESTS"] = "0"
os.environ["BRAPI_TOKEN"] = ""
os.environ["ALPHAVANTAGE_API_KEY"] = ""

from app import auth  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import new_session, reset_engine  # noqa: E402

KEEP = {"alembic_version", "categories"}
PASSWORD = "senha-de-teste-123"


@pytest.fixture(scope="session", autouse=True)
def database():
    get_settings.cache_clear()
    eng = create_engine(TEST_URL)
    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    eng.dispose()
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.attributes["skip_logging"] = True
    command.upgrade(cfg, "head")
    reset_engine()
    with new_session() as db:
        seed_max = db.scalar(text("SELECT max(id) FROM categories"))
    yield seed_max
    reset_engine()


@pytest.fixture(autouse=True)
def clean(database):
    with new_session() as db:
        tables = [r[0] for r in db.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'")) if r[0] not in KEEP]
        db.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
        db.execute(text("DELETE FROM categories WHERE id > :m"), {"m": database})
        db.commit()
    auth._failures.clear()
    yield


@pytest.fixture
def db():
    s = new_session()
    yield s
    s.close()


@pytest.fixture
def anon():
    from app.main import app

    with TestClient(app, headers={"X-Requested-With": "fetch"}) as c:
        yield c


@pytest.fixture
def client(anon, db):
    auth.create_user(db, "felipe", PASSWORD, is_admin=True)
    r = anon.post("/api/auth/login", json={"username": "felipe", "password": PASSWORD})
    assert r.status_code == 200, r.text
    return anon


def cat_id(db, name, kind):
    return db.scalar(text("SELECT id FROM categories WHERE name=:n AND kind=:k AND parent_id IS NULL"),
                     {"n": name, "k": kind})
