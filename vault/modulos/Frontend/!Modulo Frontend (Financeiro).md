O **frontend** (`frontend/`) é uma SPA React 18 + TypeScript compilada pelo Vite e servida pelo Nginx. Toda chamada vai para `/api` na mesma origem; em desenvolvimento, o Vite faz o proxy para `127.0.0.1:8000`.

A interface foi **reconstruída duas vezes em 2026-10-19**. A primeira ("caderneta") trocou um painel de cards iguais por uma interface tipográfica; a segunda, no mesmo dia, a pedido do dono ("o público é pessoal; a ambição do produto é de software premium"), criou a identidade **"Painel de azulejos"** e um sistema de movimento. Contexto de produto em `PRODUCT.md` (raiz).

## Direção visual: "Painel de azulejos"

- **De onde vem:** os azulejos modulares de Athos Bulcão em Brasília — um único módulo geométrico girado livremente compõe murais. Escolhida pelo sorteio do `concept-seed` da skill Impeccable (seed:e240b95a4b776360, 6º de 7 candidatos do universo do usuário); as buscas da UI/UX Pro Max confirmaram IBM Plex para finanças e descartaram o glassmorfismo sugerido (risco de contraste em telas densas).
- **Tokens em variáveis CSS** (`src/index.css`), com nomes semânticos no `tailwind.config.js`: `paper`, `sheet`, `sunk`, `ink*`, `rule*`, `anil` (agora o **cobalto do azulejo**; o nome ficou), `ocre` (segunda tinta: ação principal no trilho, destaques), `rail*` (trilho e faixas cobalto), `pos`/`neg` (sentido do dinheiro) e `warn`. O tema escuro redefine as mesmas variáveis.
- **Trilho cobalto** à esquerda (desktop) e barra superior cobalto (celular): a cor do produto é a moldura. O item ativo é uma pastilha clara que **desliza** entre as páginas (`layoutId`).
- **Faixa cobalto** (`Band` em `ui.tsx`; `WorthBand` no painel): o número principal de cada página (patrimônio, total em contas, valor de mercado, patrimônio líquido) em Archivo grande, **contando até o valor**.
- **Assinatura: o mural** (`Mural` em `Dashboard.tsx`). Cada azulejo é um dia do período (uma semana, acima de 62 dias); o quarto de disco cobalto cresce com o que saiu e o disco verde com o que entrou (área proporcional ao maior valor do período); a rotação alterna como nos painéis de Athos. Clicar abre o extrato do dia. O mesmo módulo (`components/tiles.tsx`) faz a marca, o carregamento, o estado vazio e o mural do login.
- **Tipografia:** IBM Plex Sans no corpo; **Archivo variável** (peso e largura) em títulos e números, com algarismos tabulares. `<Money>` compõe "R$", inteiro e centavos em tamanhos diferentes.
- **Gráficos:** paleta categórica revalidada em 2026-10-19 com o `validate_palette.js` da skill dataviz contra `#FFFFFF` e `#10162C` (abre com cobalto e ocre). A curva do patrimônio é um SVG próprio (`WorthCurve`): o traço se desenha ao entrar e o cursor percorre os meses, levando o número da faixa junto.

## Movimento (`src/motion.ts`)

- **Curvas e tempos:** saída rápida (`ease.out` = `cubic-bezier(.16,1,.3,1)`), 140/220/420/700 ms; molas para camadas (`spring.layer`) e realces (`spring.snappy`). A saída é sempre mais curta que a entrada.
- **Onde há movimento:** entrada de página (sobe e desfoca de leve, sem esperar a saída da anterior); folhas, diálogos, menus e paleta com entrada e saída animadas (Radix com `forceMount` + `AnimatePresence`); segmentados e abas com realce deslizante; números de destaque contando; barras crescendo; linhas do extrato e de "A pagar" saindo ao excluir ou pagar; barra de lote subindo com mola; avisos com barra de tempo restante; troca de tema com **revelação circular** a partir do botão (View Transitions, quando o navegador suporta).
- **Rolagem:** o `PageHeader` fica fixo e se compacta ao rolar (ações sempre à mão) e publica sua altura em `--sticky-top`; os cabeçalhos de dia do extrato grudam logo abaixo, com o saldo do dia. O painel tem um índice de seções que acompanha a rolagem, e os blocos sobem uma vez ao entrar na tela.
- **Movimento reduzido:** `MotionConfig reducedMotion="user"` (só opacidade e cor animam), CSS com durações de 1 ms, contagem de números desligada.

## Estrutura

