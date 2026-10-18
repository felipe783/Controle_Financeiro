# Sobre o Arquivo

`backend/app/services/investments.py` calcula **posição, avaliação e rentabilidade**, grava as operações e sincroniza o caixa. A metodologia completa está em `docs/METODOLOGIA.md`.

Responsabilidades:
- reprocessar o histórico em ordem (`compute_position`) pelo **preço médio**;
- recusar qualquer operação (inclusive uma edição antiga) que deixe a quantidade negativa;
- avaliar o ativo (`valuation`) pela cotação vigente, pelo valor total informado ou, sem cotação, pelo custo, sempre sinalizado;
- separar o efeito do ativo e o efeito cambial para ativos em moeda estrangeira;
- calcular a TIR (`xirr`), só com 30 dias ou mais de histórico;
- manter **exatamente um** lançamento de caixa por operação (`_sync_cash`).

# Funcionalidades

## Efeito no caixa

````python
def cash_effect(asset: Asset, op: InvestmentOperation) -> tuple[str, Decimal] | None:
    """(tipo de lançamento, valor em BRL) que a operação gera na conta, ou None."""
    if op.kind == "adjustment" or (op.kind == "income" and op.income_status != "received"):
        return None
    fx = _fx(asset, op)
    q, p = op.quantity or ZERO, op.unit_price or ZERO
    gross = op.gross_amount or ZERO
    if op.kind == "buy":
        kind, value = "investment_out", money((q * p + op.fees) * fx)
    elif op.kind == "sell":
        kind, value = "investment_in", money((q * p - op.fees) * fx)
    elif op.kind == "income":
        kind, value = "income", money((gross - op.taxes) * fx)
    elif op.kind == "fee":
        kind, value = "expense", money(gross * fx)
    elif op.kind == "amortization":
        kind, value = "investment_in", money((gross - op.taxes) * fx)
    else:
        return None
    if value <= 0:
        raise DomainError("O valor líquido em caixa da operação deve ser maior que zero "
                          "(confira preço, taxas e impostos, ou registre sem conta).")
    return kind, value
````

## Prioridade das cotações

````python
def effective_quote(db: Session, asset_id: int, as_of: dt.date | None = None) -> Quote | None:
    """Política de prioridade: maior data de referência; empate → manual vence; depois a mais recente."""
    q = select(Quote).where(Quote.asset_id == asset_id)
    if as_of:
        q = q.where(Quote.reference_date <= as_of)
    q = q.order_by(Quote.reference_date.desc(), (Quote.source == "manual").desc(), Quote.received_at.desc())
    return db.scalars(q.limit(1)).first()
````

## Sincronização com o caixa

````python
def _sync_cash(db: Session, asset: Asset, op: InvestmentOperation) -> None:
    """Mantém exatamente um lançamento de caixa por operação (ou nenhum)."""
    tx = db.scalar(select(Transaction).where(Transaction.investment_operation_id == op.id))
    effect = cash_effect(asset, op) if op.account_id else None
    if effect is None:
        if tx is not None:
            db.delete(tx)
        return
    kind, amount = effect
    acc = get_or_404(db, Account, op.account_id, "Conta")
    if op.date < acc.initial_balance_date:
        raise DomainError(f"A data da operação é anterior ao saldo inicial da conta '{acc.name}'.")
    if tx is None:
        tx = Transaction(investment_operation_id=op.id)
        db.add(tx)
    tx.kind, tx.amount, tx.status = kind, amount, "settled"
    tx.date = tx.settle_date = op.date
    tx.account_id = op.account_id
    tx.description = f"{OP_LABEL[op.kind]} {asset.ticker or asset.name}"
    tx.category_id = (_system_category(db, "Proventos", "income") if kind == "income"
                      else _system_category(db, "Taxas de investimento", "expense") if kind == "expense" else None)
    tx.origin = asset.ticker or asset.name if kind == "income" else None
````

- O provento vai para a categoria de sistema **Proventos**, e a taxa avulsa para **Taxas de investimento**. As duas são criadas pela migração 0001.
- `save_operation` trava o ativo com `SELECT ... FOR UPDATE`, então duas vendas simultâneas não passam da posição.

> [!note] Verificado em 2026-10-18
> Testes em `tests/test_investments.py`: preço médio e realizado, edição histórica recalculando tudo, venda acima da posição (inclusive editando o passado), provento contado uma vez, caixa da corretora sem dupla contagem, XIRR, componentes de câmbio, prioridade e defasagem de cotações, avaliação total de renda fixa.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
