import uuid
import httpx
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.core import sipv_client
from app.core import voicebox_client
from app.api.v1.endpoints.auth import get_current_user, get_current_user_media
from app.models.telephony import DID, Extension
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.user import User

router = APIRouter()

DID_DESTINATION_TYPES = {
    "extension": "Poste", "ring_group": "Groupe d'appel", "ivr": "IVR", "queue": "File d'attente",
    "voicemail": "Messagerie", "hangup": "Raccrocher", "fax": "Fax virtuel", "conference": "Conférence",
    "transfer": "Transfert d'appel", "message": "Message enregistré",
}


async def _company_tenant_id_for_did(company_id: uuid.UUID, db: AsyncSession) -> str | None:
    """Contrairement a _company_tenant_id (companies.py), retourne None plutot
    que 400 si pas de tenant SIPV -- un DID reste creable/editable en ERPCRM
    (inventaire/facturation) meme sans tenant SIPV actif, juste pas synchronise."""
    company = await db.get(Company, company_id)
    if not company or not company.sipv_enabled or not company.sipv_tenant_id:
        return None
    return str(company.sipv_tenant_id)


class DIDOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    number: str
    is_active: bool
    porting_date: date | None
    notes: str | None
    destination_type: str | None
    destination_type_label: str | None
    destination: str | None
    after_message_destination_type: str | None
    after_message_destination: str | None
    site_id: uuid.UUID | None
    schedule_id: uuid.UUID | None
    model_config = {"from_attributes": True}

class DIDCreate(BaseModel):
    number: str
    is_active: bool = True
    porting_date: date | None = None
    notes: str | None = None
    destination_type: str | None = None
    destination: str | None = None
    after_message_destination_type: str | None = None
    after_message_destination: str | None = None
    site_id: uuid.UUID | None = None
    schedule_id: uuid.UUID | None = None

class DIDUpdate(BaseModel):
    number: str | None = None
    is_active: bool | None = None
    porting_date: date | None = None
    notes: str | None = None
    destination_type: str | None = None
    destination: str | None = None
    after_message_destination_type: str | None = None
    after_message_destination: str | None = None
    site_id: uuid.UUID | None = None
    clear_site: bool = False
    schedule_id: uuid.UUID | None = None
    clear_schedule: bool = False

class ExtOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    did_id: uuid.UUID | None
    did_number: str | None
    extension: str
    name: str
    voicemail_email: str | None
    is_active: bool

class ExtCreate(BaseModel):
    extension: str
    name: str
    did_id: uuid.UUID | None = None
    voicemail_email: str | None = None
    is_active: bool = True

class ExtUpdate(BaseModel):
    extension: str | None = None
    name: str | None = None
    did_id: uuid.UUID | None = None
    voicemail_email: str | None = None
    is_active: bool | None = None


def _build_did(d: DID) -> DIDOut:
    return DIDOut(
        id=d.id, company_id=d.company_id, number=d.number,
        is_active=d.is_active,
        porting_date=d.porting_date, notes=d.notes,
        destination_type=d.destination_type,
        destination_type_label=DID_DESTINATION_TYPES.get(d.destination_type) if d.destination_type else None,
        destination=d.destination,
        after_message_destination_type=d.after_message_destination_type,
        after_message_destination=d.after_message_destination,
        site_id=d.site_id, schedule_id=d.schedule_id,
    )

def _build_ext(e: Extension) -> ExtOut:
    return ExtOut(
        id=e.id, company_id=e.company_id, did_id=e.did_id,
        did_number=e.did.number if e.did else None,
        extension=e.extension, name=e.name,
        voicemail_email=e.voicemail_email, is_active=e.is_active,
    )


# ── DID Endpoints ─────────────────────────────────────────────────────────────

@router.get("/company/{company_id}/dids", response_model=list[DIDOut])
async def list_dids(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.company_id == company_id).order_by(DID.number))
    return [_build_did(d) for d in result.scalars().all()]

