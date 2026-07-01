import uuid
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.invoice import Invoice, InvoiceLine
from app.models.company import Company
from app.models.catalogue import CatalogueItem
from app.models.user import User

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class LineOut(BaseModel):
    id: uuid.UUID
    catalogue_item_id: uuid.UUID | None
    description: str
    qty: float
    unit_price: float
    line_total: float
    sort_order: int
    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    due_date: date
    notes: str | None
    apply_tps: bool
    apply_tvq: bool
    tps_rate: float
    tvq_rate: float
    subtotal: float
    tps_amount: float
    tvq_amount: float
    total: float
    is_recurring: bool
    recurrence_frequency: str | None
    recurrence_next_date: date | None
    credit_of_id: uuid.UUID | None
    lines: list[LineOut]


class InvoiceListItem(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    due_date: date
    total: float
    is_recurring: bool
    credit_of_id: uuid.UUID | None


class InvoiceCreate(BaseModel):
    company_id: uuid.UUID
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    apply_tps: bool = True
    apply_tvq: bool = True
    is_recurring: bool = False
    recurrence_frequency: str | None = None


class InvoiceUpdate(BaseModel):
    status: str | None = None
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    apply_tps: bool | None = None
    apply_tvq: bool | None = None
    is_recurring: bool | None = None
    recurrence_frequency: str | None = None
    recurrence_next_date: date | None = None


class LineCreate(BaseModel):
    catalogue_item_id: uuid.UUID | None = None
    description: str
    qty: float = 1.0
    unit_price: float = 0.0
    sort_order: int = 0


class LineUpdate(BaseModel):
    description: str | None = None
    qty: float | None = None
    unit_price: float | None = None
    sort_order: int | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _next_number(db: AsyncSession) -> str:
    year = date.today().year
    result = await db.execute(
        select(func.count()).where(Invoice.number.like(f"{year}-%"))
    )
    count = result.scalar() or 0
    return f"{year}-{count + 1:04d}"


def _recalc(inv: Invoice) -> None:
    inv.subtotal = sum(l.line_total for l in inv.lines)
    inv.tps_amount = round(inv.subtotal * inv.tps_rate / 100, 2) if inv.apply_tps else 0.0
    inv.tvq_amount = round(inv.subtotal * inv.tvq_rate / 100, 2) if inv.apply_tvq else 0.0
    inv.total = round(inv.subtotal + inv.tps_amount + inv.tvq_amount, 2)


def _build_out(inv: Invoice) -> InvoiceOut:
    return InvoiceOut(
        id=inv.id,
        number=inv.number,
        company_id=inv.company_id,
        company_name=inv.company.name,
        status=inv.status,
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        notes=inv.notes,
        apply_tps=inv.apply_tps,
        apply_tvq=inv.apply_tvq,
        tps_rate=inv.tps_rate,
        tvq_rate=inv.tvq_rate,
        subtotal=inv.subtotal,
        tps_amount=inv.tps_amount,
        tvq_amount=inv.tvq_amount,
        total=inv.total,
        is_recurring=inv.is_recurring,
        recurrence_frequency=inv.recurrence_frequency,
        recurrence_next_date=inv.recurrence_next_date,
        credit_of_id=inv.credit_of_id,
        lines=[LineOut.model_validate(l) for l in inv.lines],
    )


async def _get_inv(invoice_id: uuid.UUID, db: AsyncSession) -> Invoice:
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.company))
        .where(Invoice.id == invoice_id)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    return inv


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[InvoiceListItem])
async def list_invoices(
    company_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Invoice).options(selectinload(Invoice.company)).order_by(Invoice.created_at.desc())
    if company_id:
        q = q.where(Invoice.company_id == company_id)
    if status:
        q = q.where(Invoice.status == status)
    result = await db.execute(q)
    invs = result.scalars().all()
    return [InvoiceListItem(
        id=i.id, number=i.number, company_id=i.company_id,
        company_name=i.company.name, status=i.status,
        issue_date=i.issue_date, due_date=i.due_date,
        total=i.total, is_recurring=i.is_recurring,
        credit_of_id=i.credit_of_id,
    ) for i in invs]


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(payload: InvoiceCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    comp = await db.get(Company, payload.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    today = date.today()
    inv = Invoice(
        number=await _next_number(db),
        company_id=payload.company_id,
        issue_date=payload.issue_date or today,
        due_date=payload.due_date or (today + timedelta(days=30)),
        notes=payload.notes,
        apply_tps=payload.apply_tps if payload.apply_tps is not None else comp.is_taxable,
        apply_tvq=payload.apply_tvq if payload.apply_tvq is not None else comp.tvq_applicable,
        is_recurring=payload.is_recurring,
        recurrence_frequency=payload.recurrence_frequency,
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)
    # reload with relations
    inv = await _get_inv(inv.id, db)
    _recalc(inv)
    await db.commit()
    await db.refresh(inv)
    inv = await _get_inv(inv.id, db)
    return _build_out(inv)


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _build_out(await _get_inv(invoice_id, db))


@router.put("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(invoice_id: uuid.UUID, payload: InvoiceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(inv, field, value)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return _build_out(inv)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    if inv.status not in ("brouillon",):
        raise HTTPException(status_code=400, detail="Seules les factures en brouillon peuvent être supprimées")
    await db.delete(inv)
    await db.commit()


# ── Lines ─────────────────────────────────────────────────────────────────────

@router.post("/{invoice_id}/lines", response_model=InvoiceOut)
async def add_line(invoice_id: uuid.UUID, payload: LineCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = InvoiceLine(
        invoice_id=inv.id,
        catalogue_item_id=payload.catalogue_item_id,
        description=payload.description,
        qty=payload.qty,
        unit_price=payload.unit_price,
        line_total=round(payload.qty * payload.unit_price, 2),
        sort_order=payload.sort_order or len(inv.lines),
    )
    db.add(line)
    await db.flush()
    inv = await _get_inv(invoice_id, db)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return _build_out(inv)


@router.put("/{invoice_id}/lines/{line_id}", response_model=InvoiceOut)
async def update_line(invoice_id: uuid.UUID, line_id: uuid.UUID, payload: LineUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = next((l for l in inv.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    line.line_total = round(line.qty * line.unit_price, 2)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return _build_out(inv)


@router.delete("/{invoice_id}/lines/{line_id}", response_model=InvoiceOut)
async def delete_line(invoice_id: uuid.UUID, line_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = next((l for l in inv.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    await db.delete(line)
    await db.flush()
    inv = await _get_inv(invoice_id, db)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return _build_out(inv)


# ── Actions ───────────────────────────────────────────────────────────────────

@router.post("/mark-overdue", status_code=status.HTTP_200_OK)
async def mark_overdue(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    today = date.today()
    result = await db.execute(
        select(Invoice).where(
            and_(Invoice.status == "envoyee", Invoice.due_date < today)
        )
    )
    overdue = result.scalars().all()
    for inv in overdue:
        inv.status = "en_retard"
    await db.commit()
    return {"updated": len(overdue)}


@router.post("/{invoice_id}/credit", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_credit(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    original = await _get_inv(invoice_id, db)
    if original.credit_of_id is not None:
        raise HTTPException(status_code=400, detail="Un avoir ne peut pas être crédité")
    credit = Invoice(
        number=await _next_number(db),
        company_id=original.company_id,
        issue_date=date.today(),
        due_date=date.today(),
        notes=f"Avoir pour facture {original.number}",
        apply_tps=original.apply_tps,
        apply_tvq=original.apply_tvq,
        tps_rate=original.tps_rate,
        tvq_rate=original.tvq_rate,
        is_recurring=False,
        credit_of_id=original.id,
    )
    db.add(credit)
    await db.flush()
    for line in original.lines:
        db.add(InvoiceLine(
            invoice_id=credit.id,
            catalogue_item_id=line.catalogue_item_id,
            description=line.description,
            qty=line.qty,
            unit_price=-abs(line.unit_price),
            line_total=-abs(line.line_total),
            sort_order=line.sort_order,
        ))
    await db.flush()
    credit = await _get_inv(credit.id, db)
    _recalc(credit)
    await db.commit()
    credit = await _get_inv(credit.id, db)
    return _build_out(credit)


@router.post("/{invoice_id}/generate-next", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def generate_next(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    original = await _get_inv(invoice_id, db)
    if not original.is_recurring or not original.recurrence_frequency:
        raise HTTPException(status_code=400, detail="Facture non récurrente")
    freq_map = {"mensuel": relativedelta(months=1), "trimestriel": relativedelta(months=3), "annuel": relativedelta(years=1)}
    delta = freq_map.get(original.recurrence_frequency)
    if not delta:
        raise HTTPException(status_code=400, detail="Fréquence inconnue")
    base = original.recurrence_next_date or original.due_date
    next_issue = base
    next_due = base + delta
    next_inv = Invoice(
        number=await _next_number(db),
        company_id=original.company_id,
        issue_date=next_issue,
        due_date=next_due,
        notes=original.notes,
        apply_tps=original.apply_tps,
        apply_tvq=original.apply_tvq,
        tps_rate=original.tps_rate,
        tvq_rate=original.tvq_rate,
        is_recurring=True,
        recurrence_frequency=original.recurrence_frequency,
        recurrence_next_date=next_due + delta,
    )
    db.add(next_inv)
    await db.flush()
    for line in original.lines:
        db.add(InvoiceLine(
            invoice_id=next_inv.id,
            catalogue_item_id=line.catalogue_item_id,
            description=line.description,
            qty=line.qty,
            unit_price=line.unit_price,
            line_total=line.line_total,
            sort_order=line.sort_order,
        ))
    original.recurrence_next_date = next_due
    await db.flush()
    next_inv = await _get_inv(next_inv.id, db)
    _recalc(next_inv)
    await db.commit()
    next_inv = await _get_inv(next_inv.id, db)
    return _build_out(next_inv)
