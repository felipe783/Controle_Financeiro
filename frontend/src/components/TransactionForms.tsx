import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../api";
import { decToInput, parseDecimal, todayISO } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave } from "../hooks";
import type { Transaction } from "../types";
import { Button, ErrorBox, Field, inputCls, Loading, MoneyInput, Segmented, Sheet } from "./ui";

/*
 * Um único ponto de entrada para registrar dinheiro: despesa, receita ou transferência.
 * Abre de qualquer tela (botão "Novo lançamento" e atalho N) e também edita lançamentos existentes.
 */
export type EntryKind = "expense" | "income" | "transfer";
type EntryRequest = { kind: EntryKind; tx?: Transaction | null; transferId?: string | null };

const EntryCtx = createContext<(r?: Partial<EntryRequest>) => void>(() => {});
export const useEntry = () => useContext(EntryCtx);

export function EntryProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<EntryRequest | null>(null);
  // a chave recria o formulário a cada abertura, para nunca herdar valores da anterior
  const [seq, setSeq] = useState(0);
  const open = useCallback((r?: Partial<EntryRequest>) => {
    setSeq((s) => s + 1);
    setReq({ kind: r?.kind ?? (r?.transferId ? "transfer" : "expense"), tx: r?.tx ?? null, transferId: r?.transferId ?? null });
  }, []);
  const close = () => setReq(null);
  // A folha anima a saída: mostra o último pedido enquanto desliza para fora, em vez de sair vazia.
  const last = useRef<EntryRequest | null>(null);
  if (req) last.current = req;
  const shown = req ?? last.current;
  const editing = !!(shown?.tx || shown?.transferId);
  const title = !shown ? "" : editing
    ? { expense: "Editar despesa", income: "Editar receita", transfer: "Editar transferência" }[shown.kind]
    : "Novo lançamento";
  const setKind = (k: EntryKind) => req && setReq({ ...req, kind: k });

  return (
    <EntryCtx.Provider value={open}>
      {children}
      <Sheet open={!!req} onClose={close} title={title}
        footer={shown && <>
          <Button variant="ghost" onClick={close}>Cancelar</Button>
          {!editing && <Button variant="secondary" type="submit" form="entry-form" name="again" value="1">Salvar e lançar outro</Button>}
          <Button type="submit" form="entry-form">Salvar</Button>
        </>}>
        {shown && (
          <div key={seq} className="space-y-5">
            {!editing && (
              <Segmented label="Tipo de lançamento" value={shown.kind} onChange={setKind}
                options={[["expense", "Despesa"], ["income", "Receita"], ["transfer", "Transferência"]]} />
            )}
            {shown.kind === "transfer"
              ? <TransferForm key="t" transferId={shown.transferId} onDone={close} onAgain={() => open({ kind: "transfer" })} />
              : <TransactionForm key={shown.kind} kind={shown.kind} initial={shown.tx} onDone={close}
                  onAgain={() => open({ kind: shown.kind })} />}
          </div>
        )}
      </Sheet>
    </EntryCtx.Provider>
  );
}

/** O botão que enviou o formulário diz se é "salvar e lançar outro". */
const wantsAgain = (e: FormEvent) => ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.name === "again";

const PAYMENT = ["Pix", "Débito", "Crédito", "Boleto", "Dinheiro", "Transferência", "Débito automático"];

