/*
 * Sistema de movimento. Rotina rápida (resposta e troca de estado), camadas com mola (folhas, menus, diálogos)
 * e um único momento autoral: o mural de azulejos do painel se montando. Saída sempre mais curta que a entrada.
 * O MotionConfig da raiz usa reducedMotion="user": com movimento reduzido, só opacidade e cor animam.
 */
import type { Transition, Variants } from "motion/react";

export const ease = {
  out: [0.16, 1, 0.3, 1] as const, // chegada confiante
  inOut: [0.65, 0, 0.35, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
};

export const dur = { fast: 0.14, base: 0.22, slow: 0.42, focal: 0.7 };

export const spring = {
  snappy: { type: "spring", stiffness: 560, damping: 42, mass: 0.8 } as Transition,
  layer: { type: "spring", stiffness: 380, damping: 38 } as Transition,
};

/**
 * Entrada de página: sobe pouco; não espera a saída da anterior. Sem `filter`: um filter diferente de none
 * no contêiner faria os filhos `position: fixed` (barra de lote) se prenderem a ele em vez da tela.
 */
export const pageIn: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.slow, ease: ease.out } },
};
