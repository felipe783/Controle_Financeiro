"""Investimentos: operações, posições, avaliação e rentabilidade.

Metodologia (ver docs/METODOLOGIA.md):
- Posição recalculada sempre a partir do histórico de operações (nunca um saldo editável).
- Custo pelo **preço médio** (prática brasileira): venda baixa o custo proporcional à quantidade vendida;
  a diferença entre o valor líquido da venda e esse custo é o **resultado realizado**.
- Ativos em moeda estrangeira: custo guardado na moeda do ativo e em BRL (pela taxa da operação), o que
  separa variação do ativo e variação cambial.
- Rentabilidade: retorno absoluto em R$ = não realizado + realizado + proventos − taxas avulsas;
  rentabilidade anualizada pela TIR (XIRR, ponderada pelo dinheiro) dos fluxos de caixa.
- Cada operação com conta gera no máximo **um** lançamento de caixa (FK única), por isso proventos
  aparecem no histórico do ativo e nas receitas sem contagem dupla.
"""

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Account, Asset, Category, FxRate, InvestmentOperation, Quote, Transaction
from app.money import ZERO, money, safe_div
from app.services.common import DomainError, audit, get_or_404, snapshot

LISTED_CLASSES = {"br_stock", "fii", "etf", "international"}
EPS = Decimal("0.000000005")


# ---------- XIRR ----------
def xirr(flows: list[tuple[dt.date, Decimal]]) -> Decimal | None:
    """TIR anual de fluxos irregulares (negativo = aporte, positivo = retorno). None se indefinida."""
    flows = [(d, float(v)) for d, v in flows if v != 0]
    if len(flows) < 2 or not (any(v < 0 for _, v in flows) and any(v > 0 for _, v in flows)):
        return None
    t0 = min(d for d, _ in flows)
    span = max((d - t0).days for d, _ in flows)
    if span < 1:
        return None
    times = [((d - t0).days / 365.0, v) for d, v in flows]

    def npv(rate: float) -> float:
        return sum(v / (1.0 + rate) ** t for t, v in times)

    lo, hi = -0.9999, 10.0
    f_lo, f_hi = npv(lo), npv(hi)
    if f_lo * f_hi > 0:
        return None
    for _ in range(200):  # bisseção: robusta, sem depender de chute inicial
        mid = (lo + hi) / 2
        f_mid = npv(mid)
        if abs(f_mid) < 1e-9:
            break
        if f_lo * f_mid < 0:
            hi = mid
        else:
            lo, f_lo = mid, f_mid
    return Decimal(str(round((lo + hi) / 2, 8)))


# ---------- Cotações e câmbio ----------
def effective_quote(db: Session, asset_id: int, as_of: dt.date | None = None) -> Quote | None:
    """Política de prioridade: maior data de referência; empate → manual vence; depois a mais recente."""
    q = select(Quote).where(Quote.asset_id == asset_id)
    if as_of:
        q = q.where(Quote.reference_date <= as_of)
    q = q.order_by(Quote.reference_date.desc(), (Quote.source == "manual").desc(), Quote.received_at.desc())
    return db.scalars(q.limit(1)).first()


def fx_rate(db: Session, currency: str, as_of: dt.date | None = None) -> FxRate | None:
    if currency == "BRL":
        return None
    q = select(FxRate).where(FxRate.currency == currency)
    if as_of:
        q = q.where(FxRate.reference_date <= as_of)
    return db.scalars(q.order_by(FxRate.reference_date.desc(), FxRate.received_at.desc()).limit(1)).first()


def is_stale(asset: Asset, reference_date: dt.date, ref: dt.date | None = None) -> bool:
    s = get_settings()
    limit = s.quotes_stale_days_listed if asset.asset_class in LISTED_CLASSES else s.quotes_stale_days_other
    return ((ref or dt.date.today()) - reference_date).days > limit


# ---------- Posição ----------
@dataclass
class Position:
    quantity: Decimal = ZERO
    cost_ccy: Decimal = ZERO
    cost_brl: Decimal = ZERO
    realized_brl: Decimal = ZERO
    income_brl: Decimal = ZERO
    income_announced_brl: Decimal = ZERO
    fees_brl: Decimal = ZERO
    bought_brl: Decimal = ZERO
    flows: list[tuple[dt.date, Decimal]] = field(default_factory=list)


def _fx(asset: Asset, op: InvestmentOperation) -> Decimal:
    if asset.currency == "BRL":
        return Decimal(1)
    if op.fx_rate is None:
        raise DomainError("Informe a taxa de câmbio (BRL por unidade da moeda) da operação em moeda estrangeira.")
    return op.fx_rate


