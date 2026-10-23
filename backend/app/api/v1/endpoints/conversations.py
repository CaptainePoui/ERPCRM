"""Conversations enregistrees depuis un ticket (TASK-055 etape 3, 2026-10-23) : enregistrement par morceaux,
transcription et voix reconnues sur le serveur, consultation dans le ticket, la compagnie et le contact."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import conversations as convs
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.contact import Contact
from app.models.conversation import Conversation, ConversationSegment
from app.models.ticket import Ticket
from app.models.user import User

router = APIRouter()

MAX_CHUNK = 10 * 1024 * 1024


class ConversationIn(BaseModel):
    ticket_id: uuid.UUID
    mime: str = "audio/webm"


class SpeakerIn(BaseModel):
    label: str                       # etiquette actuelle (« Client 1 »)
    user_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None


class SegmentIn(BaseModel):
    text: str


def _out(c: Conversation) -> dict:
    t = c.ticket
    return {
        "id": str(c.id), "status": c.status, "error": c.error, "duration": c.duration,
        "started_at": c.started_at.isoformat(), "transcribed_at": c.transcribed_at.isoformat() if c.transcribed_at else None,
        "recorded_by": c.user.full_name if c.user else None,
        "ticket": {"id": str(t.id), "number": t.number, "title": t.title, "company_id": str(t.company_id),
                   "contact_id": str(t.contact_id) if t.contact_id else None},
        "segments": [{"id": str(s.id), "start": s.start, "end": s.end, "text": s.text, "speaker": s.speaker,
                      "user_id": str(s.user_id) if s.user_id else None, "contact_id": str(s.contact_id) if s.contact_id else None}
                     for s in c.segments],
    }


def _q():
    return select(Conversation).options(selectinload(Conversation.ticket), selectinload(Conversation.user),
                                        selectinload(Conversation.segments))


async def _get(db, cid) -> Conversation:
    c = (await db.execute(_q().where(Conversation.id == cid))).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "Conversation introuvable")
    return c


@router.get("")
async def list_conversations(ticket_id: uuid.UUID | None = None, company_id: uuid.UUID | None = None,
                             contact_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db),
                             _: User = Depends(get_current_user)):
    q = _q().join(Ticket, Ticket.id == Conversation.ticket_id).order_by(Conversation.started_at.desc())
    if ticket_id:
        q = q.where(Conversation.ticket_id == ticket_id)
    elif company_id:
        q = q.where(Ticket.company_id == company_id)
    elif contact_id:   # son ticket, ou une conversation ou sa voix a ete reconnue
        q = q.where(or_(Ticket.contact_id == contact_id,
                        Conversation.id.in_(select(ConversationSegment.conversation_id).where(ConversationSegment.contact_id == contact_id))))
    else:
        raise HTTPException(400, "ticket_id, company_id ou contact_id requis")
    return [_out(c) for c in (await db.execute(q.limit(200))).scalars().all()]


@router.post("", status_code=201)
async def start(body: ConversationIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not await db.get(Ticket, body.ticket_id):
        raise HTTPException(404, "Ticket introuvable")
    mime = body.mime.split(";")[0].strip()
    c = Conversation(ticket_id=body.ticket_id, user_id=user.id, mime=mime if mime in convs.EXT else "audio/webm",
                     last_chunk_at=datetime.now(timezone.utc))
    db.add(c)
    await db.commit()
    return {"id": str(c.id)}


@router.post("/{cid}/chunk")
async def chunk(cid: uuid.UUID, audio: UploadFile = File(...), db: AsyncSession = Depends(get_db),
                _: User = Depends(get_current_user)):
    c = await db.get(Conversation, cid)
    if not c:
        raise HTTPException(404, "Conversation introuvable")
    if c.status != "recording":
        raise HTTPException(409, "L'enregistrement est déjà terminé")
    data = await audio.read()
    if len(data) > MAX_CHUNK:
        raise HTTPException(413, "Morceau trop gros")
    convs.append(c, data)
    c.last_chunk_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/{cid}/finish")
async def finish(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await _get(db, cid)
    if c.status == "recording":
        c.status = "pending"
        await db.commit()
    return _out(c)


@router.post("/{cid}/retry")
async def retry(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Refaire la transcription (apres une erreur, ou pour reconnaitre une voix apprise depuis)."""
    c = await _get(db, cid)
    if c.status in ("error", "done"):
        c.status, c.error = "pending", None
        await db.commit()
    return _out(c)


@router.get("/{cid}")
async def get_conversation(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _out(await _get(db, cid))


@router.get("/{cid}/audio")
async def audio(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await db.get(Conversation, cid)
    if not c or not convs.path_of(c).exists():
        raise HTTPException(404, "Son introuvable")
    return FileResponse(convs.path_of(c), media_type=c.mime)


@router.put("/{cid}/speaker")
async def set_speaker(cid: uuid.UUID, body: SpeakerIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Dire qui parle : toutes les phrases de cette etiquette, et sa voix est apprise pour la prochaine fois."""
    if bool(body.user_id) == bool(body.contact_id):
        raise HTTPException(400, "Choisir un utilisateur ou un contact")
    c = await _get(db, cid)
    user = await db.get(User, body.user_id) if body.user_id else None
    contact = await db.get(Contact, body.contact_id) if body.contact_id else None
    if not (user or contact):
        raise HTTPException(404, "Personne introuvable")
    if not await convs.learn(db, c, body.label, user, contact):
        raise HTTPException(404, "Aucune phrase de cette personne dans la conversation")
    await db.commit()
    return _out(await _get(db, cid))


@router.put("/segments/{sid}")
async def edit_segment(sid: uuid.UUID, body: SegmentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    s = await db.get(ConversationSegment, sid)
    if not s:
        raise HTTPException(404, "Phrase introuvable")
    s.text = body.text.strip()
    c = await _get(db, s.conversation_id)
    c.text = "\n".join(f"{x.speaker} : {x.text}" for x in c.segments)
    await db.commit()
    return _out(await _get(db, s.conversation_id))


@router.delete("/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await db.get(Conversation, cid)
    if not c:
        raise HTTPException(404, "Conversation introuvable")
    if c.status == "transcribing":
        raise HTTPException(409, "Transcription en cours : réessaie quand elle sera finie")
    await db.delete(c)
    await db.commit()
    convs.remove_file(c)
