from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.app_settings import AppSetting
from app.models.catalogue import CatalogueItem
from app.models.user import User

router = APIRouter()

DEFAULTS = {
    "hourly_rate": "145.00",
    "labour_round_minutes": "15",
    "commission_rate": "10.0",
    "default_vendor_contact_id": "",
    # TASK-015.12 : seuil (minutes) au-dela duquel TicketDetail demande une
    # confirmation/correction du temps avant d'enregistrer une note (protege
    # contre le chrono client-side laisse tourner par erreur, ex. onglet
    # oublie ouvert toute la nuit).
    "ticket_time_confirm_threshold_minutes": "30",
    # Conditions de paiement des factures (jours apres la date de facture), Administration -> Configuration generale
    # (Philippe, 2026-10-16 : « pour tout le monde c'est 30 jours net »)
    "payment_terms_days": "30",
    # TASK-042 : mois de debut de l'exercice financier (1 = janvier ; Simple IP inc. = 7, 1er juillet au 30 juin)
    "fiscal_year_start_month": "1",
    # TASK-005.8 : fin de la derniere periode de taxes declaree (AAAA-MM-JJ, vide = aucune) --
    # une facture datee avant ne peut plus etre supprimee ni remise en brouillon (seulement creditee)
    "tax_lock_date": "",
    # Rappels de declaration TPS/TVQ (core/tax_reminders.py) : vide = desactive
    "tax_filing_frequency": "trimestrielle",  # mensuelle | trimestrielle | annuelle (vide = pas de rappel)
    "tax_reminder_user_id": "",      # utilisateur qui recoit la tache et les rappels
    # Creation automatique des periodiques (services/recurring_poller.py, 2026-10-04)
    "recurring_auto_sales": "false",      # factures clients : emises « non transmises », jamais envoyees seules
    "recurring_auto_purchases": "true",   # factures fournisseurs et depenses periodiques
    "business_timezone": "America/Toronto",
    # Factures de frais de retard (TASK-005.14, core/late_fees.py) -- eteintes au depart
    "late_fees_enabled": "false",
    "late_fee_monthly_rate": "2",
    "late_fee_admin": "9.95",
    "late_fee_grace_days": "15",
    "late_fee_interval_days": "30",   # fuseau de l'entreprise (Montreal) : quel jour on est (core/clock.py)
    # Option Echanges (troc), Administration -> Integrations (2026-10-08) : decochee par defaut pour un acheteur du
    # logiciel ; decochee, toutes les options d'echange disparaissent de l'ecran (les echanges deja faits s'appliquent)
    "barter_enabled": "false",
    # Avis Interac lus dans toutes les boites de courriel (TASK-047.1, Administration -> Integrations)
    "interac_mail_enabled": "true",
    "interac_mail_since": "",
    # Journal des actions (TASK-049) : noter aussi qui a ouvert telle fiche -- eteint au depart
    "audit_views_enabled": "false",
    # Apparence de l'ecran pour tout le monde (TASK-050) : jour (par defaut) | nuit
    "ui_theme": "jour",
}


async def get_setting(db: AsyncSession, key: str) -> str:
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    return s.value if s else DEFAULTS.get(key, "")


async def payment_terms_days(db: AsyncSession) -> int:
    """Conditions de paiement generales : la facture est due N jours apres sa date (30 net par defaut)."""
    try:
        return int(await get_setting(db, "payment_terms_days"))
    except ValueError:
        return 30


async def set_setting(db: AsyncSession, key: str, value: str):
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    if s:
        s.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()


async def barter_enabled(db: AsyncSession) -> bool:
    return (await get_setting(db, "barter_enabled")) == "true"


async def require_barter(db: AsyncSession) -> None:
    if not await barter_enabled(db):
        raise HTTPException(status_code=400, detail="Les échanges (troc) ne sont pas activés (Administration → Intégrations)")


