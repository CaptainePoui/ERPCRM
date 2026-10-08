"""Avis de virement Interac lus dans la boite de courriel (TASK-042.5, 2026-10-07 : depot automatique
Interac active par Philippe a la BNC ; le releve ne dit que « VIREMENT INTERAC », l'avis dit QUI a paye).

- Lu dans toutes les boites de courriel actives (Administration -> Integrations, TASK-047.1) ; mots de passe
  chiffres au repos (Fernet, app/core/crypto.py), jamais renvoyes a l'ecran.
- Boite ouverte en LECTURE SEULE (select readonly + BODY.PEEK) : aucun courriel marque lu ni deplace.
- Seuls les courriels dont l'expediteur contient « interac » sont recuperes.
- L'IA locale lit chaque avis (format libre, francais ou anglais) ; le programme verifie que le montant
  lu figure dans le courriel. Puis l'avis est relie au depot du meme montant a 3 jours pres, s'il est unique.
"""
import email
import email.header
import email.utils
import html
import imaplib
import json
import re
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import httpx

from app.core.config import settings

async def load_config(db) -> dict:
    """Reglages de lecture (Administration -> Integrations) + les boites ou chercher : TOUTES les boites actives
    (TASK-047.1, Philippe : « si quelqu'un me fait un paiement dans service, je peux le reconnaitre »)."""
    from app.api.v1.endpoints.settings import get_setting
    from app.core import mailboxes as mbx
    boxes = [{"email": b.email, "host": b.host, "port": b.imap_port, "user": b.username, "password": mbx.password_of(b),
              "folder": "INBOX"} for b in await mbx.active(db)]
    return {"enabled": (await get_setting(db, "interac_mail_enabled")) == "true",
            "since": await get_setting(db, "interac_mail_since"), "boxes": boxes}


def _decode(value: str | None) -> str:
    out = []
    for b, enc in email.header.decode_header(value or ""):
        out.append(b.decode(enc or "utf-8", errors="replace") if isinstance(b, bytes) else b)
    return "".join(out)


def _text(msg) -> str:
    plain, rich = "", ""
    for part in (msg.walk() if msg.is_multipart() else [msg]):
        ctype = part.get_content_type()
        if part.get("Content-Disposition") or ctype not in ("text/plain", "text/html"):
            continue
        payload = part.get_payload(decode=True) or b""
        txt = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
        if ctype == "text/plain" and not plain:
            plain = txt
        elif ctype == "text/html" and not rich:
            rich = html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style).*?</\1>", " ", txt)))
    body = plain or rich
    return re.sub(r"[ \t]+", " ", re.sub(r"\n\s*\n+", "\n", body)).strip()[:6000]


