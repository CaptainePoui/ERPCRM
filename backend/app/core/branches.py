"""Succursales (TASK-002.4, 2026-10-10) : cocher « Succursale » et choisir la maison mere lie deux compagnies.

Regles de Philippe :
- plusieurs niveaux ; seules les boucles sont refusees ;
- facturee a elle-meme, sauf si on choisit une de ses maisons meres (bill_to_company_id) ;
- la succursale tombe dans le tenant de sa maison mere : son adresse 911 y est ajoutee, prise de son adresse ;
- chaque compagnie garde son numero de compte ERPCRM ; on ne les echange jamais (2026-10-14, Philippe : « pas de
  tricherie, on migre ») ;
- la succursale a son propre tenant (que la maison mere en ait un ou pas), ou on decoche une succursale qui partage le
  tenant de sa maison mere -> alerte (la telephonie devra etre migree, TASK-051) ; la liaison se fait quand meme, la
  telephonie reste ou elle est.
"""
import re
import uuid
import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import sipv_client
from app.core.company_tree import ancestors, descendant_ids, has_tenant, tenant_holder
from app.models.address import Address, AddressType
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.entity_log import EntityLog

_ADDR_ORDER = (AddressType.address_911, AddressType.service, AddressType.billing, AddressType.mailing)


async def address_fields(db: AsyncSession, company_id) -> dict | None:
    """Adresse 911 d'une compagnie, lue de sa fiche (911, sinon service, sinon facturation) ; None si incomplete."""
    addrs = (await db.execute(select(Address).where(Address.entity_id == company_id, Address.is_active == True))).scalars().all()
    for t in _ADDR_ORDER:
        for a in sorted((x for x in addrs if x.address_type == t), key=lambda x: not x.is_primary):
            m = re.match(r'^\s*(\d+[A-Za-z]?)[\s,]+(.+)$', a.street_1 or "")
            if m and a.city and a.postal_code:
                return {"civic_number": m.group(1), "street_name": m.group(2).strip(), "unit": a.street_2 or None,
                        "city": a.city, "province": (a.province or "QC")[:2].upper(),
                        "postal_code": a.postal_code.upper(), "country": (a.country or "CA")[:2].upper()}
    return None


async def branch_site(db: AsyncSession, branch_id) -> CompanySite | None:
    return (await db.execute(select(CompanySite).where(CompanySite.branch_company_id == branch_id)
                             .order_by(CompanySite.created_at).limit(1))).scalar_one_or_none()


async def sync_branch_site(db: AsyncSession, branch: Company) -> str | None:
    """Garde l'adresse 911 de la succursale a jour dans le tenant de sa maison mere. Retourne un avertissement a afficher
    (adresse incomplete, tenant different), sinon None. Bloquant si SIPV ne repond pas (rien d'ecrit)."""
    if has_tenant(branch):
        return None                                   # elle a son propre tenant : son adresse principale y est deja
    holder = await tenant_holder(db, branch.id)
    site = await branch_site(db, branch.id)
    fields = await address_fields(db, branch.id)
    if site and holder and site.company_id != holder.id:
        old = await db.get(Company, site.company_id)
        return (f"L'adresse 911 de {branch.name} est dans le tenant de {old.name if old else '?'} : "
                f"sa téléphonie devra être migrée vers celui de {holder.name}.")
    if not fields:
        return (f"{branch.name} n'a pas d'adresse complète (numéro, rue, ville, code postal) : "
                "son adresse 911 n'a pas pu être créée. Ajoutez son adresse dans sa fiche.") if holder else None
    if not holder:
        if site:                                      # pas de tenant : l'adresse reste a jour dans ERPCRM seulement
            for k, v in fields.items():
                setattr(site, k, v)
            site.label = branch.name
        return None
    site_id = site.id if site else uuid.uuid4()
    try:
        res = await sipv_client.sync_site(tenant_id=str(holder.sipv_tenant_id), erpcrm_site_id=str(site_id),
                                          label=branch.name, is_active=branch.is_active, **fields)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    if site:
        for k, v in fields.items():
            setattr(site, k, v)
        site.label, site.is_active = branch.name, branch.is_active
        site.sipv_e911_address_id = uuid.UUID(res["e911_address_id"])
    else:
        db.add(CompanySite(id=site_id, company_id=holder.id, branch_company_id=branch.id, label=branch.name,
                           is_active=branch.is_active, is_primary=False,
                           sipv_e911_address_id=uuid.UUID(res["e911_address_id"]), **fields))
    return None


