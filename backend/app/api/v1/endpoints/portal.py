import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, decode_token
from app.models.portal import PortalUser
from app.models.invoice import Invoice
from app.models.ticket import Ticket
from app.models.equipment import Equipment
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User

router = APIRouter()
portal_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/login")


# ── Schemas ───────────────────────────────────────────────────────────────────

class PortalLoginRequest(BaseModel):
    email: str
    password: str

class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    portal_user_id: str
    company_id: str
    full_name: str
    permissions: dict

TELEPHONY_PERM_FIELDS = [
    "can_view_own_extension", "can_edit_extension_name", "can_edit_call_forward",
    "can_edit_dnd", "can_edit_voicemail", "can_view_own_cdr", "can_view_voicemail_messages",
    "can_receive_alerts", "can_manage_telephony", "can_manage_ivr", "can_manage_groups",
    "can_manage_audio_prompts", "can_view_company_cdr",
]


class PortalUserOut(BaseModel):
    id: uuid.UUID
    contact_id: uuid.UUID | None
    company_id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    can_view_invoices: bool
    can_view_tickets: bool
    can_create_tickets: bool
    can_view_equipment: bool
    can_view_own_extension: bool
    can_edit_extension_name: bool
    can_edit_call_forward: bool
    can_edit_dnd: bool
    can_edit_voicemail: bool
    can_view_own_cdr: bool
    can_view_voicemail_messages: bool
    can_receive_alerts: bool
    can_manage_telephony: bool
    can_manage_ivr: bool
    can_manage_groups: bool
    can_manage_audio_prompts: bool
    can_view_company_cdr: bool
    notes: str | None
    created_at: datetime
    last_login: datetime | None

class PortalUserCreate(BaseModel):
    contact_id: uuid.UUID | None = None
    company_id: uuid.UUID
    email: str
    password: str
    full_name: str
    can_view_invoices: bool = True
    can_view_tickets: bool = True
    can_create_tickets: bool = False
    can_view_equipment: bool = False
    can_view_own_extension: bool = False
    can_edit_extension_name: bool = False
    can_edit_call_forward: bool = False
    can_edit_dnd: bool = False
    can_edit_voicemail: bool = False
    can_view_own_cdr: bool = False
    can_view_voicemail_messages: bool = False
    can_receive_alerts: bool = False
    can_manage_telephony: bool = False
    can_manage_ivr: bool = False
    can_manage_groups: bool = False
    can_manage_audio_prompts: bool = False
    can_view_company_cdr: bool = False
    notes: str | None = None

class PortalUserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    password: str | None = None
    is_active: bool | None = None
    can_view_invoices: bool | None = None
    can_view_tickets: bool | None = None
    can_create_tickets: bool | None = None
    can_view_equipment: bool | None = None
    can_view_own_extension: bool | None = None
    can_edit_extension_name: bool | None = None
    can_edit_call_forward: bool | None = None
    can_edit_dnd: bool | None = None
    can_edit_voicemail: bool | None = None
    can_view_own_cdr: bool | None = None
    can_view_voicemail_messages: bool | None = None
    can_receive_alerts: bool | None = None
    can_manage_telephony: bool | None = None
    can_manage_ivr: bool | None = None
    can_manage_groups: bool | None = None
    can_manage_audio_prompts: bool | None = None
    can_view_company_cdr: bool | None = None
    notes: str | None = None


def _perms(u: PortalUser) -> dict:
    return {
        "can_view_invoices": u.can_view_invoices,
        "can_view_tickets": u.can_view_tickets,
        "can_create_tickets": u.can_create_tickets,
        "can_view_equipment": u.can_view_equipment,
        **{f: getattr(u, f) for f in TELEPHONY_PERM_FIELDS},
    }

def _out(u: PortalUser) -> PortalUserOut:
    return PortalUserOut(
        id=u.id, contact_id=u.contact_id, company_id=u.company_id,
        email=u.email, full_name=u.full_name, is_active=u.is_active,
        can_view_invoices=u.can_view_invoices, can_view_tickets=u.can_view_tickets,
        can_create_tickets=u.can_create_tickets, can_view_equipment=u.can_view_equipment,
        notes=u.notes, created_at=u.created_at, last_login=u.last_login,
        **{f: getattr(u, f) for f in TELEPHONY_PERM_FIELDS},
    )


