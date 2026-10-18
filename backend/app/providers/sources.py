"""Provedores implementados. Cobertura:

- brapi (https://brapi.dev): ações, FIIs, ETFs e BDRs da B3, em BRL. Requer BRAPI_TOKEN
  (PETR4, MGLU3, VALE3 e ITUB4 funcionam sem token, mas o sistema só ativa o provedor com token).
  Dados com atraso conforme o plano; não é tempo real.
- Alpha Vantage (https://www.alphavantage.co): ativos internacionais (função GLOBAL_QUOTE), preço de
  fechamento do último pregão. Requer ALPHAVANTAGE_API_KEY; plano gratuito com limite diário baixo.
- Banco Central PTAX (https://olinda.bcb.gov.br): câmbio oficial BRL por moeda estrangeira, sem chave.

Tesouro Direto, CDB, LCI/LCA, fundos e outros: avaliação manual.
"""

import datetime as dt

import httpx

from app.providers.base import SP_TZ, ProviderError, QuoteResult, get_json, to_decimal


class BrapiProvider:
    name = "brapi"
    url = "https://brapi.dev/api/quote/{symbol}"

    def __init__(self, token: str, retries: int):
        self.token, self.retries = token, retries

    def supports(self, asset_class: str, currency: str) -> bool:
        return currency == "BRL" and asset_class in ("br_stock", "fii", "etf")

    def fetch(self, client: httpx.Client, symbol: str) -> QuoteResult:
        data = get_json(client, self.url.format(symbol=symbol),
                        headers={"Authorization": f"Bearer {self.token}"}, retries=self.retries)
        results = data.get("results") or []
        if not results or results[0].get("regularMarketPrice") is None:
            raise ProviderError("not_found", data.get("message") or "Ativo sem cotação no provedor.")
        r = results[0]
        ts = r.get("regularMarketTime")
        try:
            ref = dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(SP_TZ).date()
        except (AttributeError, ValueError) as exc:
            raise ProviderError("error", "Resposta sem data de referência da cotação.") from exc
        return QuoteResult(symbol, to_decimal(r["regularMarketPrice"]), (r.get("currency") or "BRL").upper(), ref)


class AlphaVantageProvider:
    name = "alphavantage"
    url = "https://www.alphavantage.co/query"

    def __init__(self, api_key: str, retries: int):
        self.api_key, self.retries = api_key, retries

    def supports(self, asset_class: str, currency: str) -> bool:
        return currency != "BRL" and asset_class in ("international", "etf", "br_stock", "other")

    def fetch(self, client: httpx.Client, symbol: str) -> QuoteResult:
        data = get_json(client, self.url, params={"function": "GLOBAL_QUOTE", "symbol": symbol,
                                                  "apikey": self.api_key}, retries=self.retries)
        if "Note" in data or "Information" in data:
            raise ProviderError("rate_limited", "Alpha Vantage recusou a consulta (limite do plano ou chave inválida).")
        if "Error Message" in data:
            raise ProviderError("not_found", "Símbolo não reconhecido pela Alpha Vantage.")
        q = data.get("Global Quote") or {}
        if not q.get("05. price"):
            raise ProviderError("not_found", "Ativo sem cotação na Alpha Vantage.")
        try:
            ref = dt.date.fromisoformat(q["07. latest trading day"])
        except (KeyError, ValueError) as exc:
            raise ProviderError("error", "Resposta sem data do último pregão.") from exc
        # GLOBAL_QUOTE não informa a moeda; usa-se a moeda cadastrada no ativo (documentado).
        return QuoteResult(symbol, to_decimal(q["05. price"]), "", ref)


class BcbPtaxProvider:
    name = "bcb_ptax"
    url = ("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
           "CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)")

    def __init__(self, retries: int):
        self.retries = retries

    def fetch_rate(self, client: httpx.Client, currency: str, today: dt.date) -> QuoteResult:
        start = today - dt.timedelta(days=10)  # cobre fins de semana e feriados
        params = {"@moeda": f"'{currency}'", "@dataInicial": f"'{start:%m-%d-%Y}'",
                  "@dataFinalCotacao": f"'{today:%m-%d-%Y}'", "$format": "json"}
        data = get_json(client, self.url, params=params, retries=self.retries)
        values = data.get("value") or []
        if not values:
            raise ProviderError("not_found", f"PTAX sem cotação de {currency} nos últimos 10 dias.")
        last_day = max(v["dataHoraCotacao"][:10] for v in values)
        same_day = [v for v in values if v["dataHoraCotacao"].startswith(last_day)]
        closing = [v for v in same_day if v.get("tipoBoletim") == "Fechamento"]
        chosen = (closing or sorted(same_day, key=lambda v: v["dataHoraCotacao"]))[-1]
        return QuoteResult(currency, to_decimal(chosen["cotacaoVenda"]), "BRL", dt.date.fromisoformat(last_day))