def _alert(text: str):
    raise HTTPException(status_code=409, detail={"alert": text})


async def set_parent(db: AsyncSession, co: Company, parent_id, bill_to_id, confirm: bool, user) -> list[str]:
    """Coche / decoche « Succursale », change la maison mere ou la facturation. Retourne les avertissements ; leve 409
    {alert} quand Philippe doit confirmer (confirm=True pour passer)."""
    warnings: list[str] = []
    old_parent_id = co.parent_company_id
    parent = None
    if parent_id:
        if parent_id == co.id:
            raise HTTPException(status_code=422, detail="Une compagnie ne peut pas être sa propre maison mère")
        parent = await db.get(Company, parent_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Maison mère introuvable")
        if parent_id in await descendant_ids(db, co.id):
            raise HTTPException(status_code=422, detail=f"{parent.name} est déjà une succursale de {co.name} : ce lien ferait une boucle")

    changing = parent_id != old_parent_id
    # Facturation : a elle-meme, sauf une de ses maisons meres choisie (la chaine se calcule avant tout changement)
    allowed = ({parent.id} | {a.id for a in await ancestors(db, parent.id)}) if parent else set()
    if bill_to_id and bill_to_id not in allowed:
        raise HTTPException(status_code=422, detail="La facturation ne peut aller qu'à une de ses maisons mères")
    new_bill_to = bill_to_id or None

    old_holder = new_holder = site = None
    shares = False
    if changing:
        old_holder = await tenant_holder(db, co.id)
        site = await branch_site(db, co.id)
        if parent:
            new_holder = parent if has_tenant(parent) else next((a for a in await ancestors(db, parent.id) if has_tenant(a)), None)
        shares = (not has_tenant(co)) and old_holder is not None and site is not None and site.company_id == old_holder.id
        if not confirm:
            if parent and has_tenant(co) and new_holder:
                _alert(f"{co.name} et {new_holder.name} ont chacune leur tenant téléphonique. Les compagnies seront liées, "
                       f"mais la téléphonie de {co.name} devra être migrée vers le tenant de {new_holder.name}. "
                       "Rien ne change dans sa téléphonie en attendant.")
            if parent and has_tenant(co) and not new_holder:
                _alert(f"{co.name} a son tenant téléphonique ({co.account_number}), mais {parent.name} n'en a pas. Les compagnies "
                       f"seront liées et chacune garde son numéro ; la téléphonie de {co.name} devra être migrée vers un tenant "
                       f"de {parent.name} ({parent.account_number}). Rien ne change dans sa téléphonie en attendant.")
            if shares and (new_holder is None or new_holder.id != old_holder.id):
                _alert(f"Les postes, numéros et l'adresse 911 de {co.name} sont dans le tenant de {old_holder.name}. "
                       f"Sa téléphonie devra être migrée vers {'son propre tenant' if not parent else 'le tenant de ' + (new_holder.name if new_holder else parent.name)}. "
                       "Rien ne se coupe en attendant.")

    # Journal avec les noms, inscrit avant de changer les champs (sinon le journal automatique note les identifiants)
    async def name(cid):
        c = await db.get(Company, cid) if cid else None
        return c.name if c else None
    logs = [(f, o, n, await name(o), await name(n)) for f, o, n in (("parent_company_id", old_parent_id, parent_id),
                                                                   ("bill_to_company_id", co.bill_to_company_id, new_bill_to))]
    billing_changed = co.bill_to_company_id != new_bill_to or changing
    for field, old, new, old_name, new_name in logs:
        if old != new:
            db.add(EntityLog(entity_id=co.id, user_id=user.id, action="field_change", field_name=field,
                             old_value=old_name, new_value=new_name))
    co.parent_company_id, co.bill_to_company_id = parent_id, new_bill_to

    if changing:
        if parent and not has_tenant(co) and new_holder and not shares:
            w = await sync_branch_site(db, co)
            if w:
                warnings.append(w)
    if billing_changed:
        from app.core.branch_billing import follow_billing_choice
        await db.flush()
        if await follow_billing_choice(db, co):
            warnings.append("Sa facturation téléphonique va maintenant à la compagnie choisie.")
    return warnings
