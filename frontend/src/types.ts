export interface Account {
  id: number;
  name: string;
  institution: string | null;
  type: string;
  initial_balance: string;
  initial_balance_date: string;
  archived: boolean;
  notes: string | null;
  balance: string;
  pending_in: string;
  pending_out: string;
}

export interface Category {
  id: number;
  name: string;
  kind: "income" | "expense";
  parent_id: number | null;
  is_system: boolean;
  archived: boolean;
}

export interface Transaction {
  id: number;
  kind: string;
  status: "planned" | "pending" | "settled";
  description: string;
  amount: string;
  date: string;
  due_date: string | null;
  settle_date: string | null;
  account_id: number;
  account_name: string | null;
  category_id: number | null;
  category_name: string | null;
  origin: string | null;
  payment_method: string | null;
  expense_type: string | null;
  notes: string | null;
  reconciled: boolean;
  transfer_id: string | null;
  recurrence_id: number | null;
  investment_operation_id: number | null;
  overdue: boolean;
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
  page: number;
  page_size: number;
  sum_in: string;
  sum_out: string;
}

export interface AssetRow {
  id: number;
  name: string;
  ticker: string | null;
  asset_class: string;
  institution: string | null;
  currency: string;
  auto_quote: boolean;
  indexer: string | null;
  contracted_rate: string | null;
  maturity_date: string | null;
  liquidity: string | null;
  archived: boolean;
  notes: string | null;
  provider: string | null;
  quantity: string;
  avg_price: string | null;
  cost_ccy: string;
  cost_brl: string;
  market_value_ccy: string | null;
  market_value_brl: string;
  valuation_method: "market" | "cost" | "no_fx";
  last_price: string | null;
  quote_total_value: string | null;
  quote_reference_date: string | null;
  quote_received_at: string | null;
  quote_source: string | null;
  quote_provider: string | null;
  quote_stale: boolean;
  fx_rate: string | null;
  unrealized_brl: string;
  asset_effect_brl: string | null;
  fx_effect_brl: string | null;
  realized_brl: string;
  income_brl: string;
  income_announced_brl: string;
  fees_brl: string;
  bought_brl: string;
  total_return_brl: string;
  simple_return: string | null;
  xirr: string | null;
  weight: string | null;
  warnings: string[];
}

export interface Operation {
  id: number;
  asset_id: number;
  kind: string;
  date: string;
  quantity: string | null;
  unit_price: string | null;
  gross_amount: string | null;
  fees: string;
  taxes: string;
  fx_rate: string | null;
  income_type: string | null;
  income_status: string | null;
  account_id: number | null;
  notes: string | null;
  cash_amount: string | null;
  transaction_id: number | null;
}

export interface QuoteRow {
  id: number;
  source: "auto" | "manual";
  provider: string;
  price: string | null;
  total_value: string | null;
  currency: string;
  reference_date: string;
  received_at: string;
  origin_info: string | null;
  note: string | null;
}
