import { Archive, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import {
  Button, Check, ConfirmDialog, cx, Empty, ErrorBox, Field, focusRing, inputCls, Loading, Money, MoneyInput,
  Band, BandFigure, PageHeader, RowMenu, Sheet, SheetActions,
} from "../components/ui";
import { ACCOUNT_TYPES, date, decToInput, parseDecimal, todayISO, toNum } from "../format";
import { useAccounts, useSave } from "../hooks";
import type { Account } from "../types";

// Ordem de leitura: o dinheiro do dia a dia primeiro.
const GROUPS: [string, string[]][] = [
  ["Dia a dia", ["checking", "payment", "cash"]],
  ["Reservas", ["savings"]],
  ["Corretoras e investimentos", ["investment"]],
  ["Outras", ["other"]],
];

export default function Accounts() {
  const accounts = useAccounts();
  const [edit, setEdit] = useState<Account | null | undefined>(undefined);
  const [reconcile, setReconcile] = useState<Account | null>(null);
  const [toDelete, setToDelete] = useState<Account | null>(null);
  const del = useSave((a: Account) => api.del(`/accounts/${a.id}`), "Conta excluída.", () => setToDelete(null));
  const list = accounts.data ?? [];
  const open = list.filter((a) => !a.archived);
  const archived = list.filter((a) => a.archived);
  const total = open.reduce((s, a) => s + toNum(a.balance), 0);
  const pendingIn = open.reduce((s, a) => s + toNum(a.pending_in), 0);
  const pendingOut = open.reduce((s, a) => s + toNum(a.pending_out), 0);

  const row = (a: Account) => (
    <li key={a.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 lg:grid-cols-[minmax(0,1fr)_10rem_11rem_auto] sm:px-5">
      <div className="min-w-0">
        <Link to={`/lancamentos?account_id=${a.id}`} className={cx("rounded font-medium hover:text-anil hover:underline", focusRing)}>{a.name}</Link>
        <div className="truncate text-xs text-ink-soft">{[ACCOUNT_TYPES[a.type], a.institution].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="col-start-2 row-start-1 text-right lg:col-start-3">
        <Money value={a.balance} size="md" className={toNum(a.balance) < 0 ? "text-neg" : ""} />
      </div>
      <div className="col-span-2 text-xs text-ink-soft lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:text-right">
        {toNum(a.pending_in) || toNum(a.pending_out) ? (
          <>
            {toNum(a.pending_in) > 0 && <div>a receber <Money value={a.pending_in} size="sm" tone="muted" /></div>}
            {toNum(a.pending_out) > 0 && <div>a pagar <Money value={a.pending_out} size="sm" tone="muted" /></div>}
          </>
        ) : <span className="hidden lg:inline">Nada pendente</span>}
      </div>
      <div className="col-span-2 flex items-center justify-end gap-1 lg:col-span-1">
        {!a.archived && <Button size="sm" variant="ghost" icon={Scale} onClick={() => setReconcile(a)}>Conciliar</Button>}
        <RowMenu label={`Ações de ${a.name}`} items={[
          { label: "Editar", icon: Pencil, onSelect: () => setEdit(a) },
          { label: "Excluir", icon: Trash2, danger: true, onSelect: () => setToDelete(a) },
        ]} />
      </div>
    </li>
  );

  return (
    <div>
      <PageHeader title="Contas" context="Saldos calculados a partir do saldo inicial e de tudo que já foi efetivado."
        actions={<Button icon={Plus} onClick={() => setEdit(null)}>Nova conta</Button>} />
      <ErrorBox error={accounts.error} className="mb-4" />
      {accounts.isLoading ? <Loading rows={6} /> : list.length === 0 ? (
        <div className="rounded-md border border-rule bg-sheet">
          <Empty title="Nenhuma conta cadastrada" action={<Button icon={Plus} onClick={() => setEdit(null)}>Cadastrar conta</Button>}>
            Comece pela conta corrente, pela carteira de dinheiro ou pela corretora. O saldo de hoje entra como saldo inicial.
          </Empty>
        </div>
      ) : (
        <>
          <Band label="Total em contas" value={total} className="mb-6"
            note="Saldo inicial mais tudo que já foi efetivado, em cada conta.">
            <BandFigure label="A receber"><Money value={pendingIn} size="lg" className="text-[rgb(140_235_185)]" /></BandFigure>
            <BandFigure label="A pagar"><Money value={pendingOut} size="lg" className="text-[rgb(255_180_170)]" /></BandFigure>
          </Band>
          <div className="space-y-5">
            {GROUPS.map(([label, types]) => {
              const items = open.filter((a) => types.includes(a.type));
              if (!items.length) return null;
              const sub = items.reduce((s, a) => s + toNum(a.balance), 0);
              return (
                <section key={label} className="rounded-md border border-rule bg-sheet">
                  <header className="flex items-baseline justify-between border-b border-rule px-4 py-2.5 sm:px-5">
                    <h2 className="text-[15px] font-semibold">{label}</h2>
                    <Money value={sub} size="sm" tone="muted" />
                  </header>
                  <ul className="divide-y divide-rule/70">{items.map(row)}</ul>
                </section>
              );
            })}
            {archived.length > 0 && (
              <details className="rounded-md border border-rule bg-sheet">
                <summary className={cx("flex cursor-pointer items-center gap-2 px-4 py-3 text-sm text-ink-soft sm:px-5", focusRing)}>
                  <Archive aria-hidden="true" className="size-4" />{archived.length} {archived.length === 1 ? "conta arquivada" : "contas arquivadas"}
                </summary>
                <ul className="divide-y divide-rule/70 border-t border-rule opacity-80">{archived.map(row)}</ul>
              </details>
            )}
          </div>
        </>
      )}

      <Sheet open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? `Editar ${edit.name}` : "Nova conta"}
        footer={<SheetActions form="account-form" onCancel={() => setEdit(undefined)} />}>
        {edit !== undefined && <AccountForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Sheet>
      <Sheet open={!!reconcile} onClose={() => setReconcile(null)} title={`Conciliar ${reconcile?.name ?? ""}`}
        description="Ajuste o saldo calculado ao valor do extrato do banco."
        footer={<SheetActions form="reconcile-form" label="Conciliar" onCancel={() => setReconcile(null)} />}>
        {reconcile && <ReconcileForm account={reconcile} onDone={() => setReconcile(null)} />}
      </Sheet>
      <ConfirmDialog open={!!toDelete} title={`Excluir ${toDelete?.name ?? "conta"}`} onClose={() => setToDelete(null)} busy={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        message="Só contas sem lançamentos podem ser excluídas. Se esta tiver histórico, edite-a e marque como arquivada." />
    </div>
  );
}

function AccountForm({ initial, onDone }: { initial: Account | null; onDone: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "", institution: initial?.institution ?? "", type: initial?.type ?? "checking",
    initial_balance: decToInput(initial?.initial_balance ?? "0"),
    initial_balance_date: initial?.initial_balance_date ?? todayISO(), archived: initial?.archived ?? false,
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((body: unknown) => (initial ? api.put(`/accounts/${initial.id}`, body) : api.post("/accounts", body)),
    "Conta salva.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const bal = parseDecimal(f.initial_balance);
    if (bal === null) return setError("Saldo inicial inválido.");
    save.mutate({ ...f, initial_balance: bal, institution: f.institution || null, notes: f.notes || null });
  }
  return (
    <form id="account-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Nome" className="sm:col-span-2"><input className={inputCls} value={f.name} required maxLength={100} autoFocus
        placeholder="Conta corrente, Nubank, Carteira…" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Tipo">
        <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Instituição"><input className={inputCls} value={f.institution} maxLength={100}
        onChange={(e) => setF({ ...f, institution: e.target.value })} /></Field>
      <Field label="Saldo inicial" hint="Pode ser negativo (cheque especial).">
        <MoneyInput allowNegative value={f.initial_balance} onChange={(v) => setF({ ...f, initial_balance: v })} required />
      </Field>
      <Field label="Saldo em" hint="Movimentos efetivados antes desta data já estão no saldo inicial.">
        <input type="date" className={inputCls} value={f.initial_balance_date} required
          onChange={(e) => setF({ ...f, initial_balance_date: e.target.value })} />
      </Field>
      <Field label="Observações" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes}
        onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {initial && <Check className="sm:col-span-2" checked={f.archived} onChange={(v) => setF({ ...f, archived: v })}>
        Arquivada (sai das listas e não aceita novos lançamentos)</Check>}
      <div className="sm:col-span-2"><ErrorBox error={error} /></div>
    </form>
  );
}

function ReconcileForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const [f, setF] = useState({ date: todayISO(), actual: decToInput(account.balance), note: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((body: unknown) => api.post(`/accounts/${account.id}/reconcile`, body),
    "Conciliação registrada.", onDone);
  const actual = parseDecimal(f.actual);
  // A diferença só é conhecida aqui para a data de hoje; em outra data o servidor calcula o saldo daquele dia.
  const diff = actual === null || f.date !== todayISO() ? null : Number(actual) - toNum(account.balance);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (actual === null) return setError("Saldo inválido.");
    save.mutate({ date: f.date, actual_balance: actual, note: f.note || null });
  }
  return (
    <form id="reconcile-form" onSubmit={submit} className="space-y-4">
      <div className="flex items-baseline justify-between rounded bg-sunk px-3 py-2.5 text-sm">
        <span className="text-ink-soft">Saldo calculado hoje</span><Money value={account.balance} />
      </div>
      <Field label="Data do extrato"><input type="date" className={inputCls} value={f.date} required
        onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Saldo no extrato"><MoneyInput allowNegative value={f.actual} required autoFocus
        onChange={(v) => setF({ ...f, actual: v })} /></Field>
      {diff !== null && Math.abs(diff) >= 0.005 && (
        <p className="text-sm text-ink-soft">
          Será criado um ajuste de <Money value={diff} size="sm" tone="signed" /> (não conta como receita nem despesa
          e fica no histórico).
        </p>
      )}
      <Field label="Observação"><input className={inputCls} value={f.note} maxLength={500}
        onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <p className="text-xs text-ink-soft">Saldo inicial de <Money value={account.initial_balance} size="sm" tone="muted" /> em {date(account.initial_balance_date)}.</p>
      <ErrorBox error={error} />
    </form>
  );
}
