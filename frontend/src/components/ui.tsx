import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { parseDecimal, toNum, type Dec } from "../format";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-500 transition-colors duration-150 hover:border-slate-400 " +
  "focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 " +
  "aria-[invalid=true]:border-red-600 aria-[invalid=true]:focus:ring-red-600/30 " +
  "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 " +
  "dark:hover:border-slate-500 dark:disabled:bg-slate-900";

type BtnVariant = "primary" | "secondary" | "danger" | "ghost" | "danger-ghost";
const btn: Record<BtnVariant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 active:bg-emerald-900",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 " +
    "dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700",
  danger: "bg-red-700 text-white hover:bg-red-800 active:bg-red-900",
  ghost: "text-slate-700 hover:bg-slate-200/60 active:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800",
  // Ação destrutiva discreta (Excluir, Desativar): cor de alerta sem disputar com classes de outra variante.
  "danger-ghost": "text-red-700 hover:bg-red-50 active:bg-red-100 dark:text-red-400 dark:hover:bg-red-950",
};

// Anel de foco único em todo o app (visível no claro e no escuro, só para teclado).
export const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-white dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-950";

/** Classes do botão, também usadas em links que se apresentam como botão (ex.: exportar CSV). */
export const buttonClass = (variant: BtnVariant = "primary", className = "") =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150
  disabled:cursor-not-allowed disabled:opacity-50 ${className.includes("justify-") ? "" : "justify-center"}
  ${focusRing} ${btn[variant]} ${className}`;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return <button type="button" {...props} className={buttonClass(variant, className)} />;
}

export function Card({ title, actions, children, className = "" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-lg bg-white p-4 dark:bg-slate-900 sm:p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

const toneCls = (tone?: "pos" | "neg" | "auto") => tone === "pos" ? "text-emerald-700 dark:text-emerald-400"
  : tone === "neg" ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-50";

/** Indicador. `size="lg"` para os números principais; `plain` dentro de um Card (sem superfície própria). */
export function Stat({ label, value, hint, tone, size = "md", plain }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "pos" | "neg" | "auto"; size?: "md" | "lg"; plain?: boolean;
}) {
  return (
    <div className={plain ? "" : "rounded-lg bg-white p-4 dark:bg-slate-900 sm:p-5"}>
      <div className="text-sm text-slate-600 dark:text-slate-400">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums tracking-tight ${size === "lg" ? "text-3xl" : "text-xl"}
        ${toneCls(tone)}`}>{value}</div>
      {hint && <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{hint}</div>}
    </div>
  );
}

/** Título da página + descrição opcional + ações, igual em todas as telas. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** Escolha única entre poucas opções (ex.: período), com estado anunciado por aria-pressed. */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`min-h-8 rounded-md px-3 text-sm font-medium transition-colors duration-150 ${focusRing} ${value === v
            ? "bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50"
            : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"}`}>{l}</button>
      ))}
    </div>
  );
}

export const toneOf = (v: Dec) => (toNum(v) > 0 ? "pos" : toNum(v) < 0 ? "neg" : undefined);

export function Field({ label, children, hint, className = "" }: {
  label: string; children: ReactNode; hint?: string; className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">{hint}</span>}
    </label>
  );
}

/** Campo monetário em formato brasileiro; o valor guardado é texto e é validado ao enviar. */
export function MoneyInput({ value, onChange, required, allowNegative, ...rest }: {
  value: string; onChange: (v: string) => void; required?: boolean; allowNegative?: boolean; placeholder?: string;
  "aria-label"?: string;
}) {
  const parsed = parseDecimal(value);
  const invalid = value.trim() !== "" && (parsed === null || (!allowNegative && Number(parsed) < 0));
  return (
    <input
      {...rest}
      className={`${inputCls} tabular-nums ${invalid ? "border-red-500" : ""}`}
      inputMode="decimal"
      value={value}
      required={required}
      aria-invalid={invalid}
      placeholder={rest.placeholder ?? "0,00"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
    blue: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">{children}</div>;
}

/** Carregamento com o formato do conteúdo (linhas), sem spinner no meio da tela. */
export function Loading({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-4">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden="true" className="h-4 rounded bg-slate-200 motion-safe:animate-pulse dark:bg-slate-800"
          style={{ width: `${92 - i * 13}%` }} />
      ))}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2
            overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900 ${wide ? "max-w-4xl" : "max-w-lg"}`}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</Dialog.Title>
            <Dialog.Close className={`grid size-9 place-items-center rounded-md text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 ${focusRing}`}
              aria-label="Fechar">✕</Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function FormActions({ onCancel, busy, label = "Salvar" }: { onCancel: () => void; busy?: boolean; label?: string }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" disabled={busy}>{busy ? "Salvando…" : label}</Button>
    </div>
  );
}

// ---------- Avisos (toasts) e confirmação ----------
type Toast = { id: number; text: string; tone: "ok" | "error" };
const ToastCtx = createContext<{ notify: (text: string, tone?: "ok" | "error") => void }>({ notify: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const notify = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, tone }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone === "error" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ notify }}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className={`rounded-md px-4 py-3 text-sm text-white shadow-lg ${t.tone === "ok" ? "bg-emerald-700" : "bg-red-700"}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx).notify;

export function ConfirmDialog({ open, title, message, onConfirm, onClose, busy, confirmLabel = "Excluir" }: {
  open: boolean; title: string; message: ReactNode; onConfirm: () => void; onClose: () => void; busy?: boolean;
  confirmLabel?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Table({ children, minWidth = "min-w-[640px]" }: { children: ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} text-left text-sm`}>{children}</table>
    </div>
  );
}

export const th = "border-b border-slate-200 px-2 py-2 text-[13px] font-medium text-slate-600 dark:border-slate-700 dark:text-slate-400";
export const td = "border-b border-slate-100 px-2 py-2.5 align-top tabular-nums dark:border-slate-800";
