import { useQuery } from "@tanstack/react-query";
import { Camera, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { brlShort, ChartBox, Legend, moneyFormatter, useChartTheme } from "../components/charts";
import {
  Button, ConfirmDialog, cx, railTone, Empty, ErrorBox, Field, inputCls, Loading, Money, MoneyInput, Notice, PageHeader, Panel,
  RowMenu, Sheet, SheetActions, Table, Tag, td, th,
} from "../components/ui";
import { date, monthLabel, parseDecimal, todayISO, toNum } from "../format";
import { useSave } from "../hooks";

type Liability = { id: number; name: string; kind: string | null; archived: boolean; notes: string | null;
  balance: string; reference_date: string | null };
type NW = { cash_available: string; cash_investment_accounts: string; cash_total: string;
  investments_market_value: string; invested_cost: string; liabilities: string; gross: string; net: string;
  liability_items: Liability[]; warnings: string[] };
type Point = { date: string; net: string; gross: string; cash: string; investments: string; liabilities: string;
  estimate: boolean };

export default function NetWorth() {
  const nw = useQuery({ queryKey: ["networth"], queryFn: () => api.get<NW>("/networth") });
  const hist = useQuery({ queryKey: ["networth-history"], queryFn: () => api.get<Point[]>("/networth/history") });
  const snap = useSave(() => api.post("/networth/snapshot"), "Retrato de hoje registrado.");
  const [newLia, setNewLia] = useState(false);
  const [balanceFor, setBalanceFor] = useState<Liability | null>(null);
  const [delLia, setDelLia] = useState<Liability | null>(null);
  const removeLia = useSave((l: Liability) => api.del(`/liabilities/${l.id}`), "Dívida removida.", () => setDelLia(null));
  const d = nw.data;

  return (
    <div>
      <PageHeader title="Patrimônio" context="O que você tem menos o que você deve, hoje e mês a mês."
        actions={<>
          <Button variant="secondary" icon={Camera} disabled={snap.isPending} onClick={() => snap.mutate(undefined)}
            title="Grava os valores de hoje no histórico (o servidor também faz isso todo dia)">Registrar retrato de hoje</Button>
          <Button icon={Plus} onClick={() => setNewLia(true)}>Nova dívida</Button>
        </>} />
      <ErrorBox error={nw.error} className="mb-4" />
      {nw.isLoading && <Loading rows={6} />}
      {d && (
        <>
          {d.warnings.length > 0 && <Notice tone="warn" className="mb-4">{d.warnings.join(" ")}</Notice>}
          {/* Balanço: ativos de um lado, passivos do outro e o líquido como resultado. */}
          <section aria-label="Balanço patrimonial" className="rounded-md border border-rule bg-sheet">
            <div className="grid md:grid-cols-2 md:divide-x md:divide-rule">
              <div className="p-5 sm:p-6">
                <h2 className="text-[15px] font-semibold">O que você tem</h2>
                <dl className="mt-3 divide-y divide-rule/70">
                  <BalanceLine label="Dinheiro em conta" note="Contas correntes, poupança e dinheiro"><Money value={d.cash_available} /></BalanceLine>
                  <BalanceLine label="Parado em corretoras" note="Saldo em contas de investimento"><Money value={d.cash_investment_accounts} /></BalanceLine>
                  <BalanceLine label="Investimentos" note={<>Valor de mercado; custo <Money value={d.invested_cost} size="sm" tone="muted" /></>}>
                    <Money value={d.investments_market_value} /></BalanceLine>
                </dl>
                <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink/80 pt-3">
                  <span className="font-semibold">Total de bens</span><Money value={d.gross} size="lg" />
                </div>
              </div>
              <div className="border-t border-rule p-5 sm:p-6 md:border-t-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">O que você deve</h2>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => setNewLia(true)}>Adicionar</Button>
                </div>
                {d.liability_items.length === 0 ? (
                  <Empty compact>Nenhuma dívida cadastrada. Financiamentos e saldos de cartão entram aqui.</Empty>
                ) : (
                  <ul className="mt-3 divide-y divide-rule/70">
                    {d.liability_items.map((l) => (
                      <li key={l.id} className="flex items-center gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="truncate">{l.name}</span>{l.archived && <Tag>Arquivada</Tag>}</div>
                          <div className="text-xs text-ink-soft">{[l.kind, l.reference_date && `saldo de ${date(l.reference_date)}`].filter(Boolean).join(" · ")}</div>
                        </div>
                        <Money value={l.balance} />
                        <RowMenu label={`Ações de ${l.name}`} items={[
                          { label: "Atualizar saldo", icon: Pencil, onSelect: () => setBalanceFor(l) },
                          { label: "Excluir", icon: Trash2, danger: true, onSelect: () => setDelLia(l) },
                        ]} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-2 flex items-baseline justify-between border-t-2 border-ink/80 pt-3">
                  <span className="font-semibold">Total de dívidas</span><Money value={d.liabilities} size="lg" className={toNum(d.liabilities) ? "text-neg" : ""} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 bg-rail px-5 py-6 text-rail-ink sm:px-6">
              <div>
                <div className="display font-figure text-lg font-[640]">Patrimônio líquido</div>
                <div className="mt-1 max-w-md text-xs text-rail-soft">Bens menos dívidas. Metas não entram: são destinos para dinheiro que já está nas contas.</div>
              </div>
              <Money value={d.net} size="hero" animate className={toNum(d.net) < 0 ? railTone(d.net) : ""} />
            </div>
          </section>
        </>
      )}

      <History points={hist.data ?? []} loading={hist.isLoading} />

      <Sheet open={newLia} onClose={() => setNewLia(false)} title="Nova dívida"
        description="Financiamento, empréstimo, saldo do cartão… O saldo devedor é atualizado por você."
        footer={<SheetActions form="lia-form" onCancel={() => setNewLia(false)} />}>
        {newLia && <LiabilityForm onDone={() => setNewLia(false)} />}
      </Sheet>
      <Sheet open={!!balanceFor} onClose={() => setBalanceFor(null)} title={`Saldo de ${balanceFor?.name ?? ""}`}
        footer={<SheetActions form="balance-form" onCancel={() => setBalanceFor(null)} />}>
        {balanceFor && <BalanceForm liability={balanceFor} onDone={() => setBalanceFor(null)} />}
      </Sheet>
      <ConfirmDialog open={!!delLia} title={`Excluir ${delLia?.name ?? "dívida"}`} onClose={() => setDelLia(null)} busy={removeLia.isPending}
        onConfirm={() => delLia && removeLia.mutate(delLia)}
        message="O histórico de saldos desta dívida também será apagado. Para guardar o histórico, registre saldo zero em vez de excluir." />
    </div>
  );
}

function BalanceLine({ label, note, children }: { label: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <div className="min-w-0"><dt>{label}</dt>{note && <dd className="text-xs text-ink-soft">{note}</dd>}</div>
      <dd>{children}</dd>
    </div>
  );
}

function History({ points, loading }: { points: Point[]; loading: boolean }) {
  const t = useChartTheme();
  const series = points.map((p) => ({ name: date(p.date) + (p.estimate ? " (estimado)" : ""), short: monthLabel(p.date.slice(0, 7)),
    "Líquido": toNum(p.net), "Dinheiro": toNum(p.cash), "Investimentos": toNum(p.investments), "Dívidas": toNum(p.liabilities) }));
  const colors = { "Líquido": t.brand, "Dinheiro": t.series[1], "Investimentos": t.series[2], "Dívidas": t.expense };
  return (
    <Panel title="Mês a mês" className="mt-4"
      aside={<Legend items={Object.entries(colors).map(([label, color]) => ({ label, color }))} />}>
      {loading ? <Loading /> : (
        <ChartBox empty={!series.some((p) => p["Líquido"] || p["Dinheiro"] || p["Investimentos"] || p["Dívidas"])} height={300}
          label="Linhas mensais de patrimônio líquido, dinheiro, investimentos e dívidas"
          table={
            <Table minWidth="min-w-[520px]">
              <thead><tr><th className={th}>Data</th><th className={cx(th, "text-right")}>Dinheiro</th><th className={cx(th, "text-right")}>Investimentos</th>
                <th className={cx(th, "text-right")}>Dívidas</th><th className={cx(th, "text-right")}>Líquido</th></tr></thead>
              <tbody>{points.map((p) => (
                <tr key={p.date}><td className={cx(td, "num")}>{date(p.date)}{p.estimate && <span className="text-ink-soft"> (estimado)</span>}</td>
                  <td className={cx(td, "text-right")}><Money value={p.cash} size="sm" /></td>
                  <td className={cx(td, "text-right")}><Money value={p.investments} size="sm" /></td>
                  <td className={cx(td, "text-right")}><Money value={p.liabilities} size="sm" /></td>
                  <td className={cx(td, "text-right")}><Money value={p.net} size="sm" /></td></tr>))}</tbody>
            </Table>
          }>
          <LineChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid {...t.grid} />
            <XAxis dataKey="short" tick={t.axis} tickLine={false} axisLine={{ stroke: t.rule }} minTickGap={16} />
            <YAxis tick={t.axis} tickFormatter={brlShort} width={56} tickLine={false} axisLine={false} />
            <Tooltip formatter={moneyFormatter} labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""} {...t.tooltip} />
            {Object.entries(colors).map(([k, c]) => (
              <Line key={k} dataKey={k} stroke={c} strokeWidth={k === "Líquido" ? 2.5 : 1.5} dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: t.sheet }} />
            ))}
          </LineChart>
        </ChartBox>
      )}
      <p className="mt-3 text-xs text-ink-soft">
        Os retratos diários guardam as cotações do dia. Meses sem retrato são estimados com os lançamentos e cotações conhecidos até a data.
      </p>
    </Panel>
  );
}

function LiabilityForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: "", kind: "", balance: "", reference_date: todayISO(), notes: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post("/liabilities", b), "Dívida cadastrada.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const b = parseDecimal(f.balance);
    if (b === null || Number(b) < 0) return setError("Saldo inválido.");
    save.mutate({ name: f.name, kind: f.kind || null, balance: b, reference_date: f.reference_date, notes: f.notes || null });
  }
  return (
    <form id="lia-form" onSubmit={submit} className="grid gap-4">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={120} autoFocus
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Tipo" hint="Opcional."><input className={inputCls} value={f.kind} maxLength={50} placeholder="Financiamento, cartão, empréstimo…"
        onChange={(e) => setF({ ...f, kind: e.target.value })} /></Field>
      <Field label="Saldo devedor"><MoneyInput value={f.balance} required onChange={(v) => setF({ ...f, balance: v })} /></Field>
      <Field label="Saldo em"><input type="date" className={inputCls} value={f.reference_date} required
        onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
      <ErrorBox error={error} />
    </form>
  );
}

