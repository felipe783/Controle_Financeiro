# Sobre o Arquivo

`backend/app/services/ledger.py` cuida de **contas, lançamentos, transferências, conciliação e recorrências**.

Responsabilidades:
- calcular saldos (nunca armazenados);
- criar, editar, duplicar e excluir receitas/despesas com validações e auditoria;
- transferir de forma atômica e manter as duas pernas sempre juntas;
- conciliar o saldo com um lançamento de ajuste;
- gerar recorrências de forma idempotente.

# Funcionalidades

## Saldos

Saldo = saldo inicial + soma assinada (`SIGNED_AMOUNT`, a partir de `TX_SIGN`) dos lançamentos **efetivados** com efetivação entre a data do saldo inicial e a data consultada (padrão: hoje).

````python
def balances(db: Session, as_of: dt.date | None = None) -> dict[int, Decimal]:
    """Saldo efetivado de todas as contas numa data (padrão: hoje; efetivações futuras ainda não contam)."""
    as_of = as_of or today()
    accounts = db.scalars(select(Account)).all()
    q = (
        select(Transaction.account_id, func.coalesce(func.sum(SIGNED_AMOUNT), 0))
        .join(Account, Account.id == Transaction.account_id)
        .where(Transaction.status == "settled", Transaction.settle_date >= Account.initial_balance_date,
               Transaction.settle_date <= as_of)
        .group_by(Transaction.account_id)
    )
    movements = dict(db.execute(q).all())
    out: dict[int, Decimal] = {}
    for a in accounts:
        if a.initial_balance_date > as_of:
            out[a.id] = ZERO
            continue
        out[a.id] = money(a.initial_balance + Decimal(movements.get(a.id, 0)))
    return out
````

## Transferência atômica

````python
def create_transfer(db: Session, data, user_id: int | None = None) -> str:
    """Débito e crédito na mesma transação de banco: ou os dois lados existem, ou nenhum."""
    src = _check_account(db, data.from_account_id)
    dst = _check_account(db, data.to_account_id)
    for acc in (src, dst):
        _check_settle_date(acc, data.date)
    tid = str(uuid.uuid4())
    desc = data.description or f"Transferência {src.name} → {dst.name}"
    legs = [
        Transaction(kind="transfer_out", account_id=src.id, transfer_id=tid),
        Transaction(kind="transfer_in", account_id=dst.id, transfer_id=tid),
    ]
    for leg in legs:
        leg.status = "settled"
        leg.description = desc
        leg.amount = data.amount
        leg.date = leg.settle_date = data.date
        leg.notes = data.notes
        db.add(leg)
    db.flush()
    audit(db, "transfer", None, "create", after={"transfer_id": tid, "legs": [snapshot(l) for l in legs]},
          user_id=user_id)
    db.commit()
    return tid
````

- Editar ou excluir uma perna atua nas duas (`update_transfer`, `delete_transfer`). Uma perna isolada não pode ser editada como despesa (409).
- Lançamentos ligados a uma operação de investimento só mudam pelo módulo de [[Investimentos (Financeiro)|Investimentos]].

## Recorrências sem duplicação

`generate_recurrences` cria lançamentos **previstos** até hoje + 31 dias. Duas proteções:
- `INSERT ... ON CONFLICT DO NOTHING` na chave única `(recurrence_id, recurrence_date)`, contra execuções simultâneas;
- `generated_until` na regra, para que uma ocorrência excluída pelo usuário não seja recriada.

Dia 31 vira o último dia do mês em meses curtos (`_add_months`). Encerrar a regra (`stop_rule`) remove só as ocorrências futuras ainda previstas.

> [!note] Verificado em 2026-10-18
> Testes em `tests/test_ledger.py`: CRUD e saldo, previsto que não afeta o saldo, transferência atômica (inclusive a falha sem deixar perna), conciliação, recorrência sem duplicar nem recriar, filtros e paginação.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
