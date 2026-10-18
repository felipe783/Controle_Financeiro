O módulo de **infraestrutura** cobre tudo o que coloca o sistema no ar num servidor Linux:

| Peça | Nota | Arquivos |
|---|---|---|
| Imagens e serviços | [[Docker Compose (Financeiro)|Docker Compose]] | `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `infra/nginx/default.conf`, `infra/postgres/init-app-user.sh` |
| Operação | [[Scripts (Financeiro)|Scripts]] | `scripts/*.sh` |
| Tarefas programadas e administração | [[Worker e CLI (Financeiro)|Worker e CLI]] | `backend/app/worker.py`, `backend/app/cli.py` |

Variáveis de ambiente: `.env.example` (comentado), criado como `.env` pelo `install.sh` com senhas geradas e permissão 600. O `.env` real é ignorado pelo Git e pelo Docker. A tabela completa está no `README.md` (seção 8).


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Infra (Financeiro)|!Modulo Infra]]
