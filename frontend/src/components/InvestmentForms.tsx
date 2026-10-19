import { useState, type FormEvent } from "react";
import { api } from "../api";
import { ASSET_CLASSES, decToInput, FIXED_INCOME, INCOME_TYPES, OP_KINDS, parseDecimal, todayISO } from "../format";
import { useAccounts, useSave } from "../hooks";
import type { AssetRow, Operation } from "../types";
import { Check, ErrorBox, Field, inputCls, MoneyInput, Segmented } from "./ui";

export function AssetForm({ initial, onDone, formId = "asset-form" }: { initial: AssetRow | null; onDone: () => void; formId?: string }) {
  const [f, setF] = useState({
    name: initial?.name ?? "", ticker: initial?.ticker ?? "", asset_class: initial?.asset_class ?? "br_stock",
    institution: initial?.institution ?? "", currency: initial?.currency ?? "BRL", auto_quote: initial?.auto_quote ?? true,
    indexer: initial?.indexer ?? "", contracted_rate: initial?.contracted_rate ?? "",
    maturity_date: initial?.maturity_date ?? "", liquidity: initial?.liquidity ?? "", archived: initial?.archived ?? false,
    notes: initial?.notes ?? "",
  });
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useSave((b: unknown) => (initial ? api.put(`/assets/${initial.id}`, b) : api.post("/assets", b)),
    "Ativo salvo.", onDone);
  const fixed = FIXED_INCOME.has(f.asset_class);
  function submit(e: FormEvent) {
    e.preventDefault();
    const n = (v: string) => v.trim() || null;
    save.mutate({ ...f, ticker: n(f.ticker), institution: n(f.institution), indexer: n(f.indexer),
      contracted_rate: n(f.contracted_rate), maturity_date: n(f.maturity_date), liquidity: n(f.liquidity),
      notes: n(f.notes), currency: f.currency.toUpperCase() });
  }
  return (
    <form id={formId} onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Classe" className="sm:col-span-2">
        <select className={inputCls} value={f.asset_class} onChange={s("asset_class")}>
          {Object.entries(ASSET_CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Ticker ou código" hint="Usado na cotação automática: PETR4, MXRF11, AAPL.">
        <input className={inputCls} value={f.ticker} onChange={s("ticker")} maxLength={30} autoFocus={!initial} /></Field>
      <Field label="Nome"><input className={inputCls} value={f.name} onChange={s("name")} required maxLength={120} /></Field>
      <Field label="Moeda" hint={initial && Number(initial.quantity) > 0 ? "Não muda com posição aberta." : "Código de 3 letras."}>
        <input className={inputCls} value={f.currency} onChange={s("currency")} pattern="[A-Za-z]{3}"
          required maxLength={3} disabled={!!initial && Number(initial.quantity) > 0} /></Field>
      <Field label="Corretora ou instituição"><input className={inputCls} value={f.institution} onChange={s("institution")} maxLength={100} /></Field>
      {fixed && (
        <>
          <Field label="Indexador"><input className={inputCls} value={f.indexer} onChange={s("indexer")}
            placeholder="CDI, IPCA, prefixado…" maxLength={30} /></Field>
          <Field label="Taxa contratada"><input className={inputCls} value={f.contracted_rate} onChange={s("contracted_rate")}
            placeholder="110% do CDI" maxLength={50} /></Field>
          <Field label="Vencimento"><input type="date" className={inputCls} value={f.maturity_date} onChange={s("maturity_date")} /></Field>
          <Field label="Liquidez"><input className={inputCls} value={f.liquidity} onChange={s("liquidity")}
            placeholder="Diária, no vencimento…" maxLength={50} /></Field>
        </>
      )}
      <Check className="sm:col-span-2" checked={f.auto_quote} onChange={(v) => setF({ ...f, auto_quote: v })}>Atualizar a cotação automaticamente</Check>
      {initial && <Check className="sm:col-span-2" checked={f.archived} onChange={(v) => setF({ ...f, archived: v })}>Arquivado (some da carteira)</Check>}
      <Field label="Observações" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes} onChange={s("notes")} /></Field>
      <p className="text-[13px] text-ink-soft sm:col-span-2">
        Quantidade, custo e preço médio vêm das operações. Para uma posição que você já tinha, registre uma compra (com a
        conta de onde saiu o dinheiro) ou um ajuste de posição (sem mexer no caixa).
      </p>
    </form>
  );
}

const OP_ORDER = ["buy", "sell", "income", "amortization", "fee", "adjustment"] as const;

export function OperationForm({ asset, initial, onDone, formId = "op-form" }: {
  asset: AssetRow; initial: Operation | null; onDone: () => void; formId?: string;
}) {
  const accounts = useAccounts();
  const [f, setF] = useState({
    kind: initial?.kind ?? "buy", date: initial?.date ?? todayISO(), quantity: decToInput(initial?.quantity),
    unit_price: decToInput(initial?.unit_price), gross_amount: decToInput(initial?.gross_amount),
    fees: decToInput(initial?.fees ?? "0"), taxes: decToInput(initial?.taxes ?? "0"), fx_rate: decToInput(initial?.fx_rate),
    income_type: initial?.income_type ?? "dividend", income_status: initial?.income_status ?? "received",
    account_id: initial ? String(initial.account_id ?? "") : String(accounts.data?.find((a) => a.type === "investment" && !a.archived)?.id ?? ""),
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useSave((b: unknown) => (initial ? api.put(`/operations/${initial.id}`, b) : api.post("/operations", b)),
    "Operação salva; posição recalculada.", onDone);
  const k = f.kind;
  const trade = k === "buy" || k === "sell" || k === "adjustment";
  const foreign = asset.currency !== "BRL";
  const cur = asset.currency;
  const labels: Record<string, string> = { quantity: "quantidade", unit_price: "preço unitário", gross_amount: "valor bruto",
    fees: "taxas", taxes: "impostos", fx_rate: "câmbio" };

  function submit(e: FormEvent) {
    e.preventDefault();
    const dec = (v: string) => (v.trim() ? parseDecimal(v) : null);
    const raw = { quantity: f.quantity, unit_price: f.unit_price, gross_amount: f.gross_amount, fees: f.fees, taxes: f.taxes, fx_rate: f.fx_rate };
    for (const [name, v] of Object.entries(raw))
      if (v.trim() && parseDecimal(v) === null) return setError(`Valor inválido em ${labels[name]}.`);
    setError(null);
    save.mutate({ asset_id: asset.id, kind: k, date: f.date, quantity: dec(f.quantity), unit_price: dec(f.unit_price),
      gross_amount: dec(f.gross_amount), fees: dec(f.fees) ?? "0", taxes: dec(f.taxes) ?? "0", fx_rate: dec(f.fx_rate),
      income_type: k === "income" ? f.income_type : null, income_status: k === "income" ? f.income_status : null,
      account_id: k === "adjustment" || !f.account_id ? null : Number(f.account_id), notes: f.notes || null });
  }

  return (
    <form id={formId} onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Operação" className="sm:col-span-2">
        <select className={inputCls} value={k} onChange={s("kind")}>
          {OP_ORDER.map((v) => <option key={v} value={v}>{OP_KINDS[v]}</option>)}</select></Field>
      <Field label="Data"><input type="date" className={inputCls} value={f.date} onChange={s("date")} required /></Field>
      {k === "income" && (
        <Field label="Tipo de provento"><select className={inputCls} value={f.income_type} onChange={s("income_type")}>
          {Object.entries(INCOME_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      )}
      {trade && (
        <>
          <Field label="Quantidade" hint={k === "adjustment" ? "Negativa para reduzir a posição." : undefined}>
            <MoneyInput prefix="" allowNegative={k === "adjustment"} value={f.quantity} placeholder="0"
              onChange={(v) => setF({ ...f, quantity: v })} required /></Field>
          <Field label="Preço unitário" hint={k === "adjustment" ? "Opcional: custo da posição." : undefined}>
            <MoneyInput prefix={cur === "BRL" ? "R$" : cur} value={f.unit_price} onChange={(v) => setF({ ...f, unit_price: v })} required={k !== "adjustment"} /></Field>
        </>
      )}
      {(k === "income" || k === "fee" || k === "amortization") && (
        <Field label="Valor bruto"><MoneyInput prefix={cur === "BRL" ? "R$" : cur} value={f.gross_amount} required
          onChange={(v) => setF({ ...f, gross_amount: v })} /></Field>
      )}
      {(k === "buy" || k === "sell") && <Field label="Taxas e corretagem"><MoneyInput prefix={cur === "BRL" ? "R$" : cur} value={f.fees}
        onChange={(v) => setF({ ...f, fees: v })} /></Field>}
      {(k === "income" || k === "amortization") && <Field label="Impostos retidos" hint="Conforme o informe da corretora.">
        <MoneyInput prefix={cur === "BRL" ? "R$" : cur} value={f.taxes} onChange={(v) => setF({ ...f, taxes: v })} /></Field>}
      {foreign && <Field label={`Câmbio (R$ por 1 ${cur})`} hint="Obrigatório para ativos em moeda estrangeira.">
        <MoneyInput value={f.fx_rate} onChange={(v) => setF({ ...f, fx_rate: v })} required={k !== "adjustment"} /></Field>}
      {k === "income" && (
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Situação</span>
          <Segmented label="Situação do provento" value={f.income_status} onChange={(v) => setF({ ...f, income_status: v })}
            options={[["received", "Recebido"], ["announced", "Anunciado"]]} />
        </div>
      )}
      {k !== "adjustment" && (
        <Field label="Conta do dinheiro" hint="Sem conta, a operação não movimenta caixa." className="sm:col-span-2">
          <select className={inputCls} value={f.account_id} onChange={s("account_id")}>
            <option value="">Nenhuma</option>
            {accounts.data?.filter((a) => !a.archived || String(a.id) === f.account_id).map((a) =>
              <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></Field>
      )}
      <Field label="Observações" className="sm:col-span-2"><input className={inputCls} value={f.notes} onChange={s("notes")} /></Field>
      <div className="sm:col-span-2"><ErrorBox error={error} /></div>
    </form>
  );
}
