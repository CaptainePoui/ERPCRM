"""Repondre et ecrire depuis ERPCRM (TASK-047.3, 2026-10-09).

Le courriel part de la boite choisie (service@, philippe@...), par son propre serveur d'envoi, avec la signature de
l'employe ; une copie est deposee dans le dossier Envoyes de cette boite (Outlook et cellulaire la voient) et le
courriel d'origine y est marque « repondu ». ERPCRM garde aussi sa copie (.eml), classee dans la fiche du client.
"""
from __future__ import annotations

import base64
import email
import email.utils
import html as htmlmod
import imaplib
import re
import smtplib
import ssl
import time
import uuid
from email import encoders
from email.header import Header
from email.mime.base import MIMEBase
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from app.core import mail_store

MAX_TOTAL = 20 * 1024 * 1024          # pieces jointes : 20 Mo en tout (la plupart des serveurs refusent au-dela de 25 Mo)
_DATA_IMG = re.compile(r'src=(["\'])data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\1')
_PREFIX = re.compile(r"^\s*((re|tr|fwd?|réf)\s*:\s*)+", re.I)


def addresses(value: str | None) -> list[tuple[str, str]]:
    """« Nom <a@b.c>, d@e.f » -> [(nom, adresse)] ; refuse une adresse mal formee."""
    out = []
    for name, addr in email.utils.getaddresses([value or ""]):
        addr = addr.strip()
        if not addr:
            continue
        if not re.fullmatch(r"[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+", addr):
            raise ValueError(f"Adresse invalide : {addr}")
        out.append((name.strip(), addr))
    return out


def fmt(pairs: list[tuple[str, str]], header: bool = False) -> str:
    """Liste d'adresses lisible (champ « A » de l'ecran) ; header=True : encodee pour l'en-tete du courriel."""
    out = []
    for n, a in pairs:
        if not n or n.strip().lower() == a.lower():
            out.append(a)
        elif header:
            out.append(email.utils.formataddr((n, a), charset="utf-8"))
        else:
            out.append(f'"{n}" <{a}>' if re.search(r'[,;<>@"]', n) else f"{n} <{a}>")
    return ", ".join(out)


def subject_for(mode: str, subject: str | None) -> str:
    base = _PREFIX.sub("", subject or "").strip()
    return f"{'TR' if mode == 'forward' else 'RE'}: {base}" if mode in ("reply", "reply_all", "forward") else (subject or "")


def quote_html(m) -> str:
    """Courriel d'origine sous la reponse, comme Outlook (« De / Envoye / A / Objet »)."""
    who = email.utils.formataddr((m.from_name or "", m.from_email or "")) if m.from_name else (m.from_email or "")
    when = m.sent_at.astimezone().strftime("%Y-%m-%d %H:%M") if m.sent_at else ""
    head = (f"<b>De :</b> {htmlmod.escape(who)}<br><b>Envoyé :</b> {when}<br><b>À :</b> {htmlmod.escape(m.to_addrs or '')}<br>"
            + (f"<b>Cc :</b> {htmlmod.escape(m.cc_addrs)}<br>" if m.cc_addrs else "")
            + f"<b>Objet :</b> {htmlmod.escape(m.subject or '')}")
    if m.body_html:
        body = re.sub(r"(?is)<(script|style|head)\b.*?</\1>|</?(html|body|meta|link)\b[^>]*>|<!doctype[^>]*>", "", m.body_html)
    else:
        body = f'<div style="white-space:pre-wrap">{htmlmod.escape(m.body_text or "")}</div>'
    return ('<div style="border-top:1px solid #E1E1E1;margin-top:16px;padding-top:8px;font-family:Arial,sans-serif;'
            f'font-size:13px;color:#333">{head}</div><div style="margin-top:10px">{body}</div>')


def _inline_images(html: str) -> tuple[str, list[tuple[str, bytes, str]]]:
    """Images data: du corps (collees, signature, courriel cite) -> pieces integrees (cid:) : affichees partout."""
    images: list[tuple[str, bytes, str]] = []

    def to_cid(mt):
        cid = f"img-{uuid.uuid4().hex}@erpcrm"
        images.append((cid, base64.b64decode(re.sub(r"\s", "", mt.group(3))), mt.group(2).lower()))
        return f"src={mt.group(1)}cid:{cid}{mt.group(1)}"
    return _DATA_IMG.sub(to_cid, html), images


