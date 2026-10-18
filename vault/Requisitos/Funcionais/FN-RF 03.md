# Investimentos

O sistema deve suportar ações brasileiras, FIIs, ETFs, Tesouro Direto, CDB, LCI/LCA, outros de renda fixa, fundos, ativos internacionais e ativos personalizados.

- **Cadastro do ativo:** nome, ticker, classe, instituição e moeda. Para renda fixa: indexador, taxa, vencimento e liquidez.
- **Operações:** compra/aporte, venda/resgate, provento, taxa, amortização e ajuste de posição, com data, quantidade, preço, custos, câmbio e conta.
- **Indicadores:** quantidade, custo, preço médio, último preço e data, valor de mercado, não realizado, realizado, proventos, retorno em R$, retorno simples, TIR e participação na carteira.
- Editar uma operação antiga recalcula a posição e o caixa vinculado. Venda acima da posição é recusada.

**Implementação:** [[Investimentos (Financeiro)|Investimentos]] · `/api/portfolio`, `/api/assets`, `/api/operations`.

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
