import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Download, Pencil, Plus, Search, SlidersHorizontal, Trash2, Upload, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useEntry } from "../components/TransactionForms";
import {
  Button, buttonClass, ConfirmDialog, cx, Empty, ErrorBox, Field, focusRing, inputCls, Loading, Money, PageHeader,
  RowMenu, Segmented, Sheet, Status, Table, Tag, td, th, Check as CheckBox,
} from "../components/ui";
import { addDaysISO, capitalize, date, dayLabel, isInflow, KIND_LABEL, todayISO, toNum } from "../format";
import { categoryOptions, useAccounts, useCategories, useSave, useSettle } from "../hooks";
import { dur, ease, spring } from "../motion";
import type { Transaction, TransactionPage } from "../types";

const DEFAULTS = { q: "", start: "", end: "", kind: "", status: "", account_id: "", category_id: "", overdue: "",
  sort: "date", order: "desc", page: "1" };
type Filters = typeof DEFAULTS;
const PAGE_SIZE = 50;

/** Atalhos de período calculados a partir de hoje. */
function presets() {
  const today = todayISO();
  const first = `${today.slice(0, 7)}-01`;
  const prevLast = addDaysISO(first, -1);
  const nextFirst = (() => { const [y, m] = first.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; })();
  return {
    month: { start: first, end: addDaysISO(nextFirst, -1) },
    last: { start: `${prevLast.slice(0, 7)}-01`, end: prevLast },
    all: { start: "", end: "" },
  };
}

const editable = (t: Transaction) => (t.kind === "income" || t.kind === "expense") && !t.investment_operation_id;

