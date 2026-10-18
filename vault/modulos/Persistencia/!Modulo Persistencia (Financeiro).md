O módulo de **Persistência** reúne o modelo de dados (`models.py`), as regras numéricas (`money.py`), a conexão (`db.py`), a configuração (`config.py`) e as migrações (`migrations/`).

- **Banco:** só PostgreSQL. O código usa advisory locks, índices parciais, `ON CONFLICT` e `NULLS NOT DISTINCT` (PostgreSQL 15 ou superior). Em produção roda num container com o volume nomeado `pgdata`.
- **Conexão:** `config.Settings.sqlalchemy_url` usa `DATABASE_URL` se ele existir; senão monta a URL com `URL.create` a partir de `POSTGRES_HOST/PORT/DB/USER/PASSWORD`, escapando a senha. Em `db.py`, `get_db()` entrega uma `Session` por requisição e a fecha no fim, o que faz rollback do que não foi commitado.
- **Números (`money.py`):** dinheiro em `Numeric(18,2)` com `ROUND_HALF_UP`; quantidade e preço em `Numeric(24,8)`; câmbio em `Numeric(18,8)`. `safe_div` devolve `None` quando o divisor é zero.

Notas: [[Models (Financeiro)|Models]] · [[Migrações (Financeiro)|Migrações]]


---
**Projeto Pai:** [[_Financeiro]] · **Módulo:** [[!Modulo Persistencia (Financeiro)|!Modulo Persistencia]]
