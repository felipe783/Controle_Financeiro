# Metodologia de cálculo

Este documento descreve como o sistema calcula saldos, patrimônio e rentabilidade. O código correspondente
está em `backend/app/services/` (a fonte da verdade é o código; este texto explica o porquê).

## 1. Números e arredondamento

| Grandeza | Tipo no banco | Regra |
|---|---|---|
| Dinheiro (R$ e outras moedas) | `NUMERIC(18,2)` | arredondamento comercial (`ROUND_HALF_UP`) só no valor final gravado/exibido |
| Quantidade de ativos | `NUMERIC(24,8)` | até 8 casas (cotas fracionárias, ativos internacionais) |
| Preço unitário | `NUMERIC(24,8)` | idem |
| Câmbio | `NUMERIC(18,8)` | BRL por 1 unidade da moeda estrangeira |
| Percentuais | fração decimal | `0.1234` = 12,34%; divisão por zero → indicador indefinido (`—`), nunca 0 |

Nenhum cálculo usa ponto flutuante, exceto a busca numérica da TIR (resultado arredondado a 8 casas).
A API recebe e devolve valores como texto decimal (`"1234.56"`) para não perder precisão no JSON.

## 2. Saldo das contas

```
saldo(conta, data) = saldo_inicial
                   + Σ lançamentos EFETIVADOS com data de efetivação entre a data do saldo inicial e a data
```

- O saldo "atual" considera efetivações até **hoje**; um lançamento marcado como efetivado com data futura
  passa a contar nessa data (coerente com a carteira, que também ignora operações futuras).
- O saldo **não é armazenado**: é sempre recalculado. Não existe saldo desatualizado nem disputa entre
  operações simultâneas.
- Lançamentos previstos e pendentes não alteram o saldo; aparecem em "a receber / a pagar" e na previsão.
- O valor é sempre positivo; o tipo define o sinal (receita, despesa, entrada/saída de transferência,
  ajuste +/−, aplicação/resgate de investimento).
- Um lançamento efetivado antes da data do saldo inicial é recusado (já estaria contido no saldo inicial).

## 3. Receitas, despesas e resultado

- Contam como receita/despesa **apenas** lançamentos do tipo receita/despesa **efetivados**, pela data de
  efetivação (regime de caixa).
- **Não** contam: transferências, ajustes de conciliação, compras e vendas de ativos.
- Proventos recebidos são receita (categoria de sistema "Proventos"), registrados **uma única vez** por um
  lançamento ligado à operação de investimento por chave única (`transactions.investment_operation_id UNIQUE`).
- Taxa de economia = resultado ÷ receitas do período (indefinida sem receitas).
- "Atrasada" é derivada (não gravada): despesa não efetivada com vencimento (ou data) anterior a hoje.

## 4. Transferências e conciliação

- Transferência = duas pernas (saída e entrada) com o mesmo `transfer_id`, gravadas na mesma transação
  de banco. Editar ou excluir uma perna atua nas duas.
- Conciliação: o usuário informa o saldo real do extrato numa data; a diferença vira um lançamento de
  ajuste. O histórico nunca é reescrito e a operação fica na auditoria.

## 5. Investimentos

### Posição e custo (preço médio)

As operações de cada ativo são reprocessadas em ordem cronológica a cada consulta:

| Operação | Quantidade | Custo | Resultado realizado | Caixa |
|---|---|---|---|---|
| Compra/aporte | + q | + q·p + taxas | — | − (q·p + taxas)·câmbio |
| Venda/resgate | − q | − custo médio × q | líquido da venda − custo baixado | + (q·p − taxas)·câmbio |
| Provento recebido | — | — | (separado: proventos) | + (bruto − impostos)·câmbio |
| Provento anunciado | — | — | — (só informativo) | nenhum |
| Taxa avulsa | — | — | (separado: taxas) | − valor·câmbio |
| Amortização | — | − valor (até o custo) | excedente sobre o custo | + (bruto − impostos)·câmbio |
| Ajuste de posição | ± q | + q·p (se informado) / proporcional na saída | — | nenhum |

- Uma operação que deixaria a quantidade negativa **em qualquer ponto do histórico** é recusada; isso vale
  também para edições e exclusões de operações antigas.
- Editar uma operação recalcula a posição e atualiza o lançamento de caixa vinculado na mesma transação.

### Avaliação (valor de mercado)

- Valor = quantidade × último preço válido; ou o **valor total informado** (renda fixa), desde que não haja
  operação posterior à data da avaliação.