async def _sync_did_to_sipv(company_id: uuid.UUID, erpcrm_did_id: uuid.UUID, number: str, notes: str | None,
                             destination_type: str | None, destination: str | None, is_active: bool, db: AsyncSession,
                             schedule_id: uuid.UUID | None = None,
                             after_message_destination_type: str | None = None,
                             after_message_destination: str | None = None) -> str | None:
    """Pousse l'etat courant du DID vers SIPV si un tenant SIPV actif existe pour
    cette compagnie. Retourne le tenant_did_id SIPV, ou None si pas de tenant
    (le DID reste utilisable en ERPCRM, juste pas synchronise). notes sert de
    "label" descriptif cote SIPV (DID.label retire, TASK-S010.5.1)."""
    tenant_id = await _company_tenant_id_for_did(company_id, db)
    if not tenant_id:
        return None
    result = await sipv_client.sync_did(
        tenant_id=tenant_id, erpcrm_did_id=str(erpcrm_did_id), number=number, label=notes,
        destination_type=destination_type, destination=destination, is_active=is_active,
        schedule_id=str(schedule_id) if schedule_id else None,
        after_message_destination_type=after_message_destination_type,
        after_message_destination=after_message_destination,
    )
    return result["tenant_did_id"]


async def _validate_site(company_id: uuid.UUID, site_id: uuid.UUID | None, db: AsyncSession):
    if not site_id:
        return
    site = await db.get(CompanySite, site_id)
    if not site or site.company_id != company_id:
        raise HTTPException(status_code=400, detail="Succursale invalide pour cette compagnie")


