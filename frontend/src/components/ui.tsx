import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { TriangleAlert, CircleCheck, Info, Ellipsis, X, CircleX, type LucideIcon } from "lucide-react";
import { animate, AnimatePresence, motion, useInView, useMotionValue, useReducedMotion } from "motion/react";
import {
  createContext, forwardRef, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode,
} from "react";
import { moneyParts, parseDecimal, toNum, type Dec } from "../format";
import { dur, ease, spring } from "../motion";
import { TileModule } from "./tiles";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Anel de foco único (só teclado), visível nos dois temas.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anil focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-paper";

// ---------- Campos ----------
export const inputCls =
  "block w-full min-h-10 rounded border border-rule-strong bg-sheet px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint transition-[border-color,box-shadow] duration-150 hover:border-ink-faint " +
  "focus:border-anil focus:outline-none focus:ring-4 focus:ring-anil/15 " +
  "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-soft " +
  "aria-[invalid=true]:border-neg aria-[invalid=true]:focus:ring-neg/20";

export function Field({ label, children, hint, error, className = "" }: {
  label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string | null; className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.span key="e" className="mt-1 block text-xs text-neg" initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }}>{error}</motion.span>
        ) : hint ? <span key="h" className="mt-1 block text-xs text-ink-soft">{hint}</span> : null}
      </AnimatePresence>
    </label>
  );
}

