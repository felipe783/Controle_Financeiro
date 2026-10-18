// Formatação brasileira. Valores chegam da API como string decimal ("1234.56") para não perder precisão;
// só são convertidos para number na hora de exibir ou desenhar gráficos.

export type Dec = string | number | null | undefined;

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pctFmt = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const toNum = (v: Dec): number => (v === null || v === undefined || v === "" ? 0 : Number(v));

export function brl(v: Dec): string {
  if (v === null || v === undefined || v === "") return "—";
  return brlFmt.format(Number(v));
}

export function money(v: Dec, currency = "BRL"): string {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(v));
}

export function num(v: Dec, max = 8): string {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: max }).format(Number(v));
}

export function pct(v: Dec): string {
  if (v === null || v === undefined || v === "") return "—";
  return pctFmt.format(Number(v));
}

/** "2026-01-05" → "05/01/2026" sem passar por Date (evita deslocamento de fuso). */
export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${names[Number(m) - 1]}/${y.slice(2)}`;
}

/**
 * Converte o que o usuário digitou ("1.234,56", "1234.56", "R$ 10") para a string decimal da API.
 * Devolve null se não for um número válido.
 */
export function parseDecimal(input: string): string | null {
  let s = input.trim().replace(/R\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

/** Valor da API → texto editável em formato brasileiro ("1234.50" → "1234,50"). */
export function decToInput(v: Dec): string {
  if (v === null || v === undefined || v === "") return "";
  return String(v).replace(".", ",");
}

export const KIND_LABEL: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
  transfer_in: "Transferência (entrada)",
  transfer_out: "Transferência (saída)",
  adjustment_in: "Ajuste (+)",
  adjustment_out: "Ajuste (−)",
  investment_in: "Investimento (resgate)",
  investment_out: "Investimento (aplicação)",
};

export function statusLabel(kind: string, status: string): string {
  if (status === "planned") return "Prevista";
  if (status === "pending") return "Pendente";
  return kind === "income" ? "Recebida" : kind === "expense" ? "Paga" : "Efetivada";
}

export const ACCOUNT_TYPES: Record<string, string> = {
  checking: "Conta corrente",
  savings: "Poupança",
  payment: "Conta de pagamento",
  cash: "Dinheiro em espécie",
  investment: "Conta de investimento",
  other: "Outra",
};

export const ASSET_CLASSES: Record<string, string> = {
  br_stock: "Ações brasileiras",
  fii: "Fundos imobiliários",
  etf: "ETFs",
  treasury: "Tesouro Direto",
  cdb: "CDB",
  lci_lca: "LCI / LCA",
  fixed_income: "Outros renda fixa",
  fund: "Fundos de investimento",
  international: "Internacionais",
  other: "Outros ativos",
};

export const OP_KINDS: Record<string, string> = {
  buy: "Compra / aporte",
  sell: "Venda / resgate",
  income: "Provento",
  fee: "Taxa",
  amortization: "Amortização",
  adjustment: "Ajuste de posição",
};

export const INCOME_TYPES: Record<string, string> = {
  dividend: "Dividendo",
  jcp: "Juros sobre capital próprio",
  fii_income: "Rendimento de FII",
  coupon: "Cupom",
  other: "Outro",
};

export const FIXED_INCOME = new Set(["treasury", "cdb", "lci_lca", "fixed_income", "fund"]);