@router.post("/company/{company_id}/dids", response_model=DIDOut, status_code=status.HTTP_201_CREATED)
async def create_did(company_id: uuid.UUID, payload: DIDCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _validate_site(company_id, payload.site_id, db)
    did_id = uuid.uuid4()
    try:
        sipv_tenant_did_id = await _sync_did_to_sipv(
            company_id, did_id, payload.number, payload.notes,
            payload.destination_type, payload.destination, payload.is_active, db,
            schedule_id=payload.schedule_id,
            after_message_destination_type=payload.after_message_destination_type,
            after_message_destination=payload.after_message_destination,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

    d = DID(id=did_id, company_id=company_id, sipv_tenant_did_id=sipv_tenant_did_id and uuid.UUID(sipv_tenant_did_id),
             **payload.model_dump())
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return _build_did(d)

@router.put("/dids/{did_id}", response_model=DIDOut)
async def update_did(did_id: uuid.UUID, payload: DIDUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.id == did_id))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="DID introuvable")

    updates = payload.model_dump(exclude_unset=True)
    clear_site = updates.pop("clear_site", False)
    site_id = updates.pop("site_id", d.site_id)
    if clear_site:
        site_id = None
    else:
        await _validate_site(d.company_id, site_id, db)

    clear_schedule = updates.pop("clear_schedule", False)
    schedule_id = updates.pop("schedule_id", d.schedule_id)
    if clear_schedule:
        schedule_id = None

    merged = {
        "number": updates.get("number", d.number),
        "notes": updates.get("notes", d.notes),
        "is_active": updates.get("is_active", d.is_active),
        "destination_type": updates.get("destination_type", d.destination_type),
        "destination": updates.get("destination", d.destination),
        "after_message_destination_type": updates.get("after_message_destination_type", d.after_message_destination_type),
        "after_message_destination": updates.get("after_message_destination", d.after_message_destination),
    }
    try:
        sipv_tenant_did_id = await _sync_did_to_sipv(
            d.company_id, d.id, merged["number"], merged["notes"],
            merged["destination_type"], merged["destination"], merged["is_active"], db,
            schedule_id=schedule_id,
            after_message_destination_type=merged["after_message_destination_type"],
            after_message_destination=merged["after_message_destination"],
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")

    for k, v in updates.items():
        setattr(d, k, v)
    d.site_id = site_id
    d.schedule_id = schedule_id
    if sipv_tenant_did_id:
        d.sipv_tenant_did_id = uuid.UUID(sipv_tenant_did_id)
    await db.commit()
    await db.refresh(d)
    return _build_did(d)

@router.delete("/dids/{did_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_did(did_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(DID).where(DID.id == did_id))
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="DID introuvable")
    if d.sipv_tenant_did_id:
        try:
            await sipv_client.delete_tenant_did(str(d.sipv_tenant_did_id))
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")
    await db.delete(d)
    await db.commit()


# ── Horaires (Schedule/ScheduleRule, TASK-S016/S010.7) -- proxy simple vers
# SIPV, pas de copie maitre cote ERPCRM (voir sipv_client.py). Permet a un DID
# d'avoir un seul horaire au lieu de dupliquer le DID par plage (UCM-style
# Time Condition, demande Philippe 2026-08-06).

class RuleIn(BaseModel):
    days_of_week: list[int]
    open_time: str
    close_time: str
    label: str | None = None
    destination_type: str | None = None
    destination: str | None = None

class RuleUpdateIn(BaseModel):
    days_of_week: list[int] | None = None
    open_time: str | None = None
    close_time: str | None = None
    label: str | None = None
    destination_type: str | None = None
    destination: str | None = None

class ScheduleIn(BaseModel):
    name: str
    timezone: str = "America/Montreal"
    closed_destination_type: str | None = None
    closed_destination: str | None = None
    rules: list[RuleIn] = []

class ScheduleUpdateIn(BaseModel):
    name: str | None = None
    timezone: str | None = None
    closed_destination_type: str | None = None
    closed_destination: str | None = None
    is_active: bool | None = None


@router.get("/company/{company_id}/prompts")
async def list_prompts(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """TASK-023.32 : phrases/annonces du tenant SIPV, pour le selecteur de
    destination "Message enregistre" d'un DID. Meme pattern que list_schedules
    (liste vide, pas d'erreur, si pas de tenant SIPV actif)."""
    tenant_id = await _company_tenant_id_for_did(company_id, db)
    if not tenant_id:
        return []
    try:
        return await sipv_client.list_prompts(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


async def _company_tenant_id_required(company_id: uuid.UUID, db: AsyncSession) -> str:
    tenant_id = await _company_tenant_id_for_did(company_id, db)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Cette compagnie n'a pas de tenant SIPV actif")
    return tenant_id


@router.post("/company/{company_id}/prompts", status_code=status.HTTP_201_CREATED)
async def upload_prompt(
    company_id: uuid.UUID, name: str = Form(...), file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    """TASK-029 : upload direct d'une phrase (fichier deja enregistre)."""
    tenant_id = await _company_tenant_id_required(company_id, db)
    try:
        content = await file.read()
        return await sipv_client.upload_prompt(tenant_id, name, file.filename or "phrase.wav", content, file.content_type)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class PromptRenamePayload(BaseModel):
    name: str


@router.put("/prompts/{prompt_id}")
async def rename_prompt(prompt_id: uuid.UUID, payload: PromptRenamePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.rename_prompt(str(prompt_id), payload.name.strip())
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/prompts/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prompt(prompt_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_prompt(str(prompt_id))
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 400:
            raise HTTPException(status_code=400, detail=e.response.json().get("detail", "Phrase encore utilisée"))
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/prompts/{prompt_id}/file")
async def download_prompt(prompt_id: uuid.UUID, _: User = Depends(get_current_user_media)):
    try:
        content, filename = await sipv_client.download_prompt(str(prompt_id))
        return Response(content=content, media_type="audio/wav", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/voicebox/voices")
async def list_voicebox_voices(_: User = Depends(get_current_user)):
    """TASK-029 : profils de voix Voicebox disponibles (menu deroulant)."""
    try:
        return await voicebox_client.list_voices()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")


@router.get("/voicebox/preview")
async def preview_voicebox_voice(
    text: str, voice_id: str, language: str = "fr", _: User = Depends(get_current_user_media),
):
    """TASK-029 : genere un extrait pour tester une voix (ecoute navigateur
    seulement, RIEN n'est envoye a SIPV -- pas une vraie phrase). GET (pas
    POST) pour pouvoir etre utilise directement comme src= d'une balise
    <audio> native (contourne le blocage "user gesture" du navigateur)."""
    try:
        content, _filename = await voicebox_client.generate(text, voice_id, language)
    except (TimeoutError, RuntimeError) as e:
        raise HTTPException(status_code=502, detail=str(e))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Voicebox injoignable : {e}")
    return Response(content=content, media_type="audio/wav")


class GeneratePromptPayload(BaseModel):
    name: str
    text: str
    voice_id: str
    language: str = "fr"


@router.post("/company/{company_id}/prompts/generate", status_code=status.HTTP_201_CREATED)
async def generate_prompt(
    company_id: uuid.UUID, payload: GeneratePromptPayload,
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    """TASK-029 (Mode 3) : genere une phrase par synthese vocale (Voicebox) et
    l'envoie directement a SIPV comme nouvelle phrase du tenant de cette
    compagnie."""
    tenant_id = await _company_tenant_id_required(company_id, db)
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


class CallPromptPayload(BaseModel):
    extension_id: uuid.UUID


@router.post("/prompts/{prompt_id}/call")
async def call_prompt(prompt_id: uuid.UUID, payload: CallPromptPayload, _: User = Depends(get_current_user)):
    """TASK-S055 : appelle un poste et joue cette phrase des que ca decroche."""
    try:
        return await sipv_client.call_prompt(str(prompt_id), str(payload.extension_id))
    except httpx.HTTPStatusError as e:
        detail = "SIPV injoignable"
        try:
            detail = e.response.json().get("detail", detail)
        except Exception:
            pass
        raise HTTPException(status_code=e.response.status_code if e.response.status_code < 500 else 502, detail=detail)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/company/{company_id}/schedules")
async def list_schedules(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id_for_did(company_id, db)
    if not tenant_id:
        return []
    try:
        return await sipv_client.list_schedules(tenant_id)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/company/{company_id}/schedules", status_code=status.HTTP_201_CREATED)
async def create_schedule(company_id: uuid.UUID, payload: ScheduleIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    tenant_id = await _company_tenant_id_required(company_id, db)
    try:
        return await sipv_client.create_schedule(tenant_id, **payload.model_dump())
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/schedules/{sched_id}")
async def update_schedule(sched_id: uuid.UUID, payload: ScheduleUpdateIn, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_schedule(str(sched_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.delete("/schedules/{sched_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(sched_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_schedule(str(sched_id))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.post("/schedules/{sched_id}/rules", status_code=status.HTTP_201_CREATED)
async def add_schedule_rule(sched_id: uuid.UUID, payload: RuleIn, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.add_schedule_rule(str(sched_id), **payload.model_dump())
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.put("/schedules/rules/{rule_id}")
async def update_schedule_rule(rule_id: uuid.UUID, payload: RuleUpdateIn, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_schedule_rule(str(rule_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


@router.delete("/schedules/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule_rule(rule_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_schedule_rule(str(rule_id))
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


# ── Extension Endpoints ───────────────────────────────────────────────────────

@router.get("/company/{company_id}/extensions", response_model=list[ExtOut])
async def list_extensions(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Extension).options(selectinload(Extension.did))
        .where(Extension.company_id == company_id).order_by(Extension.extension)
    )
    return [_build_ext(e) for e in result.scalars().all()]

@router.post("/company/{company_id}/extensions", response_model=ExtOut, status_code=status.HTTP_201_CREATED)
async def create_extension(company_id: uuid.UUID, payload: ExtCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    e = Extension(company_id=company_id, **payload.model_dump())
    db.add(e)
    await db.flush()
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == e.id))
    e = result.scalar_one()
    await db.commit()
    return _build_ext(e)

@router.put("/extensions/{ext_id}", response_model=ExtOut)
async def update_extension(ext_id: uuid.UUID, payload: ExtUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == ext_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Extension introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(e, k, v)
    await db.commit()
    result = await db.execute(select(Extension).options(selectinload(Extension.did)).where(Extension.id == ext_id))
    return _build_ext(result.scalar_one())

@router.delete("/extensions/{ext_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_extension(ext_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Extension).where(Extension.id == ext_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Extension introuvable")
    await db.delete(e)
    await db.commit()


# ── CDR (TASK-032) ────────────────────────────────────────────────────────────

@router.get("/company/{company_id}/cdr")
async def list_company_cdr(
    company_id: uuid.UUID,
    page: int = 1,
    page_size: int = 50,
    extension: str | None = Query(None, description="Filtre optionnel sur un poste (numéro nu, ex: '103')"),
    direction: str | None = Query(None),
    disposition: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    tenant_id = await _company_tenant_id_for_did(company_id, db)
    if not tenant_id:
        return {"total": 0, "page": page, "page_size": page_size, "items": []}
    try:
        return await sipv_client.list_cdr(
            tenant_id, page=page, page_size=page_size, extension=extension,
            direction=direction, disposition=disposition, date_from=date_from, date_to=date_to,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")
