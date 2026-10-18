import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Badge, Button, Card, ConfirmDialog, Empty, Field, inputCls, Table, td, th } from "../components/ui";
import { dateTime } from "../format";
import { useCategories, useSave } from "../hooks";
import type { Category } from "../types";

const ACTIONS: Record<string, string> = { create: "Criação", update: "Alteração", delete: "Exclusão",
  reconcile: "Conciliação", stop: "Encerramento", manual: "Manual" };

export default function Settings() {
  const cats = useCategories();
  const [f, setF] = useState({ name: "", kind: "expense", parent_id: "" });
  const [del, setDel] = useState<Category | null>(null);
  const create = useSave((b: unknown) => api.post("/categories", b), "Categoria criada.",
    () => setF({ ...f, name: "" }));
  const toggle = useSave((c: Category) => api.put(`/categories/${c.id}`, { ...c, archived: !c.archived }),
    "Categoria atualizada.");
  const remove = useSave((c: Category) => api.del(`/categories/${c.id}`), "Categoria excluída.", () => setDel(null));
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.get<{ id: number; at: string; entity: string;
    entity_id: number | null; action: string }[]>("/audit", { limit: 100 }) });
  const list = cats.data ?? [];
  const parents = list.filter((c) => c.parent_id === null && c.kind === f.kind);
  const name = (id: number | null) => list.find((c) => c.id === id)?.name;

  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate({ name: f.name, kind: f.kind, parent_id: f.parent_id ? Number(f.parent_id) : null });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cadastros</h1>
      <Card title="Categorias">
        <form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-4">
          <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={80}
            onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Tipo"><select className={inputCls} value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value, parent_id: "" })}>
            <option value="expense">Despesa</option><option value="income">Receita</option></select></Field>
          <Field label="Subcategoria de"><select className={inputCls} value={f.parent_id}
            onChange={(e) => setF({ ...f, parent_id: e.target.value })}><option value="">— (principal)</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <div className="flex items-end"><Button type="submit">Adicionar</Button></div>
        </form>
        <Table>
          <thead><tr><th className={th}>Categoria</th><th className={th}>Tipo</th><th className={th}>Situação</th>
            <th className={th}><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{list.map((c) => (
            <tr key={c.id} className={c.archived ? "opacity-60" : ""}>
              <td className={td}>{c.parent_id ? `${name(c.parent_id)} › ${c.name}` : c.name}
                {c.is_system && <> <Badge tone="blue">Sistema</Badge></>}</td>
              <td className={td}>{c.kind === "income" ? "Receita" : "Despesa"}</td>
              <td className={td}>{c.archived ? "Arquivada" : "Ativa"}</td>
              <td className={`${td} text-right`}>{!c.is_system && <>
                <Button variant="ghost" onClick={() => toggle.mutate(c)}>{c.archived ? "Reativar" : "Arquivar"}</Button>
                <Button variant="ghost" className="text-red-700" onClick={() => setDel(c)}>Excluir</Button></>}</td>
            </tr>))}</tbody>
        </Table>
      </Card>
      <Card title="Auditoria (últimas 100 alterações)">
        {!audit.data?.length ? <Empty>Nada registrado.</Empty> : (
          <div className="max-h-96 overflow-auto"><Table>
            <thead><tr><th className={th}>Quando</th><th className={th}>Registro</th><th className={th}>Ação</th></tr></thead>
            <tbody>{audit.data.map((a) => (
              <tr key={a.id}><td className={td}>{dateTime(a.at)}</td><td className={td}>{a.entity} #{a.entity_id ?? "—"}</td>
                <td className={td}>{ACTIONS[a.action] ?? a.action}</td></tr>))}</tbody>
          </Table></div>
        )}
      </Card>
      <ConfirmDialog open={!!del} title="Excluir categoria" onClose={() => setDel(null)} busy={remove.isPending}
        onConfirm={() => del && remove.mutate(del)}
        message="Categorias em uso não podem ser excluídas; nesse caso, arquive-as." />
    </div>
  );
}