export function Check({ checked, onChange, children, className = "" }: {
  checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string;
}) {
  return (
    <label className={cx("flex min-h-10 cursor-pointer items-center gap-2.5 text-sm", className)}>
      <input type="checkbox" className="size-4 rounded" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

/** Campo monetário em formato brasileiro; o valor guardado é texto e é validado ao enviar. */
export function MoneyInput({ value, onChange, required, allowNegative, prefix = "R$", ...rest }: {
  value: string; onChange: (v: string) => void; required?: boolean; allowNegative?: boolean; placeholder?: string;
  prefix?: string; autoFocus?: boolean; "aria-label"?: string;
}) {
  const parsed = parseDecimal(value);
  const invalid = value.trim() !== "" && (parsed === null || (!allowNegative && Number(parsed) < 0));
  return (
    <div className="relative">
      {prefix && <span aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-medium text-ink-soft">
        {prefix}</span>}
      <input
        {...rest}
        className={cx(inputCls, "num font-figure text-base font-semibold", prefix && (prefix.length > 2 ? "pl-12" : "pl-9"))}
        inputMode="decimal"
        value={value}
        required={required}
        aria-invalid={invalid}
        placeholder={rest.placeholder ?? "0,00"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------- Botões ----------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost" | "accent";
const btn: Record<BtnVariant, string> = {
  primary: "bg-anil text-anil-ink shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:bg-anil-strong",
  accent: "bg-ocre text-ocre-ink shadow-[inset_0_-1px_0_rgb(0_0_0/0.18)] hover:brightness-105",
  secondary: "border border-rule-strong bg-sheet text-ink hover:border-ink-faint hover:bg-sunk",
  ghost: "text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
  danger: "bg-neg text-white hover:bg-neg/90 dark:text-paper",
  "danger-ghost": "text-neg hover:bg-neg-wash",
};

// O aperto (scale) é a resposta imediata ao clique; 120 ms, sem esperar o servidor.
export const buttonClass = (variant: BtnVariant = "primary", className = "", size: "sm" | "md" = "md") => cx(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium",
  "transition-[background-color,border-color,color,transform,filter] duration-150 active:scale-[0.97]",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
  size === "sm" ? "min-h-8 px-2.5 text-[13px]" : "min-h-10 px-3.5 text-sm",
  focusRing, btn[variant], className,
);

export function Button({ variant = "primary", size = "md", icon: Icon, className = "", children, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md"; icon?: LucideIcon }) {
  return (
    <button type="button" {...props} className={buttonClass(variant, className, size)}>
      {Icon && <Icon aria-hidden="true" className={size === "sm" ? "size-3.5" : "size-4"} strokeWidth={2} />}
      {children}
    </button>
  );
}

// forwardRef: o Radix (menus e "Fechar" das folhas) precisa da ref do gatilho para posicionar e devolver o foco.
export const IconButton = forwardRef<HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }>(
  function IconButton({ label, icon: Icon, className = "", ...props }, ref) {
    return (
      <button ref={ref} type="button" aria-label={label} title={label} {...props}
        className={cx("grid size-9 shrink-0 place-items-center rounded text-ink-soft transition-[background-color,color,transform] duration-150",
          "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.94] disabled:opacity-50", focusRing, className)}>
        <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </button>
    );
  });

// ---------- Números ----------
type MoneySize = "sm" | "md" | "fig" | "lg" | "xl" | "hero";
const moneySize: Record<MoneySize, [string, string]> = {
  // [número, símbolo e centavos]
  sm: ["text-sm [font-stretch:92%]", "text-[0.8em]"],
  md: ["text-[15px] [font-stretch:92%]", "text-[0.75em]"],
  fig: ["text-lg leading-tight", "text-[0.66em]"],
  lg: ["text-[1.75rem] leading-none [font-stretch:96%]", "text-[0.5em]"],
  xl: ["text-[2.25rem] leading-none [font-stretch:96%]", "text-[0.46em]"],
  hero: ["text-[3.1rem] leading-[0.9] sm:text-5xl [font-stretch:104%] font-[380]", "text-[0.36em] font-[560]"],
};

/** Contagem até o valor, sem re-renderizar a árvore inteira; com movimento reduzido, salta direto. */
export function useCountUp(target: number, enabled = true) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(enabled && !reduce ? 0 : target);
  const [v, setV] = useState(mv.get());
  useEffect(() => mv.on("change", setV), [mv]);
  useEffect(() => {
    if (!enabled || reduce) { mv.set(target); return; }
    const c = animate(mv, target, { duration: 0.9, ease: ease.out });
    return () => c.stop();
  }, [target, enabled, reduce, mv]);
  return v;
}

/**
 * Valor monetário com tipografia de livro-caixa: algarismos tabulares, "R$" e centavos menores.
 * `tone="signed"` usa verde/vermelho conforme o sinal e escreve + ou −; `flow` força o sentido (entrada/saída).
 * `animate` conta até o valor ao aparecer e a cada mudança (só nos números de destaque).
 */
export function Money({ value, currency = "BRL", size = "md", tone = "plain", flow, className = "", animate: anim = false }: {
  value: Dec; currency?: string; size?: MoneySize; tone?: "plain" | "signed" | "muted"; flow?: "in" | "out";
  className?: string; animate?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  const n = flow === "out" ? -Math.abs(toNum(value)) : flow === "in" ? Math.abs(toNum(value)) : toNum(value);
  const shown = useCountUp(n, anim && !empty);
  if (empty) return <span className="text-ink-faint">—</span>;
  const p = moneyParts(Math.abs(anim ? shown : n), currency);
  const signed = tone === "signed" || flow;
  const color = signed ? (n > 0 ? "text-pos" : n < 0 ? "text-neg" : "text-ink") : tone === "muted" ? "text-ink-soft" : "";
  const [main, minor] = moneySize[size];
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return (
    <span className={cx("num whitespace-nowrap font-figure font-semibold tracking-tight", main, color, className)}>
      {anim && <span className="sr-only">{(({ symbol, integer, decimal, fraction }) => `${symbol} ${integer}${decimal}${fraction}`)(moneyParts(Math.abs(n), currency))}</span>}
      <span className="sr-only">{n < 0 ? "menos " : ""}</span>
      <span aria-hidden={anim || undefined}>
        {sign && <span aria-hidden="true" className="mr-[0.08em]">{sign}</span>}
        <span className={cx(minor, "mr-[0.2em] font-medium opacity-70")}>{p.symbol}</span>
        {p.integer}<span className={cx(minor, "font-medium opacity-80")}>{p.decimal}{p.fraction}</span>
      </span>
    </span>
  );
}

/** Um número com rótulo curto acima e observação opcional abaixo. Sem superfície própria. */
export function Figure({ label, children, note, className = "" }: {
  label: ReactNode; children: ReactNode; note?: ReactNode; className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="mb-1.5 text-[13px] text-ink-soft">{label}</div>
      <div>{children}</div>
      {note && <div className="mt-1.5 text-xs text-ink-soft">{note}</div>}
    </div>
  );
}

// ---------- Estrutura ----------
/** Rolagem da janela passou de `y`? (para cabeçalhos que se compactam). */
export function useScrolledPast(y = 24) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const on = () => setPast(window.scrollY > y);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [y]);
  return past;
}

/**
 * Cabeçalho da página, fixo no topo: grande no início e compacto ao rolar, com as ações sempre à mão.
 * `aside` aparece só no modo compacto (ex.: o patrimônio do painel); `nav` é um índice de seções.
 */
export function PageHeader({ title, context, actions, aside, nav }: {
  title: string; context?: ReactNode; actions?: ReactNode; aside?: ReactNode; nav?: ReactNode;
}) {
  const stuck = useScrolledPast(28);
  const ref = useRef<HTMLElement>(null);
  // Publica onde o cabeçalho termina (--sticky-top), para listas grudarem seus títulos logo abaixo dele.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--sticky-top",
      `${(parseFloat(getComputedStyle(el).top) || 0) + el.offsetHeight}px`);
    const obs = new ResizeObserver(set);
    obs.observe(el);
    window.addEventListener("resize", set); // o `top` muda no breakpoint md sem mudar a altura
    set();
    return () => { obs.disconnect(); window.removeEventListener("resize", set); };
  }, []);
  return (
    <header ref={ref} className={cx("sticky top-14 z-20 -mx-4 mb-5 px-4 transition-[background-color,box-shadow,padding] duration-200 sm:-mx-6 sm:px-6 md:top-0 md:-mx-8 md:px-8",
      stuck ? "bg-paper/85 py-2.5 shadow-[0_1px_0_rgb(var(--rule))] backdrop-blur-md" : "py-1 md:pt-2")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <motion.h1 layout="position" transition={{ duration: dur.base, ease: ease.out }}
            className={cx("display font-figure font-[650] leading-none text-ink transition-[font-size] duration-200",
              stuck ? "text-lg" : "text-[1.9rem] sm:text-[2.2rem]")}>{title}</motion.h1>
          <AnimatePresence initial={false}>
            {context && !stuck && (
              <motion.p className="mt-1.5 max-w-2xl text-sm text-ink-soft" initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: dur.fast }}>
                {context}</motion.p>
            )}
          </AnimatePresence>
        </div>
        <AnimatePresence>
          {aside && stuck && (
            <motion.div className="order-3 hidden min-w-0 lg:order-none lg:block" initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: dur.base, ease: ease.out }}>
              {aside}
            </motion.div>
          )}
        </AnimatePresence>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {nav && <div className={cx("transition-[margin] duration-200", stuck ? "mt-2" : "mt-4")}>{nav}</div>}
    </header>
  );
}

