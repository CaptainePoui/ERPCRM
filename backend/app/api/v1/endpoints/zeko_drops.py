"""Documents deposes sur Zeko (TASK-006.9, 2026-10-26) -- voir app/core/zeko_drops.py."""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pathlib import Path
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import zeko_drops as zd
from app.core.database import get_db
from app.models.user import User
from app.models.zeko import ZekoDrop

router = APIRouter()


class OtherIn(BaseModel):
    where: str | None = None


def _out(d: ZekoDrop, pos: dict) -> dict:
    return {"id": str(d.id), "filename": d.filename, "origin": d.origin, "status": d.status, "error": d.error,
            "type": (d.analysis or {}).get("type"), "type_label": zd.TYPES.get((d.analysis or {}).get("type")),
            "question": zd.question(d) if d.status == "ready" else None, "can_accept": zd.can_accept(d),
            "tries": len(d.rejected or []), "need_where": len(d.rejected or []) >= 1 and d.status == "ready",
            "result": d.result, "queue_position": pos.get(d.id),
            "eta_seconds": pos[d.id] * zd.SECONDS_PER_DROP if d.id in pos else None}


async def _positions(db) -> dict:
    ids = (await db.execute(select(ZekoDrop.id).where(ZekoDrop.status.in_(["pending", "reading", "analyzing"]))
                            .order_by(ZekoDrop.updated_at))).scalars().all()
    return {i: k + 1 for k, i in enumerate(ids)}


async def _mine(db, did: uuid.UUID, user: User) -> ZekoDrop:
    d = await db.get(ZekoDrop, did)
    if not d or d.user_id != user.id:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return d


@router.post("")
async def drop(files: list[UploadFile] = File(...), page_company_id: uuid.UUID | None = Form(None), page_contact_id: uuid.UUID | None = Form(None),
               db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    got = [(f.filename or "document", await f.read()) for f in files]
    created = await zd.store(db, user, got, page_company_id, page_contact_id)
    pos = await _positions(db)
    return [_out(d, pos) for d in created]


@router.get("")
async def list_open(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Mes documents en cours : en lecture, a decider, faits (jusqu'a ce qu'on ferme la ligne)."""
    rows = (await db.execute(select(ZekoDrop).where(ZekoDrop.user_id == user.id, ZekoDrop.status.in_(zd.OPEN))
                             .order_by(ZekoDrop.created_at))).scalars().all()
    pos = await _positions(db)
    return [_out(d, pos) for d in rows]


@router.post("/{did}/accept")
async def accept(did: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    d = await _mine(db, did, user)
    await zd.accept(db, d, user)
    return _out(d, {})


@router.post("/{did}/other")
async def other(did: uuid.UUID, payload: OtherIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    d = await _mine(db, did, user)
    await zd.other(db, d, payload.where)
    return _out(d, await _positions(db))


@router.post("/{did}/dismiss")
async def dismiss(did: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Fermer la ligne : un document fait reste ou il a ete place ; un document pas place est laisse de cote."""
    d = await _mine(db, did, user)
    d.status = "archived" if d.status == "done" else "ignored"
    await db.commit()
    return {"ok": True}


@router.get("/{did}/file")
async def file(did: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await db.get(ZekoDrop, did)
    if not d or not Path(d.stored_path).exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(d.stored_path, filename=d.filename)


@router.get("/company/{company_id}")
async def company_documents(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Documents classes dans la fiche d'une compagnie (type « document »)."""
    rows = (await db.execute(select(ZekoDrop).where(ZekoDrop.company_id == company_id, ZekoDrop.status.in_(["done", "archived"]))
                             .order_by(ZekoDrop.created_at.desc()))).scalars().all()
    return [{"id": str(d.id), "filename": d.filename, "titre": (d.analysis or {}).get("titre"), "created_at": d.created_at,
             "contact": (d.analysis or {}).get("contact")} for d in rows]


@router.delete("/{did}/classement")
async def unclass(did: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Retirer un document classe d'une fiche (il reste dans les depots, laisse de cote) -- toujours modifiable."""
    d = await db.get(ZekoDrop, did)
    if not d or not (d.company_id or d.contact_id):
        raise HTTPException(status_code=404, detail="Document introuvable")
    d.company_id = d.contact_id = None
    d.status = "ignored"
    await db.commit()
    return {"ok": True}
