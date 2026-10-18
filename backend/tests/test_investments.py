import datetime as dt
from decimal import Decimal

import pytest
from sqlalchemy import func, select, text

from app.db import get_engine
from app.models import Asset, Quote, QuoteFetchLog, Transaction
from app.providers.base import ProviderError, QuoteResult
from app.services import investments, networth, quotes
from app.services.common import Conflict
from tests.test_ledger import account, balance

TODAY = dt.date.today()


def asset(client, ticker="PETR4", cls="br_stock", currency="BRL", **kw):
    r = client.post("/api/assets", json={"name": kw.pop("name", ticker), "ticker": ticker, "asset_class": cls,
                                         "currency": currency, **kw})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def op(client, aid, kind, date="2026-01-10", expect=201, **kw):
    r = client.post("/api/operations", json={"asset_id": aid, "kind": kind, "date": date, **kw})
    assert r.status_code == expect, r.text
    return r.json()


def pos(client, aid):
    return client.get(f"/api/assets/{aid}").json()


def quote(client, aid, price=None, total=None, ref="2026-01-20", expect=201):
    body = {"reference_date": ref}
    body.update({"price": price} if price else {"total_value": total})
    r = client.post(f"/api/assets/{aid}/quotes", json=body)
    assert r.status_code == expect, r.text
    return r.json()


def test_average_cost_buy_sell_realized(client):
    acc = account(client, balance="10000.00")
    aid = asset(client)
    op(client, aid, "buy", quantity="100", unit_price="10", fees="5.00", account_id=acc)
    op(client, aid, "buy", "2026-01-11", quantity="100", unit_price="12", fees="5.00", account_id=acc)
    p = pos(client, aid)
    assert Decimal(p["quantity"]) == 200 and Decimal(p["cost_brl"]) == Decimal("2210.00")
    assert Decimal(p["avg_price"]) == Decimal("11.05")
    op(client, aid, "sell", "2026-01-12", quantity="50", unit_price="15", fees="5.00", account_id=acc)
    p = pos(client, aid)
    assert Decimal(p["quantity"]) == 150 and Decimal(p["cost_brl"]) == Decimal("1657.50")
    assert Decimal(p["realized_brl"]) == Decimal("192.50")
    assert balance(client, acc) == Decimal("8535.00")
    assert p["valuation_method"] == "cost"  # sem cotação: não inventa preço

    quote(client, aid, price="14")
    p = pos(client, aid)
    assert p["valuation_method"] == "market" and Decimal(p["market_value_brl"]) == Decimal("2100.00")
    assert Decimal(p["unrealized_brl"]) == Decimal("442.50")
    assert Decimal(p["total_return_brl"]) == Decimal("635.00")
    nw = client.get("/api/networth").json()
    assert Decimal(nw["gross"]) == Decimal("10635.00")
    # compra/venda não são despesa nem receita
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-01-01", "end": "2026-01-31"}).json()
    assert Decimal(d["kpis"]["income"]) == 0 and Decimal(d["kpis"]["expense"]) == 0
    flows = next(m for m in d["investment_flows"] if m["month"] == "2026-01")
    assert Decimal(flows["contributions"]) == Decimal("2210.00") and Decimal(flows["withdrawals"]) == Decimal("745.00")


def test_editing_historical_operation_recalculates_everything(client):
    acc = account(client, balance="10000.00")
    aid = asset(client)
    first = op(client, aid, "buy", quantity="100", unit_price="10", fees="5.00", account_id=acc)
    op(client, aid, "buy", "2026-01-11", quantity="100", unit_price="12", fees="5.00", account_id=acc)
    op(client, aid, "sell", "2026-01-12", quantity="50", unit_price="15", fees="5.00", account_id=acc)
    body = {k: first[k] for k in ("asset_id", "kind", "date", "quantity", "fees", "account_id")}
    r = client.put(f"/api/operations/{first['id']}", json={**body, "unit_price": "11"})
    assert r.status_code == 200, r.text
    assert r.json()["cash_amount"] == "1105.00"
    p = pos(client, aid)
    assert Decimal(p["cost_brl"]) == Decimal("1732.50") and Decimal(p["realized_brl"]) == Decimal("167.50")
    assert balance(client, acc) == Decimal("8435.00")


def test_cannot_sell_more_than_held_even_by_editing_history(client, db):
    acc = account(client, balance="10000.00")
    aid = asset(client)
    first = op(client, aid, "buy", quantity="10", unit_price="10", account_id=acc)
    op(client, aid, "sell", "2026-01-12", quantity="11", unit_price="10", account_id=acc, expect=422)
    op(client, aid, "sell", "2026-01-12", quantity="8", unit_price="10", account_id=acc)
    body = {k: first[k] for k in ("asset_id", "kind", "date", "unit_price", "account_id")}
    r = client.put(f"/api/operations/{first['id']}", json={**body, "quantity": "5"})
    assert r.status_code == 422
    assert Decimal(pos(client, aid)["quantity"]) == 2  # nada mudou
    assert client.delete(f"/api/operations/{first['id']}").status_code == 422
    assert balance(client, acc) == Decimal("9980.00")


