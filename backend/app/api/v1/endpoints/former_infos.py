"""Anciens noms et anciennes coordonnees d'une compagnie ou d'un contact (TASK-002.8) ; changement de nom d'une compagnie."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import former_infos as fi
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.company import Company
from app.models.entity import Entity
from app.models.former_info import FormerInfo
from app.models.user import User

router = APIRouter()


class FormerIn(BaseModel):
    entity_id: uuid.UUID
    kind: str
    value: str
    valid_from: date | None = None
    valid_to: date | None = None
    note: str | None = None


class RenameIn(BaseModel):
    name: str
    previous_until: date | None = None
    previous_from: date | None = None
    note: str | None = None


def _out(f: FormerInfo) -> dict:
    return {"id": str(f.id), "kind": f.kind, "value": f.value, "valid_from": f.valid_from, "valid_to": f.valid_to,
            "note": f.note, "period": fi.period(f)}


@router.get("")
async def list_former(entity_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(FormerInfo).where(FormerInfo.entity_id == entity_id)
                             .order_by(FormerInfo.kind, FormerInfo.valid_to.desc().nulls_last(), FormerInfo.value))).scalars().all()
    return [_out(f) for f in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_former(p: FormerIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not await db.get(Entity, p.entity_id):
        raise HTTPException(status_code=404, detail="Fiche introuvable")
    try:
        f = await fi.add(db, p.entity_id, p.kind, p.value, p.valid_from, p.valid_to, p.note, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    return _out(f)


@router.put("/{fid}")
async def update_former(fid: uuid.UUID, p: FormerIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    f = await db.get(FormerInfo, fid)
    if not f or f.entity_id != p.entity_id:
        raise HTTPException(status_code=404, detail="Ancienne info introuvable")
    if p.kind not in fi.KIND_FR or not fi.clean(p.kind, p.value):
        raise HTTPException(status_code=400, detail="Type ou valeur invalide")
    if p.valid_from and p.valid_to and p.valid_from > p.valid_to:
        raise HTTPException(status_code=400, detail="La date de début est après la date de fin")
    from app.models.entity_log import EntityLog
    before = f"{f.value} {fi.period(f)}".strip()
    f.kind, f.value, f.valid_from, f.valid_to = p.kind, fi.clean(p.kind, p.value), p.valid_from, p.valid_to
    f.note = (p.note or "").strip() or None
    after = f"{f.value} {fi.period(f)}".strip()
    if before != after:
        db.add(EntityLog(entity_id=f.entity_id, user_id=user.id, action="former_added", field_name=f"ancien {fi.KIND_FR[f.kind]}",
                         old_value=before, new_value=after, description="Modifiée"))
    await db.commit()
    return _out(f)


@router.delete("/{fid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_former(fid: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    f = await db.get(FormerInfo, fid)
    if not f:
        raise HTTPException(status_code=404, detail="Ancienne info introuvable")
    await fi.remove(db, f, user.id)
    await db.commit()


@router.post("/rename-company/{company_id}")
async def rename_company(company_id: uuid.UUID, p: RenameIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Changement de nom ou achat : nouveau nom, l'ancien gardé avec ses dates."""
    c = await db.get(Company, company_id)
    if not c:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    try:
        await fi.rename_company(db, c, p.name, p.previous_until, p.previous_from, p.note, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await db.commit()
    return {"name": c.name}
