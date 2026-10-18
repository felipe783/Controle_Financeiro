"""Modelo de dados. Valores monetários em Numeric (nunca float). Ver app/money.py."""

import datetime as dt
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

Money = Numeric(18, 2)
Qty = Numeric(24, 8)
Price = Numeric(24, 8)

ACCOUNT_TYPES = ("checking", "savings", "payment", "cash", "investment", "other")
CATEGORY_KINDS = ("income", "expense")
# Sinal de cada tipo de lançamento sobre o saldo da conta. Valor gravado é sempre positivo.
TX_SIGN = {
    "income": 1,
    "expense": -1,
    "transfer_in": 1,
    "transfer_out": -1,
    "adjustment_in": 1,
    "adjustment_out": -1,
    "investment_in": 1,
    "investment_out": -1,
}
TX_KINDS = tuple(TX_SIGN)
# planned = previsto; pending = pendente (lançado, ainda não pago/recebido); settled = efetivado.
TX_STATUSES = ("planned", "pending", "settled")
ASSET_CLASSES = (
    "br_stock",
    "fii",
    "etf",
    "treasury",
    "cdb",
    "lci_lca",
    "fixed_income",
    "fund",
    "international",
    "other",
)
OP_KINDS = ("buy", "sell", "income", "fee", "amortization", "adjustment")
INCOME_TYPES = ("dividend", "jcp", "fii_income", "coupon", "other")
INCOME_STATUSES = ("announced", "received")


