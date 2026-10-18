# Contas e Transferências

Cada conta tem nome, instituição, tipo (corrente, poupança, pagamento, dinheiro, investimento, outra), saldo inicial e data, situação ativa/arquivada e observações.

- O saldo atual é calculado: saldo inicial + lançamentos efetivados até hoje.
- A transferência debita a origem e credita o destino na **mesma transação de banco**. As duas pernas ficam ligadas por `transfer_id` e não contam como receita nem despesa.
- A conciliação informa o saldo real do extrato e gera um lançamento de ajuste auditado.

**Implementação:** [[Ledger (Financeiro)|Ledger]] (`create_transfer`, `reconcile`) · `/api/accounts`, `/api/transfers`.

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
