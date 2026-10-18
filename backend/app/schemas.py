"""Contratos da API (entrada validada no backend; o frontend valida de novo só por usabilidade)."""

import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models import ACCOUNT_TYPES, ASSET_CLASSES

MoneyIn = Annotated[Decimal, Field(max_digits=16, decimal_places=2)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=16, decimal_places=2)]
NonNegMoney = Annotated[Decimal, Field(ge=0, max_digits=16, decimal_places=2)]
QtyIn = Annotated[Decimal, Field(max_digits=24, decimal_places=8)]
PriceIn = Annotated[Decimal, Field(gt=0, max_digits=24, decimal_places=8)]
Text200 = Annotated[str, Field(min_length=1, max_length=200)]

AccountType = Literal[ACCOUNT_TYPES]  # type: ignore[valid-type]
AssetClass = Literal[ASSET_CLASSES]  # type: ignore[valid-type]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _strip(v):
    return v.strip() if isinstance(v, str) else v


class _Clean(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def strip_strings(cls, v):
        return _strip(v)


# ---------- Autenticação ----------
class LoginIn(BaseModel):
    username: Annotated[str, Field(min_length=1, max_length=64)]
    password: Annotated[str, Field(min_length=1, max_length=256)]


class UserOut(Out):
    id: int
    username: str
    is_admin: bool


class UserCreateIn(BaseModel):
    username: Annotated[str, Field(min_length=3, max_length=64, pattern=r"^\s*[A-Za-z0-9._-]+\s*$")]
    password: Annotated[str, Field(min_length=12, max_length=256)]
    is_admin: bool = False


class UserUpdateIn(BaseModel):
    is_admin: bool
    is_active: bool


class UserAdminOut(UserOut):
    is_active: bool
    created_at: dt.datetime


# ---------- Contas ----------
class AccountIn(_Clean):
    name: Annotated[str, Field(min_length=1, max_length=100)]
    institution: Annotated[str, Field(max_length=100)] | None = None
    type: AccountType
    initial_balance: MoneyIn = Decimal("0")
    initial_balance_date: dt.date
    archived: bool = False
    notes: str | None = None


class AccountOut(Out):
    id: int
    name: str
    institution: str | None
    type: str
    initial_balance: Decimal
    initial_balance_date: dt.date
    archived: bool
    notes: str | None
    balance: Decimal = Decimal("0")
    pending_in: Decimal = Decimal("0")
    pending_out: Decimal = Decimal("0")


class ReconcileIn(BaseModel):
    date: dt.date
    actual_balance: MoneyIn
    note: Annotated[str, Field(max_length=500)] | None = None


# ---------- Categorias ----------
class CategoryIn(_Clean):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    kind: Literal["income", "expense"]
    parent_id: int | None = None
    archived: bool = False


class CategoryOut(Out):
    id: int
    name: str
    kind: str
    parent_id: int | None
    is_system: bool
    archived: bool


# ---------- Lançamentos ----------
class TransactionIn(_Clean):
    kind: Literal["income", "expense"]
    status: Literal["planned", "pending", "settled"]
    description: Text200
    amount: PositiveMoney
    date: dt.date
    due_date: dt.date | None = None
    settle_date: dt.date | None = None
    account_id: int
    category_id: int | None = None
    origin: Annotated[str, Field(max_length=100)] | None = None
    payment_method: Annotated[str, Field(max_length=40)] | None = None
    expense_type: Literal["fixed", "variable"] | None = None
    notes: str | None = None
    reconciled: bool = False

    @model_validator(mode="after")
    def check(self):
        if self.status == "settled" and self.settle_date is None:
            self.settle_date = self.date
        if self.status != "settled":
            self.settle_date = None
        if self.kind == "income":
            self.payment_method = None
            self.expense_type = None
        return self


class TransactionOut(Out):
    id: int
    kind: str
    status: str
    description: str
    amount: Decimal
    date: dt.date
    due_date: dt.date | None
    settle_date: dt.date | None
    account_id: int
    account_name: str | None = None
    category_id: int | None
    category_name: str | None = None
    origin: str | None
    payment_method: str | None
    expense_type: str | None
    notes: str | None
    reconciled: bool
    transfer_id: str | None
    recurrence_id: int | None
    investment_operation_id: int | None
    overdue: bool = False


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    sum_in: Decimal
    sum_out: Decimal


class TransferIn(_Clean):
    from_account_id: int
    to_account_id: int
    amount: PositiveMoney
    date: dt.date
    description: Annotated[str, Field(max_length=200)] | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def different_accounts(self):
        if self.from_account_id == self.to_account_id:
            raise ValueError("As contas de origem e destino devem ser diferentes.")
        return self


class DuplicateIn(BaseModel):
    date: dt.date | None = None
    status: Literal["planned", "pending", "settled"] | None = None


class RecurrenceIn(_Clean):
    kind: Literal["income", "expense"]
    description: Text200
    amount: PositiveMoney
    account_id: int
    category_id: int | None = None
    payment_method: Annotated[str, Field(max_length=40)] | None = None
    expense_type: Literal["fixed", "variable"] | None = None
    origin: Annotated[str, Field(max_length=100)] | None = None
    frequency: Literal["weekly", "monthly", "yearly"]
    interval_count: Annotated[int, Field(ge=1, le=36)] = 1
    start_date: dt.date
    end_date: dt.date | None = None
    due_day_offset: Annotated[int, Field(ge=0, le=60)] = 0
    active: bool = True
    notes: str | None = None

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("A data final deve ser posterior à inicial.")
        return self


class RecurrenceOut(Out):
    id: int
    kind: str
    description: str
    amount: Decimal
    account_id: int
    category_id: int | None
    payment_method: str | None
    expense_type: str | None
    origin: str | None
    frequency: str
    interval_count: int
    start_date: dt.date
    end_date: dt.date | None
    due_day_offset: int
    generated_until: dt.date | None
    active: bool
    notes: str | None


class ImportRow(BaseModel):
    line: int
    date: dt.date | None = None
    description: str | None = None
    amount: Decimal | None = None
    kind: str | None = None
    status: str | None = None
    category_id: int | None = None
    category_name: str | None = None
    account_id: int | None = None
    account_name: str | None = None
    notes: str | None = None
    errors: list[str] = []
    duplicate: bool = False
    import_hash: str | None = None


# ---------- Investimentos ----------
class AssetIn(_Clean):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    ticker: Annotated[str, Field(max_length=30)] | None = None
    asset_class: AssetClass
    institution: Annotated[str, Field(max_length=100)] | None = None
    currency: Currency = "BRL"
    auto_quote: bool = True
    indexer: Annotated[str, Field(max_length=30)] | None = None
    contracted_rate: Annotated[str, Field(max_length=50)] | None = None
    maturity_date: dt.date | None = None
    liquidity: Annotated[str, Field(max_length=50)] | None = None
    archived: bool = False
    notes: str | None = None

    @field_validator("ticker")
    @classmethod
    def upper(cls, v):
        return v.upper() if v else None


class OperationIn(_Clean):
    asset_id: int
    kind: Literal["buy", "sell", "income", "fee", "amortization", "adjustment"]
    date: dt.date
    quantity: QtyIn | None = None
    unit_price: Annotated[Decimal, Field(ge=0, max_digits=24, decimal_places=8)] | None = None
    gross_amount: NonNegMoney | None = None
    fees: NonNegMoney = Decimal("0")
    taxes: NonNegMoney = Decimal("0")
    fx_rate: Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=8)] | None = None
    income_type: Literal["dividend", "jcp", "fii_income", "coupon", "other"] | None = None
    income_status: Literal["announced", "received"] | None = None
    account_id: int | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def check_fields(self):
        k = self.kind
        if k in ("buy", "sell"):
            if self.quantity is None or self.quantity <= 0:
                raise ValueError("Informe a quantidade (maior que zero).")
            if self.unit_price is None:
                raise ValueError("Informe o preço unitário.")
        if k == "adjustment" and (self.quantity is None or self.quantity == 0):
            raise ValueError("Informe a variação de quantidade do ajuste (positiva ou negativa).")
        if k in ("income", "fee", "amortization") and (self.gross_amount is None or self.gross_amount <= 0):
            raise ValueError("Informe o valor bruto (maior que zero).")
        if k in ("income", "amortization") and self.taxes > (self.gross_amount or 0):
            raise ValueError("Os impostos não podem superar o valor bruto.")
        if k == "income":
            self.income_type = self.income_type or "other"
            self.income_status = self.income_status or "received"
        else:
            self.income_type = None
            self.income_status = None
        if k == "adjustment":
            self.account_id = None
        return self


