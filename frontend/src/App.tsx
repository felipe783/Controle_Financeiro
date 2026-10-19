import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft, CalendarRange, ChartCandlestick, History, Landmark, LayoutGrid, LogOut, Menu, Moon, Plus, ReceiptText,
  Scale, Search, Sun, Tags, TrendingDown, TrendingUp, Users as UsersIcon, type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { api, ApiError } from "./api";
import { TileMark, TileModule } from "./components/tiles";
import { EntryProvider, useEntry } from "./components/TransactionForms";
import { Button, cx, ErrorBox, Field, focusRing, inputCls, Loading, Notice, Sheet, useToast } from "./components/ui";
import { dur, ease, pageIn, spring } from "./motion";
// Cada página vira um pedaço separado do bundle (os gráficos só carregam onde aparecem).
const Accounts = lazy(() => import("./pages/Accounts"));
const AssetPage = lazy(() => import("./pages/AssetPage"));
const Audit = lazy(() => import("./pages/Audit"));
const Categories = lazy(() => import("./pages/Categories"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Investments = lazy(() => import("./pages/Investments"));
const NetWorth = lazy(() => import("./pages/NetWorth"));
const Planning = lazy(() => import("./pages/Planning"));
const Transactions = lazy(() => import("./pages/Transactions"));
const Users = lazy(() => import("./pages/Users"));
import type { Me } from "./types";

type NavItem = { to: string; label: string; icon: LucideIcon; admin?: boolean };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Dia a dia", items: [
    { to: "/", label: "Visão geral", icon: LayoutGrid },
    { to: "/lancamentos", label: "Lançamentos", icon: ReceiptText },
    { to: "/contas", label: "Contas", icon: Landmark },
  ] },
  { group: "Patrimônio", items: [
    { to: "/investimentos", label: "Investimentos", icon: ChartCandlestick },
    { to: "/patrimonio", label: "Patrimônio", icon: Scale },
    { to: "/planejamento", label: "Planejamento", icon: CalendarRange },
  ] },
  { group: "Ajustes", items: [
    { to: "/categorias", label: "Categorias", icon: Tags },
    { to: "/historico", label: "Histórico", icon: History },
    { to: "/usuarios", label: "Usuários", icon: UsersIcon, admin: true },
  ] },
];
// Atalhos da barra inferior no celular; o resto fica em "Mais".
const TAB_BAR = ["/", "/lancamentos", "/investimentos"];
const isActive = (to: string, path: string) => (to === "/" ? path === "/" : path.startsWith(to));

/** Uma falha de renderização derruba só a página, não o app inteiro (o menu continua para sair dali). */
class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pt-16">
        <Notice tone="error" title="Esta página falhou ao abrir.">
          {this.state.error.message}. Tente recarregar; os dados não foram alterados.
        </Notice>
        <Button className="mt-4" variant="secondary" onClick={() => location.reload()}>Recarregar</Button>
      </div>
    );
  }
}

function Wordmark({ tone = "brand" }: { tone?: "brand" | "rail" }) {
  return (
    <span className="flex items-center gap-2.5">
      <TileMark className="size-7" tone={tone} />
      <span className="display font-figure text-[17px] font-[680] leading-none">Financeiro</span>
    </span>
  );
}

