"""Regras numéricas únicas do sistema.

- Dinheiro: Decimal com 2 casas, arredondamento ROUND_HALF_UP (arredondamento comercial), aplicado
  só ao gravar/apresentar um valor monetário final; cálculos intermediários usam precisão total.
- Quantidade e preço unitário: até 8 casas (cotas fracionárias, ativos internacionais).
- Taxas de câmbio: até 8 casas.
- Percentuais: Decimal em fração (0.1234 = 12,34%), apresentados com 2 casas.
"""

from decimal import ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 34

CENT = Decimal("0.01")
QTY = Decimal("0.00000001")
ZERO = Decimal("0")


def money(value: Decimal | int | str) -> Decimal:
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def qty(value: Decimal | int | str) -> Decimal:
    return Decimal(value).quantize(QTY, rounding=ROUND_HALF_UP)


def safe_div(a: Decimal, b: Decimal) -> Decimal | None:
    """Divisão que devolve None quando o divisor é zero (indicador indefinido, não zero)."""
    if b == 0:
        return None
    return a / b
