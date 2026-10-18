# CLAUDE.md — Financeiro

Sistema de **gestão financeira pessoal**: backend **FastAPI + SQLAlchemy 2 + Alembic** sobre **PostgreSQL**, frontend **React + TypeScript (Vite)** e implantação com **Docker Compose + Nginx** e scripts Bash. Contas, lançamentos, transferências, investimentos com cotações automáticas e manuais, patrimônio com snapshots, orçamentos e metas.

O perfil do autor e as preferências gerais estão no `CLAUDE.md` de `!Faculdade`. Este arquivo trata só do que é específico deste repositório.

## Documentação (fonte de verdade)

O índice abaixo é carregado em toda sessão. As notas detalhadas ficam em `vault/` e devem ser lidas **sob demanda**:

@vault/_Financeiro.md

| Assunto | Nota |
|---|---|
| Regras financeiras e fluxos | `vault/Requisitos/Resumo Principal (Financeiro).md` |
| Requisitos funcionais | `vault/Requisitos/Funcionais/FN-RF 01.md` … `FN-RF 08.md` |
| Rotas, autenticação e CSRF | `vault/modulos/API/` |
| Saldos, investimentos, cotações, patrimônio, relatórios, CSV | `vault/modulos/Services/` |
| Provedores de cotação | `vault/modulos/Providers/!Modulo Providers (Financeiro).md` |
| Tabelas, restrições e migrações | `vault/modulos/Persistencia/` |
| Páginas e componentes React | `vault/modulos/Frontend/!Modulo Frontend (Financeiro).md` |
| Docker, Nginx, scripts, worker e CLI | `vault/modulos/Infra/` |

Fórmulas (saldo, preço médio, TIR, câmbio, patrimônio): `docs/METODOLOGIA.md`. Operação do servidor: `README.md`.

Conceitos transversais: `E:/Downloads/!Faculdade/Contexto Projetos/Conhecimento/_Conhecimento.md`, lido sob demanda.

## Comandos

```powershell
# testes do backend: exigem um PostgreSQL; o nome do banco precisa conter "test" (o schema é recriado)
cd backend; $env:TEST_DATABASE_URL="postgresql+psycopg://postgres:SENHA@127.0.0.1:5432/financeiro_test"; ..\.venv\Scripts\python -m pytest -q

cd frontend; npm test; npm run typecheck; npm run build

# servidor Linux com Docker
./scripts/install.sh   # depois: deploy.sh, status.sh, logs.sh, backup.sh, restore.sh
```

**Peça autorização antes de instalar dependências.**

## Regras deste projeto

- **Dinheiro é `Decimal`**, nunca `float`: `Numeric(18,2)` para dinheiro e `Numeric(24,8)` para quantidade e preço (`app/money.py`). A API trafega valores como **texto decimal**.
- **Saldo nunca é armazenado.** É calculado em `ledger.balances` (saldo inicial + lançamentos `settled` até a data). Não crie colunas de saldo.
- **Receita e despesa** são só `kind in ('income','expense')` efetivados. Transferência, ajuste e `investment_in/out` nunca entram nesses totais.
- **Operação de investimento ↔ caixa é 1:1** (`transactions.investment_operation_id UNIQUE`, sincronizado por `investments._sync_cash`). Não crie lançamentos de caixa de investimento por outro caminho.
- **Nunca invente preço:** sem cotação, avalie pelo custo e sinalize. Cotações nunca são apagadas por atualizações (prioridade em `effective_quote`).
- **Toda alteração de schema** passa por uma nova versão Alembic, e `alembic check` não pode mostrar diferença. Em modelos, anote datas com `dt.date`: um atributo chamado `date` sombreia o tipo.
- **Advisory locks** ficam numa conexão dedicada, nunca na `Session` (que devolve a conexão ao pool a cada commit).
- **Segredos:** nunca leia `.env`. `api`, `worker` e `migrate` recebem uma lista explícita de variáveis no Compose: ao criar uma variável nova, inclua-a lá e no `.env.example` (com valor vazio ou fictício).
- **Scripts:** nada destrutivo sem confirmação; nunca `docker compose down -v`. Os arquivos ficam em LF (`.gitattributes`). Valide com `bash -n` e ShellCheck.

## Armadilhas conhecidas

Estão em **Problemas conhecidos** do índice importado acima (`vault/_Financeiro.md`), que é a única lista mantida.

## Manter a documentação

Ao alterar comportamento, atualize na mesma tarefa:
1. `vault/_Financeiro.md`: **Status**, **Problemas conhecidos** e `Atualizado` no frontmatter.
2. A nota do módulo afetado (tabela acima) e, se mudar uma regra ou fluxo, o `Resumo Principal (Financeiro)` e o `docs/METODOLOGIA.md`.
3. `vault/Estrutura (Financeiro).md`, se arquivos forem criados, movidos ou removidos.
4. O `README.md`, se mudarem comandos, variáveis ou operação.

Convenções do vault (o mesmo do Obsidian em `Contexto Projetos/Financeiro`, via junction):
- Frontmatter: siga a tabela de **Convenções** em `E:/Downloads/!Faculdade/Contexto Projetos/Contexto Geral.md`.
- Nomes de nota únicos no vault inteiro: notas genéricas levam `(Financeiro)`; requisitos usam `FN-RF NN`.
- Separe o que foi **executado** do que foi **lido no código**, com data. Depois de mudar notas, rode `python scripts/validar_vault.py` a partir de `Contexto Projetos`.