def cash_effect(asset: Asset, op: InvestmentOperation) -> tuple[str, Decimal] | None:
    """(tipo de lançamento, valor em BRL) que a operação gera na conta, ou None."""
    if op.kind == "adjustment" or (op.kind == "income" and op.income_status != "received"):
        return None
    fx = _fx(asset, op)
    q, p = op.quantity or ZERO, op.unit_price or ZERO
    gross = op.gross_amount or ZERO
    if op.kind == "buy":
        return "investment_out", money((q * p + op.fees) * fx)
    if op.kind == "sell":
        value = money((q * p - op.fees) * fx)
        if value <= 0:
            raise DomainError("O valor líquido da venda deve ser positivo (taxas maiores que o valor vendido).")
        return "investment_in", value
    if op.kind == "income":
        return "income", money((gross - op.taxes) * fx)
    if op.kind == "fee":
        return "expense", money(gross * fx)
    if op.kind == "amortization":
        return "investment_in", money((gross - op.taxes) * fx)
    return None


def compute_position(asset: Asset, ops: list[InvestmentOperation]) -> Position:
    """Reprocessa o histórico em ordem. Lança DomainError se a quantidade ficar negativa em algum ponto."""
    pos = Position()
    for op in sorted(ops, key=lambda o: (o.date, o.id or 0)):
        q, p = op.quantity or ZERO, op.unit_price or ZERO
        if op.kind == "buy":
            fx = _fx(asset, op)
            value_ccy = q * p + op.fees
            pos.quantity += q
            pos.cost_ccy += value_ccy
            pos.cost_brl += value_ccy * fx
            pos.bought_brl += value_ccy * fx
            pos.flows.append((op.date, -(value_ccy * fx)))
        elif op.kind == "sell" or (op.kind == "adjustment" and q < 0):
            sold = abs(q)
            if sold > pos.quantity + EPS:
                raise DomainError(
                    f"Quantidade insuficiente em {op.date:%d/%m/%Y}: posição {pos.quantity.normalize():f}, "
                    f"saída {sold.normalize():f}."
                )
            frac = sold / pos.quantity if pos.quantity else Decimal(1)
            removed_ccy, removed_brl = pos.cost_ccy * frac, pos.cost_brl * frac
            pos.quantity -= sold
            pos.cost_ccy -= removed_ccy
            pos.cost_brl -= removed_brl
            if op.kind == "sell":
                proceeds = (sold * p - op.fees) * _fx(asset, op)
                pos.realized_brl += proceeds - removed_brl
                pos.flows.append((op.date, proceeds))
            if pos.quantity <= EPS:
                pos.quantity, pos.cost_ccy, pos.cost_brl = ZERO, ZERO, ZERO
        elif op.kind == "adjustment":  # entrada sem caixa (posição inicial, bonificação, desdobramento)
            pos.quantity += q
            if p:
                fx = _fx(asset, op)
                pos.cost_ccy += q * p
                pos.cost_brl += q * p * fx
                pos.bought_brl += q * p * fx
                pos.flows.append((op.date, -(q * p * fx)))
        elif op.kind == "income":
            net = ((op.gross_amount or ZERO) - op.taxes) * _fx(asset, op)
            if op.income_status == "received":
                pos.income_brl += net
                pos.flows.append((op.date, net))
            else:
                pos.income_announced_brl += net
        elif op.kind == "fee":
            fee = (op.gross_amount or ZERO) * _fx(asset, op)
            pos.fees_brl += fee
            pos.flows.append((op.date, -fee))
        elif op.kind == "amortization":
            fx = _fx(asset, op)
            amt_ccy = (op.gross_amount or ZERO) - op.taxes
            reduction = min(amt_ccy, pos.cost_ccy)
            ratio = safe_div(reduction, pos.cost_ccy) or ZERO
            brl_reduction = pos.cost_brl * ratio
            pos.cost_ccy -= reduction
            pos.cost_brl -= brl_reduction
            pos.realized_brl += amt_ccy * fx - brl_reduction
            pos.flows.append((op.date, amt_ccy * fx))
    return pos


def asset_ops(db: Session, asset_id: int) -> list[InvestmentOperation]:
    return list(db.scalars(select(InvestmentOperation).where(InvestmentOperation.asset_id == asset_id)
                           .order_by(InvestmentOperation.date, InvestmentOperation.id)).all())


