import uuid
import asyncio
import math
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core import clock
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.ticket import Ticket, TicketMessage, TicketAttachment, TicketTimePeriod, TicketTimeAdjustment
from app.core import ticket_attachments
from app.core.numbering import assign_ticket_number
from app.models.company import Company
from app.models.contact import Contact
from app.models.contact_company import ContactCompany
from app.models.user import User
from app.models.invoice import Invoice, InvoiceLine
from app.models.catalogue import CatalogueItem
from app.core.email import send_ticket_close_email, send_ticket_open_email
from app.core.config import settings
from app.core.tracking import get_open_stats
from app.api.v1.endpoints.settings import get_setting, payment_terms_days

router = APIRouter()

PRIORITIES = ["faible", "normal", "urgent", "critique"]
STATUSES   = ["ouvert", "en_cours", "en_attente", "en_attente_client", "facture", "ferme"]


# ── Schemas ──────────────────────────────────────────────────────────────────
# TASK-006.5 etape 1 (2026-10-17) : le ticket = une conversation libre (messages + images, horodates) et UN seul
# temps. Ce temps = somme des periodes de chrono (heures ecrites par le serveur) + corrections tracees (clic sur
# le chrono). Plus de « saisies de temps » : un message ne porte jamais de duree.

class AttachmentOut(BaseModel):
    id: uuid.UUID
    original_name: str | None
    media_type: str
    size: int

class MessageOut(BaseModel):
    id: uuid.UUID
    author_kind: str
    user_id: uuid.UUID | None
    author_name: str | None
    body: str
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentOut]

class AdjustmentOut(BaseModel):
    id: uuid.UUID
    kind: str
    user_name: str | None
    before_seconds: int
    after_seconds: int
    delta_seconds: int
    reason: str | None
    created_at: datetime

class PeriodOut(BaseModel):
    id: uuid.UUID
    user_name: str | None
    started_at: datetime
    ended_at: datetime | None
    stop_source: str | None

class TicketOut(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    contact_id: uuid.UUID | None
    contact_name: str | None
    contact_email: str | None
    assigned_to_id: uuid.UUID | None
    assigned_name: str | None
    title: str
    description: str | None
    priority: str
    status: str
    invoice_id: uuid.UUID | None
    is_billable: bool
    catalogue_item_id: uuid.UUID | None
    catalogue_item_name: str | None
    created_at: datetime
    closed_at: datetime | None
    messages: list[MessageOut]
    # Chrono : worked_seconds = temps du ticket au moment de la reponse ; open_periods = chronos qui tournent
    # (tous techniciens) -- l'ecran ajoute open_periods seconde par seconde, sans lire l'horloge de l'appareil.
    worked_seconds: int
    open_periods: int
    my_running: bool
    offered_seconds: int
    invoiced_seconds: int
    billable_seconds: int
    total_minutes: int
    periods: list[PeriodOut]
    adjustments: list[AdjustmentOut]
    draft_message: str | None
    last_opened_at: datetime | None = None
    open_count: int = 0

class TicketListItem(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    contact_name: str | None
    assigned_name: str | None
    title: str
    priority: str
    status: str
    is_billable: bool
    created_at: datetime
    total_minutes: int
    running: bool
    last_opened_at: datetime | None = None
    open_count: int = 0

class TicketCreate(BaseModel):
    company_id: uuid.UUID
    contact_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    priority: str = "normal"

class TicketUpdate(BaseModel):
    contact_id: uuid.UUID | None = None
    assigned_to_id: uuid.UUID | None = None
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    is_billable: bool | None = None
    catalogue_item_id: uuid.UUID | None = None
    # Brouillon du message en cours (enregistre pendant la frappe)
    draft_message: str | None = None

class TimerStart(BaseModel):
    # Autres chronos de CE technicien qui tournent : True = les mettre en pause, False = les laisser tourner
    pause_others: bool = False

class TimeCorrection(BaseModel):
    seconds: int
    reason: str | None = None

class TimeOffer(BaseModel):
    seconds: int
    reason: str | None = None

class MessageUpdate(BaseModel):
    body: str

class SendSummaryPayload(BaseModel):
    close: bool = False
    wait_for_client: bool = False

class CreateInvoicePayload(BaseModel):
    catalogue_item_id: uuid.UUID | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _short(t: Ticket) -> str:
    return f"#{t.number}" if t.number else f"#{str(t.id)[:8].upper()}"


async def _get_ticket(ticket_id: uuid.UUID, db: AsyncSession) -> Ticket:
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.company),
            selectinload(Ticket.contact).selectinload(Contact.contact_companies),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.catalogue_item),
            selectinload(Ticket.messages).selectinload(TicketMessage.user),
            selectinload(Ticket.messages).selectinload(TicketMessage.attachments),
            selectinload(Ticket.periods).selectinload(TicketTimePeriod.user),
            selectinload(Ticket.adjustments).selectinload(TicketTimeAdjustment.user),
        )
        .where(Ticket.id == ticket_id)
        .execution_options(populate_existing=True)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    return t


