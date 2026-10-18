import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { TransactionModal, TransferModal } from "../components/TransactionForms";
import { Badge, Button, buttonClass, Card, ConfirmDialog, Empty, ErrorBox, Field, inputCls, Loading, Modal, PageHeader, Table, td, th } from "../components/ui";
import { brl, date, KIND_LABEL, statusLabel, todayISO } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave } from "../hooks";
import type { Transaction, TransactionPage } from "../types";

const POSITIVE = new Set(["income", "transfer_in", "adjustment_in", "investment_in"]);

export default function Transactions() {
  const accounts = useAccounts();
  const cats = useCategories();
  const [filters, setFilters] = useState({ start: "", end: "", kind: "", status: "", account_id: "", category_id: "",
    q: "", overdue: false, sort: "date", order: "desc", page: 1, page_size: 50 });
  const set = (k: string, v: unknown) => setFilters({ ...filters, [k]: v, page: k === "page" ? (v as number) : 1 });
  const list = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => api.get<TransactionPage>("/transactions", { ...filters, overdue: filters.overdue || undefined }),
    placeholderData: keepPreviousData,
  });
  const [edit, setEdit] = useState<{ kind: "income" | "expense"; tx: Transaction | null } | null>(null);
  const [transfer, setTransfer] = useState<{ id: string | null } | null>(null);
  const [toDelete, setToDelete] = useState<Transaction | null>(null);
  const [importing, setImporting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [filters.start, filters.end, filters.kind, filters.status, filters.account_id,
    filters.category_id, filters.overdue].filter(Boolean).length;

  const del = useSave((t: Transaction) => api.del(`/transactions/${t.id}`), "Lançamento excluído.",
    () => setToDelete(null));
  const dup = useSave((t: Transaction) => api.post(`/transactions/${t.id}/duplicate`, { date: todayISO() }),
    "Lançamento duplicado como previsto para hoje.");
  const settle = useSave((t: Transaction) => api.put(`/transactions/${t.id}`, {
    ...t, status: "settled", settle_date: todayISO() }), "Marcado como efetivado.");

  const p = list.data;
  const pages = p ? Math.max(1, Math.ceil(p.total / p.page_size)) : 1;
  const sortBy = (col: string) => setFilters({ ...filters, sort: col,
    order: filters.sort === col && filters.order === "desc" ? "asc" : "desc", page: 1 });
  const arrow = (col: string) => (filters.sort === col ? (filters.order === "desc" ? " ↓" : " ↑") : "");
  const exportParams = { ...filters, kind: ["income", "expense"].includes(filters.kind) ? filters.kind : undefined };

  return (
    <div className="space-y-6">
      <PageHeader title="Lançamentos" actions={<>
          <Button onClick={() => setEdit({ kind: "expense", tx: null })}>+ Despesa</Button>
          <Button variant="secondary" onClick={() => setEdit({ kind: "income", tx: null })}>+ Receita</Button>
          <Button variant="secondary" onClick={() => setTransfer({ id: null })}>Transferência</Button>
          <Button variant="ghost" onClick={() => setImporting(true)}>Importar CSV</Button>
          <a className={buttonClass("ghost")} href={api.url("/transactions/export", exportParams)}>Exportar CSV</a>
      </>} />

      <Card>
        {/* No celular só a busca fica aberta; os demais filtros abrem sob demanda (no desktop, sempre visíveis). */}
        <div className="flex items-end gap-2">
          <Field label="Buscar descrição" className="flex-1">
            <input className={inputCls} type="search" value={filters.q} onChange={(e) => set("q", e.target.value)} maxLength={100} />
          </Field>
          <Button variant="secondary" className="md:hidden" aria-expanded={showFilters} aria-controls="filtros"
            onClick={() => setShowFilters(!showFilters)}>Filtros{activeFilters ? ` (${activeFilters})` : ""}</Button>
        </div>
        <div id="filtros" className={`${showFilters ? "grid" : "hidden"} mt-3 gap-3 sm:grid-cols-2 md:grid lg:grid-cols-4`}>
          <Field label="De"><input type="date" className={inputCls} value={filters.start}
            onChange={(e) => set("start", e.target.value)} /></Field>
          <Field label="Até"><input type="date" className={inputCls} value={filters.end}
            onChange={(e) => set("end", e.target.value)} /></Field>
          <Field label="Tipo">
            <select className={inputCls} value={filters.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="">Todos</option><option value="income">Receitas</option>
              <option value="expense">Despesas</option><option value="transfer">Transferências</option>
              <option value="investment">Investimentos</option><option value="adjustment">Ajustes</option>
            </select>
          </Field>
          <Field label="Situação">
            <select className={inputCls} value={filters.status} onChange={(e) => set("status", e.target.value)}>
              <option value="">Todas</option><option value="planned">Prevista</option>
              <option value="pending">Pendente</option><option value="settled">Efetivada</option>
            </select>
          </Field>
          <Field label="Conta">
            <select className={inputCls} value={filters.account_id} onChange={(e) => set("account_id", e.target.value)}>
              <option value="">Todas</option>
              {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Categoria">
            <select className={inputCls} value={filters.category_id}
              onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Todas</option>
              <optgroup label="Despesas">{categoryOptions(cats.data, "expense").map((c) =>
                <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
              <optgroup label="Receitas">{categoryOptions(cats.data, "income").map((c) =>
                <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
            </select>
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={filters.overdue} onChange={(e) => set("overdue", e.target.checked)} />
            Somente atrasadas
          </label>
        </div>
      </Card>

      <Card>
        <ErrorBox error={list.error} />
        {list.isLoading ? <Loading /> : !p || p.items.length === 0 ? <Empty>Nenhum lançamento encontrado.</Empty> : (
          <>
            <div className="mb-2 flex flex-wrap gap-4 text-sm">
              <span>{p.total} lançamento(s)</span>
              <span className="text-emerald-700 dark:text-emerald-400">Entradas: {brl(p.sum_in)}</span>
              <span className="text-red-700 dark:text-red-400">Saídas: {brl(p.sum_out)}</span>
            </div>
            <Table minWidth="md:min-w-[640px]">
              <thead><tr>
                <th className={th}><button onClick={() => sortBy("date")}>Data{arrow("date")}</button></th>
                <th className={th}><button onClick={() => sortBy("description")}>Descrição{arrow("description")}</button></th>
                <th className={`${th} hidden md:table-cell`}>Tipo</th><th className={`${th} hidden md:table-cell`}>Categoria</th><th className={`${th} hidden md:table-cell`}>Conta</th>
                <th className={th}>Situação</th>
                <th className={`${th} hidden text-right md:table-cell`}><button onClick={() => sortBy("amount")}>Valor{arrow("amount")}</button></th>
                <th className={th}><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody>
                {p.items.map((t) => {
                  const editable = (t.kind === "income" || t.kind === "expense") && !t.investment_operation_id;
                  return (
                    <tr key={t.id}>
                      <td className={`${td} whitespace-nowrap`}>{date(t.date)}
                        {t.due_date && <div className="text-xs text-slate-600 dark:text-slate-400">vence {date(t.due_date)}</div>}</td>
                      <td className={td}>{t.description}
                        <div className={`tabular-nums md:hidden ${POSITIVE.has(t.kind) ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"}`}>{POSITIVE.has(t.kind) ? "+" : "−"} {brl(t.amount)}</div>
                        {t.recurrence_id && <> <Badge tone="blue">Recorrente</Badge></>}
                        {t.investment_operation_id && <> <Badge tone="blue">Via investimento</Badge></>}</td>
                      <td className={`${td} hidden md:table-cell`}>{KIND_LABEL[t.kind]}</td>
                      <td className={`${td} hidden md:table-cell`}>{t.category_name ?? "—"}</td>
                      <td className={`${td} hidden md:table-cell`}>{t.account_name}</td>
                      <td className={td}>
                        <Badge tone={t.overdue ? "red" : t.status === "settled" ? "green" : "amber"}>
                          {t.overdue ? "Atrasada" : statusLabel(t.kind, t.status)}</Badge>
                      </td>
                      <td className={`${td} hidden whitespace-nowrap text-right tabular-nums md:table-cell ${POSITIVE.has(t.kind)
                        ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                        {POSITIVE.has(t.kind) ? "+" : "−"} {brl(t.amount)}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        {editable && t.status !== "settled" && (
                          <Button variant="ghost" onClick={() => settle.mutate(t)}>
                            {t.kind === "income" ? "Receber" : "Pagar"}</Button>)}
                        {editable && <Button variant="ghost" onClick={() => setEdit({ kind: t.kind as "income" | "expense", tx: t })}>Editar</Button>}
                        {editable && <Button variant="ghost" onClick={() => dup.mutate(t)}>Duplicar</Button>}
                        {t.transfer_id && <Button variant="ghost" onClick={() => setTransfer({ id: t.transfer_id })}>Editar</Button>}
                        {!t.investment_operation_id && (
                          <Button variant="ghost" className="text-red-700" onClick={() => setToDelete(t)}>Excluir</Button>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <nav aria-label="Paginação" className="mt-3 flex items-center justify-end gap-2 text-sm">
              <Button variant="secondary" disabled={filters.page <= 1} onClick={() => set("page", filters.page - 1)}>Anterior</Button>
              <span>Página {filters.page} de {pages}</span>
              <Button variant="secondary" disabled={filters.page >= pages} onClick={() => set("page", filters.page + 1)}>Próxima</Button>
            </nav>
          </>
        )}
      </Card>

      <TransactionModal open={!!edit} kind={edit?.kind ?? "expense"} initial={edit?.tx} onClose={() => setEdit(null)} />
      <TransferModal open={!!transfer} transferId={transfer?.id} onClose={() => setTransfer(null)} />
      <ConfirmDialog open={!!toDelete} title="Excluir lançamento" busy={del.isPending} onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        message={toDelete?.transfer_id ? "Os dois lados desta transferência serão excluídos. Continuar?"
          : `Excluir “${toDelete?.description}” (${brl(toDelete?.amount)})? A exclusão fica registrada na auditoria.`} />
      <ImportModal open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

type Row = { line: number; date: string | null; description: string | null; amount: string | null; kind: string | null;
  status: string | null; category_name: string | null; account_name: string | null; errors: string[]; duplicate: boolean };

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts();
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [includeDup, setIncludeDup] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const close = () => { setFile(null); setRows(null); setError(null); onClose(); };
  const form = () => {
    const fd = new FormData();
    fd.append("file", file!);
    if (account) fd.append("default_account_id", account);
    return fd;
  };
  async function preview() {
    setError(null);
    try { setRows(await api.upload<Row[]>("/transactions/import/preview", form())); } catch (e) { setError(e); }
  }
  const commit = useSave(async () => {
    const fd = form();
    fd.append("include_duplicates", String(includeDup));
    return api.upload("/transactions/import/commit", fd);
  }, "Importação concluída.", close);
  const errors = rows?.filter((r) => r.errors.length).length ?? 0;
  const dups = rows?.filter((r) => r.duplicate).length ?? 0;

  return (
    <Modal open={open} onClose={close} title="Importar lançamentos (CSV)" wide>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
        Colunas: <code>data;descricao;valor;tipo;status;categoria;conta;observacoes</code>. Datas em dd/mm/aaaa,
        valores positivos (ex.: 1.234,56), tipo “receita” ou “despesa”. O arquivo exportado por esta tela segue o mesmo
        formato.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Arquivo"><input type="file" accept=".csv,text/csv" className="text-sm"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); }} /></Field>
        <Field label="Conta padrão (se a coluna conta estiver vazia)">
          <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">—</option>
            {accounts.data?.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <div className="flex items-end"><Button disabled={!file} onClick={preview}>Pré-visualizar</Button></div>
      </div>
      <div className="mt-3"><ErrorBox error={error} /></div>
      {rows && (
        <div className="mt-4">
          <p className="mb-2 text-sm">{rows.length} linha(s) · {errors} com erro · {dups} possível(is) duplicado(s)</p>
          <div className="max-h-80 overflow-auto">
            <Table>
              <thead><tr><th className={th}>Linha</th><th className={th}>Data</th><th className={th}>Descrição</th>
                <th className={th}>Valor</th><th className={th}>Tipo</th><th className={th}>Conta</th>
                <th className={th}>Verificação</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.line}>
                  <td className={td}>{r.line}</td><td className={td}>{date(r.date)}</td>
                  <td className={td}>{r.description}</td><td className={td}>{brl(r.amount)}</td>
                  <td className={td}>{r.kind ? KIND_LABEL[r.kind] : "—"}</td><td className={td}>{r.account_name ?? "—"}</td>
                  <td className={td}>{r.errors.length ? <span className="text-red-700">{r.errors.join(" ")}</span>
                    : r.duplicate ? <Badge tone="amber">Possível duplicado</Badge> : <Badge tone="green">OK</Badge>}</td>
                </tr>))}</tbody>
            </Table>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} />
            Importar também os possíveis duplicados
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancelar</Button>
            <Button disabled={errors > 0 || commit.isPending} onClick={() => commit.mutate(undefined)}>
              {errors > 0 ? "Corrija os erros para importar" : "Importar"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
