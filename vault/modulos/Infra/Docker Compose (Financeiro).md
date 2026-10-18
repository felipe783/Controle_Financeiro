# Sobre os Arquivos

O `Dockerfile` da raiz tem **dois alvos finais**:
- `api`: `python:3.14.8-slim-trixie`, `tzdata` do sistema, usuário `app` (uid 10001), `uvicorn` como PID 1 na forma exec;
- `web`: build do React em `node:22.23.3-alpine3.23`, servido por `nginx:1.30.6-alpine`.

Nenhum segredo entra no build.

## Serviços (`docker-compose.yml`)

| Serviço | Imagem/alvo | Papel | Redes | Healthcheck |
|---|---|---|---|---|
| `db` | `postgres:17.9-alpine3.23` | dados no volume `pgdata`; `init-app-user.sh` na 1ª inicialização | `internal` | `pg_isready` |
| `migrate` | `api` | `alembic upgrade head` e sai | `internal` | — |
| `api` | `api` | FastAPI | `internal`, `egress` | `GET /api/health` |
| `worker` | `api` | `python -m app.worker` | `internal`, `egress` | `python -m app.cli worker-health` |
| `web` | `web` | Nginx; **único com porta publicada** `${APP_BIND:-0.0.0.0}:${APP_PORT:-8080}:8080` | `internal`, `egress` | `GET /healthz` |

- `internal` tem `internal: true`: o banco não tem rota para fora. `egress` permite que API e worker alcancem os provedores de cotação.
- Os containers da aplicação usam `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]` e `no-new-privileges`. Logs em `json-file`, 10 MB × 5 arquivos.
- `api`, `worker` e `migrate` recebem uma **lista explícita** de variáveis (sem `env_file`). Assim, `POSTGRES_SUPERUSER_PASSWORD` só chega ao `db`.
- O banco tem dois usuários: `postgres` (superusuário, só no container) e `POSTGRES_USER` (aplicação, sem superusuário, dono do banco), criado por `init-app-user.sh`.

## Nginx (`infra/nginx/default.conf`)

- **Rotas:** `/api/` faz proxy para `api:8000`, sobrescrevendo `X-Forwarded-For` com `$remote_addr`, o que impede falsificar o IP do bloqueio de login. Rotas do React caem em `index.html`.
- **Cabeçalhos:** CSP (`script-src 'self'`), `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy no-referrer`, `server_tokens off`. O HSTS está comentado, para ser ativado com HTTPS.
- **Cache:** é controlado com `expires`, não com `add_header`, porque um `add_header` dentro de `location` anularia os cabeçalhos de segurança herdados do `server`.

> [!note] Verificado em 2026-10-18
> `docker compose config` resolveu a configuração com um `.env` de teste:
> - `APP_PORT=9090` virou `published: "9090"`;
> - só o `web` publica porta;
> - a senha de superusuário apareceu apenas no `db`.
>
> `docker build` e `docker compose up` **não** foram executados (sem daemon Docker).


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Infra (Financeiro)|!Modulo Infra]]
