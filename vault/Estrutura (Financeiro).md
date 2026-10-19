# Estrutura do Projeto

```text
Financeiro/
	📁 backend
	|  |--📁 app
	|  |  |--📁 providers
	|  |  |  |--base.py          ← interface, retentativas, erros
	|  |  |  |--sources.py       ← brapi, Alpha Vantage, PTAX
	|  |  |--📁 routers
	|  |  |  |--finance.py       ← contas, categorias, lançamentos, transferências, recorrências, CSV
	|  |  |  |--invest.py        ← carteira, ativos, operações, cotações, câmbio
	|  |  |  |--planning.py      ← painel, patrimônio, dívidas, orçamentos, metas, previsão, auditoria
	|  |  |  |--users.py         ← gestão de usuários (só administradores)
	|  |  |--📁 services
	|  |  |  |--common.py        ← erros de domínio, auditoria
	|  |  |  |--ledger.py        ← saldos, lançamentos, transferências, conciliação, recorrências
	|  |  |  |--investments.py   ← posição, avaliação, XIRR, operações, cotação manual
	|  |  |  |--quotes.py        ← atualização automática/manual de cotações e câmbio
	|  |  |  |--networth.py      ← patrimônio, snapshots, histórico
	|  |  |  |--reports.py       ← painel, orçamentos, metas, previsão
	|  |  |  |--csv_io.py        ← importação e exportação CSV
	|  |  |--auth.py             ← Argon2, sessões, bloqueio de login
	|  |  |--cli.py              ← create-admin, reset-password, check-db, status, worker-health
	|  |  |--config.py           ← Settings (variáveis de ambiente)
	|  |  |--db.py               ← engine e Session
	|  |  |--logging_setup.py
	|  |  |--main.py             ← app FastAPI, CSRF, /api/health, login
	|  |  |--models.py           ← tabelas e restrições
	|  |  |--money.py            ← regras de Decimal e arredondamento
	|  |  |--schemas.py          ← contratos Pydantic
	|  |  |--serialize.py        ← Decimal → texto no JSON
	|  |  |--seed.py             ← categorias padrão de cada usuário novo
	|  |  |--worker.py           ← agendador único (roda por usuário)
	|  |--📁 migrations
	|  |  |--📁 versions
	|  |  |  |--0001_schema_inicial.py
	|  |  |  |--0002_papel_de_administrador.py
	|  |  |  |--0003_dados_por_usuario_com_rls.py
	|  |  |--env.py
	|  |--📁 tests             ← pytest (PostgreSQL isolado, papel sem superusuário; test_isolation.py)
	|  |--alembic.ini
	|  |--requirements.txt / requirements-dev.txt
	📁 frontend
	|  |--📁 public
	|  |  |--theme.js            ← tema claro/escuro antes do React (compatível com a CSP)
	|  |--📁 src
	|  |  |--📁 components       ← ui.tsx (design system), charts.tsx, TransactionForms.tsx (lançamento rápido), InvestmentForms.tsx
	|  |  |--📁 pages            ← Dashboard, Transactions, Accounts, Investments, AssetPage, NetWorth, Planning, Categories, Audit, Users
	|  |  |--App.tsx / main.tsx / api.ts / hooks.ts / format.ts / types.ts
	|  |  |--format.test.ts      ← vitest
	|  |--package.json / package-lock.json / vite.config.ts / tailwind.config.js
	📁 infra
	|  |--📁 nginx
	|  |  |--default.conf        ← SPA, proxy /api, cabeçalhos de segurança
	|  |--📁 postgres
	|     |--init-app-user.sh    ← cria o usuário da aplicação na 1ª inicialização
	📁 scripts               ← install, deploy, update, backup, restore, status, logs, stop, create-admin, lib
	📁 backups               ← destino padrão dos backups (só .gitkeep versionado)
	📁 docs
	|  |--METODOLOGIA.md         ← fórmulas de saldo, patrimônio e rentabilidade
	📁 vault                 ← esta documentação (Obsidian); índice em _Financeiro
	|--Dockerfile              ← alvos api e web
	|--docker-compose.yml
	|--.env.example / .dockerignore / .gitignore / .gitattributes
	|--README.md
	|--CLAUDE.md             ← instruções do Claude Code; importa vault/_Financeiro.md
```

## Pastas

- `backend/app/routers/`: endpoints REST. Ver [[Routers (Financeiro)|Routers]].
- `backend/app/services/`: regras financeiras. Ver [[!Modulo Services (Financeiro)|!Modulo Services]].
- `backend/app/providers/`: integrações externas. Ver [[!Modulo Providers (Financeiro)|!Modulo Providers]].
- `backend/app/models.py`, `db.py` e `migrations/`: persistência. Ver [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]].
- `frontend/`: interface. Ver [[!Modulo Frontend (Financeiro)|!Modulo Frontend]].
- `infra/`, `scripts/`, `Dockerfile` e `docker-compose.yml`: implantação. Ver [[!Modulo Infra (Financeiro)|!Modulo Infra]].
- `.gitattributes` força LF em todos os arquivos texto, senão os `.sh` quebram no Linux quando o projeto é editado no Windows.

---
**Projeto Pai:** [[_Financeiro]]
