import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { parseDecimal, toNum, type Dec } from "../format";

export const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm " +
  "focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 " +
  "disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";

type BtnVariant = "primary" | "secondary" | "danger" | "ghost";
const btn: Record<BtnVariant, string> = {
  primary: "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 " +
    "dark:text-slate-100 dark:hover:bg-slate-700",
  danger: "bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-600",
  ghost: "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-sm font-medium
        focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50
        ${btn[variant]} ${className}`}
    />
  );
}

export function Card({ title, actions, children, className = "" }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700
      dark:bg-slate-900 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: "pos" | "neg" | "auto"; raw?: Dec;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${tone === "pos" ? "text-emerald-700 dark:text-emerald-400"
        : tone === "neg" ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-50"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
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
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
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
  return <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">{children}</div>;
}

export function Loading() {
  return <div role="status" className="py-8 text-center text-sm text-slate-500">Carregando…</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800
      dark:border-red-800 dark:bg-red-950 dark:text-red-200">
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
            <Dialog.Close className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
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

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export const th = "border-b border-slate-200 px-2 py-2 text-xs font-semibold uppercase text-slate-500 dark:border-slate-700";
export const td = "border-b border-slate-100 px-2 py-2 align-top dark:border-slate-800";
