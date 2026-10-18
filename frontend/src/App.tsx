import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError } from "./api";
import { Button, ErrorBox, Field, focusRing, inputCls, Loading, useToast } from "./components/ui";
import Accounts from "./pages/Accounts";
import Dashboard from "./pages/Dashboard";
import Investments from "./pages/Investments";
import NetWorth from "./pages/NetWorth";
import Planning from "./pages/Planning";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";
import Users from "./pages/Users";
import type { Me } from "./types";

const NAV = [
  ["/", "Painel"],
  ["/lancamentos", "Lançamentos"],
  ["/contas", "Contas"],
  ["/investimentos", "Investimentos"],
  ["/patrimonio", "Patrimônio"],
  ["/planejamento", "Planejamento"],
  ["/cadastros", "Cadastros"],
] as const;

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
    <main className="flex min-h-dvh items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 dark:bg-slate-900 sm:p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">Financeiro</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Entre para ver suas contas e seu patrimônio.</p>
        </div>
        {health.data && !health.data.has_user && (
          <div role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Nenhum usuário cadastrado. No servidor, execute <code>./scripts/create-admin.sh</code>.
          </div>
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
    </main>
  );
}

const navItem = `flex min-h-10 w-full items-center rounded-md px-3 text-sm font-medium transition-colors duration-150 ${focusRing}`;
const navIdle = "text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50";

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("tema", dark ? "escuro" : "claro");
    } catch {
      /* armazenamento indisponível: o tema só não é lembrado */
    }
  }, [dark]);
  return (
    <button type="button" onClick={() => setDark(!dark)} aria-pressed={dark} className={`${navItem} ${navIdle}`}>
      {dark ? "Usar tema claro" : "Usar tema escuro"}
    </button>
  );
}

export default function App() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const notify = useToast();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<Me>("/auth/me"), retry: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Zera a query "me" que este componente observa (qc.clear() a descartaria sem re-renderizar a tela)
  // e apaga os dados financeiros em cache, para nada do usuário anterior continuar visível.
  function endSession() {
    // Sem sessão anterior (ex.: abrir /lancamentos já deslogado), mantém a URL para voltar a ela após entrar.
    const hadSession = !!qc.getQueryData(["me"]);
    qc.setQueryData(["me"], null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
    setMenuOpen(false);
    if (hadSession) navigate("/", { replace: true });
  }

  useEffect(() => {
    window.addEventListener("auth:expired", endSession);
    return () => window.removeEventListener("auth:expired", endSession);
  });

  if (me.isLoading) return <Loading />;
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
    <div className="min-h-dvh md:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50
        focus:rounded focus:bg-white focus:px-3 focus:py-2 dark:focus:bg-slate-900">Pular para o conteúdo</a>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-slate-50 px-4 py-2 dark:bg-slate-900 md:hidden">
        <span className="text-base font-semibold tracking-tight">Financeiro</span>
        <Button variant="secondary" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}
          aria-controls="menu">{menuOpen ? "Fechar" : "Menu"}</Button>
      </header>
      {/* Segundo neutro para a navegação: separa do conteúdo pelo tom, sem borda. */}
      <nav id="menu" aria-label="Principal"
        className={`${menuOpen ? "flex" : "hidden"} w-full shrink-0 flex-col bg-slate-50 p-3 dark:bg-slate-900
          md:sticky md:top-0 md:flex md:h-dvh md:w-60`}>
        <div className="mb-6 hidden px-3 pt-2 text-lg font-semibold tracking-tight md:block">Financeiro</div>
        <ul className="space-y-0.5">
          {[...NAV, ...(me.data.is_admin ? [["/usuarios", "Usuários"] as const] : [])].map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} end={to === "/"} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `${navItem} ${isActive
                  ? "bg-emerald-100/70 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : navIdle}`}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-0.5 md:mt-auto">
          <div className="px-3 pb-2 text-sm">
            <div className="truncate font-medium text-slate-900 dark:text-slate-50">{me.data.username}</div>
            <div className="text-slate-600 dark:text-slate-400">{me.data.is_admin ? "Administrador" : "Usuário"}</div>
          </div>
          <ThemeToggle />
          <button type="button" onClick={logout} disabled={leaving}
            className={`${navItem} ${navIdle} disabled:cursor-wait disabled:opacity-60`}>
            {leaving ? "Saindo…" : "Sair"}</button>
        </div>
      </nav>
      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 p-4 md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lancamentos" element={<Transactions />} />
          <Route path="/contas" element={<Accounts />} />
          <Route path="/investimentos" element={<Investments />} />
          <Route path="/patrimonio" element={<NetWorth />} />
          <Route path="/planejamento" element={<Planning />} />
          <Route path="/cadastros" element={<Settings />} />
          <Route path="/usuarios" element={me.data.is_admin ? <Users me={me.data} /> : <Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
