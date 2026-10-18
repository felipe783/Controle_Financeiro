import datetime as dt
from decimal import Decimal

import httpx
import pytest

from app.providers import base
from app.providers.base import ProviderError
from app.providers.sources import AlphaVantageProvider, BcbPtaxProvider, BrapiProvider


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    monkeypatch.setattr(base.time, "sleep", lambda s: None)


def client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def test_brapi_parses_price_and_reference_date_in_sao_paulo():
    def handler(req):
        assert req.headers["authorization"] == "Bearer tok"
        assert "tok" not in str(req.url)
        return httpx.Response(200, json={"results": [{"symbol": "PETR4", "currency": "BRL",
                                                      "regularMarketPrice": 59.68,
                                                      "regularMarketTime": "2026-10-17T02:29:23.000Z"}]})

    r = BrapiProvider("tok", 0).fetch(client(handler), "PETR4")
    assert r.price == Decimal("59.68") and r.currency == "BRL"
    assert r.reference_date == dt.date(2026, 10, 16)  # 23:29 do dia 16 em São Paulo


def test_brapi_auth_error_is_not_retried():
    calls = []

    def handler(req):
        calls.append(1)
        return httpx.Response(401, json={"error": True})

    with pytest.raises(ProviderError) as e:
        BrapiProvider("x", 2).fetch(client(handler), "XPTO3")
    assert e.value.status == "auth" and len(calls) == 1


def test_retries_transient_errors_then_succeeds():
    calls = []

    def handler(req):
        calls.append(1)
        if len(calls) < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"Global Quote": {"05. price": "232.1400",
                                                          "07. latest trading day": "2026-10-16"}})

    r = AlphaVantageProvider("k", 2).fetch(client(handler), "IBM")
    assert r.price == Decimal("232.1400") and r.reference_date == dt.date(2026, 10, 16) and len(calls) == 3


def test_retries_are_limited():
    calls = []

    def handler(req):
        calls.append(1)
        raise httpx.ConnectTimeout("t")

    with pytest.raises(ProviderError):
        AlphaVantageProvider("k", 2).fetch(client(handler), "IBM")
    assert len(calls) == 3


def test_alphavantage_rate_limit_message():
    with pytest.raises(ProviderError) as e:
        AlphaVantageProvider("k", 0).fetch(client(lambda r: httpx.Response(200, json={"Information": "limit"})), "IBM")
    assert e.value.status == "rate_limited"


def test_invalid_price_rejected():
    payload = {"results": [{"regularMarketPrice": 0, "regularMarketTime": "2026-10-17T02:29:23.000Z"}]}
    with pytest.raises(ProviderError):
        BrapiProvider("t", 0).fetch(client(lambda r: httpx.Response(200, json=payload)), "X")


def test_ptax_prefers_closing_bulletin_of_last_day():
    values = [
        {"cotacaoVenda": 5.0, "dataHoraCotacao": "2026-10-15 13:00:00.0", "tipoBoletim": "Fechamento"},
        {"cotacaoVenda": 5.0882, "dataHoraCotacao": "2026-10-16 13:04:14.444", "tipoBoletim": "Intermediário"},
        {"cotacaoVenda": 5.0826, "dataHoraCotacao": "2026-10-16 13:04:14.548", "tipoBoletim": "Fechamento"},
    ]
    r = BcbPtaxProvider(0).fetch_rate(client(lambda req: httpx.Response(200, json={"value": values})), "USD",
                                      dt.date(2026, 10, 18))
    assert r.price == Decimal("5.0826") and r.reference_date == dt.date(2026, 10, 16)