def _contact_email(t: Ticket) -> str | None:
    """Return the contact's email for this ticket's company (CC email), fallback to personal."""
    if not t.contact:
        return None
    for cc in t.contact.contact_companies:
        if cc.company_id == t.company_id and cc.email:
            return cc.email
    return t.contact.email


def _worked_seconds(t: Ticket, now: datetime | None = None) -> int:
    """Temps du ticket : periodes de chrono (celles qui tournent comptees jusqu'a maintenant) + corrections."""
    now = now or _now()
    secs = sum(int(((p.ended_at or now) - p.started_at).total_seconds()) for p in t.periods)
    secs += sum(a.delta_seconds for a in t.adjustments if a.kind == "correction")
    return max(0, secs)


def _offered_seconds(t: Ticket) -> int:
    return sum(a.delta_seconds for a in t.adjustments if a.kind == "offert")


def _billable_seconds(t: Ticket, now: datetime | None = None) -> int:
    """Temps a facturer qui ne l'a pas encore ete (0 si le ticket n'est pas facturable)."""
    if not t.is_billable:
        return 0
    return max(0, _worked_seconds(t, now) - _offered_seconds(t) - (t.invoiced_seconds or 0))


def _close_open_periods(t: Ticket, source: str, user_id: uuid.UUID | None = None) -> None:
    """Arrete les chronos qui tournent sur ce ticket (d'un technicien, ou de tous)."""
    now = _now()
    for p in t.periods:
        if p.ended_at is None and (user_id is None or p.user_id == user_id):
            p.ended_at = now
            p.stop_source = source


def _build_message(m: TicketMessage) -> MessageOut:
    return MessageOut(
        id=m.id, author_kind=m.author_kind, user_id=m.user_id,
        author_name=m.user.full_name if m.user else None,
        body=m.body, created_at=m.created_at, updated_at=m.updated_at,
        attachments=[AttachmentOut(id=a.id, original_name=a.original_name, media_type=a.media_type, size=a.size) for a in m.attachments],
    )


async def _build_out(t: Ticket, db: AsyncSession, user: User | None = None) -> TicketOut:
    now = _now()
    worked = _worked_seconds(t, now)
    stats = await get_open_stats(db, "ticket", [t.id])
    last_opened_at, open_count = stats.get(t.id, (None, 0))
    return TicketOut(
        id=t.id, number=_short(t), company_id=t.company_id, company_name=t.company.name,
        contact_id=t.contact_id,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
        contact_email=_contact_email(t),
        assigned_to_id=t.assigned_to_id,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        title=t.title, description=t.description,
        priority=t.priority, status=t.status,
        invoice_id=t.invoice_id, is_billable=t.is_billable,
        catalogue_item_id=t.catalogue_item_id,
        catalogue_item_name=t.catalogue_item.name if t.catalogue_item else None,
        created_at=t.created_at, closed_at=t.closed_at,
        messages=[_build_message(m) for m in t.messages],
        worked_seconds=worked,
        open_periods=sum(1 for p in t.periods if p.ended_at is None),
        my_running=bool(user) and any(p.ended_at is None and p.user_id == user.id for p in t.periods),
        offered_seconds=_offered_seconds(t), invoiced_seconds=t.invoiced_seconds or 0,
        billable_seconds=_billable_seconds(t, now),
        total_minutes=worked // 60,
        periods=[PeriodOut(id=p.id, user_name=p.user.full_name if p.user else None, started_at=p.started_at,
                           ended_at=p.ended_at, stop_source=p.stop_source) for p in t.periods],
        adjustments=[AdjustmentOut(id=a.id, kind=a.kind, user_name=a.user.full_name if a.user else None,
                                   before_seconds=a.before_seconds, after_seconds=a.after_seconds,
                                   delta_seconds=a.delta_seconds, reason=a.reason, created_at=a.created_at)
                     for a in t.adjustments],
        draft_message=t.draft_message,
        last_opened_at=last_opened_at, open_count=open_count,
    )


