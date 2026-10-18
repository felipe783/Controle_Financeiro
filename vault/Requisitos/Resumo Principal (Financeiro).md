### Linguagens Principais

``Python`` (backend) · ``TypeScript`` (frontend) · ``Bash`` (scripts de operação)

### Regras financeiras inegociáveis

O sistema parte destas regras, e cada uma tem teste automatizado:

- **Dinheiro em `Decimal`**, nunca `float`. São 2 casas, com `ROUND_HALF_UP` só no valor final; quantidades e preços têm até 8 casas (`app/money.py`).
- **Previsto ≠ efetivado:** só lançamentos com `status = "settled"` mexem no saldo e entram em receitas/despesas.
- **Transferência não é receita nem despesa**, e **compra de ativo não é despesa**: só troca caixa por posição.
- **Provento conta uma vez:** a operação de investimento gera no máximo um lançamento de caixa (FK única).
- **Nenhum preço inventado:** sem cotação válida, o ativo é avaliado pelo custo e sinalizado.
- **Histórico preservado:** alterações relevantes vão para `audit_logs`, e snapshots passados são imutáveis.

> Fórmulas completas em `docs/METODOLOGIA.md` (repositório).

### Tipos de lançamento

O valor gravado é sempre positivo; o tipo define o sinal (`TX_SIGN` em [[Models (Financeiro)|Models]]):

| Tipo | Sinal | Origem | Conta como receita/despesa? |
|---|---|---|---|
| `income` / `expense` | + / − | usuário, recorrência, CSV, provento/taxa de investimento | sim |
| `transfer_in` / `transfer_out` | + / − | [[Ledger (Financeiro)|transferência]] | não |
| `adjustment_in` / `adjustment_out` | + / − | [[Ledger (Financeiro)|conciliação]] | não |
| `investment_in` / `investment_out` | + / − | venda, amortização / compra de ativo | não |

## Fluxos Gerais de Processamento

### Registrar uma despesa ou receita

1. O frontend envia `POST /api/transactions` com o cabeçalho `X-Requested-With: fetch` e o cookie de sessão.
2. A [[Main (Financeiro)|Main]] barra a requisição sem o cabeçalho (CSRF). Depois, a dependência `current_user` valida a sessão ([[Autenticação (Financeiro)|Autenticação]]).
3. `TransactionIn` valida e normaliza: valor > 0 com 2 casas; `settle_date` preenchida quando efetivada e anulada quando não.
4. `ledger.create_transaction` confere se a conta não está arquivada, se o tipo da categoria bate e se a efetivação não é anterior ao saldo inicial. Depois grava e registra a auditoria numa única transação.
5. O frontend invalida as consultas e o painel recarrega com os dados persistidos.

### Comprar um ativo

1. `POST /api/operations` → `investments.save_operation`.
2. O ativo é travado (`SELECT ... FOR UPDATE`), a operação é gravada e `compute_position` reprocessa **todo o histórico**: quantidade negativa em qualquer data é recusada.
3. `_sync_cash` cria ou atualiza o único lançamento `investment_out` na conta informada.
4. O commit é único: se algo falha, nem a operação nem o caixa ficam gravados.

### Atualizar cotações

1. O [[Worker e CLI (Financeiro)|worker]] (a cada `QUOTES_UPDATE_INTERVAL_MINUTES`) ou o botão "Atualizar cotações" chama `quotes.update_all`.
2. Um advisory lock impede duas atualizações simultâneas. Cada ativo vai para o provedor da sua classe e moeda ([[!Modulo Providers (Financeiro)|Providers]]).
3. Sucesso: a cotação `auto` do dia é inserida ou atualizada. Falha: só o registro em `quote_fetch_logs`, e a cotação anterior continua valendo.
4. Para cada moeda estrangeira em uso, o câmbio PTAX é atualizado.

### Painel

`GET /api/dashboard?period=month|3m|6m|year|custom` → [[Relatórios (Financeiro)|reports.dashboard]], que consolida [[Patrimônio (Financeiro)|networth.compute]], séries mensais, despesas por categoria, alocação, histórico patrimonial e fluxos de investimento. Nada é cacheado no servidor e nenhuma chamada externa é feita.

---
**Projeto Pai:** [[_Financeiro]]