def _enum_check(column: str, values: tuple[str, ...], name: str) -> CheckConstraint:
    allowed = ",".join(f"'{v}'" for v in values)
    return CheckConstraint(f"{column} IN ({allowed})", name=name)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class UserSession(Base):
    __tablename__ = "user_sessions"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship()


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (_enum_check("type", ACCOUNT_TYPES, "ck_accounts_type"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    institution: Mapped[str | None] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(20))
    initial_balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    initial_balance_date: Mapped[dt.date] = mapped_column(Date)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Category(TimestampMixin, Base):
    __tablename__ = "categories"
    __table_args__ = (
        _enum_check("kind", CATEGORY_KINDS, "ck_categories_kind"),
        UniqueConstraint("kind", "parent_id", "name", name="uq_categories_kind_parent_name",
                         postgresql_nulls_not_distinct=True),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    # Categorias de sistema (ex.: Proventos) são usadas por regras automáticas e não podem ser removidas.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class RecurrenceRule(TimestampMixin, Base):
    __tablename__ = "recurrence_rules"
    __table_args__ = (
        CheckConstraint("kind IN ('income','expense')", name="ck_recurrence_kind"),
        CheckConstraint("frequency IN ('weekly','monthly','yearly')", name="ck_recurrence_freq"),
        CheckConstraint("amount > 0", name="ck_recurrence_amount"),
        CheckConstraint("interval_count >= 1", name="ck_recurrence_interval"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Money)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    payment_method: Mapped[str | None] = mapped_column(String(40))
    expense_type: Mapped[str | None] = mapped_column(String(10))
    origin: Mapped[str | None] = mapped_column(String(100))
    frequency: Mapped[str] = mapped_column(String(10))
    interval_count: Mapped[int] = mapped_column(Integer, default=1)
    start_date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    due_day_offset: Mapped[int] = mapped_column(Integer, default=0)
    # Ocorrências até esta data já foram geradas; excluir uma ocorrência não a faz ser recriada.
    generated_until: Mapped[dt.date | None] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text)


class Transaction(TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        _enum_check("kind", TX_KINDS, "ck_transactions_kind"),
        _enum_check("status", TX_STATUSES, "ck_transactions_status"),
        CheckConstraint("amount > 0", name="ck_transactions_amount_positive"),
        CheckConstraint(
            "expense_type IS NULL OR expense_type IN ('fixed','variable')", name="ck_transactions_expense_type"
        ),
        # Transferências e movimentações de investimento não existem como "previstas".
        CheckConstraint(
            "kind IN ('income','expense') OR status = 'settled'", name="ck_transactions_non_cash_settled"
        ),
        CheckConstraint("status <> 'settled' OR settle_date IS NOT NULL", name="ck_transactions_settle_date"),
        UniqueConstraint("recurrence_id", "recurrence_date", name="uq_transactions_recurrence_occurrence"),
        Index("ix_transactions_account_date", "account_id", "date"),
        Index("ix_transactions_date", "date"),
        Index("ix_transactions_transfer", "transfer_id"),
        Index("ix_transactions_import_hash", "import_hash"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(10))
    description: Mapped[str] = mapped_column(String(200))
    amount: Mapped[Decimal] = mapped_column(Money)
    date: Mapped[dt.date] = mapped_column(Date)  # competência / data da despesa
    due_date: Mapped[dt.date | None] = mapped_column(Date)
    settle_date: Mapped[dt.date | None] = mapped_column(Date)  # recebimento / pagamento efetivo
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    origin: Mapped[str | None] = mapped_column(String(100))
    payment_method: Mapped[str | None] = mapped_column(String(40))
    expense_type: Mapped[str | None] = mapped_column(String(10))
    notes: Mapped[str | None] = mapped_column(Text)
    reconciled: Mapped[bool] = mapped_column(Boolean, default=False)
    transfer_id: Mapped[str | None] = mapped_column(String(36))
    recurrence_id: Mapped[int | None] = mapped_column(ForeignKey("recurrence_rules.id", ondelete="SET NULL"))
    recurrence_date: Mapped[dt.date | None] = mapped_column(Date)
    investment_operation_id: Mapped[int | None] = mapped_column(
        ForeignKey("investment_operations.id", ondelete="CASCADE"), unique=True
    )
    import_hash: Mapped[str | None] = mapped_column(String(64))

    account: Mapped[Account] = relationship()
    category: Mapped[Category | None] = relationship()


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"
    __table_args__ = (_enum_check("asset_class", ASSET_CLASSES, "ck_assets_class"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    ticker: Mapped[str | None] = mapped_column(String(30), index=True)
    asset_class: Mapped[str] = mapped_column(String(20))
    institution: Mapped[str | None] = mapped_column(String(100))
    currency: Mapped[str] = mapped_column(String(3), default="BRL")
    auto_quote: Mapped[bool] = mapped_column(Boolean, default=True)
    # Renda fixa (opcionais)
    indexer: Mapped[str | None] = mapped_column(String(30))
    contracted_rate: Mapped[str | None] = mapped_column(String(50))
    maturity_date: Mapped[dt.date | None] = mapped_column(Date)
    liquidity: Mapped[str | None] = mapped_column(String(50))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class InvestmentOperation(TimestampMixin, Base):
    __tablename__ = "investment_operations"
    __table_args__ = (
        _enum_check("kind", OP_KINDS, "ck_ops_kind"),
        CheckConstraint("income_type IS NULL OR income_type IN ('dividend','jcp','fii_income','coupon','other')",
                        name="ck_ops_income_type"),
        CheckConstraint("income_status IS NULL OR income_status IN ('announced','received')",
                        name="ck_ops_income_status"),
        CheckConstraint("fees >= 0 AND taxes >= 0", name="ck_ops_costs_non_negative"),
        CheckConstraint("fx_rate IS NULL OR fx_rate > 0", name="ck_ops_fx_positive"),
        Index("ix_ops_asset_date", "asset_id", "date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="RESTRICT"))
    kind: Mapped[str] = mapped_column(String(15))
    date: Mapped[dt.date] = mapped_column(Date)
    quantity: Mapped[Decimal | None] = mapped_column(Qty)
    unit_price: Mapped[Decimal | None] = mapped_column(Price)
    gross_amount: Mapped[Decimal | None] = mapped_column(Money)  # proventos, taxas, amortizações
    fees: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    taxes: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    # BRL por 1 unidade da moeda do ativo na data da operação (obrigatório p/ ativo não-BRL com conta).
    fx_rate: Mapped[Decimal | None] = mapped_column(Numeric(18, 8))
    income_type: Mapped[str | None] = mapped_column(String(15))
    income_status: Mapped[str | None] = mapped_column(String(10))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    notes: Mapped[str | None] = mapped_column(Text)

    asset: Mapped[Asset] = relationship()


class Quote(Base):
    """Cotação válida (automática ou manual). Nunca apagada por atualizações posteriores."""

    __tablename__ = "quotes"
    __table_args__ = (
        CheckConstraint("source IN ('auto','manual')", name="ck_quotes_source"),
        CheckConstraint("(price IS NOT NULL AND price > 0) OR (total_value IS NOT NULL AND total_value >= 0)",
                        name="ck_quotes_value"),
        Index("ix_quotes_asset_ref", "asset_id", "reference_date"),
        # Uma cotação automática por ativo/provedor/dia de referência (atualizações do dia sobrescrevem a do dia).
        Index("uq_quotes_auto_daily", "asset_id", "provider", "reference_date", unique=True,
              postgresql_where="source = 'auto'"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(10))
    provider: Mapped[str] = mapped_column(String(30))
    price: Mapped[Decimal | None] = mapped_column(Price)
    total_value: Mapped[Decimal | None] = mapped_column(Money)  # avaliação total informada (renda fixa)
    currency: Mapped[str] = mapped_column(String(3))
    reference_date: Mapped[dt.date] = mapped_column(Date)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    origin_info: Mapped[str | None] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class QuoteFetchLog(Base):
    __tablename__ = "quote_fetch_logs"
    __table_args__ = (Index("ix_quote_logs_received", "received_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"))
    currency_pair: Mapped[str | None] = mapped_column(String(7))
    provider: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20))  # ok, error, not_found, rate_limited, skipped
    price: Mapped[Decimal | None] = mapped_column(Price)
    currency: Mapped[str | None] = mapped_column(String(3))
    reference_date: Mapped[dt.date | None] = mapped_column(Date)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    error_message: Mapped[str | None] = mapped_column(Text)
    trigger: Mapped[str] = mapped_column(String(10), default="auto")  # auto | manual


class FxRate(Base):
    __tablename__ = "fx_rates"
    __table_args__ = (
        UniqueConstraint("currency", "reference_date", "source", name="uq_fx_currency_date_source"),
        CheckConstraint("rate > 0", name="ck_fx_rate_positive"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    currency: Mapped[str] = mapped_column(String(3))  # moeda estrangeira; rate = BRL por 1 unidade
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8))
    reference_date: Mapped[dt.date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(30))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Liability(TimestampMixin, Base):
    __tablename__ = "liabilities"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    kind: Mapped[str | None] = mapped_column(String(50))
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class LiabilityBalance(Base):
    """Histórico do saldo devedor; o saldo numa data é o último registro até ela."""

    __tablename__ = "liability_balances"
    __table_args__ = (
        UniqueConstraint("liability_id", "reference_date", name="uq_liability_balance_date"),
        CheckConstraint("balance >= 0", name="ck_liability_balance"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    liability_id: Mapped[int] = mapped_column(ForeignKey("liabilities.id", ondelete="CASCADE"))
    reference_date: Mapped[dt.date] = mapped_column(Date)
    balance: Mapped[Decimal] = mapped_column(Money)
    note: Mapped[str | None] = mapped_column(Text)


class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    snapshot_date: Mapped[dt.date] = mapped_column(Date, unique=True)
    cash: Mapped[Decimal] = mapped_column(Money)
    investments: Mapped[Decimal] = mapped_column(Money)
    invested_cost: Mapped[Decimal] = mapped_column(Money)
    liabilities: Mapped[Decimal] = mapped_column(Money)
    gross: Mapped[Decimal] = mapped_column(Money)
    net: Mapped[Decimal] = mapped_column(Money)
    details: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Budget(TimestampMixin, Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("category_id", "month", name="uq_budgets_category_month"),
        CheckConstraint("amount > 0", name="ck_budgets_amount"),
        CheckConstraint("EXTRACT(DAY FROM month) = 1", name="ck_budgets_month_first_day"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"))
    month: Mapped[dt.date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)


class Goal(TimestampMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (CheckConstraint("target_amount > 0", name="ck_goals_target"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    target_amount: Mapped[Decimal] = mapped_column(Money)
    target_date: Mapped[dt.date | None] = mapped_column(Date)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class GoalContribution(Base):
    __tablename__ = "goal_contributions"
    __table_args__ = (CheckConstraint("amount <> 0", name="ck_goal_contrib_amount"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)  # negativo = retirada da destinação
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_entity", "entity", "entity_id"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    action: Mapped[str] = mapped_column(String(20))
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class SystemStatus(Base):
    """Chave/valor para estado operacional (batimento do worker, última atualização de cotações)."""

    __tablename__ = "system_status"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())