/**
 * Folha de conteúdo. `title` vira um cabeçalho; sem título, é só a superfície.
 * `reveal` faz a folha subir uma vez quando entra na tela (usado com parcimônia, só no painel).
 */
export function Panel({ title, aside, children, className = "", bodyClass = "p-4 sm:p-5", id, reveal }: {
  title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string;
  reveal?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const seen = useInView(ref, { once: true, margin: "0px 0px -8% 0px" });
  const reduce = useReducedMotion();
  const hidden = reveal && !seen && !reduce;
  return (
    <section ref={ref} id={id}
      className={cx("min-w-0 scroll-mt-28 rounded-lg border border-rule bg-sheet shadow-lift transition-[opacity,transform] duration-500 [transition-timing-function:cubic-bezier(.16,1,.3,1)]",
        hidden && "translate-y-4 opacity-0", className)}>
      {(title || aside) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 pb-1 pt-3.5 sm:px-5">
          {title && <h2 className="display font-figure text-[15px] font-[620] [font-stretch:105%]">{title}</h2>}
          {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Cor de um valor com sinal sobre a faixa cobalto (verde e vermelho claros, legíveis no azul). */
export const railTone = (v: Dec) => (toNum(v) > 0 ? "text-[rgb(140_235_185)]" : toNum(v) < 0 ? "text-[rgb(255_180_170)]" : "text-rail-ink");

/**
 * Faixa cobalto: o número principal da página sobre o azul do azulejo, com os números de apoio ao lado.
 * É a assinatura que liga o painel, as contas, a carteira e o patrimônio.
 */
export function Band({ label, value, note, children, className = "" }: {
  label: ReactNode; value: Dec; note?: ReactNode; children?: ReactNode; className?: string;
}) {
  return (
    <section className={cx("relative overflow-hidden rounded-xl bg-rail text-rail-ink shadow-float", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-4 -right-4 grid grid-cols-3 gap-[3px] opacity-[0.12]">
        {[0, 270, 180, 90, 0, 270].map((r, i) => <TileModule key={i} a={1} rotate={r} aClass="fill-rail-ink" className="size-9" />)}
      </div>
      <div className="relative flex flex-col gap-x-12 gap-y-6 p-5 sm:p-7 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <div className="text-sm text-rail-soft">{label}</div>
          <div className="mt-2"><Money value={value} size="hero" animate className={toNum(value) < 0 ? railTone(value) : ""} /></div>
          {note && <div className="mt-2 text-sm text-rail-soft">{note}</div>}
        </div>
        {children && <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:items-end sm:gap-x-10 lg:justify-end">{children}</div>}
      </div>
    </section>
  );
}

/** Número de apoio dentro da faixa cobalto. */
export function BandFigure({ label, children, note }: { label: ReactNode; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[13px] text-rail-soft">{label}</div>
      <div className="text-rail-ink">{children}</div>
      {note && <div className="mt-1 text-xs text-rail-soft">{note}</div>}
    </div>
  );
}

/** Escolha única entre poucas opções; o realce desliza até a opção escolhida. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: {
  options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md";
}) {
  const id = useId();
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-md border border-rule-strong bg-sheet p-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cx("relative whitespace-nowrap rounded px-3 font-medium transition-colors duration-150", focusRing,
            size === "sm" ? "min-h-7 text-[13px]" : "min-h-9 text-sm",
            value === v ? "text-anil-ink" : "text-ink-soft hover:text-ink")}>
          {value === v && <motion.span layoutId={`seg-${id}`} transition={spring.snappy}
            className="absolute inset-0 rounded bg-anil" aria-hidden="true" />}
          <span className="relative">{l}</span>
        </button>
      ))}
    </div>
  );
}

const toneDot = { slate: "bg-ink-faint", pos: "bg-pos", neg: "bg-neg", warn: "bg-warn", anil: "bg-anil" } as const;
const toneText = { slate: "text-ink-soft", pos: "text-pos", neg: "text-neg", warn: "text-warn", anil: "text-anil" } as const;
export type Tone = keyof typeof toneDot;

/** Situação curta: ponto colorido + texto (a cor nunca é a única pista). Atrasos pulsam uma vez ao aparecer. */
export function Status({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium", toneText[tone])}>
      <span aria-hidden="true" className="relative grid size-2 place-items-center">
        {tone === "neg" && <motion.span className="absolute inset-0 rounded-full bg-neg" initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 1.1, repeat: 2, ease: ease.out }} />}
        <span className={cx("size-1.5 rounded-full", toneDot[tone])} />
      </span>{children}
    </span>
  );
}

/** Marcador discreto de natureza ("Recorrente", "Sistema"): texto pequeno com contorno. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-sm border border-rule-strong px-1.5 text-[11px] font-medium leading-[18px] text-ink-soft">{children}</span>;
}

/** Barra de consumo: cresce da esquerda (transform, sem mexer no layout). */
export function Progress({ value, tone = "anil", label }: { value: number; tone?: Tone; label: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
      <motion.div className={cx("h-full origin-left rounded-full", toneDot[tone])} initial={{ scaleX: 0 }}
        animate={{ scaleX: pct }} transition={{ duration: dur.focal, ease: ease.out }} />
    </div>
  );
}

/** Estado vazio: um azulejo solto e a orientação do próximo passo. */
export function Empty({ title, children, action, compact }: {
  title?: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={cx("flex gap-4", compact ? "items-start py-4" : "flex-col items-start py-10 sm:items-center sm:text-center")}>
      {!compact && (
        <motion.span initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: dur.focal, ease: ease.out }}
          className="block size-11 overflow-hidden rounded-[5px] bg-sheet ring-1 ring-inset ring-rule">
          <TileModule a={1} b={0.7} className="block size-full" aClass="fill-anil/80" />
        </motion.span>
      )}
      <div className={cx("flex flex-col gap-2", !compact && "sm:items-center")}>
        {title && <p className="font-medium">{title}</p>}
        {children && <p className="max-w-md text-sm text-ink-soft">{children}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}

/** Carregamento com o formato do conteúdo (linhas com brilho), sem spinner no meio da tela. */
export function Loading({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cx("space-y-3.5 py-2", className)}>
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-3">
          <div className="shimmer size-7 shrink-0 rounded-[4px]" style={{ animationDelay: `${i * 90}ms` }} />
          <div className="shimmer h-3.5 rounded-sm" style={{ width: `${88 - ((i * 17) % 40)}%`, animationDelay: `${i * 90}ms` }} />
        </div>
      ))}
    </div>
  );
}

const noticeTone = {
  error: ["bg-neg-wash text-neg", CircleX],
  warn: ["bg-warn-wash text-warn", TriangleAlert],
  info: ["bg-anil-wash text-anil", Info],
} as const;

export function Notice({ tone = "info", children, title, className = "" }: {
  tone?: keyof typeof noticeTone; children: ReactNode; title?: ReactNode; className?: string;
}) {
  const [cls, Icon] = noticeTone[tone];
  return (
    <motion.div role={tone === "error" ? "alert" : "status"} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }} className={cx("flex gap-2.5 rounded-md px-3.5 py-3 text-sm", cls, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-ink">{title && <strong className="font-semibold">{title} </strong>}{children}</div>
    </motion.div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return <Notice tone="error" className={className}>{error instanceof Error ? error.message : String(error)}</Notice>;
}

// ---------- Camadas: folha lateral, diálogo e menu ----------
function useWide(query = "(min-width: 640px)") {
  const [wide, setWide] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return wide;
}

const overlay = (
  <Dialog.Overlay asChild forceMount>
    <motion.div className="fixed inset-0 z-40 bg-[rgb(6_10_30/0.5)] backdrop-blur-[2px]"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: dur.fast } }}
      transition={{ duration: dur.base }} />
  </Dialog.Overlay>
);