/** Mural decorativo do login: os azulejos se assentam em diagonal, cada um com sua rotação. */
function LoginMural() {
  const cols = 6, rows = 8;
  const rot = [0, 90, 180, 270];
  return (
    <div aria-hidden="true" className="grid h-full w-full gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const seed = (r * 7 + c * 13) % 11;
        return (
          <motion.div key={i} className="overflow-hidden bg-rail-ink"
            initial={{ opacity: 0, rotate: -90, scale: 0.7 }} animate={{ opacity: 1, rotate: 0, scale: 1 }}
            transition={{ delay: 0.15 + (r + c) * 0.045, duration: 0.6, ease: ease.out }}>
            <TileModule a={seed % 3 === 0 ? 0.55 : 1} b={seed % 4 === 0 ? 0.9 : 0} rotate={rot[(r * 3 + c * 5 + seed) % 4]}
              aClass={seed === 5 ? "fill-ocre" : "fill-rail"} bClass="fill-ocre" className="block size-full" />
          </motion.div>
        );
      })}
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<{ has_user: boolean }>("/health") });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/login", { username, password });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex items-center justify-center px-5 py-12">
        <motion.div className="w-full max-w-[23rem]" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: ease.out }}>
          <Wordmark />
          <h1 className="display mt-12 font-figure text-[2.6rem] font-[640] leading-[0.95]">Entrar</h1>
          <p className="mt-3 text-sm text-ink-soft">Suas contas, investimentos e patrimônio, num lugar só.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            {health.data && !health.data.has_user && (
              <Notice tone="warn">Ainda não há usuários. No servidor, rode <code className="font-medium">./scripts/create-admin.sh</code>.</Notice>
            )}
            <Field label="Usuário">
              <input className={inputCls} autoComplete="username" value={username} required autoFocus
                onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Senha">
              <input className={inputCls} type="password" autoComplete="current-password" value={password} required
                onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <ErrorBox error={error} />
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
          </form>
        </motion.div>
      </div>
      <div className="relative hidden overflow-hidden bg-rail p-[3px] lg:block">
        <LoginMural />
      </div>
    </main>
  );
}

/**
 * Troca de tema com a nova paleta se revelando num círculo a partir do botão (View Transitions).
 * Sem suporte ou com movimento reduzido, troca na hora. Só grava quando a pessoa escolhe.
 */
function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  function apply(next: boolean) {
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tema", next ? "escuro" : "claro");
    } catch {
      /* armazenamento indisponível: o tema só não é lembrado */
    }
    setDark(next);
  }
  function toggle(e?: React.MouseEvent) {
    const next = !dark;
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply(next);
    const x = e?.clientX ?? innerWidth / 2, y = e?.clientY ?? 0;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    doc.startViewTransition(() => apply(next)).ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 520, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" });
    }).catch(() => { /* transição pulada pelo navegador: o tema já foi aplicado */ });
  }
  return [dark, toggle] as const;
}

