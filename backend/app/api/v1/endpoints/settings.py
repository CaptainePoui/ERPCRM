import math
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
}


async def get_setting(db: AsyncSession, key: str) -> str:
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    return s.value if s else DEFAULTS.get(key, "")


async def set_setting(db: AsyncSession, key: str, value: str):
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    if s:
        s.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()


def _round_psychological(price: float) -> float:
    """Round UP to nearest price ending in X4.95 or X9.95 (i.e. n*5 - 0.05)."""
    n = math.ceil((price + 0.05) / 5)
    if n < 1:
        n = 1
    return round(n * 5 - 0.05, 2)


class SettingsOut(BaseModel):
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


class SettingsIn(BaseModel):
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


class InflationPayload(BaseModel):
    percent: float  # e.g. 3.5 for 3.5%


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return SettingsOut(
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
    if payload.tax_filing_frequency is not None or payload.tax_reminder_user_id is not None:
        from app.core.tax_reminders import ensure_tax_filing_tasks
        await ensure_tax_filing_tasks(db)
    return await get_settings(db)


class InflationResult(BaseModel):
    updated: int
    preview: list[dict]


@router.post("/apply-inflation", response_model=InflationResult)
async def apply_inflation(payload: InflationPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Apply inflation % to all catalogue items NOT in the "connaissance" family (exclues -- leur prix suit le taux horaire, pas l'inflation)."""
    r = await db.execute(
        select(CatalogueItem).where(
            CatalogueItem.type != "connaissance",
            CatalogueItem.is_active == True,
            CatalogueItem.price > 0,
        )
    )
    items = r.scalars().all()
    preview = []
    for item in items:
        old_price = item.price
        new_price = _round_psychological(old_price * (1 + payload.percent / 100))
        preview.append({"id": str(item.id), "name": item.name, "old_price": old_price, "new_price": new_price})
        item.price = new_price
    await db.commit()
    return InflationResult(updated=len(items), preview=preview)


# ── Numerotation des documents (2026-10-04) ──────────────────────────────────

NUMBERING_LABELS = {"invoice": "Factures", "credit": "Avoirs (notes de crédit)", "devis": "Devis", "payment": "Références de paiement",
                    "purchase_order": "Bons de commande", "ecom_order": "Commandes web"}


class NumberingIn(BaseModel):
    prefix: str
    next_value: int
    padding: int = 4


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


# ── Courriels Interac (TASK-042.5) ───────────────────────────────────────────

class InteracMailIn(BaseModel):
    host: str
    port: int = 993
    user: str
    password: str | None = None     # vide = garder celui deja enregistre
    folder: str = "INBOX"
    enabled: bool = True
    since: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")


async def _interac_out(db) -> dict:
    from sqlalchemy import func as _f
    from app.models.bank_account import InteracNotice
    out = {k.replace("interac_mail_", ""): await get_setting(db, k) for k in
           ("interac_mail_host", "interac_mail_port", "interac_mail_user", "interac_mail_folder", "interac_mail_enabled", "interac_mail_since")}
    out["enabled"] = out["enabled"] == "true"
    out["has_password"] = bool(await get_setting(db, "interac_mail_password"))   # jamais renvoye
    out["stats"] = dict((await db.execute(select(InteracNotice.status, _f.count()).group_by(InteracNotice.status))).all())
    return out


@router.get("/interac-mail")
async def get_interac_mail(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _interac_out(db)


@router.put("/interac-mail")
async def save_interac_mail(p: InteracMailIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Le mot de passe est chiffre (Fernet) avant d'etre enregistre ; il n'est jamais renvoye."""
    from app.core.crypto import encrypt
    if not p.host.strip() or not p.user.strip():
        raise HTTPException(status_code=400, detail="Serveur et utilisateur requis")
    for k, v in (("interac_mail_host", p.host.strip()), ("interac_mail_port", str(p.port)), ("interac_mail_user", p.user.strip()),
                 ("interac_mail_folder", p.folder.strip() or "INBOX"), ("interac_mail_enabled", "true" if p.enabled else "false"),
                 ("interac_mail_since", p.since or "")):
        await set_setting(db, k, v)
    if p.password:
        await set_setting(db, "interac_mail_password", encrypt(p.password))
    return await _interac_out(db)


@router.post("/interac-mail/test")
async def test_interac_mail(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Connexion en lecture seule : nombre de courriels Interac et sujets des 3 derniers."""
    import asyncio as _a
    from app.core import interac_mail as im
    cfg = await im.load_config(db)
    if not (cfg["host"] and cfg["user"] and cfg["password"]):
        raise HTTPException(status_code=400, detail="Enregistrez d'abord le serveur, l'utilisateur et le mot de passe")
    try:
        return await _a.to_thread(im.test_sync, cfg)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connexion impossible : {e}")


@router.post("/interac-mail/run")
async def run_interac_mail(_: User = Depends(get_current_user)):
    """Lit les nouveaux avis maintenant (au lieu d'attendre le passage aux 15 minutes)."""
    # En arriere-plan : l'IA lit ~30 s par avis ; la page affiche l'avancement (stats)
    import asyncio as _a
    from app.services.interac_poller import run_interac_once
    _a.create_task(run_interac_once())
    return {"started": True}