/**
 * Folha lateral para criar, editar e consultar sem sair da página. No celular sobe de baixo; no computador
 * desliza da direita com mola. `footer` fica fixo embaixo, sempre visível em formulários longos.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode;
  footer?: ReactNode; width?: "md" | "lg";
}) {
  const wide = useWide();
  const off = wide ? { x: "100%", y: 0 } : { x: 0, y: "100%" };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {overlay}
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div initial={off} animate={{ x: 0, y: 0, transition: spring.layer }}
                exit={{ ...off, transition: { duration: dur.base, ease: ease.exit } }}
                className={cx("fixed z-50 flex flex-col bg-sheet shadow-float outline-none",
                  "inset-x-0 bottom-0 top-8 rounded-t-xl",
                  "sm:inset-y-2 sm:left-auto sm:right-2 sm:top-2 sm:w-[calc(100%-1rem)] sm:rounded-xl",
                  width === "lg" ? "sm:max-w-2xl" : "sm:max-w-[31rem]")}>
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-rule-strong sm:hidden" />
                <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
                  <div className="min-w-0">
                    <Dialog.Title className="display font-figure text-xl font-[640] leading-tight">{title}</Dialog.Title>
                    {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
                  </div>
                  <Dialog.Close asChild><IconButton label="Fechar" icon={X} className="-mr-2 -mt-1" /></Dialog.Close>
                </header>
                <motion.div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-1" initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.06, duration: dur.slow, ease: ease.out } }}>
                  {children}
                </motion.div>
                {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-5 py-3">{footer}</footer>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Rodapé padrão de formulários dentro de uma folha (o botão de enviar aponta para o form pelo id). */
