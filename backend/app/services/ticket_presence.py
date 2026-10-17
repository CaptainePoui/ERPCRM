"""Navigateur ferme = chronos de ticket en pause (TASK-006.5, cahier Zeko 3.2, 2026-10-17).

Chaque ecran ERPCRM ouvert envoie un battement toutes les 30 s (POST /tickets/timers/heartbeat, onglet en
arriere-plan compris : un navigateur ralentit ses minuteries a une par minute au pire). Sans battement depuis
ABSENCE, les chronos de ce technicien s'arretent a l'heure de son DERNIER battement -- pas a l'heure ou on s'en
rend compte : le temps non observe n'est jamais compte. Le technicien peut ensuite corriger le temps (clic sur le
chrono) s'il a continue a travailler.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.ticket import TicketTimePeriod
from app.models.user import User

log = logging.getLogger("ticket_presence")

ABSENCE = timedelta(minutes=5)
_INTERVAL = 30


async def pause_absent_once() -> int:
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(
            select(TicketTimePeriod, User.presence_at)
            .join(User, User.id == TicketTimePeriod.user_id)
            .where(TicketTimePeriod.ended_at.is_(None))
        )).all()
        n = 0
        for period, presence_at in rows:
            last = presence_at or period.started_at
            if now - last < ABSENCE:
                continue
            period.ended_at = max(last, period.started_at)
            period.stop_source = "navigateur_ferme"
            n += 1
        if n:
            await db.commit()
            log.info("%d chrono(s) de ticket mis en pause : aucun ecran ouvert depuis %s", n, ABSENCE)
        return n


async def run_presence_watcher() -> None:
    while True:
        try:
            await pause_absent_once()
        except Exception:
            log.exception("Surveillance de presence des chronos")
        await asyncio.sleep(_INTERVAL)