export default function Transactions() {
  const [params, setParams] = useSearchParams();
  const f: Filters = { ...DEFAULTS, ...Object.fromEntries([...params.entries()].filter(([k]) => k in DEFAULTS)) };
  const update = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch, page: patch.page ?? "1" };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && v !== DEFAULTS[k as keyof Filters])), { replace: true });
  };
  const accounts = useAccounts();
  const cats = useCategories();
  const openEntry = useEntry();
  const list = useQuery({
    queryKey: ["transactions", f],
    queryFn: () => api.get<TransactionPage>("/transactions", { ...f, overdue: f.overdue ? true : undefined, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Transaction[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const clearSel = () => setSelected(new Set());
  // seleção vale só para o que está na tela: trocar filtro ou página a descarta
  const paramsKey = params.toString();
  useEffect(() => setSelected(new Set()), [paramsKey]);
  const del = useSave(async (txs: Transaction[]) => {
    if (txs.length === 1 && txs[0].transfer_id) return api.del(`/transactions/${txs[0].id}`);
    return api.post("/transactions/bulk/delete", { ids: txs.map((t) => t.id) });
  }, "Lançamentos excluídos.", () => { setToDelete(null); clearSel(); });
  const dup = useSave((t: Transaction) => api.post(`/transactions/${t.id}/duplicate`, { date: todayISO() }),
    "Lançamento duplicado como previsto para hoje.");
  const settle = useSettle(clearSel);

  const p = list.data;
  const pages = p ? Math.max(1, Math.ceil(p.total / p.page_size)) : 1;
  const page = Number(f.page) || 1;
  const pr = presets();
  const periodKey = (Object.entries(pr).find(([, r]) => r.start === f.start && r.end === f.end)?.[0] ?? "custom") as keyof typeof pr | "custom";
  const accName = (id: string) => accounts.data?.find((a) => String(a.id) === id)?.name;
  const catName = (id: string) => cats.data?.find((c) => String(c.id) === id)?.name;

  const chips: [keyof Filters, string][] = [
    ...(f.kind ? [["kind", { income: "Receitas", expense: "Despesas", transfer: "Transferências", investment: "Investimentos", adjustment: "Ajustes" }[f.kind] ?? f.kind] as [keyof Filters, string]] : []),
    ...(f.status ? [["status", { planned: "Previstas", pending: "Pendentes", settled: "Efetivadas" }[f.status] ?? f.status] as [keyof Filters, string]] : []),
    ...(f.account_id ? [["account_id", `Conta: ${accName(f.account_id) ?? "…"}`] as [keyof Filters, string]] : []),
    ...(f.category_id ? [["category_id", `Categoria: ${catName(f.category_id) ?? "…"}`] as [keyof Filters, string]] : []),
    ...(f.overdue ? [["overdue", "Só atrasadas"] as [keyof Filters, string]] : []),
    ...(periodKey === "custom" && (f.start || f.end) ? [["start", `${f.start ? date(f.start) : "início"} a ${f.end ? date(f.end) : "hoje"}`] as [keyof Filters, string]] : []),
  ];

  const items = p?.items ?? [];
  const grouped = f.sort === "date";
  const groups = useMemo(() => {
    if (f.sort !== "date") return [{ day: null as string | null, rows: items }];
    const out: { day: string | null; rows: Transaction[] }[] = [];
    for (const t of items) {
      const last = out[out.length - 1];
      if (last && last.day === t.date) last.rows.push(t); else out.push({ day: t.date, rows: [t] });
    }
    return out;
  }, [items, f.sort]);

  const selectable = items.filter(editable);
  const selectedTx = items.filter((t) => selected.has(t.id));
  const selectedNet = selectedTx.reduce((s, t) => s + (isInflow(t.kind) ? 1 : -1) * toNum(t.amount), 0);
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = selectable.length > 0 && selectable.every((t) => selected.has(t.id));

  const sortBy = (col: string) => update({ sort: col, order: f.sort === col && f.order === "desc" ? "asc" : "desc" });
  const SortIcon = ({ col }: { col: string }) => f.sort === col
    ? (f.order === "desc" ? <ArrowDown className="size-3" aria-hidden="true" /> : <ArrowUp className="size-3" aria-hidden="true" />) : null;
  const ariaSort = (col: string) => (f.sort === col ? (f.order === "desc" ? "descending" : "ascending") : "none") as "descending" | "ascending" | "none";
  const exportParams = { ...f, kind: ["income", "expense"].includes(f.kind) ? f.kind : undefined, page: undefined, sort: undefined, order: undefined, overdue: undefined };

  function open(t: Transaction) {
    if (t.transfer_id) openEntry({ transferId: t.transfer_id });
    else if (editable(t)) openEntry({ kind: t.kind as "income" | "expense", tx: t });
  }

  return (
    <div>
      <PageHeader title="Lançamentos" context="Seu extrato: tudo que entrou, saiu ou está previsto."
        actions={<>
          <Button variant="ghost" icon={Upload} onClick={() => setImporting(true)}>Importar</Button>
          <a className={buttonClass("ghost")} href={api.url("/transactions/export", exportParams)}>
            <Download aria-hidden="true" className="size-4" />Exportar CSV</a>
          <Button icon={Plus} onClick={() => openEntry()} className="hidden sm:inline-flex">Novo lançamento</Button>
        </>} />

      {/* Barra de busca e filtros: o período fica sempre à vista; o resto abre sob demanda. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
            <input type="search" aria-label="Buscar pela descrição" placeholder="Buscar pela descrição"
              className={cx(inputCls, "pl-9")} value={f.q} maxLength={100} onChange={(e) => update({ q: e.target.value })} />
          </div>
          <Segmented size="sm" label="Período" value={periodKey}
            options={[["month", "Este mês"], ["last", "Mês passado"], ["all", "Tudo"], ["custom", "Escolher"]]}
            onChange={(k) => { if (k === "custom") setShowFilters(true); else update(pr[k]); }} />
          <Button variant="secondary" size="sm" icon={SlidersHorizontal} aria-expanded={showFilters} aria-controls="filtros"
            onClick={() => setShowFilters(!showFilters)}>Filtros{chips.length ? ` (${chips.length})` : ""}</Button>
        </div>

        <AnimatePresence initial={false}>
        {showFilters && (
          <motion.div key="f" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: dur.slow, ease: ease.out }} className="overflow-hidden">
          <div id="filtros" className="grid gap-3 rounded-lg border border-rule bg-sheet p-4 shadow-lift sm:grid-cols-2 lg:grid-cols-4">
            <Field label="De"><input type="date" className={inputCls} value={f.start} onChange={(e) => update({ start: e.target.value })} /></Field>
            <Field label="Até"><input type="date" className={inputCls} value={f.end} onChange={(e) => update({ end: e.target.value })} /></Field>
            <Field label="Tipo">
              <select className={inputCls} value={f.kind} onChange={(e) => update({ kind: e.target.value })}>
                <option value="">Todos</option><option value="income">Receitas</option><option value="expense">Despesas</option>
                <option value="transfer">Transferências</option><option value="investment">Investimentos</option>
                <option value="adjustment">Ajustes de conciliação</option>
              </select>
            </Field>
            <Field label="Situação">
              <select className={inputCls} value={f.status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">Todas</option><option value="settled">Efetivadas</option>
                <option value="pending">Pendentes</option><option value="planned">Previstas</option>
              </select>
            </Field>
            <Field label="Conta">
              <select className={inputCls} value={f.account_id} onChange={(e) => update({ account_id: e.target.value })}>
                <option value="">Todas</option>
                {accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Categoria">
              <select className={inputCls} value={f.category_id} onChange={(e) => update({ category_id: e.target.value })}>
                <option value="">Todas</option>
                <optgroup label="Despesas">{categoryOptions(cats.data, "expense").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
                <optgroup label="Receitas">{categoryOptions(cats.data, "income").map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>
              </select>
            </Field>
            <CheckBox className="self-end" checked={!!f.overdue} onChange={(v) => update({ overdue: v ? "1" : "" })}>Só despesas atrasadas</CheckBox>
          </div>
          </motion.div>
        )}
        </AnimatePresence>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <AnimatePresence initial={false} mode="popLayout">
            {chips.map(([k, label]) => (
              <motion.button layout key={k} type="button" onClick={() => update(k === "start" ? { start: "", end: "" } : { [k]: "" })}
                initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1, transition: spring.snappy }}
                exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
                className={cx("inline-flex min-h-8 items-center gap-1.5 rounded-full border border-anil/30 bg-anil-wash pl-3 pr-2 text-[13px] text-ink",
                  "hover:border-anil/60", focusRing)} aria-label={`Remover filtro ${label}`}>
                {label}<X aria-hidden="true" className="size-3.5 text-ink-soft" />
              </motion.button>
            ))}
            </AnimatePresence>
            <button type="button" className={cx("rounded px-1 text-[13px] font-medium text-anil hover:underline", focusRing)}
              onClick={() => setParams({}, { replace: true })}>Limpar tudo</button>
          </div>
        )}
      </div>

      {/* Totais do filtro atual */}
      {p && (
        <div className="mt-5">
          <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div><dt className="text-[13px] text-ink-soft">Entradas</dt><dd><Money value={p.sum_in} size="lg" flow="in" animate /></dd></div>
            <div><dt className="text-[13px] text-ink-soft">Saídas</dt><dd><Money value={p.sum_out} size="lg" flow="out" animate /></dd></div>
            <div><dt className="text-[13px] text-ink-soft">Saldo do filtro</dt><dd><Money value={toNum(p.sum_in) - toNum(p.sum_out)} size="lg" tone="signed" animate /></dd></div>
            <div className="ml-auto text-sm text-ink-soft">{p.total} {p.total === 1 ? "lançamento" : "lançamentos"}</div>
          </dl>
          <FlowBar sumIn={toNum(p.sum_in)} sumOut={toNum(p.sum_out)} />
        </div>
      )}

      <ErrorBox error={list.error} className="mt-4" />
      <div className={cx("mt-4 rounded-lg border border-rule bg-sheet shadow-lift transition-opacity", list.isFetching && !list.isLoading && "opacity-70")}>
        {list.isLoading ? <div className="p-5"><Loading rows={8} /></div> : items.length === 0 ? (
          <Empty title={chips.length || f.q ? "Nada encontrado com esses filtros" : "Nenhum lançamento ainda"}
            action={chips.length || f.q
              ? <Button variant="secondary" onClick={() => setParams({}, { replace: true })}>Limpar filtros</Button>
              : <Button icon={Plus} onClick={() => openEntry()}>Registrar o primeiro</Button>}>
            {chips.length || f.q ? "Tente outro período ou remova algum filtro." : "Registre receitas, despesas e transferências para montar seu extrato."}
          </Empty>
        ) : (
          <table className="w-full table-fixed text-left text-sm">
            <thead>
              <tr>
                <th className={cx(th, "w-11")}>
                  <input type="checkbox" aria-label="Selecionar todos desta página" className="size-4 align-middle"
                    disabled={!selectable.length} checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(selectable.map((t) => t.id)))} />
                </th>
                {grouped ? (
                  <th className={cx(th, "hidden w-0 p-0 sm:table-cell")}><span className="sr-only">Data (nos cabeçalhos de dia)</span></th>
                ) : (
                  <th className={cx(th, "hidden w-28 sm:table-cell")} aria-sort={ariaSort("date")}>
                    <button type="button" className={cx("inline-flex items-center gap-1 rounded", focusRing)} onClick={() => sortBy("date")}>Data<SortIcon col="date" /></button></th>
                )}
                <th className={th} aria-sort={ariaSort("description")}>
                  <button type="button" className={cx("inline-flex items-center gap-1 rounded", focusRing)} onClick={() => sortBy("description")}>Descrição<SortIcon col="description" /></button>
                  {grouped && <button type="button" className={cx("ml-3 inline-flex items-center gap-1 rounded font-normal", focusRing)}
                    onClick={() => sortBy("date")} aria-label={`Ordenar por data, ${f.order === "desc" ? "mais antigas primeiro" : "mais recentes primeiro"}`}>
                    por data<SortIcon col="date" /></button>}
                  {!grouped && <button type="button" className={cx("ml-3 rounded font-normal text-anil", focusRing)}
                    onClick={() => update({ sort: "date", order: "desc" })}>agrupar por dia</button>}</th>
                <th className={cx(th, "hidden w-32 lg:table-cell")}>Situação</th>
                <th className={cx(th, "w-[7.25rem] text-right sm:w-36")} aria-sort={ariaSort("amount")}>
                  <button type="button" className={cx("inline-flex items-center gap-1 rounded", focusRing)} onClick={() => sortBy("amount")}>Valor<SortIcon col="amount" /></button></th>
                <th className={cx(th, "w-[6.25rem] xl:w-[9rem]")}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g, gi) => (
                <Fragment key={g.day ?? gi}>
                  {g.day && (
                    <tr>
                      <th colSpan={6} scope="colgroup" style={{ top: "var(--sticky-top, 0px)" }}
                        className="sticky z-10 border-b border-rule bg-sunk/95 px-4 py-2 text-left backdrop-blur sm:px-5">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="display font-figure text-[13px] font-[640]">{capitalize(dayLabel(g.day))}</span>
                          <Money value={dayNet(g.rows)} size="sm" tone="signed" className="opacity-80" />
                        </span>
                      </th>
                    </tr>
                  )}
                  <AnimatePresence initial={false}>
                  {g.rows.map((t, ri) => {
                    const ed = editable(t);
                    const pending = ed && t.status !== "settled";
                    return (
                      <motion.tr key={t.id} layout="position"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0, transition: { delay: Math.min((gi * 3 + ri) * 0.012, 0.25), duration: dur.base } }}
                        exit={{ opacity: 0, x: 40, transition: { duration: dur.base, ease: ease.exit } }}
                        className={cx("group transition-colors duration-200", selected.has(t.id) ? "bg-anil-wash/70" : "hover:bg-anil-wash/30")}>
                        <td className={td}>
                          {ed && <input type="checkbox" className="size-4 align-middle" aria-label={`Selecionar ${t.description}`}
                            checked={selected.has(t.id)} onChange={() => toggle(t.id)} />}
                        </td>
                        {grouped ? <td className="hidden w-0 border-b border-rule/70 p-0 sm:table-cell" /> : (
                          <td className={cx(td, "num hidden whitespace-nowrap text-ink-soft sm:table-cell")}>{date(t.date)}</td>)}
                        <td className={cx(td, "max-w-0 w-full")}>
                          <button type="button" onClick={() => open(t)} disabled={!ed && !t.transfer_id}
                            className={cx("block w-full rounded text-left disabled:cursor-default", focusRing)}>
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="min-w-0 max-w-full truncate font-medium">{t.description}</span>
                              {t.recurrence_id && <Tag>Recorrente</Tag>}
                              {t.investment_operation_id && <Tag>Investimento</Tag>}
                              {t.transfer_id && <Tag>Transferência</Tag>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-soft">
                              {[t.category_name ?? (ed ? "Sem categoria" : KIND_LABEL[t.kind]), t.account_name,
                                t.due_date && t.status !== "settled" ? `vence ${date(t.due_date)}` : null].filter(Boolean).join(" · ")}
                            </span>
                            <span className="mt-1 block lg:hidden"><TxStatus t={t} /></span>
                          </button>
                        </td>
                        <td className={cx(td, "hidden whitespace-nowrap lg:table-cell")}><TxStatus t={t} /></td>
                        <td className={cx(td, "whitespace-nowrap text-right")}>
                          <Money value={t.amount} size="sm" flow={isInflow(t.kind) ? "in" : "out"} className="sm:text-[15px]" />
                        </td>
                        <td className={cx(td, "whitespace-nowrap text-right")}>
                          <div className="flex items-center justify-end gap-1">
                            {pending && (
                              <Button size="sm" variant="secondary" icon={Check} disabled={settle.isPending}
                                aria-label={`${t.kind === "income" ? "Receber" : "Pagar"} ${t.description}`}
                                onClick={() => settle.mutate([t.id])}>
                                <span className="hidden xl:inline">{t.kind === "income" ? "Receber" : "Pagar"}</span></Button>
                            )}
                            <RowMenu label={`Ações de ${t.description}`} items={[
                              { label: "Editar", icon: Pencil, onSelect: () => open(t), hidden: !ed && !t.transfer_id },
                              { label: "Duplicar para hoje", icon: Copy, onSelect: () => dup.mutate(t), hidden: !ed },
                              { label: t.transfer_id ? "Excluir transferência" : "Excluir", icon: Trash2, danger: true,
                                onSelect: () => setToDelete([t]), hidden: !!t.investment_operation_id || (!ed && !t.transfer_id) },
                            ]} />
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  </AnimatePresence>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {p && pages > 1 && (
          <nav aria-label="Paginação" className="flex items-center justify-between gap-2 border-t border-rule px-4 py-2.5 text-sm sm:px-5">
            <span className="text-ink-soft">Página {page} de {pages}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Anterior</Button>
              <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                Próxima<ChevronRight aria-hidden="true" className="size-3.5" /></Button>
            </div>
          </nav>
        )}
      </div>

      {/* Ações em lote: aparece só com seleção, presa ao rodapé da tela */}
      {createPortal(<AnimatePresence>
      {selected.size > 0 && (
        <motion.div role="region" aria-label="Ações para os selecionados" key="bulk"
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: spring.layer }}
          exit={{ y: 80, opacity: 0, transition: { duration: dur.base } }}
          className="fixed inset-x-3 bottom-20 z-30 mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-ink px-4 py-3 text-paper shadow-float md:bottom-6">
          <span className="text-sm font-medium">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={selected.size} className="inline-block" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                exit={{ y: 10, opacity: 0 }} transition={{ duration: dur.fast }}>{selected.size}</motion.span>
            </AnimatePresence>{" "}{selected.size === 1 ? "selecionado" : "selecionados"}</span>
          <span className="num font-figure text-sm opacity-80">saldo {selectedNet < 0 ? "−" : "+"} {Math.abs(selectedNet).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" icon={Check} className="bg-sheet !text-ink hover:bg-paper"
              disabled={settle.isPending || selectedTx.every((t) => t.status === "settled")}
              onClick={() => settle.mutate(selectedTx.filter((t) => t.status !== "settled").map((t) => t.id))}
              >Marcar como efetivados</Button>
            <Button size="sm" variant="danger" icon={Trash2} onClick={() => setToDelete(selectedTx)}>Excluir</Button>
            <button type="button" aria-label="Limpar seleção" onClick={clearSel}
              className={cx("grid size-8 place-items-center rounded opacity-80 hover:opacity-100", focusRing)}><X className="size-4" /></button>
          </div>
        </motion.div>
      )}
      </AnimatePresence>, document.body)}

      <ConfirmDialog open={!!toDelete} title={toDelete && toDelete.length > 1 ? `Excluir ${toDelete.length} lançamentos` : "Excluir lançamento"}
        busy={del.isPending} onClose={() => setToDelete(null)} onConfirm={() => toDelete && del.mutate(toDelete)}
        confirmLabel="Excluir"
        message={!toDelete ? null : toDelete.length > 1
          ? "Os lançamentos selecionados serão excluídos de uma vez. Cada exclusão fica registrada no histórico."
          : toDelete[0].transfer_id ? "Os dois lados desta transferência serão excluídos."
          : <>Excluir “{toDelete[0].description}” (<Money value={toDelete[0].amount} size="sm" />)? A exclusão fica registrada no histórico.</>} />
      <ImportSheet open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

const dayNet = (rows: Transaction[]) => rows.filter((t) => t.kind === "income" || t.kind === "expense")
  .reduce((s, t) => s + (t.kind === "income" ? 1 : -1) * toNum(t.amount), 0);

/** Proporção entre o que entrou e o que saiu no filtro atual. */
function FlowBar({ sumIn, sumOut }: { sumIn: number; sumOut: number }) {
  const total = sumIn + sumOut;
  if (!total) return <div className="mt-4 h-px bg-rule" />;
  return (
    <div className="mt-4 flex h-2 gap-[3px]" role="img" aria-label={`Entradas: ${Math.round((sumIn / total) * 100)}% do movimento`}>
      {([[sumIn, "bg-pos"], [sumOut, "bg-neg"]] as const).map(([v, c]) => (
        <motion.div key={c} layout className={cx("h-full rounded-full", c)} style={{ flexGrow: v }}
          transition={{ duration: dur.slow, ease: ease.out }} />
      ))}
    </div>
  );
}

function TxStatus({ t }: { t: Transaction }) {
  if (t.overdue) return <Status tone="neg">Atrasada</Status>;
  if (t.status === "planned") return <Status tone="slate">Prevista</Status>;
  if (t.status === "pending") return <Status tone="warn">Pendente</Status>;
  return <Status tone="pos">{t.kind === "income" ? "Recebida" : t.kind === "expense" ? "Paga" : "Efetivada"}</Status>;
}

type Row = { line: number; date: string | null; description: string | null; amount: string | null; kind: string | null;
  status: string | null; category_name: string | null; account_name: string | null; errors: string[]; duplicate: boolean };

function ImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts();
  const [file, setFile] = useState<File | null>(null);
  const [account, setAccount] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [includeDup, setIncludeDup] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const close = () => { setFile(null); setRows(null); setError(null); onClose(); };
  const form = () => {
    const fd = new FormData();
    fd.append("file", file!);
    if (account) fd.append("default_account_id", account);
    return fd;
  };
  async function preview() {
    setError(null);
    setBusy(true);
    try { setRows(await api.upload<Row[]>("/transactions/import/preview", form())); } catch (e) { setError(e); } finally { setBusy(false); }
  }
  const commit = useSave(async () => {
    const fd = form();
    fd.append("include_duplicates", String(includeDup));
    return api.upload("/transactions/import/commit", fd);
  }, "Importação concluída.", close);
  const errors = rows?.filter((r) => r.errors.length).length ?? 0;
  const dups = rows?.filter((r) => r.duplicate).length ?? 0;

  return (
    <Sheet open={open} onClose={close} title="Importar lançamentos" width="lg"
      description="Um arquivo CSV no mesmo formato que esta tela exporta."
      footer={<>
        <Button variant="ghost" onClick={close}>Cancelar</Button>
        {rows ? <Button disabled={errors > 0 || commit.isPending} onClick={() => commit.mutate(undefined)}>
          {errors > 0 ? "Corrija as linhas com erro" : commit.isPending ? "Importando…" : `Importar ${rows.length - (includeDup ? 0 : dups)} lançamentos`}</Button>
          : <Button disabled={!file || busy} onClick={preview}>{busy ? "Lendo…" : "Conferir arquivo"}</Button>}
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Colunas: <code className="text-ink">data;descricao;valor;tipo;status;categoria;conta;observacoes</code>.
          Datas em dd/mm/aaaa, valores positivos (1.234,56) e tipo “receita” ou “despesa”.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Arquivo CSV">
            <input type="file" accept=".csv,text/csv" className={cx(inputCls, "py-1.5 file:mr-3 file:rounded-sm file:border-0 file:bg-anil-wash file:px-2 file:py-1 file:text-anil")}
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows(null); }} />
          </Field>
          <Field label="Conta para linhas sem conta">
            <select className={inputCls} value={account} onChange={(e) => { setAccount(e.target.value); setRows(null); }}>
              <option value="">Nenhuma (a linha vira erro)</option>
              {accounts.data?.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
        <ErrorBox error={error} />
        {rows && (
          <>
            <p className="text-sm">
              <strong>{rows.length}</strong> linhas: <span className={errors ? "font-medium text-neg" : ""}>{errors} com erro</span>,{" "}
              <span className={dups ? "font-medium text-warn" : ""}>{dups} possíveis duplicadas</span>.
            </p>
            <div className="max-h-[50vh] overflow-auto rounded border border-rule">
              <Table minWidth="min-w-[560px]">
                <thead><tr><th className={th}>Linha</th><th className={th}>Data</th><th className={th}>Descrição</th>
                  <th className={cx(th, "text-right")}>Valor</th><th className={th}>Conferência</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.line}>
                    <td className={cx(td, "num text-ink-soft")}>{r.line}</td><td className={cx(td, "num")}>{date(r.date)}</td>
                    <td className={td}>{r.description}<div className="text-xs text-ink-soft">{[r.kind && KIND_LABEL[r.kind], r.account_name].filter(Boolean).join(" · ")}</div></td>
                    <td className={cx(td, "text-right")}><Money value={r.amount} size="sm" /></td>
                    <td className={td}>{r.errors.length ? <span className="text-[13px] text-neg">{r.errors.join(" ")}</span>
                      : r.duplicate ? <Status tone="warn">Possível duplicada</Status> : <Status tone="pos">Pronta</Status>}</td>
                  </tr>))}</tbody>
              </Table>
            </div>
            {dups > 0 && <CheckBox checked={includeDup} onChange={setIncludeDup}>Importar também as possíveis duplicadas</CheckBox>}
          </>
        )}
      </div>
    </Sheet>
  );
}