class SettingsOut(BaseModel):
    payment_terms_days: int = 30
    hourly_rate: float
    labour_round_minutes: int
    commission_rate: float
    default_vendor_contact_id: str
    ticket_time_confirm_threshold_minutes: int
    fiscal_year_start_month: int
    tax_lock_date: str
    tax_filing_frequency: str
    tax_reminder_user_id: str
    recurring_auto_sales: bool
    recurring_auto_purchases: bool
    business_timezone: str
    late_fees_enabled: bool
    late_fee_monthly_rate: float
    late_fee_admin: float
    late_fee_grace_days: int
    late_fee_interval_days: int
    barter_enabled: bool
    ui_theme: str


class SettingsIn(BaseModel):
    payment_terms_days: int | None = Field(default=None, ge=0, le=365)
    hourly_rate: float | None = None
    labour_round_minutes: int | None = None
    commission_rate: float | None = None
    default_vendor_contact_id: str | None = None
    ticket_time_confirm_threshold_minutes: int | None = None
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    tax_lock_date: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    tax_filing_frequency: str | None = Field(default=None, pattern=r"^(|mensuelle|trimestrielle|annuelle)$")
    tax_reminder_user_id: str | None = None
    recurring_auto_sales: bool | None = None
    recurring_auto_purchases: bool | None = None
    business_timezone: str | None = None
    late_fees_enabled: bool | None = None
    late_fee_monthly_rate: float | None = Field(default=None, ge=0, le=10)
    late_fee_admin: float | None = Field(default=None, ge=0, le=1000)
    late_fee_grace_days: int | None = Field(default=None, ge=0, le=365)
    late_fee_interval_days: int | None = Field(default=None, ge=7, le=365)
    barter_enabled: bool | None = None
    ui_theme: str | None = Field(default=None, pattern=r"^(jour|nuit)$")


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return SettingsOut(
        payment_terms_days=await payment_terms_days(db),
        hourly_rate=float(await get_setting(db, "hourly_rate")),
        labour_round_minutes=int(await get_setting(db, "labour_round_minutes")),
        commission_rate=float(await get_setting(db, "commission_rate")),
        default_vendor_contact_id=await get_setting(db, "default_vendor_contact_id"),
        ticket_time_confirm_threshold_minutes=int(await get_setting(db, "ticket_time_confirm_threshold_minutes")),
        fiscal_year_start_month=int(await get_setting(db, "fiscal_year_start_month")),
        tax_lock_date=await get_setting(db, "tax_lock_date"),
        tax_filing_frequency=await get_setting(db, "tax_filing_frequency"),
        tax_reminder_user_id=await get_setting(db, "tax_reminder_user_id"),
        recurring_auto_sales=(await get_setting(db, "recurring_auto_sales")) == "true",
        recurring_auto_purchases=(await get_setting(db, "recurring_auto_purchases")) == "true",
        business_timezone=await get_setting(db, "business_timezone"),
        late_fees_enabled=(await get_setting(db, "late_fees_enabled")) == "true",
        late_fee_monthly_rate=float(await get_setting(db, "late_fee_monthly_rate")),
        late_fee_admin=float(await get_setting(db, "late_fee_admin")),
        late_fee_grace_days=int(await get_setting(db, "late_fee_grace_days")),
        late_fee_interval_days=int(await get_setting(db, "late_fee_interval_days")),
        barter_enabled=await barter_enabled(db),
        ui_theme=await get_setting(db, "ui_theme"),
    )


