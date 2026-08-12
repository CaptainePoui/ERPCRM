"""
Connexion Google Calendar native (TASK-026) : bouton "Connecter" dans Admin,
flux OAuth complet gere par ERPCRM lui-meme (pas de copie manuelle de refresh
token via OAuth Playground). Le refresh token est stocke chiffre en base.
"""
import secrets
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.crypto import encrypt
from app.core.google_calendar import is_configured, list_events, create_event, update_event, delete_event, REFRESH_TOKEN_KEY
from app.models.app_settings import AppSetting
from app.models.task import Task
from app.models.contact import Contact
from app.core.email import send_rdv_confirmation_email
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User

router = APIRouter()

_SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.readonly"
_STATE_KEY = "google_oauth_state"
_LOCAL_TZ = ZoneInfo("America/Montreal")


def _redirect_uri() -> str:
    return f"{settings.PUBLIC_BASE_URL}/api/v1/google-calendar/callback"


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


async def _set_setting(db: AsyncSession, key: str, value: str):
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return {
        "connected": await is_configured(db),
        "client_configured": bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET),
    }


@router.get("/connect")
async def connect(db: AsyncSession = Depends(get_db)):
    if not (settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configures dans .env")
    state = secrets.token_urlsafe(24)
    await _set_setting(db, _STATE_KEY, state)
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": _SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@router.get("/callback")
async def callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    if error:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?google_calendar=error")

    saved_state = await _get_setting(db, _STATE_KEY)
    if not state or not saved_state or state != saved_state:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?google_calendar=csrf")

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": _redirect_uri(),
            "grant_type": "authorization_code",
        })
    data = r.json()
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?google_calendar=no_refresh_token")

    await _set_setting(db, REFRESH_TOKEN_KEY, encrypt(refresh_token))
    return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?google_calendar=connected")


@router.post("/disconnect")
async def disconnect(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _set_setting(db, REFRESH_TOKEN_KEY, "")
    return {"ok": True}


@router.get("/events")
async def events(
    start: datetime = Query(...),
    end: datetime = Query(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Evenements de tous les calendriers Google accessibles (perso + agenda@simpleip.tel)
    dans la plage donnee -- pour la vue Agenda fusionnee d'ERPCRM (TASK-026.3)."""
    return await list_events(db, start, end)


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    start: datetime
    end: datetime
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    send_confirmation: bool = False


class EventUpdate(BaseModel):
    calendar_id: str
    event_id: str
    title: str
    description: str | None = None
    location: str | None = None
    start: datetime
    end: datetime


class EventDelete(BaseModel):
    calendar_id: str
    event_id: str


@router.post("/events")
async def create_google_event(payload: EventCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    event_id = await create_event(db, payload.title, payload.description or "", payload.location, payload.start, payload.end)
    if not event_id:
        raise HTTPException(status_code=400, detail="Échec de la création — Google Calendar est-il bien connecté ?")

    if payload.company_id or payload.contact_id:
        local_start = payload.start.astimezone(_LOCAL_TZ)
        local_end = payload.end.astimezone(_LOCAL_TZ)
        task = Task(
            title=payload.title,
            description=payload.description,
            company_id=payload.company_id,
            contact_id=payload.contact_id,
            due_date=local_start.date(),
            due_time=local_start.strftime("%H:%M"),
            priority="normale",
            status="en_cours",
        )
        db.add(task)
        await db.flush()

        if payload.send_confirmation and payload.contact_id:
            contact = await db.get(Contact, payload.contact_id)
            if contact and contact.email:
                h, m = divmod(int((payload.end - payload.start).total_seconds() // 60), 60)
                duration_label = f"{h}h" if m == 0 else f"{h}h{m:02d}" if h else f"{m} min"
                await send_rdv_confirmation_email(
                    to_email=contact.email,
                    appointment_id=str(task.id),
                    label=payload.title,
                    date_label=local_start.strftime("%Y-%m-%d"),
                    time=local_start.strftime("%H:%M"),
                    duration_label=duration_label,
                    address=payload.location,
                    description=payload.description or "",
                    attendee_name=f"{contact.first_name} {contact.last_name}".strip(),
                    start_utc=payload.start,
                    end_utc=payload.end,
                )

        await db.commit()

    return {"id": event_id, "calendar_id": "primary"}


@router.put("/events")
async def update_google_event(payload: EventUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await update_event(db, payload.calendar_id, payload.event_id, payload.title, payload.description or "", payload.location, payload.start, payload.end)
    if not result:
        raise HTTPException(status_code=400, detail="Échec de la modification")
    return {"ok": True}


@router.delete("/events")
async def delete_google_event(payload: EventDelete, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ok = await delete_event(db, payload.calendar_id, payload.event_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Échec de la suppression")
    return {"ok": True}
