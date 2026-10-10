"""Maisons meres et succursales (TASK-002.4, 2026-10-10) : une succursale est une vraie compagnie liee a sa maison mere,
sur plusieurs niveaux. Lectures de l'arbre (toujours protegees contre une boucle) et regles de tenant / facturation."""
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.company import Company


async def ancestors(db: AsyncSession, company_id) -> list[Company]:
    """Maisons meres de la plus proche a la plus haute."""
    out, seen = [], {company_id}
    co = await db.get(Company, company_id)
    while co and co.parent_company_id and co.parent_company_id not in seen:
        seen.add(co.parent_company_id)
        co = await db.get(Company, co.parent_company_id)
        if co:
            out.append(co)
    return out


async def descendant_ids(db: AsyncSession, company_id) -> list[uuid.UUID]:
    """Toutes les succursales, a tous les niveaux (sans la compagnie elle-meme)."""
    rows = (await db.execute(select(Company.id, Company.parent_company_id).where(Company.parent_company_id.is_not(None)))).all()
    children: dict = {}
    for cid, pid in rows:
        children.setdefault(pid, []).append(cid)
    out, stack, seen = [], [company_id], {company_id}
    while stack:
        for c in children.get(stack.pop(), []):
            if c not in seen:
                seen.add(c)
                out.append(c)
                stack.append(c)
    return out


async def family_ids(db: AsyncSession, company_id) -> list[uuid.UUID]:
    """La compagnie et toutes ses succursales : ce qu'un paiement de cette compagnie peut couvrir."""
    return [company_id, *await descendant_ids(db, company_id)]


def has_tenant(co: Company | None) -> bool:
    return bool(co and co.sipv_enabled and co.sipv_tenant_id)


async def tenant_holder(db: AsyncSession, company_id) -> Company | None:
    """La compagnie dont le tenant SIPV sert a cette compagnie : elle-meme si elle en a un, sinon la maison mere la plus
    proche qui en a un (la succursale « tombe dans le tenant de la maison mere »)."""
    co = await db.get(Company, company_id)
    if has_tenant(co):
        return co
    for a in await ancestors(db, company_id):
        if has_tenant(a):
            return a
    return None


async def billing_company(db: AsyncSession, company_id) -> Company | None:
    """A qui facturer cette compagnie : elle-meme, sauf si une de ses maisons meres a ete choisie."""
    co = await db.get(Company, company_id)
    if co and co.bill_to_company_id:
        if co.bill_to_company_id in {a.id for a in await ancestors(db, company_id)}:
            return await db.get(Company, co.bill_to_company_id)
    return co


async def payer_for(db: AsyncSession, invoice_company_ids: set, payer_id=None):
    """Compagnie au nom de laquelle un paiement couvre ces factures : celle demandee si chaque facture est la sienne ou
    celle d'une de ses succursales ; sinon, parmi ces compagnies, celle qui est maison mere de toutes les autres.
    None = factures de compagnies non liees."""
    if payer_id:
        fam = set(await family_ids(db, payer_id))
        return payer_id if invoice_company_ids <= fam else None
    if len(invoice_company_ids) == 1:
        return next(iter(invoice_company_ids))
    for cid in invoice_company_ids:
        if invoice_company_ids <= set(await family_ids(db, cid)):
            return cid
    return None
