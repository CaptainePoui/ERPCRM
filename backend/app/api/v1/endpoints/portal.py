import uuid
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Form, File, UploadFile, Response
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import verify_password, hash_password, create_access_token, decode_token
from app.core import sipv_client, voicebox_client
from app.core.telephony_lock import acquire_telephony_lock
from app.models.portal import PortalUser
from app.models.invoice import Invoice
from app.models.ticket import Ticket
from app.models.equipment import Equipment
from app.models.contact import Contact
from app.models.company import Company
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User

router = APIRouter()
portal_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/login")
portal_oauth2_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/login", auto_error=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class PortalLoginRequest(BaseModel):
    email: str
    password: str

class PortalTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    portal_user_id: str
    company_id: str
    full_name: str
    permissions: dict

TELEPHONY_PERM_FIELDS = [
    "can_view_own_extension", "can_edit_extension_name", "can_edit_call_forward",
    "can_edit_dnd", "can_edit_voicemail", "can_edit_call_plan", "can_view_own_cdr", "can_view_voicemail_messages",
    "can_receive_alerts", "can_manage_telephony", "can_manage_ivr", "can_manage_groups",
    "can_manage_audio_prompts", "can_listen_audio_prompts", "can_generate_voice_prompts", "can_view_company_cdr",
]


class PortalUserOut(BaseModel):
    id: uuid.UUID
    contact_id: uuid.UUID | None
    company_id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    can_view_invoices: bool
    can_view_tickets: bool
    can_create_tickets: bool
    can_view_equipment: bool
    can_view_own_extension: bool
    can_edit_extension_name: bool
    can_edit_call_forward: bool
    can_edit_dnd: bool
    can_edit_voicemail: bool
    can_edit_call_plan: bool
    can_view_own_cdr: bool
    can_view_voicemail_messages: bool
    can_receive_alerts: bool
    can_manage_telephony: bool
    can_manage_ivr: bool
    can_manage_groups: bool
    can_manage_audio_prompts: bool
    can_listen_audio_prompts: bool
    can_generate_voice_prompts: bool
    can_view_company_cdr: bool
    notes: str | None
    created_at: datetime
    last_login: datetime | None

class PortalUserCreate(BaseModel):
    contact_id: uuid.UUID | None = None
    company_id: uuid.UUID
    email: str
    password: str
    full_name: str
    can_view_invoices: bool = True
    can_view_tickets: bool = True
    can_create_tickets: bool = False
    can_view_equipment: bool = False
    can_view_own_extension: bool = False
    can_edit_extension_name: bool = False
    can_edit_call_forward: bool = False
    can_edit_dnd: bool = False
    can_edit_voicemail: bool = False
    can_edit_call_plan: bool = False
    can_view_own_cdr: bool = False
    can_view_voicemail_messages: bool = False
    can_receive_alerts: bool = False
    can_manage_telephony: bool = False
    can_manage_ivr: bool = False
    can_manage_groups: bool = False
    can_manage_audio_prompts: bool = False
    can_listen_audio_prompts: bool = False
    can_generate_voice_prompts: bool = False
    can_view_company_cdr: bool = False
    notes: str | None = None

class PortalUserUpdate(BaseModel):
    email: str | None = None
    full_name: str | None = None
    password: str | None = None
    is_active: bool | None = None
    can_view_invoices: bool | None = None
    can_view_tickets: bool | None = None
    can_create_tickets: bool | None = None
    can_view_equipment: bool | None = None
    can_view_own_extension: bool | None = None
    can_edit_extension_name: bool | None = None
    can_edit_call_forward: bool | None = None
    can_edit_dnd: bool | None = None
    can_edit_voicemail: bool | None = None
    can_edit_call_plan: bool | None = None
    can_view_own_cdr: bool | None = None
    can_view_voicemail_messages: bool | None = None
    can_receive_alerts: bool | None = None
    can_manage_telephony: bool | None = None
    can_manage_ivr: bool | None = None
    can_manage_groups: bool | None = None
    can_manage_audio_prompts: bool | None = None
    can_listen_audio_prompts: bool | None = None
    can_generate_voice_prompts: bool | None = None
    can_view_company_cdr: bool | None = None
    notes: str | None = None


