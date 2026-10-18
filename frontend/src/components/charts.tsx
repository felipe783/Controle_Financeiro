import type { ReactNode } from "react";
import { ResponsiveContainer } from "recharts";
import { brl, toNum } from "../format";
import { Empty } from "./ui";

// Paleta fixa e distinguível em tema claro e escuro.
export const COLORS = ["#047857", "#0369a1", "#b45309", "#7c3aed", "#be123c", "#0f766e", "#4d7c0f", "#a16207",
  "#475569", "#c2410c"];
export const INCOME = "#047857";
export const EXPENSE = "#be123c";
export const NEUTRAL = "#0369a1";
export const axis = { fontSize: 12, fill: "#64748b" };

export const brlShort = (v: number) =>
  Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : brl(v);

export const tooltipStyle = {
  contentStyle: { borderRadius: 6, fontSize: 12, background: "#0f172a", border: "none", color: "#f8fafc" },
  itemStyle: { color: "#f8fafc" },
  labelStyle: { color: "#cbd5e1" },
};

export const moneyFormatter = (v: unknown) => brl(toNum(v as string));

export function ChartBox({ empty, children, height = 260, label, emptyText = "Sem dados no período." }: {
  empty: boolean; children: ReactNode; height?: number; label: string; emptyText?: string;
}) {
  if (empty) return <Empty>{emptyText}</Empty>;
  return (
    <div role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
    </div>
  );
}
