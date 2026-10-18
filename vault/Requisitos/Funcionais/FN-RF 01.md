# Receitas, Despesas e Lançamentos

O sistema deve permitir cadastrar, editar, consultar, duplicar e excluir (com confirmação) receitas e despesas.

**Campos:** descrição, valor, data de competência/da despesa, vencimento (despesa), data de recebimento/pagamento, categoria e subcategoria, conta, origem (receita), forma de pagamento e tipo fixa/variável (despesa), observações.

**Situações:** prevista, pendente, efetivada (paga/recebida). "Atrasada" é calculada: despesa não efetivada com vencimento passado.

**Operações:** filtros por data, tipo, situação, conta e categoria; busca por descrição; ordenação por data, valor ou descrição; paginação; exportação e importação CSV com pré-visualização e detecção de duplicados; recorrências semanais, mensais e anuais sem geração duplicada.

**Implementação:** [[Ledger (Financeiro)|Ledger]] · [[CSV (Financeiro)|CSV]] · [[Routers (Financeiro)|Routers]] (`/api/transactions`, `/api/recurrences`).

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
