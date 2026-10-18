# Sobre o Arquivo

As migrações ficam em `backend/migrations/versions/` (Alembic). `migrations/env.py` lê a URL do banco de `config.get_settings()`, e `alembic.ini` aponta `script_location = %(here)s/migrations`, o que funciona de qualquer diretório.

| Versão | Conteúdo |
|---|---|
| `0001_schema_inicial` | todas as tabelas e restrições + categorias iniciais: despesas (Moradia, Alimentação, Transporte, Educação, Saúde, Lazer, Assinaturas, Compras, Impostos, Outros), receitas (Salário, Estágio, Freelance, Reembolso, Rendimentos, Outros) e as de sistema **Proventos** e **Taxas de investimento** |

## Como são aplicadas

- **Em produção:** o serviço `migrate` (`alembic upgrade head`) roda a cada deploy. A `api` e o `worker` só sobem depois que ele termina com sucesso (`service_completed_successfully`). O `deploy.sh` também roda `docker compose run --rm migrate` e para se falhar.
- **`/api/health`** responde 503 se a versão do banco for diferente do *head*.
- **Nos testes**, `conftest.py` recria o schema e aplica todas as migrações num banco vazio.

## Criar uma nova migração

````bash
cd backend
alembic revision --autogenerate -m "descrição"   # revise o arquivo gerado
alembic check                                     # "No new upgrade operations detected" = modelos e migrações iguais
````

Prefira migrações aditivas (coluna anulável ou com padrão) e faça remoções em duas versões.

> [!note] Verificado em 2026-10-18
> `alembic check` sem diferenças. `0001` aplicada como usuário **sem superusuário** (`app_infra`), criado pelo `init-app-user.sh` num PostgreSQL local.


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]
