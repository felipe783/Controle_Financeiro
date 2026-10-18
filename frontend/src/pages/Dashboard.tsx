import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { axis, brlShort, ChartBox, COLORS, EXPENSE, INCOME, moneyFormatter, NEUTRAL, tooltipStyle } from "../components/charts";
import { TransactionModal, TransferModal } from "../components/TransactionForms";
import { Badge, Button, Card, Empty, ErrorBox, focusRing, inputCls, Loading, PageHeader, Segmented, Stat, Table, td, th, toneOf } from "../components/ui";
import { ASSET_CLASSES, brl, date, KIND_LABEL, monthLabel, pct, statusLabel, toNum } from "../format";
import type { Transaction } from "../types";

type Dash = {
  kpis: Record<string, string | number | null>;
  warnings: string[];
  monthly: { month: string; income: string; expense: string; result: string }[];
  expenses_by_category: { category: string; amount: string }[];
  allocation: { asset_class: string; value: string }[];
  net_worth_history: { date: string; net: string; gross: string; investments: string; invested_cost: string;
    estimate: boolean }[];
  investment_flows: { month: string; contributions: string; withdrawals: string; income: string }[];
  upcoming: Transaction[];
  recent: Transaction[];
};

const PERIODS = [["month", "Mês atual"], ["3m", "Últimos 3 meses"], ["6m", "Últimos 6 meses"], ["year", "Ano atual"],
  ["custom", "Personalizado"]] as const;

