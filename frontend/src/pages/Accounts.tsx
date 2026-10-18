import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, FormActions, inputCls, Loading, Modal, MoneyInput, PageHeader, Table, td, th } from "../components/ui";
import { ACCOUNT_TYPES, brl, date, decToInput, parseDecimal, todayISO, toNum } from "../format";
import { useAccounts, useSave } from "../hooks";
import type { Account } from "../types";

export default function Accounts() {
  const accounts = useAccounts();
  const [edit, setEdit] = useState<Account | null | undefined>(undefined);
  const [reconcile, setReconcile] = useState<Account | null>(null);
  const [toDelete, setToDelete] = useState<Account | null>(null);
  const del = useSave((a: Account) => api.del(`/accounts/${a.id}`), "Conta excluída.", () => setToDelete(null));
  const list = accounts.data ?? [];
  const total = list.reduce((s, a) => s + toNum(a.balance), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Contas" actions={<Button onClick={() => setEdit(null)}>+ Nova conta</Button>} />
      <Card title={`Saldo total efetivado: ${brl(total)}`}>
        <ErrorBox error={accounts.error} />
        {accounts.isLoading ? <Loading /> : list.length === 0 ? (
          <Empty>Nenhuma conta. Cadastre sua conta corrente, carteira de dinheiro ou corretora.</Empty>
        ) : (
          <Table>
            <thead><tr><th className={th}>Conta</th><th className={th}>Tipo</th><th className={th}>Saldo inicial</th>
              <th className={`${th} text-right`}>Saldo atual</th><th className={`${th} text-right`}>A receber / a pagar</th>
              <th className={th}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id} className={a.archived ? "opacity-60" : ""}>
                <td className={td}><div className="font-medium">{a.name} {a.archived && <Badge>Arquivada</Badge>}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400">{a.institution}</div></td>
                <td className={td}>{ACCOUNT_TYPES[a.type]}</td>
                <td className={td}>{brl(a.initial_balance)} em {date(a.initial_balance_date)}</td>
                <td className={`${td} text-right font-medium tabular-nums ${toNum(a.balance) < 0 ? "text-red-700" : ""}`}>
                  {brl(a.balance)}</td>
                <td className={`${td} text-right text-xs tabular-nums`}>+{brl(a.pending_in)} / −{brl(a.pending_out)}</td>
                <td className={`${td} whitespace-nowrap text-right`}>
                  {!a.archived && <Button variant="ghost" onClick={() => setReconcile(a)}>Conciliar</Button>}
                  <Button variant="ghost" onClick={() => setEdit(a)}>Editar</Button>
                  <Button variant="danger-ghost" onClick={() => setToDelete(a)}>Excluir</Button>
                </td>
              </tr>))}</tbody>
          </Table>
        )}
      </Card>
      <Modal open={edit !== undefined} onClose={() => setEdit(undefined)} title={edit ? "Editar conta" : "Nova conta"}>
        {edit !== undefined && <AccountForm initial={edit} onDone={() => setEdit(undefined)} />}
      </Modal>
      <Modal open={!!reconcile} onClose={() => setReconcile(null)} title={`Conciliar ${reconcile?.name ?? ""}`}>
        {reconcile && <ReconcileForm account={reconcile} onDone={() => setReconcile(null)} />}
      </Modal>
      <ConfirmDialog open={!!toDelete} title="Excluir conta" onClose={() => setToDelete(null)} busy={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        message="Só contas sem lançamentos podem ser excluídas. Contas com histórico devem ser arquivadas." />
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
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={100}
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Instituição"><input className={inputCls} value={f.institution} maxLength={100}
        onChange={(e) => setF({ ...f, institution: e.target.value })} /></Field>
      <Field label="Tipo">
        <select className={inputCls} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(ACCOUNT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label="Saldo inicial (R$)" hint="Pode ser negativo (ex.: cheque especial).">
        <MoneyInput allowNegative value={f.initial_balance} onChange={(v) => setF({ ...f, initial_balance: v })} required />
      </Field>
      <Field label="Data do saldo inicial" hint="Movimentos efetivados antes desta data não entram no saldo.">
        <input type="date" className={inputCls} value={f.initial_balance_date} required
          onChange={(e) => setF({ ...f, initial_balance_date: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm sm:pt-6">
        <input type="checkbox" checked={f.archived} onChange={(e) => setF({ ...f, archived: e.target.checked })} />
        Arquivada (não aceita novos lançamentos)
      </label>
      <Field label="Observações" className="sm:col-span-2"><textarea className={inputCls} rows={2} value={f.notes}
        onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <div className="sm:col-span-2"><ErrorBox error={error} /><FormActions onCancel={onDone} busy={save.isPending} /></div>
    </form>
  );
}

function ReconcileForm({ account, onDone }: { account: Account; onDone: () => void }) {
  const [f, setF] = useState({ date: todayISO(), actual: decToInput(account.balance), note: "" });
  const [error, setError] = useState<string | null>(null);
  const save = useSave((body: unknown) => api.post(`/accounts/${account.id}/reconcile`, body),
    "Conciliação registrada.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    const actual = parseDecimal(f.actual);
    if (actual === null) return setError("Saldo inválido.");
    save.mutate({ date: f.date, actual_balance: actual, note: f.note || null });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Informe o saldo real do extrato. Se houver diferença, será criado um lançamento de ajuste (não é receita nem
        despesa) e o histórico fica na auditoria. Saldo calculado hoje: <strong>{brl(account.balance)}</strong>.
      </p>
      <Field label="Data do extrato"><input type="date" className={inputCls} value={f.date} required
        onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <Field label="Saldo real (R$)"><MoneyInput allowNegative value={f.actual} required
        onChange={(v) => setF({ ...f, actual: v })} /></Field>
      <Field label="Observação"><input className={inputCls} value={f.note} maxLength={500}
        onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <ErrorBox error={error} />
      <FormActions onCancel={onDone} busy={save.isPending} label="Conciliar" />
    </form>
  );
}
