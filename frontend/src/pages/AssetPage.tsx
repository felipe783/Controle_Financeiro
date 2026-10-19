import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { AssetForm, OperationForm } from "../components/InvestmentForms";
import {
  Button, ConfirmDialog, cx, Empty, ErrorBox, Field, Figure, focusRing, inputCls, Loading, Money, MoneyInput, Notice,
  RowMenu, Segmented, Sheet, SheetActions, Status, Table, Tag, td, th,
} from "../components/ui";
import {
  ASSET_CLASSES, date, dateTime, FIXED_INCOME, INCOME_TYPES, money, num, OP_KINDS, parseDecimal, pct, todayISO,
} from "../format";
import { useAccounts, useSave } from "../hooks";
import type { AssetRow, Operation, QuoteRow } from "../types";

/** Página do ativo: posição, resultado, operações e fontes de cotação, com endereço próprio (/investimentos/:id). */
export default function AssetPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const a = useQuery({ queryKey: ["asset", id], queryFn: () => api.get<AssetRow>(`/assets/${id}`) });
  const [tab, setTab] = useState<"ops" | "quotes">("ops");
  const [editing, setEditing] = useState(false);
  const [op, setOp] = useState<Operation | null | undefined>(undefined);
  const [delAsset, setDelAsset] = useState(false);
  const removeAsset = useSave(() => api.del(`/assets/${id}`), "Ativo excluído.", () => navigate("/investimentos"));
  const updateOne = useSave(() => api.post("/quotes/update", {}, { asset_id: id }), "Cotação consultada.");

  const back = (
    <Link to="/investimentos" className={cx("mb-4 inline-flex items-center gap-1.5 rounded text-sm text-ink-soft hover:text-ink", focusRing)}>
      <ArrowLeft aria-hidden="true" className="size-4" />Investimentos</Link>
  );
  if (a.isLoading) return <div>{back}<Loading rows={8} /></div>;
  if (!a.data) {
    return <div>{back}{a.error instanceof ApiError && a.error.status === 404
      ? <Empty title="Ativo não encontrado">Ele pode ter sido excluído.</Empty> : <ErrorBox error={a.error} />}</div>;
  }
  const d = a.data;
  const cur = d.currency;

  return (
    <div>
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4 pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h1 className="font-figure text-3xl font-semibold tracking-tight">{d.ticker ?? d.name}</h1>
            {d.archived && <Tag>Arquivado</Tag>}
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            {[d.ticker ? d.name : null, ASSET_CLASSES[d.asset_class], cur !== "BRL" ? `em ${cur}` : null, d.institution,
              d.provider ? `cotação por ${d.provider}` : "cotação manual"].filter(Boolean).join(" · ")}
          </p>
          {FIXED_INCOME.has(d.asset_class) && (d.indexer || d.contracted_rate || d.maturity_date) && (
            <p className="mt-0.5 text-sm text-ink-soft">
              {[d.contracted_rate ?? d.indexer, d.maturity_date && `vence em ${date(d.maturity_date)}`, d.liquidity && `liquidez ${d.liquidity}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.provider && d.auto_quote && <Button variant="secondary" icon={RefreshCw} disabled={updateOne.isPending}
            onClick={() => updateOne.mutate(undefined)}>Consultar cotação</Button>}
          <Button icon={Plus} onClick={() => { setTab("ops"); setOp(null); }}>Nova operação</Button>
          <RowMenu label="Mais ações do ativo" items={[
            { label: "Editar ativo", icon: Pencil, onSelect: () => setEditing(true) },
            { label: "Excluir ativo", icon: Trash2, danger: true, onSelect: () => setDelAsset(true) },
          ]} />
        </div>
      </header>

      {d.warnings.length > 0 && <Notice tone="warn" className="mb-4">{d.warnings.join(" ")}</Notice>}

      <section aria-label="Posição e resultado" className="rounded-md border border-rule bg-sheet">
        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:p-6">
          <div>
            <div className="text-sm text-ink-soft">Valor de mercado</div>
            <div className="mt-2"><Money value={d.market_value_brl} size="hero" /></div>
            <p className="mt-2 text-[13px] text-ink-soft">
              {d.quote_received_at ? `Cotação de ${date(d.quote_reference_date)}, recebida ${dateTime(d.quote_received_at)}` : "Sem cotação: avaliado pelo custo"}
              {d.quote_stale && <> · <Status tone="warn">desatualizada</Status></>}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 md:grid-cols-4">
            <Figure label="Quantidade"><span className="num font-figure text-lg font-semibold">{num(d.quantity)}</span></Figure>
            <Figure label="Preço médio"><span className="num font-figure text-lg font-semibold">{money(d.avg_price, cur)}</span></Figure>
            <Figure label="Última cotação"><span className="num font-figure text-lg font-semibold">{d.last_price ? money(d.last_price, cur) : "—"}</span></Figure>
            <Figure label="Custo" note={cur !== "BRL" ? money(d.cost_ccy, cur) : undefined}><Money value={d.cost_brl} size="fig" /></Figure>
            <Figure label="Não realizado" note={d.fx_effect_brl ? <>ativo <Money value={d.asset_effect_brl} size="sm" tone="muted" />, câmbio <Money value={d.fx_effect_brl} size="sm" tone="muted" /></> : undefined}>
              <Money value={d.unrealized_brl} tone="signed" size="fig" /></Figure>
            <Figure label="Realizado"><Money value={d.realized_brl} tone="signed" size="fig" /></Figure>
            <Figure label="Proventos" note={Number(d.income_announced_brl) ? <>anunciados <Money value={d.income_announced_brl} size="sm" tone="muted" /></> : undefined}>
              <Money value={d.income_brl} size="fig" /></Figure>
            <Figure label="Retorno total" note={d.xirr ? `TIR ${pct(d.xirr)} ao ano` : `Simples: ${pct(d.simple_return)}`}>
              <Money value={d.total_return_brl} tone="signed" size="fig" /></Figure>
          </dl>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between gap-2">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[["ops", "Operações"], ["quotes", "Cotações"]]} />
      </div>
      <div className="mt-3">
        {tab === "ops" ? <Operations asset={d} onEdit={setOp} /> : <Quotes asset={d} />}
      </div>

      <Sheet open={op !== undefined} onClose={() => setOp(undefined)} title={op ? "Editar operação" : `Nova operação em ${d.ticker ?? d.name}`}
        footer={<SheetActions form="op-form" onCancel={() => setOp(undefined)} />}>
        {op !== undefined && <OperationForm asset={d} initial={op} onDone={() => setOp(undefined)} />}
      </Sheet>
      <Sheet open={editing} onClose={() => setEditing(false)} title="Editar ativo"
        footer={<SheetActions form="asset-form" onCancel={() => setEditing(false)} />}>
        {editing && <AssetForm initial={d} onDone={() => setEditing(false)} />}
      </Sheet>
      <ConfirmDialog open={delAsset} title={`Excluir ${d.ticker ?? d.name}`} onClose={() => setDelAsset(false)} busy={removeAsset.isPending}
        onConfirm={() => removeAsset.mutate(undefined)}
        message="Só ativos sem operações podem ser excluídos. Se houver histórico, edite o ativo e marque como arquivado." />
    </div>
  );
}

function Operations({ asset, onEdit }: { asset: AssetRow; onEdit: (o: Operation) => void }) {
  const ops = useQuery({ queryKey: ["operations", asset.id], queryFn: () => api.get<Operation[]>("/operations", { asset_id: asset.id }) });
  const accounts = useAccounts();
  const [del, setDel] = useState<Operation | null>(null);
  const remove = useSave((o: Operation) => api.del(`/operations/${o.id}`), "Operação excluída; posição recalculada.", () => setDel(null));
  const accName = (aid: number | null) => accounts.data?.find((x) => x.id === aid)?.name;
  const cur = asset.currency;
  return (
    <div className="rounded-md border border-rule bg-sheet">
      {ops.isLoading ? <div className="p-5"><Loading /></div> : !ops.data?.length ? (
        <Empty title="Nenhuma operação">Registre a primeira compra para formar a posição.</Empty>
      ) : (
        <Table minWidth="min-w-0">
          <thead><tr>
            <th className={th}>Data</th><th className={th}>Operação</th>
            <th className={cx(th, "hidden text-right md:table-cell")}>Quantidade</th>
            <th className={cx(th, "hidden text-right md:table-cell")}>Preço</th>
            <th className={cx(th, "hidden text-right lg:table-cell")}>Custos</th>
            <th className={cx(th, "text-right")}>No caixa</th>
            <th className={cx(th, "w-12")}><span className="sr-only">Ações</span></th>
          </tr></thead>
          <tbody>{ops.data.map((o) => (
            <tr key={o.id} className="hover:bg-ink/[0.025]">
              <td className={cx(td, "num whitespace-nowrap text-ink-soft")}>{date(o.date)}</td>
              <td className={td}>
                <div className="font-medium">{OP_KINDS[o.kind]}{o.income_type && `: ${INCOME_TYPES[o.income_type]}`}</div>
                <div className="text-xs text-ink-soft">
                  {o.income_status === "announced" ? <Status tone="warn">Anunciado</Status> : accName(o.account_id) ?? "Sem movimentar caixa"}
                </div>
              </td>
              <td className={cx(td, "num hidden text-right md:table-cell")}>{num(o.quantity)}</td>
              <td className={cx(td, "num hidden text-right md:table-cell")}>{o.unit_price ? money(o.unit_price, cur) : money(o.gross_amount, cur)}</td>
              <td className={cx(td, "num hidden text-right text-ink-soft lg:table-cell")}>{Number(o.fees) + Number(o.taxes) ? money(Number(o.fees) + Number(o.taxes), cur) : "—"}</td>
              <td className={cx(td, "whitespace-nowrap text-right")}>
                {o.cash_amount ? <Money value={o.cash_amount} size="sm" flow={["sell", "income", "amortization"].includes(o.kind) ? "in" : "out"} /> : <span className="text-ink-faint">—</span>}
              </td>
              <td className={cx(td, "text-right")}>
                <RowMenu label="Ações da operação" items={[
                  { label: "Editar", icon: Pencil, onSelect: () => onEdit(o) },
                  { label: "Excluir", icon: Trash2, danger: true, onSelect: () => setDel(o) },
                ]} />
              </td>
            </tr>))}
          </tbody>
        </Table>
      )}
      <ConfirmDialog open={!!del} title="Excluir operação" onClose={() => setDel(null)} busy={remove.isPending}
        onConfirm={() => del && remove.mutate(del)}
        message="A posição é recalculada e o lançamento de caixa ligado a ela sai junto do extrato." />
    </div>
  );
}

function Quotes({ asset }: { asset: AssetRow }) {
  const quotes = useQuery({ queryKey: ["quotes", asset.id], queryFn: () => api.get<QuoteRow[]>(`/assets/${asset.id}/quotes`) });
  const remove = useSave((qid: number) => api.del(`/quotes/${qid}`), "Cotação manual removida.");
  return (
    <div className="space-y-4">
      <ManualQuoteForm assetId={asset.id} currency={asset.currency} fixed={FIXED_INCOME.has(asset.asset_class)} />
      <div className="rounded-md border border-rule bg-sheet">
        <p className="border-b border-rule px-4 py-2.5 text-[13px] text-ink-soft sm:px-5">
          Vale a cotação com a data de referência mais recente; na mesma data, a manual prevalece. Atualizações nunca apagam cotações.
        </p>
        {!quotes.data?.length ? <div className="px-5"><Empty compact>Nenhuma cotação registrada.</Empty></div> : (
          <div className="max-h-96 overflow-auto">
            <Table minWidth="min-w-0">
              <thead><tr><th className={th}>Referência</th><th className={th}>Fonte</th><th className={cx(th, "text-right")}>Preço ou valor</th>
                <th className={cx(th, "hidden md:table-cell")}>Recebida</th><th className={cx(th, "w-12")}><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>{quotes.data.map((q) => (
                <tr key={q.id}>
                  <td className={cx(td, "num whitespace-nowrap")}>{date(q.reference_date)}</td>
                  <td className={td}>{q.source === "manual" ? <span className="font-medium text-anil">Manual</span> : q.provider}
                    {(q.origin_info || q.note) && <div className="text-xs text-ink-soft">{[q.origin_info, q.note].filter(Boolean).join(" · ")}</div>}</td>
                  <td className={cx(td, "num whitespace-nowrap text-right")}>{q.price ? money(q.price, q.currency) : <>{money(q.total_value, q.currency)} <span className="text-xs text-ink-soft">total</span></>}</td>
                  <td className={cx(td, "num hidden whitespace-nowrap text-ink-soft md:table-cell")}>{dateTime(q.received_at)}</td>
                  <td className={cx(td, "text-right")}>{q.source === "manual" && <RowMenu label="Ações da cotação" items={[
                    { label: "Remover", icon: Trash2, danger: true, onSelect: () => remove.mutate(q.id) }]} />}</td>
                </tr>))}
              </tbody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualQuoteForm({ assetId, currency, fixed }: { assetId: number; currency: string; fixed: boolean }) {
  const [mode, setMode] = useState<"price" | "total">(fixed ? "total" : "price");
  const [f, setF] = useState({ value: "", reference_date: todayISO(), origin_info: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post(`/assets/${assetId}/quotes`, b), "Cotação registrada.",
    () => setF({ ...f, value: "" }));
  function submit(e: FormEvent) {
    e.preventDefault();
    const v = parseDecimal(f.value);
    if (!v || Number(v) < 0) return setError("Valor inválido.");
    setError(null);
    save.mutate({ [mode === "price" ? "price" : "total_value"]: v, reference_date: f.reference_date,
      origin_info: f.origin_info || null, note: null });
  }
  return (
    <form onSubmit={submit} className="rounded-md border border-rule bg-sheet p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Informar cotação</h2>
        <Segmented size="sm" label="Informar" value={mode} onChange={setMode} options={[["price", "Preço unitário"], ["total", "Valor total da posição"]]} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label={mode === "price" ? "Preço" : "Valor total"}>
          <MoneyInput prefix={currency === "BRL" ? "R$" : currency} value={f.value} onChange={(v) => setF({ ...f, value: v })} required /></Field>
        <Field label="Data de referência"><input type="date" className={inputCls} value={f.reference_date} required
          onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
        <Field label="Origem"><input className={inputCls} value={f.origin_info} maxLength={200} placeholder="Extrato, app do banco…"
          onChange={(e) => setF({ ...f, origin_info: e.target.value })} /></Field>
        <Button type="submit" variant="secondary" disabled={save.isPending}>Registrar</Button>
      </div>
      <ErrorBox error={error} className="mt-3" />
    </form>
  );
}