export function SheetActions({ form, onCancel, busy, label = "Salvar", busyLabel = "Salvando…" }: {
  form: string; onCancel: () => void; busy?: boolean; label?: string; busyLabel?: string;
}) {
  return (
    <>
      <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" form={form} disabled={busy}>{busy ? busyLabel : label}</Button>
    </>
  );
}

export function Modal({ open, onClose, title, children, className = "" }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            {overlay}
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div initial={{ opacity: 0, scale: 0.94, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring.layer }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: dur.fast } }}
                  className={cx("pointer-events-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-sheet p-5 shadow-float outline-none", className)}>
                  <Dialog.Title className="mb-2 text-base font-semibold">{title}</Dialog.Title>
                  {children}
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose, busy, confirmLabel = "Excluir", tone = "danger" }: {
  open: boolean; title: string; message: ReactNode; onConfirm: () => void; onClose: () => void; busy?: boolean;
  confirmLabel?: string; tone?: "danger" | "primary";
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-ink-soft">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export type MenuItem = { label: string; onSelect: () => void; icon?: LucideIcon; danger?: boolean; hidden?: boolean };

/** Menu de ações de uma linha ("⋯"). Abre com mola a partir do botão; itens entram em sequência. */
export function RowMenu({ items, label = "Mais ações" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={label} icon={Ellipsis} onClick={(e) => e.stopPropagation()}
          className={open ? "bg-ink/[0.07] text-ink" : ""} />
      </DropdownMenu.Trigger>
      <AnimatePresence>
        {open && (
          <DropdownMenu.Portal forceMount>
            <DropdownMenu.Content asChild forceMount align="end" sideOffset={6} onClick={(e) => e.stopPropagation()}>
              <motion.div initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0, transition: spring.snappy }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
                style={{ transformOrigin: "var(--radix-dropdown-menu-content-transform-origin)" }}
                className="z-50 min-w-48 rounded-lg border border-rule bg-sheet p-1 shadow-float">
                {visible.map((i, n) => (
                  <DropdownMenu.Item key={i.label} onSelect={i.onSelect} asChild>
                    <motion.div initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.02 + n * 0.025, duration: dur.base } }}
                      className={cx("flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded px-2.5 text-sm outline-none",
                        "transition-colors data-[highlighted]:bg-ink/[0.06]", i.danger ? "text-neg data-[highlighted]:bg-neg-wash" : "text-ink")}>
                      {i.icon && <i.icon aria-hidden="true" className="size-4 opacity-80" />}{i.label}
                    </motion.div>
                  </DropdownMenu.Item>
                ))}
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        )}
      </AnimatePresence>
    </DropdownMenu.Root>
  );
}

