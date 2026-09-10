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
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.core.crypto import encrypt
from app.core.google_calendar import is_configured, list_events, create_event, update_event, delete_event, REFRESH_TOKEN_KEY
from app.models.app_settings import AppSetting
from app.models.ticket import Ticket
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


async def _resolve_company_id(db: AsyncSession, company_id: uuid.UUID | None, contact_id: uuid.UUID | None) -> uuid.UUID | None:
    """Meme resolution que contacts.py : si aucune compagnie n'est fournie mais
    qu'un contact l'est, prend sa compagnie principale (is_primary), sinon la
    premiere compagnie active liee."""
    if company_id:
        return company_id
    if not contact_id:
        return None
    contact = await db.get(Contact, contact_id, options=[selectinload(Contact.contact_companies)])
    if not contact:
        return None
    active = [cc for cc in contact.contact_companies if cc.is_active]
    chosen = next((cc for cc in active if cc.is_primary), None) or (active[0] if active else None)
    return chosen.company_id if chosen else None


@router.post("/events")
async def create_google_event(payload: EventCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    event_id = await create_event(db, payload.title, payload.description or "", payload.location, payload.start, payload.end)
    if not event_id:
        raise HTTPException(status_code=400, detail="Échec de la création — Google Calendar est-il bien connecté ?")

    ticket_id = None
    resolved_company_id = await _resolve_company_id(db, payload.company_id, payload.contact_id)

    if resolved_company_id:
        local_start = payload.start.astimezone(_LOCAL_TZ)
        # RDV -> Ticket automatique (TASK-015.15) : un ticket est le seul
        # enregistrement du travail fait avec un client, plus une Task
        # separee comme avant (TASK-026.5, superseded). Cree directement
        # (pas via POST /v1/tickets) pour ne pas declencher le courriel
        # "ticket ouvert" -- un RDV n'est pas encore du travail effectue.
        ticket = Ticket(
            title=payload.title,
            description=payload.description,
            company_id=resolved_company_id,
            contact_id=payload.contact_id,
            priority="normal",
            status="en_cours",
            google_calendar_event_id=event_id,
            google_calendar_id="primary",
        )
        db.add(ticket)
        await db.flush()
        ticket_id = ticket.id

        if payload.send_confirmation and payload.contact_id:
            contact = await db.get(Contact, payload.contact_id)
            if contact and contact.email:
                h, m = divmod(int((payload.end - payload.start).total_seconds() // 60), 60)
                duration_label = f"{h}h" if m == 0 else f"{h}h{m:02d}" if h else f"{m} min"
                await send_rdv_confirmation_email(
                    to_email=contact.email,
                    appointment_id=str(ticket.id),
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

    return {"id": event_id, "calendar_id": "primary", "ticket_id": str(ticket_id) if ticket_id else None}


@router.get("/events/{event_id}/ticket")
async def get_event_ticket(event_id: str, calendar_id: str = Query("primary"), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Retrouve le ticket auto-cree pour un RDV donne (TASK-015.15) -- pour
    afficher le lien 'Ticket lie' en consultant un RDV existant."""
    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.company))
        .where(Ticket.google_calendar_event_id == event_id, Ticket.google_calendar_id == calendar_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        return None
    return {"id": str(ticket.id), "title": ticket.title, "company_name": ticket.company.name}


@router.put("/events")
async def update_google_event(payload: EventUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await update_event(db, payload.calendar_id, payload.event_id, payload.title, payload.description or "", payload.location, payload.start, payload.end)
    if not result:
        raise HTTPException(status_code=400, detail="Échec de la modification")

    # Le ticket auto-cree par ce RDV (TASK-015.15) doit rester en phase avec
    # ce qu'on ecrit dans le RDV -- sinon un titre/description corrige apres
    # coup dans le RDV ne se reflete jamais sur le ticket.
    result_ticket = await db.execute(
        select(Ticket).where(
            Ticket.google_calendar_event_id == payload.event_id,
            Ticket.google_calendar_id == payload.calendar_id,
        )
    )
    ticket = result_ticket.scalar_one_or_none()
    if ticket:
        ticket.title = payload.title
        ticket.description = payload.description
        await db.commit()

    return {"ok": True}


@router.delete("/events")
async def delete_google_event(payload: EventDelete, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ok = await delete_event(db, payload.calendar_id, payload.event_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Échec de la suppression")
    return {"ok": True}
