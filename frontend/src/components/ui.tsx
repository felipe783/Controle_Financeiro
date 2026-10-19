import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { TriangleAlert, CircleCheck, Info, Ellipsis, X, CircleX, type LucideIcon } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { moneyParts, parseDecimal, toNum, type Dec } from "../format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Anel de foco único (só teclado), visível nos dois temas.
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-anil focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-paper";

// ---------- Campos ----------
export const inputCls =
  "block w-full min-h-10 rounded border border-rule-strong bg-sheet px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint transition-colors duration-150 hover:border-ink-faint " +
  "focus:border-anil focus:outline-none focus:ring-2 focus:ring-anil/25 " +
  "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-soft " +
  "aria-[invalid=true]:border-neg aria-[invalid=true]:focus:ring-neg/25";

export function Field({ label, children, hint, error, className = "" }: {
  label: ReactNode; children: ReactNode; hint?: ReactNode; error?: string | null; className?: string;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-neg">{error}</span>
        : hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
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
        className={cx(inputCls, "num font-figure text-[15px] font-medium", prefix && (prefix.length > 2 ? "pl-12" : "pl-9"))}
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
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
const btn: Record<BtnVariant, string> = {
  primary: "bg-anil text-anil-ink hover:bg-anil-strong",
  secondary: "border border-rule-strong bg-sheet text-ink hover:border-ink-faint hover:bg-sunk",
  ghost: "text-ink-soft hover:bg-ink/[0.06] hover:text-ink",
  danger: "bg-neg text-white hover:bg-neg/90 dark:text-paper",
  "danger-ghost": "text-neg hover:bg-neg-wash",
};

export const buttonClass = (variant: BtnVariant = "primary", className = "", size: "sm" | "md" = "md") => cx(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium",
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50",
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

export function IconButton({ label, icon: Icon, className = "", ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: LucideIcon }) {
  return (
    <button type="button" aria-label={label} title={label} {...props}
      className={cx("grid size-9 shrink-0 place-items-center rounded text-ink-soft transition-colors duration-150",
        "hover:bg-ink/[0.06] hover:text-ink disabled:opacity-50", focusRing, className)}>
      <Icon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}

// ---------- Números ----------
type MoneySize = "sm" | "md" | "fig" | "lg" | "xl" | "hero";
const moneySize: Record<MoneySize, [string, string]> = {
  // [número, símbolo e centavos]
  sm: ["text-sm", "text-[0.8em]"],
  md: ["text-[15px]", "text-[0.78em]"],
  fig: ["text-lg leading-tight", "text-[0.7em]"],
  lg: ["text-2xl leading-none", "text-[0.55em]"],
  xl: ["text-3xl leading-none", "text-[0.5em]"],
  hero: ["text-[2.6rem] leading-none sm:text-4xl", "text-[0.42em]"],
};

/**
 * Valor monetário com tipografia de livro-caixa: algarismos tabulares condensados, "R$" e centavos menores.
 * `tone="signed"` usa verde/vermelho conforme o sinal e escreve + ou −; `flow` força o sentido (entrada/saída).
 */
export function Money({ value, currency = "BRL", size = "md", tone = "plain", flow, className = "" }: {
  value: Dec; currency?: string; size?: MoneySize; tone?: "plain" | "signed" | "muted"; flow?: "in" | "out";
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return <span className="text-ink-faint">—</span>;
  const n = flow === "out" ? -Math.abs(toNum(value)) : flow === "in" ? Math.abs(toNum(value)) : toNum(value);
  const p = moneyParts(Math.abs(n), currency);
  const signed = tone === "signed" || flow;
  const color = signed ? (n > 0 ? "text-pos" : n < 0 ? "text-neg" : "text-ink") : tone === "muted" ? "text-ink-soft" : "";
  const [main, minor] = moneySize[size];
  const sign = n < 0 ? "−" : signed && n > 0 ? "+" : "";
  return (
    <span className={cx("num whitespace-nowrap font-figure font-semibold tracking-tight", main, color, className)}>
      <span className="sr-only">{n < 0 ? "menos " : ""}</span>
      {sign && <span aria-hidden="true" className="mr-[0.08em]">{sign}</span>}
      <span className={cx(minor, "mr-[0.2em] font-medium opacity-70")}>{p.symbol}</span>
      {p.integer}<span className={cx(minor, "font-medium opacity-80")}>{p.decimal}{p.fraction}</span>
    </span>
  );
}

/** Um número com rótulo curto acima e observação opcional abaixo. Sem superfície própria. */
export function Figure({ label, children, note, className = "" }: {
  label: ReactNode; children: ReactNode; note?: ReactNode; className?: string;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="mb-1 text-[13px] text-ink-soft">{label}</div>
      <div>{children}</div>
      {note && <div className="mt-1 text-xs text-ink-soft">{note}</div>}
    </div>
  );
}

// ---------- Estrutura ----------
/** Título da página: compacto, com uma linha de contexto e ações à direita. */
export function PageHeader({ title, context, actions }: { title: string; context?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {context && <p className="mt-0.5 max-w-2xl text-sm text-ink-soft">{context}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Folha de conteúdo. `title` vira um cabeçalho com régua; sem título, é só a superfície. */
export function Panel({ title, aside, children, className = "", bodyClass = "p-4 sm:p-5", id }: {
  title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string;
}) {
  return (
    <section id={id} className={cx("min-w-0 rounded-md border border-rule bg-sheet", className)}>
      {(title || aside) && (
        <header className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2 sm:px-5">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/** Escolha única entre poucas opções, com estado anunciado por aria-pressed. */
export function Segmented<T extends string>({ options, value, onChange, label, size = "md" }: {
  options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded border border-rule-strong bg-sheet p-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={cx("whitespace-nowrap rounded-sm px-3 font-medium transition-colors duration-150", focusRing,
            size === "sm" ? "min-h-7 text-[13px]" : "min-h-9 text-sm",
            value === v ? "bg-anil text-anil-ink" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink")}>{l}</button>
      ))}
    </div>
  );
}

const toneDot = { slate: "bg-ink-faint", pos: "bg-pos", neg: "bg-neg", warn: "bg-warn", anil: "bg-anil" } as const;
const toneText = { slate: "text-ink-soft", pos: "text-pos", neg: "text-neg", warn: "text-warn", anil: "text-anil" } as const;
export type Tone = keyof typeof toneDot;

/** Situação curta: ponto colorido + texto (a cor nunca é a única pista). */
export function Status({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium", toneText[tone])}>
      <span aria-hidden="true" className={cx("size-1.5 rounded-full", toneDot[tone])} />{children}
    </span>
  );
}

/** Marcador discreto de natureza ("Recorrente", "Sistema"): texto pequeno com contorno. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-sm border border-rule-strong px-1.5 text-[11px] font-medium leading-[18px] text-ink-soft">{children}</span>;
}

export function Progress({ value, tone = "anil", label }: { value: number; tone?: Tone; label: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
      <div className={cx("h-full rounded-full transition-[width] duration-300", toneDot[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, children, action, compact }: {
  title?: ReactNode; children?: ReactNode; action?: ReactNode; compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-start gap-2", compact ? "py-4" : "py-10 sm:items-center sm:text-center")}>
      {title && <p className="font-medium">{title}</p>}
      {children && <p className="max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Carregamento com o formato do conteúdo (linhas), sem spinner no meio da tela. */
export function Loading({ rows = 4, className = "" }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cx("space-y-3 py-2", className)}>
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-3.5 rounded-sm bg-ink/[0.07] motion-safe:animate-pulse"
          style={{ width: `${94 - ((i * 17) % 40)}%` }} />
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
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-2.5 rounded px-3 py-2.5 text-sm", cls, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 text-ink">{title && <strong className="font-semibold">{title} </strong>}{children}</div>
    </div>
  );
}

export function ErrorBox({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  return <Notice tone="error" className={className}>{error instanceof Error ? error.message : String(error)}</Notice>;
}

// ---------- Camadas: folha lateral, diálogo e menu ----------
/**
 * Folha lateral para criar, editar e consultar sem sair da página. No celular sobe de baixo e ocupa a tela.
 * `footer` fica fixo embaixo, sempre visível em formulários longos.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode;
  footer?: ReactNode; width?: "md" | "lg";
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(10_14_28/0.45)] motion-safe:animate-fade-in" />
        <Dialog.Content aria-describedby={undefined}
          className={cx("fixed z-50 flex flex-col bg-sheet shadow-float outline-none",
            "inset-x-0 bottom-0 top-8 rounded-t-lg motion-safe:animate-rise-in",
            "sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-full sm:rounded-none sm:motion-safe:animate-sheet-in",
            width === "lg" ? "sm:max-w-2xl" : "sm:max-w-[30rem]")}>
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="text-lg font-semibold tracking-tight">{title}</Dialog.Title>
              {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
            </div>
            <Dialog.Close asChild><IconButton label="Fechar" icon={X} className="-mr-2 -mt-1" /></Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-5 py-3">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
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

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[rgb(10_14_28/0.45)] motion-safe:animate-fade-in" />
        <Dialog.Content aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2
            overflow-y-auto rounded-md bg-sheet p-5 shadow-float outline-none motion-safe:animate-fade-in">
          <Dialog.Title className="mb-2 text-base font-semibold">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
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

/** Menu de ações de uma linha ("⋯"). Mantém a linha limpa sem esconder o que importa (ações principais ficam fora). */
export function RowMenu({ items, label = "Mais ações" }: { items: MenuItem[]; label?: string }) {
  const visible = items.filter((i) => !i.hidden);
  if (!visible.length) return null;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <IconButton label={label} icon={Ellipsis} onClick={(e) => e.stopPropagation()} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-44 rounded border border-rule bg-sheet p-1 shadow-float motion-safe:animate-fade-in">
          {visible.map((i) => (
            <DropdownMenu.Item key={i.label} onSelect={i.onSelect}
              className={cx("flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 text-sm outline-none",
                "data-[highlighted]:bg-ink/[0.06]", i.danger ? "text-neg" : "text-ink")}>
              {i.icon && <i.icon aria-hidden="true" className="size-4 opacity-80" />}{i.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ---------- Avisos (toasts) ----------
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<{ notify: (text: string, tone?: "ok" | "error") => void }>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const dismiss = (id: number) => setItems((s) => s.filter((t) => t.id !== id));
  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-2), { id, text, tone }]);
    setTimeout(() => dismiss(id), tone === "error" ? 8000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-center gap-2 md:bottom-5 md:left-auto md:right-5 md:items-end">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded bg-ink px-3.5 py-3 text-sm text-paper shadow-float motion-safe:animate-rise-in">
            {t.tone === "ok"
              ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-pos-wash" />
              : <CircleX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-neg-wash" />}
            <span className="flex-1">{t.text}</span>
            <button type="button" aria-label="Dispensar aviso" onClick={() => dismiss(t.id)}
              className={cx("-m-1 rounded p-1 opacity-70 hover:opacity-100", focusRing)}><X className="size-3.5" /></button>
          </div>
        ))}
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

export const th = "h-9 whitespace-nowrap border-b border-rule bg-sunk px-3 text-[12px] font-medium text-ink-soft first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";
export const td = "border-b border-rule/70 px-3 py-2.5 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5";

export const toneOf = (v: Dec) => (toNum(v) > 0 ? "pos" : toNum(v) < 0 ? "neg" : undefined);
