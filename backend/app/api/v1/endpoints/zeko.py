"""Conversation avec Zeko (TASK-006.5 etape 2, 2026-10-18) : bouton du haut (conversations personnelles) et ticket
(une conversation par ticket, partagee par les techniciens, jamais montree au client). Reponse en flux (SSE) :
le texte apparait mot par mot ; Zeko lit ERPCRM avec ses outils (core/zeko_tools.py), sans rien modifier."""
import asyncio
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
    "Tu es Zéko, l'assistant intégré à ERPCRM de Simple IP (téléphonie IP et informatique, Québec). Tu aides l'équipe "
    "de Simple IP à dépanner et à retrouver l'information. Réponds en français, court, clair et concret, comme un collègue. "
    "Tu consultes les données d'ERPCRM et, comme un employé, tu fais le travail demandé avec les outils qui changent des "
    "données (agenda, nouvelle personne et son poste, réglages d'un poste, ce que tu as appris, règles de la banque, nom d'un "
    "client). Avant de changer quoi que ce soit, décris en UNE question « Je … ? » tout ce que tu vas faire pour cette "
    "tâche ; après un oui clair, fais-la au complet sans redemander, puis dis ce qui est fait en reprenant le résultat de "
    "l'outil (ce qu'il dit fait, et ce qu'il dit pas fait), jamais plus. Si une partie de la demande "
    "n'est pas possible, dis-le dans ta question. N'invente jamais un fait sur un client, un "
    "équipement ou un ticket : consulte d'abord ; si l'information n'y est pas, dis-le simplement. Sépare ce qui est "
    "confirmé dans ERPCRM de tes hypothèses. Désigne toujours les clients et les personnes par leur nom. Ne montre jamais "
    "un identifiant interne, un code technique ni le nom de tes outils, et ne demande jamais d'identifiant : un nom suffit. "
    "Si plusieurs clients ou personnes correspondent, nomme-les et demande lequel. Quand la demande porte sur un client, une "
    "personne, un ticket ou une facture précis, ouvre sa page (ouvrir_page) : elle s'affiche dans la fenêtre ERPCRM de l'utilisateur. Avant de dire qu'une information "
    "manque, consulte la fiche qui la contient (contacts, postes, téléphones, adresses, factures impayées : la fiche du "
    "client). Ici, « poste » veut dire le poste téléphonique (extension). Le serveur téléphonique ne fait pas encore de "
    "renvoi vers un cellulaire ou un numéro externe (« follow me ») : dis-le dans ta question et propose le reste. Un dépôt « ELAVON MRCH SVC » est un paiement par carte : "
    "son client et sa facture se trouvent dans les reçus de carte des courriels (paiements_carte), jamais dans le nom du "
    "bénéficiaire. Pour savoir ce qu'un dépôt paie, cherche aussi l'avis de paiement dans les courriels "
    "(chercher_courriels puis lire_courriel : les PDF joints donnent souvent les numéros de factures). Quand tu as compris "
    "comment un client t'avise de ses paiements, propose : « Je retiens que… ? » et n'appelle retenir qu'après un oui. "
    "Une règle de la banque est fausse si son bénéficiaire paie pour plusieurs clients mais qu'elle le relie à UN client "
    "(ex. ELAVON MRCH SVC, le terminal de cartes : jamais de client, seulement le fournisseur Elavon pour ses frais — "
    "c'est la bonne règle). Si tu vois une règle fausse, dis pourquoi et propose le changement exact. "
    "Tu ne modifies jamais une transaction : tu proposes. N'affirme jamais qu'un paiement règle une facture si les montants ne le permettent pas : "
    "rapporte les chiffres et le « constat » donnés par l'outil, et dis ce qui reste à vérifier. Réfléchis en français."
)
_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
ROLES = {"admin": "administrateur", "manager": "gestionnaire", "tech": "technicien", "billing": "facturation", "readonly": "lecture seule"}


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
    busy: bool = False             # Zeko est en train de repondre (meme si la fenetre a ete fermee)

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
        id=c.id, ticket_id=c.ticket_id, title=c.title, updated_at=c.updated_at, busy=_busy(c),
        messages=[MessageOut(id=m.id, role=m.role, content=m.content if m.role != "tool" else "",
                             tool_name=m.tool_name, author_name=m.user.full_name if m.user else None, created_at=m.created_at)
                  for m in c.messages if m.role != "assistant" or m.content or not m.tool_calls],
    )


