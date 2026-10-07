"""Avis Interac (TASK-042.5) : toutes les 15 minutes, si active dans Parametres -- recupere les nouveaux
courriels Interac (lecture seule), les fait lire par l'IA locale un a un, puis les relie aux depots."""
import asyncio
import logging

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core import interac_mail as im
from app.models.bank_account import InteracNotice

log = logging.getLogger("interac_poller")
_POLL_INTERVAL = 15 * 60


async def run_interac_once() -> dict:
    async with AsyncSessionLocal() as db:
        cfg = await im.load_config(db)
        if not (cfg["enabled"] and cfg["host"] and cfg["user"] and cfg["password"]):
            return {"skipped": True}
        known = set((await db.execute(select(InteracNotice.message_id))).scalars().all())
    new, total = await asyncio.to_thread(im.fetch_sync, cfg, known)
    async with AsyncSessionLocal() as db:
        for m in new:
            db.add(InteracNotice(**m))
        await db.commit()
    parsed = 0
    if settings.LOCAL_AI_URL:
        while True:
            async with AsyncSessionLocal() as db:
                nt = (await db.execute(select(InteracNotice).where(InteracNotice.status == "pending")
                                       .order_by(InteracNotice.received_at.desc().nulls_last()).limit(1))).scalar_one_or_none()
                if not nt:
                    break
                try:
                    im.parse_result(await im.ai_parse(nt.subject or "", nt.body or ""), nt, f"{nt.subject}\n{nt.body}")
                except Exception as e:      # noqa: BLE001 -- un avis illisible ne bloque pas les autres
                    nt.status, nt.error = "failed", str(e)[:500]
                await db.commit()
                parsed += 1
    async with AsyncSessionLocal() as db:
        matched = await im.match_notices(db)
        await db.commit()
    if new or matched:
        log.info("Avis Interac : %d nouveaux, %d lus, %d relies a un depot", len(new), parsed, matched)
    return {"new": len(new), "parsed": parsed, "matched": matched, "interac_in_mailbox": total}


async def run_interac_poller():
    await asyncio.sleep(120)
    while True:
        try:
            await run_interac_once()
        except Exception:
            log.exception("Lecture des avis Interac echouee")
        await asyncio.sleep(_POLL_INTERVAL)
