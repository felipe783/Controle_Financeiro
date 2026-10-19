import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarRange, ChartCandlestick, History, Landmark, LayoutGrid, LogOut, Menu, Moon, Plus, ReceiptText, Scale, Sun,
  Tags, Users as UsersIcon, type LucideIcon,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { EntryProvider, useEntry } from "./components/TransactionForms";
import { Button, cx, ErrorBox, Field, focusRing, inputCls, Loading, Notice, Sheet, useToast } from "./components/ui";
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

/** Marca: uma folha de caderneta com as linhas de lançamento. */
function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <rect x="3" y="2.5" width="18" height="19" rx="2.5" className="fill-anil" />
      <path d="M7 8h10M7 12h10M7 16h6" className="stroke-anil-ink" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <Mark className="size-6" />Financeiro
    </span>
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
    <main className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-[22rem]">
        <Wordmark />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-1 text-sm text-ink-soft">Suas contas, investimentos e patrimônio, num lugar só.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
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
      </div>
    </main>
  );
}

// Grava a escolha só quando a pessoa troca o tema: sem escolha, continua valendo o tema do sistema.
function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tema", next ? "escuro" : "claro");
    } catch {
      /* armazenamento indisponível: o tema só não é lembrado */
    }
    setDark(next);
  }
  return [dark, toggle] as const;
}

const navLink = (active: boolean) => cx(
  "group flex min-h-9 items-center gap-2.5 rounded px-2.5 text-sm transition-colors duration-150", focusRing,
  active ? "bg-sheet font-semibold text-ink shadow-sheet ring-1 ring-rule" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink",
);

function NavList({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  return (
    <div className="space-y-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => !i.admin || isAdmin);
        return (
          <div key={g.group}>
            <div className="mb-1 px-2.5 text-xs text-ink-faint">{g.group}</div>
            <ul className="space-y-0.5">
              {items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink to={to} end={to === "/"} onClick={onNavigate} className={({ isActive }) => navLink(isActive)}>
                    {({ isActive }) => <>
                      <Icon aria-hidden="true" strokeWidth={isActive ? 2.1 : 1.75}
                        className={cx("size-[18px]", isActive ? "text-anil" : "text-ink-faint group-hover:text-ink-soft")} />
                      {label}
                    </>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AccountBlock({ me, dark, toggleTheme, logout, leaving }: {
  me: Me; dark: boolean; toggleTheme: () => void; logout: () => void; leaving: boolean;
}) {
  return (
    <div className="flex items-center gap-1 border-t border-rule pt-3">
      <div className="min-w-0 flex-1 px-2.5">
        <div className="truncate text-sm font-medium">{me.username}</div>
        <div className="text-xs text-ink-soft">{me.is_admin ? "Administrador" : "Usuário"}</div>
      </div>
      <button type="button" onClick={toggleTheme} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
        title={dark ? "Usar tema claro" : "Usar tema escuro"}
        className={cx("grid size-9 place-items-center rounded text-ink-soft hover:bg-ink/[0.06] hover:text-ink", focusRing)}>
        {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
      </button>
      <button type="button" onClick={logout} disabled={leaving} aria-label="Sair" title="Sair"
        className={cx("grid size-9 place-items-center rounded text-ink-soft hover:bg-ink/[0.06] hover:text-ink disabled:opacity-50", focusRing)}>
        <LogOut className="size-[18px]" />
      </button>
    </div>
  );
}

function Shell({ me, logout, leaving }: { me: Me; logout: () => void; leaving: boolean }) {
  const openEntry = useEntry();
  const [dark, toggleTheme] = useTheme();
  const [more, setMore] = useState(false);
  const location = useLocation();

  // "N" abre o lançamento rápido de qualquer tela (fora de campos de texto e diálogos).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
  const inMore = !tabs.some((t) => (t.to === "/" ? location.pathname === "/" : location.pathname.startsWith(t.to)));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[15rem_1fr]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded
        focus:bg-sheet focus:px-3 focus:py-2 focus:shadow-float">Pular para o conteúdo</a>

      {/* Desktop: trilho de navegação no mesmo papel da página; a página ativa vira uma "folha" destacada. */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-rule px-3 py-4 md:flex">
        <div className="px-2.5 pt-1"><Wordmark /></div>
        <Button icon={Plus} onClick={() => openEntry()} className="w-full justify-start"
          title="Atalho: tecla N">Novo lançamento<kbd className="ml-auto rounded-sm border border-anil-ink/30 px-1 text-[11px] font-normal opacity-80">N</kbd></Button>
        <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto">
          <NavList isAdmin={me.is_admin} />
        </nav>
        <AccountBlock me={me} dark={dark} toggleTheme={toggleTheme} logout={logout} leaving={leaving} />
      </aside>

      {/* Celular: barra superior enxuta */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper/95 px-4 backdrop-blur md:hidden">
        <Wordmark />
        <button type="button" onClick={toggleTheme} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
          className={cx("grid size-10 place-items-center rounded text-ink-soft", focusRing)}>
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
      </header>

      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-[1320px] px-4 pb-28 pt-5 sm:px-6 md:px-8 md:pb-12 md:pt-7">
        <Suspense fallback={<Loading rows={8} />}>
        <Routes>
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
        </Suspense>
      </main>

      {/* Celular: barra inferior com o botão de lançar no centro, ao alcance do polegar */}
      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {tabs.slice(0, 2).map((t) => <TabLink key={t.to} item={t} />)}
          <li className="grid place-items-center">
            <button type="button" onClick={() => openEntry()} aria-label="Novo lançamento"
              className={cx("grid size-12 place-items-center rounded-full bg-anil text-anil-ink shadow-float", focusRing)}>
              <Plus className="size-6" strokeWidth={2.2} />
            </button>
          </li>
          {tabs.slice(2).map((t) => <TabLink key={t.to} item={t} />)}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-expanded={more}
              className={cx("flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px]", focusRing,
                inMore ? "font-semibold text-anil" : "text-ink-soft")}>
              <Menu className="size-5" strokeWidth={inMore ? 2.1 : 1.75} aria-hidden="true" />Mais
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="Menu">
        <nav aria-label="Todas as páginas" className="space-y-6">
          <NavList isAdmin={me.is_admin} onNavigate={() => setMore(false)} />
          <AccountBlock me={me} dark={dark} toggleTheme={toggleTheme} logout={logout} leaving={leaving} />
        </nav>
      </Sheet>
    </div>
  );
}

function TabLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <li>
      <NavLink to={to} end={to === "/"} className={({ isActive }) => cx(
        "flex h-16 flex-col items-center justify-center gap-1 text-[11px]", focusRing,
        isActive ? "font-semibold text-anil" : "text-ink-soft")}>
        {({ isActive }) => <><Icon aria-hidden="true" className="size-5" strokeWidth={isActive ? 2.1 : 1.75} />{label}</>}
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

  if (me.isLoading) return <div className="mx-auto max-w-md p-8"><Loading /></div>;
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
