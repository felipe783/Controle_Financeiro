import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { AssetForm } from "../components/InvestmentForms";
import {
  Band, BandFigure, Button, Check, cx, Empty, railTone, ErrorBox, Field, focusRing, inputCls, Loading, Money, MoneyInput, Notice, PageHeader,
  Panel, Sheet, SheetActions, Status, Table, td, th,
} from "../components/ui";
import { ASSET_CLASSES, date, dateTime, money, num, parseDecimal, pct, todayISO, toNum } from "../format";
import { useSave } from "../hooks";
import type { AssetRow } from "../types";

type Portfolio = { items: AssetRow[]; totals: Record<string, string>; xirr: string | null; simple_return: string | null;
  providers: string[] };
export type QStatus = { providers: string[]; fx_provider: string | null; auto_update: boolean; interval_minutes: number;
  last_run: Record<string, unknown> | null; worker_heartbeat: string | null;
  logs: { id: number; ticker: string | null; pair: string | null; provider: string; status: string; price: string | null;
    reference_date: string | null; received_at: string; error: string | null; trigger: string }[] };

const METHOD: Record<string, string> = { cost: "Avaliado pelo custo", no_fx: "Sem câmbio" };

export default function Investments() {
  const pf = useQuery({ queryKey: ["portfolio"], queryFn: () => api.get<Portfolio>("/portfolio") });
  const status = useQuery({ queryKey: ["quotes-status"], queryFn: () => api.get<QStatus>("/quotes/status") });
  const [newAsset, setNewAsset] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const navigate = useNavigate();
  const update = useSave(() => api.post("/quotes/update"), "Cotações atualizadas.");
  const t = pf.data?.totals;
  const items = (pf.data?.items ?? []).filter((a) => showArchived || !a.archived);
  const classes = [...new Set(items.map((a) => a.asset_class))]
    .map((c) => ({ c, rows: items.filter((a) => a.asset_class === c) }))
    .map((g) => ({ ...g, value: g.rows.reduce((s, a) => s + toNum(a.market_value_brl), 0) }))
    .sort((a, b) => b.value - a.value);
  const archivedCount = (pf.data?.items ?? []).filter((a) => a.archived).length;

  return (
    <div>
      <PageHeader title="Investimentos" context="Posição, custo e resultado de cada ativo, com cotações automáticas ou informadas por você."
        actions={<>
          <Button variant="secondary" icon={RefreshCw} onClick={() => update.mutate(undefined)} disabled={update.isPending}>
            {update.isPending ? "Atualizando…" : "Atualizar cotações"}</Button>
          <Button icon={Plus} onClick={() => setNewAsset(true)}>Novo ativo</Button>
        </>} />

      <ErrorBox error={pf.error} className="mb-4" />
      {t && (
        <Band label="Valor de mercado" value={t.market_value_brl} className="mb-6"
          note={<>Aportado no total: <Money value={t.bought_brl} size="sm" className="text-rail-ink" /></>}>
          <BandFigure label="Custo da posição"><Money value={t.cost_brl} size="lg" /></BandFigure>
          <BandFigure label="Não realizado"><Money value={t.unrealized_brl} size="lg" className={railTone(t.unrealized_brl)} animate /></BandFigure>
          <BandFigure label="Retorno total" note="Inclui realizado, proventos e taxas">
            <Money value={t.total_return_brl} size="lg" className={railTone(t.total_return_brl)} animate /></BandFigure>
          <BandFigure label="TIR anual" note={pf.data?.xirr ? `Simples sobre aportes: ${pct(pf.data.simple_return)}` : "Aparece após 30 dias de histórico"}>
            <span className="num font-figure text-[1.75rem] font-semibold leading-none text-ocre">{pf.data?.xirr ? pct(pf.data.xirr) : "—"}</span></BandFigure>
        </Band>
      )}

      <QuoteStatusLine status={status.data} />

      <div className="mt-4 rounded-md border border-rule bg-sheet">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2 sm:px-5">
          <h2 className="text-[15px] font-semibold">Carteira</h2>
          {archivedCount > 0 && <Check checked={showArchived} onChange={setShowArchived}>Mostrar {archivedCount} arquivado(s)</Check>}
        </header>
        {pf.isLoading ? <div className="p-5"><Loading rows={6} /></div> : items.length === 0 ? (
          <Empty title="Nenhum ativo na carteira" action={<Button icon={Plus} onClick={() => setNewAsset(true)}>Cadastrar ativo</Button>}>
            Cadastre o ativo e depois registre as compras: preço médio, custo e resultado são calculados a partir delas.
          </Empty>
        ) : (
          <Table minWidth="min-w-0">
            <thead><tr>
              <th className={th}>Ativo</th>
              <th className={cx(th, "hidden text-right md:table-cell")}>Quantidade</th>
              <th className={cx(th, "hidden text-right lg:table-cell")}>Preço médio</th>
              <th className={cx(th, "hidden text-right md:table-cell")}>Cotação</th>
              <th className={cx(th, "text-right")}>Valor</th>
              <th className={cx(th, "hidden text-right sm:table-cell")}>Resultado</th>
              <th className={cx(th, "hidden w-32 lg:table-cell")}>Peso</th>
            </tr></thead>
            <tbody>
              {classes.map((g) => (
                <Fragment key={g.c}>
                  <tr>
                    <th colSpan={7} scope="colgroup" className="border-b border-rule bg-paper/60 px-4 py-1.5 text-left text-[13px] sm:px-5">
                      <span className="font-semibold">{ASSET_CLASSES[g.c] ?? g.c}</span>
                      <span className="float-right font-normal text-ink-soft"><Money value={g.value} size="sm" tone="muted" /></span>
                    </th>
                  </tr>
                  {g.rows.map((a) => (
                    <tr key={a.id} onClick={() => navigate(`/investimentos/${a.id}`)}
                      className={cx("cursor-pointer hover:bg-ink/[0.025]", a.archived && "opacity-60")}>
                      <td className={cx(td, "max-w-0 w-full")}>
                        <Link to={`/investimentos/${a.id}`} onClick={(e) => e.stopPropagation()}
                          className={cx("block rounded font-semibold hover:text-anil", focusRing)}>{a.ticker ?? a.name}</Link>
                        <div className="truncate text-xs text-ink-soft">{a.ticker ? a.name : a.institution ?? ""}</div>
                        {(a.quote_stale || a.valuation_method !== "market" || a.warnings.length > 0) && (
                          <div className="mt-1 flex flex-wrap gap-x-3">
                            {a.quote_stale && <Status tone="warn">Cotação antiga</Status>}
                            {a.valuation_method !== "market" && <Status tone="warn">{METHOD[a.valuation_method]}</Status>}
                          </div>
                        )}
                      </td>
                      <td className={cx(td, "num hidden whitespace-nowrap text-right md:table-cell")}>{num(a.quantity)}</td>
                      <td className={cx(td, "num hidden whitespace-nowrap text-right lg:table-cell")}>{money(a.avg_price, a.currency)}</td>
                      <td className={cx(td, "hidden whitespace-nowrap text-right md:table-cell")}>
                        <span className="num">{a.last_price ? money(a.last_price, a.currency) : a.quote_total_value ? "Valor total" : "—"}</span>
                        <div className="text-xs text-ink-soft">{a.quote_reference_date ? `${date(a.quote_reference_date)}${a.quote_source === "manual" ? ", manual" : ""}` : "sem cotação"}</div>
                      </td>
                      <td className={cx(td, "whitespace-nowrap text-right")}><Money value={a.market_value_brl} /></td>
                      <td className={cx(td, "hidden whitespace-nowrap text-right sm:table-cell")}>
                        <Money value={a.total_return_brl} size="sm" tone="signed" />
                        <div className="text-xs text-ink-soft">{a.xirr ? `TIR ${pct(a.xirr)}` : a.simple_return ? pct(a.simple_return) : ""}</div>
                      </td>
                      <td className={cx(td, "hidden lg:table-cell")}>
                        <div className="flex items-center gap-2">
                          <div className="h-1 flex-1 rounded-full bg-ink/[0.07]"><div className="h-full rounded-full bg-anil" style={{ width: `${toNum(a.weight) * 100}%` }} /></div>
                          <span className="num w-12 text-right text-xs text-ink-soft">{pct(a.weight)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ProviderLog status={status.data} />
        <FxPanel />
      </div>

      <Sheet open={newAsset} onClose={() => setNewAsset(false)} title="Novo ativo"
        footer={<SheetActions form="asset-form" onCancel={() => setNewAsset(false)} />}>
        {newAsset && <AssetForm initial={null} onDone={() => setNewAsset(false)} />}
      </Sheet>
    </div>
  );
}

function QuoteStatusLine({ status }: { status?: QStatus }) {
  if (!status) return null;
  const last = status.last_run as { finished_at?: string; ok?: number; errors?: number } | null;
  if (status.providers.length === 0) {
    return (
      <Notice tone="info" title="Cotações manuais.">
        Nenhum provedor configurado; informe os preços na página de cada ativo. Para atualizar sozinho, configure
        BRAPI_TOKEN (B3) ou ALPHAVANTAGE_API_KEY (exterior) no .env do servidor.
      </Notice>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-soft">
      <Status tone={last?.errors ? "warn" : "pos"}>{status.auto_update ? `Atualização automática a cada ${status.interval_minutes} min` : "Atualização automática desligada"}</Status>
      <span>Provedores: {status.providers.join(", ")}; câmbio: {status.fx_provider ?? "manual"}</span>
      <span>Última rodada: {last?.finished_at ? `${dateTime(last.finished_at)}, ${last.ok ?? 0} ok e ${last.errors ?? 0} com erro` : "nunca"}</span>
      <span>Os dados têm atraso; não são tempo real.</span>
    </p>
  );
}

function ProviderLog({ status }: { status?: QStatus }) {
  return (
    <Panel title="Consultas recentes aos provedores" bodyClass="p-0">
      {!status?.logs.length ? <div className="px-5"><Empty compact>Nenhuma consulta feita ainda.</Empty></div> : (
        <div className="max-h-72 overflow-auto">
          <Table minWidth="min-w-[480px]">
            <thead><tr><th className={th}>Quando</th><th className={th}>Ativo</th><th className={th}>Resultado</th></tr></thead>
            <tbody>{status.logs.map((l) => (
              <tr key={l.id}>
                <td className={cx(td, "num whitespace-nowrap text-ink-soft")}>{dateTime(l.received_at)}</td>
                <td className={td}><span className="font-medium">{l.ticker ?? l.pair}</span> <span className="text-xs text-ink-soft">{l.provider}</span></td>
                <td className={td}>{l.status === "ok"
                  ? <span className="num">{num(l.price)} <span className="text-xs text-ink-soft">ref. {date(l.reference_date)}</span></span>
                  : <Status tone="neg">{l.error ?? l.status}</Status>}</td>
              </tr>))}
            </tbody>
          </Table>
        </div>
      )}
    </Panel>
  );
}

function FxPanel() {
  const fx = useQuery({ queryKey: ["fx"], queryFn: () => api.get<{ id: number; currency: string; rate: string;
    reference_date: string; source: string }[]>("/fx") });
  const [f, setF] = useState({ currency: "USD", rate: "", reference_date: todayISO() });
  const save = useSave((b: unknown) => api.post("/fx", b), "Câmbio registrado.", () => setF({ ...f, rate: "" }));
  return (
    <Panel title="Câmbio" bodyClass="p-0">
      <form className="grid grid-cols-2 gap-3 border-b border-rule p-4 sm:grid-cols-[5rem_1fr_1fr_auto] sm:items-end sm:px-5" onSubmit={(e) => {
        e.preventDefault(); const r = parseDecimal(f.rate); if (r) save.mutate({ ...f, rate: r, currency: f.currency.toUpperCase() }); }}>
        <Field label="Moeda"><input className={inputCls} value={f.currency} maxLength={3} required pattern="[A-Za-z]{3}"
          onChange={(e) => setF({ ...f, currency: e.target.value })} /></Field>
        <Field label="R$ por unidade"><MoneyInput value={f.rate} onChange={(v) => setF({ ...f, rate: v })} required /></Field>
        <Field label="Data"><input type="date" className={inputCls} value={f.reference_date} required
          onChange={(e) => setF({ ...f, reference_date: e.target.value })} /></Field>
        <Button type="submit" variant="secondary" disabled={save.isPending}>Registrar</Button>
      </form>
      {!fx.data?.length ? <div className="px-5"><Empty compact>Nenhuma taxa ainda. Com ativos em moeda estrangeira, a PTAX do Banco Central é consultada sozinha.</Empty></div> : (
        <div className="max-h-56 overflow-auto">
          <Table minWidth="min-w-0">
            <thead><tr><th className={th}>Moeda</th><th className={cx(th, "text-right")}>Taxa</th><th className={th}>Data</th><th className={th}>Fonte</th></tr></thead>
            <tbody>{fx.data.map((r) => (
              <tr key={r.id}><td className={cx(td, "font-medium")}>{r.currency}</td>
                <td className={cx(td, "num text-right")}>{num(r.rate, 6)}</td>
                <td className={cx(td, "num text-ink-soft")}>{date(r.reference_date)}</td>
                <td className={td}>{r.source === "manual" ? <span className="font-medium text-anil">Manual</span> : r.source}</td></tr>))}
            </tbody>
          </Table>
        </div>
      )}
    </Panel>
  );
}
