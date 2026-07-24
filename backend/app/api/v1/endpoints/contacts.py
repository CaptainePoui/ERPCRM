import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core import sipv_client
from app.api.v1.endpoints.auth import get_current_user, get_current_user_or_service
from app.models.entity import Entity, EntityType
from app.models.contact import Contact
from app.models.company import Company
from app.models.status import Status, EntityStatus
from app.models.contact_company import ContactCompany, ContactCompanyFunction
from app.models.entity_log import EntityLog
from app.models.user import User
from app.schemas.contact import ContactCreate, ContactUpdate, ContactOut, ContactListItem, CompanyInContactOut
from pydantic import BaseModel

router = APIRouter()


def _load_opts():
    return [
        selectinload(Contact.entity).selectinload(Entity.statuses).selectinload(EntityStatus.status),
        selectinload(Contact.contact_companies).selectinload(ContactCompany.company),
        selectinload(Contact.contact_companies).selectinload(ContactCompany.functions).selectinload(ContactCompanyFunction.function),
    ]


def _office_company(contact: Contact) -> Company | None:
    """
    Compagnie dont le "Telephone bureau" du contact est le reflet : la compagnie
    principale du contact (is_primary sur le lien), sinon la premiere compagnie
    liee active, sinon aucune (contact sans compagnie garde son propre champ).
    """
    active = [cc for cc in contact.contact_companies if cc.is_active]
    chosen = next((cc for cc in active if cc.is_primary), None) or (active[0] if active else None)
    return chosen.company if chosen else None


def _build_contact_out(contact: Contact) -> ContactOut:
    companies_out = [CompanyInContactOut(
        contact_company_id=cc.id,
        company_id=cc.company.id,
        company_name=cc.company.name,
        email=cc.email,
        is_primary=cc.is_primary,
        is_active=cc.is_active,
        functions=[f.function.name for f in cc.functions],
    ) for cc in contact.contact_companies]
    office_company = _office_company(contact)
    return ContactOut(
        id=contact.id,
        entity_id=contact.entity.id,
        first_name=contact.first_name,
        last_name=contact.last_name,
        email=contact.email,
        phone=office_company.office_phone if office_company else contact.phone,
        mobile=contact.mobile,
        extension=contact.extension,
        phone_other=contact.phone_other,
        sipv_sync=contact.sipv_sync,
        notes_internal=contact.notes_internal,
        is_active=contact.is_active,
        created_at=contact.entity.created_at,
        updated_at=contact.entity.updated_at,
        statuses=[es.status for es in contact.entity.statuses],
        companies=companies_out,
    )


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
async def create_contact(payload: ContactCreate, db: AsyncSession = Depends(get_db), _: User | None = Depends(get_current_user_or_service)):
    entity = Entity(entity_type=EntityType.person)
    db.add(entity)
    await db.flush()

    contact = Contact(
        id=entity.id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        mobile=payload.mobile,
        extension=payload.extension,
        phone_other=payload.phone_other,
        sipv_sync=payload.sipv_sync,
        notes_internal=payload.notes_internal,
    )
    db.add(contact)
    await db.flush()

    for status_id in payload.status_ids:
        db.add(EntityStatus(entity_id=entity.id, status_id=status_id))

    await db.commit()

    result = await db.execute(select(Contact).where(Contact.id == contact.id).options(*_load_opts()))
    return _build_contact_out(result.scalar_one())


@router.get("", response_model=list[ContactListItem])
async def list_contacts(
    company_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User | None = Depends(get_current_user_or_service),
):
    q = select(Contact).options(*_load_opts()).order_by(Contact.last_name, Contact.first_name)
    if company_id:
        q = q.join(Contact.contact_companies).where(
            ContactCompany.company_id == company_id,
            ContactCompany.is_active == True,
        )
    if search:
        like = f"%{search}%"
        q = q.where((Contact.first_name.ilike(like)) | (Contact.last_name.ilike(like)))
    result = await db.execute(q)
    contacts = result.scalars().unique().all()
    def _email_for(c: Contact, filt_company_id) -> str | None:
        """Return company-specific email if filtered, else first CC email found, else personal."""
        if filt_company_id:
            for cc in c.contact_companies:
                if cc.company_id == filt_company_id:
                    return cc.email
        # fallback: first non-null CC email, then personal
        for cc in c.contact_companies:
            if cc.email:
                return cc.email
        return c.email

    return [ContactListItem(
        id=c.id,
        entity_id=c.entity.id,
        first_name=c.first_name,
        last_name=c.last_name,
        is_active=c.is_active,
        created_at=c.entity.created_at,
        statuses=[es.status for es in c.entity.statuses],
        companies=[CompanyInContactOut(
            contact_company_id=cc.id,
            company_id=cc.company.id,
            company_name=cc.company.name,
            email=cc.email,
            is_primary=cc.is_primary,
            is_active=cc.is_active,
            functions=[f.function.name for f in cc.functions],
        ) for cc in c.contact_companies],
        email=_email_for(c, company_id),
        phone=(_office_company(c).office_phone if _office_company(c) else c.phone),
        mobile=c.mobile,
    ) for c in contacts]