/** Item do trilho: o realce claro desliza entre as páginas (layoutId) em vez de piscar. */
function NavList({ isAdmin, onNavigate, layoutKey }: { isAdmin: boolean; onNavigate?: () => void; layoutKey: string }) {
  const { pathname } = useLocation();
  return (
    <div className="space-y-6">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.admin || isAdmin);
        return (
          <div key={g.group}>
            <div className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-rail-soft">{g.group}</div>
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon }) => {
                const active = isActive(to, pathname);
                return (
                  <li key={to}>
                    <NavLink to={to} end={to === "/"} onClick={onNavigate}
                      className={cx("relative flex min-h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre",
                        active ? "font-semibold text-rail" : "text-rail-ink/80 hover:bg-rail-ink/[0.07] hover:text-rail-ink")}>
                      {active && <motion.span layoutId={`nav-${layoutKey}`} transition={spring.snappy}
                        className="absolute inset-0 rounded-md bg-rail-ink shadow-[0_6px_18px_-8px_rgb(0_0_0/0.5)]" aria-hidden="true" />}
                      <Icon aria-hidden="true" strokeWidth={active ? 2.1 : 1.75}
                        className={cx("relative size-[18px]", active ? "text-anil dark:text-rail" : "text-rail-soft")} />
                      <span className="relative">{label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AccountBlock({ me, dark, toggleTheme, logout, leaving }: {
  me: Me; dark: boolean; toggleTheme: (e?: React.MouseEvent) => void; logout: () => void; leaving: boolean;
}) {
  const btn = "grid size-9 place-items-center rounded-md text-rail-soft transition-colors hover:bg-rail-ink/10 hover:text-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre disabled:opacity-50";
  return (
    <div className="flex items-center gap-1 border-t border-rail-ink/10 pt-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ocre text-[13px] font-semibold uppercase text-ocre-ink">
        {me.username.slice(0, 1)}</span>
      <div className="min-w-0 flex-1 px-1.5">
        <div className="truncate text-sm font-medium text-rail-ink">{me.username}</div>
        <div className="text-xs text-rail-soft">{me.is_admin ? "Administrador" : "Usuário"}</div>
      </div>
      <button type="button" onClick={toggleTheme} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
        title={dark ? "Usar tema claro" : "Usar tema escuro"} className={btn}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={dark ? "sun" : "moon"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }} transition={{ duration: dur.base }}>
            {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </motion.span>
        </AnimatePresence>
      </button>
      <button type="button" onClick={logout} disabled={leaving} aria-label="Sair" title="Sair" className={btn}>
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );
}

type Command = { id: string; label: string; hint?: string; icon: LucideIcon; run: () => void; group: string };

/** Paleta de comandos (Ctrl/⌘ K): ir para qualquer página ou disparar as ações frequentes pelo teclado. */
function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const list = useMemo(() => commands.filter((c) => norm(`${c.label} ${c.group}`).includes(norm(q))), [commands, q]);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && list[sel]) { e.preventDefault(); onClose(); list[sel].run(); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-[rgb(6_10_30/0.45)] backdrop-blur-[3px]" initial={{ opacity: 0 }}
                animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex justify-center px-4 pt-[12vh]">
              <Dialog.Content asChild forceMount aria-describedby={undefined}>
                <motion.div className="pointer-events-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-sheet shadow-float outline-none ring-1 ring-rule"
                  initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, transition: spring.layer }}
                  exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: dur.fast } }}>
                  <Dialog.Title className="sr-only">Ir para ou executar</Dialog.Title>
                  <div className="flex items-center gap-3 border-b border-rule px-4">
                    <Search aria-hidden="true" className="size-[18px] text-ink-faint" />
                    <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key}
                      placeholder="Ir para uma página ou executar uma ação…" aria-label="Buscar comando"
                      role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-activedescendant={list[sel] ? `cmd-${list[sel].id}` : undefined}
                      className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-ink-faint" />
                    <kbd className="rounded border border-rule px-1.5 text-[11px] text-ink-faint">Esc</kbd>
                  </div>
                  <ul ref={listRef} id="cmd-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
                    {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-soft">Nada encontrado para “{q}”.</li>}
                    {list.map((c, i) => (
                      <li key={c.id} id={`cmd-${c.id}`} data-i={i} role="option" aria-selected={i === sel}
                        onMouseMove={() => setSel(i)} onClick={() => { onClose(); c.run(); }}
                        className="relative flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm">
                        {i === sel && <motion.span layoutId="cmd-sel" transition={spring.snappy} className="absolute inset-0 rounded-md bg-anil-wash" aria-hidden="true" />}
                        <c.icon aria-hidden="true" className={cx("relative size-[18px]", i === sel ? "text-anil" : "text-ink-faint")} />
                        <span className="relative flex-1">{c.label}</span>
                        <span className="relative text-xs text-ink-faint">{c.hint ?? c.group}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Shell({ me, logout, leaving }: { me: Me; logout: () => void; leaving: boolean }) {
  const openEntry = useEntry();
  const navigate = useNavigate();
  const [dark, toggleTheme] = useTheme();
  const [more, setMore] = useState(false);
  const [palette, setPalette] = useState(false);
  const location = useLocation();
  // Seção de topo da rota: a transição de página só acontece ao trocar de seção, não ao mudar filtros.
  const section = "/" + (location.pathname.split("/")[1] ?? "");

  // "N" abre o lançamento rápido; Ctrl/⌘ K abre a paleta de comandos (fora de campos de texto e diálogos).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // por cima de uma folha aberta, a paleta poderia trocar o formulário e perder o que foi digitado
        setPalette((p) => (p ? false : !document.querySelector("[role=dialog]")));
        return;
      }
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = e.target;
      if (el instanceof Element && el.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      if (document.querySelector("[role=dialog]")) return;
      e.preventDefault();
      openEntry();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openEntry]);

  const allItems = NAV.flatMap((g) => g.items).filter((i) => !i.admin || me.is_admin);
  const tabs = allItems.filter((i) => TAB_BAR.includes(i.to));
  const inMore = !tabs.some((t) => isActive(t.to, location.pathname));
  const commands: Command[] = [
    { id: "exp", label: "Nova despesa", icon: TrendingDown, group: "Ações", hint: "N", run: () => openEntry({ kind: "expense" }) },
    { id: "inc", label: "Nova receita", icon: TrendingUp, group: "Ações", run: () => openEntry({ kind: "income" }) },
    { id: "trf", label: "Nova transferência", icon: ArrowRightLeft, group: "Ações", run: () => openEntry({ kind: "transfer" }) },
    { id: "late", label: "Ver contas atrasadas", icon: ReceiptText, group: "Ações", run: () => navigate("/lancamentos?overdue=1") },
    ...allItems.map((i) => ({ id: i.to, label: i.label, icon: i.icon, group: "Ir para", run: () => navigate(i.to) })),
    { id: "theme", label: dark ? "Usar tema claro" : "Usar tema escuro", icon: dark ? Sun : Moon, group: "Preferências", run: () => toggleTheme() },
    { id: "out", label: "Sair", icon: LogOut, group: "Conta", run: logout },
  ];

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded
        focus:bg-sheet focus:px-3 focus:py-2 focus:shadow-float">Pular para o conteúdo</a>

      {/* Desktop: trilho cobalto — o azul do azulejo é a moldura do produto. */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-hidden bg-rail px-3 py-5 text-rail-ink md:flex">
        <div className="px-3"><Wordmark tone="rail" /></div>
        <div className="space-y-2">
          <Button variant="accent" icon={Plus} onClick={() => openEntry()} className="w-full justify-start" title="Atalho: tecla N">
            Novo lançamento<kbd className="ml-auto rounded-sm border border-ocre-ink/25 px-1 text-[11px] font-normal opacity-70">N</kbd>
          </Button>
          <button type="button" onClick={() => setPalette(true)}
            className="flex min-h-9 w-full items-center gap-2.5 rounded-md border border-rail-ink/15 px-3 text-left text-[13px] text-rail-soft transition-colors hover:border-rail-ink/30 hover:text-rail-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre">
            <Search aria-hidden="true" className="size-4" />Ir para…<kbd className="ml-auto text-[11px] opacity-70">Ctrl K</kbd>
          </button>
        </div>
        <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto">
          <NavList isAdmin={me.is_admin} layoutKey="rail" />
        </nav>
        <AccountBlock me={me} dark={dark} toggleTheme={toggleTheme} logout={logout} leaving={leaving} />
      </aside>

      {/* Celular: barra superior enxuta, também em cobalto */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-rail px-4 text-rail-ink md:hidden">
        <Wordmark tone="rail" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPalette(true)} aria-label="Ir para ou executar"
            className="grid size-10 place-items-center rounded-md text-rail-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre">
            <Search className="size-5" /></button>
          <button type="button" onClick={toggleTheme} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
            className="grid size-10 place-items-center rounded-md text-rail-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ocre">
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </header>

      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-[1360px] px-4 pb-28 pt-4 sm:px-6 md:px-8 md:pb-14 md:pt-5">
        <Suspense fallback={<div className="pt-16"><Loading rows={8} /></div>}>
          <motion.div key={section} variants={pageIn} initial="initial" animate="animate">
            <PageBoundary key={location.pathname}>
            <Routes location={location}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/lancamentos" element={<Transactions />} />
              <Route path="/contas" element={<Accounts />} />
              <Route path="/investimentos" element={<Investments />} />
              <Route path="/investimentos/:id" element={<AssetPage />} />
              <Route path="/patrimonio" element={<NetWorth />} />
              <Route path="/planejamento/*" element={<Planning />} />
              <Route path="/categorias" element={<Categories />} />
              <Route path="/historico" element={<Audit />} />
              <Route path="/cadastros" element={<Navigate to="/categorias" replace />} />
              <Route path="/usuarios" element={me.is_admin ? <Users me={me} /> : <Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </PageBoundary>
          </motion.div>
        </Suspense>
      </main>

      {/* Celular: barra inferior com o botão de lançar no centro, ao alcance do polegar */}
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <ul className="grid grid-cols-5">
          {tabs.slice(0, 2).map((t) => <TabLink key={t.to} item={t} />)}
          <li className="grid place-items-center">
            <motion.button type="button" onClick={() => openEntry()} aria-label="Novo lançamento" whileTap={{ scale: 0.9, rotate: 90 }}
              className={cx("-mt-5 grid size-14 place-items-center rounded-2xl bg-ocre text-ocre-ink shadow-float", focusRing)}>
              <Plus className="size-6" strokeWidth={2.4} />
            </motion.button>
          </li>
          {tabs.slice(2).map((t) => <TabLink key={t.to} item={t} />)}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-expanded={more}
              className={cx("relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px]", focusRing,
                inMore ? "font-semibold text-anil" : "text-ink-soft")}>
              {inMore && <motion.span layoutId="tab-ind" transition={spring.snappy} className="absolute top-0 h-[3px] w-8 rounded-b-full bg-anil" />}
              <Menu className="size-5" strokeWidth={inMore ? 2.1 : 1.75} aria-hidden="true" />Mais
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <nav aria-label="Todas as páginas" className="-mx-5 -mb-5 space-y-6 bg-rail px-5 py-5">
          <NavList isAdmin={me.is_admin} onNavigate={() => setMore(false)} layoutKey="sheet" />
          <AccountBlock me={me} dark={dark} toggleTheme={toggleTheme} logout={logout} leaving={leaving} />
        </nav>
      </Sheet>
      <CommandPalette open={palette} onClose={() => setPalette(false)} commands={commands} />
    </div>
  );
}

function TabLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <li>
      <NavLink to={to} end={to === "/"} className={({ isActive }) => cx(
        "relative flex h-16 flex-col items-center justify-center gap-1 text-[11px]", focusRing,
        isActive ? "font-semibold text-anil" : "text-ink-soft")}>
        {({ isActive }) => <>
          {isActive && <motion.span layoutId="tab-ind" transition={spring.snappy} className="absolute top-0 h-[3px] w-8 rounded-b-full bg-anil" />}
          <Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.1 : 1.75} />{label}
        </>}
      </NavLink>
    </li>
  );
}

