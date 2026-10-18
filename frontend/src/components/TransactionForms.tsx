import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { decToInput, parseDecimal, todayISO } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave } from "../hooks";
import type { Transaction } from "../types";
import { ErrorBox, Field, FormActions, inputCls, Modal, MoneyInput } from "./ui";

const PAYMENT = ["Pix", "Débito", "Crédito", "Boleto", "Dinheiro", "Transferência", "Débito automático"];

export function TransactionModal({ open, onClose, kind, initial }: {
  open: boolean; onClose: () => void; kind: "income" | "expense"; initial?: Transaction | null;
}) {
  return (
    <Modal open={open} onClose={onClose}
      title={`${initial ? "Editar" : "Nova"} ${kind === "income" ? "receita" : "despesa"}`}>
      {open && <TransactionForm kind={initial ? (initial.kind as "income" | "expense") : kind} initial={initial}
        onDone={onClose} />}
    </Modal>
  );
}

function TransactionForm({ kind, initial, onDone }: {
  kind: "income" | "expense"; initial?: Transaction | null; onDone: () => void;
}) {
  const accounts = useAccounts();
  const cats = useCategories();
  const active = (accounts.data ?? []).filter((a) => !a.archived || a.id === initial?.account_id);
  const [f, setF] = useState(() => ({
    description: initial?.description ?? "",
    amount: decToInput(initial?.amount),
    status: initial?.status ?? (kind === "income" ? "settled" : "pending"),
    date: initial?.date ?? todayISO(),
    due_date: initial?.due_date ?? "",
    settle_date: initial?.settle_date ?? "",
    account_id: initial?.account_id ?? 0,
    category_id: initial?.category_id ?? 0,
    origin: initial?.origin ?? "",
    payment_method: initial?.payment_method ?? "",
    expense_type: initial?.expense_type ?? "",
    notes: initial?.notes ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const accountId = f.account_id || active[0]?.id || 0;

  const save = useSave(
    (body: unknown) => (initial ? api.put(`/transactions/${initial.id}`, body) : api.post("/transactions", body)),
    initial ? "Lançamento atualizado." : "Lançamento registrado.",
    onDone,
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseDecimal(f.amount);
    if (!amount || Number(amount) <= 0) return setError("Informe um valor maior que zero.");
    if (!accountId) return setError("Cadastre uma conta antes de lançar.");
    setError(null);
    save.mutate({
      kind, status: f.status, description: f.description, amount, date: f.date,
      due_date: kind === "expense" && f.due_date ? f.due_date : null,
      settle_date: f.status === "settled" ? f.settle_date || f.date : null,
      account_id: Number(accountId), category_id: Number(f.category_id) || null,
      origin: kind === "income" ? f.origin || null : null,
      payment_method: kind === "expense" ? f.payment_method || null : null,
      expense_type: kind === "expense" ? f.expense_type || null : null,
      notes: f.notes || null,
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Descrição" className="sm:col-span-2">
        <input className={inputCls} value={f.description} onChange={set("description")} required maxLength={200} />
      </Field>
      <Field label="Valor (R$)">
        <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required />
      </Field>
      <Field label="Situação">
        <select className={inputCls} value={f.status} onChange={set("status")}>
          <option value="planned">Prevista</option>
          <option value="pending">Pendente</option>
          <option value="settled">{kind === "income" ? "Recebida" : "Paga"}</option>
        </select>
      </Field>
      <Field label={kind === "income" ? "Data de competência" : "Data da despesa"}>
        <input type="date" className={inputCls} value={f.date} onChange={set("date")} required />
      </Field>
      {kind === "expense" ? (
        <Field label="Vencimento">
          <input type="date" className={inputCls} value={f.due_date} onChange={set("due_date")} />
        </Field>
      ) : (
        <Field label="Origem">
          <input className={inputCls} value={f.origin} onChange={set("origin")} maxLength={100}
            placeholder="Empresa, cliente…" />
        </Field>
      )}
      {f.status === "settled" && (
        <Field label={kind === "income" ? "Data de recebimento" : "Data de pagamento"}>
          <input type="date" className={inputCls} value={f.settle_date || f.date} onChange={set("settle_date")} />
        </Field>
      )}
      <Field label={kind === "income" ? "Conta de destino" : "Conta"}>
        <select className={inputCls} value={accountId} onChange={set("account_id")} required>
          {active.length === 0 && <option value={0}>Nenhuma conta cadastrada</option>}
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Categoria">
        <select className={inputCls} value={f.category_id} onChange={set("category_id")}>
          <option value={0}>Sem categoria</option>
          {categoryOptions(cats.data, kind).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </Field>
      {kind === "expense" && (
        <>
          <Field label="Forma de pagamento">
            <input className={inputCls} list="formas" value={f.payment_method} onChange={set("payment_method")}
              maxLength={40} />
            <datalist id="formas">{PAYMENT.map((p) => <option key={p} value={p} />)}</datalist>
          </Field>
          <Field label="Tipo">
            <select className={inputCls} value={f.expense_type} onChange={set("expense_type")}>
              <option value="">—</option>
              <option value="fixed">Fixa</option>
              <option value="variable">Variável</option>
            </select>
          </Field>
        </>
      )}
      <Field label="Observações" className="sm:col-span-2">
        <textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorBox error={error} />
        <FormActions onCancel={onDone} busy={save.isPending} />
      </div>
    </form>
  );
}

export function TransferModal({ open, onClose, transferId }: {
  open: boolean; onClose: () => void; transferId?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={transferId ? "Editar transferência" : "Nova transferência"}>
      {open && <TransferForm transferId={transferId} onDone={onClose} />}
    </Modal>
  );
}

function TransferForm({ transferId, onDone }: { transferId?: string | null; onDone: () => void }) {
  const accounts = useAccounts();
  const active = (accounts.data ?? []).filter((a) => !a.archived);
  const [f, setF] = useState({ from: 0, to: 0, amount: "", date: todayISO(), description: "", notes: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!transferId) return;
    api.get<{ from_account_id: number; to_account_id: number; amount: string; date: string; description: string;
      notes: string | null }>(`/transfers/${transferId}`)
      .then((t) => setF({ from: t.from_account_id, to: t.to_account_id, amount: decToInput(t.amount), date: t.date,
        description: t.description, notes: t.notes ?? "" }))
      .catch((e) => setError(e.message));
  }, [transferId]);

  const save = useSave(
    (body: unknown) => (transferId ? api.put(`/transfers/${transferId}`, body) : api.post("/transfers", body)),
    "Transferência registrada.", onDone,
  );
  const from = f.from || active[0]?.id || 0;
  const to = f.to || active.find((a) => a.id !== from)?.id || 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    const amount = parseDecimal(f.amount);
    if (!amount || Number(amount) <= 0) return setError("Informe um valor maior que zero.");
    if (!from || !to || from === to) return setError("Escolha duas contas diferentes.");
    setError(null);
    save.mutate({ from_account_id: Number(from), to_account_id: Number(to), amount, date: f.date,
      description: f.description || null, notes: f.notes || null });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <p className="text-xs text-slate-600 dark:text-slate-400 sm:col-span-2">
        Transferências movem dinheiro entre suas contas: não são receita nem despesa e não alteram o patrimônio.
      </p>
      <Field label="De">
        <select className={inputCls} value={from} onChange={(e) => setF({ ...f, from: Number(e.target.value) })}>
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Para">
        <select className={inputCls} value={to} onChange={(e) => setF({ ...f, to: Number(e.target.value) })}>
          {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Valor (R$)">
        <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required />
      </Field>
      <Field label="Data">
        <input type="date" className={inputCls} value={f.date} required
          onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label="Descrição (opcional)" className="sm:col-span-2">
        <input className={inputCls} value={f.description} maxLength={200}
          onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="sm:col-span-2">
        <ErrorBox error={error} />
        <FormActions onCancel={onDone} busy={save.isPending} />
      </div>
    </form>
  );
}
