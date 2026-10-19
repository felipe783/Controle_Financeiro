# Sobre os Arquivos

Os routers ficam em `backend/app/routers/`. Cada um cria um `APIRouter(dependencies=[Depends(current_user)])`, então **nenhuma rota de dados funciona sem sessão**. Eles só traduzem HTTP ↔ serviços; a regra fica em [[!Modulo Services (Financeiro)|!Modulo Services]].

## `finance.py`

| Rotas | Função |
|---|---|
| `GET/POST /accounts`, `PUT/DELETE /accounts/{id}`, `POST /accounts/{id}/reconcile` | contas com saldo e pendências; conciliação |
| `GET/POST /categories`, `PUT/DELETE /categories/{id}` | categorias e subcategorias (as de sistema são protegidas) |
| `GET /transactions` (filtros, busca, ordenação, paginação), `GET/POST/PUT/DELETE /transactions/{id}`, `POST /transactions/{id}/duplicate` | receitas e despesas |
| `POST /transactions/bulk/settle` (`ids`, `settle_date` opcional), `POST /transactions/bulk/delete` (`ids`) | ações em lote da tela Lançamentos: até 500 ids, **tudo ou nada**; cada id passa por `get_or_404` (id alheio = 404) e só aceita receita/despesa comum (transferência, investimento ou ajuste = 409). Os já efetivados são ignorados no `settle`. Adicionado em 2026-10-19 |
| `GET /transactions/export`, `POST /transactions/import/preview`, `POST /transactions/import/commit` | [[CSV (Financeiro)|CSV]] (upload até 2 MB) |
| `POST /transfers`, `GET/PUT/DELETE /transfers/{transfer_id}` | transferências |
| `GET/POST /recurrences`, `PUT /recurrences/{id}`, `POST /recurrences/{id}/stop`, `POST /recurrences/generate` | recorrências |

## `invest.py`

| Rotas | Função |
|---|---|
| `GET /portfolio` | carteira com indicadores por ativo e totais |
| `POST /assets`, `GET/PUT/DELETE /assets/{id}` | ativos (excluir só sem operações) |
| `GET/POST /operations`, `PUT/DELETE /operations/{id}` | operações de investimento |
| `GET/POST /assets/{id}/quotes`, `DELETE /quotes/{id}` (só manual) | histórico e cotação manual |
| `POST /quotes/update`, `GET /quotes/status` | atualização manual e status/logs dos provedores |
| `GET/POST /fx` | câmbio |

## `users.py`

Router com `dependencies=[Depends(auth.require_admin)]`: usuário comum recebe **403** em todas as rotas.

| Rotas | Função |
|---|---|
| `GET /users` | lista usuários (sem hash de senha) |
| `POST /users` | cria usuário (`username` 3–64 de `A-Za-z0-9._-`, senha ≥ 12, `is_admin`); duplicata sem diferenciar maiúsculas → 409; criação e auditoria na mesma transação |
| `PUT /users/{id}` | `is_admin`/`is_active`; não deixa remover o próprio acesso nem ficar sem admin ativo (contagem com `FOR UPDATE`); desativar apaga as sessões |

## `planning.py`

| Rotas | Função |
|---|---|
| `GET /dashboard?period=month\|3m\|6m\|year\|custom` | painel ([[Relatórios (Financeiro)|Relatórios]]) |
| `GET /networth`, `GET /networth/history`, `POST /networth/snapshot` | [[Patrimônio (Financeiro)|Patrimônio]] |
| `POST /liabilities`, `PUT/DELETE /liabilities/{id}`, `GET/POST /liabilities/{id}/balances` | dívidas e histórico de saldo |
| `GET/PUT /budgets`, `POST /budgets/copy`, `DELETE /budgets/{id}` | orçamentos |
| `GET/POST /goals`, `PUT/DELETE /goals/{id}`, `GET/POST /goals/{id}/contributions`, `DELETE .../{cid}` | metas |
| `GET /forecast?days=N`, `GET /audit` | previsão e auditoria; cada registro da auditoria traz `label` (descrição, nome ou ticker tirado do próprio snapshot) para a tela Histórico |

## Período do painel

````python
def period_range(period: str, start: dt.date | None, end: dt.date | None) -> tuple[dt.date, dt.date]:
    today = dt.date.today()
    first = today.replace(day=1)
    month_end = networth.month_end(first)
    if period == "custom":
        if not start or not end or start > end:
            raise DomainError("Informe um período personalizado válido.")
        if (end - start).days > 3660:
            raise DomainError("Período máximo de 10 anos.")
        return start, end
    if period == "3m":
        y, m = divmod(first.month - 3, 12)
        return dt.date(first.year + y, m + 1, 1), month_end
    if period == "6m":
        y, m = divmod(first.month - 6, 12)
        return dt.date(first.year + y, m + 1, 1), month_end
    if period == "year":
        return dt.date(today.year, 1, 1), dt.date(today.year, 12, 31)
    return first, month_end
````

Para a comparação do painel, `previous_range` devolve o período imediatamente anterior de mesmo tamanho. Nos períodos de meses inteiros recua o mesmo número de **meses** (o anterior a março é fevereiro inteiro, não "31 dias antes"); no personalizado, recua o mesmo número de dias. Coberto por `tests/test_interface_api.py::test_previous_range`.

> [!success] Corrigido em 2026-10-18
> O fim do mês usava `month_ends(first, first)[0]`, que devolvia o próprio dia 1, então "mês atual" virava 01–01. Agora usa `networth.month_end`. O teste de regressão é `test_current_month_covers_whole_month`.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo API (Financeiro)|!Modulo API]]