def test_dividend_counted_once(client, db):
    acc = account(client, balance="1000.00")
    aid = asset(client, "MXRF11", "fii")
    op(client, aid, "buy", quantity="100", unit_price="10", account_id=acc)
    div = op(client, aid, "income", "2026-01-15", gross_amount="100.00", taxes="15.00", income_type="fii_income",
             account_id=acc)
    assert div["cash_amount"] == "85.00"
    op(client, aid, "income", "2026-02-15", gross_amount="50.00", income_status="announced", account_id=acc)
    assert balance(client, acc) == Decimal("85.00")
    p = pos(client, aid)
    assert Decimal(p["income_brl"]) == Decimal("85.00") and Decimal(p["income_announced_brl"]) == Decimal("50.00")
    d = client.get("/api/dashboard", params={"period": "custom", "start": "2026-01-01", "end": "2026-01-31"}).json()
    assert Decimal(d["kpis"]["income"]) == Decimal("85.00")
    assert Decimal(d["kpis"]["gross_worth"]) == Decimal("1085.00")  # caixa + posição pelo custo, provento 1x
    tx = db.scalar(select(Transaction).where(Transaction.investment_operation_id == div["id"]))
    assert tx.category.name == "Proventos"
    assert client.delete(f"/api/transactions/{tx.id}").status_code == 409
    assert client.delete(f"/api/operations/{div['id']}").status_code == 204
    assert balance(client, acc) == Decimal("0.00")


def test_investment_account_cash_not_double_counted(client):
    acc = account(client, "Corretora", "1000.00", "investment")
    aid = asset(client)
    op(client, aid, "buy", quantity="5", unit_price="100", account_id=acc)
    nw = client.get("/api/networth").json()
    assert Decimal(nw["cash_investment_accounts"]) == Decimal("500.00")
    assert Decimal(nw["investments_market_value"]) == Decimal("500.00")
    assert Decimal(nw["gross"]) == Decimal("1000.00")


def test_liabilities_reduce_net_worth(client):
    account(client, balance="1000.00")
    r = client.post("/api/liabilities", json={"name": "Financiamento", "balance": "300.00",
                                              "reference_date": TODAY.isoformat()})
    assert r.status_code == 201
    nw = client.get("/api/networth").json()
    assert Decimal(nw["gross"]) == 1000 and Decimal(nw["liabilities"]) == 300 and Decimal(nw["net"]) == 700


def test_xirr():
    r = investments.xirr([(dt.date(2025, 1, 1), Decimal(-1000)), (dt.date(2026, 1, 1), Decimal(1100))])
    assert abs(r - Decimal("0.10")) < Decimal("0.0001")
    assert investments.xirr([(dt.date(2025, 1, 1), Decimal(-1000))]) is None
    assert investments.xirr([(dt.date(2026, 1, 1), Decimal(-1000)), (dt.date(2026, 1, 12), Decimal(1100))]) is None
    big = investments.xirr([(dt.date(2025, 1, 1), Decimal(-100)), (dt.date(2025, 3, 1), Decimal(300))])
    assert big is not None and big > 10  # retornos altos também são encontrados


def test_foreign_asset_fx_components(client):
    acc = account(client, balance="10000.00")
    aid = asset(client, "AAPL", "international", "USD")
    op(client, aid, "buy", quantity="10", unit_price="100", account_id=acc, expect=422)  # sem câmbio
    op(client, aid, "buy", quantity="10", unit_price="100", fx_rate="5.0", account_id=acc)
    assert balance(client, acc) == Decimal("5000.00")
    quote(client, aid, price="120")
    p = pos(client, aid)
    assert p["valuation_method"] == "no_fx" and any("câmbio" in w for w in p["warnings"])
    assert Decimal(p["market_value_brl"]) == Decimal("5000.00")
    r = client.post("/api/fx", json={"currency": "USD", "rate": "5.5", "reference_date": "2026-01-20"})
    assert r.status_code == 201
    p = pos(client, aid)
    assert Decimal(p["market_value_brl"]) == Decimal("6600.00") and Decimal(p["unrealized_brl"]) == 1600
    assert Decimal(p["asset_effect_brl"]) == Decimal("1000.00") and Decimal(p["fx_effect_brl"]) == Decimal("600.00")


def test_quote_priority_and_staleness(client, db):
    aid = asset(client)
    a = db.get(Asset, aid)
    db.add(Quote(asset_id=aid, source="auto", provider="brapi", price=Decimal("10"), currency="BRL",
                 reference_date=dt.date(2026, 10, 10)))
    db.commit()
    quote(client, aid, price="11", ref="2026-10-10")
    assert investments.effective_quote(db, aid).price == Decimal("11")  # empate: manual vence
    db.add(Quote(asset_id=aid, source="auto", provider="brapi", price=Decimal("12"), currency="BRL",
                 reference_date=dt.date(2026, 10, 11)))
    db.commit()
    assert investments.effective_quote(db, aid).price == Decimal("12")  # mais recente vence
    assert db.scalar(select(func.count()).select_from(Quote).where(Quote.asset_id == aid)) == 3  # histórico
    assert investments.is_stale(a, TODAY - dt.timedelta(days=10)) is True
    assert investments.is_stale(a, TODAY) is False