def valuation(db: Session, asset: Asset, ops: list[InvestmentOperation], as_of: dt.date | None = None) -> dict:
    """Indicadores do ativo numa data. Com `as_of`, usa só operações e cotações até ela (histórico real)."""
    ref = as_of or dt.date.today()
    ops = [o for o in ops if o.date <= ref]
    pos = compute_position(asset, ops)
    quote = effective_quote(db, asset.id, as_of)
    fx = fx_rate(db, asset.currency, as_of)
    fx_value = Decimal(1) if asset.currency == "BRL" else (fx.rate if fx else None)

    mv_ccy: Decimal | None = None
    if pos.quantity == 0 and pos.cost_ccy == 0:
        mv_ccy = ZERO
    elif quote is not None and quote.reference_date >= max((o.date for o in ops), default=quote.reference_date) \
            and quote.total_value is not None:
        mv_ccy = quote.total_value
    elif quote is not None and quote.price is not None:
        mv_ccy = pos.quantity * quote.price
    # Avaliação total desatualizada em relação a operações posteriores não é usada (a quantidade mudou).

    warnings: list[str] = []
    method = "market"
    mv_brl: Decimal | None = None
    if mv_ccy is None:
        method = "cost"
        warnings.append("Sem cotação válida: avaliado pelo custo de aquisição.")
        mv_brl = pos.cost_brl
    elif fx_value is None:
        method = "no_fx"
        warnings.append(f"Sem câmbio {asset.currency}/BRL: valor em reais não convertido; usado o custo.")
        mv_brl = pos.cost_brl
    else:
        mv_brl = mv_ccy * fx_value
    stale = bool(quote and is_stale(asset, quote.reference_date, ref))
    if stale:
        warnings.append("Cotação desatualizada.")

    unrealized = mv_brl - pos.cost_brl if method == "market" else ZERO
    asset_effect = fx_effect = None
    if method == "market" and asset.currency != "BRL" and pos.cost_ccy:
        avg_fx = pos.cost_brl / pos.cost_ccy
        asset_effect = money((mv_ccy - pos.cost_ccy) * avg_fx)
        fx_effect = money(mv_ccy * (fx_value - avg_fx))
    total_return = unrealized + pos.realized_brl + pos.income_brl - pos.fees_brl
    terminal = [(ref, mv_brl)] if mv_brl else []
    return {
        "asset_id": asset.id,
        "quantity": pos.quantity,
        "avg_price": safe_div(pos.cost_ccy, pos.quantity),
        "cost_ccy": money(pos.cost_ccy),
        "cost_brl": money(pos.cost_brl),
        "market_value_ccy": money(mv_ccy) if mv_ccy is not None else None,
        "market_value_brl": money(mv_brl),
        "valuation_method": method,
        "last_price": quote.price if quote else None,
        "quote_total_value": quote.total_value if quote else None,
        "quote_reference_date": quote.reference_date if quote else None,
        "quote_received_at": quote.received_at if quote else None,
        "quote_source": quote.source if quote else None,
        "quote_provider": quote.provider if quote else None,
        "quote_stale": stale,
        "fx_rate": fx_value if asset.currency != "BRL" else None,
        "fx_reference_date": fx.reference_date if fx else None,
        "unrealized_brl": money(unrealized),
        "asset_effect_brl": asset_effect,
        "fx_effect_brl": fx_effect,
        "realized_brl": money(pos.realized_brl),
        "income_brl": money(pos.income_brl),
        "income_announced_brl": money(pos.income_announced_brl),
        "fees_brl": money(pos.fees_brl),
        "bought_brl": money(pos.bought_brl),
        "total_return_brl": money(total_return),
        "simple_return": safe_div(total_return, pos.bought_brl),
        "xirr": xirr(pos.flows + terminal),
        "warnings": warnings,
        "_flows": pos.flows,
    }


def portfolio(db: Session, as_of: dt.date | None = None, include_archived: bool = True) -> dict:
    assets = db.scalars(select(Asset).order_by(Asset.name)).all()
    items, flows = [], []
    totals = {k: ZERO for k in ("cost_brl", "market_value_brl", "unrealized_brl", "realized_brl", "income_brl",
                                "fees_brl", "total_return_brl", "bought_brl")}
    for a in assets:
        if a.archived and not include_archived:
            continue
        v = valuation(db, a, asset_ops(db, a.id), as_of)
        flows.extend(v.pop("_flows"))
        for k in totals:
            totals[k] += v[k]
        items.append({"asset": a, **v})
    if totals["market_value_brl"]:
        flows.append((as_of or dt.date.today(), totals["market_value_brl"]))
    for it in items:
        it["weight"] = safe_div(it["market_value_brl"], totals["market_value_brl"])
    by_class: dict[str, Decimal] = {}
    for it in items:
        if it["market_value_brl"]:
            by_class[it["asset"].asset_class] = by_class.get(it["asset"].asset_class, ZERO) + it["market_value_brl"]
    return {
        "items": items,
        "totals": {k: money(v) for k, v in totals.items()},
        "simple_return": safe_div(totals["total_return_brl"], totals["bought_brl"]),
        "xirr": xirr(flows),
        "by_class": by_class,
    }


