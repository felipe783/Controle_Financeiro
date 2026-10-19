O **frontend** (`frontend/`) é uma SPA React 18 + TypeScript compilada pelo Vite e servida pelo Nginx. Toda chamada vai para `/api` na mesma origem; em desenvolvimento, o Vite faz o proxy para `127.0.0.1:8000`.

A interface foi **reconstruída em 2026-10-19**. A versão anterior era um painel de cards iguais com oito gráficos; esta segue uma direção própria, a de uma **caderneta**: o dinheiro é o conteúdo e a tipografia dos valores é o elemento marcante.

## Direção visual

- **Tokens em variáveis CSS** (`src/index.css`), mapeados com nomes semânticos no `tailwind.config.js`: `paper` (fundo), `sheet` (folhas), `ink`/`ink-soft`/`ink-faint` (texto), `rule` (réguas), `anil` (marca e ações), `pos`/`neg` (dinheiro que entra/sai) e `warn`. O tema escuro redefine as mesmas variáveis; nenhum componente usa cor crua.
- **Verde e vermelho só indicam o sentido do dinheiro.** A marca é anil para não ser confundida com "positivo".
- **Tipografia:** IBM Plex Sans na interface e IBM Plex Sans Condensed nos valores. As fontes vêm de `@fontsource`, empacotadas pelo Vite, porque a CSP do Nginx só aceita `font-src 'self'`.
- **`<Money>`** (`components/ui.tsx`) compõe "R$", inteiro e centavos em tamanhos diferentes, com algarismos tabulares e sinal + / − quando o valor tem sentido. Todos os valores importantes passam por ele.
- **Gráficos:** a paleta categórica de 6 cores foi validada no claro e no escuro com o `validate_palette.js` da skill dataviz (luminosidade, croma, separação para daltonismo e contraste). Da 7ª categoria em diante, o resto vira "Outros" (`foldOthers`). As cores são lidas dos tokens por `useChartTheme`, que reage à troca de tema. A legenda é HTML; os gráficos principais têm "Ver valores em tabela".

## Estrutura

| Arquivo | Função |
|---|---|
| `src/main.tsx` | `QueryClient` (sem nova tentativa para 4xx), `BrowserRouter`, `ToastProvider`, importação das fontes |
| `src/App.tsx` | login; *shell* com menu lateral agrupado (Dia a dia, Patrimônio, Ajustes) no computador e barra inferior com o botão "+" no celular; tecla **N** para o lançamento rápido; páginas carregadas sob demanda (`React.lazy`) |
| `src/api.ts` | `fetch` com `credentials: same-origin` e `X-Requested-With: fetch`; 401 dispara `auth:expired`; erros viram `ApiError` com a mensagem da API |
| `src/hooks.ts` | `useAccounts`, `useCategories`, `useSave` (salva, invalida as consultas e mostra o aviso), `useSettle` (efetiva um ou vários lançamentos via `/transactions/bulk/settle`) |
| `src/format.ts` | moeda, datas e percentuais em pt-BR; `moneyParts`, `dayLabel` ("Hoje", "Ontem", "quarta, 14 de outubro"), `change`, `isInflow`; `parseDecimal("1.234,56") → "1234.56"` |
| `src/components/ui.tsx` | design system: `Button`, `IconButton`, `Money`, `Figure`, `PageHeader`, `Panel`, `Segmented`, `Status` (ponto + texto), `Tag`, `Progress`, `Notice`, `Sheet` (folha lateral; sobe de baixo no celular, com rodapé fixo), `Modal`, `ConfirmDialog`, `RowMenu` (Radix dropdown), `Table`, toasts |
| `src/components/charts.tsx` | paleta validada, `useChartTheme`, `ChartBox` (altura fixa, `aria-label`, tabela opcional), `Legend`, `foldOthers` |
| `src/components/TransactionForms.tsx` | `EntryProvider`/`useEntry`: uma folha única para despesa, receita ou transferência, que também edita. Tem "Salvar e lançar outro" |
| `src/components/InvestmentForms.tsx` | formulários de ativo e de operação (usados na carteira e na página do ativo) |

## Páginas (`src/pages/`)

