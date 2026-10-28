"""Disponibilites par technicien pour la prise de RDV en ligne (TASK-026.11, 2026-10-27).

Philippe : « le choix du tech et leurs disponibilites ; je ne veux pas que le client voie les RDV, juste les
disponibilites, avec 30 min avant et 30 min apres pour moi, les employes 0 min (option modifiable) ».

Occupe pour un technicien = plages occupees de SES agendas Google (freebusy : un evenement marque « Disponible » ne
bloque pas, comme avant) + les RDV dont le ticket lui est assigne (quel que soit l'agenda ou ils sont ecrits),
elargis de SA marge : il faut `buffer_before` minutes libres avant le RDV propose et `buffer_after` apres.
Sans Google : les RDV pris ici (table appointments) bloquent tout le monde, comme avant.
Seules des heures sortent d'ici, jamais un titre ou un detail de RDV.
"""
from __future__ import annotations

import asyncio
import logging
import time as _time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

log = logging.getLogger("booking")
_TTL = 60
_cache: dict = {}


def initials(name: str) -> str:
    parts = [p for p in (name or "").split() if p]
    return "".join(p[0] for p in parts[:2]).upper() or "?"


async def techs(db) -> list[dict]:
    """Techniciens proposes aux clients (Employes -> Agenda : « Reservable en ligne »), avec un compte de connexion."""
    from app.models.contact import Contact
    from app.models.employee import Employee
    rows = (await db.execute(select(Employee, Contact).join(Contact, Contact.id == Employee.contact_id).where(
        Employee.is_active.is_(True), Employee.booking_enabled.is_(True), Employee.user_id.is_not(None))
        .order_by(Contact.first_name, Contact.last_name))).all()
    out = []
    for e, c in rows:
        name = e.booking_name or f"{c.first_name} {c.last_name}".strip()
        out.append({"id": str(e.contact_id), "user_id": e.user_id, "name": name, "initials": initials(name),
                    "buffer_before": int(e.buffer_before or 0), "buffer_after": int(e.buffer_after or 0),
                    "calendars": list(e.busy_calendars or [])})
    return out


async def tech_of_user(db, user_id) -> dict | None:
    if not user_id:
        return None
    return next((t for t in await techs(db) if str(t["user_id"]) == str(user_id)), None)


async def _cached(key, fn):
    hit = _cache.get(key)
    if hit and _time.monotonic() - hit[0] < _TTL:
        return hit[1]
    val = await fn()
    _cache[key] = (_time.monotonic(), val)
    return val


def invalidate() -> None:
    _cache.clear()


async def _freebusy(db, calendars: list[str], start_utc: datetime, end_utc: datetime) -> list[tuple[datetime, datetime]]:
    from app.core import google_calendar as g
    if not calendars:
        return []
    token = await g._get_refresh_token(db)
    if not token:
        return []

    async def run():
        try:
            return await asyncio.to_thread(g._busy_blocks_sync, token, calendars, start_utc, end_utc)
        except Exception:
            log.exception("freebusy Google impossible")
            return []
    return await _cached(("fb", tuple(sorted(calendars)), start_utc.date(), end_utc.date()), run)


async def _assigned_blocks(db, user_id, start_utc: datetime, end_utc: datetime, exclude_event_id: str | None) -> list[tuple[datetime, datetime]]:
    """RDV dont le ticket est assigne a ce technicien (heures seulement)."""
    from app.core import google_calendar as g
    from app.models.ticket import Ticket
    ids = set((await db.execute(select(Ticket.google_calendar_event_id).where(
        Ticket.assigned_to_id == user_id, Ticket.google_calendar_event_id.is_not(None)))).scalars().all())
    ids.discard(exclude_event_id)
    if not ids:
        return []
    events = await _cached(("ev", start_utc.date(), end_utc.date()), lambda: g.list_events(db, start_utc, end_utc))
    out = []
    for e in events:
        if e["id"] in ids and not e.get("all_day"):
            out.append((datetime.fromisoformat(e["start"]), datetime.fromisoformat(e["end"])))
    return out


async def busy_for(db, tech: dict, start_utc: datetime, end_utc: datetime, exclude_event_id: str | None = None,
                   margins: tuple[int, int] | None = None) -> list[tuple[datetime, datetime]]:
    """Plages a eviter pour ce technicien, deja elargies de sa marge (ou de `margins` = (avant, apres))."""
    from app.api.v1.endpoints.appointments import _local_busy_blocks
    from app.core import google_calendar as g
    before, after = margins or (tech["buffer_before"], tech["buffer_after"])
    raw = []
    if await g.is_configured(db):
        cal_busy = await _freebusy(db, tech["calendars"], start_utc, end_utc)
        if exclude_event_id:
            # le RDV qu'on deplace ne doit pas se bloquer lui-meme : son heure est retiree des plages de freebusy
            ev = await _cached(("ev", start_utc.date(), end_utc.date()), lambda: g.list_events(db, start_utc, end_utc))
            mine = next(((datetime.fromisoformat(e["start"]), datetime.fromisoformat(e["end"])) for e in ev if e["id"] == exclude_event_id), None)
            if mine:
                cal_busy = [b for b in cal_busy if not (b[0] >= mine[0] and b[1] <= mine[1])]
        raw += cal_busy
        raw += await _assigned_blocks(db, tech["user_id"], start_utc, end_utc, exclude_event_id)
    else:
        raw += await _local_busy_blocks(db, start_utc, end_utc)
    b, a = timedelta(minutes=before), timedelta(minutes=after)
    return [(s - a, e + b) for s, e in raw]
