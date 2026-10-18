"""Conversation avec Zeko (TASK-006.5 etape 2, 2026-10-18) : bouton du haut (conversations personnelles) et ticket
(une conversation par ticket, partagee par les techniciens, jamais montree au client). Reponse en flux (SSE) :
le texte apparait mot par mot ; Zeko lit ERPCRM avec ses outils (core/zeko_tools.py), sans rien modifier."""
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints.auth import get_current_user
from app.core import clock, zeko, zeko_tools
from app.core.database import get_db, AsyncSessionLocal
from app.models.ticket import Ticket, TicketMessage
from app.models.user import User
from app.models.zeko import ZekoConversation, ZekoMessage, ZekoInvocation

router = APIRouter()

_MAX_TOOL_ROUNDS = 5
_HISTORY_CHARS = 9000

SYSTEM = (
    "Tu es Zéko, l'assistant intégré à ERPCRM de Simple IP (téléphonie IP et informatique, Québec). Tu aides les "
    "techniciens à dépanner et à retrouver l'information. Réponds en français, court, clair et concret. "
    "Tes outils LISENT les données d'ERPCRM ; tu ne peux rien modifier. N'invente jamais un fait sur un client, un "
    "équipement ou un ticket : vérifie avec un outil ; si l'information n'y est pas, dis-le. Sépare ce qui est confirmé "
    "dans ERPCRM de tes hypothèses. Pour un client, utilise d'abord chercher pour obtenir son id, puis l'outil qui contient "
    "l'information (fiche_client pour les contacts, téléphones, postes, adresses et factures impayées). Ne dis jamais "
    "qu'une information manque sans avoir ouvert l'outil qui la contient. Ici, « poste » veut dire le poste téléphonique "
    "(extension)."
)


class ConversationOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID | None
    title: str | None
    updated_at: datetime

