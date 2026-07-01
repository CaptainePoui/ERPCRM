import uuid
import base64
import hashlib
from datetime import datetime, timezone
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.api.v1.endpoints.auth import get_current_user
from app.models.maintenance import ClientAccess
from app.models.user import User

router = APIRouter()

# Fernet key derived from SECRET_KEY — no extra env var needed
_fernet = Fernet(base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest()))


def _encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()

def _decrypt(value: str) -> str:
    try:
        return _fernet.decrypt(value.encode()).decode()
    except Exception:
        return ""


ACCESS_TYPES = ["anydesk", "vpn_l2tp", "vpn_openvpn", "rdp", "ssh", "web", "autre"]

TYPE_LABELS = {
    "anydesk":     "AnyDesk",
    "vpn_l2tp":    "VPN L2TP",
    "vpn_openvpn": "VPN OpenVPN",
    "rdp":         "Bureau à distance (RDP)",
    "ssh":         "SSH",
    "web":         "Interface web",
    "autre":       "Autre",
}


# ── Schemas ──────────────────────────────────────────────────────────────────

class AccessOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    access_type: str
    type_label: str
    name: str
    host: str | None
    username: str | None
    notes: str | None
    has_password: bool
    updated_at: datetime

class AccessDetail(AccessOut):
    password: str | None

class AccessCreate(BaseModel):
    access_type: str
    name: str
    host: str | None = None
    username: str | None = None
    password: str | None = None
    notes: str | None = None

class AccessUpdate(BaseModel):
    access_type: str | None = None
    name: str | None = None
    host: str | None = None
    username: str | None = None
    password: str | None = None
    notes: str | None = None


def _build(a: ClientAccess, reveal: bool = False) -> AccessOut | AccessDetail:
    base = dict(
        id=a.id,
        company_id=a.company_id,
        access_type=a.access_type,
        type_label=TYPE_LABELS.get(a.access_type, a.access_type),
        name=a.name,
        host=a.host,
        username=a.username,
        notes=a.notes,
        has_password=bool(a.encrypted_password),
        updated_at=a.updated_at,
    )
    if reveal:
        return AccessDetail(**base, password=_decrypt(a.encrypted_password) if a.encrypted_password else None)
    return AccessOut(**base)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/company/{company_id}", response_model=list[AccessOut])
async def list_access(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(ClientAccess).where(ClientAccess.company_id == company_id).order_by(ClientAccess.access_type, ClientAccess.name)
    )
    return [_build(a) for a in result.scalars().all()]


@router.post("/company/{company_id}", response_model=AccessOut, status_code=status.HTTP_201_CREATED)
async def create_access(company_id: uuid.UUID, payload: AccessCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.access_type not in ACCESS_TYPES:
        raise HTTPException(status_code=400, detail=f"Type invalide: {payload.access_type}")
    a = ClientAccess(
        company_id=company_id,
        access_type=payload.access_type,
        name=payload.name,
        host=payload.host,
        username=payload.username,
        encrypted_password=_encrypt(payload.password) if payload.password else None,
        notes=payload.notes,
    )
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return _build(a)


@router.get("/{access_id}/reveal", response_model=AccessDetail)
async def reveal_access(access_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(ClientAccess).where(ClientAccess.id == access_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accès introuvable")
    return _build(a, reveal=True)


@router.put("/{access_id}", response_model=AccessOut)
async def update_access(access_id: uuid.UUID, payload: AccessUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(ClientAccess).where(ClientAccess.id == access_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accès introuvable")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "password":
            a.encrypted_password = _encrypt(value) if value else None
        else:
            setattr(a, field, value)
    a.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(a)
    return _build(a)


@router.delete("/{access_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_access(access_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(ClientAccess).where(ClientAccess.id == access_id))
    a = result.scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Accès introuvable")
    await db.delete(a)
    await db.commit()
