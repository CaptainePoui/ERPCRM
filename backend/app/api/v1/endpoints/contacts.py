import uuid
import httpx
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core import sipv_client
from app.core.site_defaults import ensure_primary_site
from app.api.v1.endpoints.auth import get_current_user, get_current_user_or_service
from app.models.entity import Entity, EntityType
from app.models.contact import Contact
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.status import Status, EntityStatus
from app.models.contact_company import ContactCompany, ContactCompanyFunction
from app.models.entity_log import EntityLog
from app.models.recurring_billing import CompanyRecurringBilling, RecurringBillingLine
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
        email_other=contact.email_other,
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
        email_other=payload.email_other,
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


class ContactSipvDeactivateOut(BaseModel):
    contact: ContactOut
    prorata_credit: float | None = None
    prorata_description: str | None = None


@router.put("/{contact_id}/sip-extension/deactivate", response_model=ContactSipvDeactivateOut)
async def deactivate_contact_sip_extension(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """TASK-033 : decocher "Synchroniser avec SIPV" desactive le vrai poste
    (jamais supprime ici -- reversible, meme principe que le tenant SIPV
    d'une compagnie). La suppression reelle du poste ne se fait qu'au
    moment de supprimer le contact (voir delete_contact ci-dessous).
    Cote SIPV, ce changement d'is_active declenche automatiquement le
    retrait de la ligne de facturation recurrente avec credit de prorata
    (extensions.py::update_extension, TASK-033) -- on relit ici la ligne de
    credit generee pour l'afficher a l'utilisateur."""
    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    primary = _office_company(contact)
    ext_id = None
    try:
        extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
        if extensions:
            ext_id = extensions[0]["id"]
            await sipv_client.update_extension(ext_id, is_active=False)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    contact.sipv_sync = False
    await db.commit()

    prorata_credit = None
    prorata_description = None
    if ext_id:
        # La ligne de credit generee par le webhook n'a PAS de service_ref
        # (seulement service_type, voir recurring_billing.py::sipv_billing_event
        # branche "_removed") -- on prend la plus recente pour ce type de
        # service sur la recurrence de CETTE compagnie.
        if primary:
            rb_result = await db.execute(select(CompanyRecurringBilling).where(CompanyRecurringBilling.company_id == primary.id))
            rb = rb_result.scalar_one_or_none()
            if rb:
                credit_result = await db.execute(
                    select(RecurringBillingLine).where(
                        RecurringBillingLine.recurring_billing_id == rb.id,
                        RecurringBillingLine.is_prorata_credit == True,
                        RecurringBillingLine.service_type == "extension",
                    ).order_by(RecurringBillingLine.created_at.desc()).limit(1)
                )
                credit_line = credit_result.scalar_one_or_none()
                if credit_line:
                    prorata_credit = credit_line.unit_price
                    prorata_description = credit_line.description

    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    return ContactSipvDeactivateOut(
        contact=_build_contact_out(result.scalar_one()),
        prorata_credit=prorata_credit,
        prorata_description=prorata_description,
    )


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    contact = await db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    # TASK-033 : ne se fie plus au seul booleen sipv_sync (imprecis -- reste
    # a False meme si un poste desactive existe encore) -- interroge SIPV
    # directement. Poste encore ACTIF -> bloque (desactiver d'abord). Poste
    # INACTIF -> supprime reellement le poste dans SIPV (prorata/notification
    # deja geres par SIPV lui-meme, voir extensions.py::delete_extension)
    # puis le contact. Aucun poste -> rien de plus a faire.
    try:
        extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable — impossible de vérifier l'état du poste avant suppression")
    if extensions:
        ext = extensions[0]
        if ext.get("is_active"):
            raise HTTPException(status_code=400, detail="Ce contact a un poste SIP encore actif dans SIPV — désactivez-le d'abord (décocher « Synchroniser avec SIPV »)")
        try:
            await sipv_client.delete_extension(ext["id"])
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="SIPV injoignable — impossible de supprimer le poste")
    # Supprime l'Entity (pas juste le Contact) -- Contact.id EST entities.id
    # (cle partagee), le cascade sur entities nettoie aussi statuses/
    # communication_channels/addresses de ce contact (voir app/models/entity.py).
    # DELETE brut (pas db.delete(entity)) -- SQLAlchemy essaie sinon de gerer
    # la cascade lui-meme au niveau ORM (mettre contacts.id a NULL avant de
    # supprimer), ce qui plante puisque contacts.id est une cle primaire, pas
    # juste une FK nullable ("tried to blank-out primary key column"). Un
    # DELETE brut laisse Postgres gerer le ON DELETE CASCADE directement.
    await db.execute(sa_delete(Entity).where(Entity.id == contact_id))
    await db.commit()


