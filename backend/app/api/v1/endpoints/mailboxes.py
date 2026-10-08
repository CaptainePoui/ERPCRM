"""Boites de courriel de l'entreprise -- Administration -> Integrations (TASK-047.1, 2026-10-08).
Fonctions et envoi : app/core/mailboxes.py ; avis Interac (lus dans toutes les boites) : app/core/interac_mail.py."""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.settings import get_setting, set_setting
from app.core import mailboxes as mbx
from app.core.crypto import encrypt
from app.core.database import get_db
from app.models.mailbox import Mailbox
from app.models.user import User

router = APIRouter()


class MailboxIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=255)     # vide = l'adresse
    password: str | None = None                                     # vide = garder celui enregistre
    host: str | None = Field(default=None, max_length=255)
    imap_port: int = Field(default=993, ge=1, le=65535)
    smtp_port: int = Field(default=465, ge=1, le=65535)
    functions: list[str] = []
    is_active: bool = True


class InteracIn(BaseModel):
    enabled: bool
    since: str | None = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")


def _out(m: Mailbox) -> dict:
    return {"id": str(m.id), "email": m.email, "display_name": m.display_name, "username": m.username, "host": m.host,
            "imap_port": m.imap_port, "smtp_port": m.smtp_port, "functions": list(m.functions or []), "is_active": m.is_active,
            "has_password": bool(m.password_enc), "last_check_at": m.last_check_at, "last_error": m.last_error}


async def _interac(db) -> dict:
    from app.models.bank_account import InteracNotice
    return {"enabled": (await get_setting(db, "interac_mail_enabled")) == "true",
            "since": await get_setting(db, "interac_mail_since"),
            "stats": dict((await db.execute(select(InteracNotice.status, func.count()).group_by(InteracNotice.status))).all())}


@router.get("")
async def list_mailboxes(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Mailbox).order_by(Mailbox.email))).scalars().all()
    return {"mailboxes": [_out(m) for m in rows], "functions": mbx.FUNCTIONS, "default_host": mbx.default_host(),
            "interac": await _interac(db)}


async def _apply(db, m: Mailbox, p: MailboxIn) -> None:
    email = p.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Adresse de courriel invalide")
    bad = [f for f in p.functions if f not in mbx.FUNCTIONS]
    if bad:
        raise HTTPException(status_code=400, detail=f"Fonction inconnue : {', '.join(bad)}")
    dup = (await db.execute(select(Mailbox).where(func.lower(Mailbox.email) == email, Mailbox.id != m.id))).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="Cette boîte existe déjà")
    if p.is_active:
        for f in p.functions:       # une fonction = une seule boite (sinon, de quelle adresse partirait la facture ?)
            other = (await db.execute(select(Mailbox).where(Mailbox.id != m.id, Mailbox.is_active.is_(True),
                                                            Mailbox.functions.any(f)))).scalars().first()
            if other:
                raise HTTPException(status_code=409, detail=f"La fonction « {mbx.FUNCTIONS[f].split(' — ')[0]} » est déjà donnée à {other.email} : retirez-la d'abord de cette boîte")
    host = (p.host or "").strip() or m.host or mbx.default_host()
    if not host:
        raise HTTPException(status_code=400, detail="Serveur de courriel requis")
    m.email, m.display_name = email, (p.display_name or "").strip() or None
    m.username = (p.username or "").strip() or email
    m.host, m.imap_port, m.smtp_port = host, p.imap_port, p.smtp_port
    m.functions, m.is_active = sorted(set(p.functions)), p.is_active
    if p.password:
        m.password_enc = encrypt(p.password)
        m.last_error = None


@router.post("", status_code=201)
async def create_mailbox(p: MailboxIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    m = Mailbox(email="", username="", host="")
    await _apply(db, m, p)
    db.add(m)
    await db.commit()
    return _out(m)


@router.put("/{mid}")
async def update_mailbox(mid: uuid.UUID, p: MailboxIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    m = await db.get(Mailbox, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Boîte introuvable")
    await _apply(db, m, p)
    await db.commit()
    return _out(m)


@router.delete("/{mid}", status_code=204)
async def delete_mailbox(mid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Retire la boite d'ERPCRM (rien n'est touche sur le serveur de courriel)."""
    m = await db.get(Mailbox, mid)
    if m:
        await db.delete(m)
        await db.commit()


@router.post("/{mid}/test")
async def test_mailbox(mid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Connexion reelle a la reception et a l'envoi, sans rien lire comme « lu » ni rien envoyer."""
    m = await db.get(Mailbox, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Boîte introuvable")
    if not m.password_enc:
        raise HTTPException(status_code=400, detail="Entrez d'abord le mot de passe")
    m.last_check_at = datetime.now(timezone.utc)
    try:
        r = await asyncio.to_thread(mbx.test_sync, m.host, m.imap_port, m.smtp_port, m.username, mbx.password_of(m))
        m.last_error = None
        await db.commit()
        return r
    except Exception as e:
        m.last_error = str(e)[:500]
        await db.commit()
        raise HTTPException(status_code=400, detail=f"Connexion impossible : {e}")


@router.put("/interac/settings")
async def save_interac(p: InteracIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await set_setting(db, "interac_mail_enabled", "true" if p.enabled else "false")
    await set_setting(db, "interac_mail_since", p.since or "")
    return await _interac(db)


@router.post("/interac/run")
async def run_interac(_: User = Depends(get_current_user)):
    """Lit les nouveaux avis maintenant (au lieu d'attendre le passage aux 15 minutes) -- en arriere-plan."""
    from app.services.interac_poller import run_interac_once
    asyncio.create_task(run_interac_once())
    return {"started": True}