| Rota | Página | Conteúdo |
|---|---|---|
| `/` | `Dashboard.tsx` | patrimônio líquido em destaque, com a composição e a curva de 12 meses; entradas, saídas e sobra comparadas ao período anterior (`previous` do `/dashboard`); "A pagar" com botão **Pagar**; "Para onde foi o dinheiro" (cada categoria abre os lançamentos filtrados); últimos lançamentos; bloco de investimentos |
| `/lancamentos` | `Transactions.tsx` | extrato agrupado por dia. Os filtros ficam **na URL** (`?account_id=…&overdue=1`), o que permite links a partir do painel e das contas. Atalhos de período, *chips* removíveis, totais do filtro, seleção múltipla com barra de lote (efetivar ou excluir), menu "⋯" por linha e importação CSV numa folha |
| `/contas` | `Accounts.tsx` | contas agrupadas por uso (dia a dia, reservas, corretoras), total, a receber e a pagar; o nome abre o extrato da conta; conciliação mostra o ajuste antes de gravar (só para a data de hoje) |
| `/investimentos` | `Investments.tsx` | resumo da carteira; tabela agrupada por classe com subtotal e peso; estado dos provedores numa linha; registro de consultas; câmbio |
| `/investimentos/:id` | `AssetPage.tsx` | página própria do ativo (antes era um modal com modais aninhados): valor de mercado, indicadores, abas Operações e Cotações |
| `/patrimonio` | `NetWorth.tsx` | balanço: "O que você tem" × "O que você deve", com o líquido como resultado; evolução mês a mês com tabela |
| `/planejamento/*` | `Planning.tsx` | abas: previsão de caixa (soma "hoje + entra − sai = fica" e agenda com saldo depois de cada lançamento), orçamentos (mês com setas e consumo total), metas e recorrências (com efeito mensal) |
| `/categorias` | `Categories.tsx` | árvore de despesas e receitas; renomear, mover, arquivar e excluir (as padrão ficam protegidas) |
| `/historico` | `Audit.tsx` | auditoria legível ("Alterou o lançamento “Mercado” · R$ 120,00 → R$ 130,00"), agrupada por dia e filtrável |
| `/usuarios` | `Users.tsx` | **só administradores**: criar usuário numa folha, promover/rebaixar e desativar/reativar pelo menu da linha |

`/cadastros` redireciona para `/categorias`, para não quebrar favoritos antigos.

## Regras de implementação

- Valores da API chegam como texto decimal e só viram `number` para exibir ou desenhar gráficos.
- O tema fica em `localStorage` (`tema`) e é aplicado por `public/theme.js` **antes** do React, porque a CSP bloqueia script inline. O tema só é gravado quando a pessoa o troca; sem escolha, vale o do sistema. Até 2026-10-19 o tema era gravado na montagem, o que fixava a preferência do sistema como escolha.
- A acessibilidade inclui link "Pular para o conteúdo" e foco gerenciado nas folhas e menus (Radix). Situações são escritas com ponto e texto, nunca só com cor. Ordenação usa `aria-sort` e os gráficos têm `aria-label` e tabela. `prefers-reduced-motion` desliga as animações.
- Formulários dentro de uma `Sheet` têm `id` e o botão de enviar fica no rodapé (`form="…"`); por isso o `submit` ignora cliques enquanto `isPending`.

> [!note] Verificado em 2026-10-19 (Linux, Firefox headless via Marionette, API local + Vite, banco descartável com dados fictícios)
> - `tsc -b`, `vitest` (5 testes de `format.ts`) e `vite build`: o *bundle* inicial ficou em ≈ 109 kB gzip; os gráficos (≈ 109 kB) só carregam nas páginas que os usam.
> - Telas conferidas por captura em 1440 px e 390 px, nos temas claro e escuro.
> - Fluxos executados no navegador: tecla N → folha de lançamento → salvar despesa (aviso e linha no extrato); seleção de 2 pendentes → "Marcar como efetivados" (5 → 3 pendentes).
> - Não verificado: leitor de tela real e Safari/iOS.


---
**Projeto Pai:** [[_Financeiro]]
