# Financeiro Pessoal

Sistema de controle financeiro pessoal: contas, receitas, despesas, transferências, investimentos com
cotações automáticas e manuais, patrimônio consolidado, orçamentos e metas. Interface em português, dados
em PostgreSQL e implantação com um script em qualquer servidor Linux com Docker.

> **Segurança em uma linha:** a aplicação exige login, mas foi feita para uso pessoal. Para acesso pela
> internet, coloque HTTPS na frente (seção 20) antes de cadastrar dados reais.

## Documentação

| Onde | Conteúdo |
|---|---|
| Este `README.md` | instalação, configuração e operação do servidor |
| [docs/METODOLOGIA.md](docs/METODOLOGIA.md) | fórmulas: saldo, receitas/despesas, preço médio, TIR, câmbio, patrimônio |
| [vault/_Financeiro.md](vault/_Financeiro.md) | **documentação arquitetural completa** (Obsidian): status, módulos, fluxos, decisões e problemas conhecidos |

No Obsidian, as notas aparecem no vault `Contexto Projetos` em `Contexto Projetos/Financeiro/` (uma junction
para `Financeiro/vault/`), com índice em `_Financeiro`.

## Sumário

1. [Objetivo](#1-objetivo) · 2. [Funcionalidades](#2-funcionalidades) · 3. [Arquitetura](#3-arquitetura) ·
4. [Estrutura](#4-estrutura-de-diretórios) · 5. [Pré-requisitos](#5-pré-requisitos) ·
6. [Desenvolvimento local](#6-execução-local-para-desenvolvimento) · 7. [Instalar o Docker](#7-instalação-do-docker) ·
8. [.env](#8-configuração-do-env) · 9. [Iniciar](#9-inicialização-da-aplicação) · 10. [Porta](#10-configuração-da-porta) ·
11. [Rede local](#11-acesso-pela-rede-local) · 12. [Servidor Linux](#12-implantação-em-servidor-linux) ·
13. [Firewall](#13-regras-de-firewall) · 14. [Cotações](#14-configuração-das-apis-de-cotações) ·
15. [Scripts](#15-comandos-dos-scripts) · 16. [Backup e restauração](#16-backup-e-restauração) ·
17. [Atualização](#17-atualização-segura) · 18. [Migrações](#18-migrações-do-banco) ·
19. [Diagnóstico](#19-diagnóstico-de-erros) · 20. [Segurança e limitações](#20-segurança-e-limitações-conhecidas) ·
21. [Migrar de servidor](#21-migração-para-outro-servidor)

## 1. Objetivo

Registrar e acompanhar toda a vida financeira pessoal com cálculos consistentes: quanto há disponível,
quanto entrou e saiu, quanto está investido e quanto vale, e qual é o patrimônio líquido, sem dupla
contagem e sem inventar valores. A metodologia de cálculo está em [docs/METODOLOGIA.md](docs/METODOLOGIA.md).

## 2. Funcionalidades

- **Painel:** saldo disponível, receitas, despesas e resultado do período, taxa de economia, custo e valor
  da carteira, ganho não realizado, TIR, patrimônio bruto e líquido, despesas previstas, contas a vencer.
  São 8 gráficos: receitas × despesas, resultado mensal, evolução do patrimônio, despesas por categoria,
  carteira por classe, valor da carteira, aportes × rendimentos e proventos. Filtros: mês atual, 3 meses,
  6 meses, ano e período personalizado.
- **Lançamentos:** receitas e despesas com situação (prevista, pendente, paga/recebida; "atrasada" é
  calculada), competência, vencimento, data de efetivação, categoria/subcategoria, conta, forma de
  pagamento, fixa/variável e observações. Também: busca, filtros, ordenação, paginação, duplicação,
  exclusão com confirmação, exportação e importação CSV (com pré-visualização e detecção de duplicados)
  e recorrências sem duplicação.
- **Contas:** corrente, poupança, pagamento, dinheiro, investimento. Saldo calculado a partir do saldo
  inicial e dos lançamentos efetivados. Arquivamento e conciliação com ajuste auditado.
- **Transferências:** atômicas, vinculadas nos dois lados, fora de receitas e despesas.
- **Investimentos:** ações, FIIs, ETFs, Tesouro, CDB, LCI/LCA, outros de renda fixa, fundos, internacionais
  e ativos personalizados. Operações: compra, venda, provento (anunciado ou recebido), taxa, amortização e
  ajuste. Indicadores: preço médio, custo, valor de mercado, não realizado, realizado, proventos, retorno
  em R$, retorno simples, TIR e participação. Moeda estrangeira com separação entre efeito do ativo e efeito
  cambial.
- **Cotações:** atualização automática (worker) e manual, cotação manual por preço ou valor total, histórico
  de fontes, aviso de cotação desatualizada e registro de cada consulta. Câmbio PTAX automático ou manual.
- **Patrimônio:** consolidação de contas, investimentos e dívidas; snapshots diários; histórico com
  estimativas identificadas.
- **Planejamento:** orçamento mensal por categoria com alerta, metas com aportes e prazo, previsão de caixa.
- **Cadastros:** categorias personalizáveis (com subcategorias) e trilha de auditoria.
- **Interface:** responsiva, tema claro/escuro, formatação brasileira, navegação por teclado, mensagens de
  sucesso e erro, estados de carregamento e vazios.

Não há dados de demonstração: tudo o que aparece foi cadastrado por você.

## 3. Arquitetura

```
 navegador ──HTTP──▶ web (Nginx: React compilado + proxy /api) ──▶ api (FastAPI, uvicorn)
                                                                   │
                         worker (agendador único: cotações,        ▼
                         recorrências, snapshot diário) ─────▶ db (PostgreSQL 17, volume pgdata)
                                                                   ▲
                         migrate (alembic upgrade head, roda e sai) ┘
```

| Camada | Tecnologia | Onde |
|---|---|---|
| Interface | React 18, TypeScript, Vite, Tailwind, Recharts, Radix Dialog, TanStack Query | `frontend/src` |
| API | FastAPI, Pydantic 2 | `backend/app/routers` |
| Regras financeiras | Python puro sobre SQLAlchemy 2 | `backend/app/services` |
| Integrações externas | provedores de cotação desacoplados | `backend/app/providers` |
| Persistência | PostgreSQL + Alembic | `backend/app/models.py`, `backend/migrations` |

**Decisões:**

- **Um único Dockerfile** na raiz com dois alvos (`api` e `web`). As duas imagens finais são enxutas e o
  build não recebe nenhum segredo.
- **O worker é um serviço separado** e segura um *advisory lock* do PostgreSQL. Mesmo com vários workers
  da API ou um worker duplicado, só um agendador fica ativo. A atualização manual de cotações usa outro
  lock, então nunca roda ao mesmo tempo que a automática.
- **As migrações rodam num serviço próprio** (`migrate`). A API só sobe se ele terminar com sucesso.
- **O banco tem dois usuários:** a aplicação conecta com um usuário que **não é superusuário** (dono do
  banco). A senha do superusuário `postgres` fica só no container do banco.
- **Somente PostgreSQL**, também nos testes: travas e regras dependem de recursos dele (advisory locks,
  índices parciais, `ON CONFLICT`).

## 4. Estrutura de diretórios

```
Financeiro/
├── backend/
│   ├── app/
│   │   ├── main.py            # app FastAPI, saúde, login, CSRF
│   │   ├── models.py          # tabelas e restrições
│   │   ├── schemas.py         # validação de entrada/saída
│   │   ├── auth.py            # Argon2, sessões, bloqueio de tentativas
│   │   ├── services/          # ledger, investments, quotes, networth, reports, csv_io
│   │   ├── providers/         # brapi, Alpha Vantage, PTAX
│   │   ├── routers/           # endpoints REST
│   │   ├── worker.py          # tarefas programadas
│   │   └── cli.py             # create-admin, status, check-db...
│   ├── migrations/            # Alembic (versões em migrations/versions)
│   ├── tests/                 # pytest (exige PostgreSQL de teste)
│   └── requirements*.txt
├── frontend/                  # React (src/pages, src/components)
├── infra/
│   ├── nginx/default.conf     # proxy, SPA, cabeçalhos de segurança
│   └── postgres/init-app-user.sh   # cria o usuário da aplicação na 1ª inicialização
├── scripts/                   # install, deploy, update, backup, restore, status, logs, stop, create-admin
├── backups/                   # destino padrão dos backups (ignorado pelo Git)
├── docs/METODOLOGIA.md
├── vault/                     # documentação arquitetural (Obsidian), índice _Financeiro.md
├── CLAUDE.md                  # instruções para o Claude Code (importa o índice do vault)
├── Dockerfile · docker-compose.yml · .dockerignore · .gitignore · .gitattributes · .env.example
```

> O `init.sql` sugerido no planejamento virou `init-app-user.sh`: um script de shell recebe a senha do
> usuário da aplicação por variável de ambiente sem gravá-la em arquivo.

## 5. Pré-requisitos

**Servidor (produção):** Linux x86_64 ou arm64, Docker Engine 24 ou superior, plugin Docker Compose 2.20 ou
superior, `bash`, `openssl` (recomendado), 1 GB de RAM livre e 2 GB de disco.

**Desenvolvimento:** Python 3.14, Node.js 22 ou superior e um PostgreSQL 15 ou superior acessível.

## 6. Execução local para desenvolvimento

O jeito mais simples de rodar localmente é o próprio Docker (seção 9) com `APP_BIND=127.0.0.1`. Para
desenvolver com recarga automática:

```bash
# 1) PostgreSQL de desenvolvimento só na máquina local
docker run -d --name financeiro-dev-db -e POSTGRES_PASSWORD=dev -p 127.0.0.1:5432:5432 postgres:17.9-alpine3.23
docker exec financeiro-dev-db createdb -U postgres financeiro_dev
docker exec financeiro-dev-db createdb -U postgres financeiro_test

# 2) Backend (porta 8000)
cd backend
python -m venv ../.venv && source ../.venv/bin/activate      # Windows: ..\.venv\Scripts\activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg://postgres:dev@127.0.0.1:5432/financeiro_dev APP_ENV=development
alembic upgrade head
python -m app.cli create-admin
uvicorn app.main:app --reload --port 8000

# 3) Frontend (porta 5173, encaminha /api para o 8000)
cd ../frontend && npm ci && npm run dev
```

Testes:

```bash
cd backend && TEST_DATABASE_URL=postgresql+psycopg://postgres:dev@127.0.0.1:5432/financeiro_test pytest -q
cd frontend && npm test && npm run typecheck
```

Os testes **apagam e recriam** o schema do banco indicado em `TEST_DATABASE_URL` e só rodam se o nome do
banco contiver `test`. Nunca aponte essa variável para o banco real.

O que os testes cobrem:
- **Backend** (`backend/tests/`): saldos, transferências, recorrências, CSV, investimentos, cotações,
  patrimônio, autenticação, saúde e as regressões da revisão de código. Os provedores de cotação são
  testados com respostas simuladas (`httpx.MockTransport`), sem rede.
- **Frontend**: a formatação brasileira (`src/format.test.ts`).
- **Infraestrutura**: não há testes automatizados de Docker. Valide com `docker compose config -q` e com o
  próprio `./scripts/deploy.sh`, que confere a saúde ponta a ponta.

## 7. Instalação do Docker

Siga a documentação oficial da sua distribuição: <https://docs.docker.com/engine/install/>. O plugin
Compose vem junto nos pacotes oficiais (`docker-compose-plugin`). Depois, se quiser usar sem `sudo`, faça
o passo opcional em <https://docs.docker.com/engine/install/linux-postinstall/>. Confira:

```bash
docker version && docker compose version
```

Os scripts deste projeto **não instalam nem alteram** o Docker.

## 8. Configuração do .env

O `scripts/install.sh` cria o `.env` a partir do `.env.example`, gera senhas fortes (`openssl rand -hex 24`)
e aplica permissão `600`. Ele nunca sobrescreve um `.env` existente.

| Variável | Padrão | Uso |
|---|---|---|
| `APP_PORT` | 8080 | porta do host mapeada para o Nginx |
| `APP_BIND` | 0.0.0.0 | `127.0.0.1` restringe à própria máquina |
| `APP_TIMEZONE` | America/Sao_Paulo | fuso das datas ("hoje", vencimentos) |
| `POSTGRES_DB` / `POSTGRES_USER` | financeiro / financeiro_app | banco e usuário da aplicação |
| `POSTGRES_PASSWORD` | (gerada) | senha do usuário da aplicação |
| `POSTGRES_SUPERUSER_PASSWORD` | (gerada) | senha do `postgres`, usada só no container do banco |
| `COOKIE_SECURE` | false | `true` quando o acesso for por HTTPS |
| `SESSION_HOURS` | 12 | duração da sessão |
| `QUOTES_*`, `BRAPI_TOKEN`, `ALPHAVANTAGE_*`, `FX_BCB_ENABLED` | ver seção 14 | cotações |
| `BUDGET_ALERT_PERCENT` | 80 | alerta de orçamento |
| `BACKUP_RETENTION_DAYS` | 30 | retenção do `backup.sh` (0 desativa a remoção) |

Depois de alterar o `.env`, aplique com `scripts/deploy.sh --no-build`.

> As senhas do banco só são lidas na **criação** do volume. Para trocá-las depois:
> `docker compose exec db psql -U postgres -c "ALTER ROLE financeiro_app PASSWORD 'nova'"`, depois
> atualize o `.env` e rode `scripts/deploy.sh --no-build`.

## 9. Inicialização da aplicação

```bash
git clone <repositório> financeiro && cd financeiro    # ou copie a pasta para o servidor
./scripts/install.sh            # primeira vez: cria .env, constrói, migra, sobe e oferece criar o admin
./scripts/create-admin.sh       # se não criou o usuário durante a instalação
```

Nas próximas vezes: `./scripts/deploy.sh --no-build` para iniciar e `./scripts/stop.sh` para parar.
O `deploy.sh` só declara sucesso depois de verificar `/api/health` **pelo Nginx**. Esse endpoint testa o
banco e confere se a migração aplicada é a mais recente.

## 10. Configuração da porta

Edite `APP_PORT` no `.env` (ex.: `APP_PORT=9000`) e rode `./scripts/deploy.sh --no-build`. O mapeamento
é `APP_PORT` no host → porta 8080 do Nginx dentro do container. Não é preciso mexer no código nem no
Dockerfile. O `install.sh` recusa uma porta que já esteja ocupada por outro programa.

## 11. Acesso pela rede local

Com `APP_BIND=0.0.0.0` (padrão), acesse de outro dispositivo da mesma rede:
`http://<IP-do-computador>:<APP_PORT>`. Descubra o IP com `hostname -I` (Linux) ou `ipconfig` (Windows).
O firewall local precisa permitir a porta (seção 13). Para uso somente na própria máquina, use
`APP_BIND=127.0.0.1`.

## 12. Implantação em servidor Linux

1. Instale o Docker (seção 7).
2. Copie o projeto: `git clone` (recomendado, habilita o `update.sh`) ou
   `rsync -a --exclude node_modules --exclude .venv ./ usuario@servidor:~/financeiro/`.
3. No servidor: `cd ~/financeiro && ./scripts/install.sh`.
4. Opcional (provedores de cotação): preencha as chaves no `.env` e rode `./scripts/deploy.sh --no-build`.
5. Configure o firewall (seção 13) e, para acesso pela internet, HTTPS (seção 20).

Os containers têm `restart: unless-stopped`: voltam sozinhos depois de um reboot, desde que o serviço do
Docker esteja habilitado (`sudo systemctl enable docker`).

## 13. Regras de firewall

Publicar uma porta no Docker **não garante** acesso externo, e também **não protege** o serviço. São
camadas diferentes:

| Camada | O que é | Como ajustar |
|---|---|---|
| Porta publicada no Docker | `APP_BIND:APP_PORT` → Nginx | `.env` |
| Firewall do sistema | ufw/firewalld no servidor | ex.: `sudo ufw allow 8080/tcp` ou `sudo firewall-cmd --add-port=8080/tcp --permanent && sudo firewall-cmd --reload` |
| Firewall do provedor | "security group" / painel da nuvem | libere a porta só para os IPs necessários |
| IP público × privado / NAT | servidor atrás de roteador | encaminhamento de porta no roteador, ou VPN |
| HTTPS e domínio | certificado TLS | proxy reverso com TLS (seção 20) |

> **Atenção:** o Docker insere regras próprias no iptables, e uma porta publicada em `0.0.0.0` pode ficar
> acessível **mesmo com o ufw bloqueando**. Para limitar o acesso, use `APP_BIND=127.0.0.1` atrás de um
> proxy, o firewall do provedor ou uma VPN (por exemplo, WireGuard ou Tailscale).

Os scripts **não alteram** o firewall nem as regras de rede do host. O PostgreSQL não publica porta
nenhuma e a API só é acessível pelo Nginx.

## 14. Configuração das APIs de cotações

Todas as fontes são opcionais. Sem nenhuma, o sistema funciona com cotações manuais e avisa isso na tela
de Investimentos.

| Provedor | Ativos | Chave | Como obter |
|---|---|---|---|
| [brapi.dev](https://brapi.dev) | ações, FIIs, ETFs e BDRs da B3 (BRL) | `BRAPI_TOKEN` | crie uma conta e copie o token do painel (brapi.dev/dashboard) |
| [Alpha Vantage](https://www.alphavantage.co) | ativos internacionais (`GLOBAL_QUOTE`) | `ALPHAVANTAGE_API_KEY` | chave gratuita em alphavantage.co/support/#api-key |
| [PTAX – Banco Central](https://olinda.bcb.gov.br) | câmbio BRL por moeda | nenhuma | ativado por `FX_BCB_ENABLED=true` |

- **Tesouro, CDB, LCI/LCA, fundos e outros** não têm provedor: informe o preço ou o valor total da posição
  manualmente na tela do ativo.
- O ativo precisa ter **ticker** e "atualizar automaticamente" marcado. O provedor é escolhido pela classe
  e pela moeda: BRL + ação/FII/ETF → brapi; moeda estrangeira → Alpha Vantage.
- **Os dados não são em tempo real:** a brapi tem atraso conforme o plano, e a Alpha Vantage gratuita
  devolve o fechamento do último pregão com limite diário baixo (`ALPHAVANTAGE_DAILY_LIMIT`, padrão 25).
- `QUOTES_UPDATE_INTERVAL_MINUTES` (mínimo 5) define o intervalo do worker; `QUOTES_REQUEST_TIMEOUT_SECONDS`,
  `QUOTES_MAX_RETRIES` e `QUOTES_MIN_SECONDS_BETWEEN_REQUESTS` controlam timeout, retentativas e ritmo.
  O botão "Atualizar cotações" reaproveita resultados dos últimos 5 minutos.
- Quando uma consulta falha, a última cotação válida é mantida e o ativo é marcado como desatualizado
  depois de `QUOTES_STALE_DAYS_*`. Nenhum preço é inventado. Cada consulta (sucesso ou erro) fica visível
  em "Últimas consultas aos provedores". As chaves nunca aparecem nos logs.

## 15. Comandos dos scripts

Todos funcionam de qualquer diretório (`/caminho/financeiro/scripts/status.sh`).

| Script | O que faz |
|---|---|
| `install.sh [--port N] [--bind IP] [--yes]` | instalação nova (não sobrescreve `.env` nem regenera segredos) |
| `deploy.sh [--no-build]` | build → banco → migrações → serviços → verificação ponta a ponta |
| `update.sh [--no-pull]` | backup → `git pull --ff-only` → deploy (ver seção 17) |
| `backup.sh [DESTINO]` | `pg_dump` com o sistema rodando |
| `restore.sh ARQUIVO [--yes]` | restauração com confirmação e backup preventivo |
| `status.sh` | containers, saúde, porta, API, banco, cotações, recursos |
| `logs.sh [api\|worker\|web\|db\|migrate] [-f] [--tail N]` | logs (`-f` acompanha em tempo real) |
| `stop.sh` | para os serviços sem remover nada |
| `create-admin.sh [USUÁRIO]` / `--reset USUÁRIO` | cria usuário / troca senha |

Exemplos:

```bash
./scripts/logs.sh api -f            # acompanhar a API
./scripts/logs.sh worker --tail 50  # últimas atualizações de cotações
./scripts/backup.sh /mnt/hd-externo/financeiro
./scripts/create-admin.sh --reset felipe
```

## 16. Backup e restauração

```bash
./scripts/backup.sh                         # backups/financeiro-AAAAMMDD-HHMMSS.dump (permissão 600)
./scripts/restore.sh backups/financeiro-20261018-030000.dump
```

- O backup usa `pg_dump -Fc` (consistente com o banco em uso), é validado com `pg_restore --list` e informa
  o tamanho. Backups com mais de `BACKUP_RETENTION_DAYS` dias são removidos do diretório de destino, e cada
  remoção é listada.
- A restauração pede que você digite `RESTAURAR`, faz um backup preventivo do estado atual, recria o banco,
  restaura, aplica migrações pendentes e reinicia. Ela nunca roda automaticamente durante um deploy.
- **Backup automático diário** (cron do servidor): `crontab -e` e adicione
  `0 3 * * * /home/usuario/financeiro/scripts/backup.sh >> /home/usuario/financeiro/backups/cron.log 2>&1`
- **Tire os backups do servidor.** Um backup no mesmo disco não protege contra falha do disco ou perda do
  servidor. Exemplos: `scp usuario@servidor:~/financeiro/backups/*.dump ./` ou
  `rclone copy ~/financeiro/backups remoto:financeiro`.
- O arquivo `.dump` contém seus dados financeiros: guarde-o com o mesmo cuidado. Para restaurar em outro
  servidor ele basta (não depende das senhas antigas). Guarde também uma cópia do `.env` em local seguro
  se quiser manter as mesmas chaves de API.

## 17. Atualização segura

**Com Git (método suportado):**

```bash
./scripts/update.sh
```

O script recusa continuar se houver alterações locais em arquivos versionados (nunca faz `reset` nem
descarta nada). Depois faz backup, `git pull --ff-only`, build, migrações e verificação de saúde.

**Sem Git:** copie os arquivos novos por cima, **sem** apagar `.env` e `backups/`, e rode
`./scripts/update.sh --no-pull`.

Se a atualização falhar, os dados continuam no volume e o backup feito antes está em `backups/`. Volte
para a versão anterior (`git checkout <commit>`) e rode `./scripts/deploy.sh`. Nenhum script remove
volumes: não use `docker compose down -v`, que **apaga o banco**.

## 18. Migrações do banco

- As versões ficam em `backend/migrations/versions/` e são aplicadas pelo serviço `migrate`
  (`alembic upgrade head`) a cada deploy. Esse passo é idempotente.
- A API só inicia depois de uma migração bem-sucedida, e `/api/health` responde 503 se o banco não estiver
  na versão esperada.
- **Estratégia de evolução:** prefira migrações aditivas (novas colunas anuláveis ou com padrão). Remoções
  e renomeações devem ser feitas em duas versões (deixar de usar a coluna e só depois removê-la). Gere uma
  versão nova com `alembic revision --autogenerate -m "descrição"`, revise o arquivo e teste com `pytest`.
  Os testes aplicam todas as migrações num banco vazio.
- Ver a versão atual: `docker compose exec api python -m app.cli check-db`.

## 19. Diagnóstico de erros

| Sintoma | Verifique |
|---|---|
| `deploy.sh` para em "migrações falharam" | `./scripts/logs.sh migrate` (a aplicação anterior não foi substituída) |
| API "unhealthy" | `./scripts/logs.sh api`; `/api/health` responde 503 se o banco cair ou houver migração pendente |
| Página não abre de outra máquina | `./scripts/status.sh` (porta/bind), firewall do sistema e do provedor (seção 13) |
| "Sem acesso ao daemon do Docker" | `sudo systemctl status docker`; grupo `docker` ou `sudo` |
| Porta em uso | troque `APP_PORT` no `.env` |
| Cotações não atualizam | tela Investimentos → "Últimas consultas"; `./scripts/logs.sh worker`; chaves no `.env` |
| Worker "unhealthy" | sem batimento há mais de 5 min; `./scripts/logs.sh worker` |
| Login bloqueado | 5 tentativas erradas bloqueiam por 15 min; troque a senha com `create-admin.sh --reset` |
| Falha geral depois de reboot | `sudo systemctl enable --now docker` e `./scripts/deploy.sh --no-build` |

## 20. Segurança e limitações conhecidas

**Implementado:**
- Login obrigatório, senhas com Argon2id e sem senha padrão. O primeiro usuário é criado por comando
  interativo.
- Cookie de sessão HttpOnly e SameSite=Strict. O banco guarda só o hash do token. A sessão expira em 12 h
  (configurável).
- Proteção contra CSRF (cabeçalho obrigatório em requisições que alteram dados).
- Bloqueio de 15 min depois de 5 tentativas de login erradas.
- Validação no backend de todas as entradas, ORM com consultas parametrizadas e proteção contra injeção de
  fórmula no CSV exportado.
- Nginx com CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e sem versão no cabeçalho.
- PostgreSQL sem porta publicada e numa rede interna sem saída. A aplicação usa um usuário sem
  privilégios de superusuário.
- Containers da aplicação sem root, com sistema de arquivos somente leitura, sem capabilities e com
  `no-new-privileges`.
- Logs não registram valores financeiros, senhas nem chaves. A documentação da API fica desligada em
  produção.

**HTTPS:** a aplicação serve HTTP na porta configurada. Acessá-la **pela internet sem HTTPS é uma
configuração provisória**, aceitável só em rede controlada. Para produção, coloque um proxy com TLS na
frente, por exemplo Caddy (`financas.seudominio.com { reverse_proxy 127.0.0.1:8080 }`), com
`APP_BIND=127.0.0.1` e `COOKIE_SECURE=true`. Depois, descomente o HSTS em `infra/nginx/default.conf`.

**Limitações:**
- O bloqueio de tentativas de login fica na memória do processo da API (um único processo uvicorn) e é
  zerado quando ela reinicia. Para exposição pública, use também o rate limit do proxy ou o fail2ban.
- Todas as contas são em BRL. Ativos podem ser em outra moeda, mas o caixa é em reais.
- A TIR só aparece com 30 dias ou mais de histórico. TWR não é calculada.
- Não há regras tributárias automáticas: impostos e taxas são os valores informados.
- Saldos negativos são permitidos (cheque especial). O sistema não bloqueia uma despesa por falta de saldo.
- Não há autorização por usuário: todos os usuários cadastrados veem os mesmos dados (pensado para uso
  pessoal ou de um casal).
- Cotações dependem da disponibilidade e dos termos de cada provedor. Leia os termos de uso antes de
  ativá-los.

## 21. Migração para outro servidor

```bash
# servidor antigo
./scripts/backup.sh
scp backups/financeiro-*.dump novo-servidor:/tmp/

# servidor novo
git clone <repositório> financeiro && cd financeiro
./scripts/install.sh                      # novo .env com senhas novas
./scripts/restore.sh /tmp/financeiro-AAAAMMDD-HHMMSS.dump
# copie do .env antigo só o que quiser manter (chaves de API, porta)
./scripts/deploy.sh --no-build
```

Os usuários e senhas de login da aplicação vêm junto no backup. As senhas do PostgreSQL do servidor novo
são independentes. Depois de validar no servidor novo, desligue o antigo com `./scripts/stop.sh`.
