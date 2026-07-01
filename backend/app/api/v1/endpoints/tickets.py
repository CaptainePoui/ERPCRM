import uuid
import asyncio
import math
from datetime import date, datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.ticket import Ticket, TicketEntry
from app.models.company import Company
from app.models.user import User
from app.models.invoice import Invoice, InvoiceLine
from app.models.catalogue import CatalogueItem
from app.core.email import send_ticket_entry_email, send_ticket_close_email

router = APIRouter()

PRIORITIES = ["faible", "normal", "urgent", "critique"]
STATUSES   = ["ouvert", "en_cours", "en_attente", "fermer_a_facturer", "facture", "ferme", "annule"]

HOURLY_RATE = 145.0  # $/h
ROUND_TO_MIN = 15    # round to nearest 15 min


# ── Schemas ──────────────────────────────────────────────────────────────────

class EntryOut(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    user_id: uuid.UUID | None
    user_name: str | None
    catalogue_item_id: uuid.UUID | None
    description: str
    duration_minutes: int
    worked_at: date
    is_billable: bool

class TicketOut(BaseModel):
    id: uuid.UUID
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
    created_at: datetime
    closed_at: datetime | None
    entries: list[EntryOut]
    total_minutes: int

class TicketListItem(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    contact_name: str | None
    assigned_name: str | None
    title: str
    priority: str
    status: str
    created_at: datetime
    total_minutes: int

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

class EntryCreate(BaseModel):
    description: str
    duration_minutes: int
    worked_at: date | None = None
    is_billable: bool = False
    catalogue_item_id: uuid.UUID | None = None

class SendSummaryPayload(BaseModel):
    close: bool = False

class CreateInvoicePayload(BaseModel):
    catalogue_item_id: uuid.UUID | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_ticket(ticket_id: uuid.UUID, db: AsyncSession) -> Ticket:
    result = await db.execute(
        select(Ticket)
        .options(
            selectinload(Ticket.company),
            selectinload(Ticket.contact),
            selectinload(Ticket.assigned_to),
            selectinload(Ticket.entries).selectinload(TicketEntry.user),
        )
        .where(Ticket.id == ticket_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket introuvable")
    return t

def _build_entry(e: TicketEntry) -> EntryOut:
    return EntryOut(
        id=e.id, ticket_id=e.ticket_id, user_id=e.user_id,
        user_name=e.user.full_name if e.user else None,
        catalogue_item_id=e.catalogue_item_id,
        description=e.description, duration_minutes=e.duration_minutes,
        worked_at=e.worked_at, is_billable=e.is_billable,
    )

def _build_out(t: Ticket) -> TicketOut:
    total = sum(e.duration_minutes for e in t.entries)
    return TicketOut(
        id=t.id, company_id=t.company_id, company_name=t.company.name,
        contact_id=t.contact_id,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
        contact_email=t.contact.email if t.contact else None,
        assigned_to_id=t.assigned_to_id,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        title=t.title, description=t.description,
        priority=t.priority, status=t.status,
        invoice_id=t.invoice_id,
        created_at=t.created_at, closed_at=t.closed_at,
        entries=[_build_entry(e) for e in t.entries],
        total_minutes=total,
    )


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
        .options(selectinload(Ticket.company), selectinload(Ticket.contact), selectinload(Ticket.assigned_to), selectinload(Ticket.entries))
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
    return [TicketListItem(
        id=t.id, company_id=t.company_id, company_name=t.company.name,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        title=t.title, priority=t.priority, status=t.status,
        created_at=t.created_at,
        total_minutes=sum(e.duration_minutes for e in t.entries),
    ) for t in tickets]


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(payload: TicketCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    comp = await db.get(Company, payload.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    if payload.priority not in PRIORITIES:
        raise HTTPException(status_code=400, detail=f"Priorité invalide: {payload.priority}")
    t = Ticket(**payload.model_dump())
    db.add(t)
    await db.commit()
    t = await _get_ticket(t.id, db)
    return _build_out(t)


@router.get("/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _build_out(await _get_ticket(ticket_id, db))


@router.put("/{ticket_id}", response_model=TicketOut)
async def update_ticket(ticket_id: uuid.UUID, payload: TicketUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(t, field, value)
    t.updated_at = datetime.now(timezone.utc)
    if updates.get("status") in ("ferme", "annule") and not t.closed_at:
        t.closed_at = datetime.now(timezone.utc)
    elif updates.get("status") not in ("ferme", "annule", None):
        t.closed_at = None
    await db.commit()
    t = await _get_ticket(ticket_id, db)
    return _build_out(t)


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ticket(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    await db.delete(t)
    await db.commit()


# ── Entries ───────────────────────────────────────────────────────────────────

@router.post("/{ticket_id}/entries", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def add_entry(ticket_id: uuid.UUID, payload: EntryCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    t = await _get_ticket(ticket_id, db)
    entry = TicketEntry(
        ticket_id=ticket_id,
        user_id=current_user.id,
        catalogue_item_id=payload.catalogue_item_id,
        description=payload.description,
        duration_minutes=payload.duration_minutes,
        worked_at=payload.worked_at or date.today(),
        is_billable=payload.is_billable,
    )
    db.add(entry)
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    t = await _get_ticket(ticket_id, db)
    out = _build_out(t)

    # Fire-and-forget email to contact
    if t.contact and t.contact.email:
        asyncio.create_task(send_ticket_entry_email(
            to_email=t.contact.email,
            ticket_id=str(t.id),
            ticket_title=t.title,
            company_name=t.company.name,
            contact_name=f"{t.contact.first_name} {t.contact.last_name}" if t.contact else None,
            status=t.status,
            priority=t.priority,
            tech_name=current_user.full_name,
            description=payload.description,
            duration_minutes=payload.duration_minutes,
            is_billable=payload.is_billable,
            total_minutes=out.total_minutes,
        ))

    return out


@router.delete("/{ticket_id}/entries/{entry_id}", response_model=TicketOut)
async def delete_entry(ticket_id: uuid.UUID, entry_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    t = await _get_ticket(ticket_id, db)
    entry = next((e for e in t.entries if e.id == entry_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Entrée introuvable")
    await db.delete(entry)
    t.updated_at = datetime.now(timezone.utc)
    await db.commit()
    t = await _get_ticket(ticket_id, db)
    return _build_out(t)


# ── Send summary / close ──────────────────────────────────────────────────────

@router.post("/{ticket_id}/send-summary", response_model=TicketOut)
async def send_summary(
    ticket_id: uuid.UUID,
    payload: SendSummaryPayload,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    t = await _get_ticket(ticket_id, db)
    if not t.contact or not t.contact.email:
        raise HTTPException(status_code=400, detail="Ce ticket n'a pas de contact avec courriel")

    total = sum(e.duration_minutes for e in t.entries)
    entries_data = [
        {
            "worked_at": str(e.worked_at),
            "tech": f"{e.user.full_name}" if e.user else "—",
            "description": e.description,
            "duration_minutes": e.duration_minutes,
            "is_billable": e.is_billable,
        }
        for e in sorted(t.entries, key=lambda e: e.worked_at)
    ]

    await send_ticket_close_email(
        to_email=t.contact.email,
        ticket_id=str(t.id),
        ticket_title=t.title,
        company_name=t.company.name,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}",
        total_minutes=total,
        entries=entries_data,
    )

    if payload.close and t.status not in ("ferme", "annule"):
        t.status = "ferme"
        t.closed_at = datetime.now(timezone.utc)
        t.updated_at = datetime.now(timezone.utc)
        await db.commit()
        t = await _get_ticket(ticket_id, db)

    return _build_out(t)


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
    _: User = Depends(get_current_user),
):
    t = await _get_ticket(ticket_id, db)

    if t.invoice_id:
        raise HTTPException(status_code=400, detail="Ce ticket est déjà lié à une facture")

    # Load company for tax settings
    comp = await db.get(Company, t.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    # Billable minutes or total minutes
    billable_mins = sum(e.duration_minutes for e in t.entries if e.is_billable)
    total_mins = sum(e.duration_minutes for e in t.entries)
    work_mins = billable_mins if billable_mins > 0 else total_mins

    # Round up to nearest 15 min
    rounded_mins = math.ceil(work_mins / ROUND_TO_MIN) * ROUND_TO_MIN if work_mins > 0 else 0
    hours = rounded_mins / 60.0
    labour_total = round(hours * HOURLY_RATE, 2)

    # Next invoice number
    year = date.today().year
    result = await db.execute(
        select(func.count()).where(Invoice.number.like(f"{year}-%"))
    )
    count = result.scalar() or 0
    inv_number = f"{year}-{count + 1:04d}"

    today = date.today()
    inv = Invoice(
        number=inv_number,
        company_id=t.company_id,
        issue_date=today,
        due_date=today + timedelta(days=30),
        notes=f"Ticket #{str(t.id)[:8].upper()} — {t.title}",
        apply_tps=getattr(comp, 'is_taxable', True),
        apply_tvq=getattr(comp, 'tvq_applicable', True),
    )
    db.add(inv)
    await db.flush()

    sort = 0

    # Line 1: Catalogue service item (if provided)
    if payload.catalogue_item_id:
        cat = await db.get(CatalogueItem, payload.catalogue_item_id)
        if cat:
            line1 = InvoiceLine(
                invoice_id=inv.id,
                catalogue_item_id=cat.id,
                description=cat.name,
                qty=1.0,
                unit_price=float(cat.price or 0),
                line_total=float(cat.price or 0),
                sort_order=sort,
            )
            db.add(line1)
            sort += 1

    # Line 2: Labour (only if time was worked)
    if rounded_mins > 0:
        h_int = int(hours)
        m_int = int((hours - h_int) * 60)
        time_desc = f"Main d'œuvre — {h_int}h{m_int:02d}min à {HOURLY_RATE:.0f}$/h"
        if billable_mins > 0 and billable_mins != total_mins:
            time_desc += f" (temps facturable arrondi à {ROUND_TO_MIN} min)"
        line2 = InvoiceLine(
            invoice_id=inv.id,
            catalogue_item_id=None,
            description=time_desc,
            qty=hours,
            unit_price=HOURLY_RATE,
            line_total=labour_total,
            sort_order=sort,
        )
        db.add(line2)

    await db.flush()

    # Recalc totals
    await db.refresh(inv, ['lines'])
    inv.subtotal = sum(l.line_total for l in inv.lines)
    inv.tps_amount = round(inv.subtotal * 5.0 / 100, 2) if inv.apply_tps else 0.0
    inv.tvq_amount = round(inv.subtotal * 9.975 / 100, 2) if inv.apply_tvq else 0.0
    inv.total = round(inv.subtotal + inv.tps_amount + inv.tvq_amount, 2)

    # Link ticket to invoice and set status
    t.invoice_id = inv.id
    t.status = "facture"
    t.closed_at = datetime.now(timezone.utc)
    t.updated_at = datetime.now(timezone.utc)

    await db.commit()
    t = await _get_ticket(ticket_id, db)

    return InvoiceRef(invoice_id=inv.id, invoice_number=inv_number, ticket=_build_out(t))