- Sem cotação válida, o ativo é avaliado **pelo custo**, sinalizado como tal (nunca se inventa preço).
- Cotação **desatualizada**: data de referência mais antiga que `QUOTES_STALE_DAYS_LISTED` (bolsa, padrão 4
  dias) ou `QUOTES_STALE_DAYS_OTHER` (demais, padrão 35 dias).

### Política de prioridade das cotações

1. vale a cotação com a **data de referência mais recente**;
2. na mesma data, **manual prevalece** sobre automática;
3. persistindo o empate, a recebida por último.

Nenhuma cotação é apagada por atualizações automáticas; o histórico completo de fontes fica visível.

### Moeda estrangeira

O custo é guardado na moeda do ativo e em BRL (pela taxa informada em cada operação). Com câmbio médio
histórico `c̄ = custo_BRL / custo_moeda` e câmbio atual `c`:

```
efeito do ativo  = (valor_moeda − custo_moeda) × c̄
efeito cambial   = valor_moeda × (c − c̄)
não realizado    = efeito do ativo + efeito cambial = valor_BRL − custo_BRL
```

Sem taxa de câmbio válida, o valor em reais não é convertido: o ativo fica avaliado pelo custo e sinalizado.

### Retorno e rentabilidade

- **Retorno absoluto (R$)** = não realizado + realizado + proventos recebidos − taxas avulsas. Cada
  componente é exibido separadamente.
- **Retorno simples sobre aportes** = retorno absoluto ÷ total aportado. É exibido como referência, mas
  **não** é uma medida de rentabilidade quando há aportes em datas diferentes.
- **Rentabilidade (TIR / XIRR)**: taxa anual que zera o valor presente dos fluxos (aportes negativos;
  vendas, proventos e o valor atual positivos), ponderada pelo dinheiro investido. Calculada por bisseção
  (robusta, sem chute inicial). Só é exibida com pelo menos 30 dias de histórico, porque anualizar poucos
  dias produz números enganosos.
- Retorno ponderado pelo tempo (TWR) não é calculado: exigiria a avaliação da carteira em cada data de
  fluxo de caixa, que só existe a partir dos snapshots diários.

### Impostos

O sistema registra os impostos retidos informados pelo usuário (por exemplo, IR sobre JCP) e não aplica
regras tributárias automáticas (isenções, come-cotas, IR sobre ganho de capital). Os valores podem ser
corrigidos manualmente editando a operação.

## 6. Patrimônio

Todos os cálculos deste documento valem **por usuário**: cada um tem as próprias contas, investimentos,
dívidas, câmbio e snapshots, isolados no banco por Row-Level Security. A taxa PTAX é consultada uma vez por
rodada e gravada para cada usuário que tem ativos naquela moeda.

```
ativos   = Σ saldos de TODAS as contas (inclusive o caixa da corretora) + Σ valor dos investimentos
passivos = Σ último saldo devedor registrado de cada dívida até a data
líquido  = ativos − passivos
```

- Comprar um ativo apenas troca caixa por investimento; o patrimônio só muda com a variação de preço.
- O caixa parado na conta de investimento conta uma única vez, como dinheiro.
- Metas não entram no patrimônio: elas destinam valores que já existem.

### Snapshots e histórico

- O worker grava um **snapshot diário** com os valores do dia e as cotações disponíveis naquele momento.
  Snapshots de dias anteriores são imutáveis; o de hoje pode ser atualizado ao longo do dia.
- Para fins de mês sem snapshot, o gráfico mostra uma **estimativa** marcada "(est.)", calculada com os
  lançamentos e as cotações **conhecidas até aquela data**, nunca com as cotações atuais.

## 7. Recorrências e importação

- Recorrências geram lançamentos **previstos** até 31 dias à frente. A chave única (regra, data da
  ocorrência) impede duplicar em execuções simultâneas, e `generated_until` impede recriar uma ocorrência
  excluída. Dia 31 vira o último dia do mês em meses mais curtos.
- Na importação CSV, cada linha recebe um hash (data, valor, descrição normalizada, conta, tipo). É marcada
  como possível duplicada se o hash já existe, se repete dentro do arquivo ou se existe um lançamento manual
  idêntico. A gravação ocorre numa única transação e o arquivo é revalidado no servidor.

## 8. Orçamentos

Consumo = despesas **efetivadas** da categoria e de suas subcategorias com data de competência no mês.
Despesas previstas e pendentes aparecem como "comprometido". O alerta dispara a partir de
`BUDGET_ALERT_PERCENT` (padrão 80%).
