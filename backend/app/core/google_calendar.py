"""
Integration Google Calendar (TASK-026) : lecture des plages occupees + des
evenements (agenda perso de Philippe, partage avec acces complet au compte
dedie agenda@simpleip.tel + le calendrier "primary" de ce compte, ou les RDV
sont ecrits) et ecriture des RDV. Les calendriers accessibles sont decouverts
automatiquement via calendarList() -- aucun ID a configurer manuellement,
Philippe n'a qu'a partager ses agendas avec agenda@simpleip.tel dans Google.

Le refresh token est obtenu via le flux OAuth natif (Admin > Google Calendar >
Connecter, voir endpoints/google_oauth.py) et stocke chiffre (Fernet) dans
app_settings -- jamais en .env. Degrade silencieusement si non connecte (meme
convention que SMTP_HOST vide dans email.py).
"""
import asyncio
import logging
from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt
from app.models.app_settings import AppSetting

log = logging.getLogger("google_calendar")

REFRESH_TOKEN_KEY = "google_refresh_token_enc"

# Couleur des evenements crees par ERPCRM (colorId Google Calendar) -- distincte
# de la couleur par defaut utilisee quand Philippe ecrit lui-meme un evenement.
_ERPCRM_EVENT_COLOR_ID = "9"  # "Myrtille" (bleu fonce) dans la palette Google


async def _get_refresh_token(db: AsyncSession) -> str | None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == REFRESH_TOKEN_KEY))
    row = result.scalar_one_or_none()
    if not row or not row.value:
        return None
    try:
        return decrypt(row.value)
    except Exception:
        log.exception("Echec dechiffrement du refresh token Google")
        return None


async def is_configured(db: AsyncSession) -> bool:
    if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        return False
    return await _get_refresh_token(db) is not None


def _service(refresh_token: str):
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = Credentials(
        None,
        refresh_token=refresh_token,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=[
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.freebusy",
            "https://www.googleapis.com/auth/calendar.readonly",
        ],
    )
    creds.refresh(Request())
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


# Palette officielle des colorId d'evenements Google Calendar (stable, documentee)
EVENT_COLOR_MAP = {
    "1": "#7986cb", "2": "#33b679", "3": "#8e24aa", "4": "#e67c73",
    "5": "#f6bf26", "6": "#f4511e", "7": "#039be5", "8": "#616161",
    "9": "#3f51b5", "10": "#0b8043", "11": "#d60000",
}


def _list_calendars_meta_sync(refresh_token: str) -> dict[str, str]:
    """{calendar_id: couleur par defaut du calendrier (hex)}."""
    service = _service(refresh_token)
    resp = service.calendarList().list().execute()
    return {
        c["id"]: c.get("backgroundColor", "#6B7280")
        for c in resp.get("items", [])
        if not c.get("hidden") and not c.get("deleted")
    }


async def _calendars_meta(db: AsyncSession) -> dict[str, str]:
    token = await _get_refresh_token(db)
    if not token:
        return {}
    try:
        return await asyncio.to_thread(_list_calendars_meta_sync, token)
    except Exception:
        log.exception("Echec decouverte des calendriers Google")
        return {"primary": "#6B7280"}


async def list_calendar_ids(db: AsyncSession) -> list[str]:
    """Decouvre automatiquement tous les calendriers accessibles au compte
    connecte (le sien + tout calendrier partage avec lui, ex: l'agenda perso
    de Philippe) -- pas d'ID a configurer a la main."""
    return list(await _calendars_meta(db))


def _busy_blocks_sync(refresh_token: str, calendar_ids: list[str], start_utc: datetime, end_utc: datetime) -> list[tuple[datetime, datetime]]:
    service = _service(refresh_token)
    body = {
        "timeMin": start_utc.isoformat(),
        "timeMax": end_utc.isoformat(),
        "items": [{"id": cid} for cid in calendar_ids],
    }
    resp = service.freebusy().query(body=body).execute()
    blocks = []
    for cal in resp.get("calendars", {}).values():
        for b in cal.get("busy", []):
            blocks.append((
                datetime.fromisoformat(b["start"].replace("Z", "+00:00")),
                datetime.fromisoformat(b["end"].replace("Z", "+00:00")),
            ))
    return blocks


async def busy_blocks(db: AsyncSession, start_utc: datetime, end_utc: datetime) -> list[tuple[datetime, datetime]]:
    token = await _get_refresh_token(db)
    if not token:
        return []
    calendar_ids = await list_calendar_ids(db)
    if not calendar_ids:
        return []
    try:
        return await asyncio.to_thread(_busy_blocks_sync, token, calendar_ids, start_utc, end_utc)
    except Exception:
        log.exception("Echec requete freebusy Google Calendar")
        return []


