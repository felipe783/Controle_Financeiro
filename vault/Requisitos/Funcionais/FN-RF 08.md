# Implantação com Docker

- **Implantação:** num servidor Linux com Docker, o usuário configura o `.env` e executa um único script (`install.sh`).
- **Compose:** `db`, `migrate`, `api`, `worker` e `web`. Só o `web` publica porta (`APP_BIND:APP_PORT` → 8080). O PostgreSQL fica em rede interna, com volume nomeado.
- **Scripts:** instalação, deploy, atualização, backup, restauração, status, logs, parada e criação de usuário. São idempotentes, não fazem nada destrutivo sem confirmação e nunca removem volumes.
- **Health checks reais:** `/api/health` testa o banco e a versão das migrações, e o deploy só declara sucesso verificando pelo Nginx.

**Implementação:** [[!Modulo Infra (Financeiro)|!Modulo Infra]] · [[Docker Compose (Financeiro)|Docker Compose]] · [[Scripts (Financeiro)|Scripts]].

> [!warning] Não verificado em 2026-10-18
> As imagens não foram construídas (sem daemon Docker). Foram validados `docker compose config`, a sintaxe e o ShellCheck dos scripts, e o SQL de inicialização, backup e restauração num PostgreSQL local.

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
