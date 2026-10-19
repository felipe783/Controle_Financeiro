import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { cx, Empty, ErrorBox, Loading, PageHeader, Segmented } from "../components/ui";
import { brl, capitalize, dayLabel, OP_KINDS } from "../format";

type Entry = { id: number; at: string; entity: string; entity_id: number | null; action: string; label: string | null;
  before: Record<string, unknown> | null; after: Record<string, unknown> | null };

const ENTITY: Record<string, string> = {
  transaction: "o lançamento", transfer: "a transferência", account: "a conta", recurrence: "a recorrência",
  asset: "o ativo", investment_operation: "a operação", quote: "a cotação", fx_rate: "o câmbio", liability: "a dívida",
  liability_balance: "o saldo da dívida", import: "uma importação", user: "o usuário",
};
const VERB: Record<string, string> = { create: "Criou", update: "Alterou", delete: "Excluiu", reconcile: "Conciliou",
  stop: "Encerrou", manual: "Registrou" };
const FILTERS = [["", "Tudo"], ["transaction", "Lançamentos"], ["account", "Contas"], ["asset", "Investimentos"], ["recurrence", "Recorrências"]] as const;

/** Detalhe curto do que mudou, tirado do snapshot gravado na auditoria (valor ou tipo de operação). */
function detail(e: Entry): string | null {
  const s = e.after ?? e.before;
  if (!s) return null;
  if (e.entity === "investment_operation" && typeof s.kind === "string") return OP_KINDS[s.kind] ?? null;
  if (e.action === "update" && e.before && e.after && e.before.amount !== e.after.amount && e.after.amount != null)
    return `${brl(e.before.amount as string)} → ${brl(e.after.amount as string)}`;
  if (e.action === "update" && e.before?.status !== e.after?.status && e.after?.status === "settled") return "marcado como efetivado";
  if (s.amount != null) return brl(s.amount as string);
  return null;
}

export default function Audit() {
  const [entity, setEntity] = useState<string>("");
  // investimentos juntam ativo e operação; o servidor filtra por uma entidade, então buscamos as duas
  const q = useQuery({
    queryKey: ["audit", entity],
    queryFn: async () => {
      if (entity !== "asset") return api.get<Entry[]>("/audit", { limit: 200, entity: entity || undefined });
      const [a, o] = await Promise.all([api.get<Entry[]>("/audit", { limit: 200, entity: "asset" }),
        api.get<Entry[]>("/audit", { limit: 200, entity: "investment_operation" })]);
      return [...a, ...o].sort((x, y) => y.id - x.id).slice(0, 200);
    },
  });
  const rows = q.data ?? [];
  const local = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return { day: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
  };

  return (
    <div>
      <PageHeader title="Histórico" context="Cada criação, alteração e exclusão nos seus dados, com o que mudou." />
      <div className="mb-4"><Segmented size="sm" label="Filtrar por" value={entity} onChange={setEntity} options={FILTERS} /></div>
      <ErrorBox error={q.error} className="mb-4" />
      <div className="rounded-md border border-rule bg-sheet">
        {q.isLoading ? <div className="p-5"><Loading rows={8} /></div> : rows.length === 0 ? <Empty>Nada registrado ainda.</Empty> : (
          <ol>
            {rows.map((e, i) => {
              const { day, time } = local(e.at);
              const newDay = i === 0 || local(rows[i - 1].at).day !== day;
              const extra = detail(e);
              return (
                <li key={e.id}>
                  {newDay && <div className="border-b border-rule bg-paper/60 px-4 py-1.5 text-[13px] font-semibold sm:px-5">{capitalize(dayLabel(day))}</div>}
                  <div className={cx("flex items-baseline gap-4 px-4 py-2.5 sm:px-5", !(i + 1 < rows.length && local(rows[i + 1].at).day !== day) && "border-b border-rule/70")}>
                    <span className="num w-11 shrink-0 text-[13px] text-ink-soft">{time}</span>
                    <p className="min-w-0 flex-1">
                      <span className={cx("font-medium", e.action === "delete" && "text-neg")}>{VERB[e.action] ?? e.action}</span>{" "}
                      {ENTITY[e.entity] ?? e.entity}{" "}
                      {e.label ? <strong className="font-semibold">“{e.label}”</strong> : e.entity_id && <span className="text-ink-soft">nº {e.entity_id}</span>}
                      {extra && <span className="num text-ink-soft"> · {extra}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {rows.length >= 200 && <p className="mt-2 text-xs text-ink-soft">Mostrando os 200 registros mais recentes.</p>}
    </div>
  );
}
