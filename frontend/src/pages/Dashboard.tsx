import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { brlShort, ChartBox, foldOthers, Legend, moneyFormatter, useChartTheme } from "../components/charts";
import {
  Button, cx, Empty, ErrorBox, Figure, focusRing, inputCls, Loading, Money, Notice, PageHeader, Panel, Segmented,
  Status, Table, td, th,
} from "../components/ui";
import {
  ASSET_CLASSES, change, date, isInflow, monthLabel, monthName, pct, shortDate, todayISO, toNum,
} from "../format";
import { useSettle } from "../hooks";
import type { Transaction } from "../types";

type Dash = {
  period: { start: string; end: string };
  previous: { start: string; end: string; income: string; expense: string; result: string } | null;
  kpis: Record<string, string | number | null>;
  warnings: string[];
  monthly: { month: string; income: string; expense: string; result: string }[];
  expenses_by_category: { category_id: number | null; category: string; amount: string }[];
  allocation: { asset_class: string; value: string }[];
  net_worth_history: { date: string; net: string; gross: string; investments: string; invested_cost: string;
    estimate: boolean }[];
  investment_flows: { month: string; contributions: string; withdrawals: string; income: string }[];
  upcoming: Transaction[];
  recent: Transaction[];
};

const PERIODS = [["month", "Mês"], ["3m", "3 meses"], ["6m", "6 meses"], ["year", "Ano"], ["custom", "Escolher"]] as const;
type Period = (typeof PERIODS)[number][0];

// Já com a contração ("acima do mês anterior"), para a frase sair natural.
const PREV_NAME: Record<Period, string> = {
  month: "do mês anterior", "3m": "dos 3 meses anteriores", "6m": "dos 6 meses anteriores", year: "do ano anterior",
  custom: "do período anterior",
};

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [range, setRange] = useState({ start: "", end: "" });
  const ready = period !== "custom" || (range.start && range.end);
  const q = useQuery({
    queryKey: ["dashboard", period, range],
    queryFn: () => api.get<Dash>("/dashboard", { period, ...(period === "custom" ? range : {}) }),
    enabled: !!ready,
  });
  const d = q.data;

  const context = !d ? "Seu dinheiro hoje e no período" : period === "month"
    ? `Fluxo de ${monthName(d.period.start.slice(0, 7))}`
    : `Fluxo de ${date(d.period.start)} a ${date(d.period.end)}`;

  return (
    <div>
      <PageHeader title="Visão geral" context={context} actions={<>
        <Segmented size="sm" label="Período" options={PERIODS} value={period} onChange={setPeriod} />
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input type="date" aria-label="Início" className={cx(inputCls, "min-h-9 w-auto py-1")} value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <span className="text-ink-soft">a</span>
            <input type="date" aria-label="Fim" className={cx(inputCls, "min-h-9 w-auto py-1")} value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </div>
        )}
      </>} />

      <ErrorBox error={q.error} className="mb-4" />
      {period === "custom" && !ready && <Notice>Escolha o início e o fim do período.</Notice>}
      {q.isLoading && ready && <Panel><Loading rows={8} /></Panel>}
      {d && (
        <div className="space-y-4">
          {d.warnings.length > 0 && <Notice tone="warn" title="Avaliação incompleta.">{d.warnings.join(" ")}</Notice>}
          <WorthHero d={d} />
          {/* Duas colunas que crescem independentes: o período à esquerda, o dia a dia à direita. */}
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-3">
              <Flow d={d} prevName={PREV_NAME[period]} />
              <WhereItWent d={d} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <Upcoming items={d.upcoming} />
              <Recent items={d.recent} />
            </div>
          </div>
          <InvestmentsBlock d={d} />
        </div>
      )}
    </div>
  );
}

