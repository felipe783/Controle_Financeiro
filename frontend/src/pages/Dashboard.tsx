import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { brlShort, ChartBox, foldOthers, Legend, moneyFormatter, useChartTheme, WorthCurve } from "../components/charts";
import { TileModule } from "../components/tiles";
import {
  Button, cx, Empty, ErrorBox, Figure, focusRing, inputCls, Loading, Money, Notice, PageHeader, Panel, Segmented,
  Status, Table, td, th,
} from "../components/ui";
import {
  ASSET_CLASSES, brl, change, date, isInflow, monthLabel, monthName, pct, shortDate, todayISO, toNum,
} from "../format";
import { useSettle } from "../hooks";
import { dur, ease, spring } from "../motion";
import type { Transaction } from "../types";

type Day = { date: string; income: string; expense: string; result: string };
type Dash = {
  period: { start: string; end: string };
  previous: { start: string; end: string; income: string; expense: string; result: string } | null;
  kpis: Record<string, string | number | null>;
  warnings: string[];
  monthly: { month: string; income: string; expense: string; result: string }[];
  daily: Day[];
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

const SECTIONS = [["patrimonio", "Patrimônio"], ["periodo", "Período"], ["a-pagar", "A pagar"],
  ["categorias", "Categorias"], ["investimentos", "Investimentos"]] as const;

/** Índice das seções do painel: acompanha a rolagem e leva a cada bloco. */
function SectionIndex() {
  const [active, setActive] = useState<string>(SECTIONS[0][0]);
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-30% 0px -60% 0px" });
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, []);
  return (
    <nav aria-label="Seções do painel" className="-mx-1 flex gap-1 overflow-x-auto">
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} aria-current={active === id ? "true" : undefined}
          onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}
          className={cx("relative whitespace-nowrap rounded px-2.5 py-1 text-[13px] font-medium transition-colors", focusRing,
            active === id ? "text-ink" : "text-ink-soft hover:text-ink")}>
          {label}
          {active === id && <motion.span layoutId="section-ind" transition={spring.snappy} className="absolute inset-x-2 -bottom-0.5 h-[2px] rounded-full bg-anil" />}
        </a>
      ))}
    </nav>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [range, setRange] = useState({ start: "", end: "" });
  const ready = period !== "custom" || (range.start && range.end);
  const q = useQuery({
    queryKey: ["dashboard", period, range],
    queryFn: () => api.get<Dash>("/dashboard", { period, ...(period === "custom" ? range : {}) }),
    enabled: !!ready,
    placeholderData: (prev) => prev, // troca de período sem piscar: os números animam do valor anterior
  });
  const d = q.data;

  const context = !d ? "Seu dinheiro hoje e no período" : period === "month"
    ? `Fluxo de ${monthName(d.period.start.slice(0, 7))}`
    : `Fluxo de ${date(d.period.start)} a ${date(d.period.end)}`;

  return (
    <div>
      <PageHeader title="Visão geral" context={context}
        aside={d && <span className="flex items-baseline gap-2 text-sm text-ink-soft">Patrimônio <Money value={d.kpis.net_worth} size="fig" /></span>}
        nav={d && <SectionIndex />}
        actions={<>
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
      {q.isLoading && ready && <DashSkeleton />}
      {d && (
        <div className={cx("space-y-5 transition-opacity duration-200", q.isPlaceholderData && "opacity-60")}>
          {d.warnings.length > 0 && <Notice tone="warn" title="Avaliação incompleta.">{d.warnings.join(" ")}</Notice>}
          <WorthBand d={d} />
          <PeriodBlock d={d} prevName={PREV_NAME[period]} period={period} />
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-3">
              <WhereItWent d={d} />
              <Recent items={d.recent} />
            </div>
            <div className="lg:col-span-2"><Upcoming items={d.upcoming} /></div>
          </div>
          <InvestmentsBlock d={d} />
        </div>
      )}
    </div>
  );
}

function DashSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="h-[22rem] overflow-hidden rounded-xl bg-rail p-6">
        <div className="h-3 w-32 rounded bg-rail-ink/15" />
        <div className="mt-4 h-14 w-72 rounded bg-rail-ink/15" />
      </div>
      <div className="rounded-lg border border-rule bg-sheet p-5"><Loading rows={5} /></div>
    </div>
  );
}

/**
 * Faixa do patrimônio: o número que responde "quanto eu tenho", sobre o cobalto do azulejo.
 * Passar o cursor (ou o dedo) pela curva faz o número mostrar o mês apontado.
 */
function WorthBand({ d }: { d: Dash }) {
  const k = d.kpis;
  const [scrub, setScrub] = useState<number | null>(null);
  const history = d.net_worth_history.map((p) => ({ label: monthLabel(p.date.slice(0, 7)), value: toNum(p.net), estimate: p.estimate,
    when: p.estimate ? `${monthName(p.date.slice(0, 7))} (estimado)` : `em ${date(p.date)}` }));
  const first = history.find((h) => h.value !== 0)?.value ?? history[0]?.value;
  const delta = history.length > 1 ? change(k.net_worth as string, first) : null;
  const shown = scrub !== null ? history[scrub] : null;
  const parts = [
    { label: "Disponível em conta", value: toNum(k.cash_available), cls: "bg-rail-ink" },
    { label: "Em contas de investimento", value: toNum(k.cash_investment_accounts), cls: "bg-rail-soft" },
    { label: "Investido (mercado)", value: toNum(k.portfolio_value), cls: "bg-ocre" },
  ];
  // A barra só compõe o que soma; saldo negativo (conta a descoberto) aparece na lista, com sinal, fora da barra.
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((s, p) => s + p.value, 0);

  return (
    <section id="patrimonio" className="scroll-mt-40 relative overflow-hidden rounded-xl bg-rail text-rail-ink shadow-float">
      <div className="relative grid grid-cols-1 gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 text-sm text-rail-soft">
            <span>Patrimônio líquido</span>
            <AnimatePresence mode="wait">
              <motion.span key={shown?.when ?? "hoje"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: dur.fast }} className="text-xs">{shown ? shown.when : "hoje"}</motion.span>
            </AnimatePresence>
          </div>
          <div className="mt-3"><Money value={shown ? shown.value : k.net_worth} size="hero" animate /></div>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-rail-soft">
            {delta !== null && (
              <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold",
                delta >= 0 ? "bg-pos/20 text-[rgb(140_235_185)]" : "bg-neg/25 text-[rgb(255_180_170)]")}>
                {delta >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden="true" /> : <ArrowDownRight className="size-3.5" aria-hidden="true" />}
                {pct(Math.abs(delta))} em 12 meses</span>
            )}
            <span>Bens <Money value={k.gross_worth} size="sm" className="text-rail-ink" /> − dívidas <Money value={k.liabilities} size="sm" className="text-rail-ink" /></span>
          </p>
          {total > 0 && (
            <div className="mt-7">
              <div className="flex h-3 gap-[3px]" aria-hidden="true">
                {positive.map((p, i) => (
                  <motion.div key={p.label} className={cx("h-full origin-left rounded-[3px]", p.cls)} style={{ flexGrow: p.value }}
                    initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.25 + i * 0.12, duration: dur.focal, ease: ease.out }} />
                ))}
              </div>
              <ul className="mt-4 space-y-2 text-sm">
                {parts.map((p) => (
                  <li key={p.label} className="flex items-center gap-2.5">
                    <span aria-hidden="true" className={cx("size-2.5 rounded-[2px]", p.value > 0 ? p.cls : "border border-rail-soft")} />
                    <span className="flex-1 text-rail-soft">{p.label}</span>
                    <Money value={p.value} size="sm" className={p.value < 0 ? "text-[rgb(255_180_170)]" : "text-rail-ink"} />
                    <span className="num w-12 text-right text-xs text-rail-soft">{p.value > 0 && total ? pct(p.value / total).replace(",00", "") : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="display font-figure text-[15px] font-[620]">Últimos 12 meses</h2>
            <Link to="/patrimonio" className="rounded text-[13px] font-medium text-ocre hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre">
              Detalhar patrimônio</Link>
          </div>
          {history.some((h) => h.value) ? (
            <WorthCurve points={history} height={230} onScrub={setScrub} onRail
              label={`Curva do patrimônio líquido nos últimos 12 meses, de ${brl(history[0]?.value)} a ${brl(history[history.length - 1]?.value)}`} />
          ) : <p className="py-16 text-sm text-rail-soft">A curva aparece quando houver saldos ou investimentos registrados.</p>}
          <p className="mt-2 text-xs text-rail-soft">Passe o cursor pela curva para ver cada mês. Meses sem snapshot são estimados.</p>
        </div>
      </div>
    </section>
  );
}

function Delta({ current, previous, goodWhenUp, prevName }: { current: unknown; previous: unknown; goodWhenUp: boolean; prevName: string }) {
  const c = change(current as string, previous as string);
  if (c === null) return <span>Sem base de comparação</span>;
  if (Math.abs(c) < 0.0005) return <span>Igual ao valor {prevName}</span>;
  const up = c > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className={cx("inline-flex items-center font-medium", good ? "text-pos" : "text-neg")}>
        <Icon aria-hidden="true" className="size-3.5" />{pct(Math.abs(c))}</span>
      <span>{up ? "acima" : "abaixo"} {prevName}</span>
    </span>
  );
}

/** O período: entrou, saiu, sobrou — e o mural de azulejos, um por dia, que mostra quando. */
function PeriodBlock({ d, prevName, period }: { d: Dash; prevName: string; period: Period }) {
  const t = useChartTheme();
  const k = d.kpis;
  const monthly = d.monthly.map((m) => ({ name: monthLabel(m.month), Receitas: toNum(m.income), Despesas: toNum(m.expense) }));
  const rate = k.savings_rate === null ? null : toNum(k.savings_rate);
  return (
    <Panel id="periodo" reveal title={period === "month" ? capitalizeMonth(d.period.start) : "Entradas e saídas"}
      aside={<Link to={`/lancamentos?start=${d.period.start}&end=${d.period.end}`}
        className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Ver lançamentos</Link>}
      bodyClass="grid grid-cols-1 gap-8 p-4 sm:p-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
      <div className="min-w-0">
        <div className="grid grid-cols-2 gap-x-6 gap-y-6">
          <Figure label="Recebido" note={d.previous && <Delta current={k.income} previous={d.previous.income} goodWhenUp prevName={prevName} />}>
            <Money value={k.income} size="lg" flow="in" animate />
          </Figure>
          <Figure label="Gasto" note={d.previous && <Delta current={k.expense} previous={d.previous.expense} goodWhenUp={false} prevName={prevName} />}>
            <Money value={k.expense} size="lg" flow="out" animate />
          </Figure>
          <Figure label="Sobrou" className="col-span-2"
            note={rate === null ? "Sem receitas no período" : `${pct(rate)} do que entrou ficou com você`}>
            <div className="flex items-center gap-4">
              <Money value={k.result} size="xl" tone="signed" animate />
              {rate !== null && <SavingsGauge rate={rate} />}
            </div>
          </Figure>
        </div>
        {toNum(k.planned_expenses) > 0 && (
          <p className="mt-6 rounded-md bg-warn-wash px-3 py-2 text-sm text-ink">
            Ainda há <Money value={k.planned_expenses} size="sm" /> em despesas não pagas com data neste período.
          </p>
        )}
      </div>
      <div className="min-w-0">
        <Mural days={d.daily} />
      </div>
      {monthly.length > 1 && (
        <div className="border-t border-rule pt-5 lg:col-span-2">
          <div className="mb-2"><Legend items={[{ label: "Receitas", color: t.income }, { label: "Despesas", color: t.expense }]} /></div>
          <ChartBox empty={!monthly.some((m) => m.Receitas || m.Despesas)} height={200}
            label="Barras de receitas e despesas por mês" table={<MonthlyTable rows={d.monthly} />}>
            <BarChart data={monthly} barGap={2} barCategoryGap="28%" margin={{ left: 0, right: 0, top: 4 }}>
              <CartesianGrid {...t.grid} />
              <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={{ stroke: t.rule }} />
              <YAxis tick={t.axis} tickFormatter={brlShort} width={56} tickLine={false} axisLine={false} />
              <Tooltip formatter={moneyFormatter} {...t.tooltip} />
              <Bar dataKey="Receitas" fill={t.income} radius={[4, 4, 0, 0]} maxBarSize={22} {...t.anim} />
              <Bar dataKey="Despesas" fill={t.expense} radius={[4, 4, 0, 0]} maxBarSize={22} {...t.anim} />
            </BarChart>
          </ChartBox>
        </div>
      )}
    </Panel>
  );
}

const capitalizeMonth = (iso: string) => { const m = monthName(iso.slice(0, 7)); return m.charAt(0).toUpperCase() + m.slice(1); };

/** Quanto do que entrou sobrou: um arco que se fecha até a taxa de poupança. */
function SavingsGauge({ rate }: { rate: number }) {
  const r = 18, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, rate));
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" className="stroke-ink/10" strokeWidth="5" />
      <motion.circle cx="22" cy="22" r={r} fill="none" className={rate >= 0 ? "stroke-pos" : "stroke-neg"} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v) }}
        transition={{ delay: 0.3, duration: 1, ease: ease.out }} />
    </svg>
  );
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * O mural: cada azulejo é um dia (ou uma semana, em períodos longos). O quarto de disco azul cresce com o que
 * saiu; o disco verde no canto oposto, com o que entrou. A rotação alterna como nos painéis de Athos Bulcão.
 * Clicar abre o extrato daquele dia.
 */
