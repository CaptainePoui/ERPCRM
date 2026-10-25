"""Administration > Privileges (TASK-007.4, 2026-10-25) : les profils et ce que chacun permet, par section d'ERPCRM.
Le profil « Tout » donne tout et ne se modifie pas. Le verrou lui-meme est dans core/privileges.py (toutes les routes)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.admin import require_admin
from app.core import privileges as P
from app.core.database import get_db
from app.models.privilege import PrivilegeProfile
from app.models.user import User

router = APIRouter()


class ProfileIn(BaseModel):
    name: str | None = None
    grants: dict[str, str] | None = None


def _clean(grants: dict | None) -> dict:
    out = {}
    for k, v in (grants or {}).items():
        if k not in P.KEYS:
            raise HTTPException(status_code=400, detail=f"Section inconnue : {k}")
        if v not in (P.AUCUN, P.VOIR, P.MODIFIER):
            raise HTTPException(status_code=400, detail=f"Niveau inconnu : {v}")
        if v != P.AUCUN:
            out[k] = v
    return out


async def _out(db, p: PrivilegeProfile) -> dict:
    users = (await db.execute(select(User.full_name).where(User.privilege_profile_id == p.id).order_by(User.full_name))).scalars().all()
    return {"id": str(p.id), "name": p.name, "full_access": p.full_access,
            "grants": {k: P.MODIFIER for k in P.KEYS} if p.full_access else {k: p.grants.get(k, P.AUCUN) for k in P.KEYS},
            "users": list(users)}


@router.get("/sections")
async def sections(_: User = Depends(require_admin)):
    return [{"key": k, "label": l, "help": e} for k, l, e in P.SECTIONS]


@router.get("/profiles")
async def list_profiles(db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    rows = (await db.execute(select(PrivilegeProfile).order_by(PrivilegeProfile.full_access.desc(), PrivilegeProfile.name))).scalars().all()
    return [await _out(db, p) for p in rows]


async def _name_free(db, name: str, pid=None):
    name = (name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Donne un nom au profil")
    q = select(PrivilegeProfile).where(func.lower(PrivilegeProfile.name) == name.lower())
    other = (await db.execute(q)).scalars().first()
    if other and other.id != pid:
        raise HTTPException(status_code=409, detail=f"Un profil s'appelle déjà « {name} »")
    return name


@router.post("/profiles", status_code=201)
async def create_profile(p: ProfileIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    prof = PrivilegeProfile(name=await _name_free(db, p.name), grants=_clean(p.grants))
    db.add(prof)
    await db.commit()
    return await _out(db, prof)


@router.put("/profiles/{pid}")
async def update_profile(pid: uuid.UUID, p: ProfileIn, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    prof = await db.get(PrivilegeProfile, pid)
    if not prof:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if prof.full_access:
        raise HTTPException(status_code=400, detail="Le profil « Tout » donne tout et ne se modifie pas")
    if p.name is not None:
        prof.name = await _name_free(db, p.name, prof.id)
    if p.grants is not None:
        prof.grants = _clean(p.grants)
    await db.commit()
    return await _out(db, prof)


@router.delete("/profiles/{pid}", status_code=204)
async def delete_profile(pid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(require_admin)):
    prof = await db.get(PrivilegeProfile, pid)
    if not prof:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if prof.full_access:
        raise HTTPException(status_code=400, detail="Le profil « Tout » ne s'enlève pas")
    users = (await db.execute(select(User.full_name).where(User.privilege_profile_id == prof.id))).scalars().all()
    if users:
        raise HTTPException(status_code=409, detail=f"Ce profil est donné à {', '.join(users)} : change d'abord son profil")
    await db.delete(prof)
    await db.commit()