def _perms(u: PortalUser) -> dict:
    return {
        "can_view_invoices": u.can_view_invoices,
        "can_view_tickets": u.can_view_tickets,
        "can_create_tickets": u.can_create_tickets,
        "can_view_equipment": u.can_view_equipment,
        **{f: getattr(u, f) for f in TELEPHONY_PERM_FIELDS},
    }

def _out(u: PortalUser) -> PortalUserOut:
    return PortalUserOut(
        id=u.id, contact_id=u.contact_id, company_id=u.company_id,
        email=u.email, full_name=u.full_name, is_active=u.is_active,
        can_view_invoices=u.can_view_invoices, can_view_tickets=u.can_view_tickets,
        can_create_tickets=u.can_create_tickets, can_view_equipment=u.can_view_equipment,
        notes=u.notes, created_at=u.created_at, last_login=u.last_login,
        **{f: getattr(u, f) for f in TELEPHONY_PERM_FIELDS},
    )


async def get_portal_user(token: str = Depends(portal_oauth2), db: AsyncSession = Depends(get_db)) -> PortalUser:
    try:
        payload = decode_token(token)
        if payload.get("type") != "portal":
            raise JWTError()
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token portail invalide")
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u or not u.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Accès portail refusé")
    return u


async def get_portal_user_media(
    token_header: str | None = Depends(portal_oauth2_optional), token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> PortalUser:
    """Comme get_portal_user, mais accepte aussi le token en query param
    (?token=...) -- necessaire pour les balises <audio src="..."> natives,
    qui ne peuvent pas envoyer d'en-tete Authorization. Utilise UNIQUEMENT
    pour servir/generer de l'audio en lecture (jamais pour muter des donnees
    -- meme convention que get_current_user_media, auth.py)."""
    real_token = token_header or token
    if not real_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    try:
        payload = decode_token(real_token)
        if payload.get("type") != "portal":
            raise JWTError()
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u or not u.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Accès portail refusé")
    return u


# ── Portal Auth ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=PortalTokenResponse)
async def portal_login(payload: PortalLoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PortalUser).where(PortalUser.email == payload.email))
    u = result.scalar_one_or_none()
    if not u or not verify_password(payload.password, u.hashed_password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    if not u.is_active:
        raise HTTPException(status_code=403, detail="Compte portail désactivé")
    u.last_login = datetime.now(timezone.utc)
    await db.commit()
    token = create_access_token({"sub": str(u.id), "type": "portal", "company_id": str(u.company_id)}, expires_minutes=60 * 24 * 7)
    return PortalTokenResponse(
        access_token=token, portal_user_id=str(u.id),
        company_id=str(u.company_id), full_name=u.full_name, permissions=_perms(u),
    )

@router.get("/me")
async def portal_me(u: PortalUser = Depends(get_portal_user)):
    return {"id": str(u.id), "company_id": str(u.company_id), "full_name": u.full_name,
            "email": u.email, "permissions": _perms(u)}


# ── Portal Data ───────────────────────────────────────────────────────────────

@router.get("/invoices")
async def portal_invoices(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_invoices:
        raise HTTPException(status_code=403, detail="Accès factures non autorisé")
    result = await db.execute(
        select(Invoice).where(Invoice.company_id == u.company_id).order_by(Invoice.created_at.desc())
    )
    invs = result.scalars().all()
    return [{"id": str(i.id), "invoice_number": i.invoice_number, "status": i.status,
             "total_ttc": float(i.total_ttc or 0), "due_date": i.due_date, "created_at": i.created_at}
            for i in invs]

@router.get("/tickets")
async def portal_tickets(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_tickets:
        raise HTTPException(status_code=403, detail="Accès tickets non autorisé")
    result = await db.execute(
        select(Ticket).where(Ticket.company_id == u.company_id).order_by(Ticket.created_at.desc())
    )
    tickets = result.scalars().all()
    return [{"id": str(t.id), "title": t.title, "status": t.status, "priority": t.priority, "created_at": t.created_at}
            for t in tickets]

@router.post("/tickets")
async def portal_create_ticket(body: dict, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_create_tickets:
        raise HTTPException(status_code=403, detail="Création ticket non autorisée")
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Titre requis")
    t = Ticket(company_id=u.company_id, title=title, description=body.get("description"), priority="normal")
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return {"id": str(t.id), "title": t.title, "status": t.status}

@router.get("/equipment")
async def portal_equipment(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_equipment:
        raise HTTPException(status_code=403, detail="Accès équipements non autorisé")
    result = await db.execute(
        select(Equipment).where(Equipment.company_id == u.company_id).order_by(Equipment.name)
    )
    eqs = result.scalars().all()
    return [{"id": str(e.id), "name": e.name, "category": e.category, "brand": e.brand,
             "model": e.model, "status": e.status, "ip_address": e.ip_address}
            for e in eqs]


# ── Portal "Mon poste" (TASK-019/S028) ──────────────────────────────────────
# Champs exposés en édition = uniquement ceux réellement câblés dans le dialplan
# SIPV (voir TASKSIPV.md TASK-S018.3/023.6/023.30/S023.31/S052) -- ne jamais
# exposer un champ décoratif comme éditable ici, ce serait la même "fausse
# sécurité"/faux fonctionnel que le projet évite explicitement partout ailleurs.

FORWARD_FIELDS = {
    "forward_immediate_enabled", "forward_immediate_destination_type", "forward_immediate_destination",
    "forward_busy_enabled", "forward_busy_destination_type", "forward_busy_destination",
    "forward_no_answer_enabled", "forward_no_answer_destination_type", "forward_no_answer_destination",
    "forward_no_answer_delay_seconds",
    "forward_offline_enabled", "forward_offline_destination_type", "forward_offline_destination",
}
NAME_FIELDS = {"name"}
DND_FIELDS = {"dnd_enabled"}
VOICEMAIL_FIELDS = {"voicemail_enabled", "voicemail_email"}
# TASK-S056 : plan d'appel -- tri-état (True/False/None=hérite du défaut compagnie),
# RÉELLEMENT appliqué via _call_permission_gate_entries() côté SIPV (contrairement
# au menu Local/National/International retiré ce matin même, TASK-S052). Ne pas
# réintroduire ce menu simple ici -- seuls ces 4 champs granulaires sont branchés.
CALL_PLAN_FIELDS = {"allow_canada", "allow_us", "allow_international", "allow_premium"}


class PortalExtensionUpdate(BaseModel):
    name: str | None = None
    forward_immediate_enabled: bool | None = None
    forward_immediate_destination_type: str | None = None
    forward_immediate_destination: str | None = None
    forward_busy_enabled: bool | None = None
    forward_busy_destination_type: str | None = None
    forward_busy_destination: str | None = None
    forward_no_answer_enabled: bool | None = None
    forward_no_answer_destination_type: str | None = None
    forward_no_answer_destination: str | None = None
    forward_no_answer_delay_seconds: int | None = None
    forward_offline_enabled: bool | None = None
    forward_offline_destination_type: str | None = None
    forward_offline_destination: str | None = None
    dnd_enabled: bool | None = None
    voicemail_enabled: bool | None = None
    voicemail_email: str | None = None
    allow_canada: bool | None = None
    allow_us: bool | None = None
    allow_international: bool | None = None
    allow_premium: bool | None = None


async def _portal_own_extension(u: PortalUser, db: AsyncSession) -> dict:
    if not u.can_view_own_extension:
        raise HTTPException(status_code=403, detail="Accès à votre poste non autorisé")
    if not u.contact_id:
        raise HTTPException(status_code=404, detail="Aucun contact lié à ce compte portail")
    try:
        exts = await sipv_client.get_extensions_by_contact(str(u.contact_id))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    if not exts:
        raise HTTPException(status_code=404, detail="Aucun poste SIP lié à votre compte")
    # TASK-S055 : courriel de messagerie vocale -- si le poste en a déjà un,
    # inchangé. Sinon, `contact_email` sert au frontend à pré-remplir le champ
    # avec le courriel du contact (lié) plutôt que de forcer une saisie
    # manuelle -- reste éditable si l'utilisateur veut un courriel différent.
    contact = await db.get(Contact, u.contact_id)
    exts[0]["contact_email"] = contact.email if contact else None
    return exts[0]


@router.get("/extension")
async def portal_extension(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    return await _portal_own_extension(u, db)


@router.patch("/extension")
async def update_portal_extension(payload: PortalExtensionUpdate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    ext = await _portal_own_extension(u, db)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        return ext

    allowed: set[str] = set()
    if u.can_edit_extension_name:
        allowed |= NAME_FIELDS
    if u.can_edit_call_forward:
        allowed |= FORWARD_FIELDS
    if u.can_edit_dnd:
        allowed |= DND_FIELDS
    if u.can_edit_voicemail:
        allowed |= VOICEMAIL_FIELDS
    if u.can_edit_call_plan:
        allowed |= CALL_PLAN_FIELDS

    forbidden = set(data.keys()) - allowed
    if forbidden:
        raise HTTPException(status_code=403, detail=f"Non autorisé à modifier : {', '.join(sorted(forbidden))}")

    try:
        return await sipv_client.update_extension(ext["id"], **data)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/cdr")
async def portal_cdr(page: int = 1, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_own_cdr:
        raise HTTPException(status_code=403, detail="Accès à votre historique d'appels non autorisé")
    ext = await _portal_own_extension(u, db)
    try:
        return await sipv_client.list_cdr_for_extension(ext["tenant_id"], ext["extension"], page=page)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class VoicemailGreetingGenerate(BaseModel):
    text: str
    voice_id: str
    language: str = "fr"
    greeting_type: str = "unavailable"  # unavailable | busy | name


@router.post("/extension/voicemail-greeting/generate")
async def generate_voicemail_greeting(payload: VoicemailGreetingGenerate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    """Message d'accueil de boite vocale par texte + IA (Voicebox) -- reutilise
    can_edit_voicemail (deja la permission Mon poste pour gerer sa messagerie),
    pas une nouvelle case separee : demande explicite de Philippe, actif de
    base des que la gestion de messagerie l'est. Distinct de can_generate_voice_prompts
    (bibliotheque de phrases partagee, cote Gestion telephonique)."""
    if not u.can_edit_voicemail:
        raise HTTPException(status_code=403, detail="Gestion de la messagerie vocale non autorisée")
    if payload.greeting_type not in {"unavailable", "busy", "name"}:
        raise HTTPException(status_code=400, detail="Type de message invalide")
    ext = await _portal_own_extension(u, db)
    try:
        voicemails = await sipv_client.list_voicemails(ext["tenant_id"])
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    vm = next((v for v in voicemails if str(v.get("extension_id")) == str(ext["id"])), None)
    if not vm:
        raise HTTPException(status_code=404, detail="Aucune boîte vocale associée à votre poste")
    try:
        content, filename = await voicebox_client.generate(payload.text, payload.voice_id, payload.language)
    except (TimeoutError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")
    try:
        return await sipv_client.upload_voicemail_greeting(vm["id"], payload.greeting_type, filename, content, "audio/wav")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# ── Portal "Gestion téléphonique" (TASK-020) ────────────────────────────────
# Gated par permission granulaire (can_manage_telephony/ivr/groups,
# can_view_company_cdr). JAMAIS exposé dans le portail : trunks, routes
# sortantes, E911, sécurité, config fournisseur. Verrou télephonie
# (core/telephony_lock.py) appliqué avant chaque écriture -- premier
# arrivé/premier servi entre pairs (client vs client), un tech préempte
# toujours un verrou détenu par un client (voir PLATFORM_TASKS.md TASK-020).

async def _company_tenant_id_portal(u: PortalUser, db: AsyncSession) -> str:
    company = await db.get(Company, u.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if not company.sipv_enabled or not company.sipv_tenant_id:
        raise HTTPException(status_code=400, detail="Aucun tenant SIPV actif pour cette compagnie")
    return str(company.sipv_tenant_id)


TELEPHONY_EXT_FIELDS = NAME_FIELDS | FORWARD_FIELDS | VOICEMAIL_FIELDS


class TelephonyExtensionUpdate(BaseModel):
    name: str | None = None
    forward_immediate_enabled: bool | None = None
    forward_immediate_destination_type: str | None = None
    forward_immediate_destination: str | None = None
    forward_busy_enabled: bool | None = None
    forward_busy_destination_type: str | None = None
    forward_busy_destination: str | None = None
    forward_no_answer_enabled: bool | None = None
    forward_no_answer_destination_type: str | None = None
    forward_no_answer_destination: str | None = None
    forward_no_answer_delay_seconds: int | None = None
    forward_offline_enabled: bool | None = None
    forward_offline_destination_type: str | None = None
    forward_offline_destination: str | None = None
    voicemail_enabled: bool | None = None
    voicemail_email: str | None = None


@router.get("/telephony/extensions")
async def telephony_extensions(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_telephony:
        raise HTTPException(status_code=403, detail="Gestion téléphonique non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_extensions(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.patch("/telephony/extensions/{extension_id}")
async def update_telephony_extension(extension_id: str, payload: TelephonyExtensionUpdate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_telephony:
        raise HTTPException(status_code=403, detail="Gestion téléphonique non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    data = payload.model_dump(exclude_unset=True)
    try:
        return await sipv_client.update_extension(extension_id, **data)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# IVR -- memes champs que IVRCreate/IVRUpdate cote SIPV (ivr.py), voir aussi
# companies.py qui n'a que le GET aujourd'hui (create/update jamais exposes
# cote admin non plus avant TASK-020).
class TelephonyIvrOption(BaseModel):
    digit: str
    label: str | None = None
    destination_type: str
    destination: str

class TelephonyIvrCreate(BaseModel):
    name: str
    description: str | None = None
    greeting_text: str | None = None
    greeting_prompt_id: uuid.UUID | None = None
    timeout_seconds: int = 10
    max_retries: int = 3
    invalid_destination: str | None = None
    timeout_destination: str | None = None
    options: list[TelephonyIvrOption] = []

class TelephonyIvrUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    greeting_text: str | None = None
    greeting_prompt_id: uuid.UUID | None = None
    timeout_seconds: int | None = None
    max_retries: int | None = None
    invalid_destination: str | None = None
    timeout_destination: str | None = None
    is_active: bool | None = None


@router.get("/telephony/ivr")
async def telephony_list_ivr(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_ivr:
        raise HTTPException(status_code=403, detail="Gestion IVR non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_ivrs(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.post("/telephony/ivr", status_code=status.HTTP_201_CREATED)
async def telephony_create_ivr(payload: TelephonyIvrCreate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_ivr:
        raise HTTPException(status_code=403, detail="Gestion IVR non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.create_ivr(tenant_id, **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.patch("/telephony/ivr/{ivr_id}")
async def telephony_update_ivr(ivr_id: str, payload: TelephonyIvrUpdate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_ivr:
        raise HTTPException(status_code=403, detail="Gestion IVR non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        return await sipv_client.update_ivr(ivr_id, **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# Groupes -- ring-groups (sonnerie) + paging-groups (interphonie), memes champs
# que companies.py (RingGroupPayload/PagingGroupPayload) -- non reutilises tels
# quels (modeles locaux a chaque fichier, convention deja en place dans ce
# projet, voir Mon poste plus haut qui duplique aussi ses propres champs).
class TelephonyRingGroupCreate(BaseModel):
    name: str
    extension: str
    ring_strategy: str = "simultaneous"
    ring_time: int = 20
    no_answer_destination: str | None = None
    confirm_before_answer: bool = False

class TelephonyRingGroupUpdate(BaseModel):
    name: str | None = None
    ring_strategy: str | None = None
    ring_time: int | None = None
    no_answer_destination: str | None = None
    is_active: bool | None = None
    confirm_before_answer: bool | None = None


@router.get("/telephony/ring-groups")
async def telephony_list_ring_groups(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_ring_groups(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.post("/telephony/ring-groups", status_code=status.HTTP_201_CREATED)
async def telephony_create_ring_group(payload: TelephonyRingGroupCreate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.create_ring_group(tenant_id, members=[], **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.patch("/telephony/ring-groups/{rg_id}")
async def telephony_update_ring_group(rg_id: str, payload: TelephonyRingGroupUpdate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        return await sipv_client.update_ring_group(rg_id, **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class TelephonyPagingGroupCreate(BaseModel):
    name: str
    extension: str
    mode: str = "unidirectional"

class TelephonyPagingGroupUpdate(BaseModel):
    name: str | None = None
    extension: str | None = None
    mode: str | None = None
    is_active: bool | None = None


@router.get("/telephony/paging-groups")
async def telephony_list_paging_groups(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_paging_groups(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.post("/telephony/paging-groups", status_code=status.HTTP_201_CREATED)
async def telephony_create_paging_group(payload: TelephonyPagingGroupCreate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.create_paging_group(tenant_id, **payload.model_dump(mode="json"))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

@router.patch("/telephony/paging-groups/{pg_id}")
async def telephony_update_paging_group(pg_id: str, payload: TelephonyPagingGroupUpdate, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        return await sipv_client.update_paging_group(pg_id, **payload.model_dump(mode="json", exclude_unset=True))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# Files d'attente -- lecture seule dans le portail (creation/edition reste un
# geste technique interne pour l'instant, TASK-020 ne demande que la visibilite).
@router.get("/telephony/queues")
async def telephony_list_queues(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_groups:
        raise HTTPException(status_code=403, detail="Gestion des groupes non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_queues(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# Prompts (phrases/annonces) + MOH (musique d'attente) -- meme permission
# can_manage_audio_prompts pour les deux, regroupees sous le meme sous-onglet
# "Audio" cote portail (meme libelle admin : "Gérer les messages audio /
# musique d'attente", ContactDetail.jsx).

@router.get("/telephony/prompts")
async def telephony_list_prompts(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_prompts(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/telephony/prompts", status_code=status.HTTP_201_CREATED)
async def telephony_upload_prompt(
    name: str = Form(...), file: UploadFile = File(...),
    u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db),
):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        content = await file.read()
        return await sipv_client.upload_prompt(tenant_id, name, file.filename or "phrase.wav", content, file.content_type)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class TelephonyPromptRename(BaseModel):
    name: str


@router.patch("/telephony/prompts/{prompt_id}")
async def telephony_rename_prompt(prompt_id: str, payload: TelephonyPromptRename, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        return await sipv_client.rename_prompt(prompt_id, payload.name.strip())
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.delete("/telephony/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def telephony_delete_prompt(prompt_id: str, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        await sipv_client.delete_prompt(prompt_id)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            raise HTTPException(status_code=400, detail=e.response.json().get("detail", "Phrase encore utilisée"))
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/telephony/prompts/{prompt_id}/file")
async def telephony_prompt_file(prompt_id: str, u: PortalUser = Depends(get_portal_user_media)):
    if not u.can_listen_audio_prompts:
        raise HTTPException(status_code=403, detail="Écoute audio non autorisée")
    try:
        content, filename = await sipv_client.download_prompt(prompt_id)
        return Response(content=content, media_type="audio/wav", headers={"Content-Disposition": f'inline; filename="{filename}"'})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/telephony/moh/{moh_id}/file")
async def telephony_moh_file(moh_id: str, u: PortalUser = Depends(get_portal_user_media)):
    if not u.can_listen_audio_prompts:
        raise HTTPException(status_code=403, detail="Écoute audio non autorisée")
    try:
        content, filename = await sipv_client.download_moh(moh_id)
        return Response(content=content, media_type="audio/wav", headers={"Content-Disposition": f'inline; filename="{filename}"'})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# Voicebox (synthese vocale) -- permission distincte can_generate_voice_prompts,
# separee de can_manage_audio_prompts (upload/suppression de fichiers) et de
# can_listen_audio_prompts (ecoute) -- 3 capacites independantes, demande
# explicite de Philippe ("leur checkbox bien sur").
@router.get("/telephony/voicebox/voices")
async def telephony_voicebox_voices(u: PortalUser = Depends(get_portal_user)):
    # Liste informative seule (pas de generation) -- accessible aux deux
    # contextes qui en ont besoin : Gestion telephonique (IVR/phrases) ET
    # Mon poste (message d'accueil de boite vocale).
    if not (u.can_generate_voice_prompts or u.can_edit_voicemail):
        raise HTTPException(status_code=403, detail="Génération vocale non autorisée")
    try:
        return await voicebox_client.list_voices()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")


@router.get("/telephony/voicebox/preview")
async def telephony_voicebox_preview(text: str, voice_id: str, language: str = "fr", u: PortalUser = Depends(get_portal_user_media)):
    if not (u.can_generate_voice_prompts or u.can_edit_voicemail):
        raise HTTPException(status_code=403, detail="Génération vocale non autorisée")
    try:
        content, _filename = await voicebox_client.generate(text, voice_id, language)
    except (TimeoutError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")
    return Response(content=content, media_type="audio/wav")


class TelephonyGeneratePrompt(BaseModel):
    name: str
    text: str
    voice_id: str
    language: str = "fr"


@router.post("/telephony/prompts/generate", status_code=status.HTTP_201_CREATED)
async def telephony_generate_prompt(payload: TelephonyGeneratePrompt, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_generate_voice_prompts:
        raise HTTPException(status_code=403, detail="Génération vocale non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        content, filename = await voicebox_client.generate(payload.text, payload.voice_id, payload.language)
    except (TimeoutError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")
    try:
        return await sipv_client.upload_prompt(tenant_id, payload.name, filename, content, "audio/wav")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/telephony/moh")
async def telephony_list_moh(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_available_moh(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/telephony/moh", status_code=status.HTTP_201_CREATED)
async def telephony_upload_moh(
    name: str = Form(...), file: UploadFile = File(...),
    u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db),
):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        content = await file.read()
        return await sipv_client.upload_moh(name, file.filename or "moh.wav", content, file.content_type, tenant_id=tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.delete("/telephony/moh/{moh_id}", status_code=status.HTTP_204_NO_CONTENT)
async def telephony_delete_moh(moh_id: str, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    # Securite : un client ne peut supprimer QUE ses propres fichiers MOH dedies
    # (tenant_id == sa compagnie) -- jamais un fichier global partage entre tenants.
    try:
        items = await sipv_client.list_available_moh(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    target = next((it for it in items if str(it.get("id")) == moh_id), None)
    if not target or str(target.get("tenant_id")) != tenant_id:
        raise HTTPException(status_code=403, detail="Ce fichier n'appartient pas à votre compagnie")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    try:
        await sipv_client.delete_moh(moh_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/telephony/moh-selection")
async def telephony_get_moh_selection(u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.get_moh_selection(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/telephony/moh-selection")
async def telephony_set_moh_selection(items: list[dict], u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_manage_audio_prompts:
        raise HTTPException(status_code=403, detail="Gestion audio non autorisée")
    await acquire_telephony_lock(db, u.company_id, "client", u.id, u.full_name)
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.set_moh_selection(tenant_id, items)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.get("/telephony/cdr")
async def telephony_company_cdr(page: int = 1, extension: str | None = None, u: PortalUser = Depends(get_portal_user), db: AsyncSession = Depends(get_db)):
    if not u.can_view_company_cdr:
        raise HTTPException(status_code=403, detail="Accès à l'historique d'appels de la compagnie non autorisé")
    tenant_id = await _company_tenant_id_portal(u, db)
    try:
        return await sipv_client.list_cdr(tenant_id, page=page, extension=extension)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# ── Admin: Portal Users Management ───────────────────────────────────────────

@router.get("/users", response_model=list[PortalUserOut])
async def list_portal_users(company_id: uuid.UUID | None = None, contact_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(PortalUser).order_by(PortalUser.full_name)
    if company_id:
        q = q.where(PortalUser.company_id == company_id)
    if contact_id:
        q = q.where(PortalUser.contact_id == contact_id)
    result = await db.execute(q)
    return [_out(u) for u in result.scalars().all()]

@router.post("/users", response_model=PortalUserOut, status_code=status.HTTP_201_CREATED)
async def create_portal_user(payload: PortalUserCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    existing = await db.execute(select(PortalUser).where(PortalUser.email == payload.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Courriel déjà utilisé")
    data = payload.model_dump()
    pw = data.pop("password")
    u = PortalUser(**data, hashed_password=hash_password(pw))
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return _out(u)

@router.put("/users/{user_id}", response_model=PortalUserOut)
async def update_portal_user(user_id: uuid.UUID, payload: PortalUserUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur portail introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data:
        u.hashed_password = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(u, k, v)
    await db.commit()
    await db.refresh(u)
    return _out(u)

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_portal_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    u = result.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur portail introuvable")
    await db.delete(u)
    await db.commit()
