import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import {
  Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, FormActions, inputCls, Loading, Modal, MoneyInput,
  Stat, Table, td, th, toneOf,
} from "../components/ui";
import {
  ASSET_CLASSES, brl, date, dateTime, decToInput, FIXED_INCOME, INCOME_TYPES, money, num, OP_KINDS, parseDecimal, pct,
  todayISO,
} from "../format";
import { useAccounts, useSave } from "../hooks";
import type { AssetRow, Operation, QuoteRow } from "../types";

type Portfolio = { items: AssetRow[]; totals: Record<string, string>; xirr: string | null; simple_return: string | null;
  providers: string[] };
type QStatus = { providers: string[]; fx_provider: string | null; auto_update: boolean; interval_minutes: number;
  last_run: Record<string, unknown> | null; worker_heartbeat: string | null;
  logs: { id: number; ticker: string | null; pair: string | null; provider: string; status: string; price: string | null;
    reference_date: string | null; received_at: string; error: string | null; trigger: string }[] };

const METHOD: Record<string, string> = { market: "Cotação", cost: "Pelo custo (sem cotação)", no_fx: "Sem câmbio" };

export default function Investments() {
  const pf = useQuery({ queryKey: ["portfolio"], queryFn: () => api.get<Portfolio>("/portfolio") });
  const status = useQuery({ queryKey: ["quotes-status"], queryFn: () => api.get<QStatus>("/quotes/status") });
  const [editAsset, setEditAsset] = useState<AssetRow | null | undefined>(undefined);
  const [detail, setDetail] = useState<number | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const update = useSave(() => api.post("/quotes/update"), "Atualização de cotações concluída (veja o status).");
  const t = pf.data?.totals;
  const items = (pf.data?.items ?? []).filter((a) => showArchived || !a.archived);
  const last = status.data?.last_run as { finished_at?: string; ok?: number; errors?: number; skipped?: number } | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Investimentos</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => update.mutate(undefined)} disabled={update.isPending}>
            {update.isPending ? "Atualizando…" : "Atualizar cotações"}</Button>
          <Button onClick={() => setEditAsset(null)}>+ Novo ativo</Button>
        </div>
      </div>

      {status.data && status.data.providers.length === 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900
          dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Nenhum provedor de cotações configurado. O sistema funciona com preços informados manualmente; para
          atualização automática configure BRAPI_TOKEN (B3) e/ou ALPHAVANTAGE_API_KEY (exterior) no .env.
        </div>
      )}
      <p className="text-xs text-slate-500">
        Provedores: {status.data?.providers.join(", ") || "nenhum"} · Câmbio: {status.data?.fx_provider ?? "manual"} ·
        Atualização automática: {status.data?.auto_update ? `a cada ${status.data.interval_minutes} min` : "desligada"} ·
        Última execução: {last?.finished_at ? `${dateTime(last.finished_at)} (${last.ok} ok, ${last.errors} erro(s), ${last.skipped} em cache)` : "nunca"}.
        Os dados dos provedores têm atraso e não são tempo real.
      </p>

      <ErrorBox error={pf.error} />
      {t && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Custo da carteira" value={brl(t.cost_brl)} hint={`Total aportado: ${brl(t.bought_brl)}`} />
          <Stat label="Valor de mercado estimado" value={brl(t.market_value_brl)} />
          <Stat label="Não realizado" value={brl(t.unrealized_brl)} tone={toneOf(t.unrealized_brl)} />
          <Stat label="Retorno total (R$)" value={brl(t.total_return_brl)} tone={toneOf(t.total_return_brl)}
            hint={`Realizado ${brl(t.realized_brl)} · Proventos ${brl(t.income_brl)} · Taxas ${brl(t.fees_brl)}`} />
          <Stat label="Rentabilidade (TIR)" value={pf.data?.xirr ? `${pct(pf.data.xirr)} a.a.` : "—"}
            hint={`Retorno simples sobre aportes: ${pct(pf.data?.simple_return)}. TIR exige 30+ dias de histórico.`} />
        </div>
      )}

      <Card title="Carteira" actions={<label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Mostrar arquivados</label>}>
        {pf.isLoading ? <Loading /> : items.length === 0 ? <Empty>Nenhum ativo cadastrado.</Empty> : (
          <Table>
            <thead><tr><th className={th}>Ativo</th><th className={th}>Classe</th><th className={`${th} text-right`}>Qtd.</th>
              <th className={`${th} text-right`}>Preço médio</th><th className={`${th} text-right`}>Último preço</th>
              <th className={`${th} text-right`}>Valor (R$)</th><th className={`${th} text-right`}>Resultado</th>
              <th className={`${th} text-right`}>Part.</th></tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                onClick={() => setDetail(a.id)}>
                <td className={td}><button className="text-left font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                  onClick={() => setDetail(a.id)}>{a.ticker ?? a.name}</button>
                  <div className="text-xs text-slate-500">{a.ticker ? a.name : a.institution}</div></td>
                <td className={td}>{ASSET_CLASSES[a.asset_class]}</td>
                <td className={`${td} text-right tabular-nums`}>{num(a.quantity)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(a.avg_price, a.currency)}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {a.last_price ? money(a.last_price, a.currency) : a.quote_total_value ? "Avaliação total" : "—"}
                  <div className="text-xs text-slate-500">{a.quote_reference_date ? date(a.quote_reference_date) : "sem cotação"}
                    {a.quote_source === "manual" && " · manual"}</div>
                  {a.quote_stale && <Badge tone="amber">Desatualizada</Badge>}</td>
                <td className={`${td} text-right tabular-nums`}>{brl(a.market_value_brl)}
                  {a.valuation_method !== "market" && <div><Badge tone="amber">{METHOD[a.valuation_method]}</Badge></div>}</td>
                <td className={`${td} text-right tabular-nums ${Number(a.total_return_brl) < 0 ? "text-red-700" : "text-emerald-700"}`}>
                  {brl(a.total_return_brl)}<div className="text-xs">{a.xirr ? `TIR ${pct(a.xirr)} a.a.` : ""}</div></td>
                <td className={`${td} text-right tabular-nums`}>{pct(a.weight)}</td>
              </tr>))}</tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Últimas consultas aos provedores">
          {!status.data?.logs.length ? <Empty>Nenhuma consulta realizada.</Empty> : (
            <div className="max-h-72 overflow-auto"><Table>
              <thead><tr><th className={th}>Quando</th><th className={th}>Ativo</th><th className={th}>Provedor</th>
                <th className={th}>Estado</th><th className={th}>Preço / erro</th></tr></thead>
              <tbody>{status.data.logs.map((l) => (
                <tr key={l.id}><td className={td}>{dateTime(l.received_at)}</td><td className={td}>{l.ticker ?? l.pair}</td>
                  <td className={td}>{l.provider}</td>
                  <td className={td}><Badge tone={l.status === "ok" ? "green" : "red"}>{l.status}</Badge></td>
                  <td className={td}>{l.status === "ok" ? `${num(l.price)} (ref. ${date(l.reference_date)})` : l.error}</td></tr>))}
              </tbody></Table></div>
          )}
        </Card>
        <FxCard />
      </div>

      <Modal open={editAsset !== undefined} onClose={() => setEditAsset(undefined)}
        title={editAsset ? "Editar ativo" : "Novo ativo"}>
        {editAsset !== undefined && <AssetForm initial={editAsset} onDone={() => setEditAsset(undefined)} />}
      </Modal>
      <Modal open={detail !== null} onClose={() => setDetail(null)} title="Detalhes do ativo" wide>
        {detail !== null && <AssetDetail id={detail} onEdit={(a) => { setDetail(null); setEditAsset(a); }}
          onClose={() => setDetail(null)} />}
      </Modal>
    </div>
  );
}

