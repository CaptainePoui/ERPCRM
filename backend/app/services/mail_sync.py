"""Copie des boites de courriel dans ERPCRM, chaque minute (TASK-047.2, 2026-10-09).

Boites copiees : actives, avec mot de passe, type « shared » ou « personal », et sans la fonction « tickets »
(support@ : ses courriels deviennent des tickets, imap_poller). Les deux services (http et https) font tourner ce
poller : un verrou PostgreSQL fait qu'un seul copie a la fois -- jamais de courriel en double.
"""
import asyncio
import logging

from sqlalchemy import select, text, update

from app.core import mail_match, mail_store, zeko, zeko_mail
from app.core.database import AsyncSessionLocal, engine

log = logging.getLogger("mail_sync")

_INTERVAL = 60
_LOCK = 47_0247                          # verrou PostgreSQL de la copie des courriels
_SIG_LOCK = 47_0248                      # verrou de la lecture des signatures (separee : l'IA peut prendre des minutes)
_ZEKO_LOCK = 47_0249                     # verrou de Zeko sur les courriels (classement, RDV) -- TASK-047.5 / TASK-026.6


def _box(mb) -> dict:
    from app.core import mailboxes as mbx
    return {"host": mb.host, "port": mb.imap_port, "user": mb.username, "password": mbx.password_of(mb)}


async def syncable(db) -> list:
    from app.models.mailbox import Mailbox
    rows = (await db.execute(select(Mailbox).where(Mailbox.is_active.is_(True), Mailbox.password_enc.is_not(None),
                                                    Mailbox.kind.in_(("shared", "personal"))))).scalars().all()
    return [b for b in rows if "tickets" not in (b.functions or [])]


async def _sync_box(mb_id) -> int:
    from app.models.mailbox import Mailbox, MailMessage
    async with AsyncSessionLocal() as db:
        mb = await db.get(Mailbox, mb_id)
        push = dict((await db.execute(select(MailMessage.uid, MailMessage.is_read).where(
            MailMessage.mailbox_id == mb.id, MailMessage.uidvalidity == mb.uidvalidity, MailMessage.flag_pending.is_(True)))).all()) \
            if mb.uidvalidity else {}
        known = list((await db.execute(select(MailMessage.uid).where(
            MailMessage.mailbox_id == mb.id, MailMessage.uidvalidity == mb.uidvalidity))).scalars().all()) if mb.uidvalidity else []
        box, uv, last, since, email_addr = _box(mb), mb.uidvalidity, mb.last_uid, mb.sync_since, mb.email
        own = {b.email.rsplit("@", 1)[1].lower() for b in (await db.execute(select(Mailbox))).scalars().all() if "@" in b.email}
    try:
        res = await asyncio.to_thread(mail_store.sync_sync, box, uv, last, since, push, known)
    except Exception as exc:
        async with AsyncSessionLocal() as db:
            await db.execute(update(Mailbox).where(Mailbox.id == mb_id).values(sync_error=str(exc)[:500], last_sync_at=mail_store.now()))
            await db.commit()
        log.warning("Copie de %s impossible : %s", email_addr, exc)
        return 0
    async with AsyncSessionLocal() as db:
        mb = await db.get(Mailbox, mb_id)
        if res["uidvalidity"] != mb.uidvalidity:
            mb.uidvalidity, mb.last_uid = res["uidvalidity"], 0
        if push:
            await db.execute(update(MailMessage).where(MailMessage.mailbox_id == mb.id, MailMessage.uid.in_(list(push)),
                                                       MailMessage.uidvalidity == mb.uidvalidity).values(flag_pending=False))
        for uid, seen in res["seen"].items():        # lu ailleurs -> lu ici (sauf un changement fait ici pas encore ecrit)
            if uid not in push:
                await db.execute(update(MailMessage).where(
                    MailMessage.mailbox_id == mb.id, MailMessage.uidvalidity == mb.uidvalidity, MailMessage.uid == uid,
                    MailMessage.is_read.is_not(seen), MailMessage.flag_pending.is_(False)).values(is_read=seen))
        n = 0
        for uid, raw, seen in res["new"]:
            exists = (await db.execute(select(MailMessage.id).where(MailMessage.mailbox_id == mb.id,
                                                                    MailMessage.uidvalidity == mb.uidvalidity, MailMessage.uid == uid))).first()
            if not exists:
                path = mail_store.save_raw(mb.id, mb.uidvalidity, uid, raw)
                msg = MailMessage(mailbox_id=mb.id, uidvalidity=mb.uidvalidity, uid=uid, stored_path=path, is_read=seen,
                                  **mail_store.parse(raw))
                db.add(msg)
                await db.flush()
                try:
                    async with db.begin_nested():
                        await mail_match.classify(db, msg, own, mb.email)
                except Exception as exc:
                    log.warning("Classement du courriel %s impossible : %s", uid, exc)
                # TASK-026.6 : courriel d'un client -> Zeko regarde s'il change un de ses RDV (proposition a confirmer)
                if (msg.company_id or msg.contact_id) and mail_match.domain_of(msg.from_email) not in own and await zeko.enabled():
                    msg.zeko_rdv = "pending"
                n += 1
        mb.last_uid = max(mb.last_uid, res["last_uid"])
        mb.last_sync_at, mb.sync_error = mail_store.now(), None
        await db.commit()
    if n:
        log.info("%s : %d courriel(s) copie(s)", email_addr, n)
    return n + (1000 if res["more"] else 0)