function TransactionForm({ kind, initial, onDone, onAgain }: {
  kind: "income" | "expense"; initial?: Transaction | null; onDone: () => void; onAgain: () => void;
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
  const again = useRef(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  // sem escolha, a conta do dia a dia (corrente) vem primeiro; a lista em si é alfabética
  const accountId = f.account_id || (active.find((a) => a.type === "checking") ?? active[0])?.id || 0;
  const hasDetails = !!(f.payment_method || f.expense_type || f.origin || f.notes);

  const save = useSave(
    (body: unknown) => (initial ? api.put(`/transactions/${initial.id}`, body) : api.post("/transactions", body)),
    initial ? "Lançamento atualizado." : kind === "income" ? "Receita registrada." : "Despesa registrada.",
    () => (again.current ? onAgain() : onDone()),
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return; // o botão Salvar fica no rodapé da folha, fora do form
    const amount = parseDecimal(f.amount);
    if (!amount || Number(amount) <= 0) return setError("Informe um valor maior que zero.");
    if (!accountId) return setError("Cadastre uma conta antes de lançar (menu Contas).");
    setError(null);
    again.current = wantsAgain(e);
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

  const settledLabel = kind === "income" ? "Recebida" : "Paga";
  return (
    <form id="entry-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-busy={save.isPending}>
      <Field label="Valor" className="sm:col-span-2">
        <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required autoFocus={!initial} />
      </Field>
      <Field label="Descrição" className="sm:col-span-2">
        <input className={inputCls} value={f.description} onChange={set("description")} required maxLength={200}
          placeholder={kind === "income" ? "Salário, venda, reembolso…" : "Mercado, aluguel, conta de luz…"} />
      </Field>
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Situação</span>
        <Segmented label="Situação" value={f.status} onChange={(v) => setF({ ...f, status: v })}
          options={[["settled", settledLabel], ["pending", "Pendente"], ["planned", "Prevista"]]} />
      </div>
      <Field label={kind === "income" ? "Data de competência" : "Data da despesa"}>
        <input type="date" className={inputCls} value={f.date} onChange={set("date")} required />
      </Field>
      {f.status === "settled" ? (
        <Field label={kind === "income" ? "Recebida em" : "Paga em"}>
          <input type="date" className={inputCls} value={f.settle_date || f.date} onChange={set("settle_date")} />
        </Field>
      ) : kind === "expense" ? (
        <Field label="Vencimento" hint="Usado nos avisos de contas a pagar.">
          <input type="date" className={inputCls} value={f.due_date} onChange={set("due_date")} />
        </Field>
      ) : <div className="hidden sm:block" />}
      <Field label={kind === "income" ? "Entra na conta" : "Sai da conta"}>
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
      <details className="group sm:col-span-2" open={hasDetails}>
        <summary className="cursor-pointer select-none py-1 text-sm font-medium text-anil">Mais detalhes</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {kind === "expense" ? (
            <>
              <Field label="Forma de pagamento">
                <input className={inputCls} list="formas" value={f.payment_method} onChange={set("payment_method")} maxLength={40} />
                <datalist id="formas">{PAYMENT.map((p) => <option key={p} value={p} />)}</datalist>
              </Field>
              <Field label="Natureza">
                <select className={inputCls} value={f.expense_type} onChange={set("expense_type")}>
                  <option value="">Não informada</option>
                  <option value="fixed">Fixa</option>
                  <option value="variable">Variável</option>
                </select>
              </Field>
            </>
          ) : (
            <Field label="Origem" className="sm:col-span-2">
              <input className={inputCls} value={f.origin} onChange={set("origin")} maxLength={100} placeholder="Empresa, cliente…" />
            </Field>
          )}
          <Field label="Observações" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={f.notes} onChange={set("notes")} />
          </Field>
        </div>
      </details>
      <div className="sm:col-span-2"><ErrorBox error={error} /></div>
    </form>
  );
}

function TransferForm({ transferId, onDone, onAgain }: { transferId?: string | null; onDone: () => void; onAgain: () => void }) {
  const accounts = useAccounts();
  const existing = useQuery({
    queryKey: ["transfer", transferId],
    enabled: !!transferId,
    queryFn: () => api.get<{ from_account_id: number; to_account_id: number; amount: string; date: string;
      description: string; notes: string | null }>(`/transfers/${transferId}`),
  });
  if (transferId && existing.isLoading) return <Loading />;
  if (transferId && !existing.data) return <ErrorBox error={existing.error} />;
  const t = existing.data;
  return <TransferFields onDone={onDone} onAgain={onAgain} transferId={transferId} accounts={accounts.data ?? []}
    initial={t ? { from: t.from_account_id, to: t.to_account_id, amount: decToInput(t.amount), date: t.date,
      description: t.description, notes: t.notes ?? "" } : undefined} />;
}

function TransferFields({ transferId, initial, accounts, onDone, onAgain }: {
  transferId?: string | null; accounts: { id: number; name: string; type: string; archived: boolean }[];
  initial?: { from: number; to: number; amount: string; date: string; description: string; notes: string };
  onDone: () => void; onAgain: () => void;
}) {
  const active = accounts.filter((a) => !a.archived || a.id === initial?.from || a.id === initial?.to);
  const [f, setF] = useState(initial ?? { from: 0, to: 0, amount: "", date: todayISO(), description: "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const again = useRef(false);
  const save = useSave(
    (body: unknown) => (transferId ? api.put(`/transfers/${transferId}`, body) : api.post("/transfers", body)),
    transferId ? "Transferência atualizada." : "Transferência registrada.", () => (again.current ? onAgain() : onDone()),
  );
  const from = f.from || (active.find((a) => a.type === "checking") ?? active[0])?.id || 0;
  const to = f.to || active.find((a) => a.id !== from)?.id || 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (save.isPending) return; // o botão Salvar fica no rodapé da folha, fora do form
    const amount = parseDecimal(f.amount);
    if (!amount || Number(amount) <= 0) return setError("Informe um valor maior que zero.");
    if (!from || !to || from === to) return setError("Escolha duas contas diferentes.");
    setError(null);
    again.current = wantsAgain(e);
    save.mutate({ from_account_id: Number(from), to_account_id: Number(to), amount, date: f.date,
      description: f.description || null, notes: f.notes || null });
  }

  return (
    <form id="entry-form" onSubmit={submit} className="grid gap-4" aria-busy={save.isPending}>
      <Field label="Valor">
        <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required autoFocus={!transferId} />
      </Field>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <Field label="De">
          <select className={inputCls} value={from} onChange={(e) => setF({ ...f, from: Number(e.target.value) })}>
            {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <ArrowRight aria-hidden="true" className="mx-auto mb-3 hidden size-4 text-ink-faint sm:block" />
        <Field label="Para">
          <select className={inputCls} value={to} onChange={(e) => setF({ ...f, to: Number(e.target.value) })}>
            {active.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Data">
        <input type="date" className={inputCls} value={f.date} required onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label="Descrição" hint="Opcional.">
        <input className={inputCls} value={f.description} maxLength={200} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <p className="text-[13px] text-ink-soft">
        Transferência só move dinheiro entre suas contas: não conta como receita nem despesa e não muda o patrimônio.
      </p>
      <ErrorBox error={error} />
    </form>
  );
}
