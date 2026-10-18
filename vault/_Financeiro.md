---
Tipo: projeto
Projeto: "Financeiro"
Status: ativo
Stack: [Python, FastAPI, SQLAlchemy, Alembic, PostgreSQL, React, TypeScript, Vite, Tailwind, Recharts, Docker, Nginx]
Codigo: "Financeiro"
Repositorio: ""
Atualizado: "2026-10-18"
---
# Financeiro

Sistema de gestão financeira pessoal: contas, receitas e despesas, transferências, investimentos com cotações
automáticas e manuais, patrimônio consolidado com snapshots, orçamentos e metas. Implantação em servidor
Linux com Docker Compose e scripts Bash.

- **Código:** raiz deste repositório; a documentação fica em `vault/`, no `README.md` e em `docs/METODOLOGIA.md`
- **Entrada:** lançamentos do usuário (interface web ou CSV) e cotações (brapi, Alpha Vantage, PTAX/BCB)
- **Saída:** painel, relatórios, CSV e backups `pg_dump`

## Status

| Funcionalidade | Estado |
|---|---|
| Backend: regras financeiras, API e autenticação | [CONFIRMADO] 2026-10-18: 62 testes pytest passam em PostgreSQL 16 local |
| Frontend: React | [CONFIRMADO] 2026-10-18: `tsc`, `vitest` e `vite build` passam; telas navegadas com dados reais no navegador do app |
| Docker: imagens e Compose | [NÃO VERIFICADO] o daemon Docker não estava disponível; só `docker compose config` foi validado |
| Scripts Bash | [CONFIRMADO] `bash -n` e ShellCheck sem avisos; caminhos de erro executados. Execução com Docker: [NÃO VERIFICADO] |
| Backup e restauração | [CONFIRMADO] SQL de `backup.sh`/`restore.sh` executado num PostgreSQL de teste isolado; via containers: [NÃO VERIFICADO] |

## Como rodar

```bash
./scripts/install.sh     # servidor Linux com Docker: cria .env, build, migrações, sobe, cria admin
./scripts/status.sh
```

Testes (exigem um banco PostgreSQL com "test" no nome):

```powershell
cd backend; $env:TEST_DATABASE_URL="postgresql+psycopg://postgres@127.0.0.1:55432/financeiro_test"; ..\.venv\Scripts\python -m pytest -q
```

> Verificado em 2026-10-18: testes do backend e do frontend, build do frontend e app rodando localmente
> (uvicorn + Vite). Não verificado: construção das imagens e subida do Compose.

## Mapa das notas

- Como instalar, operar e diagnosticar: `README.md` do repositório.
- Fórmulas de saldo, patrimônio, preço médio, TIR e câmbio: `docs/METODOLOGIA.md`.

## Problemas conhecidos

- [NÃO VERIFICADO] 2026-10-18: imagens Docker nunca foram construídas. Rode `./scripts/install.sh` num host
  com Docker e confira `docker compose ps`.
- [CONFIRMADO] 2026-10-18: o repositório remoto no GitHub (privado) ainda não existe, porque o `gh` não está
  autenticado nesta máquina.

## Decisões

- Saldo nunca é armazenado: é recalculado (saldo inicial + efetivados até hoje). Elimina corridas e saldo
  desatualizado.
- Cada operação de investimento gera no máximo um lançamento de caixa (FK única). É assim que o provento não
  é contado duas vezes.
- Custo pelo preço médio. TIR só com 30 dias ou mais de histórico. Snapshots preservam as cotações do dia.
- O worker é um serviço separado, com advisory lock do PostgreSQL mantido numa **conexão dedicada** (o
  Session do SQLAlchemy devolve a conexão ao pool a cada commit e perderia o lock).
- O banco usa dois usuários: a aplicação conecta sem superusuário, e a senha do `postgres` só existe no
  container do banco (o Compose usa uma lista explícita de variáveis, sem `env_file`).
- Compose com rede `internal: true` só para o banco. API e worker precisam também de uma rede com saída,
  senão não alcançam os provedores de cotação.

## Próximos passos

1. Construir e subir no Docker (`install.sh`) e validar persistência ao recriar containers e o ciclo
   `backup.sh`/`restore.sh`.
2. Autenticar o `gh` e publicar o repositório privado.
3. Colocar HTTPS (Caddy) antes de expor na internet.
