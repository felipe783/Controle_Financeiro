# Rendimentos e Proventos

- Tipos: dividendo, JCP, rendimento de FII, cupom e outros. Situação anunciado/previsto ou recebido.
- O valor bruto, os impostos retidos e o valor líquido (bruto − impostos) ficam no histórico do ativo.
- O provento recebido com conta gera **um** lançamento de receita na categoria de sistema "Proventos", ligado à operação por FK única. O anunciado não gera caixa.
- Não há regras tributárias automáticas: o imposto é o valor informado e pode ser corrigido editando a operação.

**Implementação:** [[Investimentos (Financeiro)|Investimentos]] (`cash_effect`, `_sync_cash`).

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