@router.get("/status")
async def status(_: User = Depends(get_current_user)):
    c = await zeko.config(fresh=True)
    return {"enabled": c["enabled"], "model_chat": c["model_chat"], "model_tasks": c["model_tasks"], "busy": await zeko.chat_active(),
            "external": c["ext"]["label"] if c["ext"]["enabled"] else None}


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
    lines = [f"Cette conversation porte sur le ticket {zeko_tools.ticket_no(t)} « {t.title} » du client {t.company.name}, "
             f"statut {zeko_tools.STATUS_FR.get(t.status, t.status)}."]
    if t.description:
        lines.append(f"Demande : {t.description[:600]}")
    msgs = [f"- {m.created_at.astimezone(clock.business_tz()).strftime('%m-%d %H:%M')} "
            f"{m.user.full_name if m.user else {'client': 'client', 'zeko': 'Zéko'}.get(m.author_kind, '?')} : {m.body[:400]}" for m in t.messages[-8:] if m.body]
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


async def _setup(user: User):
    """Consigne de base (qui parle, date, IA externe) et outils disponibles."""
    system = SYSTEM + (f" Tu parles avec {user.full_name} ({ROLES.get(str(getattr(user.role, 'value', user.role)), user.role)}"
                       f" chez Simple IP) ; ce n'est pas un client. Aujourd'hui : {_JOURS[clock.today().weekday()]} {clock.today().isoformat()}.")
    ext = (await zeko.config())["ext"]
    if ext["enabled"]:
        system += (f"\n\nTu peux demander l'avis de {ext['label']} (IA externe) pour une question technique générale que tu "
                   f"ne maîtrises pas, ou si on te le demande. Les noms et coordonnées sont retirés automatiquement avant l'envoi. "
                   f"Dis quand une information vient de {ext['label']}.")
    return system, zeko_tools.TOOLS + ([zeko_tools.EXTERNAL_TOOL] if ext["enabled"] else []), ext


async def _turn(s, messages, tool_list, ext, user_id, cid, save, keep_errors=False):
    """Un tour de Zeko : flux du modele, outils (jusqu'a 5 tours), evenements SSE. save(role, content, **kw) garde
    les etapes (conversation personnelle : tout ; ticket : seulement la reponse finale)."""
    partial = ""
    try:
        for _round in range(_MAX_TOOL_ROUNDS + 1):
            partial = ""
            calls = None
            tools = tool_list if _round < _MAX_TOOL_ROUNDS else None
            async for kind, val in zeko.stream_chat(messages, tools=tools, user_id=user_id, conversation_id=cid):
                if kind == "pense":
                    yield _sse({"type": "pense", "texte": val or ""})
                elif kind == "texte":
                    partial += val
                    yield _sse({"type": "texte", "texte": val})
                elif kind == "outils":
                    calls = val
            if not calls:
                await save("assistant", partial)
                partial = None
                yield _sse({"type": "fin"})
                return
            for x in calls:
                x["id"] = x.get("id") or f"call_{uuid.uuid4().hex[:8]}"
            await save("assistant", partial, tool_calls=json.dumps(calls, ensure_ascii=False))
            messages.append({"role": "assistant", "content": partial, "tool_calls": [
                {"id": x["id"], "type": "function", "function": {"name": x["name"], "arguments": x["arguments"]}} for x in calls]})
            for x in calls:
                external = x["name"] == "demander_ia_externe"
                label = f"demande à {ext['label']}" if external else zeko_tools.LABELS.get(x["name"], x["name"])
                yield _sse({"type": "outil", "nom": x["name"], "libelle": label})
                try:
                    args = json.loads(x["arguments"] or "{}")
                except ValueError:
                    args = {}
                if external and ext["enabled"]:
                    try:
                        answer, _sent = await zeko.ask_external(str(args.get("question") or ""), user_id=user_id, conversation_id=cid)
                        result = f"Réponse de {ext['label']} : {answer[:6000]}"
                    except zeko.ZekoUnavailable as e:
                        result = f"{ext['label']} indisponible ({e}) : réponds avec tes propres connaissances et dis-le."
                else:
                    result = await zeko_tools.run(x["name"], args, s, user_id)
                await save("tool", result, tool_call_id=x["id"], tool_name=x["name"])
                messages.append({"role": "tool", "tool_call_id": x["id"], "content": result})
                # la page (demandee, ou le dossier que Zeko vient de creer) s'ouvre dans la fenetre ERPCRM de l'utilisateur
                if '"chemin"' in result:
                    try:
                        page = json.loads(result)
                        if isinstance(page, dict) and page.get("chemin"):
                            yield _sse({"type": "ouvrir", "chemin": page["chemin"], "nom": page.get("ouvert")})
                    except ValueError:
                        pass
            partial = None
    except zeko.ZekoUnavailable as e:
        yield _sse({"type": "erreur", "texte": str(e)})
        if keep_errors:
            await save("assistant", f"⚠ {e}")
    except Exception as e:
        yield _sse({"type": "erreur", "texte": f"Zéko n'a pas pu répondre : {str(e)[:200]}"})
        if keep_errors:
            await save("assistant", f"⚠ Zéko n'a pas pu répondre : {str(e)[:200]}")
    finally:
        if partial:                          # arrete en cours de route : garder ce qui etait ecrit
            try:
                await save("assistant", partial + " … (arrêté)")
            except Exception:
                pass


