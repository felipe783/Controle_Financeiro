import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, FormActions, inputCls, Loading, Modal, MoneyInput, PageHeader, Stat, Table, td, th } from "../components/ui";
import { brl, date, decToInput, parseDecimal, pct, todayISO, toNum } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave } from "../hooks";
import type { Transaction } from "../types";

type BudgetRow = { id: number; category_id: number; category_name: string; amount: string; spent: string;
  committed: string; remaining: string; percent: string; status: "ok" | "warning" | "exceeded" };
type GoalRow = { id: number; name: string; target_amount: string; target_date: string | null; archived: boolean;
  notes: string | null; saved: string; remaining: string; progress: string | null; months_left: number | null;
  monthly_needed: string | null };
type Rule = { id: number; kind: string; description: string; amount: string; account_id: number; category_id: number | null;
  frequency: string; interval_count: number; start_date: string; end_date: string | null; due_day_offset: number;
  generated_until: string | null; active: boolean; payment_method: string | null; expense_type: string | null;
  origin: string | null; notes: string | null };

const FREQ: Record<string, string> = { weekly: "Semanal", monthly: "Mensal", yearly: "Anual" };

export default function Planning() {
  return (
    <div className="space-y-6">
      <PageHeader title="Planejamento" description="Previsão de caixa, orçamentos por categoria, metas e lançamentos recorrentes." />
      <Forecast />
      <Budgets />
      <Goals />
      <Recurrences />
    </div>
  );
}

function Forecast() {
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["forecast", days], queryFn: () => api.get<{ current_cash: string; expected_in: string;
    expected_out: string; projected_cash: string; items: Transaction[]; overdue: Transaction[] }>("/forecast", { days }) });
  const d = q.data;
  return (
    <Card title="Previsão de caixa" actions={<select aria-label="Horizonte" className={`${inputCls} w-auto`} value={days}
      onChange={(e) => setDays(Number(e.target.value))}>
      {[7, 30, 60, 90].map((n) => <option key={n} value={n}>Próximos {n} dias</option>)}</select>}>
      <ErrorBox error={q.error} />
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Saldo atual" value={brl(d.current_cash)} />
            <Stat label="Entradas previstas" value={brl(d.expected_in)} tone="pos" />
            <Stat label="Saídas previstas" value={brl(d.expected_out)} tone="neg" />
            <Stat label="Saldo projetado" value={brl(d.projected_cash)} tone={toNum(d.projected_cash) < 0 ? "neg" : undefined} />
          </div>
          {d.items.length > 0 && (
            <div className="mt-3 max-h-64 overflow-auto"><Table>
              <thead><tr><th className={th}>Data</th><th className={th}>Descrição</th><th className={th}>Conta</th>
                <th className={`${th} text-right`}>Valor</th></tr></thead>
              <tbody>{d.items.map((t) => (
                <tr key={t.id}><td className={td}>{date(t.due_date ?? t.date)} {t.overdue && <Badge tone="red">Atrasada</Badge>}</td>
                  <td className={td}>{t.description}</td><td className={td}>{t.account_name}</td>
                  <td className={`${td} text-right tabular-nums ${t.kind === "income" ? "text-emerald-700" : "text-red-700"}`}>
                    {t.kind === "income" ? "+" : "−"} {brl(t.amount)}</td></tr>))}</tbody>
            </Table></div>
          )}
        </>
      )}
    </Card>
  );
}

