import { motion, useReducedMotion } from "motion/react";
import { cx } from "./ui";
import { ease } from "../motion";

/*
 * O módulo de azulejo (à maneira de Athos Bulcão): um quadrado esmaltado com um quarto de disco num canto e
 * um disco menor no canto oposto. Girado em passos de 90°, compõe murais; no painel, a área de cada forma
 * mede o dinheiro do dia (azul = saiu, verde = entrou).
 */
const S = 40;
const quarter = (r: number) => `M0 0H${r}A${r} ${r} 0 0 1 0 ${r}Z`;
const corner = (r: number) => `M${S} ${S}H${S - r}A${r} ${r} 0 0 1 ${S} ${S - r}Z`;

export function TileModule({ a = 1, b = 0, rotate = 0, aClass = "fill-anil", bClass = "fill-ocre", className = "" }: {
  /** fração 0..1 do raio do quarto de disco principal */ a?: number;
  /** fração 0..1 do raio do disco do canto oposto */ b?: number;
  rotate?: number; aClass?: string; bClass?: string; className?: string;
}) {
  return (
    <svg viewBox={`0 0 ${S} ${S}`} aria-hidden="true" className={className}>
      <g transform={`rotate(${rotate} ${S / 2} ${S / 2})`}>
        {a > 0 && <path d={quarter(Math.max(4, a * S))} className={aClass} />}
        {b > 0 && <path d={corner(Math.max(4, b * S * 0.62))} className={bClass} />}
      </g>
    </svg>
  );
}

/** Marca: quatro módulos girados que fecham um círculo no centro (o "painel" mínimo). */
export function TileMark({ className = "", tone = "brand" }: { className?: string; tone?: "brand" | "rail" }) {
  const rot = [180, 270, 90, 0];
  return (
    <span className={cx("grid grid-cols-2 gap-[1.5px] overflow-hidden rounded-[4px]", className)} aria-hidden="true">
      {rot.map((r, i) => (
        <span key={i} className={tone === "rail" ? "bg-rail-ink" : "bg-sheet ring-1 ring-inset ring-rule"}>
          <TileModule a={1} rotate={r} aClass={i === 1 ? "fill-ocre" : tone === "rail" ? "fill-rail" : "fill-anil"} className="block size-full" />
        </span>
      ))}
    </span>
  );
}

/** Carregamento curto: três azulejos girando em sequência, como um assentador testando o módulo. */
export function TileLoader({ className = "", label = "Carregando…" }: { className?: string; label?: string }) {
  const reduce = useReducedMotion();
  return (
    <span role="status" className={cx("inline-flex items-center gap-1", className)}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="block size-4 overflow-hidden rounded-[2px] bg-sheet ring-1 ring-inset ring-rule"
          animate={reduce ? { opacity: [0.4, 1, 0.4] } : { rotate: [0, 90, 90] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: ease.inOut, times: [0, 0.45, 1] }}>
          <TileModule a={1} aClass={i === 1 ? "fill-ocre" : "fill-anil"} className="block size-full" />
        </motion.span>
      ))}
    </span>
  );
}