class OperationOut(Out):
    id: int
    asset_id: int
    kind: str
    date: dt.date
    quantity: Decimal | None
    unit_price: Decimal | None
    gross_amount: Decimal | None
    fees: Decimal
    taxes: Decimal
    fx_rate: Decimal | None
    income_type: str | None
    income_status: str | None
    account_id: int | None
    notes: str | None
    cash_amount: Decimal | None = None
    transaction_id: int | None = None


class ManualQuoteIn(_Clean):
    price: PriceIn | None = None
    total_value: NonNegMoney | None = None
    reference_date: dt.date
    origin_info: Annotated[str, Field(max_length=200)] | None = None
    note: str | None = None

    @model_validator(mode="after")
    def one_value(self):
        if (self.price is None) == (self.total_value is None):
            raise ValueError("Informe o preço unitário OU o valor total estimado.")
        return self


class QuoteOut(Out):
    id: int
    asset_id: int
    source: str
    provider: str
    price: Decimal | None
    total_value: Decimal | None
    currency: str
    reference_date: dt.date
    received_at: dt.datetime
    origin_info: str | None
    note: str | None
    created_by: int | None


class FxRateIn(BaseModel):
    currency: Currency
    rate: Annotated[Decimal, Field(gt=0, max_digits=18, decimal_places=8)]
    reference_date: dt.date


# ---------- Patrimônio e planejamento ----------
class LiabilityIn(_Clean):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    kind: Annotated[str, Field(max_length=50)] | None = None
    archived: bool = False
    notes: str | None = None
    balance: NonNegMoney | None = None
    reference_date: dt.date | None = None


class LiabilityBalanceIn(BaseModel):
    reference_date: dt.date
    balance: NonNegMoney
    note: str | None = None


class BudgetIn(BaseModel):
    category_id: int
    month: dt.date
    amount: PositiveMoney

    @field_validator("month")
    @classmethod
    def first_day(cls, v: dt.date) -> dt.date:
        return v.replace(day=1)


class GoalIn(_Clean):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    target_amount: PositiveMoney
    target_date: dt.date | None = None
    archived: bool = False
    notes: str | None = None


class GoalContributionIn(BaseModel):
    date: dt.date
    amount: Annotated[Decimal, Field(max_digits=16, decimal_places=2)]
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def not_zero(cls, v):
        if v == 0:
            raise ValueError("O valor não pode ser zero.")
        return v
