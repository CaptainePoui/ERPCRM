import re
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.models.payment import PaymentMethod
from app.models.status import Status, EntityStatus

router = APIRouter()


async def require_admin(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> User:
    """Privilege « Administration » (modifier) -- TASK-007.4 ; avant : le role administrateur seulement."""
    from app.core import privileges
    if not privileges.allows(await privileges.for_user_id(db, current_user.id), "administration", privileges.MODIFIER):
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
    lock: dict = {}            # TASK-001.1 : bloqué, banni, essais ratés


def _user_out(u) -> "UserOut":
    from app.core import login_guard
    return UserOut(id=u.id, email=u.email, full_name=u.full_name, role=u.role.value,
                   is_active=u.is_active, created_at=u.created_at, last_login=u.last_login, lock=login_guard.state(u))

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
        _user_out(u) for u in result.scalars().all()
    ]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from sqlalchemy import func
    payload.email = payload.email.strip().lower()
    existing = await db.execute(select(User).where(func.lower(User.email) == payload.email))
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
    return _user_out(u)


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
    if "email" in data:                     # courriel de connexion : sa boite personnelle suit, inscrit au journal
        from app.core.accounts import set_login_email
        await set_login_email(db, u, data.pop("email"), admin)
    if "role" in data:
        try:
            data["role"] = UserRole(data["role"])
        except ValueError:
            raise HTTPException(status_code=400, detail="Rôle invalide")
    for k, v in data.items():
        setattr(u, k, v)
    from app.core import privileges
    await privileges.ensure_someone_full(db)
    await db.commit()
    await db.refresh(u)
    return _user_out(u)


@router.put("/users/{user_id}/unlock", response_model=UserOut)
async def unlock_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    """Débloque un compte bloqué ou banni après des mauvais mots de passe (TASK-001.1)."""
    from app.core import login_guard
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    login_guard.unlock(u)
    await db.commit()
    await db.refresh(u)
    return _user_out(u)


@router.get("/login-security")
async def get_login_security(_: User = Depends(require_admin)):
    from app.core import login_guard
    return await login_guard.load(fresh=True)


