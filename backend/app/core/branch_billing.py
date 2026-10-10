"""Facturation telephonique des succursales (TASK-002.4, 2026-10-10).

Une succursale est dans le tenant de sa maison mere ; chacun de ses services (poste, numero) appartient a la compagnie
dont l'adresse 911 est la sienne. Sa ligne de facturation va dans la recurrence telephonique de la compagnie facturee
pour elle : elle-meme (par defaut) ou la maison mere choisie. La ligne suit quand l'adresse 911 du service change ou
quand le choix de facturation change (le serveur envoie l'avis de facturation avant que l'adresse soit choisie)."""
from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import clock, sipv_client
from app.core.company_tree import billing_company
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.recurring_billing import CompanyRecurringBilling, RecurringBillingLine
from app.models.telephony import DID


async def service_owner(db: AsyncSession, holder: Company, service_type: str, service_ref: str) -> Company:
    """Compagnie a qui appartient le service : la succursale de son adresse 911, sinon le porteur du tenant."""
    site = None
    try:
        if service_type == "extension":
            a = await sipv_client.get_extension_e911_assignment(service_ref)
            if a and a.get("e911_address_id"):
                site = (await db.execute(select(CompanySite).where(
                    CompanySite.sipv_e911_address_id == a["e911_address_id"]))).scalar_one_or_none()
        elif service_type == "did":
            d = (await db.execute(select(DID).where(DID.sipv_tenant_did_id == service_ref))).scalar_one_or_none()
            if d and d.site_id:
                site = await db.get(CompanySite, d.site_id)
    except Exception:          # SIPV injoignable : on facture le porteur du tenant, corrige au prochain changement
        site = None
    if site and site.branch_company_id:
        return await db.get(Company, site.branch_company_id) or holder
    return holder


async def recurrence_for(db: AsyncSession, company: Company, create: bool) -> CompanyRecurringBilling | None:
    rb = (await db.execute(select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines)).where(
        CompanyRecurringBilling.company_id == company.id, CompanyRecurringBilling.is_telephony == True)
        .order_by(CompanyRecurringBilling.created_at).limit(1))).scalar_one_or_none()
    if rb or not create:
        return rb
    rb = CompanyRecurringBilling(company_id=company.id, name="Téléphonie", is_telephony=True,
                                 start_date=clock.today(), frequency="mensuel", is_active=True)
    db.add(rb)
    await db.flush()
    return rb


async def target_for(db: AsyncSession, holder: Company, owner: Company) -> CompanyRecurringBilling | None:
    """Recurrence ou va la ligne : celle de la compagnie facturee pour le proprietaire du service. Pour une succursale
    sans recurrence telephonique, elle est creee (mensuelle, a partir d'aujourd'hui)."""
    payer = await billing_company(db, owner.id) or owner
    return await recurrence_for(db, payer, create=payer.id != holder.id)


async def place_service(db: AsyncSession, holder: Company, service_type: str, service_ref: str) -> None:
    """Remet la ligne du service dans la bonne recurrence (apres un changement d'adresse 911)."""
    line = (await db.execute(select(RecurringBillingLine).join(CompanyRecurringBilling).where(
        CompanyRecurringBilling.is_telephony == True, RecurringBillingLine.service_ref == service_ref,
        RecurringBillingLine.is_prorata_credit == False))).scalars().first()
    if not line:
        return
    owner = await service_owner(db, holder, service_type, service_ref)
    rb = await target_for(db, holder, owner)
    line.for_company_id = owner.id
    if rb and line.recurring_billing_id != rb.id:
        line.recurring_billing_id = rb.id


async def follow_billing_choice(db: AsyncSession, company: Company) -> int:
    """Le choix de facturation d'une succursale a change : ses lignes vont a la nouvelle compagnie facturee."""
    lines = (await db.execute(select(RecurringBillingLine).where(RecurringBillingLine.for_company_id == company.id))).scalars().all()
    if not lines:
        return 0
    payer = await billing_company(db, company.id) or company
    rb = await recurrence_for(db, payer, create=True)
    n = 0
    for l in lines:
        if l.recurring_billing_id != rb.id:
            l.recurring_billing_id = rb.id
            n += 1
    return n