@router.get("/{contact_id}", response_model=ContactOut)
async def get_contact(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User | None = Depends(get_current_user_or_service)):
    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    return _build_contact_out(contact)


@router.get("/{contact_id}/sip-extension")
async def get_contact_sip_extension(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Poste SIP lie a ce contact (via SIPV, proxy — jamais d'appel direct SIPV depuis
    le frontend). Retourne null si pas de poste lie ou si SIPV est injoignable.
    """
    contact = await db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if not contact.sipv_sync:
        return None
    try:
        extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
    except httpx.HTTPError:
        return None
    return extensions[0] if extensions else None


@router.get("/{contact_id}/sip-extension/connection-info")
async def get_contact_sip_connection_info(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Infos de connexion completes (avec mot de passe) du poste SIP lie a ce contact —
    pour configuration manuelle d'un telephone quand le provisioning automatique
    echoue. Appel serveur a serveur chiffre en TLS (voir sipv_client._CA_PATH).
    """
    contact = await db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if not contact.sipv_sync:
        raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
    try:
        extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
        if not extensions:
            raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
        return await sipv_client.get_connection_info(extensions[0]["id"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class SipExtensionUpdate(BaseModel):
    record_calls: bool | None = None
    record_mode: str | None = None
    record_internal_incoming: bool | None = None
    record_internal_outgoing: bool | None = None
    record_external_incoming: bool | None = None
    record_external_outgoing: bool | None = None
    forward_immediate_enabled: bool | None = None
    forward_immediate_destination: str | None = None
    forward_busy_enabled: bool | None = None
    forward_busy_destination: str | None = None
    forward_no_answer_enabled: bool | None = None
    forward_no_answer_destination: str | None = None
    forward_no_answer_delay_seconds: int | None = None
    forward_offline_enabled: bool | None = None
    forward_offline_destination: str | None = None
    # --- TASK-023.5 : plan d'appel (TASKSIPV S018.5) + caller ID interne/externe (S018.6) ---
    allow_canada: bool | None = None
    allow_us: bool | None = None
    allow_international: bool | None = None
    allow_premium: bool | None = None
    blocked_countries: str | None = None
    blocked_prefixes: str | None = None
    ld_pin: str | None = None
    ld_monthly_limit: float | None = None
    caller_id_internal_name: str | None = None
    caller_id_internal_number: str | None = None
    caller_id_external_name: str | None = None
    caller_id_external_number: str | None = None
    hide_caller_id: bool | None = None


@router.put("/{contact_id}/sip-extension")
async def update_contact_sip_extension(contact_id: uuid.UUID, payload: SipExtensionUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Met a jour l'enregistrement d'appel / les renvois du poste SIP lie a ce contact,
    directement depuis la fiche contact ERPCRM (config utilisee frequemment,
    contrairement aux reglages plus techniques geres uniquement dans SIPV).
    """
    contact = await db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if not contact.sipv_sync:
        raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
    try:
        extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
        if not extensions:
            raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
        return await sipv_client.update_extension(extensions[0]["id"], **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/{contact_id}", response_model=ContactOut)
async def update_contact(contact_id: uuid.UUID, payload: ContactUpdate, db: AsyncSession = Depends(get_db), user: User | None = Depends(get_current_user_or_service)):
    result = await db.execute(select(Contact).where(Contact.id == contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        old_value = getattr(contact, field, None)
        if str(old_value) != str(value):
            db.add(EntityLog(entity_id=contact_id, user_id=user.id if user else None, action="field_change",
                              field_name=field,
                              old_value=str(old_value) if old_value is not None else None,
                              new_value=str(value) if value is not None else None))
        setattr(contact, field, value)
    await db.commit()
    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    return _build_contact_out(result.scalar_one())


class OfficePhoneUpdate(BaseModel):
    value: str | None = None


@router.put("/{contact_id}/office-phone", response_model=ContactOut)
async def update_office_phone(contact_id: uuid.UUID, payload: OfficePhoneUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    company = _office_company(contact)
    if not company:
        raise HTTPException(status_code=400, detail="Ce contact n'est lié à aucune compagnie")

    old_value = company.office_phone
    new_value = payload.value or None
    if str(old_value) != str(new_value):
        db.add(EntityLog(entity_id=company.id, contact_id=contact_id, user_id=current_user.id, action="field_change",
                          field_name="office_phone",
                          old_value=old_value,
                          new_value=new_value))
    company.office_phone = new_value
    await db.commit()

    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    return _build_contact_out(result.scalar_one())


@router.post("/{contact_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def assign_status(contact_id: uuid.UUID, status_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if not (await db.execute(select(Contact).where(Contact.id == contact_id))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Contact introuvable")
    existing = await db.execute(select(EntityStatus).where(EntityStatus.entity_id == contact_id, EntityStatus.status_id == status_id))
    if not existing.scalar_one_or_none():
        db.add(EntityStatus(entity_id=contact_id, status_id=status_id))
        await db.commit()


@router.delete("/{contact_id}/statuses/{status_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_status(contact_id: uuid.UUID, status_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(EntityStatus).where(EntityStatus.entity_id == contact_id, EntityStatus.status_id == status_id))
    es = result.scalar_one_or_none()
    if es:
        await db.delete(es)
        await db.commit()
