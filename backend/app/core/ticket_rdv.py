"""Heure du RDV d'un ticket (TASK-047.12, Philippe 2026-11-01 : « si un ticket a un rdv, il ne doit pas figurer dans les
alertes s'il n'est pas échu »).

Le RDV vit dans Google Agenda (tickets.google_calendar_event_id) ; tickets.rdv_start en garde l'heure pour la cloche :
- écrite tout de suite quand le RDV est créé / modifié / relié dans ERPCRM ;
- relue de Google toutes les 10 min (un RDV déplacé directement dans Google, TASK-026.6) : les événements de la veille à
  dans 120 jours ; un RDV à venir qu'on ne retrouve plus (supprimé ou repoussé au-delà) -> heure effacée, le ticket
  revient dans la cloche (jamais caché par erreur).
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

log = logging.getLogger("ticket_rdv")
INTERVAL = 600


def _parse(v: str | None) -> datetime | None:
    if not v:
        return None
    try:
        d = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)      # journée entière : minuit


async def refresh(db) -> int:
    """Relit les RDV dans Google ; retourne le nombre de tickets changés."""
    from app.core import google_calendar
    from app.models.ticket import Ticket
    if not await google_calendar.is_configured(db):
        return 0
    now = datetime.now(timezone.utc)
    events = await google_calendar.list_events(db, now - timedelta(days=1), now + timedelta(days=120))
    if not events:
        return 0                                       # Google injoignable ou vide : on ne touche à rien
    starts = {e["id"]: _parse(e["start"]) for e in events if e.get("id")}
    rows = (await db.execute(select(Ticket).where(Ticket.google_calendar_event_id.is_not(None)))).scalars().all()
    n = 0
    for t in rows:
        new = starts.get(t.google_calendar_event_id)
        if new is None and not (t.rdv_start and t.rdv_start > now):
            continue                                   # passé depuis plus d'un jour : l'heure gardée suffit
        if new != t.rdv_start:
            t.rdv_start = new
            n += 1
    await db.commit()
    return n


async def run_refresher():
    from app.core.database import AsyncSessionLocal
    await asyncio.sleep(45)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await refresh(db)
        except Exception:
            log.exception("Relecture des RDV des tickets échouée")
        await asyncio.sleep(INTERVAL)
