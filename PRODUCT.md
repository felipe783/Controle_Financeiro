# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

O dono do sistema e, possivelmente, familiares, cada um com a própria conta e dados isolados (Row-Level Security). Uso real, hospedado no servidor do dono: no computador para revisar o mês, a carteira e o patrimônio; no celular para lançar e pagar contas na hora. O administrador gerencia acessos, mas não vê finanças alheias.

## Product Purpose

Gestão financeira pessoal completa: contas, receitas, despesas, transferências, investimentos com cotações, patrimônio com snapshots, orçamentos, metas e previsão de caixa. O sucesso é saber, em segundos, quanto se tem, como foi o mês e o que vence, e registrar uma movimentação sem atrito.

## Positioning

Software próprio, privado e auto-hospedado, com o rigor de um livro-caixa: o saldo nunca é armazenado (sempre recalculado dos lançamentos), dinheiro é decimal exato, preço nunca é inventado (sem cotação, avalia pelo custo e avisa). A ambição declarada do dono é de **software premium**: "o público é pessoal; a ambição do produto é de software premium".

## Operating Context

Navegador no desktop e no celular, mesma origem que a API (`/api`) atrás do Nginx com CSP restrita (`font-src 'self'`, sem script inline). Cotações de brapi, Alpha Vantage e PTAX/BCB; importação e exportação CSV; backups `pg_dump`.

## Capabilities and Constraints

- Todas as funcionalidades e regras de negócio atuais devem ser preservadas (ver `vault/_Financeiro.md` e `docs/METODOLOGIA.md`).
- Valores trafegam como texto decimal; só viram `number` para exibir ou desenhar.
- Fontes e scripts empacotados localmente por causa da CSP.

## Brand Commitments

Prioridades do dono, em ordem (2026-10-19): 1) impacto visual, sofisticação e identidade própria; 2) animações, motion design e interações elaboradas; 3) composição visual, gráficos, dashboards e navegação refinada; 4) preservação integral das funcionalidades e regras; 5) desempenho, estabilidade e responsividade. Interface não deve ser simples por ser pessoal; não quer glassmorfismo genérico, gradientes aleatórios, excesso de cartões nem cara de dashboard gerado por IA.

## Evidence on Hand

Não há dados reais no repositório; demonstrações usam dados fictícios num banco descartável.

## Product Principles

- O número certo primeiro: valores legíveis e exatos vencem qualquer efeito.
- Movimento explica o dinheiro (de onde veio, para onde foi, o que mudou), nunca esconde erro ou atrasa uma ação.
- Ação frequente a um gesto: lançar, pagar e filtrar sem navegar.

## Accessibility & Inclusion

Cuidados essenciais: controles operáveis por teclado, foco visível, textos e valores legíveis, `prefers-reduced-motion` respeitado. O dono pediu que o esforço principal vá para a experiência visual e interativa.
