import { Archive, ArchiveRestore, CornerDownRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api";
import {
  Button, ConfirmDialog, cx, Empty, ErrorBox, Field, inputCls, Loading, PageHeader, RowMenu, Sheet, SheetActions, Tag,
} from "../components/ui";
import { useCategories, useSave } from "../hooks";
import type { Category } from "../types";

type Draft = { id?: number; name: string; kind: "income" | "expense"; parent_id: string; archived: boolean };

export default function Categories() {
  const cats = useCategories();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const toggle = useSave((c: Category) => api.put(`/categories/${c.id}`, { name: c.name, kind: c.kind, parent_id: c.parent_id, archived: !c.archived }),
    "Categoria atualizada.");
  const remove = useSave((c: Category) => api.del(`/categories/${c.id}`), "Categoria excluída.", () => setDel(null));
  const list = cats.data ?? [];

  const column = (kind: "expense" | "income", title: string) => {
    const parents = list.filter((c) => c.kind === kind && c.parent_id === null);
    const row = (c: Category, child = false) => (
      <li key={c.id} className={cx("flex min-h-11 items-center gap-2 py-1 pr-2", child ? "pl-9" : "pl-4 sm:pl-5", c.archived && "opacity-60")}>
        {child && <CornerDownRight aria-hidden="true" className="-ml-5 size-3.5 text-ink-faint" />}
        <span className={cx("min-w-0 flex-1 truncate", !child && "font-medium")}>{c.name}</span>
        {c.is_system && <Tag>Padrão</Tag>}
        {c.archived && <Tag>Arquivada</Tag>}
        {!c.is_system && (
          <RowMenu label={`Ações de ${c.name}`} items={[
            { label: "Renomear ou mover", icon: Pencil, onSelect: () => setDraft({ id: c.id, name: c.name, kind: c.kind, parent_id: c.parent_id ? String(c.parent_id) : "", archived: c.archived }) },
            { label: "Adicionar subcategoria", icon: Plus, hidden: child, onSelect: () => setDraft({ name: "", kind, parent_id: String(c.id), archived: false }) },
            { label: c.archived ? "Reativar" : "Arquivar", icon: c.archived ? ArchiveRestore : Archive, onSelect: () => toggle.mutate(c) },
            { label: "Excluir", icon: Trash2, danger: true, onSelect: () => setDel(c) },
          ]} />
        )}
      </li>
    );
    return (
      <section className="rounded-md border border-rule bg-sheet">
        <header className="flex items-center justify-between border-b border-rule px-4 py-2 sm:px-5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setDraft({ name: "", kind, parent_id: "", archived: false })}>Adicionar</Button>
        </header>
        {parents.length === 0 ? <div className="px-5"><Empty compact>Nenhuma categoria.</Empty></div> : (
          <ul className="divide-y divide-rule/70">
            {parents.map((p) => (
              <li key={p.id}>
                <ul>{row(p)}{list.filter((c) => c.parent_id === p.id).map((c) => row(c, true))}</ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  };

  return (
    <div>
      <PageHeader title="Categorias" context="Organizam receitas e despesas nos relatórios e nos orçamentos. Subcategorias somam na principal." />
      <ErrorBox error={cats.error} className="mb-4" />
      {cats.isLoading ? <Loading rows={8} /> : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {column("expense", "Despesas")}
          {column("income", "Receitas")}
        </div>
      )}
      <Sheet open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Editar categoria" : "Nova categoria"}
        footer={<SheetActions form="cat-form" onCancel={() => setDraft(null)} />}>
        {draft && <CategoryForm draft={draft} all={list} onDone={() => setDraft(null)} />}
      </Sheet>
      <ConfirmDialog open={!!del} title={`Excluir ${del?.name ?? "categoria"}`} onClose={() => setDel(null)} busy={remove.isPending}
        onConfirm={() => del && remove.mutate(del)}
        message="Só categorias sem lançamentos, subcategorias ou recorrências podem ser excluídas. Se estiver em uso, arquive." />
    </div>
  );
}

function CategoryForm({ draft, all, onDone }: { draft: Draft; all: Category[]; onDone: () => void }) {
  const [f, setF] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const hasChildren = !!draft.id && all.some((c) => c.parent_id === draft.id);
  const parents = all.filter((c) => c.parent_id === null && c.kind === f.kind && c.id !== draft.id && !c.archived);
  const save = useSave((b: unknown) => (draft.id ? api.put(`/categories/${draft.id}`, b) : api.post("/categories", b)),
    draft.id ? "Categoria atualizada." : "Categoria criada.", onDone);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setError("Dê um nome à categoria.");
    save.mutate({ name: f.name, kind: f.kind, parent_id: f.parent_id ? Number(f.parent_id) : null, archived: f.archived });
  }
  return (
    <form id="cat-form" onSubmit={submit} className="grid gap-4">
      <Field label="Nome"><input className={inputCls} value={f.name} required maxLength={80} autoFocus
        onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      {!draft.id && (
        <Field label="Tipo"><select className={inputCls} value={f.kind}
          onChange={(e) => setF({ ...f, kind: e.target.value as Draft["kind"], parent_id: "" })}>
          <option value="expense">Despesa</option><option value="income">Receita</option></select></Field>
      )}
      <Field label="Dentro de" hint={hasChildren ? "Esta categoria tem subcategorias, então continua principal." : "Deixe como principal ou escolha a categoria de cima."}>
        <select className={inputCls} value={f.parent_id} disabled={hasChildren} onChange={(e) => setF({ ...f, parent_id: e.target.value })}>
          <option value="">Nenhuma (principal)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></Field>
      <ErrorBox error={error} />
    </form>
  );
}
