import uuid
import httpx
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core import sipv_client
from app.api.v1.endpoints.auth import get_current_user
from app.models.entity import Entity, EntityType
from app.models.company import Company
from app.models.status import Status, EntityStatus
from app.models.address import Address, AddressType
from app.models.communication import CommunicationChannel
from app.models.contact import Contact
from app.models.contact_company import ContactCompany, ContactCompanyFunction
from app.models.function import Function
from app.models.entity_log import EntityLog
from app.models.user import User
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyOut, CompanyListItem, ContactInCompanyOut, VendorRef
from app.schemas.contact import ContactCompanyLink, ContactCompanyUpdate

router = APIRouter()


def _load_opts():
    return [
        selectinload(Company.entity).selectinload(Entity.statuses).selectinload(EntityStatus.status),
        selectinload(Company.entity).selectinload(Entity.addresses),
        selectinload(Company.entity).selectinload(Entity.communication_channels),
        selectinload(Company.internal_manager),
        selectinload(Company.contact_companies).selectinload(ContactCompany.contact).selectinload(Contact.entity).selectinload(Entity.communication_channels),
        selectinload(Company.contact_companies).selectinload(ContactCompany.functions).selectinload(ContactCompanyFunction.function),
        selectinload(Company.vendor),
    ]


def _build_company_out(company: Company) -> CompanyOut:
    entity = company.entity
    contacts_out = []
    for cc in company.contact_companies:
        c = cc.contact
        contacts_out.append(ContactInCompanyOut(
            contact_company_id=cc.id,
            contact_id=c.id,
            first_name=c.first_name,
            last_name=c.last_name,
            email=cc.email,
            is_primary=cc.is_primary,
            is_active=cc.is_active,
            functions=[f.function.name for f in cc.functions],
            communications=[ch for ch in c.entity.communication_channels],
        ))
    return CompanyOut(
        id=company.id,
        entity_id=entity.id,
        name=company.name,
        account_number=company.account_number,
        legal_name=company.legal_name,
        website=company.website,
        industry=company.industry,
        neq=company.neq,
        shareholder_type=company.shareholder_type,
        employee_count=company.employee_count,
        annual_revenue=company.annual_revenue,
        notes_internal=company.notes_internal,
        is_active=company.is_active,
        sipv_enabled=company.sipv_enabled,
        sipv_tenant_id=company.sipv_tenant_id,
        internal_manager_id=company.internal_manager_id,
        internal_manager=company.internal_manager,
        vendor_id=company.vendor_id,
        vendor=VendorRef(contact_id=company.vendor.id, first_name=company.vendor.first_name, last_name=company.vendor.last_name) if company.vendor else None,
        currency=company.currency,
        is_taxable=company.is_taxable,
        tvq_applicable=company.tvq_applicable,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
        statuses=[es.status for es in entity.statuses],
        addresses=entity.addresses,
        communications=entity.communication_channels,
        contacts=contacts_out,
    )