@router.put("/login-security")
async def put_login_security(body: dict, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from app.core import login_guard
    try:
        return await login_guard.save(db, body)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if u.id == admin.id:
        raise HTTPException(status_code=400, detail="Impossible de supprimer votre propre compte")
    await db.delete(u)
    from app.core import privileges
    await privileges.ensure_someone_full(db)
    await db.commit()


# ── Payment Methods ───────────────────────────────────────────────────────────

@router.get("/payment-methods", response_model=list[PaymentMethodOut])
async def list_payment_methods(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from app.api.v1.endpoints.settings import barter_enabled
    q = select(PaymentMethod).order_by(PaymentMethod.code)
    if not await barter_enabled(db):
        q = q.where(PaymentMethod.code != "troc")       # option Echanges decochee
    result = await db.execute(q)
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


# ── Pastilles (TASK-002.3) ────────────────────────────────────────────────────
# Les pastilles des compagnies et des contacts (client, fournisseur, sous-traitant...) : ajouter, renommer, couleur,
# désactiver. Jamais supprimées : une pastille désactivée ne s'offre plus, mais reste sur les fiches qui la portent.

class StatusAdminOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None
    is_active: bool
    used: int
    company_tabs: list[str] = []
    contact_tabs: list[str] = []
    applies_to: str = "both"


class StatusAdminIn(BaseModel):
    name: str | None = None
    color: str | None = None
    is_active: bool | None = None
    company_tabs: list[str] | None = None     # onglets apportés sur la fiche compagnie (TASK-002.13)
    contact_tabs: list[str] | None = None     # onglets apportés sur la fiche contact (TASK-002.17)
    applies_to: str | None = None             # both | companies | contacts (TASK-002.14)


def _clean_status(payload: StatusAdminIn) -> dict:
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = (data["name"] or "").strip()
        if not data["name"]:
            raise HTTPException(status_code=422, detail="Le nom est requis")
    if data.get("color") is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", data["color"]):
        raise HTTPException(status_code=422, detail="Couleur invalide")
    if data.get("company_tabs") is not None:
        from app.core.company_tabs import OPTIONAL, clean
        unknown = [t for t in data["company_tabs"] if t not in OPTIONAL]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Onglet inconnu : {', '.join(unknown)}")
        data["company_tabs"] = clean(data["company_tabs"])
    if data.get("contact_tabs") is not None:
        from app.core import contact_tabs as ct
        unknown = [t for t in data["contact_tabs"] if t not in ct.OPTIONAL]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Onglet inconnu : {', '.join(unknown)}")
        data["contact_tabs"] = ct.clean(data["contact_tabs"])
    if data.get("applies_to") is not None and data["applies_to"] not in ("both", "companies", "contacts"):
        raise HTTPException(status_code=422, detail="S'offre à : compagnies, contacts ou les deux")
    return data


async def _status_out(db: AsyncSession, s: Status) -> StatusAdminOut:
    used = (await db.execute(select(func.count()).select_from(EntityStatus).where(EntityStatus.status_id == s.id))).scalar_one()
    return StatusAdminOut(id=s.id, name=s.name, color=s.color, is_active=s.is_active, used=used, company_tabs=s.company_tabs or [],
                          contact_tabs=s.contact_tabs or [], applies_to=s.applies_to or "both")


async def _name_taken(db: AsyncSession, name: str, exclude: uuid.UUID | None = None) -> bool:
    q = select(Status.id).where(func.lower(Status.name) == name.lower())
    if exclude:
        q = q.where(Status.id != exclude)
    return (await db.execute(q)).first() is not None


@router.get("/statuses", response_model=list[StatusAdminOut])
async def list_statuses_admin(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    rows = (await db.execute(select(Status).order_by(Status.name))).scalars().all()
    return [await _status_out(db, s) for s in rows]


@router.post("/statuses", response_model=StatusAdminOut, status_code=status.HTTP_201_CREATED)
async def create_status(payload: StatusAdminIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    data = _clean_status(payload)
    if not data.get("name"):
        raise HTTPException(status_code=422, detail="Le nom est requis")
    if await _name_taken(db, data["name"]):
        raise HTTPException(status_code=409, detail="Cette pastille existe déjà")
    s = Status(name=data["name"], color=data.get("color") or "#6B7280", is_active=data.get("is_active", True), is_system=False,
               company_tabs=data.get("company_tabs") or [], contact_tabs=data.get("contact_tabs") or [],
               applies_to=data.get("applies_to") or "both")
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return await _status_out(db, s)


@router.put("/statuses/{status_id}", response_model=StatusAdminOut)
async def update_status(status_id: uuid.UUID, payload: StatusAdminIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    s = await db.get(Status, status_id)
    if not s:
        raise HTTPException(status_code=404, detail="Pastille introuvable")
    data = _clean_status(payload)
    if "name" in data and await _name_taken(db, data["name"], exclude=s.id):
        raise HTTPException(status_code=409, detail="Cette pastille existe déjà")
    for k, v in data.items():
        if v is not None:
            setattr(s, k, v)
    await db.commit()
    await db.refresh(s)
    return await _status_out(db, s)


# ── Spécialisations des contacts (TASK-002.18) ────────────────────────────────
# Les « fonctions » d'un contact chez une compagnie (TI, réseau, facturation, propriétaire…) : ajouter, renommer, couleur,
# onglets de la fiche contact, désactiver. Jamais supprimées : désactivée = plus offerte, reste sur les contacts qui l'ont.

class FunctionAdminOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None
    is_active: bool
    contact_tabs: list[str] = []
    used: int


class FunctionAdminIn(BaseModel):
    name: str | None = None
    color: str | None = None
    is_active: bool | None = None
    contact_tabs: list[str] | None = None


async def _function_out(db: AsyncSession, f) -> FunctionAdminOut:
    from app.models.contact_company import ContactCompanyFunction
    used = (await db.execute(select(func.count()).select_from(ContactCompanyFunction).where(ContactCompanyFunction.function_id == f.id))).scalar_one()
    return FunctionAdminOut(id=f.id, name=f.name, color=f.color, is_active=f.is_active, contact_tabs=f.contact_tabs or [], used=used)


def _clean_function(p: FunctionAdminIn) -> dict:
    from app.core import contact_tabs as ct
    data = p.model_dump(exclude_unset=True)
    if "name" in data:
        data["name"] = (data["name"] or "").strip()[:100]
        if not data["name"]:
            raise HTTPException(status_code=422, detail="Le nom est requis")
    if data.get("color") is not None and not re.fullmatch(r"#[0-9A-Fa-f]{6}", data["color"]):
        raise HTTPException(status_code=422, detail="Couleur invalide")
    if data.get("contact_tabs") is not None:
        unknown = [t for t in data["contact_tabs"] if t not in ct.OPTIONAL]
        if unknown:
            raise HTTPException(status_code=422, detail=f"Onglet inconnu : {', '.join(unknown)}")
        data["contact_tabs"] = ct.clean(data["contact_tabs"])
    return data


@router.get("/functions", response_model=list[FunctionAdminOut])
async def list_functions_admin(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.function import Function
    rows = (await db.execute(select(Function).order_by(func.lower(Function.name)))).scalars().all()
    return [await _function_out(db, f) for f in rows]


@router.post("/functions", response_model=FunctionAdminOut, status_code=status.HTTP_201_CREATED)
async def create_function(payload: FunctionAdminIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.function import Function
    data = _clean_function(payload)
    if not data.get("name"):
        raise HTTPException(status_code=422, detail="Le nom est requis")
    if (await db.execute(select(Function.id).where(func.lower(Function.name) == data["name"].lower()))).first():
        raise HTTPException(status_code=409, detail="Cette spécialisation existe déjà")
    f = Function(name=data["name"], color=data.get("color") or "#6B7280", is_active=data.get("is_active", True),
                 contact_tabs=data.get("contact_tabs") if data.get("contact_tabs") is not None else ["courriels"])
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return await _function_out(db, f)


@router.put("/functions/{function_id}", response_model=FunctionAdminOut)
async def update_function(function_id: uuid.UUID, payload: FunctionAdminIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    from app.models.function import Function
    f = await db.get(Function, function_id)
    if not f:
        raise HTTPException(status_code=404, detail="Spécialisation introuvable")
    data = _clean_function(payload)
    if "name" in data and (await db.execute(select(Function.id).where(func.lower(Function.name) == data["name"].lower(), Function.id != f.id))).first():
        raise HTTPException(status_code=409, detail="Cette spécialisation existe déjà")
    from app.core.late_fees import BILLING_FUNCTIONS
    if "name" in data and f.name.lower() in BILLING_FUNCTIONS and data["name"].lower() != f.name.lower():
        raise HTTPException(status_code=400, detail=f"« {f.name} » sert à trouver l'adresse des factures : son nom ne se change pas")
    for k, v in data.items():
        if v is not None:
            setattr(f, k, v)
    await db.commit()
    await db.refresh(f)
    return await _function_out(db, f)