function Budgets() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const cats = useCategories();
  const q = useQuery({ queryKey: ["budgets", month], queryFn: () => api.get<BudgetRow[]>("/budgets", { month: `${month}-01` }) });
  const [f, setF] = useState({ category_id: "", amount: "" });
  const save = useSave((b: unknown) => api.put("/budgets", b), "Orçamento salvo.", () => setF({ category_id: "", amount: "" }));
  const del = useSave((id: number) => api.del(`/budgets/${id}`), "Orçamento removido.");
  const prev = (() => { const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; })();
  const copy = useSave(() => api.post("/budgets/copy", {}, { source: prev, target: `${month}-01` }), "Orçamentos copiados.");
  const tone = { ok: "green", warning: "amber", exceeded: "red" } as const;
  const label = { ok: "Dentro", warning: "Próximo do limite", exceeded: "Ultrapassado" };

  return (
    <Card title="Orçamento mensal por categoria" actions={<>
      <input type="month" aria-label="Mês" className={`${inputCls} w-auto`} value={month} onChange={(e) => setMonth(e.target.value)} />
      <Button variant="secondary" onClick={() => copy.mutate(undefined)}>Copiar do mês anterior</Button></>}>
      <form className="mb-3 grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault();
        const a = parseDecimal(f.amount); if (a && f.category_id) save.mutate({ category_id: Number(f.category_id), month: `${month}-01`, amount: a }); }}>
        <Field label="Categoria"><select className={inputCls} value={f.category_id} required
          onChange={(e) => setF({ ...f, category_id: e.target.value })}><option value="">Escolha…</option>
          {categoryOptions(cats.data, "expense").filter((c) => !c.label.includes("›")).map((c) =>
            <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Limite (R$)"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
        <div className="flex items-end"><Button type="submit">Definir limite</Button></div>
      </form>
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty>Nenhum orçamento para este mês.</Empty> : (
        <ul className="space-y-3">{q.data.map((b) => (
          <li key={b.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{b.category_name} <Badge tone={tone[b.status]}>{label[b.status]}</Badge></span>
              <span className="tabular-nums">{brl(b.spent)} de {brl(b.amount)} ({pct(b.percent)})
                {toNum(b.committed) > 0 && <span className="text-slate-600 dark:text-slate-400"> · {brl(b.committed)} previstos</span>}
                <Button variant="ghost" className="text-red-700" onClick={() => del.mutate(b.id)}>Remover</Button></span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700" role="progressbar"
              aria-valuenow={Math.round(toNum(b.percent) * 100)} aria-valuemin={0} aria-valuemax={100}
              aria-label={`Consumo do orçamento de ${b.category_name}`}>
              <div className={`h-full ${b.status === "exceeded" ? "bg-red-600" : b.status === "warning" ? "bg-amber-500" : "bg-emerald-600"}`}
                style={{ width: `${Math.min(100, toNum(b.percent) * 100)}%` }} />
            </div>
          </li>))}</ul>
      )}
    </Card>
  );
}

function Goals() {
  const q = useQuery({ queryKey: ["goals"], queryFn: () => api.get<GoalRow[]>("/goals") });
  const [edit, setEdit] = useState<GoalRow | null | undefined>(undefined);
  const [contrib, setContrib] = useState<GoalRow | null>(null);
  const [del, setDel] = useState<GoalRow | null>(null);
  const remove = useSave((g: GoalRow) => api.del(`/goals/${g.id}`), "Meta removida.", () => setDel(null));
  return (
    <Card title="Metas financeiras" actions={<Button onClick={() => setEdit(null)}>+ Meta</Button>}>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">Metas são destinações de dinheiro que você já tem ou vai acumular; não
        somam ao patrimônio.</p>
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty>Nenhuma meta. Ex.: reserva de emergência, viagem.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">{q.data.map((g) => (
          <div key={g.id} className={`rounded-md border border-slate-200 p-3 dark:border-slate-700 ${g.archived ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between"><span className="font-medium">{g.name}</span>
              <span className="text-sm tabular-nums">{pct(g.progress)}</span></div>
            <div className="my-2 h-2 overflow-hidden rounded bg-slate-200 dark:bg-slate-700" role="progressbar"
              aria-label={`Progresso de ${g.name}`} aria-valuenow={Math.round(toNum(g.progress) * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, toNum(g.progress) * 100)}%` }} /></div>
            <div className="text-sm text-slate-600 dark:text-slate-400">{brl(g.saved)} de {brl(g.target_amount)}
              {g.target_date && ` · prazo ${date(g.target_date)}`}
              {g.monthly_needed && ` · ${brl(g.monthly_needed)}/mês para chegar lá`}</div>
            <div className="mt-2 flex gap-1">
              <Button variant="secondary" onClick={() => setContrib(g)}>Aportar / retirar</Button>
              <Button variant="ghost" onClick={() => setEdit(g)}>Editar</Button>
              <Button variant="ghost" className="text-red-700" onClick={() => setDel(g)}>Excluir</Button>
            </div>
          </div>))}</div>
      )}
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? "Editar meta" : "Nova meta"}>
        {edit !== undefined && <GoalForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Modal>
      <Modal open={!!contrib} onClose={() => setContrib(null)} title={`Aporte em ${contrib?.name ?? ""}`}>
        {contrib && <ContributionForm goal={contrib} onDone={() => setContrib(null)} />}
      </Modal>
      <ConfirmDialog open={!!del} title="Excluir meta" onClose={() => setDel(null)} busy={remove.isPending}
        onConfirm={() => del && remove.mutate(del)} message="A meta e seus aportes registrados serão removidos." />
    </Card>
  );
}

