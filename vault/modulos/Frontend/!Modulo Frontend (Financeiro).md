O **frontend** (`frontend/`) é uma SPA React 18 + TypeScript compilada pelo Vite e servida pelo Nginx. Toda chamada vai para `/api` na mesma origem; em desenvolvimento, o Vite faz o proxy para `127.0.0.1:8000`.

## Arquivos centrais

| Arquivo | Função |
|---|---|
| `src/main.tsx` | `QueryClient` (sem nova tentativa para 4xx), `BrowserRouter`, `ToastProvider` |
| `src/App.tsx` | tela de login (avisa se não há usuário), menu lateral responsivo, tema claro/escuro, rotas |
| `src/api.ts` | `fetch` com `credentials: same-origin` e `X-Requested-With: fetch`; 401 dispara `auth:expired`; erros viram `ApiError` com a mensagem da API |
| `src/hooks.ts` | `useAccounts`, `useCategories`, `useSave` (salva, invalida as consultas e mostra o aviso) |
| `src/format.ts` | moeda, datas e percentuais em pt-BR; `parseDecimal("1.234,56") → "1234.56"`; rótulos em português |
| `src/components/ui.tsx` | Button, Card, Stat, Field, MoneyInput, Modal (Radix), ConfirmDialog, Table, Toast |
| `src/components/charts.tsx` | paleta, eixos e `ChartBox` com estado vazio |
| `src/components/TransactionForms.tsx` | modais de receita/despesa e de transferência |

## Páginas (`src/pages/`)

| Rota | Página | Conteúdo |
|---|---|---|
| `/` | `Dashboard.tsx` | filtros de período, indicadores, 8 gráficos, contas a vencer, últimas movimentações, atalhos |
| `/lancamentos` | `Transactions.tsx` | filtros, busca, ordenação, paginação, pagar/receber, editar, duplicar, excluir, importar/exportar CSV |
| `/contas` | `Accounts.tsx` | saldos, cadastro, arquivamento, conciliação |
| `/investimentos` | `Investments.tsx` | carteira, status dos provedores, detalhe do ativo (operações e cotações), câmbio |
| `/patrimonio` | `NetWorth.tsx` | composição, evolução, dívidas e snapshot manual |
| `/planejamento` | `Planning.tsx` | previsão, orçamentos, metas, recorrências |
| `/cadastros` | `Settings.tsx` | categorias e auditoria |
| `/usuarios` | `Users.tsx` | **só administradores** (fora disso redireciona ao Painel): criar usuário com validação igual à do backend, promover/rebaixar, desativar/reativar |

- Valores da API chegam como texto decimal e só viram `number` para exibir ou desenhar gráficos.
- O tema fica em `localStorage` (`tema`) e é aplicado por `public/theme.js` **antes** do React: a CSP do Nginx bloqueia script inline.
- A acessibilidade inclui link "Pular para o conteúdo", `aria-label` nos gráficos e nas barras de progresso, foco gerenciado nos modais (Radix) e navegação por teclado.

> [!note] Verificado em 2026-10-18
> `tsc -b`, `vitest` (3 testes de `format.ts`) e `vite build` passam (JS ≈ 224 kB gzip). No navegador do app, com a API local, os testes foram:
> - login;
> - criação de conta e despesa pelos formulários;
> - fluxo de investimento;
> - conferência dos totais no painel.


---
**Projeto Pai:** [[_Financeiro]]