async def _signatures() -> None:
    """Signatures des contacts crees automatiquement, lues une a la fois par l'IA locale."""
    from app.models.mailbox import MailMessage
    async with AsyncSessionLocal() as db:
        msg = (await db.execute(select(MailMessage).where(MailMessage.signature_status == "pending")
                                .order_by(MailMessage.created_at).limit(1))).scalar_one_or_none()
        if not msg:
            return
        try:
            await mail_match.read_signature(db, msg)
        except Exception as exc:
            msg.signature_status = "failed"
            log.warning("Signature du courriel %s illisible : %s", msg.id, exc)
        await db.commit()


async def sync_all() -> None:
    async with engine.connect() as lock:
        if not await lock.scalar(text("select pg_try_advisory_lock(:k)"), {"k": _LOCK}):
            return                               # l'autre service copie deja
        try:
            async with AsyncSessionLocal() as db:
                ids = [b.id for b in await syncable(db)]
            for mb_id in ids:
                for _ in range(20):              # premiere copie : par paquets de 200 jusqu'a avoir rattrape
                    if await _sync_box(mb_id) < 1000:
                        break
        finally:
            await lock.execute(text("select pg_advisory_unlock(:k)"), {"k": _LOCK})
            await lock.commit()


async def run_signatures() -> None:
    """Contacts crees automatiquement : leur signature est lue par l'IA locale, un courriel a la fois."""
    await asyncio.sleep(30)
    while True:
        try:
            async with engine.connect() as lock:
                if await lock.scalar(text("select pg_try_advisory_lock(:k)"), {"k": _SIG_LOCK}):
                    try:
                        await _signatures()
                    finally:
                        await lock.execute(text("select pg_advisory_unlock(:k)"), {"k": _SIG_LOCK})
                        await lock.commit()
        except Exception as exc:
            log.error("Lecture des signatures : %s", exc)
        await asyncio.sleep(20)


async def _zeko_one() -> bool:
    """Un courriel a la fois : d'abord les RDV (urgents), puis le classement des anciens « A classer »."""
    from app.models.mailbox import MailMessage
    async with AsyncSessionLocal() as db:
        msg = (await db.execute(select(MailMessage).where(MailMessage.zeko_rdv == "pending")
                                .order_by(MailMessage.sent_at.desc()).limit(1))).scalar_one_or_none()
        kind = "rdv"
        if not msg:
            msg = (await db.execute(select(MailMessage).where(MailMessage.zeko_classify == "pending")
                                    .order_by(MailMessage.sent_at.desc()).limit(1))).scalar_one_or_none()
            kind = "classify"
        if not msg:
            return False
        try:
            if kind == "rdv":
                await zeko_mail.rdv_with_zeko(db, msg)
            else:
                await zeko_mail.classify_with_zeko(db, msg)
        except zeko.ZekoUnavailable as exc:
            log.info("Zeko occupe ou desactive : %s", exc)
            return False
        except Exception as exc:
            log.warning("Zeko sur le courriel %s (%s) : %s", msg.id, kind, exc)
            if kind == "rdv":
                msg.zeko_rdv = "failed"
            else:
                msg.zeko_classify = "failed"
        await db.commit()
        return True


async def run_zeko_mail() -> None:
    await asyncio.sleep(40)
    while True:
        worked = False
        try:
            async with engine.connect() as lock:
                if await lock.scalar(text("select pg_try_advisory_lock(:k)"), {"k": _ZEKO_LOCK}):
                    try:
                        worked = await _zeko_one()
                    finally:
                        await lock.execute(text("select pg_advisory_unlock(:k)"), {"k": _ZEKO_LOCK})
                        await lock.commit()
        except Exception as exc:
            log.error("Zeko sur les courriels : %s", exc)
        await asyncio.sleep(2 if worked else 20)


async def run_mail_sync() -> None:
    log.info("Copie des boites de courriel demarree (intervalle %ds)", _INTERVAL)
    await asyncio.sleep(20)
    asyncio.create_task(run_signatures())
    asyncio.create_task(run_zeko_mail())
    while True:
        try:
            await sync_all()
        except Exception as exc:
            log.error("Copie des courriels : %s", exc)
        await asyncio.sleep(_INTERVAL)
