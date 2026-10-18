import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { useToast } from "./components/ui";
import type { Account, Category } from "./types";

export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: () => api.get<Account[]>("/accounts") });
export const useCategories = () =>
  useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });

/** Qualquer alteração financeira invalida tudo que depende de saldos (dashboard, contas, patrimônio...). */
export function useSave<TArgs>(fn: (args: TArgs) => Promise<unknown>, okMessage: string, onDone?: () => void) {
  const qc = useQueryClient();
  const notify = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      notify(okMessage);
      onDone?.();
    },
    onError: (err) => notify(err instanceof Error ? err.message : "Erro ao salvar.", "error"),
  });
}

export function categoryOptions(cats: Category[] | undefined, kind: "income" | "expense") {
  if (!cats) return [];
  const active = cats.filter((c) => c.kind === kind && !c.archived);
  const parents = active.filter((c) => c.parent_id === null);
  return parents.flatMap((p) => [
    { id: p.id, label: p.name },
    ...active.filter((c) => c.parent_id === p.id).map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` })),
  ]);
}
