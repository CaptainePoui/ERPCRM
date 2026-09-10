"""
Script ponctuel (2026-08-26) : relie retroactivement les Task deja creees par
create_google_event (avant l'ajout de google_calendar_event_id/google_calendar_id)
a leur evenement Google Calendar correspondant, pour que l'agenda les affiche en
une seule carte fusionnee au lieu de deux entrees separees qui semblaient dupliquees.

Correspondance UNIQUEMENT quand elle est certaine : meme titre exact + meme date +
meme heure de debut, et un seul evenement candidat pour cette combinaison. Aucune
tache n'est modifiee si le match est ambigu (plusieurs candidats) ou absent -- pas
de supposition, on prefere laisser une tache non liee plutot que de mal la lier.

Usage: venv/bin/python3 link_tasks_to_calendar_retroactive.py
"""
import asyncio
from datetime import datetime, timedelta, timezone
from collections import defaultdict

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.google_calendar import list_events
from app.models.task import Task


async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Task).where(
                Task.google_calendar_event_id.is_(None),
                Task.due_date.isnot(None),
                (Task.company_id.isnot(None)) | (Task.contact_id.isnot(None)),
            )
        )
        candidates = result.scalars().all()
        print(f"{len(candidates)} tache(s) candidate(s) (sans lien, avec compagnie/contact, avec date).")
        if not candidates:
            return

        dates = [t.due_date for t in candidates]
        start = datetime.combine(min(dates), datetime.min.time(), tzinfo=timezone.utc) - timedelta(days=1)
        end = datetime.combine(max(dates), datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=2)

        events = await list_events(db, start, end)
        print(f"{len(events)} evenement(s) Google Calendar recuperes entre {start.date()} et {end.date()}.")

        # index (titre, date, heure locale HH:MM) -> liste d'evenements
        by_key = defaultdict(list)
        for e in events:
            try:
                ev_start = datetime.fromisoformat(e["start"].replace("Z", "+00:00"))
            except ValueError:
                continue
            key = (e["title"].strip(), ev_start.date().isoformat(), ev_start.strftime("%H:%M"))
            by_key[key].append(e)

        linked, ambiguous, unmatched = 0, 0, 0
        for t in candidates:
            key = (t.title.strip(), t.due_date.isoformat(), t.due_time)
            matches = by_key.get(key, [])
            if len(matches) == 1:
                t.google_calendar_event_id = matches[0]["id"]
                t.google_calendar_id = matches[0]["calendar_id"]
                linked += 1
                print(f"  LIE   : \"{t.title}\" ({t.due_date} {t.due_time}) -> event {matches[0]['id']}")
            elif len(matches) > 1:
                ambiguous += 1
                print(f"  AMBIGU: \"{t.title}\" ({t.due_date} {t.due_time}) -- {len(matches)} evenements candidats, non lie")
            else:
                unmatched += 1

        await db.commit()
        print(f"\nResume : {linked} liee(s), {ambiguous} ambigue(s) (non liees), {unmatched} sans evenement correspondant (non liees).")


if __name__ == "__main__":
    asyncio.run(main())