async def get_portal_user(token: str = Depends(portal_oauth2), db: AsyncSession = Depends(get_db)) -> PortalUser:
    try:
        payload = decode_token(token)
        if payload.get("type") != "portal":
            raise JWTError()
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token portail invalide")
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u or not u.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Accès portail refusé")
    return u


# ── Portal Auth ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=PortalTokenResponse)
async def portal_login(payload: PortalLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PortalUser).where(PortalUser.email == payload.email))
    u = result.scalar_one_or_none()
    if not u or not verify_password(payload.password, u.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    if not u.is_active:
        raise HTTPException(status_code=403, detail="Compte portail désactivé")
    u.last_login = datetime.now(timezone.utc)
    await db.commit()
    token = create_access_token({"sub": str(u.id), "type": "portal", "company_id": str(u.company_id)}, expires_minutes=60 * 24 * 7)
    return PortalTokenResponse(
        access_token=token, portal_user_id=str(u.id),
        company_id=str(u.company_id), full_name=u.full_name, permissions=_perms(u),
    )

@router.get("/me")
async def portal_me(u: PortalUser = Depends(get_portal_user)):
    return {"id": str(u.id), "company_id": str(u.company_id), "full_name": u.full_name,
            "email": u.email, "permissions": _perms(u)}


# ── Portal Data ───────────────────────────────────────────────────────────────

@router.get("/invoices")
async def portal_invoices(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_invoices:
        raise HTTPException(status_code=403, detail="Accès factures non autorisé")
    result = await db.execute(
        select(Invoice).where(Invoice.company_id == u.company_id).order_by(Invoice.created_at.desc())
    )
    invs = result.scalars().all()
    return [{"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status,
             "total_ttc": float(i.total_ttc or 0), "due_date": i.due_date, "created_at": i.created_at}
            for i in invs]

@router.get("/tickets")
async def portal_tickets(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_tickets:
        raise HTTPException(status_code=403, detail="Accès tickets non autorisé")
    result = await db.execute(
        select(Ticket).where(Ticket.company_id == u.company_id).order_by(Ticket.created_at.desc())
    )
    tickets = result.scalars().all()
    return [{"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority, "created_at": t.created_at}
            for t in tickets]

@router.post("/tickets")
async def portal_create_ticket(body: dict, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_create_tickets:
        raise HTTPException(status_code=403, detail="Création ticket non autorisée")
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre requis")
    t = Ticket(company_id=u.company_id, title=title, description=body.get("description"), priority="normal")
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": str(t.id), "title": t.title, "status": t.status}

@router.get("/equipment")
async def portal_equipment(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_equipment:
        raise HTTPException(status_code=403, detail="Accès équipements non autorisé")
    result = await db.execute(
        select(Equipment).where(Equipment.company_id == u.company_id).order_by(Equipment.name)
    )
    eqs = result.scalars().all()
    return [{"id": str(e.id), "name": e.name, "category": e.category, "brand": e.brand,
             "model": e.model, "status": e.status, "ip_address": e.ip_address}
            for e in eqs]


# ── Admin: Portal Users Management ───────────────────────────────────────────

@router.get("/users", response_model=list[PortalUserOut])
async def list_portal_users(company_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(PortalUser).order_by(PortalUser.full_name)
    if company_id:
        q = q.where(PortalUser.company_id == company_id)
    result = await db.execute(q)
    return [_out(u) for u in result.scalars().all()]

@router.post("/users", response_model=PortalUserOut, status_code=status.HTTP_201_CREATED)
async def create_portal_user(payload: PortalUserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    existing = await db.execute(select(PortalUser).where(PortalUser.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Courriel déjà utilisé")
    data = payload.model_dump()
    pw = data.pop("password")
    u = PortalUser(**data, hashed_password=hash_password(pw))
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return _out(u)

@router.put("/users/{user_id}", response_model=PortalUserOut)
async def update_portal_user(user_id: uuid.UUID, payload: PortalUserUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur portail introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        u.hashed_password = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(u, k, v)
    await db.commit()
    await db.refresh(u)
    return _out(u)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portal_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur portail introuvable")
    await db.delete(u)
    await db.commit()
