# Sobre os Arquivos

Scripts Bash em `scripts/`. Todos usam `#!/usr/bin/env bash`, `set -Eeuo pipefail` e carregam `lib.sh`, que resolve a raiz do projeto pelo caminho do próprio script. Por isso funcionam de qualquer diretório. Mensagens em português e código de saída ≠ 0 em erro.

| Script | O que faz |
|---|---|
| `lib.sh` | `dc` (compose com `--project-directory`/`--env-file`), `require_docker`, `env_get`/`env_set` (lê o `.env` **sem executá-lo**), `validate_env`, `wait_healthy`, `api_health_via_proxy`, `local_url` |
| `install.sh [--port N] [--bind IP] [--yes]` | verifica SO/Docker/Compose; cria `.env` só se não existir, com `openssl rand -hex 24`; valida a porta e conflitos; `backups/` com permissão 700; deploy; oferece criar o admin |
| `deploy.sh [--no-build]` | valida arquivos e `.env`, `compose config`, build, sobe `db`, roda `migrate` (para se falhar), sobe tudo, espera os healthchecks e confere `/api/health` **pelo Nginx** |
| `update.sh [--no-pull]` | recusa se houver alterações locais versionadas; `git pull --ff-only`; backup preventivo; deploy |
| `backup.sh [DESTINO]` | `pg_dump -Fc --no-owner --no-privileges` com o banco rodando; valida com `pg_restore --list`; permissão 600; retenção `BACKUP_RETENTION_DAYS` (padrão 30, 0 desliga) |
| `restore.sh ARQUIVO [--yes]` | valida o arquivo; exige digitar `RESTAURAR`; backup preventivo **sem retenção**; para a aplicação; recria o banco; `pg_restore --role=<app>`; redeploy (migra se preciso); conta registros |
| `status.sh` | containers, saúde, porta, API pelo proxy, `pg_isready`, `app.cli status`, `docker stats` |
| `logs.sh [api\|worker\|web\|db\|migrate] [-f] [--tail N]` | `docker compose logs` com timestamps |
| `stop.sh` | `docker compose stop` (não remove containers, volumes nem configuração) |
| `create-admin.sh [USUÁRIO]` / `--reset USUÁRIO` | cria um **administrador** ou troca senha via `app.cli`, com a senha digitada sem eco; os demais usuários são criados pela tela Usuários |

Nenhum script executa `docker compose down -v`, `git reset --hard`, regras de firewall ou instalação do Docker.

> [!success] Corrigido em 2026-10-18
> O backup preventivo do `restore.sh` aplicava a retenção e podia apagar o próprio dump a restaurar, deixando o banco vazio. Agora o arquivo é aberto antes (`exec 3<"$FILE"`) e o preventivo roda com `BACKUP_RETENTION_DAYS=0`.

> [!note] Verificado em 2026-10-18
> `bash -n` e ShellCheck 0.11 sem avisos. Executados os caminhos de erro (sem `.env`, Docker indisponível, serviço ou arquivo inválido) e as funções de `.env`. O SQL de `init-app-user.sh`, `backup.sh` e `restore.sh` foi executado num PostgreSQL 16 isolado. Execução real contra containers: **não verificada**.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Infra (Financeiro)|!Modulo Infra]]
