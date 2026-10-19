import { useEffect, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { brl, toNum } from "../format";
import { Empty } from "./ui";

/*
 * Paleta categórica validada (scripts/validate_palette.js da skill dataviz) nos dois temas:
 * faixa de luminosidade, croma mínimo, separação para daltonismo entre vizinhos e contraste com a folha.
 * A ordem é fixa: a 7ª categoria em diante vira "Outros", nunca uma cor gerada.
 */
const CATEGORICAL = {
  light: ["#5157C4", "#00939A", "#C2851B", "#B04A9C", "#7A8A2A", "#4F8FE0"],
  dark: ["#7D82E8", "#1FA6A4", "#BA8226", "#C25DAE", "#8E9C3C", "#5A93DE"],
};
export const MAX_CATEGORIES = CATEGORICAL.light.length;

const read = (name: string) => `rgb(${getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().replace(/ /g, ",")})`;

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
      contentStyle: { borderRadius: 5, fontSize: 12, background: t.ink, border: "none", color: t.sheet, padding: "8px 10px" },
      itemStyle: { color: t.sheet, padding: 0 },
      labelStyle: { color: t.sheet, opacity: 0.7, marginBottom: 4 },
      cursor: { fill: t.ink, fillOpacity: 0.05 },
    },
  };
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
