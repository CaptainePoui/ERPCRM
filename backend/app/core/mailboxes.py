"""Boites de courriel de l'entreprise (TASK-047.1, 2026-10-08).

Philippe : portabilite@ (portabilite), service@ (la plupart des courriels), facturation@ (factures, liens Interac),
support@ (« pourrait etre lie au ticket direct ») ; « pouvoir les attribuer a certaines fonctions comme facturation a
facture, mais sans empecher que si quelqu'un me fait un paiement dans service je puisse le reconnaitre ».
-> chaque fonction (FUNCTIONS) appartient a une seule boite ; les avis Interac sont lus dans toutes les boites actives.
"""
from __future__ import annotations

import imaplib
import smtplib
import ssl

from sqlalchemy import select

from app.core.config import settings

FUNCTIONS = {
    "tickets": "Tickets — chaque courriel reçu devient un ticket (ou s'ajoute à son ticket) ; les courriels de tickets partent d'ici",
    "invoices": "Factures — les factures, avoirs et avis de retard partent d'ici",
    "devis": "Devis — les devis partent d'ici",
}


def default_host() -> str:
    """Serveur propose pour une nouvelle boite : celui deja utilise pour envoyer (configuration du serveur)."""
    return settings.SMTP_HOST or settings.IMAP_HOST or ""


def password_of(mb) -> str:
    from app.core.crypto import decrypt
    return decrypt(mb.password_enc) if mb.password_enc else ""


async def active(db, function: str | None = None) -> list:
    from app.models.mailbox import Mailbox
    q = select(Mailbox).where(Mailbox.is_active.is_(True), Mailbox.password_enc.is_not(None)).order_by(Mailbox.email)
    if function:
        q = q.where(Mailbox.functions.any(function))
    return list((await db.execute(q)).scalars().all())


async def sender_for(function: str | None) -> dict | None:
    """Parametres d'envoi de la boite qui a cette fonction (None = envoi habituel, configuration du serveur)."""
    if not function:
        return None
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        boxes = await active(db, function)
    if not boxes:
        return None
    mb = boxes[0]
    return {"host": mb.host, "port": mb.smtp_port, "user": mb.username, "password": password_of(mb),
            "from": mb.email, "from_name": mb.display_name or settings.SMTP_FROM_NAME}


def test_sync(host: str, imap_port: int, smtp_port: int, user: str, password: str) -> dict:
    """Connexion reelle a la reception (IMAP, lecture seule) et a l'envoi (SMTP), sans rien envoyer."""
    out = {}
    conn = imaplib.IMAP4_SSL(host, imap_port, timeout=30, ssl_context=ssl.create_default_context())
    try:
        conn.login(user, password)
        typ, data = conn.select("INBOX", readonly=True)
        out["inbox_count"] = int(data[0]) if typ == "OK" else None
        _, unseen = conn.search(None, "UNSEEN")
        out["unseen_count"] = len(unseen[0].split())
    finally:
        try:
            conn.logout()
        except Exception:
            pass
    ctx = ssl.create_default_context()
    if smtp_port == 465:
        s = smtplib.SMTP_SSL(host, smtp_port, timeout=30, context=ctx)
    else:
        s = smtplib.SMTP(host, smtp_port, timeout=30)
        s.starttls(context=ctx)
    try:
        s.login(user, password)
        out["smtp"] = True
    finally:
        try:
            s.quit()
        except Exception:
            pass
    return out


async def seed_from_server_config(db) -> None:
    """Premiere fois : la boite support@ lue jusqu'ici par la configuration du serveur (.env, IMAP_*) devient une boite
    de l'ecran, fonction « tickets », mot de passe chiffre -- Philippe n'a rien a retaper et les tickets continuent."""
    from app.core.crypto import encrypt
    from app.models.mailbox import Mailbox
    if not (settings.IMAP_HOST and settings.IMAP_USER and settings.IMAP_PASSWORD):
        return
    if (await db.execute(select(Mailbox.id).limit(1))).first():
        return
    db.add(Mailbox(email=settings.IMAP_USER.lower(), username=settings.IMAP_USER, password_enc=encrypt(settings.IMAP_PASSWORD),
                   host=settings.IMAP_HOST, imap_port=settings.IMAP_PORT, smtp_port=settings.SMTP_PORT or 465,
                   display_name=settings.SMTP_FROM_NAME if settings.SMTP_FROM.lower() == settings.IMAP_USER.lower() else None,
                   functions=["tickets"], is_active=True))
    await db.commit()