function GoalForm({ initial, onDone }: { initial: GoalRow | null; onDone: () => void }) {
  const [f, setF] = useState({ name: initial?.name ?? "", target_amount: decToInput(initial?.target_amount),
    target_date: initial?.target_date ?? "", archived: initial?.archived ?? false, notes: initial?.notes ?? "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => (initial ? api.put(`/goals/${initial.id}`, b) : api.post("/goals", b)), "Meta salva.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const t = parseDecimal(f.target_amount);
    if (!t || Number(t) <= 0) return setError("Valor-alvo inválido.");
    save.mutate({ ...f, target_amount: t, target_date: f.target_date || null, notes: f.notes || null });
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={120}
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Valor-alvo (R$)"><MoneyInput value={f.target_amount} required onChange={(v) => setF({ ...f, target_amount: v })} /></Field>
      <Field label="Prazo"><input type="date" className={inputCls} value={f.target_date}
        onChange={(e) => setF({ ...f, target_date: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.archived}
        onChange={(e) => setF({ ...f, archived: e.target.checked })} /> Concluída / arquivada</label>
      <ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} />
    </form>
  );
}

function ContributionForm({ goal, onDone }: { goal: GoalRow; onDone: () => void }) {
  const hist = useQuery({ queryKey: ["goal", goal.id], queryFn: () =>
    api.get<{ id: number; date: string; amount: string; notes: string | null }[]>(`/goals/${goal.id}/contributions`) });
  const [f, setF] = useState({ date: todayISO(), amount: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post(`/goals/${goal.id}/contributions`, b), "Aporte registrado.", onDone);
  const remove = useSave((id: number) => api.del(`/goals/${goal.id}/contributions/${id}`), "Aporte removido.");
  function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseDecimal(f.amount);
    if (!a || Number(a) === 0) return setError("Valor inválido (use negativo para retirada).");
    save.mutate({ date: f.date, amount: a, notes: f.notes || null });
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <Field label="Valor (R$)" hint="Negativo para retirar da meta."><MoneyInput allowNegative value={f.amount} required
        onChange={(v) => setF({ ...f, amount: v })} /></Field>
      <Field label="Data"><input type="date" className={inputCls} value={f.date} required
        onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} />
      <div className="text-sm">{hist.data?.map((h) => (
        <div key={h.id} className="flex items-center justify-between border-b border-slate-100 py-1 dark:border-slate-800">
          <span>{date(h.date)}</span><span className="tabular-nums">{brl(h.amount)}
            <Button variant="ghost" className="text-red-700" onClick={() => remove.mutate(h.id)}>Remover</Button></span></div>))}</div>
    </form>
  );
}

function Recurrences() {
  const q = useQuery({ queryKey: ["recurrences"], queryFn: () => api.get<Rule[]>("/recurrences") });
  const accounts = useAccounts();
  const [edit, setEdit] = useState<Rule | null | undefined>(undefined);
  const [stop, setStop] = useState<Rule | null>(null);
  const stopRule = useSave((r: Rule) => api.post(`/recurrences/${r.id}/stop`, {}, { delete_future_planned: true }),
    "Recorrência encerrada; previsões futuras removidas.", () => setStop(null));
  return (
    <Card title="Lançamentos recorrentes" actions={<Button onClick={() => setEdit(null)}>+ Recorrência</Button>}>
      <p className="mb-3 text-xs text-slate-600 dark:text-slate-400">As ocorrências são geradas como “previstas” até 31 dias à frente, uma única
        vez cada; excluir uma ocorrência não faz com que ela seja recriada.</p>
      {!q.data?.length ? <Empty>Nenhuma recorrência.</Empty> : (
        <Table>
          <thead><tr><th className={th}>Descrição</th><th className={th}>Frequência</th><th className={`${th} text-right`}>Valor</th>
            <th className={th}>Conta</th><th className={th}>Período</th><th className={th}><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{q.data.map((r) => (
            <tr key={r.id} className={r.active ? "" : "opacity-60"}>
              <td className={td}>{r.description} <Badge tone={r.kind === "income" ? "green" : "red"}>
                {r.kind === "income" ? "Receita" : "Despesa"}</Badge> {!r.active && <Badge>Encerrada</Badge>}</td>
              <td className={td}>{FREQ[r.frequency]}{r.interval_count > 1 && ` (a cada ${r.interval_count})`}</td>
              <td className={`${td} text-right tabular-nums`}>{brl(r.amount)}</td>
              <td className={td}>{accounts.data?.find((a) => a.id === r.account_id)?.name}</td>
              <td className={td}>{date(r.start_date)} → {r.end_date ? date(r.end_date) : "sem fim"}</td>
              <td className={`${td} whitespace-nowrap text-right`}>{r.active && <>
                <Button variant="ghost" onClick={() => setEdit(r)}>Editar</Button>
                <Button variant="ghost" className="text-red-700" onClick={() => setStop(r)}>Encerrar</Button></>}</td>
            </tr>))}</tbody>
        </Table>
      )}
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? "Editar recorrência" : "Nova recorrência"}>
        {edit !== undefined && <RuleForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Modal>
      <ConfirmDialog open={!!stop} title="Encerrar recorrência" onClose={() => setStop(null)} confirmLabel="Encerrar"
        busy={stopRule.isPending} onConfirm={() => stop && stopRule.mutate(stop)}
        message="Ocorrências futuras ainda previstas serão removidas; as já pagas ou pendentes são mantidas." />
    </Card>
  );
}

function RuleForm({ initial, onDone }: { initial: Rule | null; onDone: () => void }) {
  const accounts = useAccounts();
  const cats = useCategories();
  const [f, setF] = useState({ kind: initial?.kind ?? "expense", description: initial?.description ?? "",
    amount: decToInput(initial?.amount), account_id: String(initial?.account_id ?? accounts.data?.[0]?.id ?? ""),
    category_id: String(initial?.category_id ?? ""), frequency: initial?.frequency ?? "monthly",
    interval_count: initial?.interval_count ?? 1, start_date: initial?.start_date ?? todayISO(),
    end_date: initial?.end_date ?? "", due_day_offset: initial?.due_day_offset ?? 0 });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => (initial ? api.put(`/recurrences/${initial.id}`, b) : api.post("/recurrences", b)),
    "Recorrência salva.", onDone);
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseDecimal(f.amount);
    if (!a || Number(a) <= 0) return setError("Valor inválido.");
    save.mutate({ ...f, amount: a, account_id: Number(f.account_id), category_id: Number(f.category_id) || null,
      end_date: f.end_date || null, interval_count: Number(f.interval_count), due_day_offset: Number(f.due_day_offset) });
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Tipo"><select className={inputCls} value={f.kind} onChange={s("kind")} disabled={!!initial}>
        <option value="expense">Despesa</option><option value="income">Receita</option></select></Field>
      <Field label="Descrição"><input className={inputCls} value={f.description} onChange={s("description")} required maxLength={200} /></Field>
      <Field label="Valor (R$)"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
      <Field label="Conta"><select className={inputCls} value={f.account_id} onChange={s("account_id")} required>
        {accounts.data?.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Categoria"><select className={inputCls} value={f.category_id} onChange={s("category_id")}>
        <option value="">Sem categoria</option>
        {categoryOptions(cats.data, f.kind as "income" | "expense").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select></Field>
      <Field label="Frequência"><select className={inputCls} value={f.frequency} onChange={s("frequency")}>
        {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Repetir a cada"><input type="number" min={1} max={36} className={inputCls} value={f.interval_count}
        onChange={s("interval_count")} /></Field>
      <Field label="Dias até o vencimento" hint="Apenas despesas."><input type="number" min={0} max={60} className={inputCls}
        value={f.due_day_offset} onChange={s("due_day_offset")} /></Field>
      <Field label="Início"><input type="date" className={inputCls} value={f.start_date} onChange={s("start_date")} required /></Field>
      <Field label="Fim (opcional)"><input type="date" className={inputCls} value={f.end_date} onChange={s("end_date")} /></Field>
      <div className="sm:col-span-2"><ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} /></div>
    </form>
  );
}