function BalanceForm({ liability, onDone }: { liability: Liability; onDone: () => void }) {
  const hist = useQuery({ queryKey: ["liability", liability.id], queryFn: () =>
    api.get<{ id: number; reference_date: string; balance: string; note: string | null }[]>(`/liabilities/${liability.id}/balances`) });
  const [f, setF] = useState({ balance: "", reference_date: todayISO(), note: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post(`/liabilities/${liability.id}/balances`, b), "Saldo registrado.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const b = parseDecimal(f.balance);
    if (b === null || Number(b) < 0) return setError("Saldo inválido.");
    save.mutate({ balance: b, reference_date: f.reference_date, note: f.note || null });
  }
  return (
    <div className="space-y-6">
      <form id="balance-form" onSubmit={submit} className="grid gap-4">
        <Field label="Novo saldo devedor"><MoneyInput value={f.balance} required autoFocus onChange={(v) => setF({ ...f, balance: v })} /></Field>
        <Field label="Saldo em"><input type="date" className={inputCls} value={f.reference_date} required
          onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
        <Field label="Observação"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <ErrorBox error={error} />
      </form>
      <section>
        <h3 className="mb-2 text-sm font-medium">Histórico de saldos</h3>
        {!hist.data?.length ? <p className="text-sm text-ink-soft">Nenhum saldo anterior.</p> : (
          <ul className="divide-y divide-rule/70 text-sm">
            {hist.data.map((h) => (
              <li key={h.id} className="flex items-baseline justify-between py-2">
                <span className="num text-ink-soft">{date(h.reference_date)}{h.note && <span className="ml-2 text-xs">{h.note}</span>}</span>
                <Money value={h.balance} size="sm" />
              </li>))}
          </ul>
        )}
      </section>
    </div>
  );
}
