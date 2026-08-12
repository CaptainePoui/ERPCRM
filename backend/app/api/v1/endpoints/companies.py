import uuid
import shutil
import httpx
from pathlib import Path
from datetime import datetime, date
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core import sipv_client
from app.core.site_defaults import ensure_primary_site
from app.api.v1.endpoints.auth import get_current_user
from app.models.entity import Entity, EntityType
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.status import Status, EntityStatus
from app.models.address import Address, AddressType
from app.models.communication import CommunicationChannel
from app.models.contact import Contact
from app.models.contact_company import ContactCompany, ContactCompanyFunction
from app.models.function import Function
from app.models.entity_log import EntityLog
from app.models.installation_photo import InstallationPhoto
from app.models.app_settings import AppSetting
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
        office_phone=company.office_phone,
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
        office_phone=payload.office_phone,
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
            sipv_enabled=c.sipv_enabled,
            sipv_tenant_id=c.sipv_tenant_id,
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
    # TASK-021/S032 : facturation récurrente obligatoire à l'activation --
    # défauts sensés (aujourd'hui, mensuel) si omis, mais toujours créée, pas
    # une option. Ignorés si enabled=False.
    billing_start_date: date | None = None
    billing_frequency: str = "mensuel"


NEXT_TENANT_NUMBER_KEY = "next_tenant_number"
# Point de depart : l'ancien systeme (Scopserv) allait jusqu'a T1045 -- premier
# numero auto-assigne par ERPCRM = T1046 (demande Philippe 2026-08-06).
NEXT_TENANT_NUMBER_DEFAULT = 1046


async def _peek_next_tenant_account_number(db: AsyncSession) -> str:
    result = await db.execute(select(AppSetting).where(AppSetting.key == NEXT_TENANT_NUMBER_KEY))
    setting = result.scalar_one_or_none()
    n = int(setting.value) if setting else NEXT_TENANT_NUMBER_DEFAULT
    return f"t{n}"