/** O número que responde "quanto eu tenho": patrimônio líquido, do que é feito e como evoluiu. */
function WorthHero({ d }: { d: Dash }) {
  const t = useChartTheme();
  const k = d.kpis;
  const parts = [
    { label: "Disponível em conta", value: toNum(k.cash_available), color: t.series[0] },
    { label: "Parado em contas de investimento", value: toNum(k.cash_investment_accounts), color: t.series[1] },
    { label: "Investido (valor de mercado)", value: toNum(k.portfolio_value), color: t.series[2] },
  ];
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((s, p) => s + p.value, 0);
  const history = d.net_worth_history.map((p) => ({ name: date(p.date) + (p.estimate ? " (estimado)" : ""),
    short: monthLabel(p.date.slice(0, 7)), "Patrimônio líquido": toNum(p.net) }));
  const first = history[0]?.["Patrimônio líquido"];
  const delta = history.length > 1 ? change(k.net_worth as string, first) : null;

  return (
    <Panel bodyClass="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
      <div className="min-w-0">
        <div className="text-sm text-ink-soft">Patrimônio líquido</div>
        <div className="mt-2"><Money value={k.net_worth} size="hero" /></div>
        <p className="mt-2 text-sm text-ink-soft">
          {delta !== null && <span className={cx("mr-2 font-medium", delta >= 0 ? "text-pos" : "text-neg")}>
            {delta >= 0 ? "+" : "−"}{pct(Math.abs(delta))} em 12 meses</span>}
          Bens <Money value={k.gross_worth} size="sm" tone="muted" /> menos dívidas <Money value={k.liabilities} size="sm" tone="muted" />
        </p>
        {total > 0 && (
          <div className="mt-6">
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
              {positive.map((p) => <div key={p.label} style={{ flexGrow: p.value, background: p.color }} />)}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: p.color }} />
                  <span className="flex-1 text-ink-soft">{p.label}</span>
                  <Money value={p.value} size="sm" />
                  <span className="num w-12 text-right text-xs text-ink-soft">{total ? pct(p.value / total).replace(",00", "") : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium">Últimos 12 meses</h2>
          <Link to="/patrimonio" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Detalhar patrimônio</Link>
        </div>
        <ChartBox empty={!history.some((h) => h["Patrimônio líquido"])} height={200}
          label="Área com a evolução do patrimônio líquido nos últimos 12 meses"
          emptyText="O gráfico aparece quando houver saldos ou investimentos registrados.">
          <AreaChart data={history} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="worth" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.brand} stopOpacity={0.22} />
                <stop offset="100%" stopColor={t.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...t.grid} />
            <XAxis dataKey="short" tick={t.axis} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={t.axis} tickFormatter={brlShort} width={56} tickLine={false} axisLine={false} />
            <Tooltip formatter={moneyFormatter} labelFormatter={(_, p) => p?.[0]?.payload?.name ?? ""} {...t.tooltip} />
            <Area dataKey="Patrimônio líquido" stroke={t.brand} strokeWidth={2} fill="url(#worth)" activeDot={{ r: 4, strokeWidth: 2, stroke: t.sheet }} />
          </AreaChart>
        </ChartBox>
        <p className="mt-1 text-xs text-ink-soft">Meses sem snapshot são estimados com os lançamentos e cotações conhecidos na data.</p>
      </div>
    </Panel>
  );
}

function Delta({ current, previous, goodWhenUp, prevName }: { current: unknown; previous: unknown; goodWhenUp: boolean; prevName: string }) {
  const c = change(current as string, previous as string);
  if (c === null) return <span>Sem base de comparação</span>;
  if (Math.abs(c) < 0.0005) return <span>Igual ao valor {prevName}</span>;
  const up = c > 0;
  const good = c === 0 || up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cx("inline-flex items-center font-medium", good ? "text-pos" : "text-neg")}>
        <Icon aria-hidden="true" className="size-3.5" />{pct(Math.abs(c))}</span>
      <span>{up ? "acima" : "abaixo"} {prevName}</span>
    </span>
  );
}