# ---------- Operações ----------
OP_FIELDS = ("asset_id", "kind", "date", "quantity", "unit_price", "gross_amount", "fees", "taxes", "fx_rate",
             "income_type", "income_status", "account_id", "notes")

OP_LABEL = {"buy": "Compra", "sell": "Venda", "income": "Provento", "fee": "Taxa", "amortization": "Amortização"}


def _system_category(db: Session, name: str, kind: str) -> int | None:
    return db.scalar(select(Category.id).where(Category.name == name, Category.kind == kind,
                                               Category.is_system.is_(True)))


def _sync_cash(db: Session, asset: Asset, op: InvestmentOperation) -> None:
    """Mantém exatamente um lançamento de caixa por operação (ou nenhum)."""
    tx = db.scalar(select(Transaction).where(Transaction.investment_operation_id == op.id))
    effect = cash_effect(asset, op) if op.account_id else None
    if effect is None:
        if tx is not None:
            db.delete(tx)
        return
    kind, amount = effect
    acc = get_or_404(db, Account, op.account_id, "Conta")
    if op.date < acc.initial_balance_date:
        raise DomainError(f"A data da operação é anterior ao saldo inicial da conta '{acc.name}'.")
    if tx is None:
        tx = Transaction(investment_operation_id=op.id)
        db.add(tx)
    tx.kind, tx.amount, tx.status = kind, amount, "settled"
    tx.date = tx.settle_date = op.date
    tx.account_id = op.account_id
    tx.description = f"{OP_LABEL[op.kind]} {asset.ticker or asset.name}"
    tx.category_id = (_system_category(db, "Proventos", "income") if kind == "income"
                      else _system_category(db, "Taxas de investimento", "expense") if kind == "expense" else None)
    tx.origin = asset.ticker or asset.name if kind == "income" else None


def _lock_asset(db: Session, asset_id: int) -> Asset:
    asset = db.scalar(select(Asset).where(Asset.id == asset_id).with_for_update())
    if asset is None:
        raise DomainError("Ativo não encontrado.")
    return asset


def _validate(db: Session, asset: Asset, op: InvestmentOperation) -> None:
    if op.account_id is not None:
        acc = get_or_404(db, Account, op.account_id, "Conta")
        if acc.archived:
            raise DomainError(f"A conta '{acc.name}' está arquivada.")
    if asset.currency != "BRL" and op.kind != "adjustment" and op.fx_rate is None:
        raise DomainError("Informe a taxa de câmbio (BRL por unidade da moeda) da operação em moeda estrangeira.")
    compute_position(asset, asset_ops(db, asset.id))  # histórico inteiro precisa continuar válido


def save_operation(db: Session, data, op_id: int | None = None, user_id: int | None = None) -> InvestmentOperation:
    """Cria ou edita uma operação, reprocessa a posição e sincroniza o caixa, tudo numa transação."""
    asset = _lock_asset(db, data.asset_id)
    before = None
    if op_id is None:
        op = InvestmentOperation()
        db.add(op)
    else:
        op = get_or_404(db, InvestmentOperation, op_id, "Operação")
        if op.asset_id != data.asset_id:
            _lock_asset(db, op.asset_id)
            raise DomainError("Não é possível mover uma operação para outro ativo; exclua e recrie.")
        before = snapshot(op)
    for f in OP_FIELDS:
        setattr(op, f, getattr(data, f))
    db.flush()
    _validate(db, asset, op)
    _sync_cash(db, asset, op)
    db.flush()
    audit(db, "investment_operation", op.id, "create" if before is None else "update", before=before,
          after=snapshot(op), user_id=user_id)
    db.commit()
    return op


def delete_operation(db: Session, op_id: int, user_id: int | None = None) -> None:
    op = get_or_404(db, InvestmentOperation, op_id, "Operação")
    asset = _lock_asset(db, op.asset_id)
    before = snapshot(op)
    db.delete(op)  # lançamento vinculado sai junto (ON DELETE CASCADE)
    db.flush()
    compute_position(asset, asset_ops(db, asset.id))
    audit(db, "investment_operation", op_id, "delete", before=before, user_id=user_id)
    db.commit()


def add_manual_quote(db: Session, asset_id: int, data, user_id: int | None = None) -> Quote:
    asset = get_or_404(db, Asset, asset_id, "Ativo")
    q = Quote(asset_id=asset.id, source="manual", provider="manual", price=data.price,
              total_value=data.total_value, currency=asset.currency, reference_date=data.reference_date,
              origin_info=data.origin_info, note=data.note, created_by=user_id)
    db.add(q)
    db.flush()
    audit(db, "quote", q.id, "create", after=snapshot(q), user_id=user_id)
    db.commit()
    return q