function Mural({ days }: { days: Day[] }) {
  const navigate = useNavigate();
  const [hover, setHover] = useState<number | null>(null);
  const today = todayISO();
  // Até ~2 meses, um azulejo por dia; até ~120 semanas, por semana; acima disso, por mês (mural legível e leve).
  const unit: "day" | "week" | "month" = days.length <= 62 ? "day" : days.length <= 840 ? "week" : "month";
  const weekly = unit !== "day";
  const cells = useMemo(() => {
    if (unit === "day") return days.map((x) => ({ start: x.date, end: x.date, income: toNum(x.income), expense: toNum(x.expense) }));
    const out: { start: string; end: string; income: number; expense: number }[] = [];
    days.forEach((x, i) => {
      const fresh = unit === "week" ? i % 7 === 0 : i === 0 || x.date.slice(0, 7) !== days[i - 1].date.slice(0, 7);
      if (fresh) out.push({ start: x.date, end: x.date, income: 0, expense: 0 });
      const w = out[out.length - 1];
      w.end = x.date; w.income += toNum(x.income); w.expense += toNum(x.expense);
    });
    return out;
  }, [days, unit]);
  if (!cells.length) return null;
  const maxE = Math.max(...cells.map((c) => c.expense), 1), maxI = Math.max(...cells.map((c) => c.income), 1);
  const lead = weekly ? 0 : new Date(`${cells[0].start}T12:00:00`).getDay();
  const cols = unit === "day" ? 7 : Math.min(unit === "week" ? 13 : 12, cells.length);
  const h = hover !== null ? cells[hover] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{{ day: "Dia a dia", week: "Semana a semana", month: "Mês a mês" }[unit]}</h3>
        <ul className="flex gap-3 text-xs text-ink-soft" aria-label="Legenda do mural">
          <li className="flex items-center gap-1.5"><TileModule a={1} className="size-3.5 rounded-[2px] bg-sheet ring-1 ring-rule" />saiu</li>
          <li className="flex items-center gap-1.5"><TileModule a={0} b={1} bClass="fill-pos" className="size-3.5 rounded-[2px] bg-sheet ring-1 ring-rule" />entrou</li>
        </ul>
      </div>
      <div className="relative">
        <div className="grid gap-[3px] rounded-md bg-rule p-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {!weekly && WEEKDAYS.map((w, i) => <div key={i} aria-hidden="true" className="bg-sunk py-1 text-center text-[11px] font-medium text-ink-faint">{w}</div>)}
          {Array.from({ length: lead }, (_, i) => <div key={`l${i}`} aria-hidden="true" className="bg-sunk" />)}
          {cells.map((c, i) => {
            const pos = i + lead, row = Math.floor(pos / cols), col = pos % cols;
            const future = c.start > today;
            const isToday = c.start <= today && today <= c.end;
            const a = c.expense ? Math.sqrt(c.expense / maxE) : 0, b = c.income ? Math.sqrt(c.income / maxI) : 0;
            const label = `${unit === "day" ? date(c.start) : unit === "week" ? `Semana de ${date(c.start)}` : capitalizeMonth(c.start)}: entrou ${brl(c.income)}, saiu ${brl(c.expense)}`;
            return (
              <motion.button key={c.start} type="button" aria-label={label}
                onClick={() => navigate(`/lancamentos?start=${c.start}&end=${c.end}`)}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                initial={{ opacity: 0, rotate: -90, scale: 0.6 }} animate={{ opacity: future ? 0.4 : 1, rotate: 0, scale: 1 }}
                whileHover={{ scale: 1.08, zIndex: 2 }} whileTap={{ scale: 0.94 }}
                transition={{ delay: (row + col) * 0.03, duration: 0.55, ease: ease.out }}
                className={cx("relative aspect-square overflow-hidden bg-sheet outline-none focus-visible:ring-2 focus-visible:ring-anil focus-visible:ring-offset-1",
                  isToday && "ring-2 ring-inset ring-ocre")}>
                <TileModule a={a} b={b} rotate={((row + col) % 4) * 90} bClass="fill-pos" className="block size-full" />
                {!weekly && <span aria-hidden="true" className="absolute left-1 top-0.5 text-[10px] font-semibold text-white mix-blend-difference">{Number(c.start.slice(8))}</span>}
              </motion.button>
            );
          })}
        </div>
        <AnimatePresence>
          {h && (
            <motion.div key="tip" role="status" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: dur.fast }}
              className="pointer-events-none absolute inset-x-0 top-full z-10 mx-auto mt-2 w-max rounded-lg bg-ink px-3 py-2 text-xs text-paper shadow-float">
              <div className="mb-0.5 opacity-70">{unit === "day" ? date(h.start) : unit === "week" ? `Semana de ${date(h.start)} a ${date(h.end)}` : capitalizeMonth(h.start)}</div>
              <span className="mr-3">Entrou <strong className="num">{brl(h.income)}</strong></span>
              <span>Saiu <strong className="num">{brl(h.expense)}</strong></span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-3 text-xs text-ink-soft">Área proporcional ao maior gasto e à maior entrada do período. Clique num {{ day: "dia para ver o extrato", week: "azulejo para ver a semana", month: "azulejo para ver o mês" }[unit]}.</p>
    </div>
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

/** Contas vencendo em 7 dias ou atrasadas, com o "Pagar" ali mesmo; a linha paga sai deslizando. */
function Upcoming({ items }: { items: Transaction[] }) {
  const settle = useSettle();
  const [paying, setPaying] = useState<number | null>(null);
  const overdue = items.filter((t) => t.overdue).length;
  const today = todayISO();
  const total = items.reduce((s, t) => s + toNum(t.amount), 0);
  return (
    <Panel id="a-pagar" reveal title="A pagar" bodyClass="px-0 pb-1"
      aside={overdue > 0 && <Status tone="neg">{overdue} {overdue === 1 ? "atrasada" : "atrasadas"}</Status>}>
      {items.length > 0 && (
        <div className="flex items-baseline justify-between px-4 pb-3 sm:px-5">
          <span className="text-[13px] text-ink-soft">Próximos 7 dias e atrasadas</span>
          <Money value={total} size="fig" />
        </div>
      )}
      {items.length === 0 ? <div className="px-5"><Empty compact>Nada vencendo nos próximos 7 dias.</Empty></div> : (
        <ul className="border-t border-rule">
          <AnimatePresence initial={false}>
            {items.map((t) => {
              const due = t.due_date ?? t.date;
              const busy = paying === t.id && settle.isPending;
              return (
                <motion.li key={t.id} layout exit={{ opacity: 0, x: 60, transition: { duration: dur.base, ease: ease.exit } }}
                  className="flex items-center gap-3 border-b border-rule/70 px-4 py-3 last:border-b-0 sm:px-5">
                  <div className={cx("flex w-12 shrink-0 flex-col items-center rounded-md py-1 text-center leading-none",
                    t.overdue ? "bg-neg-wash text-neg" : "bg-sunk text-ink-soft")}>
                    <span className="display font-figure text-lg font-[650]">{due === today ? "Hoje" : due.slice(8)}</span>
                    {due !== today && <span className="mt-0.5 text-[10px] uppercase">{shortDate(due).split(" ")[1] ?? ""}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{t.description}</div>
                    <div className="truncate text-xs text-ink-soft">{t.overdue ? "Atrasada · " : ""}{t.account_name}</div>
                  </div>
                  <Money value={t.amount} size="sm" />
                  <Button size="sm" variant="secondary" icon={Check} disabled={settle.isPending}
                    aria-label={`Marcar ${t.description} como paga`}
                    onClick={() => { setPaying(t.id); settle.mutate([t.id]); }}>{busy ? "…" : "Pagar"}</Button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      <div className="border-t border-rule px-4 py-3 sm:px-5">
        <Link to="/lancamentos?overdue=1" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>
          Todas as contas atrasadas</Link>
      </div>
    </Panel>
  );
}

/** Despesas por categoria: as barras crescem em sequência; cada linha abre os lançamentos da categoria. */
function WhereItWent({ d }: { d: Dash }) {
  const rows = d.expenses_by_category;
  const total = rows.reduce((s, r) => s + toNum(r.amount), 0);
  const top = rows.slice(0, 8);
  const max = Math.max(...top.map((r) => toNum(r.amount)), 1);
  const rest = rows.slice(8).reduce((s, r) => s + toNum(r.amount), 0);
  const link = (id: number | null) => `/lancamentos?kind=expense&start=${d.period.start}&end=${d.period.end}${id ? `&category_id=${id}` : ""}`;
  return (
    <Panel id="categorias" reveal title="Para onde foi o dinheiro" bodyClass="px-0 pb-2"
      aside={total > 0 && <Money value={total} size="sm" tone="muted" />}>
      {rows.length === 0 ? <div className="px-5"><Empty compact>Nenhuma despesa paga no período.</Empty></div> : (
        <ol>
          {top.map((r, i) => {
            const share = total ? toNum(r.amount) / total : 0;
            return (
              <li key={r.category}>
                <Link to={link(r.category_id)} className={cx("group block px-4 py-2.5 transition-colors hover:bg-anil-wash/50 sm:px-5", focusRing)}>
                  <div className="flex items-baseline gap-3">
                    <span className="min-w-0 flex-1 truncate">{r.category}</span>
                    <span className="num text-xs text-ink-soft">{pct(share).replace(",00", "")}</span>
                    <Money value={r.amount} size="sm" className="w-28 text-right" />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                    <motion.div className="h-full origin-left rounded-full bg-anil group-hover:bg-anil-strong"
                      style={{ width: `${Math.max((toNum(r.amount) / max) * 100, 1.5)}%` }}
                      initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
                      transition={{ delay: i * 0.05, duration: dur.focal, ease: ease.out }} />
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
    <Panel reveal title="Últimos lançamentos" bodyClass="px-0 pb-1"
      aside={<Link to="/lancamentos" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Abrir extrato</Link>}>
      {items.length === 0 ? <div className="px-5"><Empty compact>Nenhum lançamento ainda.</Empty></div> : (
        <ul className="border-t border-rule">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-b border-rule/70 px-4 py-2.5 last:border-b-0 sm:px-5">
              <span className="num w-12 shrink-0 text-[13px] text-ink-soft">{shortDate(t.date)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{t.description}</div>
                <div className="truncate text-xs text-ink-soft">{[t.category_name, t.account_name].filter(Boolean).join(" · ")}</div>
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

/** Carteira: os números sempre à vista; os gráficos abrem sob demanda (altura animada). */
function InvestmentsBlock({ d }: { d: Dash }) {
  const t = useChartTheme();
  const k = d.kpis;
  const [open, setOpen] = useState(true);
  const alloc = foldOthers(d.allocation.map((a) => ({ name: ASSET_CLASSES[a.asset_class] ?? a.asset_class, value: toNum(a.value) })));
  const allocTotal = alloc.reduce((s, a) => s + a.value, 0);
  const history = d.net_worth_history.map((p) => ({ name: monthLabel(p.date.slice(0, 7)),
    "Valor da carteira": toNum(p.investments), "Custo investido": toNum(p.invested_cost) }));
  const flows = d.investment_flows.map((m) => ({ name: monthLabel(m.month), Aportes: toNum(m.contributions),
    Resgates: toNum(m.withdrawals), Proventos: toNum(m.income) }));
  const hasFlows = flows.some((f) => f.Aportes || f.Resgates || f.Proventos);

  if (!allocTotal && !toNum(k.invested_cost)) {
    return (
      <Panel id="investimentos" reveal title="Investimentos">
        <Empty title="Nenhum investimento registrado"
          action={<Link to="/investimentos" className={cx("rounded text-sm font-medium text-anil hover:underline", focusRing)}>Cadastrar um ativo</Link>}>
          Cadastre ações, fundos, Tesouro ou CDBs para acompanhar valor de mercado, rendimento e proventos aqui.
        </Empty>
      </Panel>
    );
  }

  return (
    <Panel id="investimentos" reveal title="Investimentos"
      aside={<>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="inv-charts"
          className={cx("inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] font-medium text-ink-soft hover:bg-ink/[0.05] hover:text-ink", focusRing)}>
          {open ? "Ocultar gráficos" : "Mostrar gráficos"}
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={spring.snappy}><ChevronDown className="size-4" aria-hidden="true" /></motion.span>
        </button>
        <Link to="/investimentos" className={cx("rounded text-[13px] font-medium text-anil hover:underline", focusRing)}>Abrir carteira</Link>
      </>}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        <Figure label="Valor atual"><Money value={k.portfolio_value} size="lg" animate /></Figure>
        <Figure label="Custo investido"><Money value={k.invested_cost} size="lg" tone="muted" /></Figure>
        <Figure label="Ganho não realizado"><Money value={k.portfolio_unrealized} size="lg" tone="signed" animate /></Figure>
        <Figure label="Rentabilidade anual (TIR)" note={k.portfolio_xirr ? undefined : "Aparece após 30 dias de histórico"}>
          <span className="num font-figure text-[1.75rem] font-semibold leading-none">{k.portfolio_xirr ? pct(k.portfolio_xirr) : "—"}</span>
        </Figure>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id="inv-charts" key="charts" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: dur.slow, ease: ease.out }} className="overflow-hidden">
            <div className="mt-6 grid grid-cols-1 gap-6 border-t border-rule pt-5 lg:grid-cols-3">
              <ChartSection title="Por classe de ativo">
                <div className="flex h-3 gap-[3px]" aria-hidden="true">
                  {alloc.map((a, i) => (
                    <motion.div key={a.name} className="h-full origin-left rounded-[3px]" style={{ flexGrow: a.value, background: t.series[i] }}
                      initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
                      transition={{ delay: i * 0.08, duration: dur.focal, ease: ease.out }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {alloc.map((a, i) => (
                    <li key={a.name} className="flex items-center gap-2">
                      <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: t.series[i] }} />
                      <span className="min-w-0 flex-1 truncate text-ink-soft">{a.name}</span>
                      <span className="num text-[13px]">{pct(a.value / allocTotal).replace(",00", "")}</span>
                    </li>
                  ))}
                </ul>
              </ChartSection>
              <ChartSection title="Valor × custo">
                <div className="mb-2"><Legend items={[{ label: "Valor", color: t.brand }, { label: "Custo", color: t.soft, dashed: true }]} /></div>
                <ChartBox empty={!history.some((h) => h["Valor da carteira"] || h["Custo investido"])} height={170}
                  label="Linhas do valor da carteira e do custo investido por mês">
                  <LineChart data={history} margin={{ left: 0, right: 4, top: 4 }}>
                    <CartesianGrid {...t.grid} />
                    <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={false} minTickGap={20} />
                    <YAxis tick={t.axis} tickFormatter={brlShort} width={52} tickLine={false} axisLine={false} />
                    <Tooltip formatter={moneyFormatter} {...t.tooltip} />
                    <Line dataKey="Valor da carteira" stroke={t.brand} strokeWidth={2} dot={false} {...t.anim} />
                    <Line dataKey="Custo investido" stroke={t.soft} strokeWidth={1.5} strokeDasharray="4 3" dot={false} {...t.anim} />
                  </LineChart>
                </ChartBox>
              </ChartSection>
              <ChartSection title="Aportes, resgates e proventos">
                {hasFlows ? (
                  <>
                    <div className="mb-2"><Legend items={[{ label: "Aportes", color: t.series[0] },
                      { label: "Resgates", color: t.series[2] }, { label: "Proventos", color: t.series[1] }]} /></div>
                    <ChartBox empty={false} height={170} label="Barras de aportes, resgates e proventos por mês">
                      <BarChart data={flows} barGap={2} margin={{ left: 0, right: 0, top: 4 }}>
                        <CartesianGrid {...t.grid} />
                        <XAxis dataKey="name" tick={t.axis} tickLine={false} axisLine={{ stroke: t.rule }} />
                        <YAxis tick={t.axis} tickFormatter={brlShort} width={52} tickLine={false} axisLine={false} />
                        <Tooltip formatter={moneyFormatter} {...t.tooltip} />
                        <Bar dataKey="Aportes" fill={t.series[0]} radius={[3, 3, 0, 0]} maxBarSize={14} {...t.anim} />
                        <Bar dataKey="Resgates" fill={t.series[2]} radius={[3, 3, 0, 0]} maxBarSize={14} {...t.anim} />
                        <Bar dataKey="Proventos" fill={t.series[1]} radius={[3, 3, 0, 0]} maxBarSize={14} {...t.anim} />
                      </BarChart>
                    </ChartBox>
                  </>
                ) : <Empty compact>Nenhuma movimentação de investimento no período.</Empty>}
              </ChartSection>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Panel>
  );
}

function ChartSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0"><h3 className="mb-3 text-sm font-medium">{title}</h3>{children}</section>;
}