class ContactSipvActivate(BaseModel):
    # TASK-033 : reutilisable comme date de portabilite (un numero porte depuis
    # un autre fournisseur a une date de portabilite precise -- le poste peut
    # etre cree avant, mais la facturation doit demarrer a cette date-la, pas
    # "aujourd'hui"). Meme convention que SipvTenantToggle.billing_start_date.
    billing_start_date: date | None = None
    billing_frequency: str = "mensuel"
    extension_number: str | None = None  # auto-assignee au prochain disponible si omis


class ContactSipvActivateOut(BaseModel):
    contact: ContactOut
    period_start: date | None = None
    period_end: date | None = None
    days_billed: int | None = None


@router.post("/{contact_id}/sip-extension", response_model=ContactSipvActivateOut, status_code=status.HTTP_201_CREATED)
async def create_contact_sip_extension(
    contact_id: uuid.UUID, payload: ContactSipvActivate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """
    TASK-033 : cree reellement un poste SIP pour ce contact (au lieu de
    simplement flipper sipv_sync -- design d'origine TASK-016, jamais un vrai
    provisionnement). Parite avec le "Tenant telephonique SIPV" de la
    compagnie (meme popup de confirmation, meme moteur de facturation
    recurrente en dessous) :
    1. Si la compagnie du contact n'a pas encore de tenant SIPV actif, on
       l'active d'abord (reutilise toggle_sipv_tenant tel quel -- meme
       logique, pas de duplication).
    2. Cree le poste dans SIPV, lie directement a ce contact (pas de
       recherche floue par nom).
    3. SIPV notifie automatiquement ERPCRM (webhook /billing/sipv-event,
       deja cable depuis TASK-021) qui ajoute la ligne de facturation --
       rien a faire de plus ici pour la partie facturation.
    """
    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if contact.sipv_sync:
        raise HTTPException(status_code=400, detail="Ce contact a déjà un poste SIP synchronisé")
    company = _office_company(contact)
    if not company:
        raise HTTPException(status_code=400, detail="Ce contact n'est lié à aucune compagnie")

    if not company.sipv_enabled:
        from app.api.v1.endpoints.companies import toggle_sipv_tenant, SipvTenantToggle
        await toggle_sipv_tenant(
            company.id,
            SipvTenantToggle(enabled=True, billing_start_date=payload.billing_start_date, billing_frequency=payload.billing_frequency),
            db, current_user,
        )
        await db.refresh(company)
    if not company.sipv_tenant_id:
        raise HTTPException(status_code=502, detail="Tenant SIPV introuvable après activation — réessayez")
    tenant_id = str(company.sipv_tenant_id)

    extension_number = payload.extension_number
    if not extension_number:
        try:
            existing = await sipv_client.list_extensions(tenant_id)
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="SIPV injoignable (liste des postes)")
        used_numbers = [int(e["extension"]) for e in existing if str(e.get("extension", "")).isdigit()]
        extension_number = str(max(used_numbers) + 1) if used_numbers else "100"

    try:
        await sipv_client.create_extension(
            tenant_id,
            extension=extension_number,
            name=f"{contact.first_name} {contact.last_name}".strip(),
            erpcrm_contact_id=str(contact.id),
            billing_effective_date=payload.billing_start_date.isoformat() if payload.billing_start_date else None,
        )
    except httpx.HTTPStatusError as e:
        detail = "Échec de la création du poste"
        try:
            detail = e.response.json().get("detail", detail)
        except Exception:
            pass
        raise HTTPException(status_code=e.response.status_code if e.response.status_code < 500 else 502, detail=detail)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")

    contact.sipv_sync = True
    contact.extension = extension_number
    await db.commit()

    # TASK-033 : previsualise la periode facturee du cycle courant pour ce
    # nouveau poste (transparence -- l'utilisateur demande a voir les jours
    # facturables, pas juste un succes silencieux). Meme calcul que celui
    # utilise par SIPV/le webhook pour le prorata reel.
    period_start = period_end = days_billed = None
    rb_result = await db.execute(select(CompanyRecurringBilling).where(CompanyRecurringBilling.company_id == company.id))
    rb = rb_result.scalar_one_or_none()
    if rb:
        from app.api.v1.endpoints.recurring_billing import _cycle_bounds
        effective = payload.billing_start_date or date.today()
        period_start, period_end = _cycle_bounds(rb.start_date, rb.frequency, effective)
        days_billed = (period_end - effective).days

    result = await db.execute(select(Contact).where(Contact.id == contact_id).options(*_load_opts()))
    return ContactSipvActivateOut(
        contact=_build_contact_out(result.scalar_one()),
        period_start=period_start, period_end=period_end, days_billed=days_billed,
    )