function Flow({ d, prevName, className }: { d: Dash; prevName: string; className?: string }) {
  const t = useChartTheme();
  const k = d.kpis;
  const monthly = d.monthly.map((m) => ({ name: monthLabel(m.month), Receitas: toNum(m.income), Despesas: toNum(m.expense) }));
  const rate = k.savings_rate === null ? null : toNum(k.savings_rate);
  return (
    <Panel title="Entradas e saídas" className={className}
      aside={<Link to={`/lancamentos?start=${d.period.start}&end=${d.period.end}`}
        className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Ver lançamentos</Link>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Figure label="Recebido" note={d.previous && <Delta current={k.income} previous={d.previous.income} goodWhenUp prevName={prevName} />}>
          <Money value={k.income} size="lg" flow="in" />
        </Figure>
        <Figure label="Gasto" note={d.previous && <Delta current={k.expense} previous={d.previous.expense} goodWhenUp={false} prevName={prevName} />}>
          <Money value={k.expense} size="lg" flow="out" />
        </Figure>
        <Figure label="Sobrou" className="col-span-2 sm:col-span-1"
          note={rate === null ? "Sem receitas no período" : `${pct(rate)} do que entrou`}>
          <Money value={k.result} size="lg" tone="signed" />
        </Figure>
      </div>
      {toNum(k.planned_expenses) > 0 && (
        <p className="mt-4 text-sm text-ink-soft">
          Ainda há <Money value={k.planned_expenses} size="sm" className="text-ink" /> em despesas não pagas com data neste período.
        </p>
      )}
      {monthly.length > 1 && (
        <div className="mt-5 border-t border-rule pt-4">
          <div className="mb-2"><Legend items={[{ label: "Receitas", color: t.income }, { label: "Despesas", color: t.expense }]} /></div>
          <ChartBox empty={!monthly.some((m) => m.Receitas || m.Despesas)} height={190}
            label="Barras de receitas e despesas por mês"
            table={<MonthlyTable rows={d.monthly} />}>
            <BarChart data={monthly} barGap={2} barCategoryGap="28%" margin={{ left: 0, right: 0, top: 4 }}>
              <CartesianGrid {...t.grid} />
              <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={{ stroke: t.rule }} />
              <YAxis tick={t.axis} tickFormatter={brlShort} width={56} tickLine={false} axisLine={false} />
              <Tooltip formatter={moneyFormatter} {...t.tooltip} />
              <Bar dataKey="Receitas" fill={t.income} radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Despesas" fill={t.expense} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ChartBox>
        </div>
      )}
    </Panel>
  );
}

function MonthlyTable({ rows }: { rows: Dash["monthly"] }) {
  return (
    <Table minWidth="min-w-0">
      <thead><tr><th className={th}>Mês</th><th className={cx(th, "text-right")}>Receitas</th>
        <th className={cx(th, "text-right")}>Despesas</th><th className={cx(th, "text-right")}>Resultado</th></tr></thead>
      <tbody>{rows.map((m) => (
        <tr key={m.month}><td className={td}>{monthName(m.month)}</td>
          <td className={cx(td, "text-right")}><Money value={m.income} size="sm" /></td>
          <td className={cx(td, "text-right")}><Money value={m.expense} size="sm" /></td>
          <td className={cx(td, "text-right")}><Money value={m.result} size="sm" tone="signed" /></td></tr>))}
      </tbody>
    </Table>
  );
}

/** Contas vencendo em 7 dias ou atrasadas, com o "Pagar" ali mesmo. */
function Upcoming({ items, className }: { items: Transaction[]; className?: string }) {
  const settle = useSettle();
  const overdue = items.filter((t) => t.overdue).length;
  const today = todayISO();
  return (
    <Panel title="A pagar" className={className} bodyClass="px-0 py-1"
      aside={overdue > 0 && <Status tone="neg">{overdue} {overdue === 1 ? "atrasada" : "atrasadas"}</Status>}>
      {items.length === 0 ? <div className="px-5"><Empty compact>Nada vencendo nos próximos 7 dias.</Empty></div> : (
        <ul className="divide-y divide-rule/70">
          {items.map((t) => {
            const due = t.due_date ?? t.date;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className={cx("w-14 shrink-0 text-[13px] leading-tight", t.overdue ? "font-semibold text-neg" : "text-ink-soft")}>
                  {due === today ? "Hoje" : shortDate(due)}{t.overdue && <span className="block text-[11px] font-medium">atrasada</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.description}</div>
                  <div className="truncate text-xs text-ink-soft">{t.account_name}</div>
                </div>
                <Money value={t.amount} size="sm" />
                <Button size="sm" variant="secondary" icon={Check} disabled={settle.isPending}
                  aria-label={`Marcar ${t.description} como paga`} onClick={() => settle.mutate([t.id])}>Pagar</Button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-rule px-4 py-2.5 sm:px-5">
        <Link to="/lancamentos?overdue=1" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>
          Todas as contas atrasadas</Link>
      </div>
    </Panel>
  );
}

/** Despesas por categoria como lista ordenada: o nome e o valor ficam legíveis, a barra só dá a proporção. */
function WhereItWent({ d }: { d: Dash }) {
  const rows = d.expenses_by_category;
  const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
  const top = rows.slice(0, 8);
  const rest = rows.slice(8).reduce((s, r) => s + toNum(r.amount), 0);
  const link = (id: number | null) => `/lancamentos?kind=expense&start=${d.period.start}&end=${d.period.end}${id ? `&category_id=${id}` : ""}`;
  return (
    <Panel title="Para onde foi o dinheiro" bodyClass="px-0 py-1">
      {rows.length === 0 ? <div className="px-5"><Empty compact>Nenhuma despesa paga no período.</Empty></div> : (
        <ol>
          {top.map((r) => {
            const share = total ? toNum(r.amount) / total : 0;
            return (
              <li key={r.category}>
                <Link to={link(r.category_id)} className={cx("block px-4 py-2.5 hover:bg-ink/[0.03] sm:px-5", focusRing)}>
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate">{r.category}</span>
                    <span className="num text-xs text-ink-soft">{pct(share).replace(",00", "")}</span>
                    <Money value={r.amount} size="sm" className="w-28 text-right" />
                  </div>
                  <div className="mt-1.5 h-1 rounded-full bg-ink/[0.06]">
                    <div className="h-full rounded-full bg-anil" style={{ width: `${Math.max(share * 100, 1)}%` }} />
                  </div>
                </Link>
              </li>
            );
          })}
          {rest > 0 && (
            <li className="flex items-baseline gap-3 px-4 py-2.5 text-ink-soft sm:px-5">
              <span className="flex-1">Outras {rows.length - 8} categorias</span><Money value={rest} size="sm" tone="muted" />
            </li>
          )}
        </ol>
      )}
    </Panel>
  );
}

function Recent({ items }: { items: Transaction[] }) {
  return (
    <Panel title="Últimos lançamentos" bodyClass="px-0 py-1"
      aside={<Link to="/lancamentos" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Abrir extrato</Link>}>
      {items.length === 0 ? <div className="px-5"><Empty compact>Nenhum lançamento ainda.</Empty></div> : (
        <ul className="divide-y divide-rule/70">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="num w-12 shrink-0 text-[13px] text-ink-soft">{shortDate(t.date)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.description}</div>
                <div className="truncate text-xs text-ink-soft">{[t.category_name, t.account_name].filter(Boolean).join(", ")}</div>
              </div>
              {t.status !== "settled" && <Status tone="warn">{t.status === "planned" ? "Prevista" : "Pendente"}</Status>}
              <Money value={t.amount} size="sm" flow={isInflow(t.kind) ? "in" : "out"} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function InvestmentsBlock({ d }: { d: Dash }) {
  const t = useChartTheme();
  const k = d.kpis;
  const alloc = foldOthers(d.allocation.map((a) => ({ name: ASSET_CLASSES[a.asset_class] ?? a.asset_class, value: toNum(a.value) })));
  const allocTotal = alloc.reduce((s, a) => s + a.value, 0);
  const history = d.net_worth_history.map((p) => ({ name: monthLabel(p.date.slice(0, 7)),
    "Valor da carteira": toNum(p.investments), "Custo investido": toNum(p.invested_cost) }));
  const flows = d.investment_flows.map((m) => ({ name: monthLabel(m.month), Aportes: toNum(m.contributions),
    Resgates: toNum(m.withdrawals), Proventos: toNum(m.income) }));
  const hasFlows = flows.some((f) => f.Aportes || f.Resgates || f.Proventos);

  if (!allocTotal && !toNum(k.invested_cost)) {
    return (
      <Panel title="Investimentos">
        <Empty compact title="Nenhum investimento registrado"
          action={<Link to="/investimentos" className={cx("rounded text-sm font-medium text-anil hover:underline", focusRing)}>Cadastrar um ativo</Link>}>
          Cadastre ações, fundos, Tesouro ou CDBs para acompanhar valor de mercado, rendimento e proventos aqui.
        </Empty>
      </Panel>
    );
  }

  return (
    <Panel title="Investimentos"
      aside={<Link to="/investimentos" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Abrir carteira</Link>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        <Figure label="Valor atual"><Money value={k.portfolio_value} size="lg" /></Figure>
        <Figure label="Custo investido"><Money value={k.invested_cost} size="lg" tone="muted" /></Figure>
        <Figure label="Ganho não realizado"><Money value={k.portfolio_unrealized} size="lg" tone="signed" /></Figure>
        <Figure label="Rentabilidade anual (TIR)" note={k.portfolio_xirr ? undefined : "Aparece após 30 dias de histórico"}>
          <span className="num font-figure text-2xl font-semibold leading-none">{k.portfolio_xirr ? pct(k.portfolio_xirr) : "—"}</span>
        </Figure>
      </div>
      <div className="mt-6 grid gap-6 border-t border-rule pt-5 lg:grid-cols-3">
        <ChartSection title="Por classe de ativo">
          {allocTotal > 0 ? (
            <>
              <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
                {alloc.map((a, i) => <div key={a.name} style={{ flexGrow: a.value, background: t.series[i] }} />)}
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {alloc.map((a, i) => (
                  <li key={a.name} className="flex items-center gap-2">
                    <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: t.series[i] }} />
                    <span className="min-w-0 flex-1 truncate text-ink-soft">{a.name}</span>
                    <span className="num text-[13px]">{pct(a.value / allocTotal).replace(",00", "")}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty compact>Sem posições abertas.</Empty>}
        </ChartSection>
        <ChartSection title="Valor × custo">
          <div className="mb-2"><Legend items={[{ label: "Valor", color: t.brand }, { label: "Custo", color: t.soft, dashed: true }]} /></div>
          <ChartBox empty={!history.some((h) => h["Valor da carteira"] || h["Custo investido"])} height={160}
            label="Linhas do valor da carteira e do custo investido por mês">
            <LineChart data={history} margin={{ left: 0, right: 4, top: 4 }}>
              <CartesianGrid {...t.grid} />
              <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis tick={t.axis} tickFormatter={brlShort} width={52} tickLine={false} axisLine={false} />
              <Tooltip formatter={moneyFormatter} {...t.tooltip} />
              <Line dataKey="Valor da carteira" stroke={t.brand} strokeWidth={2} dot={false} />
              <Line dataKey="Custo investido" stroke={t.soft} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </LineChart>
          </ChartBox>
        </ChartSection>
        <ChartSection title="Aportes, resgates e proventos">
          {hasFlows ? (
            <>
              <div className="mb-2"><Legend items={[{ label: "Aportes", color: t.series[0] },
                { label: "Resgates", color: t.series[2] }, { label: "Proventos", color: t.series[1] }]} /></div>
              <ChartBox empty={false} height={160} label="Barras de aportes, resgates e proventos por mês">
                <BarChart data={flows} barGap={2} margin={{ left: 0, right: 0, top: 4 }}>
                  <CartesianGrid {...t.grid} />
                  <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={{ stroke: t.rule }} />
                  <YAxis tick={t.axis} tickFormatter={brlShort} width={52} tickLine={false} axisLine={false} />
                  <Tooltip formatter={moneyFormatter} {...t.tooltip} />
                  <Bar dataKey="Aportes" fill={t.series[0]} radius={[2, 2, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="Resgates" fill={t.series[2]} radius={[2, 2, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="Proventos" fill={t.series[1]} radius={[2, 2, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ChartBox>
            </>
          ) : <Empty compact>Nenhuma movimentação de investimento no período.</Empty>}
        </ChartSection>
      </div>
    </Panel>
  );
}

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0"><h3 className="mb-3 text-sm font-medium">{title}</h3>{children}</section>;
}