def test_fixed_income_total_value_quote(client):
    acc = account(client, balance="5000.00")
    aid = asset(client, None, "cdb", name="CDB Banco X", indexer="CDI", contracted_rate="110% CDI")
    op(client, aid, "buy", quantity="1", unit_price="5000", account_id=acc)
    quote(client, aid, total="5230.10", ref="2026-02-01")
    p = pos(client, aid)
    assert Decimal(p["market_value_brl"]) == Decimal("5230.10") and Decimal(p["unrealized_brl"]) == Decimal("230.10")
    # avaliação total anterior a uma nova aplicação não vale mais (a posição mudou): volta ao custo, sinalizado
    op(client, aid, "buy", "2026-03-01", quantity="1", unit_price="1000", account_id=acc)
    p = pos(client, aid)
    assert p["valuation_method"] == "cost" and Decimal(p["market_value_brl"]) == Decimal("6000.00")


class FakeProvider:
    name = "fake"

    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, 0

    def supports(self, asset_class, currency):
        return currency == "BRL"

    def fetch(self, client, symbol):
        self.calls += 1
        if self.error:
            raise self.error
        return QuoteResult(symbol, self.result, "BRL", TODAY)


class FakeFx:
    name = "fake_fx"

    def fetch_rate(self, client, currency, today):
        return QuoteResult(currency, Decimal("5.25"), "BRL", today)


def test_auto_update_success_cache_and_fx(client, db):
    aid = asset(client)
    asset(client, "AAPL", "international", "USD")
    prov = FakeProvider(Decimal("37.12"))
    s = quotes.update_all(db, trigger="manual", providers=[prov], fx_provider=FakeFx())
    assert s["ok"] == 1 and s["unsupported"] == 1 and s["fx_ok"] == 1
    q = investments.effective_quote(db, aid)
    assert q.source == "auto" and q.price == Decimal("37.12") and q.provider == "fake"
    assert investments.fx_rate(db, "USD").rate == Decimal("5.25")
    s = quotes.update_all(db, trigger="manual", providers=[prov], fx_provider=FakeFx())
    assert s["skipped"] == 1 and prov.calls == 1  # cache: não consulta de novo
    status = client.get("/api/quotes/status").json()
    assert status["last_run"]["skipped"] == 1 and status["logs"][0]["status"] == "ok"


def test_failure_keeps_last_valid_quote_and_never_invents(client, db):
    aid = asset(client)
    quote(client, aid, price="20", ref=(TODAY - dt.timedelta(days=10)).isoformat())
    prov = FakeProvider(error=ProviderError("error", "Provedor indisponível (HTTP 503)."))
    s = quotes.update_all(db, providers=[prov], fx_provider=FakeFx())
    assert s["errors"] == 1
    assert db.scalar(select(func.count()).select_from(Quote)) == 1
    log = db.scalar(select(QuoteFetchLog).where(QuoteFetchLog.asset_id == aid))
    assert log.status == "error" and log.price is None
    p = pos(client, aid)
    assert p["last_price"] == "20.00000000" and p["quote_stale"] is True


def test_concurrent_update_is_blocked(db):
    with get_engine().connect() as other:
        other.execute(text("SELECT pg_advisory_lock(:k)"), {"k": quotes.QUOTES_LOCK_KEY})
        with pytest.raises(Conflict):
            quotes.update_all(db, providers=[], fx_provider=FakeFx())
        other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": quotes.QUOTES_LOCK_KEY})
        other.commit()


def test_manual_update_without_providers_is_clear(client):
    asset(client)
    r = client.post("/api/quotes/update")
    assert r.status_code == 200 and r.json()["providers"] == [] and r.json()["unsupported"] == 1


def test_snapshot_preserves_valuation_of_its_date(client, db):
    acc = account(client, balance="1000.00", date=TODAY - dt.timedelta(days=60))
    aid = asset(client)
    op(client, aid, "buy", (TODAY - dt.timedelta(days=30)).isoformat(), quantity="10", unit_price="50",
       account_id=acc)
    quote(client, aid, price="60", ref=(TODAY - dt.timedelta(days=1)).isoformat())
    snap = networth.take_snapshot(db)
    assert snap.net == Decimal("1100.00")
    db.add(Quote(asset_id=aid, source="auto", provider="x", price=Decimal("90"), currency="BRL",
                 reference_date=TODAY + dt.timedelta(days=1)))
    db.commit()
    hist = networth.history(db, TODAY.replace(day=1), TODAY)
    point = next(p for p in hist if p["date"] == TODAY)
    assert point["estimate"] is False and point["net"] == Decimal("1100.00")
    # estimativa de mês passado usa só cotações conhecidas até aquela data (aqui nenhuma → custo)
    past = networth.compute(db, TODAY - dt.timedelta(days=15))
    assert past["investments_market_value"] == Decimal("500.00")