async def _advance_next_tenant_account_number(db: AsyncSession, used: str):
    n = int(used.lstrip("tT")) + 1
    result = await db.execute(select(AppSetting).where(AppSetting.key == NEXT_TENANT_NUMBER_KEY))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = str(n)
    else:
        db.add(AppSetting(key=NEXT_TENANT_NUMBER_KEY, value=str(n),
                          description="Prochain numero de tenant SIPV auto-assigne (format t####)"))


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
    Le numero de compte (tenant) s'auto-assigne (t1046, t1047, ...) si la
    compagnie n'en a pas deja un -- plus besoin de le saisir a la main.
    """
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    auto_assigned_number = None
    if payload.enabled and not company.account_number:
        auto_assigned_number = await _peek_next_tenant_account_number(db)
        company.account_number = auto_assigned_number

    try:
        sipv_result = await sipv_client.sync_company(
            account_number=company.account_number,
            company_name=company.name,
            erpcrm_company_id=str(company.id),
            is_active=payload.enabled,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable ou en erreur : {e}")

    if auto_assigned_number:
        await _advance_next_tenant_account_number(db, auto_assigned_number)

    company.sipv_enabled = payload.enabled
    if sipv_result.get("tenant_id"):
        company.sipv_tenant_id = uuid.UUID(sipv_result["tenant_id"])

    _log(db, company_id, current_user, "field_change",
         field_name="sipv_enabled",
         old_value=str(not payload.enabled),
         new_value=str(payload.enabled))

    # TASK-021/S032 : facturation récurrente obligatoire, créée en même temps
    # que le tenant -- jamais un tenant SIPV actif sans récurrence de
    # facturation associée (pas une option, demande explicite de Philippe
    # "je veux une facturation automatique pas le choix").
    if payload.enabled:
        from app.models.recurring_billing import CompanyRecurringBilling
        rb_result = await db.execute(select(CompanyRecurringBilling).where(CompanyRecurringBilling.company_id == company_id))
        rb = rb_result.scalar_one_or_none()
        if rb:
            rb.is_active = True
        else:
            db.add(CompanyRecurringBilling(
                company_id=company_id,
                start_date=payload.billing_start_date or date.today(),
                frequency=payload.billing_frequency if payload.billing_frequency in ("mensuel", "bimestriel", "trimestriel", "biannuel", "annuel") else "mensuel",
            ))
    else:
        # Tenant désactivé -- ne jamais continuer à facturer un service coupé
        # (même risque de double-facturation que celui soulevé par Philippe,
        # juste dans l'autre sens). Réversible : réactiver le tenant remet
        # is_active=True ci-dessus, rien n'est supprimé.
        from app.models.recurring_billing import CompanyRecurringBilling
        rb_result = await db.execute(select(CompanyRecurringBilling).where(CompanyRecurringBilling.company_id == company_id))
        rb = rb_result.scalar_one_or_none()
        if rb:
            rb.is_active = False

    await db.commit()

    result = await db.execute(select(Company).where(Company.id == company_id).options(*_load_opts()))
    return _build_company_out(result.scalar_one())


@router.get("/{company_id}/sip-extensions")
async def get_company_sip_extensions(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Postes SIP de cette compagnie (via SIPV, proxy) avec statut d'enregistrement en
    direct. Retourne une liste vide si le tenant SIPV n'est pas actif ou si SIPV est
    injoignable — jamais d'accès direct SIPV depuis le frontend.
    """
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        extensions = await sipv_client.list_extensions(str(company.sipv_tenant_id))
        regs = await sipv_client.tenant_registrations(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []
    reg_by_username = {r["username"]: r for r in regs}
    for ext in extensions:
        reg = reg_by_username.get(ext["username"])
        ext["registered"] = reg["registered"] if reg else False
        ext["public_ip"] = reg["public_ip"] if reg else None
        ext["private_ip"] = reg["private_ip"] if reg else None
        ext["reg_port"] = reg["port"] if reg else None
        ext["call_state"] = reg["call_state"] if reg else "idle"
    return extensions


@router.get("/{company_id}/moh/available")
async def get_company_moh_available(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """MOH disponibles pour cette compagnie (globales + dédiées à son tenant)."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_available_moh(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.post("/{company_id}/moh", status_code=status.HTTP_201_CREATED)
async def upload_company_moh(
    company_id: uuid.UUID, name: str = Form(...), file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    """Upload d'un fichier MOH dédié directement au tenant de cette compagnie
    (pas besoin de choisir la compagnie dans un menu -- déjà sur sa fiche)."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        raise HTTPException(status_code=400, detail="Cette compagnie n'a pas de tenant SIPV actif")
    try:
        content = await file.read()
        return await sipv_client.upload_moh(
            name, file.filename or "moh.wav", content, file.content_type, str(company.sipv_tenant_id),
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/{company_id}/moh/selection")
async def get_company_moh_selection(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.get_moh_selection(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


class MohSelectionItemPayload(BaseModel):
    moh_file_id: uuid.UUID
    sort_order: int = 0


@router.put("/{company_id}/moh/selection")
async def set_company_moh_selection(company_id: uuid.UUID, items: list[MohSelectionItemPayload], db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        raise HTTPException(status_code=400, detail="Cette compagnie n'a pas de tenant SIPV actif")
    try:
        return await sipv_client.set_moh_selection(str(company.sipv_tenant_id), [i.model_dump(mode="json") for i in items])
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


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


@router.delete("/{company_id}/communications/{comm_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_communication(company_id: uuid.UUID, comm_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(CommunicationChannel).where(
        CommunicationChannel.id == comm_id, CommunicationChannel.entity_id == company_id
    ))
    comm = result.scalar_one_or_none()
    if not comm:
        raise HTTPException(status_code=404, detail="Coordonnée introuvable")
    channel_type, value = comm.channel_type, comm.value
    await db.delete(comm)
    _log(db, company_id, current_user, "communication_removed",
         description=f"Coordonnée {channel_type} « {value} » retirée")
    await db.commit()


@router.post("/{company_id}/communications/{comm_id}/set-office-phone", response_model=CompanyOut)
async def set_office_phone(company_id: uuid.UUID, comm_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    comms = await db.execute(select(CommunicationChannel).where(
        CommunicationChannel.entity_id == company_id, CommunicationChannel.channel_type == "phone"
    ))
    channels = comms.scalars().all()
    target = next((ch for ch in channels if ch.id == comm_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Numéro introuvable")

    for ch in channels:
        ch.is_primary = (ch.id == comm_id)

    old_value = company.office_phone
    if str(old_value) != str(target.value):
        _log(db, company_id, current_user, "field_change",
             field_name="office_phone",
             old_value=old_value,
             new_value=target.value)
    company.office_phone = target.value
    await db.commit()

    result = await db.execute(select(Company).where(Company.id == company_id).options(*_load_opts()))
    return _build_company_out(result.scalar_one())


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


# ── Photos d'installation (TASK-024) ────────────────────────────────────────────

PHOTO_UPLOAD_DIR = Path("/home/simpleip/erpcrm/backend/uploads/installation_photos")
PHOTO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PHOTO_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic')


class PhotoOut(BaseModel):
    id: uuid.UUID
    url: str
    caption: str | None
    uploaded_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


def _photo_out(p: InstallationPhoto) -> PhotoOut:
    return PhotoOut(
        id=p.id, url=f"/uploads/installation_photos/{p.filename}", caption=p.caption,
        uploaded_by=p.uploaded_by.full_name if p.uploaded_by else None, created_at=p.created_at,
    )


@router.get("/{company_id}/photos", response_model=list[PhotoOut])
async def list_photos(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(InstallationPhoto).options(selectinload(InstallationPhoto.uploaded_by))
        .where(InstallationPhoto.company_id == company_id).order_by(InstallationPhoto.created_at.desc())
    )
    return [_photo_out(p) for p in result.scalars().all()]


@router.post("/{company_id}/photos", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    company_id: uuid.UUID, file: UploadFile = File(...), caption: str | None = Form(None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Company).where(Company.id == company_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in PHOTO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Format non supporté")
    photo_id = uuid.uuid4()
    filename = f"{photo_id}{ext}"
    dest = PHOTO_UPLOAD_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    p = InstallationPhoto(id=photo_id, company_id=company_id, filename=filename, caption=caption, uploaded_by_id=current_user.id)
    db.add(p)
    _log(db, company_id, current_user, "photo_added", description=caption or "Photo d'installation ajoutée")
    await db.commit()
    result = await db.execute(select(InstallationPhoto).options(selectinload(InstallationPhoto.uploaded_by)).where(InstallationPhoto.id == photo_id))
    return _photo_out(result.scalar_one())


@router.delete("/{company_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(company_id: uuid.UUID, photo_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(InstallationPhoto).where(InstallationPhoto.id == photo_id, InstallationPhoto.company_id == company_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Photo introuvable")
    path = PHOTO_UPLOAD_DIR / p.filename
    if path.exists():
        path.unlink()
    await db.delete(p)
    _log(db, company_id, current_user, "photo_removed", description="Photo d'installation retirée")
    await db.commit()


# ── Groupes d'appel (ring groups) — TASK-023.21 ────────────────────────────────
# Section separee dans l'onglet Telephonie de la fiche compagnie, demande explicite
# de l'utilisateur (2026-07-24) : "groupes d'appel, paging et pickup, 3 sections
# separees".

class RingGroupPayload(BaseModel):
    name: str
    extension: str
    ring_strategy: str = "simultaneous"
    ring_time: int = 20
    no_answer_destination: str | None = None
    confirm_before_answer: bool = False
    schedule_id: uuid.UUID | None = None

class RingGroupUpdatePayload(BaseModel):
    name: str | None = None
    ring_strategy: str | None = None
    ring_time: int | None = None
    no_answer_destination: str | None = None
    is_active: bool | None = None
    confirm_before_answer: bool | None = None
    schedule_id: uuid.UUID | None = None

class RingGroupMemberPayload(BaseModel):
    extension_id: uuid.UUID
    priority: int = 0
    ring_order: int = 0
    temporarily_excluded: bool = False

class RingGroupMemberUpdatePayload(BaseModel):
    priority: int | None = None
    ring_order: int | None = None
    temporarily_excluded: bool | None = None

class RingGroupFailoverStepPayload(BaseModel):
    step_order: int | None = None
    destination_type: str
    destination: str
    ring_seconds: int | None = None

class RingGroupFailoverStepUpdatePayload(BaseModel):
    step_order: int | None = None
    destination_type: str | None = None
    destination: str | None = None
    ring_seconds: int | None = None


async def _company_tenant_id(company_id: uuid.UUID, db: AsyncSession) -> str:
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        raise HTTPException(status_code=400, detail="Cette compagnie n'a pas de tenant SIPV actif")
    return str(company.sipv_tenant_id)


@router.get("/{company_id}/ivrs")
async def list_company_ivrs(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_ivrs(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.get("/{company_id}/queues")
async def list_company_queues(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_queues(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.get("/{company_id}/ring-groups")
async def list_company_ring_groups(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_ring_groups(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.post("/{company_id}/ring-groups", status_code=status.HTTP_201_CREATED)
async def create_company_ring_group(company_id: uuid.UUID, payload: RingGroupPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        return await sipv_client.create_ring_group(tenant_id, members=[], **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/ring-groups/{rg_id}")
async def update_company_ring_group(company_id: uuid.UUID, rg_id: uuid.UUID, payload: RingGroupUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_ring_group(str(rg_id), **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/ring-groups/{rg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_ring_group(company_id: uuid.UUID, rg_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_ring_group(str(rg_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/{company_id}/ring-groups/{rg_id}/members", status_code=status.HTTP_201_CREATED)
async def add_company_ring_group_member(company_id: uuid.UUID, rg_id: uuid.UUID, payload: RingGroupMemberPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.add_ring_group_member(str(rg_id), **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/ring-groups/members/{member_id}")
async def update_company_ring_group_member(company_id: uuid.UUID, member_id: uuid.UUID, payload: RingGroupMemberUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_ring_group_member(str(member_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/ring-groups/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_company_ring_group_member(company_id: uuid.UUID, member_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.remove_ring_group_member(str(member_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# TASK-S051 : chaine de destinations de secours illimitee (remplace no_answer_destination,
# jamais reellement cable dans le dialplan cote SIPV -- voir TASKSIPV.md TASK-S051).
@router.post("/{company_id}/ring-groups/{rg_id}/failover-steps", status_code=status.HTTP_201_CREATED)
async def add_company_ring_group_failover_step(company_id: uuid.UUID, rg_id: uuid.UUID, payload: RingGroupFailoverStepPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.add_ring_group_failover_step(str(rg_id), **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/ring-groups/failover-steps/{step_id}")
async def update_company_ring_group_failover_step(company_id: uuid.UUID, step_id: uuid.UUID, payload: RingGroupFailoverStepUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_ring_group_failover_step(str(step_id), **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/ring-groups/failover-steps/{step_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_company_ring_group_failover_step(company_id: uuid.UUID, step_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.remove_ring_group_failover_step(str(step_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Pickup group (interception) — TASK-023.22, section separee ────────────────
class PickupGroupUpdatePayload(BaseModel):
    pickup_group: str | None = None
    can_intercept_calls: bool | None = None


@router.put("/{company_id}/extensions/{extension_id}/pickup-group")
async def update_extension_pickup_group(company_id: uuid.UUID, extension_id: uuid.UUID, payload: PickupGroupUpdatePayload, _: User = Depends(get_current_user)):
    """Assigne/retire un poste d'un groupe d'interception (pickup_group, deja
    existant sur SIPExtension depuis S007.2 -- pas de nouveau modele necessaire)."""
    try:
        return await sipv_client.update_extension(str(extension_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class ExtensionActivePayload(BaseModel):
    is_active: bool


@router.put("/{company_id}/extensions/{extension_id}/active")
async def update_extension_active(company_id: uuid.UUID, extension_id: uuid.UUID, payload: ExtensionActivePayload, _: User = Depends(get_current_user)):
    """Active/desactive un poste -- meme principe que la case a cocher Actif
    d'un DID (TASK-023.31), demande Philippe 2026-08-07."""
    try:
        return await sipv_client.update_extension(str(extension_id), is_active=payload.is_active)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Groupes de pickup nommes — TASK-023.15.1 : "+Ajouter" cree le groupe (vide),
# on assigne ensuite les postes dedans (meme principe que les groupes d'appel),
# au lieu de taper le meme nom en texte libre sur chaque poste.
class PickupGroupPayload(BaseModel):
    name: str

class PickupGroupRenamePayload(BaseModel):
    name: str | None = None
    is_active: bool | None = None


@router.get("/{company_id}/pickup-groups")
async def list_company_pickup_groups(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_pickup_groups(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.post("/{company_id}/pickup-groups", status_code=status.HTTP_201_CREATED)
async def create_company_pickup_group(company_id: uuid.UUID, payload: PickupGroupPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        return await sipv_client.create_pickup_group(tenant_id, name=payload.name)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/pickup-groups/{group_id}")
async def update_company_pickup_group(company_id: uuid.UUID, group_id: uuid.UUID, payload: PickupGroupRenamePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_pickup_group(str(group_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/pickup-groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_pickup_group(company_id: uuid.UUID, group_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_pickup_group(str(group_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Groupe de paging — TASK-023.24, 3e section separee (ring group / pickup / paging) ─
class PagingGroupPayload(BaseModel):
    name: str
    extension: str
    mode: str = "unidirectional"
    multicast_address: str | None = None
    multicast_port: int | None = None

class PagingGroupUpdatePayload(BaseModel):
    name: str | None = None
    extension: str | None = None
    mode: str | None = None
    multicast_address: str | None = None
    multicast_port: int | None = None
    is_active: bool | None = None

class PagingGroupMemberPayload(BaseModel):
    extension_id: uuid.UUID
    can_send: bool = True
    can_receive: bool = True

class PagingGroupMemberUpdatePayload(BaseModel):
    can_send: bool | None = None
    can_receive: bool | None = None


@router.get("/{company_id}/paging-groups")
async def list_company_paging_groups(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_paging_groups(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.post("/{company_id}/paging-groups", status_code=status.HTTP_201_CREATED)
async def create_company_paging_group(company_id: uuid.UUID, payload: PagingGroupPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        return await sipv_client.create_paging_group(tenant_id, **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/paging-groups/{pg_id}")
async def update_company_paging_group(company_id: uuid.UUID, pg_id: uuid.UUID, payload: PagingGroupUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_paging_group(str(pg_id), **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/paging-groups/{pg_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_paging_group(company_id: uuid.UUID, pg_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_paging_group(str(pg_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/{company_id}/paging-groups/{pg_id}/members", status_code=status.HTTP_201_CREATED)
async def add_company_paging_group_member(company_id: uuid.UUID, pg_id: uuid.UUID, payload: PagingGroupMemberPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.add_paging_group_member(str(pg_id), **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/{company_id}/paging-groups/members/{member_id}")
async def update_company_paging_group_member(company_id: uuid.UUID, member_id: uuid.UUID, payload: PagingGroupMemberUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_paging_group_member(str(member_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/paging-groups/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_company_paging_group_member(company_id: uuid.UUID, member_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.remove_paging_group_member(str(member_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Templates de boutons — TASK-023.26, liste dans compagnie/telephonie ────────
@router.get("/{company_id}/button-templates")
async def list_company_button_templates(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_button_templates(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


@router.delete("/{company_id}/button-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_button_template(company_id: uuid.UUID, template_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_button_template(str(template_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/{company_id}/button-templates/{template_id}/apply/{phone_id}")
async def apply_company_button_template(company_id: uuid.UUID, template_id: uuid.UUID, phone_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.apply_button_template(str(template_id), str(phone_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/{company_id}/extensions/{extension_id}/phone")
async def get_extension_phone(company_id: uuid.UUID, extension_id: uuid.UUID, _: User = Depends(get_current_user)):
    """Telephone physique attribue a ce poste -- utilise pour resoudre un numero de
    poste vers un phone_id avant d'appliquer un template (TASK-023.26)."""
    try:
        return await sipv_client.get_phone_by_extension(str(extension_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Options telephonie -- defauts compagnie (TASK-S011.5) ──────────────────────
# Style "Options" UCM : seules les cles ajoutees ici apparaissent sur la fiche
# compagnie. S'applique a tous les postes de la compagnie sauf override contact
# (ProvisionedPhone.extra_config, voir contacts.py).

class PhoneOptionsPayload(BaseModel):
    phone_option_defaults: dict | None = None
    selected_tenant_template_ids: list[uuid.UUID] | None = None  # TASK-S044.2
    selected_global_template_ids: list[uuid.UUID] | None = None  # TASK-S044.2
    moh_shuffle: bool | None = None  # TASK-S033.2


def _phone_options_out(tenant: dict) -> dict:
    return {
        "phone_option_defaults": tenant.get("phone_option_defaults") or {},
        "selected_tenant_template_ids": tenant.get("selected_tenant_template_ids") or [],
        "selected_global_template_ids": tenant.get("selected_global_template_ids") or [],
        "moh_shuffle": tenant.get("moh_shuffle", True),
    }


@router.get("/{company_id}/phone-options")
async def get_company_phone_options(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return _phone_options_out({})
    try:
        tenant = await sipv_client.get_tenant(str(company.sipv_tenant_id))
        return _phone_options_out(tenant)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/{company_id}/phone-options")
async def update_company_phone_options(company_id: uuid.UUID, payload: PhoneOptionsPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    data = payload.model_dump(exclude_unset=True)
    for k in ("selected_tenant_template_ids", "selected_global_template_ids"):
        if k in data and data[k] is not None:
            data[k] = [str(x) for x in data[k]]
    try:
        tenant = await sipv_client.update_tenant(tenant_id, **data)
        return _phone_options_out(tenant)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Tenant/Tenant-Model Templates -- chaine d'heritage a 5 niveaux (TASK-S044/
# TASK-S044.1) -- "Template de tenant" est maintenant une bibliotheque PAR
# SERVEUR (creee dans Serveur, voir server.py), plus geree ici : Compagnie ne
# fait plus que LISTER les templates disponibles pour son serveur (pour le
# picker) + choisir lequel via phone-options ci-dessous
# (Tenant.selected_tenant_template_id). "Template par modele" reste par
# contre cree ICI (scope compagnie), confirme correct par Philippe.
class TemplatePayload(BaseModel):
    name: str
    description: str | None = None
    options: dict = {}
    is_default: bool = False
    is_active: bool = True

class TemplateUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    options: dict | None = None
    is_default: bool | None = None
    is_active: bool | None = None


@router.get("/{company_id}/tenant-templates")
async def list_company_tenant_templates(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Bibliotheque de templates disponibles pour le serveur de cette compagnie
    (lecture seule ici -- creation/edition dans Serveur, voir server.py)."""
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        tenant = await sipv_client.get_tenant(tenant_id)
        if not tenant.get("server_id"):
            return []
        return await sipv_client.list_tenant_templates(tenant["server_id"])
    except httpx.HTTPError:
        return []


@router.get("/{company_id}/global-templates")
async def list_company_global_templates(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Global Templates du serveur de cette compagnie (TASK-S044.2) -- pour que
    la compagnie puisse en choisir des SUPPLEMENTAIRES en plus de celui
    is_default (automatique). Lecture seule ici -- creation dans Serveur."""
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        tenant = await sipv_client.get_tenant(tenant_id)
        if not tenant.get("server_id"):
            return []
        return await sipv_client.list_global_templates(tenant["server_id"])
    except httpx.HTTPError:
        return []


@router.get("/{company_id}/tenant-model-templates")
async def list_company_tenant_model_templates(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        return []
    try:
        return await sipv_client.list_tenant_model_templates(str(company.sipv_tenant_id))
    except httpx.HTTPError:
        return []


class TenantModelTemplatePayload(TemplatePayload):
    phone_model_id: uuid.UUID


@router.post("/{company_id}/tenant-model-templates", status_code=status.HTTP_201_CREATED)
async def create_company_tenant_model_template(company_id: uuid.UUID, payload: TenantModelTemplatePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        return await sipv_client.create_tenant_model_template(tenant_id=tenant_id, phone_model_id=str(payload.phone_model_id), **payload.model_dump(exclude={"phone_model_id"}))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/{company_id}/tenant-model-templates/{template_id}")
async def update_company_tenant_model_template(company_id: uuid.UUID, template_id: uuid.UUID, payload: TemplateUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_tenant_model_template(str(template_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{company_id}/tenant-model-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company_tenant_model_template(company_id: uuid.UUID, template_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_tenant_model_template(str(template_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Succursales (company_sites) -- ERPCRM maitre, synchronise vers SIPV
# (E911Address), TASK-S010.4. Remplace l'ancien proxy direct SIPV : la sync
# est bloquante (comme toggle_sipv_tenant/_company_tenant_id) -- si SIPV ne
# repond pas, rien n'est sauvegarde d'aucun cote, jamais d'etat divergent.
class SitePayload(BaseModel):
    label: str
    civic_number: str
    street_name: str
    unit: str | None = None
    city: str
    province: str
    postal_code: str
    country: str = "CA"
    billing_contact_id: uuid.UUID | None = None
    billing_email: str | None = None
    notes: str | None = None
    is_primary: bool = False

class SiteUpdatePayload(BaseModel):
    label: str | None = None
    civic_number: str | None = None
    street_name: str | None = None
    unit: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    billing_contact_id: uuid.UUID | None = None
    clear_billing_contact: bool = False
    billing_email: str | None = None
    notes: str | None = None
    is_active: bool | None = None
    is_primary: bool | None = None

class SiteOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    label: str
    civic_number: str
    street_name: str
    unit: str | None
    city: str
    province: str
    postal_code: str
    country: str
    billing_contact_id: uuid.UUID | None
    billing_contact_label: str | None
    billing_email: str | None
    notes: str | None
    is_active: bool
    is_primary: bool


def _site_out(s: CompanySite) -> SiteOut:
    contact = s.billing_contact
    return SiteOut(id=s.id, company_id=s.company_id, label=s.label, civic_number=s.civic_number,
                   street_name=s.street_name, unit=s.unit, city=s.city, province=s.province,
                   postal_code=s.postal_code, country=s.country, billing_contact_id=s.billing_contact_id,
                   billing_contact_label=f"{contact.first_name} {contact.last_name}".strip() if contact else None,
                   billing_email=s.billing_email, notes=s.notes, is_active=s.is_active, is_primary=s.is_primary)


async def _unset_other_primaries(company_id: uuid.UUID, keep_site_id: uuid.UUID, db: AsyncSession):
    """Une seule succursale principale a la fois par compagnie."""
    result = await db.execute(select(CompanySite).where(CompanySite.company_id == company_id, CompanySite.id != keep_site_id, CompanySite.is_primary == True))
    for other in result.scalars().all():
        other.is_primary = False


async def _apply_billing_email_to_contact(contact_id: uuid.UUID | None, email: str | None, db: AsyncSession):
    """Si un courriel de facturation different de ceux deja connus est saisi
    pour un contact existant, l'ajoute dans "Autre courriel" du contact plutot
    que de le laisser seulement sur la succursale (demande Philippe 2026-08-05)."""
    if not contact_id or not email:
        return
    contact = await db.get(Contact, contact_id)
    if not contact or email == contact.email or email == contact.email_other:
        return
    contact.email_other = email


@router.get("/{company_id}/sites", response_model=list[SiteOut])
async def list_company_sites(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await ensure_primary_site(company_id, db)
    result = await db.execute(
        select(CompanySite).options(selectinload(CompanySite.billing_contact))
        .where(CompanySite.company_id == company_id).order_by(CompanySite.label)
    )
    return [_site_out(s) for s in result.scalars().all()]


@router.post("/{company_id}/sites", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def create_company_site(company_id: uuid.UUID, payload: SitePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id(company_id, db)
    site_id = uuid.uuid4()
    try:
        sipv_result = await sipv_client.sync_site(
            tenant_id=tenant_id, erpcrm_site_id=str(site_id), label=payload.label,
            civic_number=payload.civic_number, street_name=payload.street_name, unit=payload.unit,
            city=payload.city, province=payload.province, postal_code=payload.postal_code,
            country=payload.country, is_active=True,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

    site = CompanySite(id=site_id, company_id=company_id,
                       sipv_e911_address_id=uuid.UUID(sipv_result["e911_address_id"]),
                       **payload.model_dump())
    db.add(site)
    if payload.is_primary:
        await _unset_other_primaries(company_id, site_id, db)
    await _apply_billing_email_to_contact(payload.billing_contact_id, payload.billing_email, db)
    await db.commit()
    result = await db.execute(select(CompanySite).options(selectinload(CompanySite.billing_contact)).where(CompanySite.id == site.id))
    return _site_out(result.scalar_one())


@router.put("/{company_id}/sites/{site_id}", response_model=SiteOut)
async def update_company_site(company_id: uuid.UUID, site_id: uuid.UUID, payload: SiteUpdatePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    site = await db.get(CompanySite, site_id)
    if not site or site.company_id != company_id:
        raise HTTPException(status_code=404, detail="Succursale introuvable")
    tenant_id = await _company_tenant_id(company_id, db)

    updates = payload.model_dump(exclude_unset=True)
    clear_billing_contact = updates.pop("clear_billing_contact", False)
    new_billing_contact_id = updates.pop("billing_contact_id", site.billing_contact_id)
    billing_contact_id = None if clear_billing_contact else new_billing_contact_id
    merged = {
        "label": updates.get("label", site.label),
        "civic_number": updates.get("civic_number", site.civic_number),
        "street_name": updates.get("street_name", site.street_name),
        "unit": updates.get("unit", site.unit),
        "city": updates.get("city", site.city),
        "province": updates.get("province", site.province),
        "postal_code": updates.get("postal_code", site.postal_code),
        "is_active": updates.get("is_active", site.is_active),
    }
    try:
        await sipv_client.sync_site(tenant_id=tenant_id, erpcrm_site_id=str(site.id), country=site.country, **merged)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

    for k, v in updates.items():
        setattr(site, k, v)
    site.billing_contact_id = billing_contact_id
    if updates.get("is_primary"):
        await _unset_other_primaries(company_id, site.id, db)
    await _apply_billing_email_to_contact(billing_contact_id, updates.get("billing_email", site.billing_email), db)
    await db.commit()
    result = await db.execute(select(CompanySite).options(selectinload(CompanySite.billing_contact)).where(CompanySite.id == site.id))
    return _site_out(result.scalar_one())


@router.delete("/{company_id}/sites/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_company_site(company_id: uuid.UUID, site_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Desactive la succursale -- jamais de suppression reelle, toujours
    reactivable via PUT is_active=true (meme philosophie que le reste du
    projet : toute donnee creee reste modifiable)."""
    site = await db.get(CompanySite, site_id)
    if not site or site.company_id != company_id:
        raise HTTPException(status_code=404, detail="Succursale introuvable")
    tenant_id = await _company_tenant_id(company_id, db)
    try:
        await sipv_client.sync_site(
            tenant_id=tenant_id, erpcrm_site_id=str(site.id), label=site.label,
            civic_number=site.civic_number, street_name=site.street_name, unit=site.unit,
            city=site.city, province=site.province, postal_code=site.postal_code,
            country=site.country, is_active=False,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    site.is_active = False
    await db.commit()
