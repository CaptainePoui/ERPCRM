"""Serveur -> Migration (TASK-051, 2026-10-10) : deplacer des postes et des numeros d'un tenant a un autre, comme un
technicien. Le serveur SIPV fait le travail (inventaire, apercu, execution en une transaction) ; ERPCRM traduit les
compagnies et adresses 911 (ses succursales) et suit les numeros dont il est maitre.

Succursale avec son propre tenant vers sa maison mere (2026-10-14, Philippe : « pas de tricherie, on migre ») :
- la maison mere sans tenant est offerte comme destination ; son tenant (son propre numero) est cree juste avant ;
- chaque poste / numero garde son adresse 911 ; les adresses suivent dans le tenant d'arrivee et restent celles de la
  succursale (company_sites.branch_company_id), sa facturation ne change pas ;
- le tenant vide de la succursale est desactive (jamais supprime) ; ses contacts restent les siens."""
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import sipv_client
from app.core.company_tree import ancestors, has_tenant
from app.core.database import get_db
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.contact import Contact
from app.models.contact_company import ContactCompany
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


async def _tenant_company(db: AsyncSession, company_id) -> Company:
    co = await db.get(Company, company_id)
    if not co or not co.sipv_enabled or not co.sipv_tenant_id:
        raise HTTPException(status_code=422, detail="Cette compagnie n'a pas de tenant téléphonique actif")
    return co


async def _is_parent_of(db: AsyncSession, dst: Company, src: Company) -> bool:
    return dst.id in {a.id for a in await ancestors(db, src.id)}


async def _selection(db: AsyncSession, p: MigrationIn) -> tuple[dict, Company, Company]:
    src = await _tenant_company(db, p.source_company_id)
    dst = await db.get(Company, p.dest_company_id)
    if not dst:
        raise HTTPException(status_code=404, detail="Compagnie d'arrivée introuvable")
    if not has_tenant(dst) and not await _is_parent_of(db, dst, src):
        raise HTTPException(status_code=422, detail="Cette compagnie n'a pas de tenant téléphonique actif")
    sel = {"source_tenant_id": str(src.sipv_tenant_id),
           "dest_tenant_id": str(dst.sipv_tenant_id) if has_tenant(dst) else None,
           "dest_new_account_number": None if has_tenant(dst) else dst.account_number,
           "extensions": p.extensions, "dids": [str(d) for d in p.dids], "objects": p.objects}
    return sel, src, dst


async def _contacts_of(db: AsyncSession, src: Company, ext_ids: list[str]) -> list[tuple[str, Contact]]:
    """(poste SIPV, contact ERPCRM) des postes choisis -- le contact suit son poste (Philippe, 2026-10-10)."""
    if not ext_ids:
        return []
    inv = await sipv_client.migration_inventory(str(src.sipv_tenant_id))
    out = []
    for e in inv.get("extensions", []):
        if e["id"] in ext_ids and e.get("erpcrm_contact_id"):
            ct = await db.get(Contact, uuid.UUID(e["erpcrm_contact_id"]))
            if ct:
                out.append((e["extension"], ct))
    return out


async def move_contact(db: AsyncSession, ct: Contact, src: Company, dst: Company, user: User) -> None:
    """Le lien du contact avec la compagnie de depart passe a la compagnie d'arrivee (ses autres liens restent)."""
    links = {cc.company_id: cc for cc in (await db.execute(select(ContactCompany).where(ContactCompany.contact_id == ct.id))).scalars().all()}
    old, new = links.get(src.id), links.get(dst.id)
    name = f"{ct.first_name} {ct.last_name}".strip()
    if new:
        if old:
            new.is_primary = new.is_primary or old.is_primary
            await db.delete(old)
    elif old:
        old.company_id = dst.id
    else:
        db.add(ContactCompany(contact_id=ct.id, company_id=dst.id, is_primary=not any(l.is_primary for l in links.values()), is_active=True))
    db.add(EntityLog(entity_id=dst.id, user_id=user.id, action="contact_linked", description=f"Contact « {name} » lié (suit son poste, migration depuis {src.name})"))
    if old:
        db.add(EntityLog(entity_id=src.id, user_id=user.id, action="contact_unlinked", description=f"Contact « {name} » retiré (suit son poste vers {dst.name})"))


@router.get("/tenants")
async def tenants(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Company).where(Company.sipv_enabled == True, Company.sipv_tenant_id.is_not(None))
                             .order_by(Company.account_number))).scalars().all()
    return [{"company_id": str(c.id), "name": c.name, "account_number": c.account_number} for c in rows]


