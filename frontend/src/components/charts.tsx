import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { brl, toNum } from "../format";
import { Empty } from "./ui";

/*
 * Paleta categórica validada (scripts/validate_palette.js da skill dataviz, 2026-10-19) nos dois temas, contra
 * #FFFFFF e #10162C: faixa de luminosidade, croma mínimo, separação para daltonismo entre vizinhos e contraste.
 * Abre com o cobalto e o ocre do azulejo. A ordem é fixa: a 7ª categoria em diante vira "Outros".
 */
const CATEGORICAL = {
  light: ["#2F55D4", "#00939A", "#C2851B", "#B04A9C", "#7A8A2A", "#4887D6"],
  dark: ["#6C88EC", "#1FA6A4", "#B07C22", "#C25DAE", "#8E9C3C", "#4F92D9"],
};
export const MAX_CATEGORIES = CATEGORICAL.light.length;

const read = (name: string, alpha = 1) =>
  `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().replace(/ /g, ",")},${alpha})`;

function snapshot() {
  const dark = document.documentElement.classList.contains("dark");
  return {
    dark,
    series: CATEGORICAL[dark ? "dark" : "light"],
    income: read("pos"),
    expense: read("neg"),
    brand: read("anil"),
    ink: read("ink"),
    soft: read("ink-soft"),
    faint: read("ink-faint"),
    rule: read("rule"),
    sheet: read("sheet"),
    ocre: read("ocre"),
    rail: read("rail"),
    railInk: read("rail-ink"),
    railRule: read("rail-ink", 0.14),
  };
}