@router.get("/{contact_id}/sip-extension")
async def get_contact_sip_extension(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """
    Poste SIP lie a ce contact (via SIPV, proxy — jamais d'appel direct SIPV depuis
    le frontend). Retourne null si pas de poste lie ou si SIPV est injoignable.
    Statut en direct (registered/call_state) fusionne (TASK-023.8) -- meme pattern
    que GET /companies/{id}/sip-extensions, absent ici avant cette tache.
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
    if not extensions:
        return None
    ext = extensions[0]
    try:
        regs = await sipv_client.tenant_registrations(str(ext["tenant_id"]))
        reg = next((r for r in regs if r["username"] == ext["username"]), None)
    except httpx.HTTPError:
        reg = None
    ext["registered"] = reg["registered"] if reg else False
    ext["public_ip"] = reg["public_ip"] if reg else None
    ext["private_ip"] = reg["private_ip"] if reg else None
    ext["call_state"] = reg["call_state"] if reg else "idle"
    # Fait GLOBAL au serveur (connexion SIPV<->FreeSWITCH), pas specifique a ce poste
    # (TASK-023.32) -- demande explicite : distinct du statut d'enregistrement du
    # poste, deja couvert par "registered" ci-dessus.
    esl = await sipv_client.get_esl_status()
    ext["freeswitch_esl_connected"] = esl.get("connected", False)
    return ext


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
    forward_immediate_destination_type: str | None = None
    forward_busy_enabled: bool | None = None
    forward_busy_destination: str | None = None
    forward_busy_destination_type: str | None = None
    forward_no_answer_enabled: bool | None = None
    forward_no_answer_destination: str | None = None
    forward_no_answer_destination_type: str | None = None
    forward_no_answer_delay_seconds: int | None = None
    forward_offline_enabled: bool | None = None
    forward_offline_destination: str | None = None
    forward_offline_destination_type: str | None = None
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
    voicemail_enabled: bool | None = None


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


# ── Appareil physique + boutons programmables (TASK-023.19) ────────────────────
# Section a cote de "Synchroniser avec SIPV / SIP actif" sur la fiche contact,
# demande explicite de l'utilisateur (2026-07-24).

async def _get_own_extension(contact_id: uuid.UUID, db: AsyncSession) -> dict:
    contact = await db.get(Contact, contact_id)
    if not contact or not contact.sipv_sync:
        raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
    extensions = await sipv_client.get_extensions_by_contact(str(contact_id))
    if not extensions:
        raise HTTPException(status_code=404, detail="Ce contact n'a pas de poste SIP lie")
    return extensions[0]


@router.get("/{contact_id}/sip-extension/phone")
async def get_contact_phone(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        ext = await _get_own_extension(contact_id, db)
        return await sipv_client.get_phone_by_extension(ext["id"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/{contact_id}/sip-extension/phone/tenant-model-templates")
async def list_contact_phone_tenant_model_templates(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Templates par modele disponibles pour l'appareil de ce poste (TASK-S044.1,
    crees dans Compagnie/Téléphonie -- ici juste filtres au modele de CE poste)."""
    try:
        ext = await _get_own_extension(contact_id, db)
        phone = await sipv_client.get_phone_by_extension(ext["id"])
        if not phone or not phone.get("phone_model_id"):
            return []
        templates = await sipv_client.list_tenant_model_templates(str(ext["tenant_id"]))
        return [t for t in templates if t.get("phone_model_id") == phone["phone_model_id"]]
    except httpx.HTTPError:
        return []


# ── 911 -- localisation d'urgence du poste (TASK-S010.2, S010.4) ────────────────
# Les succursales (company_sites) sont maitres cote ERPCRM depuis TASK-S010.4 --
# le picker et les payloads utilisent l'id ERPCRM (site_id, expose sous le nom
# de champ historique e911_address_id pour ne pas casser le frontend), traduit
# vers CompanySite.sipv_e911_address_id juste avant chaque appel SIPV.
async def _contact_company_id(contact_id: uuid.UUID, db: AsyncSession) -> uuid.UUID | None:
    result = await db.execute(
        select(ContactCompany).where(ContactCompany.contact_id == contact_id).order_by(ContactCompany.is_primary.desc())
    )
    cc = result.scalars().first()
    return cc.company_id if cc else None


def _site_dict(s: CompanySite) -> dict:
    return {
        "id": str(s.id), "label": s.label, "civic_number": s.civic_number, "street_name": s.street_name,
        "unit": s.unit, "city": s.city, "province": s.province, "postal_code": s.postal_code,
        "country": s.country, "is_active": s.is_active, "is_primary": s.is_primary,
    }


@router.get("/{contact_id}/sip-extension/911/addresses")
async def list_contact_911_addresses(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Succursales (company_sites, ERPCRM) de la compagnie de ce contact --
    remplit le picker cote Contact."""
    company_id = await _contact_company_id(contact_id, db)
    if not company_id:
        return []
    await ensure_primary_site(company_id, db)
    result = await db.execute(
        select(CompanySite).where(CompanySite.company_id == company_id, CompanySite.is_active == True).order_by(CompanySite.label)
    )
    return [_site_dict(s) for s in result.scalars().all()]


@router.get("/{contact_id}/sip-extension/911")
async def get_contact_911_assignment(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        ext = await _get_own_extension(contact_id, db)
        assignment = await sipv_client.get_extension_e911_assignment(ext["id"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    if not assignment:
        return None
    result = await db.execute(select(CompanySite).where(CompanySite.sipv_e911_address_id == uuid.UUID(assignment["e911_address_id"])))
    site = result.scalar_one_or_none()
    assignment["e911_address_id"] = str(site.id) if site else None
    return assignment


class E911AssignmentPayload(BaseModel):
    e911_address_id: uuid.UUID  # id de CompanySite (ERPCRM), pas de E911Address (SIPV)
    emergency_location: str | None = None
    floor: str | None = None
    office: str | None = None
    alert_email: str | None = None


@router.put("/{contact_id}/sip-extension/911")
async def upsert_contact_911_assignment(contact_id: uuid.UUID, payload: E911AssignmentPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Cree ou met a jour l'assignation 911 de CE poste (une seule active par
    poste, contrainte cote SIPV) -- le frontend n'a pas a savoir si ca existe deja."""
    site = await db.get(CompanySite, payload.e911_address_id)
    if not site or not site.sipv_e911_address_id:
        raise HTTPException(status_code=400, detail="Succursale invalide ou pas encore synchronisee avec SIPV")
    try:
        ext = await _get_own_extension(contact_id, db)
        existing = await sipv_client.get_extension_e911_assignment(ext["id"])
        data = payload.model_dump()
        data["e911_address_id"] = str(site.sipv_e911_address_id)
        if existing:
            result = await sipv_client.update_extension_e911_assignment(existing["id"], extension_id=ext["id"], **data)
        else:
            result = await sipv_client.create_extension_e911_assignment(ext["tenant_id"], extension_id=ext["id"], **data)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    result["e911_address_id"] = str(site.id)
    return result


@router.delete("/{contact_id}/sip-extension/911", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_911_assignment(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        ext = await _get_own_extension(contact_id, db)
        existing = await sipv_client.get_extension_e911_assignment(ext["id"])
        if existing:
            await sipv_client.delete_extension_e911_assignment(existing["id"])
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")




# ── Boîte vocale (VoicemailBox) -- checkbox "activée" + options si activée ─────
@router.get("/{contact_id}/sip-extension/voicemail")
async def get_contact_voicemail(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        ext = await _get_own_extension(contact_id, db)
        boxes = await sipv_client.list_voicemails(ext["tenant_id"])
        return next((b for b in boxes if b.get("extension_id") == ext["id"]), None)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class VoicemailPayload(BaseModel):
    email: str | None = None
    email_on_new: bool = True
    attach_message: bool = True
    skip_instructions: bool = False
    password: str | None = None


@router.put("/{contact_id}/sip-extension/voicemail")
async def upsert_contact_voicemail(contact_id: uuid.UUID, payload: VoicemailPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Cree ou met a jour la boite vocale de CE poste -- le frontend n'a pas a
    savoir si elle existe deja. `password` seulement envoye a SIPV si fourni
    (jamais ecrase par du vide -- write-only, jamais relu)."""
    try:
        ext = await _get_own_extension(contact_id, db)
        contact = await db.get(Contact, contact_id)
        boxes = await sipv_client.list_voicemails(ext["tenant_id"])
        existing = next((b for b in boxes if b.get("extension_id") == ext["id"]), None)
        data = payload.model_dump()
        if not data.get("password"):
            data.pop("password", None)
        if existing:
            return await sipv_client.update_voicemail(existing["id"], **data)
        return await sipv_client.create_voicemail(
            ext["tenant_id"], extension_id=ext["id"], mailbox=ext["extension"],
            fullname=f"{contact.first_name} {contact.last_name}", **data,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.delete("/{contact_id}/sip-extension/voicemail", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_voicemail(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Desactive (is_active=false) plutot que supprimer -- reversible."""
    try:
        ext = await _get_own_extension(contact_id, db)
        boxes = await sipv_client.list_voicemails(ext["tenant_id"])
        existing = next((b for b in boxes if b.get("extension_id") == ext["id"]), None)
        if existing:
            await sipv_client.update_voicemail(existing["id"], is_active=False)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Accueil (greeting) de la boite vocale -- demande de Philippe (2026-08-04) :
# pouvoir telecharger/uploader le message joue quand la BV repond (defaut :
# "unavailable", joue quand personne ne repond -- le cas exact qu'il testait).
async def _get_own_voicemail_box(contact_id: uuid.UUID, db: AsyncSession) -> dict:
    ext = await _get_own_extension(contact_id, db)
    boxes = await sipv_client.list_voicemails(ext["tenant_id"])
    box = next((b for b in boxes if b.get("extension_id") == ext["id"]), None)
    if not box:
        raise HTTPException(status_code=404, detail="Aucune boîte vocale pour ce poste -- activer la boîte vocale d'abord")
    return box


@router.post("/{contact_id}/sip-extension/voicemail/greeting")
async def upload_contact_voicemail_greeting(contact_id: uuid.UUID, file: UploadFile = File(...), greeting_type: str = "unavailable", db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        box = await _get_own_voicemail_box(contact_id, db)
        content = await file.read()
        return await sipv_client.upload_voicemail_greeting(box["id"], greeting_type, file.filename or "greeting", content, file.content_type)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/{contact_id}/sip-extension/voicemail/greeting")
async def download_contact_voicemail_greeting(contact_id: uuid.UUID, greeting_type: str = "unavailable", db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        box = await _get_own_voicemail_box(contact_id, db)
        content, filename = await sipv_client.download_voicemail_greeting(box["id"], greeting_type)
        return Response(content=content, media_type="audio/wav", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Aucun accueil uploadé")
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{contact_id}/sip-extension/voicemail/greeting")
async def delete_contact_voicemail_greeting(contact_id: uuid.UUID, greeting_type: str = "unavailable", db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        box = await _get_own_voicemail_box(contact_id, db)
        return await sipv_client.delete_voicemail_greeting(box["id"], greeting_type)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class PhoneAttribute(BaseModel):
    phone_model_id: uuid.UUID
    mac_address: str
    serial_number: str | None = None
    display_name: str | None = None
    location: str | None = None


@router.post("/{contact_id}/sip-extension/phone")
async def create_contact_phone(contact_id: uuid.UUID, payload: PhoneAttribute, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    try:
        ext = await _get_own_extension(contact_id, db)
        return await sipv_client.create_provisioned_phone(
            ext["tenant_id"], extension_id=ext["id"], **payload.model_dump(exclude_none=True, exclude={"phone_model_id"}),
            phone_model_id=str(payload.phone_model_id),
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class PhoneUpdatePayload(BaseModel):
    phone_model_id: uuid.UUID | None = None
    mac_address: str | None = None
    serial_number: str | None = None
    display_name: str | None = None
    location: str | None = None
    is_active: bool | None = None
    provisioning_protocol: str | None = None
    extra_config: dict | None = None  # TASK-S011.5 -- options personnalisees du poste
    selected_tenant_model_template_ids: list[uuid.UUID] | None = None  # TASK-S044.2


@router.put("/{contact_id}/sip-extension/phone/{phone_id}")
async def update_contact_phone(contact_id: uuid.UUID, phone_id: uuid.UUID, payload: PhoneUpdatePayload, _: User = Depends(get_current_user)):
    try:
        data = payload.model_dump(exclude_unset=True)
        if "phone_model_id" in data and data["phone_model_id"]:
            data["phone_model_id"] = str(data["phone_model_id"])
        if "selected_tenant_model_template_ids" in data and data["selected_tenant_model_template_ids"] is not None:
            data["selected_tenant_model_template_ids"] = [str(x) for x in data["selected_tenant_model_template_ids"]]
        return await sipv_client.update_provisioned_phone(str(phone_id), **data)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class PhoneButtonPayload(BaseModel):
    position: int
    page: int = 0
    button_type: str
    label: str | None = None
    value: str | None = None
    destination: str | None = None
    sip_account_index: int = 1
    client_editable: bool = False
    locked_by_simpleip: bool = True


class PhoneButtonPayloadUpdate(BaseModel):
    position: int | None = None
    page: int | None = None
    button_type: str | None = None
    label: str | None = None
    value: str | None = None
    destination: str | None = None
    sip_account_index: int | None = None
    client_editable: bool | None = None
    locked_by_simpleip: bool | None = None


@router.get("/{contact_id}/sip-extension/phone/{phone_id}/buttons")
async def list_contact_phone_buttons(contact_id: uuid.UUID, phone_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_phone_buttons(str(phone_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/{contact_id}/sip-extension/phone/{phone_id}/buttons")
async def create_contact_phone_button(contact_id: uuid.UUID, phone_id: uuid.UUID, payload: PhoneButtonPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.create_phone_button(str(phone_id), **payload.model_dump())
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/{contact_id}/sip-extension/phone/buttons/{button_id}")
async def update_contact_phone_button(contact_id: uuid.UUID, button_id: uuid.UUID, payload: PhoneButtonPayloadUpdate, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_phone_button(str(button_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/{contact_id}/sip-extension/phone/buttons/{button_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact_phone_button(contact_id: uuid.UUID, button_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_phone_button(str(button_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class SaveAsTemplatePayload(BaseModel):
    name: str


@router.post("/{contact_id}/sip-extension/phone/{phone_id}/save-as-template")
async def save_contact_phone_as_template(contact_id: uuid.UUID, phone_id: uuid.UUID, payload: SaveAsTemplatePayload, _: User = Depends(get_current_user)):
    """Sauvegarde la config de boutons actuelle de ce poste comme template
    reutilisable (TASK-023.26) -- geree/listee ensuite dans compagnie/telephonie."""
    try:
        return await sipv_client.save_phone_as_template(str(phone_id), payload.name)
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