// ---------- Avisos (toasts) ----------
type Toast = { id: number; text: string; tone: "ok" | "error"; ms: number };
const ToastCtx = createContext<{ notify: (text: string, tone?: "ok" | "error") => void }>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = (id: number) => setItems((s) => s.filter((t) => t.id !== id));
  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    const ms = tone === "error" ? 8000 : 3500;
    setItems((s) => [...s.slice(-2), { id, text, tone, ms }]);
    setTimeout(() => dismiss(id), ms);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2 md:bottom-5 md:left-auto md:right-5 md:items-end">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div key={t.id} layout role={t.tone === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.layer }}
              exit={{ opacity: 0, x: 40, transition: { duration: dur.base, ease: ease.exit } }}
              className="pointer-events-auto relative flex w-full max-w-sm items-start gap-2.5 overflow-hidden rounded-lg bg-ink px-3.5 py-3 text-sm text-paper shadow-float">
              {t.tone === "ok"
                ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pos-wash" />
                : <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neg-wash" />}
              <span className="flex-1">{t.text}</span>
              <button type="button" aria-label="Dispensar aviso" onClick={() => dismiss(t.id)}
                className={cx("-m-1 rounded p-1 opacity-70 hover:opacity-100", focusRing)}><X className="size-3.5" /></button>
              {/* tempo restante do aviso */}
              <motion.span aria-hidden="true" className={cx("absolute inset-x-0 bottom-0 h-0.5 origin-left", t.tone === "ok" ? "bg-pos-wash/60" : "bg-neg-wash/60")}
                initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: t.ms / 1000, ease: "linear" }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx).notify;

// ---------- Tabelas ----------
export function Table({ children, className = "", minWidth = "min-w-[640px]" }: {
  children: ReactNode; className?: string; minWidth?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className={cx("w-full text-left text-sm", minWidth)}>{children}</table>
    </div>
  );
}

export const th = "h-9 whitespace-nowrap border-y border-rule bg-sunk/70 px-3 text-[12px] font-medium text-ink-soft first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
export const td = "border-b border-rule/70 px-3 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";

export const toneOf = (v: Dec) => (toNum(v) > 0 ? "pos" : toNum(v) < 0 ? "neg" : undefined);
