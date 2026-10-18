# Sobre o Arquivo

`backend/app/models.py` define as tabelas com SQLAlchemy 2 (`Mapped[...]`) e as **restrições que protegem a integridade no próprio banco**.

| Tabela | Conteúdo | Restrições principais |
|---|---|---|
| `users`, `user_sessions` | usuários e sessões (hash do token) | `username` e `token_hash` únicos |
| `accounts` | contas e saldo inicial | nome único; tipo enumerado |
| `categories` | categorias e subcategorias | única por (tipo, pai, nome) com `NULLS NOT DISTINCT`; `is_system` |
| `transactions` | todo movimento de caixa | `amount > 0`; tipo e status enumerados; efetivado exige `settle_date`; transferência, ajuste e investimento só efetivados; `UNIQUE(recurrence_id, recurrence_date)`; `investment_operation_id UNIQUE` |
| `recurrence_rules` | regras de recorrência | frequência enumerada; `generated_until` |
| `assets`, `investment_operations` | ativos e operações | classe e tipo enumerados; custos ≥ 0; câmbio > 0 |
| `quotes` | cotações válidas (auto/manual) | índice único parcial: uma `auto` por ativo, provedor e dia |
| `quote_fetch_logs` | cada consulta, inclusive as falhas | — |
| `fx_rates` | câmbio | único por (moeda, data, fonte) |
| `liabilities`, `liability_balances` | dívidas e histórico de saldo | saldo ≥ 0; único por data |
| `net_worth_snapshots` | patrimônio diário + detalhes JSON | `snapshot_date` único |
| `budgets`, `goals`, `goal_contributions` | planejamento | orçamento único por (categoria, mês) e sempre no dia 1 |
| `audit_logs` | antes/depois das alterações | — |
| `system_status` | batimento do worker e última atualização | chave primária `key` |

## Dono de cada linha (Row-Level Security)

- `OwnedMixin`: `user_id` NOT NULL com padrão `app_user_id()` (o usuário da transação). Usado por contas, categorias, lançamentos, recorrências, ativos, operações, cotações, logs de consulta, câmbio, dívidas e saldos, orçamentos, metas e aportes, snapshots.
- Não há linha "global": até o câmbio PTAX é gravado por usuário. Uma linha comum revelaria a outros em que moedas alguém investe, e qualquer sessão poderia alterá-la (achado da revisão de 2026-10-18).
- `audit_logs.user_id` (quem agiu) também tem o padrão do contexto, e cada usuário só lê o próprio histórico.
- A política fica na migração `0003`, não no modelo: `owner_only` (`user_id = app_user_id()`) em `USING` e `WITH CHECK`, com `FORCE ROW LEVEL SECURITY` para valer também para o dono das tabelas.
- Sem usuário no contexto, `app_user_id()` é NULL: nenhuma linha aparece e gravar falha (padrão NULL em coluna NOT NULL).

## Sinal dos lançamentos

````python
TX_SIGN = {
    "income": 1,
    "expense": -1,
    "transfer_in": 1,
    "transfer_out": -1,
    "adjustment_in": 1,
    "adjustment_out": -1,
    "investment_in": 1,
    "investment_out": -1,
}
````

> [!warning] Armadilha evitada: atributo `date` sombreando o tipo
> Nas classes, uma coluna chamada `date` sobrepõe o tipo `date` nas anotações seguintes (`Mapped[date | None]`), e o Alembic chegou a gerar `recurrence_date` como NOT NULL. Por isso o arquivo usa `import datetime as dt` e anota com `dt.date`. Confirmado em 2026-10-18 pelo `--autogenerate` e corrigido antes da primeira versão.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]
