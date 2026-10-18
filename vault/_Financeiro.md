---
Tipo: projeto
Projeto: Financeiro
Status: ativo
Stack:
  - Python
  - FastAPI
  - SQLAlchemy
  - Alembic
  - PostgreSQL
  - React
  - TypeScript
  - Docker
  - Nginx
Codigo: "Financeiro"
Repositorio: ""
Atualizado: 2026-10-18
---
# Financeiro

Sistema de **gestão financeira pessoal**: contas, receitas e despesas, transferências, investimentos com cotações automáticas e manuais, patrimônio consolidado, orçamentos e metas. Implantação num servidor Linux com **Docker Compose** e scripts Bash.

- **Código:** raiz deste repositório. A documentação fica em `vault/`, no `README.md` e em `docs/METODOLOGIA.md`.
- **Entrada:** interface web (React) → API REST em `/api` (FastAPI), protegida por login. Importação CSV. Cotações vindas de brapi, Alpha Vantage e PTAX/BCB.
- **Saída:** painel com indicadores e gráficos, exportação CSV e backups `pg_dump`. Tudo é calculado a partir do PostgreSQL.

## Status

| Funcionalidade | Estado |
|---|---|
| Contas, receitas, despesas e transferências ([[FN-RF 01|RF 01]], [[FN-RF 02|RF 02]]) | Implementado |
| Recorrências e importação/exportação CSV ([[FN-RF 01|RF 01]]) | Implementado |
| Investimentos: operações, preço médio, TIR, câmbio ([[FN-RF 03|RF 03]], [[FN-RF 05|RF 05]]) | Implementado |
| Cotações automáticas e manuais ([[FN-RF 04|RF 04]]) | Implementado; provedores testados com respostas simuladas, sem chave real |
| Patrimônio, snapshots, painel e gráficos ([[FN-RF 06|RF 06]]) | Implementado |
| Orçamentos, metas e previsão ([[FN-RF 07|RF 07]]) | Implementado |
| Autenticação (usuário único, Argon2, sessão em cookie) | Implementado |
| Testes automatizados | 62 testes `pytest` e 3 `vitest` passando em 2026-10-18 |
| Docker Compose, Nginx e scripts ([[FN-RF 08|RF 08]]) | Implementado; imagens **nunca construídas** (sem daemon Docker na máquina de desenvolvimento) |
| Repositório remoto no GitHub (privado) | Pendente: `gh` não autenticado |

## Como rodar

```bash
./scripts/install.sh             # servidor com Docker: cria .env, build, migrações, sobe e oferece criar o admin
./scripts/status.sh              # estado dos serviços
./scripts/logs.sh api -f         # logs
```

Desenvolvimento e testes (exigem um PostgreSQL; o banco de teste precisa ter `test` no nome):

```bash
cd backend && TEST_DATABASE_URL=postgresql+psycopg://postgres:SENHA@127.0.0.1:5432/financeiro_test python -m pytest -q
cd frontend && npm test && npm run typecheck && npm run build
```

> Verificado em 2026-10-18 no Windows, com Python 3.14 e PostgreSQL 16 local:
> - `pytest` (62 passando), `tsc`, `vitest` e `vite build`;
> - o app rodou com `uvicorn` + Vite e foi navegado no navegador do app;
> - `bash -n` e ShellCheck nos scripts, e `docker compose config`.
>
> Não verificado: `docker build` e `docker compose up`.

## Mapa das notas

- [[Visão Geral (Financeiro)|Visão Geral]]: o que o sistema faz e como as camadas se ligam.
- [[Resumo Principal (Financeiro)|Resumo Principal]]: regras financeiras e fluxo de cada operação.
- [[Estrutura (Financeiro)|Estrutura]]: árvore de pastas e arquivos.
- [[Dependencias (Financeiro)|Dependencias]]: bibliotecas, imagens Docker e instalação.
- Requisitos: [[FN-RF 01|RF 01]] · [[FN-RF 02|RF 02]] · [[FN-RF 03|RF 03]] · [[FN-RF 04|RF 04]] · [[FN-RF 05|RF 05]] · [[FN-RF 06|RF 06]] · [[FN-RF 07|RF 07]] · [[FN-RF 08|RF 08]]
- Camadas:
  - [[!Modulo API (Financeiro)|!Modulo API]]: borda HTTP ([[Main (Financeiro)|Main]], [[Routers (Financeiro)|Routers]], [[Autenticação (Financeiro)|Autenticação]]).
  - [[!Modulo Services (Financeiro)|!Modulo Services]]: regras financeiras ([[Ledger (Financeiro)|Ledger]], [[Investimentos (Financeiro)|Investimentos]], [[Cotações (Financeiro)|Cotações]], [[Patrimônio (Financeiro)|Patrimônio]], [[Relatórios (Financeiro)|Relatórios]], [[CSV (Financeiro)|CSV]]).
  - [[!Modulo Providers (Financeiro)|!Modulo Providers]]: integrações de cotação (brapi, Alpha Vantage, PTAX).
  - [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]: [[Models (Financeiro)|Models]], [[Migrações (Financeiro)|Migrações]] e conexão.
  - [[!Modulo Frontend (Financeiro)|!Modulo Frontend]]: React, páginas e componentes.
  - [[!Modulo Infra (Financeiro)|!Modulo Infra]]: [[Docker Compose (Financeiro)|Docker Compose]], [[Scripts (Financeiro)|Scripts]], [[Worker e CLI (Financeiro)|Worker e CLI]].