function AssetForm({ initial, onDone }: { initial: AssetRow | null; onDone: () => void }) {
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome"><input className={inputCls} value={f.name} onChange={s("name")} required maxLength={120} /></Field>
      <Field label="Ticker / código" hint="Usado na consulta automática (ex.: PETR4, MXRF11, AAPL).">
        <input className={inputCls} value={f.ticker} onChange={s("ticker")} maxLength={30} /></Field>
      <Field label="Classe">
        <select className={inputCls} value={f.asset_class} onChange={s("asset_class")}>
          {Object.entries(ASSET_CLASSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Moeda"><input className={inputCls} value={f.currency} onChange={s("currency")} pattern="[A-Za-z]{3}"
        required maxLength={3} disabled={!!initial && Number(initial.quantity) > 0} /></Field>
      <Field label="Corretora / instituição"><input className={inputCls} value={f.institution} onChange={s("institution")}
        maxLength={100} /></Field>
      <label className="flex items-center gap-2 text-sm sm:pt-6">
        <input type="checkbox" checked={f.auto_quote} onChange={(e) => setF({ ...f, auto_quote: e.target.checked })} />
        Atualizar cotação automaticamente</label>
      {fixed && (
        <>
          <Field label="Indexador"><input className={inputCls} value={f.indexer} onChange={s("indexer")}
            placeholder="CDI, IPCA, Prefixado…" maxLength={30} /></Field>
          <Field label="Taxa contratada"><input className={inputCls} value={f.contracted_rate} onChange={s("contracted_rate")}
            placeholder="110% do CDI" maxLength={50} /></Field>
          <Field label="Vencimento"><input type="date" className={inputCls} value={f.maturity_date}
            onChange={s("maturity_date")} /></Field>
          <Field label="Liquidez"><input className={inputCls} value={f.liquidity} onChange={s("liquidity")}
            placeholder="Diária, no vencimento…" maxLength={50} /></Field>
        </>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} />
        Arquivado</label>
      <Field label="Observações" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes}
        onChange={s("notes")} /></Field>
      <p className="text-xs text-slate-500 sm:col-span-2">
        Quantidade, custo e preço médio são calculados pelas operações. Para uma posição já existente, registre uma
        compra (com conta) ou um “ajuste de posição” (sem movimentar dinheiro).
      </p>
      <div className="sm:col-span-2"><FormActions onCancel={onDone} busy={save.isPending} /></div>
    </form>
  );
}

function AssetDetail({ id, onEdit, onClose }: { id: number; onEdit: (a: AssetRow) => void; onClose: () => void }) {
  const a = useQuery({ queryKey: ["asset", id], queryFn: () => api.get<AssetRow>(`/assets/${id}`) });
  const ops = useQuery({ queryKey: ["operations", id], queryFn: () => api.get<Operation[]>("/operations", { asset_id: id }) });
  const quotes = useQuery({ queryKey: ["quotes", id], queryFn: () => api.get<QuoteRow[]>(`/assets/${id}/quotes`) });
  const accounts = useAccounts();
  const [op, setOp] = useState<Operation | null | undefined>(undefined);
  const [delOp, setDelOp] = useState<Operation | null>(null);
  const [delAsset, setDelAsset] = useState(false);
  const removeOp = useSave((o: Operation) => api.del(`/operations/${o.id}`), "Operação excluída.", () => setDelOp(null));
  const removeQuote = useSave((qid: number) => api.del(`/quotes/${qid}`), "Cotação manual removida.");
  const removeAsset = useSave(() => api.del(`/assets/${id}`), "Ativo excluído.", onClose);
  const updateOne = useSave(() => api.post("/quotes/update", {}, { asset_id: id }), "Consulta realizada.");
  const accName = (aid: number | null) => accounts.data?.find((x) => x.id === aid)?.name ?? "—";
  if (a.isLoading) return <Loading />;
  if (!a.data) return <ErrorBox error={a.error} />;
  const d = a.data;
  const cur = d.currency;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="text-lg font-semibold">{d.ticker ?? d.name}</div>
          <div className="text-sm text-slate-500">{d.name} · {ASSET_CLASSES[d.asset_class]} · {cur}
            {d.provider ? ` · provedor ${d.provider}` : " · cotação manual"}</div></div>
        <div className="flex gap-2">
          {d.provider && d.auto_quote && <Button variant="secondary" onClick={() => updateOne.mutate(undefined)}>Consultar cotação</Button>}
          <Button variant="secondary" onClick={() => onEdit(d)}>Editar ativo</Button>
          <Button variant="danger" onClick={() => setDelAsset(true)}>Excluir</Button>
        </div>
      </div>
      {d.warnings.length > 0 && <ErrorBox error={d.warnings.join(" ")} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Quantidade" value={num(d.quantity)} hint={`Preço médio ${money(d.avg_price, cur)}`} />
        <Stat label="Custo de aquisição" value={brl(d.cost_brl)} hint={cur !== "BRL" ? money(d.cost_ccy, cur) : undefined} />
        <Stat label="Valor de mercado" value={brl(d.market_value_brl)}
          hint={d.quote_received_at ? `Cotação de ${date(d.quote_reference_date)}, recebida ${dateTime(d.quote_received_at)}` : "Sem cotação"} />
        <Stat label="Não realizado" value={brl(d.unrealized_brl)} tone={toneOf(d.unrealized_brl)}
          hint={d.fx_effect_brl ? `Ativo ${brl(d.asset_effect_brl)} · Câmbio ${brl(d.fx_effect_brl)}` : undefined} />
        <Stat label="Resultado realizado" value={brl(d.realized_brl)} tone={toneOf(d.realized_brl)} />
        <Stat label="Proventos recebidos" value={brl(d.income_brl)} hint={`Anunciados: ${brl(d.income_announced_brl)}`} />
        <Stat label="Retorno total (R$)" value={brl(d.total_return_brl)} tone={toneOf(d.total_return_brl)}
          hint={`Taxas avulsas: ${brl(d.fees_brl)}`} />
        <Stat label="Rentabilidade (TIR)" value={d.xirr ? `${pct(d.xirr)} a.a.` : "—"}
          hint={`Simples s/ aportes: ${pct(d.simple_return)}`} />
      </div>

      <Card title="Operações" actions={<Button onClick={() => setOp(null)}>+ Operação</Button>}>
        {!ops.data?.length ? <Empty>Nenhuma operação.</Empty> : (
          <Table>
            <thead><tr><th className={th}>Data</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Qtd.</th>
              <th className={`${th} text-right`}>Preço</th><th className={`${th} text-right`}>Valor bruto</th>
              <th className={`${th} text-right`}>Custos</th><th className={`${th} text-right`}>Caixa (R$)</th>
              <th className={th}>Conta</th><th className={th}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{ops.data.map((o) => (
              <tr key={o.id}><td className={td}>{date(o.date)}</td>
                <td className={td}>{OP_KINDS[o.kind]}{o.income_type && ` · ${INCOME_TYPES[o.income_type]}`}
                  {o.income_status === "announced" && <> <Badge tone="amber">Anunciado</Badge></>}</td>
                <td className={`${td} text-right tabular-nums`}>{num(o.quantity)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(o.unit_price, cur)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(o.gross_amount, cur)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(Number(o.fees) + Number(o.taxes), cur)}</td>
                <td className={`${td} text-right tabular-nums`}>{brl(o.cash_amount)}</td>
                <td className={td}>{accName(o.account_id)}</td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  <Button variant="ghost" onClick={() => setOp(o)}>Editar</Button>
                  <Button variant="ghost" className="text-red-700" onClick={() => setDelOp(o)}>Excluir</Button></td></tr>))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card title="Cotações e avaliações (histórico de fontes)">
        <ManualQuoteForm assetId={id} currency={cur} fixed={FIXED_INCOME.has(d.asset_class)} />
        <p className="my-2 text-xs text-slate-500">
          Prioridade: vale a cotação com data de referência mais recente; na mesma data, a manual prevalece sobre a
          automática. Nenhuma cotação é apagada por atualizações.
        </p>
        {!quotes.data?.length ? <Empty>Nenhuma cotação registrada.</Empty> : (
          <div className="max-h-64 overflow-auto"><Table>
            <thead><tr><th className={th}>Referência</th><th className={th}>Fonte</th><th className={`${th} text-right`}>Preço</th>
              <th className={`${th} text-right`}>Valor total</th><th className={th}>Recebida</th><th className={th}>Obs.</th>
              <th className={th}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{quotes.data.map((q) => (
              <tr key={q.id}><td className={td}>{date(q.reference_date)}</td>
                <td className={td}><Badge tone={q.source === "manual" ? "blue" : "slate"}>{q.source === "manual" ? "Manual" : q.provider}</Badge></td>
                <td className={`${td} text-right tabular-nums`}>{money(q.price, q.currency)}</td>
                <td className={`${td} text-right tabular-nums`}>{money(q.total_value, q.currency)}</td>
                <td className={td}>{dateTime(q.received_at)}</td>
                <td className={td}>{[q.origin_info, q.note].filter(Boolean).join(" · ") || "—"}</td>
                <td className={td}>{q.source === "manual" && <Button variant="ghost" className="text-red-700"
                  onClick={() => removeQuote.mutate(q.id)}>Remover</Button>}</td></tr>))}
            </tbody></Table></div>
        )}
      </Card>

      <Modal open={op !== undefined} onClose={() => setOp(undefined)} title={op ? "Editar operação" : "Nova operação"}>
        {op !== undefined && <OperationForm asset={d} initial={op} onDone={() => setOp(undefined)} />}
      </Modal>
      <ConfirmDialog open={!!delOp} title="Excluir operação" onClose={() => setDelOp(null)} busy={removeOp.isPending}
        onConfirm={() => delOp && removeOp.mutate(delOp)}
        message="A posição será recalculada e o lançamento de caixa vinculado será removido junto." />
      <ConfirmDialog open={delAsset} title="Excluir ativo" onClose={() => setDelAsset(false)} busy={removeAsset.isPending}
        onConfirm={() => removeAsset.mutate(undefined)}
        message="Só ativos sem operações podem ser excluídos; os demais devem ser arquivados." />
    </div>
  );
}

function OperationForm({ asset, initial, onDone }: { asset: AssetRow; initial: Operation | null; onDone: () => void }) {
  const accounts = useAccounts();
  const [f, setF] = useState({
    kind: initial?.kind ?? "buy", date: initial?.date ?? todayISO(), quantity: decToInput(initial?.quantity),
    unit_price: decToInput(initial?.unit_price), gross_amount: decToInput(initial?.gross_amount),
    fees: decToInput(initial?.fees ?? "0"), taxes: decToInput(initial?.taxes ?? "0"), fx_rate: decToInput(initial?.fx_rate),
    income_type: initial?.income_type ?? "dividend", income_status: initial?.income_status ?? "received",
    account_id: initial ? String(initial.account_id ?? "") : String(accounts.data?.find((a) => a.type === "investment")?.id ?? ""),
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = useSave((b: unknown) => (initial ? api.put(`/operations/${initial.id}`, b) : api.post("/operations", b)),
    "Operação salva; posição recalculada.", onDone);
  const k = f.kind;
  const trade = k === "buy" || k === "sell" || k === "adjustment";
  const foreign = asset.currency !== "BRL";

  function submit(e: FormEvent) {
    e.preventDefault();
    const dec = (v: string) => (v.trim() ? parseDecimal(v) : null);
    const vals = { quantity: dec(f.quantity), unit_price: dec(f.unit_price), gross_amount: dec(f.gross_amount),
      fees: dec(f.fees) ?? "0", taxes: dec(f.taxes) ?? "0", fx_rate: dec(f.fx_rate) };
    for (const [name, raw] of Object.entries({ quantity: f.quantity, unit_price: f.unit_price,
      gross_amount: f.gross_amount, fees: f.fees, taxes: f.taxes, fx_rate: f.fx_rate }))
      if (raw.trim() && parseDecimal(raw) === null) return setError(`Valor inválido em ${name}.`);
    setError(null);
    save.mutate({ asset_id: asset.id, kind: k, date: f.date, ...vals,
      income_type: k === "income" ? f.income_type : null, income_status: k === "income" ? f.income_status : null,
      account_id: k === "adjustment" || !f.account_id ? null : Number(f.account_id), notes: f.notes || null });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo"><select className={inputCls} value={k} onChange={s("kind")}>
        {Object.entries(OP_KINDS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field label="Data"><input type="date" className={inputCls} value={f.date} onChange={s("date")} required /></Field>
      {trade && (
        <>
          <Field label="Quantidade" hint={k === "adjustment" ? "Negativa para reduzir a posição." : undefined}>
            <MoneyInput allowNegative={k === "adjustment"} value={f.quantity} placeholder="0"
              onChange={(v) => setF({ ...f, quantity: v })} required /></Field>
          <Field label={`Preço unitário (${asset.currency})`} hint={k === "adjustment" ? "Opcional: custo da posição." : undefined}>
            <MoneyInput value={f.unit_price} onChange={(v) => setF({ ...f, unit_price: v })} required={k !== "adjustment"} /></Field>
        </>
      )}
      {(k === "income" || k === "fee" || k === "amortization") && (
        <Field label={`Valor bruto (${asset.currency})`}><MoneyInput value={f.gross_amount} required
          onChange={(v) => setF({ ...f, gross_amount: v })} /></Field>
      )}
      {k === "income" && (
        <>
          <Field label="Tipo de provento"><select className={inputCls} value={f.income_type} onChange={s("income_type")}>
            {Object.entries(INCOME_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Situação"><select className={inputCls} value={f.income_status} onChange={s("income_status")}>
            <option value="received">Recebido (entra no caixa)</option>
            <option value="announced">Anunciado / previsto</option></select></Field>
        </>
      )}
      {(k === "buy" || k === "sell") && <Field label="Taxas e custos"><MoneyInput value={f.fees}
        onChange={(v) => setF({ ...f, fees: v })} /></Field>}
      {(k === "income" || k === "amortization") && <Field label="Impostos retidos" hint="Informe conforme o informe da corretora.">
        <MoneyInput value={f.taxes} onChange={(v) => setF({ ...f, taxes: v })} /></Field>}
      {foreign && <Field label={`Câmbio (R$ por 1 ${asset.currency})`} hint="Obrigatório para ativos em moeda estrangeira.">
        <MoneyInput value={f.fx_rate} onChange={(v) => setF({ ...f, fx_rate: v })} required={k !== "adjustment"} /></Field>}
      {k !== "adjustment" && (
        <Field label="Conta do dinheiro" hint="Sem conta, a operação não movimenta caixa.">
          <select className={inputCls} value={f.account_id} onChange={s("account_id")}>
            <option value="">Nenhuma</option>
            {accounts.data?.filter((a) => !a.archived || String(a.id) === f.account_id).map((a) =>
              <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></Field>
      )}
      <Field label="Observações" className="sm:col-span-2"><input className={inputCls} value={f.notes} onChange={s("notes")} /></Field>
      <div className="sm:col-span-2"><ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} /></div>
    </form>
  );
}

function ManualQuoteForm({ assetId, currency, fixed }: { assetId: number; currency: string; fixed: boolean }) {
  const [mode, setMode] = useState<"price" | "total">(fixed ? "total" : "price");
  const [f, setF] = useState({ value: "", reference_date: todayISO(), origin_info: "", note: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post(`/assets/${assetId}/quotes`, b), "Cotação manual registrada.",
    () => setF({ ...f, value: "", note: "" }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = parseDecimal(f.value);
    if (!v || Number(v) < 0) return setError("Valor inválido.");
    setError(null);
    save.mutate({ [mode === "price" ? "price" : "total_value"]: v, reference_date: f.reference_date,
      origin_info: f.origin_info || null, note: f.note || null });
  }
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-5">
      <Field label="Informar"><select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as "price")}>
        <option value="price">Preço unitário</option><option value="total">Valor total da posição</option></select></Field>
      <Field label={`Valor (${currency})`}><MoneyInput value={f.value} onChange={(v) => setF({ ...f, value: v })} required /></Field>
      <Field label="Data de referência"><input type="date" className={inputCls} value={f.reference_date} required
        onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
      <Field label="Origem"><input className={inputCls} value={f.origin_info} maxLength={200} placeholder="Extrato, app…"
        onChange={(e) => setF({ ...f, origin_info: e.target.value })} /></Field>
      <div className="flex items-end"><Button type="submit" disabled={save.isPending}>Registrar</Button></div>
      <div className="sm:col-span-5"><ErrorBox error={error} /></div>
    </form>
  );
}

function FxCard() {
  const fx = useQuery({ queryKey: ["fx"], queryFn: () => api.get<{ id: number; currency: string; rate: string;
    reference_date: string; source: string }[]>("/fx") });
  const [f, setF] = useState({ currency: "USD", rate: "", reference_date: todayISO() });
  const save = useSave((b: unknown) => api.post("/fx", b), "Câmbio registrado.");
  return (
    <Card title="Câmbio (R$ por unidade)">
      <form className="mb-3 grid gap-2 sm:grid-cols-4" onSubmit={(e) => { e.preventDefault();
        const r = parseDecimal(f.rate); if (r) save.mutate({ ...f, rate: r, currency: f.currency.toUpperCase() }); }}>
        <Field label="Moeda"><input className={inputCls} value={f.currency} maxLength={3} required pattern="[A-Za-z]{3}"
          onChange={(e) => setF({ ...f, currency: e.target.value })} /></Field>
        <Field label="Taxa"><MoneyInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} required /></Field>
        <Field label="Data"><input type="date" className={inputCls} value={f.reference_date} required
          onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
        <div className="flex items-end"><Button type="submit">Registrar manual</Button></div>
      </form>
      {!fx.data?.length ? <Empty>Nenhuma taxa registrada. Com ativos em moeda estrangeira, o PTAX do Banco Central é
        consultado automaticamente.</Empty> : (
        <div className="max-h-48 overflow-auto"><Table>
          <thead><tr><th className={th}>Moeda</th><th className={th}>Taxa</th><th className={th}>Referência</th>
            <th className={th}>Fonte</th></tr></thead>
          <tbody>{fx.data.map((r) => <tr key={r.id}><td className={td}>{r.currency}</td><td className={td}>{num(r.rate, 6)}</td>
            <td className={td}>{date(r.reference_date)}</td><td className={td}>{r.source}</td></tr>)}</tbody>
        </Table></div>
      )}
    </Card>
  );
}
