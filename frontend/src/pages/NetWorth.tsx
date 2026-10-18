import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { axis, brlShort, ChartBox, INCOME, moneyFormatter, NEUTRAL, tooltipStyle } from "../components/charts";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, FormActions, inputCls, Loading, Modal, MoneyInput, PageHeader, Stat, Table, td, th, toneOf } from "../components/ui";
import { brl, date, parseDecimal, todayISO, toNum } from "../format";
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
  const snap = useSave(() => api.post("/networth/snapshot"), "Snapshot de hoje registrado.");
  const [newLia, setNewLia] = useState(false);
  const [balanceFor, setBalanceFor] = useState<Liability | null>(null);
  const [delLia, setDelLia] = useState<Liability | null>(null);
  const removeLia = useSave((l: Liability) => api.del(`/liabilities/${l.id}`), "Dívida removida.", () => setDelLia(null));
  const d = nw.data;
  const series = (hist.data ?? []).map((p) => ({ name: date(p.date) + (p.estimate ? " (est.)" : ""),
    "Líquido": toNum(p.net), "Caixa": toNum(p.cash), "Investimentos": toNum(p.investments), "Dívidas": toNum(p.liabilities) }));

  return (
    <div className="space-y-6">
      <PageHeader title="Patrimônio" actions={<>
          <Button variant="secondary" onClick={() => snap.mutate(undefined)}>Registrar snapshot de hoje</Button>
          <Button onClick={() => setNewLia(true)}>+ Dívida / obrigação</Button>
      </>} />
      <ErrorBox error={nw.error} />
      {nw.isLoading && <Loading />}
      {d && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Dinheiro disponível" value={brl(d.cash_available)} hint="Contas que não são de investimento" />
            <Stat label="Caixa em contas de investimento" value={brl(d.cash_investment_accounts)} />
            <Stat label="Investimentos (valor estimado)" value={brl(d.investments_market_value)}
              hint={`Custo: ${brl(d.invested_cost)}`} />
            <Stat label="Patrimônio bruto (ativos)" value={brl(d.gross)} />
            <Stat label="Dívidas e obrigações" value={brl(d.liabilities)} tone={toNum(d.liabilities) ? "neg" : undefined} />
            <Stat label="Patrimônio líquido" value={brl(d.net)} tone={toneOf(d.net)} hint="Ativos − passivos" />
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            O caixa parado na corretora conta uma única vez, como dinheiro; comprar um ativo apenas troca dinheiro por
            investimento. Metas não somam ao patrimônio (são destinações de valores existentes).
          </p>
          {d.warnings.length > 0 && <ErrorBox error={d.warnings.join(" · ")} />}
        </>
      )}
      <Card title="Evolução do patrimônio">
        <ChartBox empty={!series.some((p) => p["Líquido"] || p["Caixa"] || p["Investimentos"] || p["Dívidas"])} label="Linhas de patrimônio líquido, caixa, investimentos e dívidas" height={300}>
          <LineChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
            <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
            <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
            <Line dataKey="Líquido" stroke={INCOME} strokeWidth={2} />
            <Line dataKey="Caixa" stroke={NEUTRAL} />
            <Line dataKey="Investimentos" stroke="#7c3aed" />
            <Line dataKey="Dívidas" stroke="#be123c" />
          </LineChart>
        </ChartBox>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Snapshots são registrados diariamente pelo worker e preservam as cotações da data. Pontos “(est.)” são fins de
          mês sem snapshot, estimados com lançamentos e cotações conhecidas até aquela data.
        </p>
      </Card>
      <Card title="Dívidas e obrigações">
        {!d?.liability_items.length ? <Empty>Nenhuma dívida cadastrada.</Empty> : (
          <Table>
            <thead><tr><th className={th}>Nome</th><th className={th}>Tipo</th><th className={`${th} text-right`}>Saldo devedor</th>
              <th className={th}>Atualizado em</th><th className={th}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{d.liability_items.map((l) => (
              <tr key={l.id}><td className={td}>{l.name} {l.archived && <Badge>Arquivada</Badge>}</td>
                <td className={td}>{l.kind ?? "—"}</td>
                <td className={`${td} text-right tabular-nums`}>{brl(l.balance)}</td>
                <td className={td}>{date(l.reference_date)}</td>
                <td className={`${td} text-right`}>
                  <Button variant="ghost" onClick={() => setBalanceFor(l)}>Atualizar saldo</Button>
                  <Button variant="ghost" className="text-red-700" onClick={() => setDelLia(l)}>Excluir</Button></td></tr>))}
            </tbody>
          </Table>
        )}
      </Card>
      <Modal open={newLia} onClose={() => setNewLia(false)} title="Nova dívida / obrigação">
        {newLia && <LiabilityForm onDone={() => setNewLia(false)} />}
      </Modal>
      <Modal open={!!balanceFor} onClose={() => setBalanceFor(null)} title={`Saldo de ${balanceFor?.name ?? ""}`}>
        {balanceFor && <BalanceForm liability={balanceFor} onDone={() => setBalanceFor(null)} />}
      </Modal>
      <ConfirmDialog open={!!delLia} title="Excluir dívida" onClose={() => setDelLia(null)} busy={removeLia.isPending}
        onConfirm={() => delLia && removeLia.mutate(delLia)}
        message="O histórico de saldos desta dívida também será removido. Para preservá-lo, prefira zerar o saldo." />
    </div>
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
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={120}
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Tipo"><input className={inputCls} value={f.kind} maxLength={50} placeholder="Financiamento, cartão…"
        onChange={(e) => setF({ ...f, kind: e.target.value })} /></Field>
      <Field label="Saldo devedor atual (R$)"><MoneyInput value={f.balance} required
        onChange={(v) => setF({ ...f, balance: v })} /></Field>
      <Field label="Data de referência"><input type="date" className={inputCls} value={f.reference_date} required
        onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
      <ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} />
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
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Novo saldo devedor (R$)"><MoneyInput value={f.balance} required onChange={(v) => setF({ ...f, balance: v })} /></Field>
      <Field label="Data de referência"><input type="date" className={inputCls} value={f.reference_date} required
        onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
      <Field label="Observação"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <ErrorBox error={error} />
      <FormActions onCancel={onDone} busy={save.isPending} />
      <div className="text-sm">
        <div className="mb-1 font-medium">Histórico</div>
        {hist.data?.map((h) => <div key={h.id} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
          <span>{date(h.reference_date)}</span><span className="tabular-nums">{brl(h.balance)}</span></div>)}
      </div>
    </form>
  );
}
