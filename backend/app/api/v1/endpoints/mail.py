"""Boite de reception dans ERPCRM (TASK-047.2, 2026-10-09) ; repondre et ecrire d'ici (TASK-047.3, envoi : core/mail_send.py).

Copie : app/services/mail_sync.py ; classement automatique : app/core/mail_match.py.
Qui voit quoi : les boites partagees (service@, facturation@, portabilite@) -> toute l'equipe ; une boite personnelle
(philippe@) -> son proprietaire, le patron (mbx.sees_all), et l'equipe pour les courriels qu'il a partages.
"""
import asyncio
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import mail_junk, mail_match, mail_send, mail_store
from app.core import mailboxes as mbx
from app.core import zeko
from app.core.database import get_db
from app.models.company import Company
from app.models.contact import Contact
from app.models.mailbox import Mailbox, MailBlock, MailMessage
from app.models.user import User

router = APIRouter()


def _visible(user: User):
    """Condition SQL : courriels que cet utilisateur peut voir."""
    if mbx.sees_all(user):
        return Mailbox.kind.in_(("shared", "personal"))
    return or_(Mailbox.kind == "shared",
               and_(Mailbox.kind == "personal", or_(Mailbox.owner_user_id == user.id, MailMessage.shared.is_(True))))


async def _get(db, mid: uuid.UUID, user: User) -> MailMessage:
    row = (await db.execute(select(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id)
                            .where(MailMessage.id == mid, _visible(user)))).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Courriel introuvable")
    return row


async def _users(db, ids) -> dict:
    ids = {i for i in ids if i}
    return dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))).all()) if ids else {}


async def _names(db, rows) -> tuple[dict, dict]:
    cids = {r.company_id for r in rows if r.company_id}
    pids = {r.contact_id for r in rows if r.contact_id}
    companies = dict((await db.execute(select(Company.id, Company.name).where(Company.id.in_(cids)))).all()) if cids else {}
    contacts = {i: f"{f} {l}".strip() for i, f, l in (await db.execute(
        select(Contact.id, Contact.first_name, Contact.last_name).where(Contact.id.in_(pids)))).all()} if pids else {}
    return companies, contacts


def _row(m: MailMessage, box: Mailbox, companies: dict, contacts: dict) -> dict:
    return {"id": str(m.id), "mailbox_id": str(m.mailbox_id), "mailbox": box.email, "personal": box.kind == "personal",
            "from_email": m.from_email, "from_name": m.from_name, "subject": m.subject, "sent_at": m.sent_at,
            "snippet": (m.body_text or "")[:160].replace("\n", " "), "is_read": m.is_read,
            "has_attachments": bool(m.attachments), "company_id": str(m.company_id) if m.company_id else None,
            "company_name": companies.get(m.company_id), "contact_id": str(m.contact_id) if m.contact_id else None,
            "contact_name": contacts.get(m.contact_id), "classified_by": m.classified_by,
            "contact_created": m.contact_created, "shared": m.shared,
            "ticket_id": str(m.ticket_id) if m.ticket_id else None, "task_id": str(m.task_id) if m.task_id else None,
            "direction": m.direction, "to_addrs": m.to_addrs, "answered_at": m.answered_at, "copy_error": m.copy_error,
            "zeko_rdv_pending": bool(m.zeko_rdv_proposal and m.zeko_rdv_proposal.get("status") == "pending"),
            "junk_at": m.junk_at, "junk_error": m.junk_error}