@router.put("", response_model=SettingsOut)
async def update_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.hourly_rate is not None:
        await set_setting(db, "hourly_rate", str(payload.hourly_rate))
        # Sync all catalogue items of the "connaissance" family (prix = taux horaire)
        r = await db.execute(select(CatalogueItem).where(CatalogueItem.type == "connaissance", CatalogueItem.is_active == True))
        for item in r.scalars().all():
            item.price = payload.hourly_rate * (item.rate_multiplier or 1)
        await db.commit()
    if payload.payment_terms_days is not None:
        await set_setting(db, "payment_terms_days", str(payload.payment_terms_days))
    if payload.labour_round_minutes is not None:
        await set_setting(db, "labour_round_minutes", str(payload.labour_round_minutes))
    if payload.commission_rate is not None:
        await set_setting(db, "commission_rate", str(payload.commission_rate))
    if payload.default_vendor_contact_id is not None:
        await set_setting(db, "default_vendor_contact_id", payload.default_vendor_contact_id)
    if payload.ticket_time_confirm_threshold_minutes is not None:
        await set_setting(db, "ticket_time_confirm_threshold_minutes", str(payload.ticket_time_confirm_threshold_minutes))
    if payload.fiscal_year_start_month is not None:
        await set_setting(db, "fiscal_year_start_month", str(payload.fiscal_year_start_month))
    if payload.tax_lock_date is not None:
        await set_setting(db, "tax_lock_date", payload.tax_lock_date)
        if payload.tax_lock_date:
            from datetime import date as _date
            from app.core.tax_reminders import complete_declared_tasks
            if await complete_declared_tasks(db, _date.fromisoformat(payload.tax_lock_date)):
                await db.commit()
    if payload.tax_filing_frequency is not None:
        await set_setting(db, "tax_filing_frequency", payload.tax_filing_frequency)
    if payload.tax_reminder_user_id is not None:
        if payload.tax_reminder_user_id:
            import uuid as _uuid
            if not await db.get(User, _uuid.UUID(payload.tax_reminder_user_id)):
                raise HTTPException(status_code=400, detail="Utilisateur introuvable")
        await set_setting(db, "tax_reminder_user_id", payload.tax_reminder_user_id)
    if payload.recurring_auto_sales is not None:
        await set_setting(db, "recurring_auto_sales", "true" if payload.recurring_auto_sales else "false")
    if payload.recurring_auto_purchases is not None:
        await set_setting(db, "recurring_auto_purchases", "true" if payload.recurring_auto_purchases else "false")
    if payload.barter_enabled is not None:
        await set_setting(db, "barter_enabled", "true" if payload.barter_enabled else "false")
    if payload.ui_theme is not None:
        await set_setting(db, "ui_theme", payload.ui_theme)
    if payload.late_fees_enabled is not None:
        await set_setting(db, "late_fees_enabled", "true" if payload.late_fees_enabled else "false")
    for key in ("late_fee_monthly_rate", "late_fee_admin", "late_fee_grace_days", "late_fee_interval_days"):
        if getattr(payload, key) is not None:
            await set_setting(db, key, str(getattr(payload, key)))
    if payload.business_timezone is not None:
        from app.core import clock
        try:
            name = clock.validate(payload.business_timezone)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        await set_setting(db, "business_timezone", name)
        clock.set_business_tz(name)          # tout de suite dans ce processus ; l'autre le relit dans la minute
    if payload.tax_filing_frequency is not None or payload.tax_reminder_user_id is not None:
        from app.core.tax_reminders import ensure_tax_filing_tasks
        await ensure_tax_filing_tasks(db)
    return await get_settings(db)


# ── Numerotation des documents (2026-10-04) ──────────────────────────────────

NUMBERING_LABELS = {"invoice": "Factures", "credit": "Avoirs (notes de crédit)", "devis": "Devis", "payment": "Références de paiement",
                    "purchase_order": "Bons de commande", "ecom_order": "Commandes web"}


class NumberingIn(BaseModel):
    prefix: str
    next_value: int
    padding: int = 4


# Coordonnees de l'entreprise imprimees sur tous les PDF (facture, avoir, devis, echange) -- TASK-005.18, 2026-10-08.
# Depuis TASK-002.5 (2026-10-10) : lues et modifiees dans la fiche de la compagnie du proprietaire (core/owner.py),
# plus de copie dans app_settings.

