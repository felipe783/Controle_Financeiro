# Cotações Automáticas e Manuais

- **Atualização automática** pelo [[Worker e CLI (Financeiro)|worker]], com intervalo em `QUOTES_UPDATE_INTERVAL_MINUTES`. Também há atualização manual sob demanda.
- **Controles:** timeout, retentativas limitadas, ritmo mínimo entre requisições, limite diário (Alpha Vantage), cache e lock contra execuções simultâneas.
- **Cada consulta registra** ativo, provedor, preço, moeda, data de referência, momento de recebimento, estado e erro.
- **Cotação manual** por preço unitário ou valor total, com data de referência, origem e observação, identificada como manual e com o autor. A automática nunca apaga a manual.
- **Falha não inventa preço:** a última cotação válida continua valendo e é marcada como desatualizada.
- **Câmbio:** PTAX automática ou taxa manual. Sem câmbio, o valor em BRL não é convertido.

**Implementação:** [[Cotações (Financeiro)|Cotações]] · [[!Modulo Providers (Financeiro)|Providers]] · `/api/quotes/*`, `/api/assets/{id}/quotes`, `/api/fx`.

---
**Projeto Pai:** [[_Financeiro]] · **Resumo:** [[Resumo Principal (Financeiro)|Resumo Principal]]
