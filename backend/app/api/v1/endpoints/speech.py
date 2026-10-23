"""Voix (TASK-055, 2026-10-23) : transcription sur le serveur (rien ne sort) et appareils audio (micro choisi par
appareil dans Administration > Configuration > Appareils audio)."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import speech
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.audio_device import AudioDevice
from app.models.user import User, UserRole

router = APIRouter()

MAX_AUDIO = 25 * 1024 * 1024        # ~25 min de voix compressee par le navigateur
SUFFIX = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/wav": ".wav",
          "audio/x-wav": ".wav", "audio/aac": ".aac"}


@router.post("/transcribe")
async def transcribe(audio: UploadFile = File(...), _: User = Depends(get_current_user)):
    data = await audio.read()
    if not data:
        raise HTTPException(400, "Aucun son reçu.")
    if len(data) > MAX_AUDIO:
        raise HTTPException(413, "Enregistrement trop long pour une dictée.")
    kind = (audio.content_type or "").split(";")[0].strip()
    try:
        return await speech.transcribe(data, SUFFIX.get(kind, ".webm"))
    except Exception as e:
        raise HTTPException(422, "Le son n'a pas pu être transcrit.") from e


# ── Appareils audio ──────────────────────────────────────────────────────────

class Mic(BaseModel):
    id: str = Field(max_length=255)
    label: str = Field("", max_length=255)


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    mics: list[Mic] = []


class DeviceUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    selected_mic_id: str | None = None          # "" ou None = micro par defaut
    selected_mic_label: str | None = None


class DeviceReport(BaseModel):
    mics: list[Mic] = []
    used_label: str | None = None
    fell_back: bool = False


def _boss(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.manager)


def _out(d: AudioDevice) -> dict:
    return {"id": str(d.id), "name": d.name, "owner": d.user.full_name if d.user else None,
            "mics": d.mics or [], "selected_mic_id": d.selected_mic_id, "selected_mic_label": d.selected_mic_label,
            "last_mic_label": d.last_mic_label, "fell_back": d.fell_back,
            "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None}


async def _device(db: AsyncSession, did: uuid.UUID, user: User) -> AudioDevice:
    d = (await db.execute(select(AudioDevice).options(selectinload(AudioDevice.user))
                          .where(AudioDevice.id == did))).scalar_one_or_none()
    if not d:
        raise HTTPException(404, "Appareil introuvable")
    if d.user_id != user.id and not _boss(user):
        raise HTTPException(403, "Cet appareil n'est pas le vôtre")
    return d


@router.get("/devices")
async def list_devices(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    q = select(AudioDevice).options(selectinload(AudioDevice.user)).order_by(AudioDevice.name)
    if not _boss(user):
        q = q.where(AudioDevice.user_id == user.id)
    return [_out(d) for d in (await db.execute(q)).scalars().all()]


@router.post("/devices", status_code=201)
async def register_device(body: DeviceIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    d = AudioDevice(name=body.name.strip(), user_id=user.id, mics=[m.model_dump() for m in body.mics],
                    last_seen_at=datetime.now(timezone.utc))
    db.add(d)
    await db.commit()
    return _out(await _device(db, d.id, user))


@router.get("/devices/{did}")
async def get_device(did: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return _out(await _device(db, did, user))


@router.put("/devices/{did}")
async def update_device(did: uuid.UUID, body: DeviceUpdate, db: AsyncSession = Depends(get_db),
                        user: User = Depends(get_current_user)):
    d = await _device(db, did, user)
    fields = body.model_dump(exclude_unset=True)
    if "name" in fields and fields["name"]:
        d.name = fields["name"].strip()
    if "selected_mic_id" in fields:
        d.selected_mic_id = fields["selected_mic_id"] or None
        d.selected_mic_label = (fields.get("selected_mic_label") or None) if d.selected_mic_id else None
        d.fell_back = False
    await db.commit()
    return _out(await _device(db, did, user))


@router.post("/devices/{did}/report")
async def report_device(did: uuid.UUID, body: DeviceReport, db: AsyncSession = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """L'appareil envoie ce qu'il voit a chaque utilisation : ses micros, celui utilise, et s'il a du se replier."""
    d = await _device(db, did, user)
    if body.mics:
        d.mics = [m.model_dump() for m in body.mics]
    d.last_mic_label, d.fell_back = body.used_label, body.fell_back
    d.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return _out(await _device(db, did, user))


@router.delete("/devices/{did}", status_code=204)
async def delete_device(did: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await db.delete(await _device(db, did, user))
    await db.commit()


# ── Ma voix (TASK-055 etape 3) : empreinte de la voix de l'utilisateur, pour etre reconnu dans les conversations ──

@router.get("/my-voice")
async def my_voice(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.conversation import VoicePrint
    vp = (await db.execute(select(VoicePrint).where(VoicePrint.user_id == user.id))).scalar_one_or_none()
    return {"enrolled": bool(vp), "updated_at": vp.updated_at.isoformat() if vp else None}


@router.post("/my-voice")
async def set_my_voice(audio: UploadFile = File(...), db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Remplace l'empreinte de sa voix par celle de cet echantillon (20 s ou plus de parole)."""
    import asyncio, os, tempfile
    from app.core import voices
    from app.models.conversation import VoicePrint
    data = await audio.read()
    if not data or len(data) > MAX_AUDIO:
        raise HTTPException(400, "Échantillon vide ou trop long.")
    kind = (audio.content_type or "").split(";")[0].strip()
    with tempfile.NamedTemporaryFile(suffix=SUFFIX.get(kind, ".webm"), delete=False) as f:
        f.write(data)
    try:
        samples = await asyncio.to_thread(voices.load_audio, f.name)
    except Exception as e:
        raise HTTPException(422, "Le son n'a pas pu être lu.") from e
    finally:
        os.unlink(f.name)
    if len(samples) < voices.RATE * 15:
        raise HTTPException(400, "Parle au moins 20 secondes pour que ta voix soit bien reconnue.")
    emb = await asyncio.to_thread(voices.embed_whole, samples)
    if emb is None:
        raise HTTPException(400, "Aucune voix entendue : vérifie le micro.")
    vp = (await db.execute(select(VoicePrint).where(VoicePrint.user_id == user.id))).scalar_one_or_none()
    if vp:
        vp.embedding, vp.samples = emb.tolist(), 1
    else:
        db.add(VoicePrint(user_id=user.id, embedding=emb.tolist(), samples=1))
    await db.commit()
    return {"enrolled": True}


@router.delete("/my-voice", status_code=204)
async def delete_my_voice(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.models.conversation import VoicePrint
    vp = (await db.execute(select(VoicePrint).where(VoicePrint.user_id == user.id))).scalar_one_or_none()
    if vp:
        await db.delete(vp)
        await db.commit()
