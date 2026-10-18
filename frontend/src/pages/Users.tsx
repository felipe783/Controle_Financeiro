import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorBox, Field, inputCls, Loading, Table, td, th } from "../components/ui";
import { dateTime } from "../format";
import { useSave } from "../hooks";
import type { Me, UserRow } from "../types";

// Mesmas regras do backend (auth.USERNAME_RE e validate_new_password); o servidor revalida tudo.
const USERNAME = /^[A-Za-z0-9._-]{3,64}$/;

function passwordProblem(password: string, username: string): string | null {
  if (password.length < 12) return "A senha deve ter pelo menos 12 caracteres.";
  if (password.toLowerCase() === username.toLowerCase() || new Set(password).size < 5) return "Senha fraca demais.";
  return null;
}

export default function Users({ me }: { me: Me }) {
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });
  const [pending, setPending] = useState<{ user: UserRow; change: { is_admin: boolean; is_active: boolean }; label: string } | null>(null);
  const update = useSave((p: NonNullable<typeof pending>) => api.put(`/users/${p.user.id}`, p.change),
    "Usuário atualizado.", () => setPending(null));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Todos os usuários veem e editam os mesmos dados financeiros. Administradores também gerenciam usuários.
        </p>
      </div>
      <Card title="Novo usuário"><NewUserForm /></Card>
      <Card title="Usuários cadastrados">
        <ErrorBox error={users.error} />
        {users.isLoading ? <Loading /> : !users.data?.length ? <Empty>Nenhum usuário.</Empty> : (
          <Table>
            <thead><tr><th className={th}>Usuário</th><th className={th}>Papel</th><th className={th}>Situação</th>
              <th className={th}>Criado em</th><th className={th}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{users.data.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.is_active ? "" : "opacity-60"}>
                  <td className={td}><span className="font-medium">{u.username}</span>{self && <span className="text-slate-500"> (você)</span>}</td>
                  <td className={td}><Badge tone={u.is_admin ? "blue" : "slate"}>{u.is_admin ? "Administrador" : "Usuário"}</Badge></td>
                  <td className={td}><Badge tone={u.is_active ? "green" : "red"}>{u.is_active ? "Ativo" : "Desativado"}</Badge></td>
                  <td className={td}>{dateTime(u.created_at)}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>{!self && <>
                    <Button variant="ghost" onClick={() => setPending({ user: u, label: u.is_admin ? "Remover administrador" : "Tornar administrador",
                      change: { is_admin: !u.is_admin, is_active: u.is_active } })}>
                      {u.is_admin ? "Remover admin" : "Tornar admin"}</Button>
                    <Button variant="ghost" className={u.is_active ? "text-red-700 dark:text-red-400" : ""}
                      onClick={() => setPending({ user: u, label: u.is_active ? "Desativar" : "Reativar",
                        change: { is_admin: u.is_admin, is_active: !u.is_active } })}>
                      {u.is_active ? "Desativar" : "Reativar"}</Button></>}</td>
                </tr>
              );
            })}</tbody>
          </Table>
        )}
      </Card>
      <ConfirmDialog open={!!pending} title={`${pending?.label ?? ""}: ${pending?.user.username ?? ""}`}
        confirmLabel={pending?.label ?? "Confirmar"} busy={update.isPending} onClose={() => setPending(null)}
        onConfirm={() => pending && update.mutate(pending)}
        message={pending && !pending.change.is_active
          ? "O usuário não poderá mais entrar e as sessões abertas serão encerradas imediatamente."
          : "A alteração vale a partir do próximo acesso do usuário."} />
    </div>
  );
}

function NewUserForm() {
  const empty = { username: "", password: "", confirm: "", is_admin: false };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const create = useSave((b: unknown) => api.post("/users", b), "Usuário criado.", () => setF(empty));

  function submit(e: FormEvent) {
    e.preventDefault();
    const username = f.username.trim();
    if (!USERNAME.test(username)) return setError("Use de 3 a 64 letras, números, ponto, hífen ou sublinhado, sem espaços.");
    const problem = passwordProblem(f.password, username);
    if (problem) return setError(problem);
    if (f.password !== f.confirm) return setError("As senhas não conferem.");
    setError(null);
    create.mutate({ username, password: f.password, is_admin: f.is_admin });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" noValidate>
      <Field label="Nome de usuário" hint="3 a 64 caracteres: letras, números, . - _">
        <input className={inputCls} value={f.username} autoComplete="off" required maxLength={64}
          onChange={(e) => setF({ ...f, username: e.target.value })} />
      </Field>
      <Field label="Senha" hint="Mínimo de 12 caracteres.">
        <input className={inputCls} type="password" autoComplete="new-password" value={f.password} required
          minLength={12} maxLength={256} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
      <Field label="Confirmar senha">
        <input className={inputCls} type="password" autoComplete="new-password" value={f.confirm} required
          onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      </Field>
      <div className="flex flex-col justify-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.is_admin} onChange={(e) => setF({ ...f, is_admin: e.target.checked })} />
          Administrador
        </label>
        <Button type="submit" disabled={create.isPending}>{create.isPending ? "Criando…" : "Criar usuário"}</Button>
      </div>
      <div className="sm:col-span-2 lg:col-span-4"><ErrorBox error={error} /></div>
    </form>
  );
}
