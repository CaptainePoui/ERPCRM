"""
Module RDV en ligne (TASK-026) : reservation publique de plages horaires
(Appel ou RDV) tenant compte des heures d'ouverture, des feries du Quebec, des
RDV deja pris localement et (si configure) de l'agenda Google.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.business_hours import business_hours_for, lunch_for, slot_minutes, rdv_earliest_start
from app.core import agenda_config
from app.core import google_calendar
from app.models.appointment import Appointment, APPOINTMENT_TYPES
from app.models.entity import Entity, EntityType
from app.models.contact import Contact
from app.models.company import Company
from app.models.contact_company import ContactCompany
from app.models.ticket import Ticket
from app.core.email import send_rdv_confirmation_email

router = APIRouter()

_LOCAL_TZ = ZoneInfo("America/Montreal")
# Horizon, durees et delais : reglables (TASK-026.10, Administration -> Configuration generale -> Agenda)
def _lookahead_days() -> int:
    return int(agenda_config.current()["lookahead_days"])


def _duration_rules() -> dict:
    return agenda_config.current()["durations"]


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConfigOut(BaseModel):
    business_hours: dict[str, tuple[str, str]]
    rdv_earliest_start: str
    slot_granularity_minutes: int
    online_slot_minutes: int = 60
    rdv_min_delay_days: int = 1
    urgent_notice: str = ""
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
    tech_id: str | None = None       # TASK-026.11 : technicien choisi ; vide / « any » = premier disponible
    urgent: bool = False             # TASK-026.13 : bouton Urgence (300 $/h, 2 h minimum, accepte par le client)


class BookingOut(BaseModel):
    id: uuid.UUID
    appointment_type: str
    start_at: datetime
    duration_minutes: int
    tech_name: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_duration(appt_type: str, duration_minutes: int) -> None:
    if appt_type not in APPOINTMENT_TYPES:
        raise HTTPException(status_code=400, detail="Type de rendez-vous invalide")
    rules = _duration_rules()[appt_type]
    if duration_minutes < rules["min"] or duration_minutes > rules["max"] or duration_minutes % rules["step"] != 0:
        raise HTTPException(status_code=400, detail="Duree invalide pour ce type de rendez-vous")


def _earliest_start(appt_type: str, now_local: datetime) -> datetime:
    cfg = agenda_config.current()
    if appt_type in ("appel", "distance"):          # assistance a distance : comme un appel (TASK-026.11)
        return now_local + timedelta(hours=int(cfg["appel_min_delay_hours"]))
    first_day = (now_local + timedelta(days=int(cfg["rdv_min_delay_days"]))).date()
    return datetime.combine(first_day, time(0, 0), tzinfo=_LOCAL_TZ)


def closed_blocks(d: date, margins: tuple[int, int] = (0, 0), tz=_LOCAL_TZ) -> list[tuple[datetime, datetime]]:
    """TASK-026.13 : avant l'ouverture, le diner et apres la fermeture comptent comme occupes, elargis de la marge du
    technicien (Philippe 30/30 : plages de 8h a 11h30 et de 13h30 a 16h, au lieu de 7h30 a 16h30)."""
    hours = business_hours_for(d)
    if hours is None:
        return []
    day0 = datetime.combine(d, time(0, 0), tzinfo=tz)
    raw = [(day0, datetime.combine(d, hours[0], tzinfo=tz)), (datetime.combine(d, hours[1], tzinfo=tz), day0 + timedelta(days=1))]
    lunch = lunch_for(d)
    if lunch:
        raw.append((datetime.combine(d, lunch[0], tzinfo=tz), datetime.combine(d, lunch[1], tzinfo=tz)))
    before, after = (timedelta(minutes=m) for m in margins)
    return [(s - after, e + before) for s, e in raw]


def _day_slots(appt_type: str, duration_minutes: int, d: date, earliest: datetime, busy: list[tuple[datetime, datetime]],
               margins: tuple[int, int] = (0, 0)) -> list[time]:
    hours = business_hours_for(d)
    if hours is None:
        return []
    busy = busy + closed_blocks(d, margins)
    open_t, close_t = hours
    open_dt = datetime.combine(d, open_t, tzinfo=_LOCAL_TZ)
    close_dt = datetime.combine(d, close_t, tzinfo=_LOCAL_TZ)
    if appt_type == "rdv":
        rdv_open = datetime.combine(d, rdv_earliest_start(), tzinfo=_LOCAL_TZ)
        open_dt = max(open_dt, rdv_open)

    slots = []
    cur = open_dt
    step = timedelta(minutes=slot_minutes())
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

@router.get("/logo")
async def get_logo():
    """Logo de l'entreprise en haut de la page /rdv (TASK-026.12) : le meme fichier que les factures, une seule copie."""
    from app.core.invoice_pdf import _BRAND
    logo = _BRAND / "invoice_logo.png"
    if not logo.is_file():
        raise HTTPException(404, "Aucun logo")
    return FileResponse(logo, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})


