"""Serveur -> Migration (TASK-051, 2026-10-10) : deplacer des postes et des numeros d'un tenant a un autre, comme un
technicien. Le serveur SIPV fait le travail (inventaire, apercu, execution en une transaction) ; ERPCRM traduit les
compagnies et adresses 911 (ses succursales) et suit les numeros dont il est maitre."""
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import sipv_client
from app.core.database import get_db
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.entity_log import EntityLog
from app.models.telephony import DID
from app.models.user import User

router = APIRouter()


class MigrationIn(BaseModel):
    source_company_id: uuid.UUID
    dest_company_id: uuid.UUID
    extensions: list[dict] = []                    # [{"id": <poste SIPV>, "new_number": "..."}]
    dids: list[uuid.UUID] = []                      # numeros SIPV
    objects: dict[str, dict[str, str]] = {}         # {"ring_groups": {"<id>": "move|copy|leave"}}
    e911: dict[str, uuid.UUID | None] = {}          # {"extension:<id>": <site ERPCRM>, "did:<id>": <site ERPCRM>}


async def _tenant_company(db: AsyncSession, company_id) -> Company:
    co = await db.get(Company, company_id)
    if not co or not co.sipv_enabled or not co.sipv_tenant_id:
        raise HTTPException(status_code=422, detail="Cette compagnie n'a pas de tenant téléphonique actif")
    return co


async def _selection(db: AsyncSession, p: MigrationIn) -> tuple[dict, Company, Company]:
    src, dst = await _tenant_company(db, p.source_company_id), await _tenant_company(db, p.dest_company_id)
    e911 = {}
    for key, site_id in p.e911.items():
        if not site_id:
            continue
        site = await db.get(CompanySite, site_id)
        if not site or site.company_id != dst.id or not site.sipv_e911_address_id:
            raise HTTPException(status_code=422, detail="Adresse 911 invalide pour le tenant d'arrivée")
        e911[key] = str(site.sipv_e911_address_id)
    sel = {"source_tenant_id": str(src.sipv_tenant_id), "dest_tenant_id": str(dst.sipv_tenant_id),
           "extensions": p.extensions, "dids": [str(d) for d in p.dids], "objects": p.objects, "e911": e911}
    return sel, src, dst


@router.get("/tenants")
async def tenants(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Company).where(Company.sipv_enabled == True, Company.sipv_tenant_id.is_not(None))
                             .order_by(Company.account_number))).scalars().all()
    return [{"company_id": str(c.id), "name": c.name, "account_number": c.account_number} for c in rows]


@router.get("/inventory/{company_id}")
async def inventory(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    co = await _tenant_company(db, company_id)
    try:
        return await sipv_client.migration_inventory(str(co.sipv_tenant_id))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/addresses/{company_id}")
async def addresses(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Adresses 911 du tenant d'arrivee (la compagnie elle-meme, ses succursales) -- ce qu'on confirme pour chaque
    poste et numero qui arrive."""
    co = await _tenant_company(db, company_id)
    sites = (await db.execute(select(CompanySite).where(CompanySite.company_id == co.id, CompanySite.is_active == True,
                                                        CompanySite.sipv_e911_address_id.is_not(None)))).scalars().all()
    out = []
    for s in sites:
        owner = await db.get(Company, s.branch_company_id) if s.branch_company_id else co
        out.append({"id": str(s.id), "company": owner.name if owner else co.name, "is_primary": s.is_primary,
                    "text": f"{s.civic_number} {s.street_name}{', ' + s.unit if s.unit else ''}, {s.city}"})
    return sorted(out, key=lambda x: (not x["is_primary"], x["company"]))


@router.post("/preview")
async def preview(p: MigrationIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    sel, _s, _d = await _selection(db, p)
    try:
        return await sipv_client.migration_preview(sel)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/execute")
async def execute(p: MigrationIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sel, src, dst = await _selection(db, p)
    try:
        code, res = await sipv_client.migration_execute(sel)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable ou en erreur : {e}")
    if code == 409:
        raise HTTPException(status_code=409, detail=res)
    # Numeros : ERPCRM en est le maitre -- ils passent a la compagnie d'arrivee avec l'adresse 911 confirmee
    moved_numbers = []
    for d in res.get("moved_dids", []):
        if not d.get("erpcrm_did_id"):
            continue
        row = await db.get(DID, uuid.UUID(d["erpcrm_did_id"]))
        if row:
            row.company_id = dst.id
            row.site_id = p.e911.get(f"did:{d['id']}")
            moved_numbers.append(d["number"])
    postes = ", ".join(sorted((e["number"] for e in res.get("moved_extensions", [])), key=lambda n: (len(n), n)))
    text = (f"Migration {src.account_number} → {dst.account_number}"
            + (f" : postes {postes}" if postes else "") + (f" ; numéros {', '.join(moved_numbers)}" if moved_numbers else ""))
    for co, side in ((src, "vers " + dst.name), (dst, "depuis " + src.name)):
        db.add(EntityLog(entity_id=co.id, user_id=user.id, action="tenant_migration", description=f"{text} ({side})"))
    await db.commit()
    return res
