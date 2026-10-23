"""Conversations enregistrees (TASK-055 etape 3, 2026-10-23) : son dans storage/conversations/<id>.<ext> (envoye
par morceaux pendant l'enregistrement : une page fermee par erreur garde ce qui a deja ete recu), puis transcription
et voix reconnues par le poller (un seul processus, une conversation a la fois, la plus vieille d'abord).

Qui parle : chaque phrase recoit l'empreinte de sa voix ; elle est comparee aux voix connues (utilisateurs, et
contacts de la compagnie du ticket) ; sinon regroupee avec les autres voix inconnues de la conversation (« Client 1 »,
« Client 2 »). Dire « Client 1 = Jean-Francois » renomme ses phrases et apprend sa voix pour la prochaine fois."""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import numpy as np
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.core import speech, voices
from app.core.database import AsyncSessionLocal
from app.models.contact_company import ContactCompany
from app.models.conversation import Conversation, ConversationSegment, VoicePrint
from app.models.ticket import Ticket
from app.models.user import User

log = logging.getLogger("conversations")

DIR = Path(__file__).resolve().parents[2] / "storage" / "conversations"
EXT = {"audio/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".mp4"}
STALE = timedelta(minutes=15)       # enregistrement sans nouveau morceau depuis 15 min : la page a ete fermee


def path_of(conv: Conversation) -> Path:
    return DIR / f"{conv.id}{EXT.get(conv.mime, '.webm')}"


def append(conv: Conversation, data: bytes) -> None:
    DIR.mkdir(parents=True, exist_ok=True)
    with open(path_of(conv), "ab") as f:
        f.write(data)


def remove_file(conv: Conversation) -> None:
    path_of(conv).unlink(missing_ok=True)


def contact_name(c) -> str:
    return f"{c.first_name} {c.last_name}".strip()


async def _known_voices(db, ticket: Ticket) -> list[tuple]:
    """(empreinte, user, contact) : les utilisateurs, les contacts de la compagnie du ticket et les employes."""
    rows = (await db.execute(select(VoicePrint, User).join(User, User.id == VoicePrint.user_id))).all()
    known = [(np.array(vp.embedding), u, None) for vp, u in rows]
    from app.models.contact import Contact
    from app.models.employee import Employee     # contacts du client, et employes sans compte
    of_client = select(ContactCompany.contact_id).where(ContactCompany.company_id == ticket.company_id)
    rows = (await db.execute(select(VoicePrint, Contact).join(Contact, Contact.id == VoicePrint.contact_id)
                             .where(Contact.id.in_(of_client) | Contact.id.in_(select(Employee.contact_id))))).all()
    return known + [(np.array(vp.embedding), None, c) for vp, c in rows]


WINDOW, HOP = 1.5, 0.75     # qui parle : une empreinte par fenetre de 1,5 s, puis chaque mot prend la voix de sa fenetre
QUIET = 0.0005


def _clusters(E: np.ndarray) -> list[int]:
    """Groupe les fenetres par voix, entre elles (meme micro, meme piece : seule la voix les distingue). Mesure
    2026-10-23 : meme voix 0,60-0,83 d'une fenetre a l'autre, voix differentes 0,26-0,40 -> seuil 0,5 sur la
    moyenne des ressemblances avec les fenetres du groupe (jamais sur un centre, qui ressemble a tout)."""
    M = E @ E.T
    groups: list[list[int]] = []
    for i in range(len(E)):
        scores = [M[i, g].mean() for g in groups]
        if scores and max(scores) >= voices.SAME:
            groups[int(np.argmax(scores))].append(i)
        else:
            groups.append([i])
    merged = True
    while merged and len(groups) > 1:      # deux groupes de la meme voix (debut hesitant) : reunis
        merged = False
        best = max(((M[np.ix_(x, y)].mean(), i, j) for i, x in enumerate(groups) for j, y in enumerate(groups) if i < j), default=None)
        if best and best[0] >= voices.SAME:
            _, i, j = best
            groups[i] += groups.pop(j)
            merged = True
    big = [g for g in groups if len(g) >= 3]       # 1-2 fenetres seules : bruit, rattachees a la voix la plus proche
    for g in groups:
        if len(g) < 3 and big:
            for i in g:
                max(big, key=lambda h: M[i, h].mean()).append(i)
    groups = big or groups
    label = [0] * len(E)
    for k, g in enumerate(groups):
        for i in g:
            label[i] = k
    return label


KNOWN = 0.6     # une voix du groupe ressemble a une voix connue (meme a travers un autre micro)


def _windows(audio: np.ndarray, known: list[tuple]) -> list[dict]:
    wins, t, total = [], 0.0, len(audio) / voices.RATE
    while t < total:
        a = audio[int(t * voices.RATE):int(min(t + WINDOW, total) * voices.RATE)]
        if len(a) >= voices.RATE // 2 and np.abs(a).mean() > QUIET:
            wins.append({"mid": t + WINDOW / 2, "emb": voices.embed(a)})
        t += HOP
    if not wins:
        return []
    E = np.array([w["emb"] for w in wins])
    label = _clusters(E)
    n = max(label) + 1
    # chaque groupe recoit la voix connue qui lui ressemble le plus (une voix connue = un seul groupe)
    pairs = sorted(((float(np.mean([E[i] @ voices._norm(k[0]) for i in range(len(E)) if label[i] == g])), g, ki)
                    for g in range(n) for ki, k in enumerate(known)), reverse=True)
    who, used = {}, set()
    for score, g, ki in pairs:
        if score >= KNOWN and g not in who and ki not in used:
            who[g] = known[ki]
            used.add(ki)
    order = sorted({g for g in label if g not in who}, key=label.index)    # Client 1 = le premier a parler
    for w, g in zip(wins, label):
        if g in who:
            _, w["user"], w["contact"] = who[g]
            w["speaker"] = w["user"].full_name if w["user"] else contact_name(w["contact"])
        else:
            w["user"] = w["contact"] = None
            w["speaker"] = f"Client {order.index(g) + 1}"
    for i in range(1, len(wins) - 1):     # une fenetre isolee entre deux du meme : bruit, on suit les voisines
        p, w, nx = wins[i - 1], wins[i], wins[i + 1]
        if p["speaker"] == nx["speaker"] != w["speaker"]:
            w["speaker"], w["user"], w["contact"] = p["speaker"], p["user"], p["contact"]
    return wins


def assign_speakers(words: list[dict], audio: np.ndarray, known: list[tuple]) -> list[dict]:
    """Tours de parole : mots consecutifs de la meme voix (et de la meme phrase), avec l'empreinte de cette voix."""
    wins = _windows(audio, known)
    turns, prev = [], None
    for wd in words:
        mid = (wd["start"] + wd["end"]) / 2
        w = min(wins, key=lambda x: abs(x["mid"] - mid), default=None)
        who = (w["speaker"], w["user"], w["contact"]) if w and abs(w["mid"] - mid) <= WINDOW else (prev or ("Inconnu", None, None))
        cur = turns[-1] if turns else None
        if cur and cur["seg"] == wd["seg"] and not wd["word"].startswith(" "):
            who = (cur["speaker"], cur["user"], cur["contact"])       # suite du mot (« aujourd » + « 'hui »)
        if cur and cur["speaker"] == who[0] and cur["seg"] == wd["seg"]:
            cur["end"], cur["text"] = wd["end"], cur["text"] + wd["word"]
        else:
            turns.append({"start": wd["start"], "end": wd["end"], "text": wd["word"], "seg": wd["seg"],
                          "speaker": who[0], "user": who[1], "contact": who[2]})
        prev = who
    # Frontieres : une empreinte couvre 1,5 s, un changement de voix est donc flou d'environ 1 s. Dans une meme phrase,
    # un bout de moins de 2 s attribue a une autre voix rejoint sa voisine la plus longue (« merci d'avoir appele »
    # n'est pas coupe en deux personnes) ; une vraie replique de 2 s ou plus reste a part.
    def dur(t):
        return t["end"] - t["start"]
    changed = True
    while changed:
        changed = False
        for i, t in enumerate(turns):
            nb = [j for j in (i - 1, i + 1) if 0 <= j < len(turns) and turns[j]["seg"] == t["seg"]]
            if nb and dur(t) < 2.0:
                j = max(nb, key=lambda j: dur(turns[j]))
                o = turns[j]
                if j < i:
                    o["end"], o["text"] = t["end"], o["text"] + t["text"]
                else:
                    o["start"], o["text"] = t["start"], t["text"] + o["text"]
                turns.pop(i)
                changed = True
                break
    merged = []
    for t in turns:
        if merged and merged[-1]["seg"] == t["seg"] and merged[-1]["speaker"] == t["speaker"]:
            merged[-1]["end"], merged[-1]["text"] = t["end"], merged[-1]["text"] + t["text"]
        else:
            merged.append(t)
    turns = merged
    for t in turns:
        t["text"] = t["text"].strip()
        embs = [w["emb"] for w in wins if w["speaker"] == t["speaker"] and t["start"] - HOP <= w["mid"] <= t["end"] + HOP]
        t["embedding"] = voices._norm(np.mean(embs, axis=0)).tolist() if embs else None
    return [t for t in turns if t["text"]]


async def process(conv_id) -> None:
    async with AsyncSessionLocal() as db:
        conv = await db.get(Conversation, conv_id, options=[selectinload(Conversation.ticket)])
        path = path_of(conv)
        try:
            if not path.exists() or path.stat().st_size == 0:
                raise RuntimeError("Aucun son reçu.")
            result = await speech.transcribe_segments(str(path))
            audio = await asyncio.to_thread(voices.load_audio, str(path))
            known = await _known_voices(db, conv.ticket)
            segs = await asyncio.to_thread(assign_speakers, result["words"], audio, known)
            await db.execute(delete(ConversationSegment).where(ConversationSegment.conversation_id == conv.id))   # refaite
            for i, s in enumerate(segs):
                db.add(ConversationSegment(conversation_id=conv.id, idx=i, start=s["start"], end=s["end"], text=s["text"],
                                           speaker=s["speaker"][:100], embedding=s["embedding"],
                                           user_id=s["user"].id if s["user"] else None,
                                           contact_id=s["contact"].id if s["contact"] else None))
            conv.duration = result["duration"]
            conv.text = "\n".join(f"{s['speaker']} : {s['text']}" for s in segs)
            conv.status, conv.error = "done", None
            conv.transcribed_at = datetime.now(timezone.utc)
        except Exception as e:
            log.exception("Transcription de la conversation %s echouee", conv_id)
            conv.status, conv.error = "error", str(e)[:500]
        await db.commit()


async def learn(db, conv: Conversation, label: str, user: User | None, contact) -> int:
    """« Client 1 = Jean-Francois » : renomme ses phrases dans cette conversation et apprend (affine) sa voix."""
    segs = [s for s in conv.segments if s.speaker == label]
    for s in segs:
        s.speaker = (user.full_name if user else contact_name(contact))[:100]
        s.user_id, s.contact_id = (user.id if user else None), (contact.id if contact else None)
    embs = [s.embedding for s in segs if s.embedding]
    if embs:
        q = select(VoicePrint).where(VoicePrint.user_id == user.id) if user else select(VoicePrint).where(VoicePrint.contact_id == contact.id)
        vp = (await db.execute(q)).scalar_one_or_none()
        if vp:
            vp.embedding, vp.samples = voices.merge(vp.embedding, vp.samples, embs)
        else:
            emb, n = voices.merge(embs[0], 0, embs)
            db.add(VoicePrint(user_id=user.id if user else None, contact_id=contact.id if contact else None, embedding=emb, samples=n))
    conv.text = "\n".join(f"{s.speaker} : {s.text}" for s in conv.segments)
    return len(segs)


async def _next(db):
    now = datetime.now(timezone.utc)
    # page fermee pendant l'enregistrement : on transcrit ce qui a ete recu
    await db.execute(update(Conversation).where(Conversation.status == "recording",
                                                Conversation.last_chunk_at < now - STALE).values(status="pending"))
    await db.commit()
    return (await db.execute(select(Conversation.id).where(Conversation.status == "pending")
                             .order_by(Conversation.started_at).limit(1))).scalar_one_or_none()


async def run_conversation_poller():
    await asyncio.sleep(20)
    async with AsyncSessionLocal() as db:   # un seul processus tient ce poller : une transcription coupee reprend
        await db.execute(update(Conversation).where(Conversation.status == "transcribing").values(status="pending"))
        await db.commit()
    while True:
        try:
            async with AsyncSessionLocal() as db:
                cid = await _next(db)
                if cid:
                    await db.execute(update(Conversation).where(Conversation.id == cid)
                                     .values(status="transcribing", claimed_at=datetime.now(timezone.utc)))
                    await db.commit()
            if cid:
                await process(cid)
                continue
        except Exception:
            log.exception("Iteration des conversations echouee")
        await asyncio.sleep(10)