def fetch_sync(cfg: dict, known: set, limit: int = 300) -> tuple[list[dict], int]:
    """(nouveaux avis, nombre total de courriels Interac trouves). Lecture seule."""
    conn = imaplib.IMAP4_SSL(cfg["host"], cfg["port"], timeout=60)
    try:
        conn.login(cfg["user"], cfg["password"])
        typ, _ = conn.select(f'"{cfg["folder"]}"', readonly=True)
        if typ != "OK":
            raise RuntimeError(f"Dossier « {cfg['folder']} » introuvable")
        crit = ["FROM", '"interac"']
        if cfg.get("since"):
            crit = ["SINCE", datetime.fromisoformat(cfg["since"]).strftime("%d-%b-%Y")] + crit
        _, data = conn.search(None, *crit)
        ids = data[0].split()
        out = []
        for num in reversed(ids):                      # les plus recents d'abord
            if len(out) >= limit:
                break
            _, hdr = conn.fetch(num, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
            mid = email.message_from_bytes(hdr[0][1]).get("Message-ID", "").strip() or f"uid-{num.decode()}"
            if mid in known:
                continue
            _, raw = conn.fetch(num, "(BODY.PEEK[])")
            msg = email.message_from_bytes(raw[0][1])
            try:
                received = email.utils.parsedate_to_datetime(msg.get("Date"))
            except (TypeError, ValueError):
                received = None
            out.append({"message_id": mid[:500], "received_at": received, "subject": _decode(msg.get("Subject"))[:1000], "body": _text(msg)})
        return out, len(ids)
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def _money(v) -> Decimal | None:
    try:
        return Decimal(str(v).replace(",", ".").replace(" ", "").replace("$", "")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def amount_in_text(amount: Decimal, text: str) -> bool:
    """Le montant lu doit apparaitre dans le courriel (1234.56, 1 234,56, 1,234.56...)."""
    digits = re.sub(r"[^\d]", "", f"{amount:.2f}")
    for m in re.finditer(r"\d[\d\s., ]*\d", text):
        if re.sub(r"[^\d]", "", m.group(0)) == digits:
            return True
    return False


async def ai_parse(subject: str, body: str) -> dict:
    prompt = (
        "Voici un courriel d'Interac reçu par l'entreprise Simple IP. Dis s'il annonce de l'argent REÇU par Simple IP "
        "(virement reçu ou déposé automatiquement) — pas un virement envoyé par Simple IP, une demande d'argent, un rappel ou "
        "une annulation. Si oui, recopie le nom de l'expéditeur (la personne ou l'entreprise qui a envoyé l'argent), "
        "le montant, la date (AAAA-MM-JJ), le message de l'expéditeur et le numéro de référence, tels qu'écrits.\n"
        "Réponds UNIQUEMENT en JSON : {\"recu\": bool, \"expediteur\": str|null, \"montant\": number|null, "
        "\"date\": str|null, \"message\": str|null, \"reference\": str|null}\n\n"
        f"Sujet : {subject}\n\n{body[:5000]}"
    )
    async with httpx.AsyncClient(timeout=900) as client:
        r = await client.post(f"{settings.LOCAL_AI_URL.rstrip('/')}/chat/completions", json={
            "model": settings.LOCAL_AI_MODEL, "temperature": 0, "reasoning_effort": "low",
            "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        content = r.json()["choices"][0]["message"]["content"]
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise ValueError("réponse de l'IA illisible")
    return json.loads(m.group(0))


def parse_result(x: dict, notice, text: str) -> None:
    """Applique la lecture de l'IA a l'avis, avec les controles du programme."""
    if not x.get("recu"):
        notice.status, notice.error = "ignored", "Pas un virement reçu (envoi, demande, rappel…)"
        return
    amount = _money(x.get("montant"))
    if not amount or amount <= 0 or not amount_in_text(amount, text):
        notice.status, notice.error = "failed", f"Montant lu ({x.get('montant')}) introuvable dans le courriel"
        return
    try:
        d = date.fromisoformat((x.get("date") or "")[:10])
    except ValueError:
        d = notice.received_at.date() if notice.received_at else None
    notice.sender_name = (x.get("expediteur") or "").strip()[:255] or None
    notice.amount, notice.sent_date = amount, d
    notice.message = (x.get("message") or "").strip()[:2000] or None
    notice.reference = (x.get("reference") or "").strip()[:100] or None
    notice.status = "parsed" if notice.sender_name else "failed"
    if not notice.sender_name:
        notice.error = "Expéditeur introuvable"


async def match_notices(db) -> int:
    """Relie chaque avis lu au depot Interac du meme montant (3 jours pres), s'il est unique ; le depot
    prend alors le nom de l'expediteur comme beneficiaire -> regles, comparaison des noms et IA s'appliquent."""
    from sqlalchemy import select
    from app.models.bank_account import BankTransaction, InteracNotice
    from app.core import bank_matching as bm
    taken = set((await db.execute(select(InteracNotice.bank_transaction_id).where(InteracNotice.bank_transaction_id.is_not(None)))).scalars().all())
    n = 0
    for nt in (await db.execute(select(InteracNotice).where(InteracNotice.status == "parsed", InteracNotice.bank_transaction_id.is_(None)))).scalars().all():
        if not nt.sent_date:
            continue
        cands = [t for t in (await db.execute(select(BankTransaction).where(
            BankTransaction.amount == nt.amount,
            BankTransaction.posted_date >= nt.sent_date - timedelta(days=1),
            BankTransaction.posted_date <= nt.sent_date + timedelta(days=3)))).scalars().all()
            if t.id not in taken and "interac" in f"{t.description} {t.payee or ''}".lower()]
        if len(cands) != 1:
            continue
        tx = cands[0]
        nt.bank_transaction_id, nt.status = tx.id, "matched"
        taken.add(tx.id)
        if tx.status == "unclassified" and not tx.company_id:
            tx.payee = nt.sender_name[:255]
            tx.ai_status = "pending" if settings.LOCAL_AI_URL else None
            tx.ai_company_id = tx.ai_confidence = tx.ai_note = None
        n += 1
    await db.flush()
    if n:
        await bm.apply_rules(db)
    return n
