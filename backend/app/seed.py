"""Dados iniciais de cada usuário novo."""

from sqlalchemy.orm import Session

from app.db import acting_as
from app.models import Category

# Mesma lista da migração 0003. "Proventos" e "Taxas de investimento" são de sistema: o módulo de
# investimentos lança nelas (investments._system_category).
DEFAULT_CATEGORIES = (
    [(n, "expense", False) for n in ("Moradia", "Alimentação", "Transporte", "Educação", "Saúde", "Lazer",
                                     "Assinaturas", "Compras", "Impostos", "Outros")]
    + [(n, "income", False) for n in ("Salário", "Estágio", "Freelance", "Reembolso", "Rendimentos", "Outros")]
    + [("Proventos", "income", True), ("Taxas de investimento", "expense", True)]
)


def seed_user(db: Session, user_id: int) -> None:
    """Cria as categorias padrão do usuário na transação atual (sem commit)."""
    with acting_as(db, user_id):
        db.add_all([Category(name=n, kind=k, is_system=system, archived=False) for n, k, system in DEFAULT_CATEGORIES])