def _log(db: AsyncSession, entity_id: uuid.UUID, user: User, action: str, **kwargs):
    db.add(EntityLog(entity_id=entity_id, user_id=user.id, action=action, **kwargs))


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(payload: CompanyCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    entity = Entity(entity_type=EntityType.company)
    db.add(entity)
    await db.flush()

    company = Company(
        id=entity.id,
        name=payload.name,
        account_number=payload.account_number,
        legal_name=payload.legal_name,
        website=payload.website,
        industry=payload.industry,
        neq=payload.neq,
        shareholder_type=payload.shareholder_type,
        employee_count=payload.employee_count,
        annual_revenue=payload.annual_revenue,
        notes_internal=payload.notes_internal,
        internal_manager_id=payload.internal_manager_id,
        is_taxable=payload.is_taxable,
        tvq_applicable=payload.tvq_applicable,
    )
    db.add(company)
    await db.flush()

    for status_id in payload.status_ids:
        db.add(EntityStatus(entity_id=entity.id, status_id=status_id))

    for addr in payload.addresses:
        db.add(Address(entity_id=entity.id, **addr))

    for comm in payload.communications:
        db.add(CommunicationChannel(entity_id=entity.id, **comm))

    _log(db, entity.id, current_user, "created", description=f"Compagnie « {payload.name} » créée")
    await db.commit()

    result = await db.execute(select(Company).where(Company.id == company.id).options(*_load_opts()))
    return _build_company_out(result.scalar_one())


@router.get("", response_model=list[CompanyListItem])
async def list_companies(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Company)
        .options(*_load_opts())
        .order_by(Company.name)
    )
    companies = result.scalars().all()
    items = []
    for c in companies:
        billing = next((a for a in c.entity.addresses if a.address_type.value == "billing" and a.is_active), None)
        city = billing.city if billing else None
        items.append(CompanyListItem(
            id=c.id,
            entity_id=c.entity.id,
            name=c.name,
            account_number=c.account_number,
            legal_name=c.legal_name,
            industry=c.industry,
            is_active=c.is_active,
            created_at=c.entity.created_at,
            statuses=[es.status for es in c.entity.statuses],
            internal_manager=c.internal_manager,
            city=city,
        ))
    return items


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id).options(*_load_opts()))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    return _build_company_out(company)