| Arquivo | Função |
|---|---|
| `src/main.tsx` | `QueryClient` (sem nova tentativa para 4xx), `BrowserRouter`, `ToastProvider`, importação das fontes |
| `src/App.tsx` | login com mural de azulejos; trilho cobalto; **paleta de comandos** (Ctrl/⌘ K: páginas e ações); `PageBoundary` (falha de render derruba só a página); transição de página; troca de tema animada; *shell* com menu lateral agrupado (Dia a dia, Patrimônio, Ajustes) no computador e barra inferior com o botão "+" no celular; tecla **N** para o lançamento rápido; páginas carregadas sob demanda (`React.lazy`) |
| `src/api.ts` | `fetch` com `credentials: same-origin` e `X-Requested-With: fetch`; 401 dispara `auth:expired`; erros viram `ApiError` com a mensagem da API |
| `src/hooks.ts` | `useAccounts`, `useCategories`, `useSave` (salva, invalida as consultas e mostra o aviso), `useSettle` (efetiva um ou vários lançamentos via `/transactions/bulk/settle`) |
| `src/format.ts` | moeda, datas e percentuais em pt-BR; `moneyParts`, `dayLabel` ("Hoje", "Ontem", "quarta, 14 de outubro"), `change`, `isInflow`; `parseDecimal("1.234,56") → "1234.56"` |
| `src/components/ui.tsx` | design system: `Button` (aperto ao clicar), `IconButton` (com `forwardRef`, exigido pelo Radix), `Band`/`BandFigure`, `useCountUp`, `Money`, `Figure`, `PageHeader`, `Panel`, `Segmented`, `Status` (ponto + texto), `Tag`, `Progress`, `Notice`, `Sheet` (folha lateral; sobe de baixo no celular, com rodapé fixo), `Modal`, `ConfirmDialog`, `RowMenu` (Radix dropdown), `Table`, toasts |
| `src/components/charts.tsx` | paleta validada, `useChartTheme`, `WorthCurve`, `ChartBox` (altura fixa, `aria-label`, tabela opcional), `Legend`, `foldOthers` |
| `src/components/TransactionForms.tsx` | `EntryProvider`/`useEntry`: uma folha única para despesa, receita ou transferência, que também edita. Tem "Salvar e lançar outro" |
| `src/components/InvestmentForms.tsx` | formulários de ativo e de operação (usados na carteira e na página do ativo) |

## Páginas (`src/pages/`)

| Rota | Página | Conteúdo |
|---|---|---|
| `/` | `Dashboard.tsx` | faixa cobalto do patrimônio (número animado, composição, curva de 12 meses navegável); bloco do período com recebido/gasto/sobrou, medidor da taxa de poupança e o **mural de azulejos**; "Para onde foi o dinheiro" (cada categoria abre os lançamentos filtrados); últimos lançamentos; "A pagar" com **Pagar**; investimentos com gráficos recolhíveis; índice de seções no cabeçalho |
| `/lancamentos` | `Transactions.tsx` | extrato agrupado por dia, com cabeçalhos de dia fixos (saldo do dia) e tabela `table-fixed` (sem rolagem lateral no celular). Os filtros ficam **na URL** (`?account_id=…&overdue=1`), o que permite links a partir do painel e das contas. Atalhos de período, *chips* removíveis, totais do filtro, seleção múltipla com barra de lote (efetivar ou excluir), menu "⋯" por linha e importação CSV numa folha |
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

> [!note] Verificado em 2026-10-19, à noite (Windows, Edge headless via CDP, API local + Vite, PostgreSQL descartável na porta 55432 com dados fictícios), depois do redesign "Painel de azulejos"
> - `tsc -b`, `vitest` (5), `vite build` e `pytest` (97, como `fin_test`). *Bundle* inicial ≈ 160 kB gzip (era ≈ 109; o Motion responde pela maior parte).
> - Capturas em 390, 768 e 1440 px nos temas claro e escuro; nenhuma página com rolagem horizontal em 390/768/1024 px (`scrollWidth` medido em todas as rotas).
> - Fluxos executados com movimento ligado: Ctrl+K → "Nova receita" → salvar (aparece no extrato); menu "⋯"; seleção de 2 pendentes → efetivar (7 → 5); "Pagar" no painel (4 → 3); cursor na curva troca o número para o mês; dica do mural; troca de tema.
> - Não verificado: leitor de tela real, Safari/iOS e desempenho em celular físico.

> [!note] Verificado em 2026-10-19 (Linux, Firefox headless via Marionette, API local + Vite, banco descartável com dados fictícios)
> - `tsc -b`, `vitest` (5 testes de `format.ts`) e `vite build`: o *bundle* inicial ficou em ≈ 109 kB gzip; os gráficos (≈ 109 kB) só carregam nas páginas que os usam.
> - Telas conferidas por captura em 1440 px e 390 px, nos temas claro e escuro.
> - Fluxos executados no navegador: tecla N → folha de lançamento → salvar despesa (aviso e linha no extrato); seleção de 2 pendentes → "Marcar como efetivados" (5 → 3 pendentes).
> - Não verificado: leitor de tela real e Safari/iOS.


---
**Projeto Pai:** [[_Financeiro]]
