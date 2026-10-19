import { useQuery } from "@tanstack/react-query";
import { Plus, ShieldCheck, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import {
  Button, Check, ConfirmDialog, cx, Empty, ErrorBox, Field, inputCls, Loading, PageHeader, RowMenu, Sheet, SheetActions,
  Status, Table, Tag, td, th,
} from "../components/ui";
import { dateTime } from "../format";
import { useSave } from "../hooks";
import type { Me, UserRow } from "../types";

// Mesmas regras do backend (auth.USERNAME_RE e validate_new_password); o servidor revalida tudo.
const USERNAME = /^[A-Za-z0-9._-]{3,64}$/;

function passwordProblem(password: string, username: string): string | null {
  if (password.length < 12) return "A senha deve ter pelo menos 12 caracteres.";
  if (password.toLowerCase() === username.toLowerCase() || new Set(password).size < 5) return "Senha fraca demais: varie mais os caracteres.";
  return null;
}

type Pending = { user: UserRow; change: { is_admin: boolean; is_active: boolean }; label: string };

export default function Users({ me }: { me: Me }) {
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const update = useSave((p: Pending) => api.put(`/users/${p.user.id}`, p.change), "Usuário atualizado.", () => setPending(null));

  return (
    <div>
      <PageHeader title="Usuários"
        context="Cada pessoa tem dados financeiros próprios, que ninguém mais vê, nem o administrador. Aqui você só gerencia os acessos."
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>Novo usuário</Button>} />
      <ErrorBox error={users.error} className="mb-4" />
      <div className="rounded-md border border-rule bg-sheet">
        {users.isLoading ? <div className="p-5"><Loading /></div> : !users.data?.length ? <Empty>Nenhum usuário.</Empty> : (
          <Table minWidth="min-w-0">
            <thead><tr><th className={th}>Usuário</th><th className={cx(th, "hidden sm:table-cell")}>Situação</th>
              <th className={cx(th, "hidden md:table-cell")}>Criado em</th><th className={cx(th, "w-12")}><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>{users.data.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className={u.is_active ? "" : "opacity-70"}>
                  <td className={td}>
                    <div className="flex items-center gap-2"><span className="font-medium">{u.username}</span>
                      {u.is_admin && <Tag>Administrador</Tag>}{self && <span className="text-xs text-ink-soft">você</span>}</div>
                    <div className="sm:hidden"><Status tone={u.is_active ? "pos" : "neg"}>{u.is_active ? "Ativo" : "Desativado"}</Status></div>
                  </td>
                  <td className={cx(td, "hidden sm:table-cell")}><Status tone={u.is_active ? "pos" : "neg"}>{u.is_active ? "Ativo" : "Desativado"}</Status></td>
                  <td className={cx(td, "num hidden text-ink-soft md:table-cell")}>{dateTime(u.created_at)}</td>
                  <td className={cx(td, "text-right")}>{!self && <RowMenu label={`Ações de ${u.username}`} items={[
                    { label: u.is_admin ? "Remover administrador" : "Tornar administrador", icon: u.is_admin ? ShieldOff : ShieldCheck,
                      onSelect: () => setPending({ user: u, label: u.is_admin ? "Remover administrador" : "Tornar administrador",
                        change: { is_admin: !u.is_admin, is_active: u.is_active } }) },
                    { label: u.is_active ? "Desativar acesso" : "Reativar acesso", icon: u.is_active ? UserX : UserCheck, danger: u.is_active,
                      onSelect: () => setPending({ user: u, label: u.is_active ? "Desativar acesso" : "Reativar acesso",
                        change: { is_admin: u.is_admin, is_active: !u.is_active } }) },
                  ]} />}</td>
                </tr>
              );
            })}</tbody>
          </Table>
        )}
      </div>
      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo usuário"
        footer={<SheetActions form="user-form" label="Criar usuário" busyLabel="Criando…" onCancel={() => setCreating(false)} />}>
        {creating && <NewUserForm onDone={() => setCreating(false)} />}
      </Sheet>
      <ConfirmDialog open={!!pending} title={`${pending?.label ?? ""}: ${pending?.user.username ?? ""}`}
        confirmLabel={pending?.label ?? "Confirmar"} tone={pending && !pending.change.is_active ? "danger" : "primary"}
        busy={update.isPending} onClose={() => setPending(null)} onConfirm={() => pending && update.mutate(pending)}
        message={pending && !pending.change.is_active
          ? "A pessoa não consegue mais entrar e as sessões abertas dela terminam na hora."
          : "A mudança vale a partir da próxima ação dessa pessoa."} />
    </div>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ username: "", password: "", confirm: "", is_admin: false });
  const [error, setError] = useState<string | null>(null);
  const create = useSave((b: unknown) => api.post("/users", b), "Usuário criado.", onDone);

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
    <form id="user-form" onSubmit={submit} className="grid gap-4" noValidate>
      <Field label="Nome de usuário" hint="3 a 64 caracteres: letras, números, . - _">
        <input className={inputCls} value={f.username} autoComplete="off" required maxLength={64} autoFocus
          onChange={(e) => setF({ ...f, username: e.target.value })} />
      </Field>
      <Field label="Senha" hint="Pelo menos 12 caracteres.">
        <input className={inputCls} type="password" autoComplete="new-password" value={f.password} required
          minLength={12} maxLength={256} onChange={(e) => setF({ ...f, password: e.target.value })} />
      </Field>
      <Field label="Repita a senha">
        <input className={inputCls} type="password" autoComplete="new-password" value={f.confirm} required
          onChange={(e) => setF({ ...f, confirm: e.target.value })} />
      </Field>
      <Check checked={f.is_admin} onChange={(v) => setF({ ...f, is_admin: v })}>Administrador (pode gerenciar acessos)</Check>
      <ErrorBox error={error} />
    </form>
  );
}
