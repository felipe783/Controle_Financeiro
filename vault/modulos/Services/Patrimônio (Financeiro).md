# Sobre o Arquivo

`backend/app/services/networth.py` **consolida o patrimônio** e mantém seu histórico.

```
ativos   = saldo de todas as contas (inclusive o caixa da corretora) + valor dos investimentos
passivos = último saldo devedor de cada dívida até a data (liability_balances)
líquido  = ativos − passivos
```

- Comprar um ativo só troca caixa por posição; o patrimônio não muda.
- Metas não entram no patrimônio.
- Avisos de avaliação (sem cotação, sem câmbio, desatualizada) sobem para o painel em `warnings`.

# Funcionalidades

## Consolidação

````python
def compute(db: Session, as_of: dt.date | None = None) -> dict:
    bal = ledger.balances(db, as_of)
    accounts = {a.id: a for a in db.scalars(select(Account)).all()}
    cash_available = sum((v for k, v in bal.items() if accounts[k].type != "investment"), ZERO)
    cash_investment = sum((v for k, v in bal.items() if accounts[k].type == "investment"), ZERO)
    pf = investments.portfolio(db, as_of)
    lias = liabilities_at(db, as_of)
    liabilities = sum((l["balance"] for l in lias), ZERO)
    inv_value = pf["totals"]["market_value_brl"]
    gross = cash_available + cash_investment + inv_value
    warnings = sorted({f"{it['asset'].ticker or it['asset'].name}: {w}" for it in pf["items"]
                       for w in it["warnings"] if it["quantity"] or it["cost_brl"]})
    return {
        "as_of": as_of or dt.date.today(),
        "cash_available": money(cash_available),
        "cash_investment_accounts": money(cash_investment),
        "cash_total": money(cash_available + cash_investment),
        "investments_market_value": inv_value,
        "invested_cost": pf["totals"]["cost_brl"],
        "liabilities": money(liabilities),
        "gross": money(gross),
        "net": money(gross - liabilities),
        "portfolio": pf,
        "liability_items": lias,
        "warnings": warnings,
    }
````

## Snapshot diário

````python
def take_snapshot(db: Session) -> NetWorthSnapshot:
    """Registra o patrimônio de hoje com as avaliações disponíveis agora. Snapshots de dias anteriores
    são imutáveis; o de hoje pode ser atualizado ao longo do dia."""
    today = dt.date.today()
    nw = compute(db, today)
    values = dict(snapshot_date=today, cash=nw["cash_total"], investments=nw["investments_market_value"],
                  invested_cost=nw["invested_cost"], liabilities=nw["liabilities"], gross=nw["gross"],
                  net=nw["net"], details=_details(nw))
    stmt = pg_insert(NetWorthSnapshot).values(**values)
    db.execute(stmt.on_conflict_do_update(index_elements=["snapshot_date"],
                                          set_={**{k: v for k, v in values.items() if k != "snapshot_date"},
                                                "created_at": func.now()}))
    db.commit()
    return db.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.snapshot_date == today))
````

O snapshot de hoje pode ser atualizado ao longo do dia; os de dias anteriores nunca mudam. `history()` junta os snapshots com **estimativas** de fim de mês (`estimate=True`) calculadas por `compute(db, data)`, que usa só lançamentos, operações e cotações até aquela data.

> [!note] Verificado em 2026-10-18
> `test_snapshot_preserves_valuation_of_its_date`, `test_investment_account_cash_not_double_counted`, `test_liabilities_reduce_net_worth` e `test_future_dated_operation_does_not_shrink_net_worth`.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
