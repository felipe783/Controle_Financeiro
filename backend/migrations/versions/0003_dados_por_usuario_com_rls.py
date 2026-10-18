"""dados financeiros por usuario, isolados por row-level security

APAGA todos os dados financeiros existentes (decisão do dono do projeto em 2026-10-18): o sistema passa de
um conjunto compartilhado para um conjunto por usuário, e o que existia não tinha dono definido.
Usuários e senhas são mantidos; cada usuário recebe de novo as categorias padrão.

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-18 18:35:25.243606
"""
from alembic import op
import sqlalchemy as sa


revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None

# Tabelas cujas linhas sempre têm dono.
# Inclusive câmbio e logs de cotação: uma linha comum revelaria a outros usuários em que moedas alguém investe.
OWNED = ["accounts", "assets", "budgets", "categories", "fx_rates", "goal_contributions", "goals",
         "investment_operations", "liabilities", "liability_balances", "net_worth_snapshots", "quote_fetch_logs",
         "quotes", "recurrence_rules", "transactions"]
FINANCIAL = OWNED + ["audit_logs"]

# Cópia fixa (migrações não importam o código da aplicação, que muda com o tempo).
DEFAULT_CATEGORIES = (
    [(n, "expense", False) for n in ("Moradia", "Alimentação", "Transporte", "Educação", "Saúde", "Lazer",
                                     "Assinaturas", "Compras", "Impostos", "Outros")]
    + [(n, "income", False) for n in ("Salário", "Estágio", "Freelance", "Reembolso", "Rendimentos", "Outros")]
    + [("Proventos", "income", True), ("Taxas de investimento", "expense", True)]
)


def upgrade() -> None:
    op.execute("""
        CREATE FUNCTION app_user_id() RETURNS integer LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('app.user_id', true), '')::integer $$
    """)
    op.execute(f"TRUNCATE {', '.join(FINANCIAL)} RESTART IDENTITY CASCADE")
    op.execute("DELETE FROM system_status WHERE key LIKE 'quotes_last_run%'")

    for t in OWNED:
        op.add_column(t, sa.Column("user_id", sa.Integer(), server_default=sa.text("app_user_id()"), nullable=False))
        op.create_foreign_key(f"fk_{t}_user", t, "users", ["user_id"], ["id"], ondelete="CASCADE")
        op.create_index(f"ix_{t}_user_id", t, ["user_id"])
    op.alter_column("audit_logs", "user_id", server_default=sa.text("app_user_id()"))

    op.drop_constraint("accounts_name_key", "accounts", type_="unique")
    op.create_unique_constraint("uq_accounts_user_name", "accounts", ["user_id", "name"])
    op.drop_constraint("uq_categories_kind_parent_name", "categories", type_="unique")
    op.create_unique_constraint("uq_categories_user_kind_parent_name", "categories",
                                ["user_id", "kind", "parent_id", "name"], postgresql_nulls_not_distinct=True)
    op.drop_constraint("net_worth_snapshots_snapshot_date_key", "net_worth_snapshots", type_="unique")
    op.create_unique_constraint("uq_snapshots_user_date", "net_worth_snapshots", ["user_id", "snapshot_date"])
    op.drop_constraint("uq_fx_currency_date_source", "fx_rates", type_="unique")
    op.create_unique_constraint("uq_fx_user_currency_date_source", "fx_rates",
                                ["user_id", "currency", "reference_date", "source"], postgresql_nulls_not_distinct=True)

    categories = sa.table("categories", sa.column("user_id"), sa.column("name"), sa.column("kind"),
                          sa.column("is_system"), sa.column("archived"))
    user_ids = [r[0] for r in op.get_bind().execute(sa.text("SELECT id FROM users ORDER BY id"))]
    rows = [{"user_id": uid, "name": n, "kind": k, "is_system": system, "archived": False}
            for uid in user_ids for n, k, system in DEFAULT_CATEGORIES]
    if rows:
        op.bulk_insert(categories, rows)

    # FORCE: as políticas valem também para o dono das tabelas (o usuário com que a aplicação conecta).
    for t in OWNED + ["audit_logs"]:
        op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY owner_only ON {t} USING (user_id = app_user_id()) "
                   f"WITH CHECK (user_id = app_user_id())")


def downgrade() -> None:
    """Volta ao esquema compartilhado. Os dados por usuário não têm como ser mesclados: são apagados."""
    for t in OWNED + ["audit_logs"]:
        op.execute(f"DROP POLICY owner_only ON {t}")
    for t in FINANCIAL:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {t} DISABLE ROW LEVEL SECURITY")
    op.execute(f"TRUNCATE {', '.join(FINANCIAL)} RESTART IDENTITY CASCADE")

    op.drop_constraint("uq_fx_user_currency_date_source", "fx_rates", type_="unique")
    op.drop_constraint("uq_snapshots_user_date", "net_worth_snapshots", type_="unique")
    op.drop_constraint("uq_categories_user_kind_parent_name", "categories", type_="unique")
    op.drop_constraint("uq_accounts_user_name", "accounts", type_="unique")
    op.alter_column("audit_logs", "user_id", server_default=None)
    for t in OWNED:
        op.drop_column(t, "user_id")  # leva junto a chave estrangeira e o índice
    op.create_unique_constraint("uq_fx_currency_date_source", "fx_rates", ["currency", "reference_date", "source"])
    op.create_unique_constraint("net_worth_snapshots_snapshot_date_key", "net_worth_snapshots", ["snapshot_date"])
    op.create_unique_constraint("uq_categories_kind_parent_name", "categories", ["kind", "parent_id", "name"],
                                postgresql_nulls_not_distinct=True)
    op.create_unique_constraint("accounts_name_key", "accounts", ["name"])
    op.execute("DROP FUNCTION app_user_id()")

    categories = sa.table("categories", sa.column("name"), sa.column("kind"), sa.column("is_system"),
                          sa.column("archived"))
    op.bulk_insert(categories, [{"name": n, "kind": k, "is_system": system, "archived": False}
                                for n, k, system in DEFAULT_CATEGORIES])