export default function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), retry: false });
  const [leaving, setLeaving] = useState(false);

  // Zera a query "me" que este componente observa (qc.clear() a descartaria sem re-renderizar a tela)
  // e apaga os dados financeiros em cache, para nada do usuário anterior continuar visível.
  function endSession() {
    // Sem sessão anterior (ex.: abrir /lancamentos já deslogado), mantém a URL para voltar a ela após entrar.
    const hadSession = !!qc.getQueryData(["me"]);
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    if (hadSession) navigate("/", { replace: true });
  }

  useEffect(() => {
    window.addEventListener("auth:expired", endSession);
    return () => window.removeEventListener("auth:expired", endSession);
  });

  if (me.isLoading) return <div className="grid min-h-dvh place-items-center"><TileMark className="size-10 animate-pulse" /></div>;
  if (!me.data) return <Login onDone={() => { qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" }); me.refetch(); }} />;

  async function logout() {
    setLeaving(true);
    try {
      await api.post("/auth/logout");
    } catch (err) {
      // 401 = a sessão já tinha expirado; qualquer outra falha deixa a sessão aberta no servidor.
      if (!(err instanceof ApiError && err.status === 401)) {
        setLeaving(false);
        notify(`Não foi possível sair: ${err instanceof Error ? err.message : "erro desconhecido"}`, "error");
        return;
      }
    }
    setLeaving(false);
    endSession();
  }

  return (
    <EntryProvider>
      <Shell me={me.data} logout={logout} leaving={leaving} />
    </EntryProvider>
  );
}
