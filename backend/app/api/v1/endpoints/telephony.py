import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.telephony import DID, Extension
from app.models.user import User

router = APIRouter()

DID_TYPES = {"did": "DID", "sip_trunk": "Trunk SIP", "toll_free": "Sans frais"}
DID_STATUSES = {"actif": "Actif", "inactif": "Inactif", "en_transit": "En transit (portage)"}


class DIDOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    number: str
    label: str | None
    carrier: str | None
    did_type: str
    type_label: str
    status: str
    status_label: str
    porting_date: date | None
    notes: str | None
    model_config = {"from_attributes": True}

class DIDCreate(BaseModel):
    number: str
    label: str | None = None
    carrier: str | None = None
    did_type: str = "did"
    status: str = "actif"
    porting_date: date | None = None
    notes: str | None = None

class DIDUpdate(BaseModel):
    number: str | None = None
    label: str | None = None
    carrier: str | None = None
    did_type: str | None = None
    status: str | None = None
    porting_date: date | None = None
    notes: str | None = None

class ExtOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    did_id: uuid.UUID | None
    did_number: str | None
    extension: str
    name: str
    voicemail_email: str | None
    is_active: bool

class ExtCreate(BaseModel):
    extension: str
    name: str
    did_id: uuid.UUID | None = None
    voicemail_email: str | None = None
    is_active: bool = True

class ExtUpdate(BaseModel):
    extension: str | None = None
    name: str | None = None
    did_id: uuid.UUID | None = None
    voicemail_email: str | None = None
    is_active: bool | None = None


def _build_did(d: DID) -> DIDOut:
    return DIDOut(
        id=d.id, company_id=d.company_id, number=d.number, label=d.label,
        carrier=d.carrier, did_type=d.did_type, type_label=DID_TYPES.get(d.did_type, d.did_type),
        status=d.status, status_label=DID_STATUSES.get(d.status, d.status),
        porting_date=d.porting_date, notes=d.notes,
    )

def _build_ext(e: Extension) -> ExtOut:
    return ExtOut(
        id=e.id, company_id=e.company_id, did_id=e.did_id,
        did_number=e.did.number if e.did else None,
        extension=e.extension, name=e.name,
        voicemail_email=e.voicemail_email, is_active=e.is_active,
    )


# ── DID Endpoints ─────────────────────────────────────────────────────────────

@router.get("/company/{company_id}/dids", response_model=list[DIDOut])
async def list_dids(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.company_id == company_id).order_by(DID.number))
    return [_build_did(d) for d in result.scalars().all()]

@router.post("/company/{company_id}/dids", response_model=DIDOut, status_code=status.HTTP_201_CREATED)
async def create_did(company_id: uuid.UUID, payload: DIDCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = DID(company_id=company_id, **payload.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _build_did(d)

@router.put("/dids/{did_id}", response_model=DIDOut)
async def update_did(did_id: uuid.UUID, payload: DIDUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.id == did_id))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="DID introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    await db.commit()
    await db.refresh(d)
    return _build_did(d)

@router.delete("/dids/{did_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_did(did_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.id == did_id))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="DID introuvable")
    await db.delete(d)
    await db.commit()


# ── Extension Endpoints ───────────────────────────────────────────────────────

@router.get("/company/{company_id}/extensions", response_model=list[ExtOut])
async def list_extensions(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Extension).options(selectinload(Extension.did))
        .where(Extension.company_id == company_id).order_by(Extension.extension)
    )
    return [_build_ext(e) for e in result.scalars().all()]

@router.post("/company/{company_id}/extensions", response_model=ExtOut, status_code=status.HTTP_201_CREATED)
async def create_extension(company_id: uuid.UUID, payload: ExtCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    e = Extension(company_id=company_id, **payload.model_dump())
    db.add(e)
    await db.flush()
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == e.id))
    e = result.scalar_one()
    await db.commit()
    return _build_ext(e)

@router.put("/extensions/{ext_id}", response_model=ExtOut)
async def update_extension(ext_id: uuid.UUID, payload: ExtUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == ext_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Extension introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    await db.commit()
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == ext_id))
    return _build_ext(result.scalar_one())

@router.delete("/extensions/{ext_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_extension(ext_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Extension).where(Extension.id == ext_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Extension introuvable")
    await db.delete(e)
    await db.commit()
