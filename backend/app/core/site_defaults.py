"""
Garantit qu'une compagnie avec un tenant SIPV actif a toujours au moins une
succursale principale -- generee automatiquement depuis son adresse (Address,
type service ou billing) si aucune succursale principale n'existe encore.

Demande de Philippe (2026-08-06) : un poste nouvellement cree doit etre lie a
quelque chose des le depart (le nom de la compagnie), pas a "-- Choisir --",
sans qu'il ait a creer/marquer une succursale manuellement en premier.

Non-bloquant expres, contrairement au CRUD explicite des succursales (sync_site
strict) : ceci est un filet de securite lazy appele sur des lectures -- si SIPV
est injoignable ou qu'aucune adresse n'est disponible, ne fait simplement rien.
"""
import re
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.address import Address, AddressType
from app.core import sipv_client


async def ensure_primary_site(company_id: uuid.UUID, db: AsyncSession) -> None:
    existing = await db.execute(
        select(CompanySite).where(CompanySite.company_id == company_id, CompanySite.is_primary == True)
    )
    if existing.scalar_one_or_none():
        return

    company = await db.get(Company, company_id)
    if not company or not company.sipv_enabled or not company.sipv_tenant_id:
        return

    addr_result = await db.execute(select(Address).where(Address.entity_id == company_id))
    by_type = {a.address_type: a for a in addr_result.scalars().all()}
    addr = by_type.get(AddressType.service) or by_type.get(AddressType.billing)
    if not addr or not addr.street_1 or not addr.city or not addr.postal_code:
        return

    m = re.match(r'^(\d+[A-Za-z]?)\s+(.+)$', addr.street_1.strip())
    if not m:
        return
    civic_number, street_name = m.group(1), m.group(2)
    province = (addr.province or "QC")[:2].upper()
    country = (addr.country or "CA")[:2].upper()

    site_id = uuid.uuid4()
    try:
        sipv_result = await sipv_client.sync_site(
            tenant_id=str(company.sipv_tenant_id), erpcrm_site_id=str(site_id), label=company.name,
            civic_number=civic_number, street_name=street_name, unit=addr.street_2,
            city=addr.city, province=province, postal_code=addr.postal_code,
            country=country, is_active=True,
        )
    except Exception:
        return

    site = CompanySite(
        id=site_id, company_id=company_id, label=company.name,
        civic_number=civic_number, street_name=street_name, unit=addr.street_2,
        city=addr.city, province=province, postal_code=addr.postal_code,
        country=country, is_primary=True,
        sipv_e911_address_id=uuid.UUID(sipv_result["e911_address_id"]),
    )
    db.add(site)
    await db.commit()