@router.get("/config", response_model=ConfigOut)
async def get_config():
    from app.core.business_hours import hours_map
    await agenda_config.load()
    return ConfigOut(
        business_hours={str(k): (v[0].strftime("%H:%M"), v[1].strftime("%H:%M")) for k, v in hours_map().items()},
        rdv_earliest_start=rdv_earliest_start().strftime("%H:%M"),
        slot_granularity_minutes=slot_minutes(),
        duration_rules=_duration_rules(),
        online_slot_minutes=int(agenda_config.current()["online_slot_minutes"]),
        rdv_min_delay_days=int(agenda_config.current()["rdv_min_delay_days"]),
        urgent_notice=agenda_config.current()["urgent_notice"],
    )


async def _global_busy(db, start_utc: datetime, end_utc: datetime) -> list[tuple[datetime, datetime]]:
    """Avant TASK-026.11 (et sans technicien reservable) : tous les agendas, sans marge."""
    return await _local_busy_blocks(db, start_utc, end_utc) + await google_calendar.busy_blocks(db, start_utc, end_utc)


async def _tech_slots(db, appointment_type: str, duration_minutes: int, start_utc: datetime, end_utc: datetime,
                      tech: dict | None) -> dict[date, list[time]]:
    """Heures libres par jour pour un technicien (ou tous les agendas si aucun technicien n'est reservable)."""
    from app.core import booking
    now_local = datetime.now(_LOCAL_TZ)
    earliest = _earliest_start(appointment_type, now_local)
    busy = await (booking.busy_for(db, tech, start_utc, end_utc) if tech else _global_busy(db, start_utc, end_utc))
    busy_local = [(b.astimezone(_LOCAL_TZ), e.astimezone(_LOCAL_TZ)) for b, e in busy]
    margins = (tech["buffer_before"], tech["buffer_after"]) if tech else (0, 0)
    out = {}
    d = start_utc.astimezone(_LOCAL_TZ).date()
    while datetime.combine(d, time(0, 0), tzinfo=_LOCAL_TZ) < end_utc.astimezone(_LOCAL_TZ):
        slots = _day_slots(appointment_type, duration_minutes, d, earliest, busy_local, margins)
        if slots:
            out[d] = slots
        d += timedelta(days=1)
    return out


@router.get("/techs")
async def get_techs(db: AsyncSession = Depends(get_db)):
    """TASK-026.11 : techniciens que le client peut choisir -- nom et initiales seulement."""
    from app.core import booking
    cfg = await agenda_config.load()
    real = [{"id": t["id"], "name": t["name"], "initials": t["initials"], "next_date": None} for t in await booking.techs(db)]
    # Techniciens affiches mais jamais disponibles (Philippe, 2026-10-27) : « aucune disponibilite avant le ... »
    first = (datetime.now(_LOCAL_TZ) + timedelta(days=round(float(cfg["demo_months"]) * 30.44))).date()
    from app.core.business_hours import is_business_day
    for _ in range(14):                              # jamais un dimanche ou un ferie : prochain jour ouvert
        if is_business_day(first):
            break
        first += timedelta(days=1)
    demo = [{"id": f"demo-{i}", "name": n, "initials": booking.initials(n), "next_date": first.isoformat()}
            for i, n in enumerate(cfg["demo_techs"], 1)]
    return real + demo


@router.get("/availability", response_model=list[DayAvailability])
async def get_availability(appointment_type: str, duration_minutes: int, tech: str | None = None, db: AsyncSession = Depends(get_db)):
    """Heures libres seulement (jamais les RDV) ; tech = id d'un technicien, ou vide / « any » = premier disponible."""
    from app.core import booking
    await agenda_config.load()
    if appointment_type == "plage":
        # TASK-026.13 : plages de base (le client en choisit une ou plusieurs qui se suivent, le type vient apres) --
        # calculees comme un appel, des l'ouverture ; le type et la duree sont reverifies a la reservation
        appointment_type, duration_minutes = "appel", slot_minutes()
    else:
        _validate_duration(appointment_type, duration_minutes)
    now_local = datetime.now(_LOCAL_TZ)
    start_utc = datetime.combine(now_local.date(), time(0, 0), tzinfo=_LOCAL_TZ).astimezone(timezone.utc)
    end_utc = start_utc + timedelta(days=_lookahead_days())
    all_techs = await booking.techs(db)
    if tech and tech.startswith("demo-"):
        return []                                    # technicien affiche, jamais disponible
    if tech and tech != "any":
        chosen = [t for t in all_techs if t["id"] == tech]
        if not chosen:
            raise HTTPException(status_code=404, detail="Technicien introuvable")
    else:
        chosen = all_techs or [None]
    merged: dict[date, set] = {}
    for t in chosen:
        for d, slots in (await _tech_slots(db, appointment_type, duration_minutes, start_utc, end_utc, t)).items():
            merged.setdefault(d, set()).update(slots)
    return [DayAvailability(date=d, slots=[x.strftime("%H:%M") for x in sorted(merged[d])]) for d in sorted(merged)]