def build(*, sender: str, sender_name: str, to: list, cc: list, subject: str, html_body: str,
          files: list[tuple[str, bytes, str]], in_reply_to: str | None = None, references: str | None = None) -> tuple[bytes, str]:
    """Courriel complet (octets) et son Message-ID."""
    html_body, images = _inline_images(html_body)
    doc = f'<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;font-size:14px;color:#222">{html_body}</body></html>'
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(mail_store.html_to_text(html_body), "plain", "utf-8"))
    alt.attach(MIMEText(doc, "html", "utf-8"))
    body = alt
    if images:
        body = MIMEMultipart("related")
        body.attach(alt)
        for cid, content, subtype in images:
            img = MIMEImage(content, _subtype=subtype)
            img.add_header("Content-ID", f"<{cid}>")
            img.add_header("Content-Disposition", "inline")
            body.attach(img)
    msg = body
    if files:
        msg = MIMEMultipart("mixed")
        msg.attach(body)
        for name, content, ctype in files:
            main, _, sub = (ctype or "application/octet-stream").partition("/")
            part = MIMEBase(main or "application", sub or "octet-stream")
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=name)
            msg.attach(part)
    mid = email.utils.make_msgid(domain=sender.rsplit("@", 1)[-1])
    msg["Message-ID"] = mid
    msg["Date"] = email.utils.formatdate(localtime=True)
    msg["From"] = fmt([(sender_name, sender)], header=True)
    msg["To"] = fmt(to, header=True)
    if cc:
        msg["Cc"] = fmt(cc, header=True)
    msg["Subject"] = Header(subject, "utf-8").encode() if not subject.isascii() else subject
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = f"{references} {in_reply_to}".strip() if references else in_reply_to
    return msg.as_bytes(), mid


def references_of(stored_path: str | None) -> str | None:
    """En-tete References du courriel d'origine (garde le fil de la conversation chez le client)."""
    try:
        return (email.message_from_bytes(Path(stored_path).read_bytes()).get("References") or "").strip() or None
    except Exception:
        return None


def reply_targets(stored_path: str | None, outgoing: bool, own: set[str]) -> dict:
    """Destinataires de « Repondre » / « Repondre a tous », lus dans le courriel garde (en-tetes exacts) : on repond a
    Reply-To s'il existe, sinon a l'expediteur ; nos propres adresses sont retirees. Courriel envoye d'ici : ses destinataires."""
    try:
        e = email.message_from_bytes(Path(stored_path).read_bytes())
    except Exception:
        return {"reply_to": "", "all_to": "", "all_cc": ""}

    def get(*headers):
        vals = [mail_store.decode(v) for h in headers for v in (e.get_all(h) or [])]
        return [(n, a.strip().lower()) for n, a in email.utils.getaddresses(vals) if a and "@" in a]

    def keep(pairs, seen):
        out = []
        for n, a in pairs:
            if a not in own and a not in seen:
                seen.add(a)
                out.append((n, a))
        return out
    if outgoing:
        first = get("To")
        seen: set[str] = set()
        return {"reply_to": fmt(keep(first, set())), "all_to": fmt(keep(first, seen)), "all_cc": fmt(keep(get("Cc"), seen))}
    first = get("Reply-To") or get("From")
    seen = set()
    to = keep(first, seen) + keep(get("To"), seen)
    return {"reply_to": fmt(keep(first, set())), "all_to": fmt(to), "all_cc": fmt(keep(get("Cc"), seen))}


def send_sync(box: dict, raw: bytes, recipients: list[str]) -> None:
    ctx = ssl.create_default_context()
    if box["smtp_port"] == 465:
        s = smtplib.SMTP_SSL(box["host"], 465, timeout=60, context=ctx)
    else:
        s = smtplib.SMTP(box["host"], box["smtp_port"], timeout=60)
        s.starttls(context=ctx)
    try:
        s.login(box["user"], box["password"])
        s.sendmail(box["email"], recipients, raw)
    finally:
        try:
            s.quit()
        except Exception:
            pass


def _sent_folder(conn) -> str:
    typ, data = conn.list()
    names = []
    for line in data or []:
        if not isinstance(line, bytes):
            continue
        mt = re.match(rb'\((?P<flags>[^)]*)\) "(?P<sep>[^"]*)" (?P<name>.+)$', line)
        if not mt:
            continue
        name = mt.group("name").decode(errors="replace").strip().strip('"')
        if b"\\Sent" in mt.group("flags"):
            return name
        names.append(name)
    for guess in ("INBOX.Sent", "Sent", "INBOX.Sent Items", "Sent Items", "INBOX.Envoyés", "Envoyés"):
        if guess in names:
            return guess
    raise RuntimeError("Dossier Envoyés introuvable dans la boîte")


def after_send_sync(box: dict, raw: bytes, answered_uid: int | None, answered_uidvalidity: int | None) -> None:
    """Copie dans Envoyes (lue) ; courriel d'origine marque « repondu » (meme numerotation de la boite seulement)."""
    conn = mail_store._connect(box)
    try:
        folder = _sent_folder(conn)
        typ, data = conn.append(f'"{folder}"', "(\\Seen)", imaplib.Time2Internaldate(time.time()), raw)
        if typ != "OK":
            raise RuntimeError(f"Copie dans {folder} refusée : {data}")
        if answered_uid:
            conn.select("INBOX")
            uv = int(re.search(rb"\d+", conn.response("UIDVALIDITY")[1][0]).group(0))
            if uv == answered_uidvalidity:
                conn.uid("STORE", str(answered_uid), "+FLAGS", "(\\Answered)")
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def save_sent(mailbox_id, raw: bytes) -> str:
    d = mail_store.STORE_DIR / str(mailbox_id)
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"sent-{uuid.uuid4().hex}.eml"
    p.write_bytes(raw)
    return str(p)
