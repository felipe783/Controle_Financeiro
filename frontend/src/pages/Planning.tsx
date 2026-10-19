import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Square, Trash2 } from "lucide-react";
import { Fragment, useState, type FormEvent } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "../api";
import {
  Button, Check as CheckBox, ConfirmDialog, cx, Empty, ErrorBox, Field, focusRing, IconButton, inputCls, Loading, Money,
  MoneyInput, PageHeader, Progress, RowMenu, Segmented, Sheet, SheetActions, Status, Table, Tag, td, th,
} from "../components/ui";
import { capitalize, date, dayLabel, decToInput, monthName, parseDecimal, pct, todayISO, toNum } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave, useSettle } from "../hooks";
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

const FREQ: Record<string, [string, string]> = { weekly: ["Toda semana", "semanas"], monthly: ["Todo mês", "meses"], yearly: ["Todo ano", "anos"] };
const TABS = [["", "Previsão de caixa"], ["orcamentos", "Orçamentos"], ["metas", "Metas"], ["recorrencias", "Recorrências"]] as const;

export default function Planning() {
  return (
    <div>
      <PageHeader title="Planejamento" context="O que vem pela frente: caixa previsto, limites de gasto, metas e contas que se repetem." />
      <nav aria-label="Seções do planejamento" className="-mt-1 mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-rule">
        {TABS.map(([to, label]) => (
          <NavLink key={to} to={to} end className={({ isActive }) => cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors", focusRing,
            isActive ? "border-anil font-semibold text-ink" : "border-transparent text-ink-soft hover:text-ink")}>{label}</NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<Forecast />} />
        <Route path="orcamentos" element={<Budgets />} />
        <Route path="metas" element={<Goals />} />
        <Route path="recorrencias" element={<Recurrences />} />
        <Route path="*" element={<Navigate to="/planejamento" replace />} />
      </Routes>
    </div>
  );
}

// ---------- Previsão ----------
function Forecast() {
  const [days, setDays] = useState("30");
  const settle = useSettle();
  const q = useQuery({ queryKey: ["forecast", days], queryFn: () => api.get<{ current_cash: string; expected_in: string;
    expected_out: string; projected_cash: string; items: Transaction[]; overdue: Transaction[] }>("/forecast", { days }) });
  const d = q.data;
  // Saldo corrente: parte do saldo de hoje e aplica cada previsão na ordem de vencimento.
  let running = toNum(d?.current_cash);
  const rows = (d?.items ?? []).map((t) => {
    running += (t.kind === "income" ? 1 : t.kind === "expense" ? -1 : 0) * toNum(t.amount);
    return { t, after: running, day: t.overdue ? "atrasadas" : (t.due_date ?? t.date) };
  });
  const firstNegative = rows.find((r) => r.after < 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented size="sm" label="Horizonte" value={days} onChange={setDays}
          options={[["7", "7 dias"], ["30", "30 dias"], ["60", "60 dias"], ["90", "90 dias"]]} />
      </div>
      <ErrorBox error={q.error} />
      {q.isLoading && <Loading rows={6} />}
      {d && (
        <>
          {/* A conta do caixa escrita como uma soma: hoje + entra − sai = fica */}
          <div className="grid grid-cols-2 gap-y-4 rounded-md border border-rule bg-sheet p-5 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] sm:items-end sm:gap-x-4">
            <Eq label="Saldo hoje"><Money value={d.current_cash} size="lg" /></Eq>
            <Op>+</Op>
            <Eq label="Vai entrar"><Money value={d.expected_in} size="lg" className="text-pos" /></Eq>
            <Op>−</Op>
            <Eq label="Vai sair"><Money value={d.expected_out} size="lg" className="text-neg" /></Eq>
            <Op>=</Op>
            <Eq label={`Em ${days} dias`}><Money value={d.projected_cash} size="lg" className={toNum(d.projected_cash) < 0 ? "text-neg" : ""} /></Eq>
          </div>
          {firstNegative && (
            <p className="text-sm"><Status tone="neg">Atenção</Status> o saldo somado das contas fica negativo a partir de{" "}
              <strong>{firstNegative.day === "atrasadas" ? "agora" : dayLabel(firstNegative.day).toLowerCase()}</strong>.</p>
          )}
          <div className="rounded-md border border-rule bg-sheet">
            {rows.length === 0 ? <Empty title="Nada previsto">Lançamentos pendentes, previstos e recorrências aparecem aqui.</Empty> : (
              <Table minWidth="min-w-0">
                <thead><tr><th className={th}>Lançamento</th><th className={cx(th, "text-right")}>Valor</th>
                  <th className={cx(th, "hidden text-right sm:table-cell")}>Saldo depois</th><th className={cx(th, "w-28")}><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <Fragment key={r.t.id}>
                    {(i === 0 || rows[i - 1].day !== r.day) && (
                      <tr><th colSpan={4} scope="colgroup" className={cx("border-b border-rule bg-paper/60 px-4 py-1.5 text-left text-[13px] font-semibold sm:px-5",
                        r.day === "atrasadas" && "text-neg")}>
                        {r.day === "atrasadas" ? "Atrasadas" : capitalize(dayLabel(r.day))}</th></tr>
                    )}
                    <tr>
                      <td className={cx(td, "max-w-0 w-full")}>
                        <div className="truncate font-medium">{r.t.description}</div>
                        <div className="truncate text-xs text-ink-soft">{[r.t.account_name, r.t.status === "planned" ? "prevista" : "pendente",
                          r.t.overdue && `venceu ${date(r.t.due_date ?? r.t.date)}`].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className={cx(td, "whitespace-nowrap text-right")}><Money value={r.t.amount} size="sm" flow={r.t.kind === "income" ? "in" : "out"} /></td>
                      <td className={cx(td, "hidden whitespace-nowrap text-right sm:table-cell")}>
                        <Money value={r.after} size="sm" className={r.after < 0 ? "text-neg" : "text-ink-soft"} /></td>
                      <td className={cx(td, "text-right")}>
                        {(r.t.kind === "income" || r.t.kind === "expense") && !r.t.investment_operation_id && (
                          <Button size="sm" variant="secondary" icon={Check} disabled={settle.isPending}
                            aria-label={`${r.t.kind === "income" ? "Receber" : "Pagar"} ${r.t.description}`}
                            onClick={() => settle.mutate([r.t.id])}>{r.t.kind === "income" ? "Receber" : "Pagar"}</Button>)}
                      </td>
                    </tr>
                  </Fragment>
                ))}</tbody>
              </Table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Eq({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><div className="mb-1 text-[13px] text-ink-soft">{label}</div>{children}</div>;
}
function Op({ children }: { children: string }) {
  return <div aria-hidden="true" className="hidden pb-0.5 font-figure text-2xl text-ink-faint sm:block">{children}</div>;
}

// ---------- Orçamentos ----------
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Budgets() {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const cats = useCategories();
  const q = useQuery({ queryKey: ["budgets", month], queryFn: () => api.get<BudgetRow[]>("/budgets", { month: `${month}-01` }) });
  const [f, setF] = useState<{ category_id: string; amount: string } | null>(null);
  const save = useSave((b: unknown) => api.put("/budgets", b), "Limite salvo.", () => setF(null));
  const [del, setDel] = useState<BudgetRow | null>(null);
  const remove = useSave((id: number) => api.del(`/budgets/${id}`), "Limite removido.", () => setDel(null));
  const copy = useSave(() => api.post("/budgets/copy", {}, { source: `${shiftMonth(month, -1)}-01`, target: `${month}-01` }),
    "Limites copiados do mês anterior.");
  const rows = q.data ?? [];
  const limit = rows.reduce((s, b) => s + toNum(b.amount), 0);
  const spent = rows.reduce((s, b) => s + toNum(b.spent), 0);
  const tone = { ok: "pos", warning: "warn", exceeded: "neg" } as const;
  const used = new Set(rows.map((r) => String(r.category_id)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Mês anterior" icon={ChevronLeft} onClick={() => setMonth(shiftMonth(month, -1))} />
          <h2 className="min-w-44 text-center text-base font-semibold">{capitalize(monthName(month))}</h2>
          <IconButton label="Próximo mês" icon={ChevronRight} onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" icon={Copy} disabled={copy.isPending} onClick={() => copy.mutate(undefined)}>Copiar do mês anterior</Button>
          <Button icon={Plus} onClick={() => setF({ category_id: "", amount: "" })}>Definir limite</Button>
        </div>
      </div>
      {rows.length > 0 && (
        <div className="rounded-md border border-rule bg-sheet p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div><span className="text-sm text-ink-soft">Gasto nas categorias com limite</span>
              <div className="mt-1 flex items-baseline gap-2"><Money value={spent} size="xl" /><span className="text-ink-soft">de <Money value={limit} size="md" tone="muted" /></span></div></div>
            <span className="num text-sm text-ink-soft">{pct(limit ? spent / limit : 0)}</span>
          </div>
          <div className="mt-3"><Progress value={limit ? spent / limit : 0} tone={spent > limit ? "neg" : spent > limit * 0.8 ? "warn" : "anil"} label="Uso do orçamento total do mês" /></div>
        </div>
      )}
      <div className="rounded-md border border-rule bg-sheet">
        {q.isLoading ? <div className="p-5"><Loading /></div> : rows.length === 0 ? (
          <Empty title="Nenhum limite neste mês" action={<Button icon={Plus} onClick={() => setF({ category_id: "", amount: "" })}>Definir limite</Button>}>
            Escolha uma categoria e quanto quer gastar nela no mês. O consumo é acompanhado pelos lançamentos pagos.
          </Empty>
        ) : (
          <ul className="divide-y divide-rule/70">
            {rows.map((b) => (
              <li key={b.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="min-w-0 flex-1 font-medium">{b.category_name}</span>
                  <Status tone={tone[b.status]}>{b.status === "exceeded" ? "Estourou" : b.status === "warning" ? "Perto do limite" : "Dentro"}</Status>
                  <span className="text-sm"><Money value={b.spent} size="sm" /> <span className="text-ink-soft">de</span> <Money value={b.amount} size="sm" tone="muted" /></span>
                  <RowMenu label={`Ações do limite de ${b.category_name}`} items={[
                    { label: "Alterar limite", icon: Pencil, onSelect: () => setF({ category_id: String(b.category_id), amount: decToInput(b.amount) }) },
                    { label: "Remover", icon: Trash2, danger: true, onSelect: () => setDel(b) },
                  ]} />
                </div>
                <div className="mt-2"><Progress value={toNum(b.percent)} tone={tone[b.status]} label={`Consumo do limite de ${b.category_name}`} /></div>
                <div className="mt-1.5 text-xs text-ink-soft">
                  {toNum(b.remaining) >= 0 ? <>Restam <Money value={b.remaining} size="sm" tone="muted" /></> : <>Passou <Money value={-toNum(b.remaining)} size="sm" className="text-neg" /></>}
                  {toNum(b.committed) > 0 && <> · mais <Money value={b.committed} size="sm" tone="muted" /> já previstos</>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Sheet open={!!f} onClose={() => setF(null)} title={f?.category_id && used.has(f.category_id) ? "Alterar limite" : "Definir limite"}
        description={`Vale para ${monthName(month)}.`} footer={<SheetActions form="budget-form" onCancel={() => setF(null)} />}>
        {f && (
          <form id="budget-form" className="grid gap-4" onSubmit={(e) => { e.preventDefault();
            const a = parseDecimal(f.amount); if (a && f.category_id) save.mutate({ category_id: Number(f.category_id), month: `${month}-01`, amount: a }); }}>
            <Field label="Categoria" hint="Limites valem para a categoria principal e suas subcategorias.">
              <select className={inputCls} value={f.category_id} required onChange={(e) => setF({ ...f, category_id: e.target.value })}>
                <option value="">Escolha…</option>
                {categoryOptions(cats.data, "expense").filter((c) => !c.label.includes("›")).map((c) =>
                  <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Limite do mês"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
          </form>
        )}
      </Sheet>
      <ConfirmDialog open={!!del} title="Remover limite" onClose={() => setDel(null)} busy={remove.isPending} confirmLabel="Remover"
        onConfirm={() => del && remove.mutate(del.id)} message={`O limite de ${del?.category_name ?? ""} deixa de valer em ${monthName(month)}. Os lançamentos não mudam.`} />
    </div>
  );
}

// ---------- Metas ----------
function Goals() {
  const q = useQuery({ queryKey: ["goals"], queryFn: () => api.get<GoalRow[]>("/goals") });
  const [edit, setEdit] = useState<GoalRow | null | undefined>(undefined);
  const [contrib, setContrib] = useState<GoalRow | null>(null);
  const [del, setDel] = useState<GoalRow | null>(null);
  const remove = useSave((g: GoalRow) => api.del(`/goals/${g.id}`), "Meta excluída.", () => setDel(null));
  const goals = q.data ?? [];
  const active = goals.filter((g) => !g.archived);
  const done = goals.filter((g) => g.archived);

  const item = (g: GoalRow) => {
    const p = toNum(g.progress);
    return (
      <li key={g.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{g.name}</span>
            <span className="num font-figure text-lg font-semibold">{pct(p).replace(",00", "")}</span>
          </div>
          <div className="my-2"><Progress value={p} tone={p >= 1 ? "pos" : "anil"} label={`Progresso de ${g.name}`} /></div>
          <div className="text-[13px] text-ink-soft">
            <Money value={g.saved} size="sm" className="text-ink" /> de <Money value={g.target_amount} size="sm" tone="muted" />
            {g.target_date && <> · até {date(g.target_date)}</>}
            {g.monthly_needed && toNum(g.remaining) > 0 && <> · <Money value={g.monthly_needed} size="sm" className="text-ink" /> por mês para chegar lá</>}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:self-center">
          {!g.archived && <Button size="sm" variant="secondary" onClick={() => setContrib(g)}>Guardar ou retirar</Button>}
          <RowMenu label={`Ações de ${g.name}`} items={[
            { label: "Editar", icon: Pencil, onSelect: () => setEdit(g) },
            { label: "Excluir", icon: Trash2, danger: true, onSelect: () => setDel(g) },
          ]} />
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-ink-soft">Metas separam, no papel, dinheiro que já está nas suas contas. Não somam ao patrimônio.</p>
        <Button icon={Plus} onClick={() => setEdit(null)}>Nova meta</Button>
      </div>
      <div className="rounded-md border border-rule bg-sheet">
        {q.isLoading ? <div className="p-5"><Loading /></div> : active.length === 0 ? (
          <Empty title="Nenhuma meta em andamento" action={<Button icon={Plus} onClick={() => setEdit(null)}>Criar meta</Button>}>
            Reserva de emergência, viagem, troca do carro: defina o valor e o prazo e acompanhe quanto falta por mês.
          </Empty>
        ) : <ul className="divide-y divide-rule/70">{active.map(item)}</ul>}
      </div>
      {done.length > 0 && (
        <details className="rounded-md border border-rule bg-sheet">
          <summary className={cx("cursor-pointer px-4 py-3 text-sm text-ink-soft sm:px-5", focusRing)}>{done.length} concluída(s) ou arquivada(s)</summary>
          <ul className="divide-y divide-rule/70 border-t border-rule opacity-80">{done.map(item)}</ul>
        </details>
      )}
      <Sheet open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? "Editar meta" : "Nova meta"}
        footer={<SheetActions form="goal-form" onCancel={() => setEdit(undefined)} />}>
        {edit !== undefined && <GoalForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Sheet>
      <Sheet open={!!contrib} onClose={() => setContrib(null)} title={contrib?.name ?? ""} description="Valores negativos retiram da meta."
        footer={<SheetActions form="contrib-form" label="Registrar" onCancel={() => setContrib(null)} />}>
        {contrib && <ContributionForm goal={contrib} onDone={() => setContrib(null)} />}
      </Sheet>
      <ConfirmDialog open={!!del} title={`Excluir ${del?.name ?? "meta"}`} onClose={() => setDel(null)} busy={remove.isPending}
        onConfirm={() => del && remove.mutate(del)} message="A meta e os valores guardados nela serão apagados. Suas contas não mudam." />
    </div>
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
    if (!t || Number(t) <= 0) return setError("Informe um valor-alvo maior que zero.");
    save.mutate({ ...f, target_amount: t, target_date: f.target_date || null, notes: f.notes || null });
  }
  return (
    <form id="goal-form" onSubmit={submit} className="grid gap-4">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={120} autoFocus
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Quanto quer juntar"><MoneyInput value={f.target_amount} required onChange={(v) => setF({ ...f, target_amount: v })} /></Field>
      <Field label="Até quando" hint="Opcional. Com prazo, mostramos quanto guardar por mês."><input type="date" className={inputCls} value={f.target_date}
        onChange={(e) => setF({ ...f, target_date: e.target.value })} /></Field>
      {initial && <CheckBox checked={f.archived} onChange={(v) => setF({ ...f, archived: v })}>Concluída ou arquivada</CheckBox>}
      <ErrorBox error={error} />
    </form>
  );
}

function ContributionForm({ goal, onDone }: { goal: GoalRow; onDone: () => void }) {
  const hist = useQuery({ queryKey: ["goal", goal.id], queryFn: () =>
    api.get<{ id: number; date: string; amount: string; notes: string | null }[]>(`/goals/${goal.id}/contributions`) });
  const [f, setF] = useState({ date: todayISO(), amount: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => api.post(`/goals/${goal.id}/contributions`, b), "Valor registrado na meta.", onDone);
  const remove = useSave((id: number) => api.del(`/goals/${goal.id}/contributions/${id}`), "Registro removido.");
  function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseDecimal(f.amount);
    if (!a || Number(a) === 0) return setError("Informe um valor (negativo para retirar).");
    save.mutate({ date: f.date, amount: a, notes: null });
  }
  return (
    <div className="space-y-6">
      <form id="contrib-form" onSubmit={submit} className="grid gap-4">
        <Field label="Valor"><MoneyInput allowNegative value={f.amount} required autoFocus onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Data"><input type="date" className={inputCls} value={f.date} required onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <ErrorBox error={error} />
      </form>
      <section>
        <h3 className="mb-2 text-sm font-medium">Registros</h3>
        {!hist.data?.length ? <p className="text-sm text-ink-soft">Nada guardado ainda.</p> : (
          <ul className="divide-y divide-rule/70 text-sm">{hist.data.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="num text-ink-soft">{date(h.date)}</span>
              <span className="flex items-center gap-1"><Money value={h.amount} size="sm" tone="signed" />
                <IconButton label="Remover registro" icon={Trash2} onClick={() => remove.mutate(h.id)} /></span>
            </li>))}</ul>
        )}
      </section>
    </div>
  );
}

// ---------- Recorrências ----------
function Recurrences() {
  const q = useQuery({ queryKey: ["recurrences"], queryFn: () => api.get<Rule[]>("/recurrences") });
  const accounts = useAccounts();
  const [edit, setEdit] = useState<Rule | null | undefined>(undefined);
  const [stop, setStop] = useState<Rule | null>(null);
  const stopRule = useSave((r: Rule) => api.post(`/recurrences/${r.id}/stop`, {}, { delete_future_planned: true }),
    "Recorrência encerrada; as previsões futuras foram removidas.", () => setStop(null));
  const rules = q.data ?? [];
  const active = rules.filter((r) => r.active);
  const ended = rules.filter((r) => !r.active);
  const monthly = active.reduce((s, r) => {
    const per = r.frequency === "monthly" ? 1 / r.interval_count : r.frequency === "weekly" ? 52 / 12 / r.interval_count : 1 / 12 / r.interval_count;
    return s + (r.kind === "income" ? 1 : -1) * toNum(r.amount) * per;
  }, 0);
  const accName = (id: number) => accounts.data?.find((a) => a.id === id)?.name;

  const row = (r: Rule) => (
    <tr key={r.id} className={r.active ? "" : "opacity-70"}>
      <td className={cx(td, "max-w-0 w-full")}>
        <div className="flex items-center gap-2"><span className="truncate font-medium">{r.description}</span>{!r.active && <Tag>Encerrada</Tag>}</div>
        <div className="truncate text-xs text-ink-soft">{accName(r.account_id)} · desde {date(r.start_date)}{r.end_date ? ` até ${date(r.end_date)}` : ""}</div>
      </td>
      <td className={cx(td, "hidden whitespace-nowrap text-ink-soft sm:table-cell")}>
        {r.interval_count > 1 ? `A cada ${r.interval_count} ${FREQ[r.frequency][1]}` : FREQ[r.frequency][0]}</td>
      <td className={cx(td, "whitespace-nowrap text-right")}><Money value={r.amount} size="sm" flow={r.kind === "income" ? "in" : "out"} /></td>
      <td className={cx(td, "text-right")}>{r.active && <RowMenu label={`Ações de ${r.description}`} items={[
        { label: "Editar", icon: Pencil, onSelect: () => setEdit(r) },
        { label: "Encerrar", icon: Square, danger: true, onSelect: () => setStop(r) },
      ]} />}</td>
    </tr>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-ink-soft">Efeito mensal das recorrências ativas</div>
          <div className="mt-1"><Money value={monthly} size="lg" tone="signed" /></div>
        </div>
        <Button icon={Plus} onClick={() => setEdit(null)}>Nova recorrência</Button>
      </div>
      <div className="rounded-md border border-rule bg-sheet">
        {q.isLoading ? <div className="p-5"><Loading /></div> : active.length === 0 ? (
          <Empty title="Nenhuma recorrência" action={<Button icon={Plus} onClick={() => setEdit(null)}>Criar recorrência</Button>}>
            Salário, aluguel, assinaturas: cada ocorrência é criada como prevista até 31 dias à frente, uma única vez.
          </Empty>
        ) : (
          <Table minWidth="min-w-0">
            <thead><tr><th className={th}>Descrição</th><th className={cx(th, "hidden sm:table-cell")}>Frequência</th>
              <th className={cx(th, "text-right")}>Valor</th><th className={cx(th, "w-12")}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{active.map(row)}</tbody>
          </Table>
        )}
      </div>
      {ended.length > 0 && (
        <details className="rounded-md border border-rule bg-sheet">
          <summary className={cx("cursor-pointer px-4 py-3 text-sm text-ink-soft sm:px-5", focusRing)}>{ended.length} encerrada(s)</summary>
          <Table minWidth="min-w-0"><tbody>{ended.map(row)}</tbody></Table>
        </details>
      )}
      <Sheet open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? "Editar recorrência" : "Nova recorrência"}
        footer={<SheetActions form="rule-form" onCancel={() => setEdit(undefined)} />}>
        {edit !== undefined && <RuleForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Sheet>
      <ConfirmDialog open={!!stop} title={`Encerrar ${stop?.description ?? "recorrência"}`} onClose={() => setStop(null)} confirmLabel="Encerrar"
        busy={stopRule.isPending} onConfirm={() => stop && stopRule.mutate(stop)}
        message="As ocorrências futuras ainda previstas serão removidas. As já pagas ou pendentes continuam no extrato." />
    </div>
  );
}

function RuleForm({ initial, onDone }: { initial: Rule | null; onDone: () => void }) {
  const accounts = useAccounts();
  const cats = useCategories();
  const [f, setF] = useState({ kind: initial?.kind ?? "expense", description: initial?.description ?? "",
    amount: decToInput(initial?.amount), account_id: String(initial?.account_id ?? accounts.data?.find((a) => !a.archived)?.id ?? ""),
    category_id: String(initial?.category_id ?? ""), frequency: initial?.frequency ?? "monthly",
    interval_count: String(initial?.interval_count ?? 1), start_date: initial?.start_date ?? todayISO(),
    end_date: initial?.end_date ?? "", due_day_offset: String(initial?.due_day_offset ?? 0) });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((b: unknown) => (initial ? api.put(`/recurrences/${initial.id}`, b) : api.post("/recurrences", b)),
    "Recorrência salva.", onDone);
  const s = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseDecimal(f.amount);
    if (!a || Number(a) <= 0) return setError("Informe um valor maior que zero.");
    save.mutate({ ...f, amount: a, account_id: Number(f.account_id), category_id: Number(f.category_id) || null,
      end_date: f.end_date || null, interval_count: Number(f.interval_count), due_day_offset: Number(f.due_day_offset) });
  }
  return (
    <form id="rule-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {!initial && (
        <div className="sm:col-span-2">
          <Segmented label="Tipo" value={f.kind as "expense" | "income"} onChange={(v) => setF({ ...f, kind: v, category_id: "" })}
            options={[["expense", "Despesa"], ["income", "Receita"]]} />
        </div>
      )}
      <Field label="Valor" className="sm:col-span-2"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required /></Field>
      <Field label="Descrição" className="sm:col-span-2"><input className={inputCls} value={f.description} onChange={s("description")} required maxLength={200} /></Field>
      <Field label="Conta"><select className={inputCls} value={f.account_id} onChange={s("account_id")} required>
        {accounts.data?.filter((a) => !a.archived || String(a.id) === f.account_id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Categoria"><select className={inputCls} value={f.category_id} onChange={s("category_id")}>
        <option value="">Sem categoria</option>
        {categoryOptions(cats.data, f.kind as "income" | "expense").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select></Field>
      <Field label="Repete"><select className={inputCls} value={f.frequency} onChange={s("frequency")}>
        <option value="weekly">Por semana</option><option value="monthly">Por mês</option><option value="yearly">Por ano</option></select></Field>
      <Field label="A cada" hint={`1 = toda ${f.frequency === "weekly" ? "semana" : f.frequency === "yearly" ? "ano" : "mês"}`}>
        <input type="number" min={1} max={36} className={inputCls} value={f.interval_count} onChange={s("interval_count")} /></Field>
      <Field label="Começa em"><input type="date" className={inputCls} value={f.start_date} onChange={s("start_date")} required /></Field>
      <Field label="Termina em" hint="Opcional."><input type="date" className={inputCls} value={f.end_date} onChange={s("end_date")} /></Field>
      {f.kind === "expense" && (
        <Field label="Vence quantos dias depois" hint="0 = vence no próprio dia." className="sm:col-span-2">
          <input type="number" min={0} max={60} className={inputCls} value={f.due_day_offset} onChange={s("due_day_offset")} /></Field>
      )}
      <div className="sm:col-span-2"><ErrorBox error={error} /></div>
    </form>
  );
}