async def _reply(ticket_id: uuid.UUID, db: AsyncSession, user: User) -> TicketOut:
    return await _build_out(await _get_ticket(ticket_id, db), db, user)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TicketListItem])
async def list_tickets(
    company_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = (
        select(Ticket)
        .options(selectinload(Ticket.company), selectinload(Ticket.contact), selectinload(Ticket.assigned_to),
                 selectinload(Ticket.periods), selectinload(Ticket.adjustments))
        .order_by(Ticket.created_at.desc())
    )
    if company_id:
        q = q.where(Ticket.company_id == company_id)
    if status:
        q = q.where(Ticket.status == status)
    if priority:
        q = q.where(Ticket.priority == priority)
    result = await db.execute(q)
    tickets = result.scalars().all()
    open_stats = await get_open_stats(db, "ticket", [t.id for t in tickets])
    now = _now()
    return [TicketListItem(
        id=t.id, number=_short(t), company_id=t.company_id, company_name=t.company.name,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        title=t.title, priority=t.priority, status=t.status,
        is_billable=t.is_billable,
        created_at=t.created_at,
        total_minutes=_worked_seconds(t, now) // 60,
        running=any(p.ended_at is None for p in t.periods),
        last_opened_at=open_stats.get(t.id, (None, 0))[0],
        open_count=open_stats.get(t.id, (None, 0))[1],
    ) for t in tickets]


class ActiveTimer(BaseModel):
    ticket_id: uuid.UUID
    number: str
    title: str
    company_name: str
    started_at: datetime
    running_seconds: int        # depuis le demarrage de ce chrono (rappels « actif depuis X h Y »)
    worked_seconds: int         # temps total du ticket


async def _active_timers(db: AsyncSession, user: User) -> list[ActiveTimer]:
    rows = (await db.execute(
        select(TicketTimePeriod.ticket_id, TicketTimePeriod.started_at)
        .where(TicketTimePeriod.user_id == user.id, TicketTimePeriod.ended_at.is_(None))
        .order_by(TicketTimePeriod.started_at)
    )).all()
    out, now = [], _now()
    for ticket_id, started_at in rows:
        t = await _get_ticket(ticket_id, db)
        out.append(ActiveTimer(ticket_id=t.id, number=_short(t), title=t.title, company_name=t.company.name,
                               started_at=started_at, running_seconds=int((now - started_at).total_seconds()),
                               worked_seconds=_worked_seconds(t, now)))
    return out


@router.get("/timers/active", response_model=list[ActiveTimer])
async def my_active_timers(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Les chronos qui tournent pour le technicien connecte (fenetre « un autre ticket est actif »)."""
    return await _active_timers(db, current_user)


@router.post("/timers/heartbeat", response_model=list[ActiveTimer])
async def presence_heartbeat(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Battement d'un ecran ERPCRM ouvert (toutes les 30 s, onglet en arriere-plan compris) : tant qu'il arrive, les
    chronos du technicien continuent ; voir services/ticket_presence.py. Repond ses chronos actifs (bandeau, rappels)."""
    user = await db.get(User, current_user.id)
    user.presence_at = _now()
    await db.commit()
    return await _active_timers(db, current_user)


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(payload: TicketCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    comp = await db.get(Company, payload.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priorité invalide: {payload.priority}")
    t = Ticket(**payload.model_dump(), status="en_cours")
    db.add(t)
    await assign_ticket_number(db, t)
    await db.commit()
    t = await _get_ticket(t.id, db)
    out = await _build_out(t, db, current_user)
    contact_email = _contact_email(t)
    if contact_email:
        portal_url = f"http://{settings.ERPCRM_HOST}:3010/portal"
        from app.core.signature import for_user
        signature = await for_user(db, current_user.id)      # TASK-007.1
        asyncio.create_task(send_ticket_open_email(
            signature=signature,
            to_email=contact_email,
            ticket_id=str(t.id),
            ticket_number=t.number,
            ticket_title=t.title,
            company_name=t.company.name,
            contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
            priority=t.priority,
            description=t.description,
            portal_url=portal_url,
        ))
    return out


@router.get("/attachments/{attachment_id}/file")
async def attachment_file(attachment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    att = await db.get(TicketAttachment, attachment_id)
    if not att or not ticket_attachments.path_of(att).exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(ticket_attachments.path_of(att), media_type=att.media_type, filename=att.original_name or att.filename)


@router.delete("/attachments/{attachment_id}", response_model=TicketOut)
async def delete_attachment(attachment_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    att = await db.get(TicketAttachment, attachment_id)
    if not att:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    msg = await db.get(TicketMessage, att.message_id)
    await db.delete(att)
    await db.commit()
    ticket_attachments.remove(att)
    return await _reply(msg.ticket_id, db, current_user)


@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await _reply(ticket_id, db, current_user)


@router.put("/{ticket_id}", response_model=TicketOut)
async def update_ticket(ticket_id: uuid.UUID, payload: TicketUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    ⚠️ Fermer un ticket facturable facture automatiquement : passer status="ferme" arrete les chronos et
    declenche _generate_invoice() ; s'il y a du nouveau temps facturable, le statut final devient "facture",
    sinon le ticket reste "ferme" -- jamais bloquant.
    """
    t = await _get_ticket(ticket_id, db)
    updates = payload.model_dump(exclude_unset=True)
    closing = updates.get("status") == "ferme"
    for field, value in updates.items():
        setattr(t, field, value)
    if set(updates) - {"draft_message"}:
        t.updated_at = _now()

    if closing:
        _close_open_periods(t, "fermeture")
        await db.flush()
        await _generate_invoice(t, db)
        if not t.closed_at:
            t.closed_at = _now()
    elif updates.get("status") not in ("ferme", "facture", None):
        t.closed_at = None

    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    atts = [a for m in t.messages for a in m.attachments]
    await db.delete(t)
    await db.commit()
    for a in atts:
        ticket_attachments.remove(a)


# ── Chrono ────────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/timer/start", response_model=TicketOut)
async def start_timer(ticket_id: uuid.UUID, payload: TimerStart, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Demarre le chrono du technicien sur ce ticket (bouton Demarrer, ou debut de l'ecriture). Les autres chronos
    du technicien sont mis en pause seulement s'il l'a choisi -- jamais d'office (cahier Zeko 3.1)."""
    t = await _get_ticket(ticket_id, db)
    if t.status in ("ferme", "facture"):
        raise HTTPException(status_code=400, detail="Ticket fermé — rouvrez-le pour démarrer le chrono")
    if payload.pause_others:
        others = (await db.execute(
            select(TicketTimePeriod).where(TicketTimePeriod.user_id == current_user.id, TicketTimePeriod.ended_at.is_(None),
                                           TicketTimePeriod.ticket_id != ticket_id)
        )).scalars().all()
        for p in others:
            p.ended_at = _now()
            p.stop_source = "autre_ticket"
    if not any(p.ended_at is None and p.user_id == current_user.id for p in t.periods):
        db.add(TicketTimePeriod(ticket_id=t.id, user_id=current_user.id, started_at=_now()))
    (await db.get(User, current_user.id)).presence_at = _now()
    if t.status in ("ouvert", "en_attente", "en_attente_client"):
        t.status = "en_cours"
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.post("/{ticket_id}/timer/pause", response_model=TicketOut)
async def pause_timer(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    _close_open_periods(t, "pause", current_user.id)
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.put("/{ticket_id}/time", response_model=TicketOut)
async def correct_time(ticket_id: uuid.UUID, payload: TimeCorrection, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Clic sur le chrono : le temps du ticket devient `seconds`. L'ecart est garde (avant/apres, qui, quand, raison) ;
    un chrono qui tourne continue a partir de la nouvelle valeur."""
    if payload.seconds < 0:
        raise HTTPException(status_code=400, detail="Le temps ne peut pas être négatif")
    t = await _get_ticket(ticket_id, db)
    before = _worked_seconds(t)
    if payload.seconds == before:
        return await _build_out(t, db, current_user)
    db.add(TicketTimeAdjustment(ticket_id=t.id, user_id=current_user.id, kind="correction", before_seconds=before,
                                after_seconds=payload.seconds, delta_seconds=payload.seconds - before,
                                reason=(payload.reason or "").strip() or None))
    t.updated_at = _now()
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.post("/{ticket_id}/time/offer", response_model=TicketOut)
async def offer_time(ticket_id: uuid.UUID, payload: TimeOffer, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Temps offert : retire de la facture, le temps travaille du ticket ne change pas."""
    if payload.seconds <= 0:
        raise HTTPException(status_code=400, detail="Temps offert invalide")
    t = await _get_ticket(ticket_id, db)
    before = _offered_seconds(t)
    db.add(TicketTimeAdjustment(ticket_id=t.id, user_id=current_user.id, kind="offert", before_seconds=before,
                                after_seconds=before + payload.seconds, delta_seconds=payload.seconds,
                                reason=(payload.reason or "").strip() or None))
    t.updated_at = _now()
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.delete("/{ticket_id}/time/offer/{adjustment_id}", response_model=TicketOut)
async def cancel_offer(ticket_id: uuid.UUID, adjustment_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    a = next((a for a in t.adjustments if a.id == adjustment_id and a.kind == "offert"), None)
    if not a:
        raise HTTPException(status_code=404, detail="Temps offert introuvable")
    await db.delete(a)
    await db.commit()
    return await _reply(ticket_id, db, current_user)


# ── Conversation ─────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/messages", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def add_message(
    ticket_id: uuid.UUID,
    body: str = Form(""),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Un message du technicien : texte libre et/ou images collees. Aucun temps attache."""
    t = await _get_ticket(ticket_id, db)
    if not body.strip() and not files:
        raise HTTPException(status_code=400, detail="Message vide")
    msg = TicketMessage(ticket_id=t.id, user_id=current_user.id, author_kind="tech", body=body.strip())
    db.add(msg)
    await db.flush()
    for f in files:
        data = await f.read()
        if len(data) > ticket_attachments.MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"{f.filename or 'Fichier'} : plus de 15 Mo")
        ticket_attachments.save(db, msg.id, data, f.filename, f.content_type)
    t.draft_message = None
    t.updated_at = _now()
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.put("/{ticket_id}/messages/{message_id}", response_model=TicketOut)
async def update_message(ticket_id: uuid.UUID, message_id: uuid.UUID, payload: MessageUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    m = next((m for m in t.messages if m.id == message_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Message introuvable")
    m.body = payload.body.strip()
    m.updated_at = _now()
    await db.commit()
    return await _reply(ticket_id, db, current_user)


@router.delete("/{ticket_id}/messages/{message_id}", response_model=TicketOut)
async def delete_message(ticket_id: uuid.UUID, message_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    m = next((m for m in t.messages if m.id == message_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Message introuvable")
    atts = list(m.attachments)
    await db.delete(m)
    await db.commit()
    for a in atts:
        ticket_attachments.remove(a)
    return await _reply(ticket_id, db, current_user)


@router.post("/{ticket_id}/messages/{message_id}/split-to-new-ticket", response_model=TicketOut)
async def split_message_to_new_ticket(ticket_id: uuid.UUID, message_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Deplace une reponse client (reouverture automatique par courriel) vers un NOUVEAU ticket quand ce n'est pas
    le meme dossier. Referme le ticket original apres le deplacement.
    """
    t = await _get_ticket(ticket_id, db)
    m = next((m for m in t.messages if m.id == message_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Message introuvable")
    new_ticket = Ticket(
        company_id=t.company_id,
        contact_id=t.contact_id,
        title=(m.body[:255] or f"Suite de {t.title}"),
        description=m.body,
        priority="normal",
        status="ouvert",
    )
    db.add(new_ticket)
    await assign_ticket_number(db, new_ticket)
    await db.flush()
    m.ticket_id = new_ticket.id
    _close_open_periods(t, "fermeture")
    t.status = "ferme"
    t.closed_at = _now()
    t.updated_at = _now()
    await db.commit()
    return await _reply(ticket_id, db, current_user)


# ── Facturation ───────────────────────────────────────────────────────────────

def _round_billable_minutes(total_minutes: int, block_minutes: int) -> int:
    """
    Arrondi "a l'avantage" par bloc de temps (TASK facturation par categorie) :
    seuil = la moitie du bloc arrondie vers le bas (7 pour un bloc de 15 min,
    confirme explicitement par l'utilisateur ; 2 pour un bloc de 5 min, meme
    logique appliquee par symetrie -- signale a l'utilisateur, pas confirme
    chiffre par chiffre). Au-dessus du seuil -> arrondit vers le haut, au seuil ou
    en-dessous -> vers le bas.
    """
    if total_minutes <= 0:
        return 0
    threshold = block_minutes // 2
    base = (total_minutes // block_minutes) * block_minutes
    remainder = total_minutes % block_minutes
    return base + block_minutes if remainder > threshold else base


async def _generate_invoice(t: Ticket, db: AsyncSession, catalogue_item_id: uuid.UUID | None = None) -> Invoice | None:
    """
    Cree une facture pour le temps du ticket PAS ENCORE FACTURE (TASK-006.5 : un seul temps par ticket, un seul
    service). Retourne None si rien a facturer (pas d'erreur -- ex. fermeture d'un ticket sans temps facturable).

    Service du ticket avec un bloc d'arrondi (time_rounding_minutes) -> une ligne a son prix ; sinon « Main
    d'œuvre » au taux horaire global, arrondi au bloc de labour_round_minutes. Un ticket rouvert qui accumule du
    nouveau temps fait une 2e facture distincte (invoiced_seconds retient ce qui est deja facture) ; le ticket
    pointe vers la facture la PLUS RECENTE.
    """
    comp = await db.get(Company, t.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    hourly_rate = float(await get_setting(db, "hourly_rate"))
    round_to_min = int(await get_setting(db, "labour_round_minutes"))

    secs = _billable_seconds(t)
    minutes = math.ceil(secs / 60) if secs > 0 else 0
    item = await db.get(CatalogueItem, t.catalogue_item_id) if t.catalogue_item_id else None

    line = None
    if minutes > 0:
        if item and item.time_rounding_minutes:
            rounded = _round_billable_minutes(minutes, item.time_rounding_minutes)
            rate, label, cat_id = float(item.price or 0), item.name, item.id
        else:
            rounded = math.ceil(minutes / round_to_min) * round_to_min
            rate, label, cat_id = hourly_rate, (item.name if item else "Main d'œuvre"), (item.id if item else None)
        if rounded > 0:
            hours = rounded / 60.0
            line = {
                "description": f"{label} — {rounded // 60}h{rounded % 60:02d}min à {rate:.0f}$/h",
                "qty": hours, "unit_price": rate, "line_total": round(hours * rate, 2), "catalogue_item_id": cat_id,
            }

    if not line and not catalogue_item_id:
        return None

    # Next invoice number -- meme compteur que les factures (ne recule jamais)
    from app.core.numbering import next_document_number
    inv_number = await next_document_number(db, "invoice")

    today = clock.today()
    inv = Invoice(
        number=inv_number,
        company_id=t.company_id,
        issue_date=today,
        due_date=today + timedelta(days=await payment_terms_days(db)),
        notes=f"Ticket {_short(t)} — {t.title}",
        apply_tps=getattr(comp, 'is_taxable', True),
        apply_tvq=getattr(comp, 'tvq_applicable', True),
    )
    db.add(inv)
    await db.flush()

    sort = 0
    # Ligne optionnelle : article ajoute au moment de facturer (prix fixe, qty=1)
    if catalogue_item_id:
        cat = await db.get(CatalogueItem, catalogue_item_id)
        if cat:
            db.add(InvoiceLine(
                invoice_id=inv.id, catalogue_item_id=cat.id, description=cat.name,
                qty=1.0, unit_price=float(cat.price or 0), line_total=float(cat.price or 0),
                sort_order=sort,
            ))
            sort += 1
    if line:
        db.add(InvoiceLine(
            invoice_id=inv.id, catalogue_item_id=line["catalogue_item_id"], description=line["description"],
            qty=line["qty"], unit_price=line["unit_price"], line_total=line["line_total"], sort_order=sort,
        ))
        t.invoiced_seconds = (t.invoiced_seconds or 0) + secs

    await db.flush()
    await db.refresh(inv, ['lines'])
    # Meme calcul que les factures (taxe par ligne, arrondi demie vers le haut -- TASK-005.9)
    from app.api.v1.endpoints.invoices import _recalc
    _recalc(inv)

    t.invoice_id = inv.id
    t.status = "facture"
    t.closed_at = _now()
    t.updated_at = _now()
    return inv


# ── Send summary / close ──────────────────────────────────────────────────────

@router.post("/{ticket_id}/send-summary", response_model=TicketOut)
async def send_summary(
    ticket_id: uuid.UUID,
    payload: SendSummaryPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_ticket(ticket_id, db)
    contact_email = _contact_email(t)
    if not contact_email:
        raise HTTPException(status_code=400, detail="Ce ticket n'a pas de contact avec courriel")

    # Temps montre au client = temps du ticket moins le temps offert ; les messages du technicien (texte seulement).
    total = max(0, _worked_seconds(t) - _offered_seconds(t)) // 60
    entries_data = [
        {
            "worked_at": m.created_at.astimezone(clock.business_tz()).strftime("%Y-%m-%d %H:%M"),
            "tech": m.user.full_name if m.user else "—",
            "description": m.body,
        }
        for m in t.messages if m.author_kind == "tech" and m.body
    ]

    from app.core.signature import for_user
    await send_ticket_close_email(
        signature=await for_user(db, current_user.id),      # TASK-007.1
        to_email=contact_email,
        ticket_id=str(t.id),
        ticket_number=t.number,
        ticket_title=t.title,
        company_name=t.company.name,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}",
        total_minutes=total,
        entries=entries_data,
    )

    if payload.close and t.status != "ferme":
        t.status = "ferme"
        _close_open_periods(t, "fermeture")
        await db.flush()
        await _generate_invoice(t, db)  # bascule a "facture" si du temps etait a facturer
        if not t.closed_at:
            t.closed_at = _now()
        t.updated_at = _now()
        await db.commit()
    elif payload.wait_for_client:
        t.status = "en_attente_client"
        _close_open_periods(t, "attente_client", current_user.id)
        t.updated_at = _now()
        await db.commit()

    return await _reply(ticket_id, db, current_user)


# ── Ticket → Invoice ──────────────────────────────────────────────────────────

class InvoiceRef(BaseModel):
    invoice_id: uuid.UUID
    invoice_number: str
    ticket: TicketOut


@router.post("/{ticket_id}/create-invoice", response_model=InvoiceRef, status_code=status.HTTP_201_CREATED)
async def create_invoice_from_ticket(
    ticket_id: uuid.UUID,
    payload: CreateInvoicePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    t = await _get_ticket(ticket_id, db)
    _close_open_periods(t, "fermeture")
    await db.flush()
    inv = await _generate_invoice(t, db, catalogue_item_id=payload.catalogue_item_id)
    if not inv:
        raise HTTPException(status_code=400, detail="Aucun nouveau temps facturable ni article à inclure")
    await db.commit()
    return InvoiceRef(invoice_id=inv.id, invoice_number=inv.number, ticket=await _reply(ticket_id, db, current_user))
