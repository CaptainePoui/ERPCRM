"""
IMAP poller: checks inbox every 60s.
- Subject matches [Ticket #XXXXXXXX] → adds entry to existing ticket
- Otherwise → finds contact by sender email → creates new ticket
"""
import imaplib
import email
import email.header
import asyncio
import re
import logging
from datetime import date
from sqlalchemy import select, cast, Text, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketEntry
from app.models.contact import Contact
from app.models.contact_company import ContactCompany

log = logging.getLogger("imap_poller")

_TICKET_RE = re.compile(r'\[Ticket #([A-F0-9]{8})\]', re.IGNORECASE)
_POLL_INTERVAL = 60  # seconds


def _decode_header(value: str) -> str:
    parts = email.header.decode_header(value)
    result = []
    for b, enc in parts:
        if isinstance(b, bytes):
            result.append(b.decode(enc or 'utf-8', errors='replace'))
        else:
            result.append(b)
    return ''.join(result)


def _extract_sender_email(from_header: str) -> str | None:
    m = re.search(r'[\w.+-]+@[\w.-]+\.\w+', from_header)
    return m.group(0).lower() if m else None


def _get_text_body(msg: email.message.Message) -> str:
    """Extract plain text, strip quoted reply lines."""
    body = ''
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == 'text/plain' and part.get('Content-Disposition') is None:
                charset = part.get_content_charset() or 'utf-8'
                body = part.get_payload(decode=True).decode(charset, errors='replace')
                break
    else:
        charset = msg.get_content_charset() or 'utf-8'
        body = msg.get_payload(decode=True).decode(charset, errors='replace')

    # Strip quoted reply lines (lines starting with ">")
    lines = [l for l in body.splitlines() if not l.startswith('>')]
    # Remove trailing blank lines
    text = '\n'.join(lines).strip()
    # Truncate at common reply separators
    for sep in ['On ', '-----Original Message-----', '________________________________']:
        idx = text.find(sep)
        if idx > 50:
            text = text[:idx].strip()
    return text[:2000]  # max 2000 chars for entry description


def _fetch_emails_sync() -> list[dict]:
    """Blocking IMAP fetch — runs in a thread."""
    if not settings.IMAP_HOST:
        return []
    results = []
    try:
        conn = imaplib.IMAP4_SSL(settings.IMAP_HOST, settings.IMAP_PORT)
        conn.login(settings.IMAP_USER, settings.IMAP_PASSWORD)
        conn.select('INBOX')
        _, data = conn.search(None, 'UNSEEN')
        msg_ids = data[0].split()
        for mid in msg_ids:
            _, mdata = conn.fetch(mid, '(RFC822)')
            raw = mdata[0][1]
            msg = email.message_from_bytes(raw)
            subject = _decode_header(msg.get('Subject', ''))
            from_hdr = msg.get('From', '')
            sender = _extract_sender_email(from_hdr)
            body = _get_text_body(msg)
            # Mark as seen
            conn.store(mid, '+FLAGS', '\\Seen')
            results.append({'subject': subject, 'sender': sender, 'body': body, 'from_hdr': from_hdr})
        conn.logout()
    except Exception as exc:
        log.warning("IMAP fetch error: %s", exc)
    return results


async def _process_email(db: AsyncSession, subject: str, sender: str | None, body: str) -> None:
    # 1. Try to match existing ticket by reference in subject
    m = _TICKET_RE.search(subject)
    if m:
        prefix = m.group(1).lower()
        result = await db.execute(
            select(Ticket)
            .options(selectinload(Ticket.entries))
            .where(cast(Ticket.id, Text).ilike(f'{prefix}%'))
        )
        ticket = result.scalar_one_or_none()
        if ticket and body:
            entry = TicketEntry(
                ticket_id=ticket.id,
                user_id=None,
                description=f"[Réponse client] {body}",
                duration_minutes=0,
                worked_at=date.today(),
                is_billable=False,
            )
            db.add(entry)
            await db.commit()
            log.info("Added email reply to ticket %s", ticket.id)
            return

    # 2. No match or no reference — try to create new ticket from sender email
    if not sender:
        return

    result = await db.execute(
        select(Contact)
        .options(selectinload(Contact.contact_companies).selectinload(ContactCompany.company))
        .where(func.lower(Contact.email) == sender)
    )
    contact = result.scalar_one_or_none()
    if not contact or not contact.contact_companies:
        log.info("Email from unknown sender %s — skipped", sender)
        return

    # Pick primary company or first
    cc = next((c for c in contact.contact_companies if c.is_primary and c.is_active), None)
    if not cc:
        cc = next((c for c in contact.contact_companies if c.is_active), None)
    if not cc:
        return

    ticket_title = subject.strip() or f"Email de {sender}"
    ticket = Ticket(
        company_id=cc.company_id,
        contact_id=contact.id,
        title=ticket_title[:255],
        description=body or None,
        priority='normal',
        status='ouvert',
    )
    db.add(ticket)
    await db.commit()
    log.info("Created ticket from email of %s: %s", sender, ticket_title)


async def poll_once() -> None:
    emails = await asyncio.to_thread(_fetch_emails_sync)
    if not emails:
        return
    async with AsyncSessionLocal() as db:
        for e in emails:
            try:
                await _process_email(db, e['subject'], e['sender'], e['body'])
            except Exception as exc:
                log.error("Error processing email: %s", exc)


async def run_poller() -> None:
    log.info("IMAP poller started (host=%s, interval=%ds)", settings.IMAP_HOST or 'none', _POLL_INTERVAL)
    while True:
        try:
            await poll_once()
        except Exception as exc:
            log.error("Poller error: %s", exc)
        await asyncio.sleep(_POLL_INTERVAL)
