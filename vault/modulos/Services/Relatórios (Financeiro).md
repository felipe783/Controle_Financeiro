# Sobre o Arquivo

`backend/app/services/reports.py` é **somente leitura**: monta o painel, os orçamentos, as metas e a previsão a partir dos dados persistidos. Não faz chamadas externas.

Responsabilidades:
- **painel** (`dashboard`): indicadores do período, `previous` (receitas, despesas e resultado do período anterior, para a comparação na Visão geral), séries mensais, série diária (`daily`: uma linha por dia do período, inclusive os zerados, com os mesmos critérios das mensais; alimenta o mural do painel, adicionada em 2026-10-19), despesas por categoria (agrupando pela categoria-pai, com `category_id` da categoria-pai para o link aos lançamentos filtrados; `null` em "Sem categoria"), alocação por classe, histórico patrimonial, fluxos de investimento, contas a vencer em 7 dias e últimas movimentações;
- **orçamentos** (`budget_report`): gasto efetivado, comprometido, percentual e status `ok`, `warning` ou `exceeded`;
- **metas** (`goals_report`): aportes, progresso e valor mensal necessário até o prazo;
- **previsão** (`forecast`): saldo atual ± lançamentos não efetivados no horizonte.

# Funcionalidades

## Receitas e despesas por mês (regime de caixa)

````python
def monthly_series(db: Session, start: dt.date, end: dt.date) -> list[dict]:
    """Receitas e despesas efetivadas por mês (regime de caixa: data de efetivação).
    Transferências, ajustes e movimentações de investimento não entram."""
    y, m = extract("year", Transaction.settle_date), extract("month", Transaction.settle_date)
    rows = db.execute(
        select(y, m, Transaction.kind, func.sum(Transaction.amount))
        .where(Transaction.status == "settled", Transaction.kind.in_(ledger.CASH_FLOW_KINDS),
               Transaction.settle_date.between(start, end))
        .group_by(y, m, Transaction.kind)).all()
    data = {(int(a), int(b), k): Decimal(v) for a, b, k, v in rows}
    out = []
    for d in networth.month_ends(start, end):
        inc, exp = data.get((d.year, d.month, "income"), ZERO), data.get((d.year, d.month, "expense"), ZERO)
        out.append({"month": f"{d.year:04d}-{d.month:02d}", "income": inc, "expense": exp, "result": inc - exp})
    return out
````

A taxa de economia é `resultado / receitas`. Sem receitas, ela vem como `None` (exibida como "—"), e não como 0.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
