"""Factures envoyees par Zoho, reconnues par la copie du courriel (TASK-005.32, 2026-11-05).

Philippe : « si on a la confirmation par courriel que Zoho l'a envoyee, mais un tag different, envoyee par Zoho… ce
tag va rester la pendant la transition ». Pendant la transition, Zoho envoie les factures (depuis
facturation@simpleip.tel) ; la copie de l'envoi (option de Zoho), synchronisee dans Courriels comme les autres, a le
sujet « Facture - INV-xxxxxx de Simple IP inc. ». Lecture par expression reguliere (format fixe, pas d'IA).

Marquage SUR seulement : la facture du meme numero existe dans ERPCRM, est emise et « non transmise », ET le courriel
le confirme par un destinataire qui est une adresse de sa compagnie (ou de sa maison mere / ses succursales), OU par
le total de la facture ecrit dans le courriel -- un numero qui ne serait pas le meme dans Zoho et dans ERPCRM ne
marque donc pas la facture d'un autre client. Verifie 2026-11-05 sur l'export Zoho : INV-112248 a INV-112280 ont le
meme numero, client et total des deux cotes, mais l'adresse ou Zoho envoie n'est connue d'ERPCRM que pour 2 sur 32.
Les reponses (« Re: », « TR: ») et les retours (« Undelivered Mail - Facture… ») ne commencent pas par « Facture - ».
"""
import logging
import re
from email.utils import getaddresses

from sqlalchemy import select, func

log = logging.getLogger("zoho_sent")

SUBJECT = re.compile(r"^\s*Facture\s*-\s*(INV-\d+)\s+de\s+Simple IP", re.I)


def invoice_number(subject: str | None) -> str | None:
    m = SUBJECT.match(subject or "")
    return m.group(1).upper() if m else None


def amounts_in(text: str) -> set[str]:
    """Montants ecrits dans le courriel, normalises « 1234.56 » (« 1 234,56 $ », « $1,234.56 », « 73,30 »)."""
    out = set()
    for m in re.findall(r"\d[\d  ,.]*[.,]\d{2}\b", re.sub(r"<[^>]+>", " ", text or "")):
        digits = re.sub(r"[^\d]", "", m)
        out.add(f"{int(digits[:-2] or 0)}.{digits[-2:]}")
    return out


def recipients(msg) -> set[str]:
    return {a.strip().lower() for _, a in getaddresses([msg.to_addrs or "", msg.cc_addrs or ""]) if "@" in a}


async def company_emails(db, company_id) -> set[str]:
    """Adresses de la compagnie de la facture, de sa maison mere et de ses succursales : courriel de facturation,
    courriels des contacts (sur la fiche ou propres a la compagnie)."""
    from app.models.company import Company
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    from app.core.company_tree import family_ids
    ids = await family_ids(db, company_id)
    found = set((await db.execute(select(Company.billing_email).where(Company.id.in_(ids)))).scalars().all())
    rows = (await db.execute(select(ContactCompany.email, Contact.email).join(Contact, Contact.id == ContactCompany.contact_id)
                             .where(ContactCompany.company_id.in_(ids)))).all()
    for a, b in rows:
        found.update((a, b))
    return {x.strip().lower() for x in found if x and "@" in x}


async def scan(db) -> int:
    """Marque « Envoyee par Zoho » les factures dont la copie de l'envoi est arrivee. Ne fait pas le commit."""
    from app.models.invoice import Invoice
    from app.models.mailbox import MailMessage
    msgs = (await db.execute(select(MailMessage).where(MailMessage.subject.op("~*")(r"^\s*Facture\s*-\s*INV-\d+\s+de\s+Simple IP"))
                             .order_by(MailMessage.sent_at))).scalars().all()
    if not msgs:
        return 0
    used = set((await db.execute(select(Invoice.transmitted_mail_id).where(Invoice.transmitted_mail_id.is_not(None)))).scalars().all())
    n = 0
    for m in msgs:
        num = invoice_number(m.subject)
        if m.id in used or not num:
            continue
        inv = (await db.execute(select(Invoice).where(func.upper(Invoice.number) == num))).scalar_one_or_none()
        if not inv or inv.transmission_status != "non_transmise" or inv.status in ("brouillon", "annulee"):
            continue
        to = recipients(m) & await company_emails(db, inv.company_id)
        if not to and f"{inv.total:.2f}" not in amounts_in((m.body_text or "") + " " + (m.body_html or "")):
            log.info("Copie Zoho %s : ni destinataire de la compagnie ni total de la facture (%s) dans le courriel, non marquee", num, inv.total)
            continue
        to = to or recipients(m)
        inv.transmission_status = "zoho"
        inv.transmitted_at = m.sent_at or m.created_at
        inv.transmitted_to = ", ".join(sorted(to))[:500]
        inv.transmitted_mail_id = m.id
        used.add(m.id)
        n += 1
    return n


async def run_once() -> int:
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        n = await scan(db)
        await db.commit()
    if n:
        log.info("Factures envoyees par Zoho reconnues : %d", n)
    return n