export default function Dashboard() {
  const [period, setPeriod] = useState<string>("month");
  const [range, setRange] = useState({ start: "", end: "" });
  const [modal, setModal] = useState<null | "income" | "expense" | "transfer">(null);
  const ready = period !== "custom" || (range.start && range.end);
  const q = useQuery({
    queryKey: ["dashboard", period, range],
    queryFn: () => api.get<Dash>("/dashboard", { period, ...(period === "custom" ? range : {}) }),
    enabled: !!ready,
  });
  const d = q.data;
  const k = d?.kpis ?? {};

  const monthly = (d?.monthly ?? []).map((m) => ({ name: monthLabel(m.month), Receitas: toNum(m.income),
    Despesas: toNum(m.expense), Resultado: toNum(m.result) }));
  const history = (d?.net_worth_history ?? []).map((p) => ({ name: date(p.date) + (p.estimate ? " (est.)" : ""),
    "Patrimônio líquido": toNum(p.net), "Patrimônio bruto": toNum(p.gross), "Valor da carteira": toNum(p.investments),
    "Custo investido": toNum(p.invested_cost) }));
  const flows = (d?.investment_flows ?? []).map((m) => ({ name: monthLabel(m.month), Aportes: toNum(m.contributions),
    Resgates: toNum(m.withdrawals), Proventos: toNum(m.income) }));
  const cats = (d?.expenses_by_category ?? []).map((c) => ({ name: c.category, value: toNum(c.amount) }));
  const alloc = (d?.allocation ?? []).map((a) => ({ name: ASSET_CLASSES[a.asset_class] ?? a.asset_class,
    value: toNum(a.value) }));
  const hasMonthly = monthly.some((m) => m.Receitas || m.Despesas);

  return (
    <div className="space-y-6">
      <PageHeader title="Painel" actions={<>
        <Button onClick={() => setModal("expense")}>+ Despesa</Button>
        <Button variant="secondary" onClick={() => setModal("income")}>+ Receita</Button>
        <Button variant="secondary" onClick={() => setModal("transfer")}>Transferência</Button>
        <Link to="/investimentos" className={`inline-flex min-h-9 items-center rounded-md px-3 py-2 text-sm font-medium
          text-emerald-800 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950 ${focusRing}`}>Investimento →</Link>
      </>} />

      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Período" options={PERIODS} value={period as (typeof PERIODS)[number][0]} onChange={setPeriod} />
        {period === "custom" && (
          <>
            <input type="date" aria-label="Início" className={`${inputCls} w-auto`} value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })} />
            <input type="date" aria-label="Fim" className={`${inputCls} w-auto`} value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </>
        )}
      </div>

      <ErrorBox error={q.error} />
      {q.isLoading && <Card><Loading rows={6} /></Card>}
      {d && (
        <>
          {d.warnings.length > 0 && (
            <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <strong>Atenção a avaliações:</strong> {d.warnings.join(" · ")}
            </div>
          )}
          {/* Três números respondem "como estou?"; o resto detalha, agrupado pelo assunto. */}
          <section aria-label="Resumo" className="grid gap-px overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800 md:grid-cols-3">
            <div className="bg-white p-5 dark:bg-slate-900">
              <Stat plain size="lg" label="Patrimônio líquido" value={brl(k.net_worth)} tone={toneOf(k.net_worth)}
                hint={`Bruto ${brl(k.gross_worth)} − dívidas ${brl(k.liabilities)}`} />
            </div>
            <div className="bg-white p-5 dark:bg-slate-900">
              <Stat plain size="lg" label="Saldo disponível" value={brl(k.cash_available)}
                hint={`Mais ${brl(k.cash_investment_accounts)} parados em contas de investimento`} />
            </div>
            <div className="bg-white p-5 dark:bg-slate-900">
              <Stat plain size="lg" label="Resultado do período" value={brl(k.result)} tone={toneOf(k.result)}
                hint={k.savings_rate === null ? "Sem receitas no período" : `Taxa de economia de ${pct(k.savings_rate)}`} />
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Período">
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <Stat plain label="Receitas recebidas" value={brl(k.income)} tone="pos" />
                <Stat plain label="Despesas pagas" value={brl(k.expense)} tone="neg" />
                <Stat plain label="Despesas previstas" value={brl(k.planned_expenses)} hint="Ainda não pagas" />
                <Stat plain label="A vencer em 7 dias ou atrasadas" value={k.upcoming_count}
                  tone={toNum(k.upcoming_count) ? "neg" : undefined} />
              </div>
            </Card>
            <Card title="Investimentos" actions={<Link to="/investimentos" className={`rounded text-sm font-medium
              text-emerald-800 hover:underline dark:text-emerald-400 ${focusRing}`}>Ver carteira</Link>}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                <Stat plain label="Valor atual da carteira" value={brl(k.portfolio_value)} />
                <Stat plain label="Total investido (custo)" value={brl(k.invested_cost)} />
                <Stat plain label="Ganho não realizado" value={brl(k.portfolio_unrealized)} tone={toneOf(k.portfolio_unrealized)} />
                <Stat plain label="Rentabilidade (TIR)" value={k.portfolio_xirr ? `${pct(k.portfolio_xirr)} a.a.` : "—"}
                  hint={k.portfolio_xirr ? undefined : "Exige 30 dias de histórico"} />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Receitas × despesas por mês">
              <ChartBox empty={!hasMonthly} label="Gráfico de barras de receitas e despesas por mês">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
                  <Bar dataKey="Receitas" fill={INCOME} /><Bar dataKey="Despesas" fill={EXPENSE} />
                </BarChart>
              </ChartBox>
            </Card>
            <Card title="Evolução do resultado mensal">
              <ChartBox empty={!hasMonthly || monthly.length < 2} label="Linha do resultado mensal"
                emptyText={hasMonthly ? "Escolha um período de 3 meses ou mais para ver a evolução." : undefined}>
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} />
                  <Line dataKey="Resultado" stroke={NEUTRAL} strokeWidth={2} dot />
                </LineChart>
              </ChartBox>
            </Card>
            <Card title="Evolução do patrimônio">
              <ChartBox empty={!history.some((h) => h["Patrimônio bruto"] || h["Patrimônio líquido"])}
                label="Linha da evolução do patrimônio">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
                  <Line dataKey="Patrimônio líquido" stroke={INCOME} strokeWidth={2} />
                  <Line dataKey="Patrimônio bruto" stroke={NEUTRAL} strokeDasharray="4 3" />
                </LineChart>
              </ChartBox>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Pontos “(est.)” são estimativas de fim de mês calculadas com as cotações conhecidas naquela data;
                os demais são snapshots registrados.
              </p>
            </Card>
            <Card title="Despesas por categoria">
              <ChartBox empty={cats.length === 0} label="Barras de despesas por categoria" height={Math.max(200, cats.length * 32)}>
                <BarChart data={cats} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={axis} tickFormatter={brlShort} />
                  <YAxis type="category" dataKey="name" tick={axis} width={110} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} />
                  <Bar dataKey="value" name="Despesas" fill={EXPENSE} />
                </BarChart>
              </ChartBox>
            </Card>
            <Card title="Carteira por classe de ativo">
              <ChartBox empty={alloc.length === 0} label="Pizza da distribuição da carteira">
                <PieChart>
                  <Pie data={alloc} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
                    {alloc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
                </PieChart>
              </ChartBox>
            </Card>
            <Card title="Evolução do valor da carteira">
              <ChartBox empty={!history.some((h) => h["Valor da carteira"] || h["Custo investido"])}
                label="Linha do valor da carteira e do custo investido">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
                  <Line dataKey="Valor da carteira" stroke={INCOME} strokeWidth={2} />
                  <Line dataKey="Custo investido" stroke="#64748b" strokeDasharray="4 3" />
                </LineChart>
              </ChartBox>
            </Card>
            <Card title="Aportes × rendimentos">
              <ChartBox empty={!flows.some((f) => f.Aportes || f.Resgates || f.Proventos)}
                label="Barras de aportes, resgates e proventos por mês">
                <BarChart data={flows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} /><Legend />
                  <Bar dataKey="Aportes" fill={NEUTRAL} /><Bar dataKey="Resgates" fill="#64748b" />
                  <Bar dataKey="Proventos" fill={INCOME} />
                </BarChart>
              </ChartBox>
            </Card>
            <Card title="Proventos recebidos">
              <ChartBox empty={!flows.some((f) => f.Proventos)} label="Barras de proventos recebidos por mês">
                <BarChart data={flows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                  <XAxis dataKey="name" tick={axis} /><YAxis tick={axis} tickFormatter={brlShort} width={80} />
                  <Tooltip formatter={moneyFormatter} {...tooltipStyle} />
                  <Bar dataKey="Proventos" fill={INCOME} />
                </BarChart>
              </ChartBox>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card title="Contas a vencer e atrasadas">
              {d.upcoming.length === 0 ? <Empty>Nenhuma conta a vencer nos próximos 7 dias.</Empty> : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {d.upcoming.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span>{t.description} {t.overdue && <Badge tone="red">Atrasada</Badge>}</span>
                      <span className="tabular-nums">{date(t.due_date ?? t.date)} · {brl(t.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Últimas movimentações" actions={<Link className="text-sm text-emerald-700 hover:underline
              dark:text-emerald-400" to="/lancamentos">Ver todas</Link>}>
              {d.recent.length === 0 ? <Empty>Nenhuma movimentação registrada.</Empty> : (
                <Table>
                  <thead><tr><th className={th}>Data</th><th className={th}>Descrição</th><th className={th}>Tipo</th>
                    <th className={th}>Categoria</th><th className={th}>Conta</th>
                    <th className={`${th} text-right`}>Valor</th></tr></thead>
                  <tbody>
                    {d.recent.map((t) => (
                      <tr key={t.id}>
                        <td className={td}>{date(t.date)}</td>
                        <td className={td}>{t.description}
                          {t.status !== "settled" && <> <Badge tone="amber">{statusLabel(t.kind, t.status)}</Badge></>}</td>
                        <td className={td}>{KIND_LABEL[t.kind]}</td>
                        <td className={td}>{t.category_name ?? "—"}</td>
                        <td className={td}>{t.account_name}</td>
                        <td className={`${td} text-right tabular-nums`}>{brl(t.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          </div>
        </>
      )}
      <TransactionModal open={modal === "income" || modal === "expense"} kind={modal === "income" ? "income" : "expense"}
        onClose={() => setModal(null)} />
      <TransferModal open={modal === "transfer"} onClose={() => setModal(null)} />
    </div>
  );
}
