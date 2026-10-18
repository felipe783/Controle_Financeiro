O módulo **Providers** (`backend/app/providers/`) tem os clientes HTTP das fontes de cotação. Os provedores **não conhecem banco nem regra financeira**: recebem um `httpx.Client` e um símbolo e devolvem um `QuoteResult(symbol, price, currency, reference_date)` ou lançam `ProviderError(status, message)`. Quem grava é [[Cotações (Financeiro)|Cotações]].

| Provedor | Classe | Ativos | Chave | Data de referência |
|---|---|---|---|---|
| [brapi.dev](https://brapi.dev) | `BrapiProvider` | ações, FIIs e ETFs da B3, em BRL | `BRAPI_TOKEN` (header `Authorization: Bearer`) | `regularMarketTime` convertido para America/Sao_Paulo |
| [Alpha Vantage](https://www.alphavantage.co) | `AlphaVantageProvider` | moeda ≠ BRL (`GLOBAL_QUOTE`) | `ALPHAVANTAGE_API_KEY` | `07. latest trading day` |
| [PTAX/BCB](https://olinda.bcb.gov.br) | `BcbPtaxProvider` | câmbio BRL por moeda | nenhuma | último dia com cotação; boletim de Fechamento |

Os formatos de resposta foram conferidos em 2026-10-18 nas APIs reais: `PETR4` (brapi, sem token), `IBM` (Alpha Vantage, chave `demo`) e USD (PTAX).

## Requisições com retentativas limitadas

````python
def get_json(client: httpx.Client, url: str, *, params=None, headers=None, retries: int = 2) -> dict:
    """GET com retentativas limitadas para falhas transitórias (rede, 5xx, 429).
    Nunca registra parâmetros nem cabeçalhos: eles podem conter chaves de API."""
    attempt = 0
    while True:
        try:
            resp = client.get(url, params=params, headers=headers)
        except httpx.TimeoutException:
            err = ProviderError("error", "Tempo limite excedido ao consultar o provedor.")
        except httpx.TransportError as exc:
            err = ProviderError("error", f"Falha de rede: {type(exc).__name__}.")
        else:
            if resp.status_code in (401, 403):
                raise ProviderError("auth", f"Acesso negado pelo provedor (HTTP {resp.status_code}); verifique a chave.")
            if resp.status_code == 404:
                raise ProviderError("not_found", "Ativo não encontrado no provedor.")
            if resp.status_code == 429:
                err = ProviderError("rate_limited", "Limite de requisições do provedor atingido.")
            elif resp.status_code >= 500:
                err = ProviderError("error", f"Provedor indisponível (HTTP {resp.status_code}).")
            elif resp.status_code >= 400:
                raise ProviderError("error", f"Requisição recusada (HTTP {resp.status_code}).")
            else:
                try:
                    return resp.json()
                except ValueError as exc:
                    raise ProviderError("error", "Resposta não é JSON válido.") from exc
        if attempt >= retries:
            raise err
        attempt += 1
        time.sleep(min(0.5 * 2 ** attempt, 8))
````

- 401/403 → `auth` e 404 → `not_found`, **sem nova tentativa**. Timeout, falha de rede, 5xx e 429 → até `QUOTES_MAX_RETRIES` novas tentativas, com espera crescente de no máximo 8 s.
- Preço zero, negativo ou não numérico é recusado (`to_decimal`).
- Parâmetros e cabeçalhos nunca vão para o log. O logger `httpx` fica em WARNING porque, em INFO, registraria a URL com a `apikey` da Alpha Vantage.

> [!note] Verificado em 2026-10-18
> `tests/test_providers.py` com `httpx.MockTransport`: parsing de cada provedor, fuso de São Paulo, 401 sem nova tentativa, retentativas que terminam em sucesso, limite de tentativas, limite da Alpha Vantage, preço inválido e boletim PTAX.


---
**Projeto Pai:** [[_Financeiro]]