def _list_events_sync(refresh_token: str, calendar_colors: dict[str, str], start_utc: datetime, end_utc: datetime) -> list[dict]:
    service = _service(refresh_token)
    events = []
    for cid, default_color in calendar_colors.items():
        try:
            resp = service.events().list(
                calendarId=cid,
                timeMin=start_utc.isoformat(),
                timeMax=end_utc.isoformat(),
                singleEvents=True,
                orderBy="startTime",
            ).execute()
        except Exception:
            log.exception("Echec lecture des evenements du calendrier %s", cid)
            continue
        for e in resp.get("items", []):
            start = e.get("start", {}).get("dateTime") or e.get("start", {}).get("date")
            end = e.get("end", {}).get("dateTime") or e.get("end", {}).get("date")
            if not start or not end:
                continue
            events.append({
                "id": e.get("id"),
                "calendar_id": cid,
                "title": e.get("summary", "(Sans titre)"),
                "description": e.get("description"),
                "start": start,
                "end": end,
                "all_day": "date" in e.get("start", {}),
                "location": e.get("location"),
                "color": EVENT_COLOR_MAP.get(e.get("colorId"), default_color),
                "editable": "#holiday@group.v.calendar.google.com" not in cid,
            })
    return events


async def list_events(db: AsyncSession, start_utc: datetime, end_utc: datetime) -> list[dict]:
    """Evenements (titre, heure, lieu, couleur) de tous les calendriers
    accessibles -- pour la vue Agenda fusionnee d'ERPCRM (TASK-026.3)."""
    token = await _get_refresh_token(db)
    if not token:
        return []
    calendar_colors = await _calendars_meta(db)
    if not calendar_colors:
        return []
    try:
        return await asyncio.to_thread(_list_events_sync, token, calendar_colors, start_utc, end_utc)
    except Exception:
        log.exception("Echec liste des evenements Google Calendar")
        return []


def _create_event_sync(refresh_token: str, summary: str, description: str, address: str | None, start_utc: datetime, end_utc: datetime) -> str | None:
    service = _service(refresh_token)
    event = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_utc.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.isoformat(), "timeZone": "UTC"},
        "colorId": _ERPCRM_EVENT_COLOR_ID,
    }
    if address:
        event["location"] = address
    created = service.events().insert(calendarId="primary", body=event).execute()
    return created.get("id")


async def create_event(db: AsyncSession, summary: str, description: str, address: str | None, start_utc: datetime, end_utc: datetime) -> str | None:
    token = await _get_refresh_token(db)
    if not token:
        return None
    try:
        return await asyncio.to_thread(_create_event_sync, token, summary, description, address, start_utc, end_utc)
    except Exception:
        log.exception("Echec creation evenement Google Calendar")
        return None


def _update_event_sync(refresh_token: str, calendar_id: str, event_id: str, summary: str, description: str, location: str | None, start_utc: datetime, end_utc: datetime) -> str | None:
    service = _service(refresh_token)
    event = {
        "summary": summary,
        "description": description or "",
        "start": {"dateTime": start_utc.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end_utc.isoformat(), "timeZone": "UTC"},
    }
    if location:
        event["location"] = location
    updated = service.events().patch(calendarId=calendar_id, eventId=event_id, body=event).execute()
    return updated.get("id")


async def update_event(db: AsyncSession, calendar_id: str, event_id: str, summary: str, description: str, location: str | None, start_utc: datetime, end_utc: datetime) -> str | None:
    token = await _get_refresh_token(db)
    if not token:
        return None
    try:
        return await asyncio.to_thread(_update_event_sync, token, calendar_id, event_id, summary, description, location, start_utc, end_utc)
    except Exception:
        log.exception("Echec modification evenement Google Calendar")
        return None


def _delete_event_sync(refresh_token: str, calendar_id: str, event_id: str) -> None:
    service = _service(refresh_token)
    service.events().delete(calendarId=calendar_id, eventId=event_id).execute()


async def delete_event(db: AsyncSession, calendar_id: str, event_id: str) -> bool:
    token = await _get_refresh_token(db)
    if not token:
        return False
    try:
        await asyncio.to_thread(_delete_event_sync, token, calendar_id, event_id)
        return True
    except Exception:
        log.exception("Echec suppression evenement Google Calendar")
        return False