@router.get("/destinations/{company_id}")
async def destinations(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Tenants d'arrivee possibles : ceux qui existent, plus ses maisons meres sans tenant (cree a la migration)."""
    rows = (await db.execute(select(Company).where(Company.sipv_enabled == True, Company.sipv_tenant_id.is_not(None),
                                                   Company.id != company_id).order_by(Company.account_number))).scalars().all()
    out = [{"company_id": str(c.id), "name": c.name, "account_number": c.account_number, "new_tenant": False} for c in rows]
    out += [{"company_id": str(a.id), "name": a.name, "account_number": a.account_number, "new_tenant": True}
            for a in await ancestors(db, company_id) if not has_tenant(a)]
    return out


@router.get("/inventory/{company_id}")
async def inventory(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    co = await _tenant_company(db, company_id)
    try:
        return await sipv_client.migration_inventory(str(co.sipv_tenant_id))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/preview")
async def preview(p: MigrationIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    sel, src, dst = await _selection(db, p)
    try:
        res = await sipv_client.migration_preview(sel)
        if not has_tenant(dst):
            res["steps"].insert(0, f"Tenant téléphonique de {dst.name} créé ({dst.account_number}).")
        if await _is_parent_of(db, dst, src):
            res["steps"] = [x for x in res["steps"] if not x.startswith("Facturation :")]
            res["steps"].append(f"Les postes restent ceux de {src.name} (contacts, facturation) : seul le tenant change.")
        else:
            for num, ct in await _contacts_of(db, src, [e["id"] for e in p.extensions]):
                res["steps"].append(f"  Contact « {ct.first_name} {ct.last_name} » (poste {num}) : suit vers {dst.name}.")
        return res
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/execute")
async def execute(p: MigrationIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    sel, src, dst = await _selection(db, p)
    branch = await _is_parent_of(db, dst, src)
    if branch:
        # Avant SIPV (ses avis de facturation arrivent pendant l'execution) : les adresses de la succursale sont marquees
        # comme les siennes, ses postes restent factures a elle-meme dans le tenant de sa maison mere
        for s in (await db.execute(select(CompanySite).where(CompanySite.company_id == src.id,
                                                             CompanySite.branch_company_id.is_(None)))).scalars().all():
            s.branch_company_id = src.id
        await db.commit()
    if not has_tenant(dst):
        from app.api.v1.endpoints.companies import toggle_sipv_tenant, SipvTenantToggle
        await toggle_sipv_tenant(dst.id, SipvTenantToggle(enabled=True), db, user)
        await db.refresh(dst)
        sel["dest_tenant_id"], sel["dest_new_account_number"] = str(dst.sipv_tenant_id), None
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
            row.company_id = dst.id                    # son adresse 911 (site_id) ne change pas
            moved_numbers.append(d["number"])
    # Adresses 911 passees au tenant d'arrivee (celles d'une succursale restent les siennes, marquees avant)
    moved_addrs = [uuid.UUID(a) for a in res.get("moved_addresses", [])]
    if moved_addrs:
        for s in (await db.execute(select(CompanySite).where(CompanySite.sipv_e911_address_id.in_(moved_addrs)))).scalars().all():
            s.company_id, s.is_primary = dst.id, False
    if res.get("source_emptied"):
        # Tenant vide : desactive (SIPV l'a fait dans la meme transaction) ; sa facturation reste, ses postes y sont factures
        src.sipv_enabled = False
        db.add(EntityLog(entity_id=src.id, user_id=user.id, action="field_change", field_name="sipv_enabled",
                         old_value="True", new_value="False"))
    moved_contacts = []
    for e in ([] if branch else res.get("moved_extensions", [])):
        if e.get("erpcrm_contact_id"):
            ct = await db.get(Contact, uuid.UUID(e["erpcrm_contact_id"]))
            if ct:
                await move_contact(db, ct, src, dst, user)
                moved_contacts.append(f"{ct.first_name} {ct.last_name}".strip())
    res["moved_contacts"] = moved_contacts
    postes = ", ".join(sorted((e["number"] for e in res.get("moved_extensions", [])), key=lambda n: (len(n), n)))
    text = (f"Migration {src.account_number} → {dst.account_number}"
            + (f" : postes {postes}" if postes else "") + (f" ; numéros {', '.join(moved_numbers)}" if moved_numbers else ""))
    for co, side in ((src, "vers " + dst.name), (dst, "depuis " + src.name)):
        db.add(EntityLog(entity_id=co.id, user_id=user.id, action="tenant_migration", description=f"{text} ({side})"))
    await db.commit()
    return res