class MessageOut(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    tool_name: str | None
    author_name: str | None
    created_at: datetime

class ConversationDetail(ConversationOut):
    messages: list[MessageOut]

class NewConversation(BaseModel):
    ticket_id: uuid.UUID | None = None

class SendMessage(BaseModel):
    content: str


def _now():
    return datetime.now(timezone.utc)


async def _get_conv(db: AsyncSession, cid: uuid.UUID, user: User) -> ZekoConversation:
    c = (await db.execute(select(ZekoConversation).options(selectinload(ZekoConversation.messages).selectinload(ZekoMessage.user))
                          .where(ZekoConversation.id == cid))).scalar_one_or_none()
    if not c or (c.ticket_id is None and c.user_id != user.id):
        raise HTTPException(status_code=404, detail="Conversation introuvable")
    return c


def _detail(c: ZekoConversation) -> ConversationDetail:
    return ConversationDetail(
        id=c.id, ticket_id=c.ticket_id, title=c.title, updated_at=c.updated_at,
        messages=[MessageOut(id=m.id, role=m.role, content=m.content if m.role != "tool" else "",
                             tool_name=m.tool_name, author_name=m.user.full_name if m.user else None, created_at=m.created_at)
                  for m in c.messages if m.role != "assistant" or m.content or not m.tool_calls],
    )


@router.get("/status")
async def status(_: User = Depends(get_current_user)):
    c = await zeko.config(fresh=True)
    return {"enabled": c["enabled"], "model_chat": c["model_chat"], "model_tasks": c["model_tasks"], "busy": await zeko.chat_active()}


@router.get("/conversations", response_model=list[ConversationOut])
async def list_conversations(ticket_id: uuid.UUID | None = Query(default=None), db: AsyncSession = Depends(get_db),
                             current_user: User = Depends(get_current_user)):
    q = select(ZekoConversation).order_by(ZekoConversation.updated_at.desc())
    q = q.where(ZekoConversation.ticket_id == ticket_id) if ticket_id else \
        q.where(ZekoConversation.ticket_id.is_(None), ZekoConversation.user_id == current_user.id)
    return [ConversationOut(id=c.id, ticket_id=c.ticket_id, title=c.title, updated_at=c.updated_at)
            for c in (await db.execute(q.limit(100))).scalars().all()]


@router.post("/conversations", response_model=ConversationDetail)
async def new_conversation(payload: NewConversation, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Ticket : une seule conversation par ticket (retourne celle qui existe)."""
    if payload.ticket_id:
        t = await db.get(Ticket, payload.ticket_id)
        if not t:
            raise HTTPException(status_code=404, detail="Ticket introuvable")
        c = (await db.execute(select(ZekoConversation).where(ZekoConversation.ticket_id == t.id))).scalars().first()
        if c:
            return _detail(await _get_conv(db, c.id, current_user))
        c = ZekoConversation(user_id=current_user.id, ticket_id=t.id, title=t.title[:255])
    else:
        c = ZekoConversation(user_id=current_user.id)
    db.add(c)
    await db.commit()
    return _detail(await _get_conv(db, c.id, current_user))


@router.get("/conversations/{cid}", response_model=ConversationDetail)
async def get_conversation(cid: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _detail(await _get_conv(db, cid, current_user))


@router.delete("/conversations/{cid}", status_code=204)
async def delete_conversation(cid: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    c = await _get_conv(db, cid, current_user)
    await db.delete(c)
    await db.commit()


async def _ticket_context(db, ticket_id) -> str:
    t = (await db.execute(select(Ticket).options(selectinload(Ticket.company), selectinload(Ticket.messages).selectinload(TicketMessage.user))
                          .where(Ticket.id == ticket_id))).scalar_one_or_none()
    if not t:
        return ""
    lines = [f"Cette conversation porte sur le ticket #{str(t.id)[:8].upper()} « {t.title} » du client {t.company.name} "
             f"(client_id {t.company_id}), statut {t.status}."]
    if t.description:
        lines.append(f"Demande : {t.description[:600]}")
    msgs = [f"- {m.created_at.astimezone(clock.business_tz()).strftime('%m-%d %H:%M')} "
            f"{m.user.full_name if m.user else ('client' if m.author_kind == 'client' else '?')} : {m.body[:400]}" for m in t.messages[-8:] if m.body]
    if msgs:
        lines.append("Derniers messages du ticket :\n" + "\n".join(msgs))
    return "\n".join(lines)


def _history(c: ZekoConversation) -> list[dict]:
    """Messages deja echanges (outils compris), les plus recents dans la limite de taille."""
    out, size = [], 0
    for m in reversed(c.messages):
        if m.role == "assistant" and m.tool_calls:
            calls = json.loads(m.tool_calls)
            d = {"role": "assistant", "content": m.content or "", "tool_calls": [
                {"id": x["id"], "type": "function", "function": {"name": x["name"], "arguments": x["arguments"]}} for x in calls]}
        elif m.role == "tool":
            d = {"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content}
        else:
            d = {"role": m.role, "content": m.content}
        size += len(json.dumps(d, ensure_ascii=False))
        if size > _HISTORY_CHARS and out:
            break
        out.append(d)
    out.reverse()
    while out and out[0]["role"] == "tool":            # ne jamais commencer par une reponse d'outil orpheline
        out.pop(0)
    return out


def _sse(ev: dict) -> str:
    return f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"


@router.post("/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, payload: SendMessage, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    if not await zeko.enabled():
        raise HTTPException(status_code=400, detail="Zéko n'est pas configuré (Administration → Intégrations)")
    c = await _get_conv(db, cid, current_user)
    db.add(ZekoMessage(conversation_id=c.id, user_id=current_user.id, role="user", content=text))
    if not c.title:
        c.title = text[:80]
    c.updated_at = _now()
    await db.commit()
    user_id, ticket_id = current_user.id, c.ticket_id

    async def gen():
        async with AsyncSessionLocal() as s:
            conv = await _get_conv(s, cid, current_user)
            system = SYSTEM + f" Aujourd'hui : {clock.today().isoformat()}."
            if ticket_id:
                system += "\n\n" + await _ticket_context(s, ticket_id)
            messages = [{"role": "system", "content": system}] + _history(conv)
            partial = ""
            try:
                for _round in range(_MAX_TOOL_ROUNDS + 1):
                    partial = ""
                    calls = None
                    tools = zeko_tools.TOOLS if _round < _MAX_TOOL_ROUNDS else None
                    async for kind, val in zeko.stream_chat(messages, tools=tools, user_id=user_id, conversation_id=cid):
                        if kind == "pense":
                            yield _sse({"type": "pense"})
                        elif kind == "texte":
                            partial += val
                            yield _sse({"type": "texte", "texte": val})
                        elif kind == "outils":
                            calls = val
                    if not calls:
                        s.add(ZekoMessage(conversation_id=cid, role="assistant", content=partial))
                        await s.commit()
                        partial = None
                        yield _sse({"type": "fin"})
                        return
                    for x in calls:
                        x["id"] = x.get("id") or f"call_{uuid.uuid4().hex[:8]}"
                    s.add(ZekoMessage(conversation_id=cid, role="assistant", content=partial, tool_calls=json.dumps(calls, ensure_ascii=False)))
                    messages.append({"role": "assistant", "content": partial, "tool_calls": [
                        {"id": x["id"], "type": "function", "function": {"name": x["name"], "arguments": x["arguments"]}} for x in calls]})
                    for x in calls:
                        yield _sse({"type": "outil", "nom": x["name"], "libelle": zeko_tools.LABELS.get(x["name"], x["name"])})
                        try:
                            args = json.loads(x["arguments"] or "{}")
                        except ValueError:
                            args = {}
                        result = await zeko_tools.run(x["name"], args, s)
                        s.add(ZekoMessage(conversation_id=cid, role="tool", content=result, tool_call_id=x["id"], tool_name=x["name"]))
                        messages.append({"role": "tool", "tool_call_id": x["id"], "content": result})
                    await s.commit()
                    partial = None
            except zeko.ZekoUnavailable as e:
                yield _sse({"type": "erreur", "texte": str(e)})
            except Exception as e:
                yield _sse({"type": "erreur", "texte": f"Zéko n'a pas pu répondre : {str(e)[:200]}"})
            finally:
                if partial:                          # arrete en cours de route : garder ce qui etait ecrit
                    try:
                        s.add(ZekoMessage(conversation_id=cid, role="assistant", content=partial + " … (arrêté)"))
                        await s.commit()
                    except Exception:
                        pass

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/journal")
async def journal(limit: int = 50, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(ZekoInvocation).order_by(ZekoInvocation.created_at.desc()).limit(min(limit, 500)))).scalars().all()
    return [{"created_at": r.created_at, "purpose": r.purpose, "model": r.model, "status": r.status, "duration_ms": r.duration_ms,
             "prompt_tokens": r.prompt_tokens, "completion_tokens": r.completion_tokens, "error": r.error} for r in rows]


@router.get("/models")
async def models(_: User = Depends(get_current_user)):
    """Modeles offerts par l'adresse configuree (liste pour l'ecran Administration)."""
    import httpx
    c = await zeko.config(fresh=True)
    if not c["url"]:
        return []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{c['url']}/models")
            r.raise_for_status()
            return sorted(m["id"] for m in r.json().get("data", []))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Modèle injoignable : {str(e)[:200]}")