_RUNNING: set = set()          # reponses en cours dans ce processus (garde une reference aux taches)
BUSY_MAX = 30                  # la reponse en cours se signale toutes les 2 s ; sans signe de vie depuis 30 s, elle est perdue (redemarrage)


def _busy(c: ZekoConversation) -> bool:
    return bool(c.busy_since and (_now() - c.busy_since).total_seconds() < BUSY_MAX)


def _stream(produce, cid=None):
    """Flux SSE d'une reponse. Conversation personnelle (cid) : la reponse se fait dans une tache a part qui continue
    si la fenetre se ferme (TASK-006.7, 2026-10-24 ; avant, la fermer coupait Zeko et sa reponse etait perdue) ;
    seul « Arrêter » (stop_requested) la coupe. Fil de ticket : fermer coupe Zeko, comme avant."""
    q: asyncio.Queue = asyncio.Queue()

    async def release():
        async with AsyncSessionLocal() as s:
            c = await s.get(ZekoConversation, cid)
            if c:
                c.busy_since, c.stop_requested = None, False
                await s.commit()

    async def pump():
        try:
            async for chunk in produce():
                await q.put(chunk)
        finally:
            if cid:                  # libre avant d'annoncer la fin : l'ecran qui recharge ne voit plus « en cours »
                try:
                    await release()
                except Exception:
                    pass
            await q.put(None)

    async def run_detached():
        work = asyncio.create_task(pump())
        try:
            while not work.done():
                await asyncio.wait({work}, timeout=2)
                if work.done():
                    break
                async with AsyncSessionLocal() as s:   # signe de vie, et « Arrêter » demande ?
                    c = await s.get(ZekoConversation, cid)
                    stop = bool(c and c.stop_requested)
                    if c and not stop:
                        c.busy_since = _now()
                        await s.commit()
                if stop:
                    work.cancel()
                    try:
                        await work
                    except BaseException:
                        pass
        finally:
            await release()

    if cid:
        job = asyncio.create_task(run_detached())
        _RUNNING.add(job)
        job.add_done_callback(_RUNNING.discard)

    async def gen():
        # Sur processeur, le modele peut reflechir plus d'une minute avant le premier mot : sans rien envoyer, le
        # serveur web (et Cloudflare) coupent la connexion (504). On envoie tout de suite, puis toutes les 10 s, une
        # ligne de commentaire SSE (ignoree par l'ecran) tant que Zeko n'a rien a dire.
        yield ": ouvert\n\n"
        task = None if cid else asyncio.create_task(pump())
        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=10)
                except asyncio.TimeoutError:
                    yield ": attente\n\n"
                    continue
                if item is None:
                    break
                yield item
        finally:
            if task and not task.done():             # fil de ticket : l'ecran a ferme la connexion, couper Zeko
                task.cancel()
                try:
                    await task
                except BaseException:
                    pass

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/conversations/{cid}/stop", status_code=204)
async def stop_conversation(cid: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """« Arrêter » : le processus qui fait la reponse la coupe (il regarde toutes les 2 s)."""
    c = await _get_conv(db, cid, current_user)
    if _busy(c):
        c.stop_requested = True
        await db.commit()


@router.post("/conversations/{cid}/messages")
async def send_message(cid: uuid.UUID, payload: SendMessage, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    text = payload.content.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Message vide")
    if not await zeko.enabled():
        raise HTTPException(status_code=400, detail="Zéko n'est pas configuré (Administration → Zéko)")
    c = await _get_conv(db, cid, current_user)
    if _busy(c):
        raise HTTPException(status_code=409, detail="Zéko travaille encore sur ta demande précédente.")
    db.add(ZekoMessage(conversation_id=c.id, user_id=current_user.id, role="user", content=text))
    if not c.title:
        c.title = text[:80]
    c.updated_at = _now()
    c.busy_since, c.stop_requested = _now(), False
    await db.commit()
    user_id, ticket_id = current_user.id, c.ticket_id

    async def produce():
        async with AsyncSessionLocal() as s:
            conv = await _get_conv(s, cid, current_user)
            system, tool_list, ext = await _setup(current_user)
            if ticket_id:
                system += "\n\n" + await _ticket_context(s, ticket_id)
            messages = [{"role": "system", "content": system}] + _history(conv)

            async def save(role, content, **kw):
                s.add(ZekoMessage(conversation_id=cid, role=role, content=content, **kw))
                await s.commit()

            async for chunk in _turn(s, messages, tool_list, ext, user_id, cid, save, keep_errors=True):
                yield chunk

    return _stream(produce, cid)


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


@router.get("/external/providers")
async def external_providers(_: User = Depends(get_current_user)):
    return [{"id": k, **v} for k, v in zeko.PROVIDERS.items()]


@router.get("/external/models")
async def external_models(_: User = Depends(get_current_user)):
    """Modeles offerts par l'IA externe configuree (avec sa cle)."""
    import httpx
    e = (await zeko.config(fresh=True))["ext"]
    if not e["key"] or not e["url"]:
        return []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{e['url']}/models", headers={"Authorization": f"Bearer {e['key']}"})
            r.raise_for_status()
            return sorted(m["id"].removeprefix("models/") for m in r.json().get("data", []))
    except Exception as ex:
        raise HTTPException(status_code=502, detail=f"{e['label']} : liste des modèles indisponible ({str(ex)[:150]})")


@router.post("/external/test")
async def external_test(current_user: User = Depends(get_current_user)):
    """Essai reel de l'IA externe (meme si la case n'est pas encore cochee, du moment qu'une cle est enregistree)."""
    import httpx, time as _t
    e = (await zeko.config(fresh=True))["ext"]
    if not e["key"]:
        raise HTTPException(status_code=400, detail="Aucune clé enregistrée")
    t0 = _t.monotonic()
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(f"{e['url']}/chat/completions", headers={"Authorization": f"Bearer {e['key']}"},
                                  json={"model": e["model"], "messages": [{"role": "user", "content": "Réponds seulement : OK"}]})
        if r.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"{e['label']} a répondu {r.status_code} : {r.text[:200]}")
        return {"ok": True, "reponse": r.json()["choices"][0]["message"].get("content", "")[:200], "secondes": round(_t.monotonic() - t0, 1)}
    except httpx.HTTPError as ex:
        raise HTTPException(status_code=502, detail=f"{e['label']} injoignable : {str(ex)[:150]}")


# ── Zeko dans le fil du ticket (TASK-006.5, 2026-10-18) ─────────────────────
# Philippe : « je croyais que le champ de texte des tickets devait être Zéko aussi ». Le technicien ecrit dans le
# ticket ; quand il demande quelque chose a Zeko, la reponse s'ajoute au fil (auteur « zeko »), interne seulement
# (jamais dans le resume envoye au client). L'historique donne au modele = le fil du ticket lui-meme.

def _ticket_history(t: Ticket) -> list[dict]:
    out, size = [], 0
    for m in reversed(t.messages):
        att = f" [{len(m.attachments)} image(s) jointe(s)]" if m.attachments else ""
        if m.author_kind == "zeko":
            d = {"role": "assistant", "content": m.body}
        elif m.author_kind == "client":
            d = {"role": "user", "content": f"(Réponse du client par courriel) {m.body}{att}"}
        else:
            d = {"role": "user", "content": f"{m.user.full_name if m.user else 'Technicien'} : {m.body}{att}"}
        size += len(d["content"])
        if size > _HISTORY_CHARS and out:
            break
        out.append(d)
    out.reverse()
    return out


@router.post("/tickets/{ticket_id}/reply")
async def ticket_reply(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Zeko repond dans le fil du ticket au dernier message du technicien."""
    if not await zeko.enabled():
        raise HTTPException(status_code=400, detail="Zéko n'est pas configuré (Administration → Zéko)")
    if not await db.get(Ticket, ticket_id):
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    user_id = current_user.id

    async def produce():
        async with AsyncSessionLocal() as s:
            t = (await s.execute(select(Ticket).options(
                selectinload(Ticket.company), selectinload(Ticket.messages).selectinload(TicketMessage.user),
                selectinload(Ticket.messages).selectinload(TicketMessage.attachments)).where(Ticket.id == ticket_id))).scalar_one()
            system, tool_list, ext = await _setup(current_user)
            system += (f"\n\nTu es dans le fil du ticket {zeko_tools.ticket_no(t)} « {t.title} » du client {t.company.name} "
                       f"(statut {zeko_tools.STATUS_FR.get(t.status, t.status)}). Le technicien y note son intervention ; réponds à son dernier message. "
                       f"Si c'est une simple note (ce qu'il fait, où il en est), réponds en UNE courte phrase naturelle, sans consulter "
                       f"d'outil (ex. « Parfait, tu es arrivé chez le client. »), avec au besoin une seule suggestion utile. "
                       f"Si c'est une question ou une demande, réponds vraiment, en consultant ERPCRM au besoin. "
                       f"Ce fil est interne : le client ne voit pas tes réponses.")
            if t.description:
                system += f"\nDemande initiale : {t.description[:800]}"
            messages = [{"role": "system", "content": system}] + _ticket_history(t)

            async def save(role, content, **kw):
                if role == "assistant" and content and not kw.get("tool_calls"):
                    s.add(TicketMessage(ticket_id=ticket_id, user_id=None, author_kind="zeko", body=content))
                    await s.commit()

            async for chunk in _turn(s, messages, tool_list, ext, user_id, None, save):
                yield chunk

    return _stream(produce)


# ── Ce que Zeko a appris (TASK-006.5 etape 3) : visible, modifiable, supprimable ─────────────────────────────

class RuleIn(BaseModel):
    description: str | None = None
    is_active: bool | None = None


@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.zeko import ZekoRule
    from app.models.company import Company
    rows = (await db.execute(select(ZekoRule, Company.name, User.full_name).outerjoin(Company, Company.id == ZekoRule.company_id)
                             .outerjoin(User, User.id == ZekoRule.created_by).order_by(ZekoRule.created_at.desc()))).all()
    return [{"id": str(r.id), "kind": r.kind, "company_name": c, "company_id": str(r.company_id) if r.company_id else None,
             "sender_email": r.sender_email, "description": r.description, "is_active": r.is_active, "created_by": u,
             "created_at": r.created_at} for r, c, u in rows]


@router.put("/rules/{rid}")
async def update_rule(rid: uuid.UUID, payload: RuleIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.zeko import ZekoRule
    r = await db.get(ZekoRule, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Introuvable")
    if payload.description is not None and payload.description.strip():
        r.description = payload.description.strip()[:2000]
    if payload.is_active is not None:
        r.is_active = payload.is_active
    await db.commit()
    return {"ok": True}


@router.delete("/rules/{rid}", status_code=204)
async def delete_rule(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.zeko import ZekoRule
    r = await db.get(ZekoRule, rid)
    if r:
        await db.delete(r)
        await db.commit()



# ── Propositions de Zeko : avis de paiement trouves dans les courriels (TASK-042.13) ─────────────────────────

@router.get("/proposals")
async def list_proposals(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.zeko import ZekoProposal, ZekoMailScan
    from app.models.mailbox import MailMessage, Mailbox
    from app.models.bank_account import BankTransaction
    from app.models.company import Company
    from app.core import zeko_payments as zp
    rows = (await db.execute(select(ZekoProposal, MailMessage, BankTransaction, Company.name)
                             .outerjoin(MailMessage, MailMessage.id == ZekoProposal.mail_message_id)
                             .outerjoin(BankTransaction, BankTransaction.id == ZekoProposal.bank_transaction_id)
                             .outerjoin(Company, Company.id == ZekoProposal.company_id)
                             .where(ZekoProposal.status.in_(("proposee", "a_corriger", "sans_depot")))
                             .order_by(ZekoProposal.paid_on.desc().nulls_last()))).all()
    bx = await zp.boxes(db)
    base = select(func.count()).select_from(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(
        func.lower(Mailbox.email).in_(bx), MailMessage.direction == "in",
        func.lower(func.coalesce(MailMessage.from_email, "")).not_in(zp.SKIP_SENDERS))
    total = (await db.execute(base)).scalar_one()
    done = (await db.execute(base.where(MailMessage.id.in_(select(ZekoMailScan.mail_message_id))))).scalar_one()
    found = (await db.execute(select(func.count()).select_from(ZekoMailScan).where(ZekoMailScan.result == "paiement"))).scalar_one()
    return {"boxes": bx, "scanned": done, "total": total, "notices": found, "items": [{
        "id": str(p.id), "status": p.status, "amount": p.amount, "company_id": str(p.company_id) if p.company_id else None, "company_name": c,
        "allocations": json.loads(p.allocations or "[]"), "explanation": p.explanation, "evidence": p.evidence,
        "mail": {"from": m.from_email, "name": m.from_name, "subject": m.subject, "date": m.sent_at, "id": str(m.id)} if m else None,
        "deposit": {"id": str(t.id), "date": t.posted_date, "amount": float(t.amount), "payee": t.payee, "status": t.status,
                    "account_id": str(t.account_id)} if t else None,
    } for p, m, t, c in rows]}


async def _accept(db, p, user_id) -> str | None:
    """Accepte une proposition : tout est revérifié au moment d'accepter. Retourne une erreur, ou None."""
    from app.models.bank_account import BankTransaction
    from app.models.invoice import Invoice
    from app.core.bank_matching import invoice_balances
    from app.api.v1.endpoints import bank
    from decimal import Decimal
    if p.status != "proposee":
        return "Cette proposition n'est pas prête"
    tx = await db.get(BankTransaction, p.bank_transaction_id) if p.bank_transaction_id else None
    if not tx or tx.status != "unclassified":
        return "Le dépôt n'est plus libre"
    allocs = json.loads(p.allocations or "[]")
    settled = await invoice_balances(db, [uuid.UUID(a["invoice_id"]) for a in allocs])
    for a in allocs:
        inv = await db.get(Invoice, uuid.UUID(a["invoice_id"]))
        if not inv or Decimal(str(a["amount"])) > Decimal(inv.total) - Decimal(settled.get(inv.id, 0)) + Decimal("0.004"):
            return f"{a['number']} n'a plus assez de solde"
    if abs(sum(float(a["amount"]) for a in allocs) - float(tx.amount)) > 0.004:
        return "Les montants ne concordent plus avec le dépôt"
    await bank.match_transaction(tx.id, bank.MatchIn(allocations=[bank.AllocIn(invoice_id=uuid.UUID(a["invoice_id"]), amount=float(a["amount"])) for a in allocs],
                                                     remember_payee=False), db, None)
    p.status, p.decided_by, p.decided_at = "acceptee", user_id, datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/proposals/{pid}/accept")
async def accept_proposal(pid: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.zeko import ZekoProposal
    p = await db.get(ZekoProposal, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    err = await _accept(db, p, current_user.id)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {"ok": True}


@router.post("/proposals/accept-all")
async def accept_all(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.zeko import ZekoProposal
    ok, errors = 0, []
    for p in (await db.execute(select(ZekoProposal).where(ZekoProposal.status == "proposee"))).scalars().all():
        err = await _accept(db, p, current_user.id)
        if err:
            await db.rollback()
            errors.append(err)
        else:
            ok += 1
    return {"accepted": ok, "errors": errors}


@router.post("/proposals/{pid}/refuse")
async def refuse_proposal(pid: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.zeko import ZekoProposal
    p = await db.get(ZekoProposal, pid)
    if not p:
        raise HTTPException(status_code=404, detail="Proposition introuvable")
    p.status, p.decided_by, p.decided_at = "refusee", current_user.id, datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.post("/proposals/recheck")
async def recheck_proposals(_: User = Depends(get_current_user)):
    from app.core import zeko_payments as zp
    return {"changed": await zp.recheck_all()}
