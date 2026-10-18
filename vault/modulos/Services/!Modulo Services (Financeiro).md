O módulo **Services** (`backend/app/services/`) concentra as **regras financeiras**. Os serviços recebem uma `Session` do SQLAlchemy e dados já validados, aplicam as regras, gravam a auditoria e fazem **um commit por operação de negócio**: ou tudo é gravado, ou nada. Não conhecem HTTP.

| Arquivo | Nota | Responsabilidade |
|---|---|---|
| `ledger.py` | [[Ledger (Financeiro)|Ledger]] | saldos, receitas/despesas, transferências, conciliação, recorrências |
| `investments.py` | [[Investimentos (Financeiro)|Investimentos]] | posição pelo preço médio, avaliação, câmbio, XIRR, operações, cotação manual |
| `quotes.py` | [[Cotações (Financeiro)|Cotações]] | atualização automática/manual de cotações e câmbio, com lock e logs |
| `networth.py` | [[Patrimônio (Financeiro)|Patrimônio]] | consolidação, snapshots e histórico |
| `reports.py` | [[Relatórios (Financeiro)|Relatórios]] | painel, orçamentos, metas, previsão |
| `csv_io.py` | [[CSV (Financeiro)|CSV]] | importação com pré-visualização e exportação |
| `common.py` | — | `DomainError`/`NotFound`/`Conflict`, `get_or_404`, `snapshot()` e `audit()` |

Dependências: `models.py` e `money.py` ([[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]), e `providers/` só em `quotes.py`.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