@router.get("/availability/techs")
async def get_range_techs(duration_minutes: int, date_: date = Query(alias="date"), time_: str = Query(alias="time"), tech: str | None = None, db: AsyncSession = Depends(get_db)):
    """TASK-026.13 : techniciens libres pour toute la plage choisie (nom seulement), affiches sous le calendrier."""
    from app.core import booking
    await agenda_config.load()
    if not 0 < duration_minutes <= 600:
        raise HTTPException(status_code=400, detail="Duree invalide")
    try:
        hh, mm = (int(x) for x in time_.split(":"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Heure invalide")
    if tech and tech.startswith("demo-"):
        return []
    day_start = datetime.combine(date_, time(0, 0), tzinfo=_LOCAL_TZ).astimezone(timezone.utc)
    out = []
    for t in await booking.techs(db):
        if tech and tech != "any" and t["id"] != tech:
            continue
        slots = (await _tech_slots(db, "appel", duration_minutes, day_start, day_start + timedelta(days=1), t)).get(date_, [])
        if time(hh, mm) in slots:
            out.append({"id": t["id"], "name": t["name"], "initials": t["initials"]})
    return out


async def _lookup_client(db, email: str) -> tuple[Company | None, Contact | None]:
    """Compagnie et contact deja connus pour ce courriel (TASK-026.11), sans rien creer."""
    from app.core import mail_match
    company_id, contact_id = await mail_match.by_address(db, email.strip().lower())
    contact = await db.get(Contact, contact_id) if contact_id else None
    if contact and not company_id:
        active = [cc for cc in (await db.execute(select(ContactCompany).where(ContactCompany.contact_id == contact.id,
                                                                              ContactCompany.is_active.is_(True)))).scalars().all()]
        cc = next((cc for cc in active if cc.is_primary), None) or (active[0] if active else None)
        company_id = cc.company_id if cc else None
    return (await db.get(Company, company_id) if company_id else None), contact


@router.get("/client")
async def get_client(email: EmailStr, db: AsyncSession = Depends(get_db)):
    """TASK-026.16 : « Client existant : <compagnie> » ou nouveau client, selon le courriel seulement (jamais selon le
    nom de compagnie : la page est publique, on ne doit pas pouvoir verifier qui est client avec un nom)."""
    company, contact = await _lookup_client(db, str(email))
    # contact connu : prenom et nom affiches « Reconnu » sur la page, jamais les vrais (Philippe, 2026-10-27)
    return {"known": company is not None, "company_name": company.name if company else None,
            "contact_known": contact is not None}


async def _find_or_create_client(db, payload) -> tuple[Company, Contact]:
    """TASK-026.11 (Philippe : « relie le client existant par son courriel ») : contact connu par son courriel ->
    sa fiche (on complete seulement ses champs vides) ; compagnie connue par ce courriel -> nouveau contact dans
    celle-ci ; sinon nouvelle compagnie + nouveau contact, comme avant."""
    company, contact = await _lookup_client(db, str(payload.email))
    if not company:
        company_entity = Entity(entity_type=EntityType.company)
        db.add(company_entity)
        await db.flush()
        from app.core import account_numbers   # chaque compagnie a son numero des sa creation (TASK-002.7)
        company = Company(id=company_entity.id, name=payload.company_name, account_number=await account_numbers.assign(db))
        db.add(company)
        await db.flush()
    if contact:
        for field in ("phone", "mobile"):
            if not getattr(contact, field) and getattr(payload, field):
                setattr(contact, field, getattr(payload, field))
    else:
        if not payload.first_name.strip() or not payload.last_name.strip():
            raise HTTPException(status_code=400, detail="Prénom et nom requis")
        contact_entity = Entity(entity_type=EntityType.person)
        db.add(contact_entity)
        await db.flush()
        contact = Contact(id=contact_entity.id, first_name=payload.first_name, last_name=payload.last_name,
                          email=payload.email, phone=payload.phone, mobile=payload.mobile)
        db.add(contact)
        await db.flush()
    linked = (await db.execute(select(ContactCompany).where(ContactCompany.contact_id == contact.id,
                                                            ContactCompany.company_id == company.id))).scalar_one_or_none()
    if not linked:
        db.add(ContactCompany(contact_id=contact.id, company_id=company.id, email=payload.email, is_primary=True))
    return company, contact


@router.post("/book", response_model=BookingOut, status_code=201)
async def book_appointment(payload: BookingRequest, db: AsyncSession = Depends(get_db)):
    await agenda_config.load()
    _validate_duration(payload.appointment_type, payload.duration_minutes)
    if payload.appointment_type == "rdv" and not payload.address:
        raise HTTPException(status_code=400, detail="Adresse requise pour un rendez-vous")

    try:
        hh, mm = (int(x) for x in payload.time.split(":"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Heure invalide")
    start_local = datetime(payload.date.year, payload.date.month, payload.date.day, hh, mm, tzinfo=_LOCAL_TZ)

    # TASK-026.11 : le technicien choisi (ou le premier libre a cette heure) ; plage reverifiee juste avant d'ecrire
    from app.core import booking
    booking.invalidate()
    day_start = datetime.combine(payload.date, time(0, 0), tzinfo=_LOCAL_TZ).astimezone(timezone.utc)
    day_end = day_start + timedelta(days=1)
    all_techs = await booking.techs(db)
    if payload.tech_id and payload.tech_id.startswith("demo-"):
        raise HTTPException(status_code=409, detail="Cette plage n'est plus disponible, veuillez en choisir une autre")
    if payload.tech_id and payload.tech_id != "any":
        candidates = [t for t in all_techs if t["id"] == payload.tech_id]
        if not candidates:
            raise HTTPException(status_code=404, detail="Technicien introuvable")
    else:
        candidates = all_techs or [None]
    tech = None
    for t in candidates:
        slots = (await _tech_slots(db, payload.appointment_type, payload.duration_minutes, day_start, day_end, t)).get(payload.date, [])
        if time(hh, mm) in slots:
            tech = t or {}
            break
    if tech is None:
        raise HTTPException(status_code=409, detail="Cette plage n'est plus disponible, veuillez en choisir une autre")
    tech = tech or None

    company, contact = await _find_or_create_client(db, payload)
    # contact reconnu par son courriel : la page envoie « Reconnu » vide -> les vrais noms de sa fiche (TASK-026.17)
    full_name = f"{contact.first_name or ''} {contact.last_name or ''}".strip()

    label = {"appel": "Appel", "distance": "Assistance à distance"}.get(payload.appointment_type, "RDV")
    task_description = payload.description
    if payload.address:
        task_description = f"Adresse : {payload.address}\n\n{task_description}"
    # Toute interaction avec un client passe par un ticket (TASK-015.19, 2026-10-23) -- comme un RDV de l'agenda
    # (TASK-015.15), plus une tache ; cree directement, sans le courriel « ticket ouvert » (la confirmation suit)
    if payload.urgent:
        label = f"URGENCE — {label}"
        task_description = ("URGENCE demandée par le client en ligne : il a accepté 300 $ de l'heure, 2 heures minimum.\n\n"
                            + task_description)
    ticket = Ticket(
        title=f"{label} — {full_name}",
        description=task_description,
        company_id=company.id,
        contact_id=contact.id,
        priority="urgent" if payload.urgent else "normal",
        status="en_cours",
        assigned_to_id=tech["user_id"] if tech else None,     # TASK-026.11 : le technicien choisi
    )
    db.add(ticket)
    from app.core.numbering import assign_ticket_number
    await assign_ticket_number(db, ticket)
    await db.flush()

    start_utc = start_local.astimezone(timezone.utc)
    end_utc = start_utc + timedelta(minutes=payload.duration_minutes)
    google_event_id = await google_calendar.create_event(
        db,
        summary=f"{label} — {full_name} ({company.name})" + (f" — avec {tech['name']}" if tech else ""),
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
        google_event_id=google_event_id,
    )
    if google_event_id:
        ticket.google_calendar_event_id, ticket.google_calendar_id = google_event_id, "primary"
    db.add(appt)
    await db.commit()

    h, m = divmod(payload.duration_minutes, 60)
    duration_label = f"{h}h" if m == 0 else f"{h}h{m:02d}" if h else f"{m} min"
    await send_rdv_confirmation_email(
        to_email=payload.email,
        appointment_id=str(appt.id),
        label=f"{label} avec {tech['name']}" if tech else label,
        date_label=payload.date.strftime("%Y-%m-%d"),
        time=payload.time,
        duration_label=duration_label,
        address=payload.address,
        description=payload.description,
        attendee_name=full_name,
        start_utc=start_utc,
        end_utc=end_utc,
    )

    return BookingOut(id=appt.id, appointment_type=appt.type, start_at=start_utc, duration_minutes=appt.duration_minutes,
                      tech_name=tech["name"] if tech else None)