@router.get("/folders")
async def folders(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Boites que l'utilisateur voit, avec le nombre de non lus ; et le nombre « A classer »."""
    base = select(MailMessage.mailbox_id, func.count(), func.count().filter(MailMessage.is_read.is_(False))) \
        .join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(_visible(user), MailMessage.junk_at.is_(None)) \
        .group_by(MailMessage.mailbox_id)
    counts = {mid: (n, u) for mid, n, u in (await db.execute(base)).all()}
    boxes = (await db.execute(select(Mailbox).where(Mailbox.kind.in_(("shared", "personal"))).order_by(Mailbox.kind.desc(), Mailbox.email))).scalars().all()
    out = []
    for b in boxes:
        if "tickets" in (b.functions or []):
            continue
        if b.kind == "personal" and not mbx.sees_all(user) and b.owner_user_id != user.id and b.id not in counts:
            continue
        n, u = counts.get(b.id, (0, 0))
        out.append({"id": str(b.id), "email": b.email, "personal": b.kind == "personal",
                    "mine": b.owner_user_id == user.id, "total": n, "unread": u, "is_active": b.is_active,
                    "last_sync_at": b.last_sync_at, "sync_error": b.sync_error, "has_password": bool(b.password_enc)})
    unclassified = (await db.execute(select(func.count()).select_from(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id)
                                     .where(_visible(user), MailMessage.junk_at.is_(None), MailMessage.company_id.is_(None),
                                            MailMessage.contact_id.is_(None)))).scalar()
    junk = (await db.execute(select(func.count()).select_from(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id)
                             .where(_visible(user), MailMessage.junk_at.is_not(None)))).scalar()
    return {"folders": out, "unclassified": unclassified, "junk": junk}


@router.get("")
async def list_mail(mailbox_id: uuid.UUID | None = None, view: str = Query("all", pattern="^(all|unread|unclassified|junk)$"),
                    company_id: uuid.UUID | None = None, contact_id: uuid.UUID | None = None, q: str | None = None,
                    direction: str | None = Query(None, pattern="^(in|out)$"),
                    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    qry = select(MailMessage, Mailbox).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(_visible(user))
    # TASK-047.7 : « A jeter » n'apparait nulle part ailleurs que dans son dossier
    qry = qry.where(MailMessage.junk_at.is_not(None) if view == "junk" else MailMessage.junk_at.is_(None))
    if mailbox_id:
        qry = qry.where(MailMessage.mailbox_id == mailbox_id)
    if direction:
        qry = qry.where(MailMessage.direction == direction)
    if view == "unread":
        qry = qry.where(MailMessage.is_read.is_(False))
    elif view == "unclassified":
        qry = qry.where(MailMessage.company_id.is_(None), MailMessage.contact_id.is_(None))
    if company_id:
        qry = qry.where(MailMessage.company_id == company_id)
    if contact_id:
        qry = qry.where(MailMessage.contact_id == contact_id)
    if q and q.strip():
        pat = f"%{q.strip()}%"
        qry = qry.where(or_(MailMessage.subject.ilike(pat), MailMessage.from_email.ilike(pat), MailMessage.to_addrs.ilike(pat),
                            MailMessage.from_name.ilike(pat), MailMessage.body_text.ilike(pat)))
    total = (await db.execute(select(func.count()).select_from(qry.subquery()))).scalar()
    rows = (await db.execute(qry.order_by(MailMessage.sent_at.desc().nulls_last(), MailMessage.created_at.desc())
                             .limit(limit).offset(offset))).all()
    companies, contacts = await _names(db, [m for m, _ in rows])
    users = await _users(db, [m.sent_by_user_id for m, _ in rows])
    return {"total": total, "items": [{**_row(m, b, companies, contacts), "sent_by": users.get(m.sent_by_user_id)} for m, b in rows]}


async def _senders(db, user: User) -> list:
    """Boites d'ou cet utilisateur peut envoyer : les partagees, et sa boite personnelle (jamais celle d'un autre, meme
    pour le patron). Pas support@ (ses courriels partent des tickets) ni nepasrepondre@ (annonces, etape 4)."""
    rows = await mbx.active(db)
    return [b for b in rows if "tickets" not in (b.functions or [])
            and (b.kind == "shared" or (b.kind == "personal" and b.owner_user_id == user.id))]


@router.get("/senders")
async def senders(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.core import signature
    boxes = await _senders(db, user)
    return {"boxes": [{"id": str(b.id), "email": b.email, "name": b.display_name, "personal": b.kind == "personal"} for b in boxes],
            "has_signature": bool(await signature.for_user(db, user.id))}


class SendIn(BaseModel):
    mailbox_id: uuid.UUID
    to: str
    cc: str | None = None
    subject: str = ""
    html: str = ""
    mode: str = "new"                       # new | reply | reply_all | forward
    source_id: uuid.UUID | None = None      # courriel auquel on repond / qu'on transfere
    forward_attachments: list[int] = []     # pieces jointes du courriel d'origine a renvoyer
    with_signature: bool = True
    company_id: uuid.UUID | None = None     # ecrit depuis une fiche : classe dans cette fiche
    contact_id: uuid.UUID | None = None


@router.post("/send")
async def send(data: str = Form(...), files: list[UploadFile] = File(default=[]),
               db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Envoie de la boite choisie, avec la signature de l'employe et le courriel d'origine cite ; copie dans Envoyes
    de la boite, courriel d'origine marque « repondu » ; copie gardee ici, classee dans la fiche du client."""
    from app.core import signature
    try:
        p = SendIn.model_validate_json(data)
    except ValueError:
        raise HTTPException(status_code=422, detail="Courriel incomplet")
    if p.mode not in ("new", "reply", "reply_all", "forward"):
        raise HTTPException(status_code=422, detail="Mode inconnu")
    box = next((b for b in await _senders(db, user) if b.id == p.mailbox_id), None)
    if not box:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas envoyer de cette boîte")
    try:
        to, cc = mail_send.addresses(p.to), mail_send.addresses(p.cc)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if not to:
        raise HTTPException(status_code=422, detail="Indiquez au moins un destinataire")
    src = await _get(db, p.source_id, user) if p.source_id else None
    html = p.html or ""
    if p.with_signature:
        sig = await signature.for_user(db, user.id)
        if sig:
            html += f'<div style="margin-top:14px">{signature._email_friendly(sig)}</div>'
    if src and p.mode != "new":
        html += mail_send.quote_html(src)
    attach = [(f.filename or "piece", await f.read(), f.content_type or "application/octet-stream") for f in files]
    if src and p.mode == "forward":
        for a in src.attachments or []:
            if a.get("i") in p.forward_attachments and Path(src.stored_path).is_file():
                name, ctype, content = mail_store.attachment(src.stored_path, a["i"])
                attach.append((name, content, ctype))
    if sum(len(c) for _, c, _ in attach) > mail_send.MAX_TOTAL:
        raise HTTPException(status_code=413, detail="Pièces jointes trop lourdes (20 Mo au total)")
    replying = src is not None and p.mode in ("reply", "reply_all")
    raw, _mid = mail_send.build(sender=box.email, sender_name=box.display_name or "", to=to, cc=cc,
                                subject=p.subject.strip() or "(sans objet)", html_body=html, files=attach,
                                in_reply_to=src.message_id if replying else None,
                                references=mail_send.references_of(src.stored_path) if replying else None)
    boxd = {"host": box.host, "port": box.imap_port, "smtp_port": box.smtp_port, "user": box.username,
            "password": mbx.password_of(box), "email": box.email}
    try:
        await asyncio.wait_for(asyncio.to_thread(mail_send.send_sync, boxd, raw, [a for _, a in to + cc]), 90)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Envoi impossible : {exc}")

    # envoye : copie gardee ici et classee (fiche d'ou on ecrit > fiche du courriel d'origine > adresse connue)
    company_id, contact_id, how = p.company_id, p.contact_id, "manual" if (p.company_id or p.contact_id) else None
    if p.contact_id and not p.company_id:
        company_id = await mail_match._company_of_contact(db, p.contact_id)
    if not how and src and (src.company_id or src.contact_id):
        company_id, contact_id, how = src.company_id, src.contact_id, src.classified_by or "auto"
    if not how:
        for _, a in to + cc:
            c_id, p_id = await mail_match.by_address(db, a.lower())
            if c_id or p_id:
                company_id, contact_id, how = c_id, p_id, "auto"
                break
    msg = MailMessage(mailbox_id=box.id, direction="out", stored_path=mail_send.save_sent(box.id, raw), is_read=True,
                      sent_by_user_id=user.id, company_id=company_id, contact_id=contact_id, classified_by=how,
                      **mail_store.parse(raw))
    db.add(msg)
    await db.flush()
    if msg.contact_id and not msg.company_id:            # TASK-047.4 : plusieurs compagnies -> fil, puis contenu
        msg.company_id = await mail_match.company_for_contact(db, msg, msg.contact_id)
    if replying:
        src.answered_at = mail_store.now()
    await db.commit()
    try:
        same = replying and src.mailbox_id == box.id
        await asyncio.wait_for(asyncio.to_thread(mail_send.after_send_sync, boxd, raw,
                                                 src.uid if same else None, src.uidvalidity if same else None), 60)
    except Exception as exc:
        msg.copy_error = (str(exc) or exc.__class__.__name__)[:500]
        await db.commit()
    companies, contacts = await _names(db, [msg])
    return {**_row(msg, box, companies, contacts), "sent_by": user.full_name}


async def _set_seen(db, m: MailMessage, seen: bool) -> None:
    """Lu/non lu ici ET dans la boite (Outlook, cellulaire) ; boite injoignable -> ecrit au prochain passage."""
    if m.is_read == seen and not m.flag_pending:
        return
    m.is_read, m.flag_pending = seen, True
    await db.commit()
    box = await db.get(Mailbox, m.mailbox_id)
    try:
        if box.uidvalidity == m.uidvalidity and box.password_enc:
            await asyncio.wait_for(asyncio.to_thread(mail_store.set_seen_sync, {
                "host": box.host, "port": box.imap_port, "user": box.username, "password": mbx.password_of(box)}, m.uid, seen), 20)
            m.flag_pending = False
            await db.commit()
    except Exception:
        pass


# ── Liste noire -> « A jeter » (TASK-047.7, core/mail_junk.py) ──────────────────────────────────────────────────

class BlockIn(BaseModel):
    pattern: str


async def _blocks_out(db) -> list:
    rows = (await db.execute(select(MailBlock).order_by(MailBlock.pattern))).scalars().all()
    junk = (await db.execute(select(MailMessage.from_email).where(MailMessage.junk_at.is_not(None)))).scalars().all()
    pats = [b.pattern for b in rows]
    count = {}
    for addr in junk:
        p = mail_junk.match(addr, pats)
        count[p] = count.get(p, 0) + 1
    return [{"id": str(b.id), "pattern": b.pattern, "created_at": b.created_at, "count": count.get(b.pattern, 0)} for b in rows]


@router.get("/blocklist")
async def get_blocklist(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return {"items": await _blocks_out(db)}


async def _add_block(db, pattern: str, user: User) -> int:
    try:
        p = mail_junk.normalize(pattern)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if (await db.execute(select(MailBlock.id).where(MailBlock.pattern == p))).first():
        raise HTTPException(status_code=409, detail=f"« {p} » est déjà dans la liste noire")
    db.add(MailBlock(pattern=p, created_by_user_id=user.id))
    return await mail_junk.block(db, p)


@router.post("/blocklist", status_code=201)
async def add_blocklist(p: BlockIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    moved = await _add_block(db, p.pattern, user)
    await db.commit()
    return {"items": await _blocks_out(db), "moved": moved}


@router.delete("/blocklist/{bid}")
async def remove_blocklist(bid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await db.get(MailBlock, bid)
    if not b:
        raise HTTPException(status_code=404, detail="Introuvable dans la liste noire")
    remaining = [x for x in await mail_junk.patterns(db) if x != b.pattern]
    back = await mail_junk.unblock(db, b.pattern, remaining)
    await db.delete(b)
    await db.commit()
    return {"items": await _blocks_out(db), "restored": back}


@router.put("/{mid}/block")
async def block_sender(mid: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Bouton « Mettre en liste noire » d'un courriel recu : son expediteur, et tous ses courriels -> « A jeter »."""
    m = await _get(db, mid, user)
    if m.direction == "out" or not m.from_email:
        raise HTTPException(status_code=422, detail="Seul un courriel reçu peut mettre son expéditeur en liste noire")
    hit = mail_junk.match(m.from_email, await mail_junk.patterns(db))
    if hit:
        raise HTTPException(status_code=409, detail=f"Déjà dans la liste noire (« {hit} »)")
    moved = await _add_block(db, m.from_email, user)
    await db.commit()
    companies, contacts = await _names(db, [m])
    return {**_row(m, await db.get(Mailbox, m.mailbox_id), companies, contacts), "moved": moved}


@router.get("/{mid}")
async def get_mail(mid: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    m = await _get(db, mid, user)
    box = await db.get(Mailbox, m.mailbox_id)
    await _set_seen(db, m, True)
    companies, contacts = await _names(db, [m])
    out = _row(m, box, companies, contacts)
    if m.junk_at:                            # TASK-047.7 : quel element de la liste noire l'a mis « A jeter »
        hit = mail_junk.match(m.from_email, await mail_junk.patterns(db))
        bid = (await db.execute(select(MailBlock.id).where(MailBlock.pattern == hit))).scalar() if hit else None
        out["junk_block"] = {"id": str(bid), "pattern": hit} if bid else None
    replies = (await db.execute(select(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(
        MailMessage.direction == "out", MailMessage.in_reply_to == m.message_id, _visible(user))
        .order_by(MailMessage.sent_at))).scalars().all() if m.message_id else []
    users = await _users(db, [m.sent_by_user_id] + [r.sent_by_user_id for r in replies])
    own = {box.email.lower()}                # « Repondre a tous » : pas a la boite qui a recu le courriel
    out.update({"to_addrs": m.to_addrs, "cc_addrs": m.cc_addrs, "body_text": m.body_text, "body_html": m.body_html,
                "attachments": m.attachments, "can_share": box.kind == "personal" and (box.owner_user_id == user.id or mbx.sees_all(user)),
                "sent_by": users.get(m.sent_by_user_id), **mail_send.reply_targets(m.stored_path, m.direction == "out", own),
                "replies": [{"id": str(r.id), "sent_at": r.sent_at, "to_addrs": r.to_addrs, "sent_by": users.get(r.sent_by_user_id)} for r in replies]})
    # TASK-047.4 : contact a plusieurs compagnies, compagnie pas trouvee -> popup a la lecture (sauf « plus tard »)
    choices = await mail_match.contact_companies(db, m.contact_id) if m.contact_id and not m.company_id and not m.company_ask_later else []
    out["company_choices"] = [{"id": str(i), "name": n} for i, n in choices] if len(choices) > 1 else []
    out["zeko_rdv_proposal"] = await _proposal_view(db, m, user)
    return out


async def _responsable(db, prop: dict, user: User) -> str:
    """Qui n'est pas disponible : l'employe assigne au ticket du RDV, sinon celui qui confirme."""
    uid = (prop.get("rdv") or {}).get("assigned_to_id")
    u = await db.get(User, uuid.UUID(uid)) if uid else None
    return ((u or user).full_name or "").split(" ")[0] or "Notre technicien"


async def _proposal_view(db, m: MailMessage, user: User) -> dict | None:
    prop = m.zeko_rdv_proposal
    if not prop:
        return None
    view = dict(prop)
    if view.get("text"):
        view["text"] = view["text"].replace("{responsable}", await _responsable(db, prop, user))
    return view


class ZekoRdvIn(BaseModel):
    action: str                    # apply | dismiss
    text: str | None = None        # courriel au client, corrige a l'ecran


@router.put("/{mid}/zeko-rdv")
async def zeko_rdv(mid: uuid.UUID, p: ZekoRdvIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """TASK-026.6 : Philippe confirme (ou ignore) ce que Zeko a prepare -- deplacer le RDV ou ecrire au client."""
    from app.core import google_calendar
    from app.core.zeko_mail import fr_when
    m = await _get(db, mid, user)
    prop = dict(m.zeko_rdv_proposal or {})
    if prop.get("status") != "pending":
        raise HTTPException(status_code=409, detail="Cette proposition de Zéko est déjà traitée")
    if p.action == "dismiss":
        prop["status"] = "dismissed"
    elif p.action == "apply" and prop.get("kind") == "move":
        r = prop["rdv"]
        ok = await google_calendar.update_event(db, r["calendar_id"], r["event_id"], r["title"], r.get("description") or "",
                                                r.get("location"), datetime.fromisoformat(prop["new_start"]), datetime.fromisoformat(prop["new_end"]))
        if not ok:
            raise HTTPException(status_code=502, detail="L'agenda Google n'a pas accepté le changement")
        prop.update(status="applied", result=f"RDV déplacé au {fr_when(datetime.fromisoformat(prop['new_start']))}")
    elif p.action == "apply" and prop.get("kind") == "email":
        from app.core.zeko_mail import replies_blocked
        blocked = await replies_blocked(db, await db.get(Contact, m.contact_id) if m.contact_id else None)
        if blocked:                       # TASK-026.9 : reglage ou refus change depuis la proposition
            raise HTTPException(status_code=409, detail=blocked)
        text = (p.text or (await _proposal_view(db, m, user))["text"]).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Le courriel est vide")
        sent = await _send_reply(db, user, m, prop["to"], prop["subject"], text)
        prop.update(status="applied", result=f"Courriel envoyé de {sent} à {prop['to']}", sent_text=text)
    elif p.action == "apply":
        prop["status"] = "applied"
    else:
        raise HTTPException(status_code=422, detail="Action inconnue")
    m.zeko_rdv_proposal = prop
    await db.commit()
    return await _proposal_view(db, m, user)


async def _send_reply(db, user: User, src: MailMessage, to_addr: str, subject: str, text: str) -> str:
    """Reponse de Zeko dans le fil du courriel du client, envoyee de la boite qui l'a recu (sinon une boite partagee) ;
    copie gardee ici et classee comme le courriel d'origine. Meme envoi que /send."""
    import html as _html
    boxes = await _senders(db, user)
    box = next((b for b in boxes if b.id == src.mailbox_id), None) or next((b for b in boxes if b.kind == "shared"), None)
    if not box:
        raise HTTPException(status_code=403, detail="Aucune boîte d'envoi disponible")
    from app.core.zeko_mail import optout_url
    body = "<div>" + _html.escape(text).replace("\n", "<br>") + "</div>"
    if src.contact_id:                     # TASK-026.9 : toujours present, jamais retirable a l'ecran
        url = optout_url(src.contact_id)
        body += ('<p style="font-size:12px;color:#666;margin-top:18px">Vous ne voulez plus que Zéko, l\'IA de Simple IP, vous réponde ? '
                 f'<a href="{url}">Cliquez ce lien</a> (se désinscrire).</p>')
    body += mail_send.quote_html(src)
    raw, _mid = mail_send.build(sender=box.email, sender_name=box.display_name or "", to=mail_send.addresses(to_addr), cc=[],
                                subject=subject, html_body=body, files=[], in_reply_to=src.message_id,
                                references=mail_send.references_of(src.stored_path))
    boxd = {"host": box.host, "port": box.imap_port, "smtp_port": box.smtp_port, "user": box.username,
            "password": mbx.password_of(box), "email": box.email}
    try:
        await asyncio.wait_for(asyncio.to_thread(mail_send.send_sync, boxd, raw, [to_addr]), 90)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Envoi impossible : {exc}")
    copy = MailMessage(mailbox_id=box.id, direction="out", stored_path=mail_send.save_sent(box.id, raw), is_read=True,
                       sent_by_user_id=user.id, company_id=src.company_id, contact_id=src.contact_id,
                       classified_by=src.classified_by or "auto", **mail_store.parse(raw))
    db.add(copy)
    src.answered_at = mail_store.now()
    await db.commit()
    try:
        same = src.mailbox_id == box.id
        await asyncio.wait_for(asyncio.to_thread(mail_send.after_send_sync, boxd, raw,
                                                 src.uid if same else None, src.uidvalidity if same else None), 60)
    except Exception as exc:
        copy.copy_error = (str(exc) or exc.__class__.__name__)[:500]
        await db.commit()
    return box.email


class CompanyIn(BaseModel):
    company_id: uuid.UUID | None = None
    later: bool = False            # « Me le rappeler plus tard » : redemande au prochain courriel du fil


@router.put("/{mid}/company")
async def set_company(mid: uuid.UUID, p: CompanyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """TASK-047.4 : associe le courriel (et les autres du meme fil, meme contact, encore sans compagnie) a une des
    compagnies du contact ; ou « plus tard » sur ce courriel seulement."""
    m = await _get(db, mid, user)
    if p.later:
        m.company_ask_later = True
        await db.commit()
        return {"later": True}
    if not m.contact_id:
        raise HTTPException(status_code=422, detail="Ce courriel n'est lié à aucun contact")
    if p.company_id not in {i for i, _ in await mail_match.contact_companies(db, m.contact_id)}:
        raise HTTPException(status_code=422, detail="Cette compagnie n'est pas une compagnie de ce contact")
    ids = await mail_match.thread_ids(db, m)
    rows = (await db.execute(select(MailMessage).where(MailMessage.id.in_(ids), MailMessage.contact_id == m.contact_id,
                                                       MailMessage.company_id.is_(None)))).scalars().all()
    for o in rows:
        o.company_id, o.classified_by = p.company_id, "manual"
    await db.commit()
    companies, contacts = await _names(db, [m])
    return {**_row(m, await db.get(Mailbox, m.mailbox_id), companies, contacts), "moved": len(rows)}


class ReadIn(BaseModel):
    is_read: bool


@router.put("/{mid}/read")
async def set_read(mid: uuid.UUID, p: ReadIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    m = await _get(db, mid, user)
    await _set_seen(db, m, p.is_read)
    return {"is_read": m.is_read}


class ClassifyIn(BaseModel):
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    remember: bool = True          # retenir l'adresse sur le contact : les prochains courriels iront au bon endroit
    create_contact: bool = False   # expediteur inconnu classe dans une compagnie : creer son contact (nom + signature)


@router.put("/{mid}/classify")
async def classify(mid: uuid.UUID, p: ClassifyIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Correction a la main (« juste si ERPCRM s'est trompe »). Avec « retenir », l'adresse est ajoutee au contact et
    les autres courriels de cette adresse encore a classer suivent."""
    from app.models.communication import ChannelType, CommunicationChannel
    m = await _get(db, mid, user)
    if m.direction == "out":                 # envoye d'ici : l'adresse de l'expediteur est la notre, jamais retenue
        p.remember, p.create_contact = False, False
    company_id, contact_id = p.company_id, p.contact_id
    if contact_id and not await db.get(Contact, contact_id):
        raise HTTPException(status_code=404, detail="Contact introuvable")
    if company_id and not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if contact_id and not company_id:
        company_id = await mail_match._company_of_contact(db, contact_id)
    if p.create_contact and company_id and not contact_id and m.from_email:
        known_c, known_p = await mail_match.by_address(db, m.from_email)
        if known_p:
            contact_id = known_p
        else:
            box = await db.get(Mailbox, m.mailbox_id)
            c = await mail_match.create_contact(db, company_id, m.from_email, m.from_name, box.email, m.sent_at)
            contact_id = c.id
            m.contact_created = True
            m.signature_status = "pending" if await zeko.enabled() else None
    m.company_id, m.contact_id = company_id, contact_id
    m.classified_by = "manual" if (company_id or contact_id) else None
    moved = 0
    if p.remember and contact_id and m.from_email:
        known_c, known_p = await mail_match.by_address(db, m.from_email)
        if known_p != contact_id:
            c = await db.get(Contact, contact_id)
            if not c.email:
                c.email = m.from_email
            elif (c.email or "").lower() != m.from_email and (c.email_other or "").lower() != m.from_email:
                if not c.email_other:
                    c.email_other = m.from_email
                else:
                    db.add(CommunicationChannel(entity_id=contact_id, channel_type=ChannelType.email, value=m.from_email, is_active=True))
        others = (await db.execute(select(MailMessage).where(MailMessage.id != m.id, func.lower(MailMessage.from_email) == m.from_email,
                                                             MailMessage.classified_by.is_distinct_from("manual")))).scalars().all()
        for o in others:
            o.company_id, o.contact_id, o.classified_by = company_id, contact_id, "manual"
            moved += 1
    await db.commit()
    companies, contacts = await _names(db, [m])
    return {**_row(m, await db.get(Mailbox, m.mailbox_id), companies, contacts), "moved": moved}


class ShareIn(BaseModel):
    shared: bool


@router.put("/{mid}/share")
async def share(mid: uuid.UUID, p: ShareIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    m = await _get(db, mid, user)
    box = await db.get(Mailbox, m.mailbox_id)
    if box.kind != "personal" or not (box.owner_user_id == user.id or mbx.sees_all(user)):
        raise HTTPException(status_code=403, detail="Seul le propriétaire de la boîte peut partager ce courriel")
    m.shared = p.shared
    await db.commit()
    return {"shared": m.shared}


class LinkIn(BaseModel):
    ticket_id: uuid.UUID | None = None
    task_id: uuid.UUID | None = None


@router.put("/{mid}/link")
async def link(mid: uuid.UUID, p: LinkIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Ticket ou tache fait a partir du courriel ; le courriel est classe dans la meme fiche s'il ne l'etait pas."""
    from app.models.task import Task
    from app.models.ticket import Ticket
    m = await _get(db, mid, user)
    src = None
    if p.ticket_id:
        src = await db.get(Ticket, p.ticket_id)
        if not src:
            raise HTTPException(status_code=404, detail="Ticket introuvable")
        m.ticket_id = src.id
    if p.task_id:
        src = await db.get(Task, p.task_id)
        if not src:
            raise HTTPException(status_code=404, detail="Tâche introuvable")
        m.task_id = src.id
    if src and not (m.company_id or m.contact_id) and (src.company_id or src.contact_id):
        m.company_id, m.contact_id, m.classified_by = src.company_id, src.contact_id, "manual"
    await db.commit()
    return {"ticket_id": str(m.ticket_id) if m.ticket_id else None, "task_id": str(m.task_id) if m.task_id else None}


@router.get("/{mid}/attachments/{index}")
async def get_attachment(mid: uuid.UUID, index: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    m = await _get(db, mid, user)
    if not any(a.get("i") == index for a in m.attachments or []) or not Path(m.stored_path).is_file():
        raise HTTPException(status_code=404, detail="Pièce jointe introuvable")
    name, ctype, data = mail_store.attachment(m.stored_path, index)
    return Response(data, media_type=ctype or "application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"})


@router.post("/sync")
async def sync_now(_: User = Depends(get_current_user)):
    """Copie les nouveaux courriels maintenant (au lieu d'attendre la minute) -- en arriere-plan."""
    from app.services.mail_sync import sync_all
    asyncio.create_task(sync_all())
    return {"started": True}