/** Cores do gráfico lidas dos tokens do tema; atualiza quando o tema muda. */
export function useChartTheme() {
  const [t, setT] = useState(snapshot);
  useEffect(() => {
    const obs = new MutationObserver(() => setT(snapshot()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return {
    ...t,
    axis: { fontSize: 12, fill: t.soft },
    grid: { stroke: t.rule, strokeDasharray: "0", vertical: false },
    tooltip: {
      contentStyle: { borderRadius: 8, fontSize: 12, background: t.ink, border: "none", color: t.sheet, padding: "8px 10px",
        boxShadow: "0 12px 32px -8px rgb(8 14 40 / 0.4)" },
      itemStyle: { color: t.sheet, padding: 0 },
      labelStyle: { color: t.sheet, opacity: 0.7, marginBottom: 4 },
      cursor: { fill: t.ink, fillOpacity: 0.05 },
    },
    // Barras e linhas crescem ao entrar (recharts anima por padrão; aqui com a curva do sistema de movimento).
    anim: { animationDuration: 700, animationEasing: "ease-out" as const },
  };
}

/**
 * Curva grande do patrimônio (SVG próprio): o traço se desenha ao entrar e um cursor percorre os meses.
 * `onScrub` informa o ponto sob o cursor (ou null ao sair), para o número de destaque acompanhar.
 */
export function WorthCurve({ points, height = 220, onScrub, label, onRail }: {
  points: { label: string; value: number; estimate?: boolean }[]; height?: number; label: string;
  onScrub?: (i: number | null) => void;
  /** desenhada sobre a faixa cobalto: linha em ocre, grade e rótulos na tinta do trilho */ onRail?: boolean;
}) {
  const theme = useChartTheme();
  const t = onRail ? { ...theme, brand: theme.ocre, rule: theme.railRule, ink: theme.railInk } : theme;
  const textCls = onRail ? "text-rail-soft" : "text-ink-faint";
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padT = 16, padB = 26;
  const vals = points.map((p) => p.value);
  const lo = Math.min(0, ...vals), hi = Math.max(...vals, 1);
  const x = (i: number) => (points.length < 2 ? W / 2 : (i / (points.length - 1)) * W);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * (H - padT - padB);
  // Curva suave (Catmull-Rom → Bézier) sem ultrapassar muito os pontos.
  const d = points.map((p, i) => {
    if (i === 0) return `M${x(0)},${y(p.value)}`;
    const p0 = points[Math.max(i - 2, 0)], p1 = points[i - 1], p3 = points[Math.min(i + 1, points.length - 1)];
    const c1x = x(i - 1) + (x(i) - x(Math.max(i - 2, 0))) / 6, c1y = y(p1.value) + (y(p.value) - y(p0.value)) / 6;
    const c2x = x(i) - (x(Math.min(i + 1, points.length - 1)) - x(i - 1)) / 6, c2y = y(p.value) - (y(p3.value) - y(p1.value)) / 6;
    return `C${c1x},${c1y} ${c2x},${c2y} ${x(i)},${y(p.value)}`;
  }).join(" ");
  const area = `${d} L${x(points.length - 1)},${H - padB} L0,${H - padB} Z`;
  const ticks = [hi, (hi + lo) / 2, lo];
  const id = useId();

  function move(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (points.length - 1));
    const k = Math.max(0, Math.min(points.length - 1, i));
    setHover(k);
    onScrub?.(k);
  }
  function leave() { setHover(null); onScrub?.(null); }

  return (
    <div role="img" aria-label={label} className="relative select-none" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full touch-pan-y overflow-visible"
        onPointerMove={move} onPointerLeave={leave} onPointerDown={move}>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.brand} stopOpacity={0.28} />
            <stop offset="100%" stopColor={t.brand} stopOpacity={0} />
          </linearGradient>
        </defs>
        {ticks.map((v, i) => <line key={i} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke={t.rule} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={i === 2 ? "0" : "3 4"} />)}
        <motion.path d={area} fill={`url(#g${id})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduce ? 0 : 0.5, duration: 0.6 }} />
        <motion.path d={d} fill="none" stroke={t.brand} strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }} />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT - 6} y2={H - padB} stroke={t.ink} strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* pontos e rótulos em HTML: não se deformam com o preserveAspectRatio */}
      {hover !== null && (
        <span aria-hidden="true" className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].value) / H) * 100}%`, background: t.brand,
            borderColor: onRail ? t.rail : t.sheet }} />
      )}
      {ticks.map((v, i) => (
        <span key={i} aria-hidden="true" className={`num pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[11px] ${textCls}`}
          style={{ top: `${(y(v) / H) * 100}%` }}>{brlShort(v)}</span>
      ))}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[11px] ${textCls}`}>
        {points.filter((_, i) => i % Math.ceil(points.length / 6) === 0 || i === points.length - 1).map((p, i) => <span key={i}>{p.label}</span>)}
      </div>
    </div>
  );
}

export const brlShort = (v: number) =>
  Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(v));

export const moneyFormatter = (v: unknown) => brl(toNum(v as string));

/** Agrupa a cauda em "Outros" para não passar do número de cores validadas. */
export function foldOthers<T extends { name: string; value: number }>(rows: T[], max = MAX_CATEGORIES) {
  if (rows.length <= max) return rows.map((r) => ({ name: r.name, value: r.value }));
  const head = rows.slice(0, max - 1).map((r) => ({ name: r.name, value: r.value }));
  return [...head, { name: "Outros", value: rows.slice(max - 1).reduce((s, r) => s + r.value, 0) }];
}

/** Moldura do gráfico: altura fixa (sem salto de layout), descrição para leitor de tela e tabela opcional. */
export function ChartBox({ empty, children, height = 240, label, emptyText = "Sem dados no período.", table }: {
  empty: boolean; children: ReactNode; height?: number; label: string; emptyText?: string; table?: ReactNode;
}) {
  if (empty) return <Empty compact>{emptyText}</Empty>;
  return (
    <>
      <div role="img" aria-label={label} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
      </div>
      {table && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer select-none text-[13px] text-ink-soft hover:text-ink">Ver valores em tabela</summary>
          <div className="mt-2">{table}</div>
        </details>
      )}
    </>
  );
}

/** Legenda em HTML (texto na cor da tinta, marca colorida ao lado): a cor nunca é a única pista. */
export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-0.5 w-3.5 rounded-full"
            style={i.dashed ? { backgroundImage: `linear-gradient(90deg, ${i.color} 60%, transparent 0)`, backgroundSize: "5px 2px" }
              : { background: i.color, height: 8, width: 8, borderRadius: 2 }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
