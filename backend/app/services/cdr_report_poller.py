"""Poller des rapports CDR programmes (TASK-032.2) -- meme pattern que
backup_poller.py : verifie chaque minute si un rapport a atteint son heure
planifiee (fuseau propre au rapport) et son jour de recurrence."""
import asyncio
import logging

from app.workers.cdr_report_runner import run_scheduled

log = logging.getLogger("cdr_report_poller")

_POLL_INTERVAL = 60  # seconds


async def run_cdr_report_poller():
    while True:
        try:
            await run_scheduled()
        except Exception:
            log.exception("Iteration du poller de rapports CDR echouee")
        await asyncio.sleep(_POLL_INTERVAL)
