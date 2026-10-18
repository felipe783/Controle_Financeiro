import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { Button, ErrorBox, Field, inputCls, Loading } from "./components/ui";
import Accounts from "./pages/Accounts";
import Dashboard from "./pages/Dashboard";
import Investments from "./pages/Investments";
import NetWorth from "./pages/NetWorth";
import Planning from "./pages/Planning";
import Settings from "./pages/Settings";
import Transactions from "./pages/Transactions";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-6 shadow dark:bg-slate-900">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Financeiro Pessoal</h1>
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
    <Button variant="ghost" onClick={() => setDark(!dark)} aria-pressed={dark} className="w-full justify-start">
      {dark ? "Tema claro" : "Tema escuro"}
    </Button>
  );
}

export default function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.get<{ username: string }>("/auth/me"), retry: false });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const expired = () => qc.setQueryData(["me"], null);
    window.addEventListener("auth:expired", expired);
    return () => window.removeEventListener("auth:expired", expired);
  }, [qc]);

  if (me.isLoading) return <Loading />;
  if (!me.data) return <Login onDone={() => { qc.clear(); me.refetch(); }} />;

  async function logout() {
    await api.post("/auth/logout").catch(() => undefined);
    qc.clear();
    qc.setQueryData(["me"], null);
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:flex">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50
        focus:rounded focus:bg-white focus:px-3 focus:py-2">Pular para o conteúdo</a>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3
        dark:border-slate-800 dark:bg-slate-900 md:hidden">
        <span className="font-semibold">Financeiro</span>
        <Button variant="secondary" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}
          aria-controls="menu">Menu</Button>
      </header>
      <nav id="menu" aria-label="Principal"
        className={`${menuOpen ? "block" : "hidden"} w-full shrink-0 border-r border-slate-200 bg-white p-3
          dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-0 md:block md:h-screen md:w-56`}>
        <div className="mb-4 hidden px-2 text-lg font-semibold md:block">Financeiro</div>
        <ul className="space-y-1">
          {NAV.map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} end={to === "/"} onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `block rounded-md px-3 py-2 text-sm font-medium ${isActive
                  ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-1 border-t border-slate-200 pt-3 dark:border-slate-800">
          <ThemeToggle />
          <Button variant="ghost" onClick={logout} className="w-full justify-start">Sair ({me.data.username})</Button>
        </div>
      </nav>
      <main id="conteudo" className="min-w-0 flex-1 p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lancamentos" element={<Transactions />} />
          <Route path="/contas" element={<Accounts />} />
          <Route path="/investimentos" element={<Investments />} />
          <Route path="/patrimonio" element={<NetWorth />} />
          <Route path="/planejamento" element={<Planning />} />
          <Route path="/cadastros" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