@router.put("/{company_id}", response_model=CompanyOut)
async def update_company(company_id: uuid.UUID, payload: CompanyUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    changes = payload.model_dump(exclude_unset=True)
    for field, new_value in changes.items():
        old_value = getattr(company, field, None)
        if str(old_value) != str(new_value):
            _log(db, company_id, current_user, "field_change",
                 field_name=field,
                 old_value=str(old_value) if old_value is not None else None,
                 new_value=str(new_value) if new_value is not None else None)
        setattr(company, field, new_value)

    await db.commit()

    result = await db.execute(select(Company).where(Company.id == company_id).options(*_load_opts()))
    return _build_company_out(result.scalar_one())


class SipvTenantToggle(BaseModel):
    enabled: bool


@router.post("/{company_id}/sipv-tenant", response_model=CompanyOut)
async def toggle_sipv_tenant(
    company_id: uuid.UUID,
    payload: SipvTenantToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Active ou desactive le tenant telephonique SIPV d'une compagnie.
    Activer = cree le tenant s'il n'existe pas encore (ou le reactive s'il existait).
    Desactiver = desactive le tenant cote SIPV (les postes ne peuvent plus s'enregistrer),
    ne le supprime pas — reversible en reactivant.
    """
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    if payload.enabled and not company.account_number:
        raise HTTPException(status_code=400, detail="Le numéro de compte (tenant) doit être renseigné avant d'activer le tenant SIPV")

    try:
        sipv_result = await sipv_client.sync_company(
            account_number=company.account_number,
            company_name=company.name,
            erpcrm_company_id=str(company.id),
            is_active=payload.enabled,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable ou en erreur : {e}")

    company.sipv_enabled = payload.enabled
    if sipv_result.get("tenant_id"):
        company.sipv_tenant_id = uuid.UUID(sipv_result["tenant_id"])

    _log(db, company_id, current_user, "field_change",
         field_name="sipv_enabled",
         old_value=str(not payload.enabled),
         new_value=str(payload.enabled))
    await db.commit()

    result = await db.execute(select(Company).where(Company.id == company_id).options(*_load_opts()))
    return _build_company_out(result.scalar_one())


@router.post("/{company_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_status(company_id: uuid.UUID, status_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    existing = await db.execute(select(EntityStatus).where(EntityStatus.entity_id == company_id, EntityStatus.status_id == status_id))
    if not existing.scalar_one_or_none():
        db.add(EntityStatus(entity_id=company_id, status_id=status_id))
        st = await db.execute(select(Status).where(Status.id == status_id))
        st_obj = st.scalar_one_or_none()
        _log(db, company_id, current_user, "status_added",
             description=f"Statut « {st_obj.name if st_obj else status_id} » ajouté")
        await db.commit()


@router.delete("/{company_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_status(company_id: uuid.UUID, status_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(EntityStatus).where(EntityStatus.entity_id == company_id, EntityStatus.status_id == status_id))
    es = result.scalar_one_or_none()
    if es:
        st = await db.execute(select(Status).where(Status.id == status_id))
        st_obj = st.scalar_one_or_none()
        await db.delete(es)
        _log(db, company_id, current_user, "status_removed",
             description=f"Statut « {st_obj.name if st_obj else status_id} » retiré")
        await db.commit()


@router.post("/{company_id}/addresses", status_code=status.HTTP_201_CREATED)
async def add_address(company_id: uuid.UUID, payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    db.add(Address(entity_id=company_id, **payload))
    addr_type = payload.get("address_type", "")
    _log(db, company_id, current_user, "address_added",
         description=f"Adresse ({addr_type}) ajoutée")
    await db.commit()
    return {"ok": True}


@router.post("/{company_id}/communications", status_code=status.HTTP_201_CREATED)
async def add_communication(company_id: uuid.UUID, payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    db.add(CommunicationChannel(entity_id=company_id, **payload))
    channel_type = payload.get("channel_type", "")
    value = payload.get("value", "")
    _log(db, company_id, current_user, "communication_added",
         description=f"Coordonnée {channel_type} « {value} » ajoutée")
    await db.commit()
    return {"ok": True}


@router.post("/{company_id}/contacts", status_code=status.HTTP_201_CREATED)
async def link_contact(company_id: uuid.UUID, payload: ContactCompanyLink, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    existing = await db.execute(select(ContactCompany).where(
        ContactCompany.company_id == company_id,
        ContactCompany.contact_id == payload.contact_id
    ))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce contact est déjà lié à cette compagnie")

    cc = ContactCompany(contact_id=payload.contact_id, company_id=company_id, email=payload.email, is_primary=payload.is_primary)
    db.add(cc)
    await db.flush()

    for fid in payload.function_ids:
        db.add(ContactCompanyFunction(contact_company_id=cc.id, function_id=fid))

    ct = await db.execute(select(Contact).where(Contact.id == payload.contact_id))
    ct_obj = ct.scalar_one_or_none()
    contact_name = f"{ct_obj.first_name} {ct_obj.last_name}" if ct_obj else str(payload.contact_id)
    _log(db, company_id, current_user, "contact_linked",
         description=f"Contact « {contact_name} » lié")
    await db.commit()
    return {"ok": True, "contact_company_id": str(cc.id)}


@router.patch("/{company_id}/contacts/{contact_id}")
async def update_contact_link(company_id: uuid.UUID, contact_id: uuid.UUID, payload: ContactCompanyUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(ContactCompany).options(
        selectinload(ContactCompany.functions)
    ).where(ContactCompany.company_id == company_id, ContactCompany.contact_id == contact_id))
    cc = result.scalar_one_or_none()
    if not cc:
        raise HTTPException(status_code=404, detail="Lien introuvable")
    if payload.email is not None:
        cc.email = payload.email or None
    if payload.is_primary is not None:
        cc.is_primary = payload.is_primary
    if payload.is_active is not None:
        cc.is_active = payload.is_active
    if payload.function_ids is not None:
        for f in cc.functions:
            await db.delete(f)
        await db.flush()
        for fid in payload.function_ids:
            db.add(ContactCompanyFunction(contact_company_id=cc.id, function_id=fid))
    await db.commit()
    return {"ok": True}


@router.delete("/{company_id}/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_contact(company_id: uuid.UUID, contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(ContactCompany).where(
        ContactCompany.company_id == company_id,
        ContactCompany.contact_id == contact_id
    ))
    cc = result.scalar_one_or_none()
    if cc:
        ct = await db.execute(select(Contact).where(Contact.id == contact_id))
        ct_obj = ct.scalar_one_or_none()
        contact_name = f"{ct_obj.first_name} {ct_obj.last_name}" if ct_obj else str(contact_id)
        await db.delete(cc)
        _log(db, company_id, current_user, "contact_unlinked",
             description=f"Contact « {contact_name} » retiré")
        await db.commit()
