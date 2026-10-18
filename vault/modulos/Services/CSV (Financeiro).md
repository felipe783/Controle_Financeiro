# Sobre o Arquivo

`backend/app/services/csv_io.py` importa e exporta receitas e despesas em CSV. O formato é o mesmo nos dois sentidos:

```text
data;descricao;valor;tipo;status;categoria;conta;observacoes
05/01/2026;Mercado;1.234,56;despesa;paga;Alimentação;Corrente;
```

Responsabilidades:
- detectar o separador (`;` ou `,`) e a codificação (UTF-8 com BOM ou Latin-1);
- validar linha a linha: data, valor positivo, tipo, status, conta existente e não arquivada, categoria do tipo certo;
- marcar possíveis duplicados por hash (data, valor, descrição normalizada, conta, tipo) ou por lançamento manual idêntico;
- **revalidar o arquivo no commit** (não confia na pré-visualização) e gravar tudo numa transação. Arquivo com erro não é importado parcialmente;
- na exportação, prefixar `'` em células que começam com `= + - @`, contra injeção de fórmula. A importação remove esse prefixo.

# Funcionalidades

## Valores em formato brasileiro

````python
def parse_amount(raw: str) -> Decimal:
    s = raw.strip().replace("R$", "").replace(" ", "")
    if "," in s or re.fullmatch(r"\d{1,3}(\.\d{3})+", s):  # formato brasileiro: ponto como milhar
        s = s.replace(".", "").replace(",", ".")
    value = Decimal(s)
    if not value.is_finite():
        raise InvalidOperation
    return value
````

> [!note] Verificado em 2026-10-18
> `test_csv_preview_validates_and_flags_duplicates`, `test_duplicate_detection_matches_manual_entry`, `test_csv_export_roundtrip`, `test_csv_thousands_without_comma` e `test_csv_export_reimport_roundtrip_keeps_prefixed_text`. O limite é de 5000 linhas e 2 MB por arquivo.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Services (Financeiro)|!Modulo Services]]
