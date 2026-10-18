# Sobre o Arquivo

`backend/app/services/quotes.py` **orquestra a atualização de cotações e câmbio**. Usa os provedores de [[!Modulo Providers (Financeiro)|!Modulo Providers]] e grava o resultado. É chamado pelo [[Worker e CLI (Financeiro)|worker]] (`trigger="auto"`) e por `POST /api/quotes/update` (`trigger="manual"`).

Responsabilidades:
- garantir uma única atualização por vez com o advisory lock `815001`, mantido numa **conexão dedicada**;
- escolher o provedor por classe e moeda (`provider_for`);
- reaproveitar consultas recentes (5 min no manual; intervalo − 1 min no automático);
- respeitar o ritmo mínimo entre requisições e o limite diário da Alpha Vantage;
- inserir ou atualizar a cotação `auto` do dia sem tocar nas manuais;
- registrar cada consulta em `quote_fetch_logs` e o resumo em `system_status['quotes_last_run:<usuário>']`;
- atualizar o câmbio PTAX das moedas em uso pelo usuário (consulta única por rodada via `cache`, gravada para cada usuário);
- atualizar só os ativos do usuário da sessão; o `cache` da rodada do worker evita consultar o mesmo ticker de novo para outro usuário;
- contar o limite diário da Alpha Vantage somando todos os usuários (`system_status['provider_calls:...']`), porque o log de cada usuário só enxerga as próprias consultas.

# Funcionalidades

## Lock em conexão dedicada

O `Session` devolve a conexão ao pool a cada commit; um lock de sessão tomado nele se perderia. Por isso o lock usa outra conexão:

````python
    lock_conn = db.get_bind().connect()
    if not lock_conn.scalar(text("SELECT pg_try_advisory_lock(:k)"), {"k": QUOTES_LOCK_KEY}):
        lock_conn.close()
        raise Conflict("Já existe uma atualização de cotações em andamento.")
````

## Provedores ativos

````python
def configured_providers():
    s = get_settings()
    out = []
    if s.brapi_token:
        out.append(BrapiProvider(s.brapi_token, s.quotes_max_retries))
    if s.alphavantage_api_key:
        out.append(AlphaVantageProvider(s.alphavantage_api_key, s.quotes_max_retries))
    return out
````

Sem token ou chave, a lista fica vazia. A tela de Investimentos então avisa que o sistema está funcionando só com cotações manuais.

> [!note] Verificado em 2026-10-18
> Testes com provedores falsos:
> - `test_auto_update_success_cache_and_fx` (sucesso, cache e câmbio);
> - `test_failure_keeps_last_valid_quote_and_never_invents` (falha mantém a última cotação);
> - `test_concurrent_update_is_blocked` (lock);
> - `test_manual_update_without_providers_is_clear` (sem provedor).


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