- Fórmulas completas (saldo, preço médio, TIR, câmbio, patrimônio): `docs/METODOLOGIA.md` no repositório.

## Problemas conhecidos

Revisados em 2026-10-18.

- [NÃO VERIFICADO] As imagens Docker nunca foram construídas e o `docker compose up` nunca rodou. No primeiro `install.sh` num host com Docker, confira `docker compose ps` e o ciclo `backup.sh`/`restore.sh`.
- [PROVÁVEL] `backup.sh` e `restore.sh` usam `psql`/`pg_dump -U postgres` pelo socket local do container, sem senha. Isso depende de o pg_hba da imagem oficial aceitar conexões locais (`trust`). O SQL dos scripts foi testado num PostgreSQL local, não no container.
- [CONFIRMADO] O bloqueio de login (5 tentativas → 15 min) fica na memória do processo da API e zera quando ela reinicia (ver [[Autenticação (Financeiro)|Autenticação]]).
- [CONFIRMADO] `frontend/tsconfig.tsbuildinfo` (artefato do `tsc -b`) está versionado; deveria estar no `.gitignore`.
- [CONFIRMADO] O repositório remoto no GitHub (privado) ainda não existe.

> [!success] Corrigidos em 2026-10-18 (verificado com `pytest`; os testes de regressão falhavam no código anterior)
> - O "mês atual" do painel terminava no dia 1 (`month_ends(first, first)`). Agora usa `networth.month_end`.
> - `restore.sh` podia apagar, pela retenção do backup preventivo, o próprio arquivo a restaurar. Agora roda com `BACKUP_RETENTION_DAYS=0` e abre o arquivo antes.
> - Operação de investimento com caixa zero respondia 500 e agora responde 422. Amortização valida impostos ≤ valor bruto.
> - Uma compra com data futura reduzia o patrimônio. O saldo "atual" agora considera efetivações até hoje.
> - A edição de recorrência agora valida conta e categoria. Conta usada por recorrência ou operação não pode ser excluída (era 500).
> - CSV: `1.500` agora é lido como 1500, e o ciclo exportar/importar preserva textos com prefixo anti-fórmula e observações.

## Decisões

- **Saldo nunca é armazenado:** é recalculado (saldo inicial + lançamentos efetivados até hoje). Não existe saldo desatualizado nem corrida entre operações simultâneas.
- **Um lançamento de caixa por operação de investimento** (`transactions.investment_operation_id UNIQUE`). É isso que impede contar o provento duas vezes.
- **Custo pelo preço médio.** A TIR (XIRR) só aparece com 30 dias ou mais de histórico. Snapshots preservam as cotações do dia em que foram tirados.
- **O worker é um serviço separado** e segura um advisory lock do PostgreSQL numa **conexão dedicada**. O `Session` do SQLAlchemy devolve a conexão ao pool a cada commit, e o lock iria junto.
- **Dois usuários no banco:** a aplicação conecta sem superusuário, e a senha do `postgres` só existe no container `db` (o Compose usa uma lista explícita de variáveis, sem `env_file`).
- **Só o banco fica em rede `internal: true`.** API e worker também entram na rede `egress`, senão não alcançam os provedores de cotação.
- **Somente PostgreSQL, também nos testes:** o código depende de advisory locks, índices parciais e `ON CONFLICT`.

## Próximos passos sugeridos

1. Rodar `./scripts/install.sh` num host com Docker e validar a persistência ao recriar os containers e o ciclo de backup/restauração.
2. Autenticar o `gh` e publicar o repositório privado.
3. Colocar HTTPS (por exemplo, Caddy) com `COOKIE_SECURE=true` antes de expor na internet.
4. Tirar `frontend/tsconfig.tsbuildinfo` do Git.
