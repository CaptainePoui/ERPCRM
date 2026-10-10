"""Compagnie du proprietaire (TASK-002.5, 2026-10-10) : une seule fiche pour l'entreprise qui possede ERPCRM/SIPV.
Ses coordonnees (nom, adresse de facturation, TPS, TVQ, telephone, courriel) sont celles imprimees sur les PDF ;
Administration -> Entreprise les lit et les modifie ici (plus de copie dans les reglages). Jamais facturee."""
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.address import Address, AddressType
from app.models.communication import CommunicationChannel, ChannelType
from app.models.company import Company

NOT_BILLED = "C'est la compagnie du propriétaire (celle qui possède le serveur) : elle n'est jamais facturée."


async def get_owner(db: AsyncSession) -> Company | None:
    return (await db.execute(select(Company).where(Company.is_owner == True))).scalar_one_or_none()


async def refuse_if_owner(db: AsyncSession, company_id) -> None:
    co = await db.get(Company, company_id) if company_id else None
    if co and co.is_owner:
        raise HTTPException(status_code=400, detail=NOT_BILLED)


async def billing_address(db: AsyncSession, company_id) -> Address | None:
    addrs = (await db.execute(select(Address).where(Address.entity_id == company_id, Address.is_active == True))).scalars().all()
    for t in (AddressType.billing, AddressType.service, AddressType.mailing):
        for a in sorted((x for x in addrs if x.address_type == t), key=lambda x: not x.is_primary):
            return a
    return None


async def primary_email(db: AsyncSession, company_id) -> CommunicationChannel | None:
    rows = (await db.execute(select(CommunicationChannel).where(
        CommunicationChannel.entity_id == company_id, CommunicationChannel.channel_type == ChannelType.email,
        CommunicationChannel.is_active == True))).scalars().all()
    return sorted(rows, key=lambda c: not c.is_primary)[0] if rows else None


def format_address(a: Address | None) -> str:
    if not a:
        return ""
    line1 = a.street_1 + (f", {a.street_2}" if a.street_2 else "")
    return f"{line1}\n{a.city} ({a.province}) {a.postal_code}"


async def seller_info(db: AsyncSession) -> dict:
    """Bloc vendeur des PDF : nom, adresse (2 lignes), TPS, TVQ, telephone, courriel."""
    co = await get_owner(db)
    if not co:
        return {"name": "", "address": "", "tps": "", "tvq": "", "phone": "", "email": ""}
    em = await primary_email(db, co.id)
    return {"name": co.name, "address": format_address(await billing_address(db, co.id)), "tps": co.tps_number or "",
            "tvq": co.tvq_number or "", "phone": co.office_phone or "", "email": em.value if em else ""}