class BusinessInfo(BaseModel):
    company_id: str | None = None
    name: str = Field(default="", max_length=200)
    street: str = Field(default="", max_length=255)
    unit: str = Field(default="", max_length=255)
    city: str = Field(default="", max_length=100)
    province: str = Field(default="QC", max_length=50)
    postal_code: str = Field(default="", max_length=10)
    tps: str = Field(default="", max_length=40)
    tvq: str = Field(default="", max_length=40)
    phone: str = Field(default="", max_length=40)
    email: str = Field(default="", max_length=200)


async def _business(db: AsyncSession) -> BusinessInfo:
    from app.core import owner as ow
    co = await ow.get_owner(db)
    if not co:
        return BusinessInfo()
    a = await ow.billing_address(db, co.id)
    em = await ow.primary_email(db, co.id)
    return BusinessInfo(company_id=str(co.id), name=co.name, street=a.street_1 if a else "", unit=(a.street_2 or "") if a else "",
                        city=a.city if a else "", province=a.province if a else "QC", postal_code=a.postal_code if a else "",
                        tps=co.tps_number or "", tvq=co.tvq_number or "", phone=co.office_phone or "", email=em.value if em else "")


@router.get("/business", response_model=BusinessInfo)
async def get_business(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _business(db)


@router.put("/business", response_model=BusinessInfo)
async def update_business(payload: BusinessInfo, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.core import owner as ow
    from app.models.address import Address, AddressType
    from app.models.communication import CommunicationChannel, ChannelType
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Le nom de l'entreprise est obligatoire")
    co = await ow.get_owner(db)
    if not co:
        raise HTTPException(status_code=404, detail="Aucune compagnie du propriétaire")
    co.name = payload.name.strip()
    co.tps_number, co.tvq_number = payload.tps.strip() or None, payload.tvq.strip() or None
    co.office_phone = payload.phone.strip() or None
    if payload.street.strip():
        a = await ow.billing_address(db, co.id)
        if not a or a.address_type != AddressType.billing:
            a = Address(entity_id=co.id, address_type=AddressType.billing, is_primary=True, is_active=True, country="CA")
            db.add(a)
        a.street_1, a.street_2 = payload.street.strip(), payload.unit.strip() or None
        a.city, a.province, a.postal_code = payload.city.strip(), (payload.province.strip() or "QC"), payload.postal_code.strip().upper()
    if payload.email.strip():
        em = await ow.primary_email(db, co.id)
        if em:
            em.value = payload.email.strip()
        else:
            db.add(CommunicationChannel(entity_id=co.id, channel_type=ChannelType.email, value=payload.email.strip(),
                                        label="Facturation", is_primary=True, is_active=True))
    await db.commit()
    return await _business(db)


@router.get("/timezones")
async def list_timezones(_: User = Depends(get_current_user)):
    """Fuseaux horaires proposes pour l'entreprise + l'heure qu'il est selon le fuseau actuel."""
    from app.core import clock
    return {"current": str(clock.business_tz()), "now": clock.now().strftime("%Y-%m-%d %H:%M"), "zones": clock.zones()}


@router.get("/numbering")
async def get_numbering(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.core.numbering import preview_next
    out = []
    for key, label in NUMBERING_LABELS.items():
        out.append({**await preview_next(db, key), "label": label})
    await db.commit()
    return out


@router.put("/numbering/{key}")
async def update_numbering(key: str, p: NumberingIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Change le prefixe ou le prochain numero -- jamais vers le bas (voir core/numbering.py)."""
    from app.core.numbering import set_next_number, preview_next
    if key not in NUMBERING_LABELS:
        raise HTTPException(status_code=404, detail="Type de document inconnu")
    await set_next_number(db, key, p.prefix.strip(), p.next_value, p.padding)
    out = {**await preview_next(db, key), "label": NUMBERING_LABELS[key]}
    await db.commit()
    return out


# Courriels Interac (TASK-042.5) : reglages et lecture deplaces dans endpoints/mailboxes.py (TASK-047.1) --
# les avis sont lus dans toutes les boites de courriel (Administration -> Integrations).
