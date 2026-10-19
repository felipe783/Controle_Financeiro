# Dependências

Versões fixadas em `backend/requirements.txt`, `frontend/package.json` (com `package-lock.json`) e nas imagens do `Dockerfile`/`docker-compose.yml`.

## Backend (Python 3.14)

[**FastAPI**](https://fastapi.tiangolo.com/) `0.146.0` + **Starlette** `1.9.0`
Framework da API: rotas, validação automática com Pydantic e injeção de dependências (sessão de banco, usuário logado).

[**Uvicorn**](https://uvicorn.dev/) `0.54.0`
Servidor ASGI. No container roda com 1 processo, `--proxy-headers` e `--no-server-header`.

[**SQLAlchemy**](https://docs.sqlalchemy.org/) `2.1.5`
ORM e consultas parametrizadas. Usa `Mapped[...]` tipado e `insert ... on_conflict` do dialeto PostgreSQL.

[**Alembic**](https://alembic.sqlalchemy.org/) `1.20.0`
Migrações versionadas (`backend/migrations/versions`). Ver [[Migrações (Financeiro)|Migrações]].

[**Pydantic**](https://docs.pydantic.dev/) `2.14.1` + **pydantic-settings** `2.16.0`
Contratos da API (`schemas.py`) e leitura das variáveis de ambiente (`config.py`).

[**psycopg**](https://www.psycopg.org/psycopg3/) `3.3.6` (binary)
Driver do PostgreSQL.

[**httpx**](https://www.python-httpx.org/) `0.28.1`
Cliente HTTP dos provedores de cotação. Nos testes, `httpx.MockTransport` simula as respostas.

[**argon2-cffi**](https://argon2-cffi.readthedocs.io/) `25.1.0`
Hash de senhas (Argon2id).

[**python-multipart**](https://pypi.org/project/python-multipart/) `0.0.32`
Upload do CSV (`multipart/form-data`).

[**tzdata**](https://pypi.org/project/tzdata/) `2026.5`
Base de fusos para `zoneinfo` (o Windows não tem uma).

[**pytest**](https://docs.pytest.org/) `9.1.1` (só em `requirements-dev.txt`)

````
pip install -r backend/requirements-dev.txt
````

## Frontend (Node 22+)

| Pacote | Versão | Uso |
|---|---|---|
| [React](https://react.dev/) / react-dom | 18.3.1 | interface |
| [react-router-dom](https://reactrouter.com/) | 6.28.1 | rotas das páginas |
| [@tanstack/react-query](https://tanstack.com/query) | 5.62.8 | cache e recarga após alterações |
| [Recharts](https://recharts.org/) | 3.10.1 | gráficos |
| [@radix-ui/react-dialog](https://www.radix-ui.com/) | 1.1.4 | folhas laterais e diálogos acessíveis (foco, Esc) |
| [@radix-ui/react-dropdown-menu](https://www.radix-ui.com/) | 2.1.4 | menu "⋯" de ações por linha, navegável por teclado |
| [lucide-react](https://lucide.dev/) | 0.460.0 | ícones SVG |
| [@fontsource/ibm-plex-sans](https://fontsource.org/) | 5.1.0 | fonte do corpo, empacotada pelo Vite (a CSP do Nginx só aceita `font-src 'self'`) |
| [@fontsource-variable/archivo](https://fontsource.org/fonts/archivo) | 5.3.0 | títulos e números (eixos de peso e largura); substituiu o IBM Plex Sans Condensed em 2026-10-19 |
| [motion](https://motion.dev/) | 12.23.24 | sistema de movimento: folhas, menus, transição de página, contagem dos números, mural (2026-10-19; a 14.x tinha saído no mesmo dia) |
| [Tailwind CSS](https://tailwindcss.com/) | 3.4.17 | estilos, tema escuro por classe |
| [Vite](https://vite.dev/) | 6.0.7 | build e servidor de desenvolvimento |
| [TypeScript](https://www.typescriptlang.org/) | 5.7.2 | tipagem (`strict`) |
| [Vitest](https://vitest.dev/) | 2.1.8 | testes |

````
cd frontend && npm ci
````

> Não há biblioteca de formulários: os campos usam validação HTML nativa, e o backend valida de novo e devolve mensagens em português.

## Imagens Docker

| Imagem | Uso |
|---|---|
| `python:3.14.8-slim-trixie` | alvo `api` (API, worker e migrate) |
| `node:22.23.3-alpine3.23` | estágio de build do React |
| `nginx:1.30.6-alpine` | alvo `web` (linha estável do Nginx) |
| `postgres:17.9-alpine3.23` | serviço `db` |

As tags foram conferidas no Docker Hub em 2026-10-18.

## Serviços externos (opcionais)

Ver [[!Modulo Providers (Financeiro)|!Modulo Providers]]: brapi.dev (`BRAPI_TOKEN`), Alpha Vantage (`ALPHAVANTAGE_API_KEY`) e PTAX do Banco Central (sem chave).

---
**Projeto Pai:** [[_Financeiro]]
