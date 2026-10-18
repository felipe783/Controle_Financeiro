# Visão Geral do Sistema

O Financeiro é um sistema de **controle financeiro pessoal**. O usuário registra contas, receitas, despesas, transferências e operações de investimento. O sistema calcula, sempre a partir do que está gravado no PostgreSQL, os saldos, o resultado do período, o valor da carteira e o patrimônio líquido, sem dupla contagem e sem inventar valores.

## Finalidade

- Controlar receitas e despesas, separando o **previsto** do **efetivado**.
- Manter o saldo de cada conta e transferir entre contas sem afetar receitas, despesas ou patrimônio.
- Acompanhar investimentos: preço médio, resultado realizado e não realizado, proventos, TIR e câmbio.
- Atualizar cotações automaticamente (quando há provedor configurado) ou manualmente.
- Consolidar o patrimônio (ativos − dívidas) com histórico em snapshots diários.
- Planejar: orçamento por categoria, metas e previsão de caixa.

## Entrada principal

- O navegador acessa o **Nginx** (`web`), que serve o React compilado e encaminha `/api/*` para a API.
- [[Main (Financeiro)|backend/app/main.py]] cria o FastAPI, a proteção CSRF, o `/api/health` e o login.
- [[Routers (Financeiro)|backend/app/routers/]] expõem os endpoints REST, todos protegidos por [[Autenticação (Financeiro)|sessão]].

## Saída principal

- JSON para o frontend. Valores monetários vão como **texto decimal** (`"1234.56"`), para não perder precisão.
- CSV de lançamentos (`GET /api/transactions/export`).
- Backups `pg_dump` gerados por `scripts/backup.sh`.

## Camadas principais

- [[!Modulo API (Financeiro)|!Modulo API]]: borda HTTP, validação (Pydantic) e autenticação.
- [[!Modulo Services (Financeiro)|!Modulo Services]]: regras financeiras (saldos, investimentos, cotações, patrimônio, relatórios, CSV).
- [[!Modulo Providers (Financeiro)|!Modulo Providers]]: clientes HTTP dos provedores de cotação, sem acesso ao banco.
- [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]: modelos SQLAlchemy, migrações Alembic e conexão.
- [[!Modulo Frontend (Financeiro)|!Modulo Frontend]]: interface React.
- [[!Modulo Infra (Financeiro)|!Modulo Infra]]: Docker, Nginx, scripts Bash, worker e CLI.

```text
navegador ─▶ web (Nginx: React + proxy /api) ─▶ api (FastAPI) ─▶ db (PostgreSQL, volume pgdata)
                                                 worker (cotações, recorrências, snapshot) ─▶ db
                                                 migrate (alembic upgrade head, roda e sai) ─▶ db
```

[[Dependencias (Financeiro)|Dependencias]] · [[Resumo Principal (Financeiro)|Resumo Principal]]

---
**Projeto Pai:** [[_Financeiro]]
