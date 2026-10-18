"""Gestão de usuários: exclusiva de administradores (verificado aqui, não só na interface)."""

from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import auth
from app.db import get_db
from app.models import User, UserSession
from app.schemas import UserAdminOut, UserCreateIn, UserUpdateIn
from app.services.common import Conflict, DomainError, audit, get_or_404

router = APIRouter(dependencies=[Depends(auth.require_admin)])


@router.get("/users", response_model=list[UserAdminOut])
def list_users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.post("/users", response_model=UserAdminOut, status_code=201)
def create_user(data: UserCreateIn, db: Session = Depends(get_db), admin: User = Depends(auth.require_admin)):
    try:
        user = auth.create_user(db, data.username, data.password, is_admin=data.is_admin, commit=False)
    except auth.DuplicateUser as exc:
        raise Conflict(str(exc)) from exc
    except ValueError as exc:
        raise DomainError(str(exc)) from exc
    audit(db, "user", user.id, "create", after={"username": user.username, "is_admin": user.is_admin},
          user_id=admin.id)
    db.commit()
    return user


@router.put("/users/{user_id}", response_model=UserAdminOut)
def update_user(user_id: int, data: UserUpdateIn, db: Session = Depends(get_db),
                admin: User = Depends(auth.require_admin)):
    user = get_or_404(db, User, user_id, "Usuário")
    if user.id == admin.id and (not data.is_admin or not data.is_active):
        raise Conflict("Você não pode remover o próprio acesso de administrador nem desativar a própria conta.")
    losing_admin = user.is_admin and user.is_active and not (data.is_admin and data.is_active)
    if losing_admin:
        # FOR UPDATE: uma segunda alteração concorrente espera, recontagem vê o resultado da primeira.
        admins = db.scalars(select(User.id).where(User.is_admin.is_(True), User.is_active.is_(True))
                            .with_for_update()).all()
        db.refresh(user)
        if len(admins) <= 1 or not (user.is_admin and user.is_active):
            raise Conflict("O sistema precisa de pelo menos um administrador ativo.")
    before = {"is_admin": user.is_admin, "is_active": user.is_active}
    user.is_admin, user.is_active = data.is_admin, data.is_active
    if not data.is_active:
        db.execute(delete(UserSession).where(UserSession.user_id == user.id))  # desativar encerra as sessões
    audit(db, "user", user.id, "update", before=before, after=data.model_dump(), user_id=admin.id)
    db.commit()
    return user
