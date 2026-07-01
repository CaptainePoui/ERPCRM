import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.payment import PaymentMethod

router = APIRouter()


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès administrateur requis")
    return current_user


# ── Schemas ───────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: datetime | None

class UserCreate(BaseModel):
    email: str
    full_name: str
    password: str
    role: str = "readonly"

class UserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None

class PaymentMethodOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    discount_rate: float
    is_active: bool

class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    discount_rate: float | None = None
    is_active: bool | None = None


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.full_name))
    return [
        UserOut(id=u.id, email=u.email, full_name=u.full_name, role=u.role.value,
                is_active=u.is_active, created_at=u.created_at, last_login=u.last_login)
        for u in result.scalars().all()
    ]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    existing = await db.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Adresse courriel déjà utilisée")
    try:
        role = UserRole(payload.role)
    except ValueError:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    u = User(email=payload.email, full_name=payload.full_name,
              hashed_password=hash_password(payload.password), role=role)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, role=u.role.value,
                   is_active=u.is_active, created_at=u.created_at, last_login=u.last_login)


@router.put("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if u.id == admin.id and payload.is_active is False:
        raise HTTPException(status_code=400, detail="Impossible de désactiver votre propre compte")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        u.hashed_password = hash_password(data.pop("password"))
    if "role" in data:
        try:
            data["role"] = UserRole(data["role"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Rôle invalide")
    for k, v in data.items():
        setattr(u, k, v)
    await db.commit()
    await db.refresh(u)
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, role=u.role.value,
                   is_active=u.is_active, created_at=u.created_at, last_login=u.last_login)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    await db.delete(u)
    await db.commit()


# ── Payment Methods ───────────────────────────────────────────────────────────

@router.get("/payment-methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(PaymentMethod).order_by(PaymentMethod.code))
    return [PaymentMethodOut(id=m.id, code=m.code, name=m.name, discount_rate=float(m.discount_rate or 0), is_active=m.is_active)
            for m in result.scalars().all()]


@router.put("/payment-methods/{method_id}", response_model=PaymentMethodOut)
async def update_payment_method(method_id: uuid.UUID, payload: PaymentMethodUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    result = await db.execute(select(PaymentMethod).where(PaymentMethod.id == method_id))
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Méthode introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await db.commit()
    await db.refresh(m)
    return PaymentMethodOut(id=m.id, code=m.code, name=m.name, discount_rate=float(m.discount_rate or 0), is_active=m.is_active)
