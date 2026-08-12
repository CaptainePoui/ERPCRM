"""
Module RDV en ligne (TASK-026) : reservation publique de plages horaires
(Appel ou RDV) tenant compte des heures d'ouverture, des feries du Quebec, des
RDV deja pris localement et (si configure) de l'agenda Google.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.business_hours import business_hours_for, SLOT_GRANULARITY_MINUTES, RDV_EARLIEST_START
from app.core import google_calendar
from app.models.appointment import Appointment, APPOINTMENT_TYPES
from app.models.entity import Entity, EntityType
from app.models.contact import Contact
from app.models.company import Company
from app.models.contact_company import ContactCompany
from app.models.task import Task
from app.core.email import send_rdv_confirmation_email

router = APIRouter()

_LOCAL_TZ = ZoneInfo("America/Montreal")
_LOOKAHEAD_DAYS = 45

_DURATION_RULES = {
    "appel": {"default": 30, "min": 30, "max": 120, "step": 15},
    "rdv":   {"default": 60, "min": 60, "max": 420, "step": 30},
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigOut(BaseModel):
    business_hours: dict[str, tuple[str, str]]
    rdv_earliest_start: str
    slot_granularity_minutes: int
    duration_rules: dict[str, dict[str, int]]


class DayAvailability(BaseModel):
    date: date
    slots: list[str]


class BookingRequest(BaseModel):
    appointment_type: str
    date: date
    time: str  # "HH:MM"
    duration_minutes: int
    address: str | None = None
    description: str
    first_name: str
    last_name: str
    email: EmailStr
    phone: str
    mobile: str | None = None
    company_name: str


class BookingOut(BaseModel):
    id: uuid.UUID
    appointment_type: str
    start_at: datetime
    duration_minutes: int


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_duration(appt_type: str, duration_minutes: int) -> None:
    if appt_type not in APPOINTMENT_TYPES:
        raise HTTPException(status_code=400, detail="Type de rendez-vous invalide")
    rules = _DURATION_RULES[appt_type]
    if duration_minutes < rules["min"] or duration_minutes > rules["max"] or duration_minutes % rules["step"] != 0:
        raise HTTPException(status_code=400, detail="Duree invalide pour ce type de rendez-vous")


def _earliest_start(appt_type: str, now_local: datetime) -> datetime:
    if appt_type == "appel":
        return now_local + timedelta(hours=1)
    tomorrow = (now_local + timedelta(days=1)).date()
    return datetime.combine(tomorrow, time(0, 0), tzinfo=_LOCAL_TZ)


def _day_slots(appt_type: str, duration_minutes: int, d: date, earliest: datetime, busy: list[tuple[datetime, datetime]]) -> list[time]:
    hours = business_hours_for(d)
    if hours is None:
        return []
    open_t, close_t = hours
    open_dt = datetime.combine(d, open_t, tzinfo=_LOCAL_TZ)
    close_dt = datetime.combine(d, close_t, tzinfo=_LOCAL_TZ)
    if appt_type == "rdv":
        rdv_open = datetime.combine(d, RDV_EARLIEST_START, tzinfo=_LOCAL_TZ)
        open_dt = max(open_dt, rdv_open)

    slots = []
    cur = open_dt
    step = timedelta(minutes=SLOT_GRANULARITY_MINUTES)
    dur = timedelta(minutes=duration_minutes)
    while cur + dur <= close_dt:
        if cur >= earliest:
            slot_end = cur + dur
            overlap = any(cur < b_end and slot_end > b_start for b_start, b_end in busy)
            if not overlap:
                slots.append(cur.time())
        cur += step
    return slots


async def _local_busy_blocks(db: AsyncSession, range_start_utc: datetime, range_end_utc: datetime) -> list[tuple[datetime, datetime]]:
    result = await db.execute(
        select(Appointment).where(
            Appointment.status == "confirme",
            Appointment.start_at < range_end_utc,
            Appointment.start_at > range_start_utc - timedelta(hours=8),
        )
    )
    blocks = []
    for a in result.scalars().all():
        end = a.start_at + timedelta(minutes=a.duration_minutes)
        if end > range_start_utc:
            blocks.append((a.start_at, end))
    return blocks


# ── Endpoints publics ─────────────────────────────────────────────────────────

@router.get("/config", response_model=ConfigOut)
async def get_config():
    from app.core.business_hours import BUSINESS_HOURS
    return ConfigOut(
        business_hours={str(k): (v[0].strftime("%H:%M"), v[1].strftime("%H:%M")) for k, v in BUSINESS_HOURS.items()},
        rdv_earliest_start=RDV_EARLIEST_START.strftime("%H:%M"),
        slot_granularity_minutes=SLOT_GRANULARITY_MINUTES,
        duration_rules=_DURATION_RULES,
    )


@router.get("/availability", response_model=list[DayAvailability])
async def get_availability(appointment_type: str, duration_minutes: int, db: AsyncSession = Depends(get_db)):
    _validate_duration(appointment_type, duration_minutes)

    now_local = datetime.now(_LOCAL_TZ)
    earliest = _earliest_start(appointment_type, now_local)
    range_start_local = datetime.combine(now_local.date(), time(0, 0), tzinfo=_LOCAL_TZ)
    range_end_local = range_start_local + timedelta(days=_LOOKAHEAD_DAYS)

    local_busy = await _local_busy_blocks(db, range_start_local.astimezone(timezone.utc), range_end_local.astimezone(timezone.utc))
    google_busy = await google_calendar.busy_blocks(db, range_start_local.astimezone(timezone.utc), range_end_local.astimezone(timezone.utc))
    busy_local_tz = [(b_start.astimezone(_LOCAL_TZ), b_end.astimezone(_LOCAL_TZ)) for b_start, b_end in (local_busy + google_busy)]

    days_out = []
    for i in range(_LOOKAHEAD_DAYS):
        d = (now_local + timedelta(days=i)).date()
        slots = _day_slots(appointment_type, duration_minutes, d, earliest, busy_local_tz)
        if slots:
            days_out.append(DayAvailability(date=d, slots=[t.strftime("%H:%M") for t in slots]))
    return days_out


@router.post("/book", response_model=BookingOut, status_code=201)
async def book_appointment(payload: BookingRequest, db: AsyncSession = Depends(get_db)):
    _validate_duration(payload.appointment_type, payload.duration_minutes)
    if payload.appointment_type == "rdv" and not payload.address:
        raise HTTPException(status_code=400, detail="Adresse requise pour un rendez-vous")

    try:
        hh, mm = (int(x) for x in payload.time.split(":"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Heure invalide")
    start_local = datetime(payload.date.year, payload.date.month, payload.date.day, hh, mm, tzinfo=_LOCAL_TZ)

    now_local = datetime.now(_LOCAL_TZ)
    earliest = _earliest_start(payload.appointment_type, now_local)
    range_start_utc = start_local.astimezone(timezone.utc) - timedelta(hours=1)
    range_end_utc = (start_local + timedelta(minutes=payload.duration_minutes)).astimezone(timezone.utc) + timedelta(hours=1)
    local_busy = await _local_busy_blocks(db, range_start_utc, range_end_utc)
    google_busy = await google_calendar.busy_blocks(db, range_start_utc, range_end_utc)
    busy_local_tz = [(b_start.astimezone(_LOCAL_TZ), b_end.astimezone(_LOCAL_TZ)) for b_start, b_end in (local_busy + google_busy)]

    valid_slots = _day_slots(payload.appointment_type, payload.duration_minutes, payload.date, earliest, busy_local_tz)
    if time(hh, mm) not in valid_slots:
        raise HTTPException(status_code=409, detail="Cette plage n'est plus disponible, veuillez en choisir une autre")

    # Nouveau contact + compagnie (toujours crees, pas de fusion avec un client existant)
    company_entity = Entity(entity_type=EntityType.company)
    db.add(company_entity)
    await db.flush()
    company = Company(id=company_entity.id, name=payload.company_name)
    db.add(company)

    contact_entity = Entity(entity_type=EntityType.person)
    db.add(contact_entity)
    await db.flush()
    contact = Contact(
        id=contact_entity.id,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=payload.email,
        phone=payload.phone,
        mobile=payload.mobile,
    )
    db.add(contact)
    await db.flush()

    db.add(ContactCompany(contact_id=contact.id, company_id=company.id, email=payload.email, is_primary=True))

    label = "Appel" if payload.appointment_type == "appel" else "RDV"
    task_description = payload.description
    if payload.address:
        task_description = f"Adresse : {payload.address}\n\n{task_description}"
    task = Task(
        title=f"{label} — {payload.first_name} {payload.last_name}",
        description=task_description,
        company_id=company.id,
        contact_id=contact.id,
        due_date=payload.date,
        due_time=payload.time,
        priority="normale",
        status="en_cours",
    )
    db.add(task)
    await db.flush()

    start_utc = start_local.astimezone(timezone.utc)
    end_utc = start_utc + timedelta(minutes=payload.duration_minutes)
    google_event_id = await google_calendar.create_event(
        db,
        summary=f"{label} — {payload.first_name} {payload.last_name} ({payload.company_name})",
        description=task_description,
        address=payload.address,
        start_utc=start_utc,
        end_utc=end_utc,
    )

    appt = Appointment(
        type=payload.appointment_type,
        start_at=start_utc,
        duration_minutes=payload.duration_minutes,
        address=payload.address,
        description=payload.description,
        contact_id=contact.id,
        company_id=company.id,
        task_id=task.id,
        google_event_id=google_event_id,
    )
    db.add(appt)
    await db.commit()

    h, m = divmod(payload.duration_minutes, 60)
    duration_label = f"{h}h" if m == 0 else f"{h}h{m:02d}" if h else f"{m} min"
    await send_rdv_confirmation_email(
        to_email=payload.email,
        appointment_id=str(appt.id),
        label=label,
        date_label=payload.date.strftime("%Y-%m-%d"),
        time=payload.time,
        duration_label=duration_label,
        address=payload.address,
        description=payload.description,
        attendee_name=f"{payload.first_name} {payload.last_name}",
        start_utc=start_utc,
        end_utc=end_utc,
    )

    return BookingOut(id=appt.id, appointment_type=appt.type, start_at=start_utc, duration_minutes=appt.duration_minutes)
