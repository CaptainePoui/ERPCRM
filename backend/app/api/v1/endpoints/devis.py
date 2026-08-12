import uuid
from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.devis import Devis, DevisLine
from app.models.company import Company
from app.models.catalogue import CatalogueItem
from app.models.user import User
from app.core.tracking import get_open_stats
from app.core.email import send_devis_email

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


class DevisOut(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    valid_until: date
    notes: str | None
    apply_tps: bool
    apply_tvq: bool
    tps_rate: float
    tvq_rate: float
    subtotal: float
    tps_amount: float
    tvq_amount: float
    total: float
    invoice_id: uuid.UUID | None
    lines: list[LineOut]
    last_opened_at: datetime | None = None
    open_count: int = 0


class DevisListItem(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    valid_until: date
    total: float
    invoice_id: uuid.UUID | None
    last_opened_at: datetime | None = None
    open_count: int = 0


class DevisCreate(BaseModel):
    company_id: uuid.UUID
    issue_date: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    apply_tps: bool = True
    apply_tvq: bool = True


class DevisUpdate(BaseModel):
    status: str | None = None
    issue_date: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    apply_tps: bool | None = None
    apply_tvq: bool | None = None


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


class SendDevisPayload(BaseModel):
    to_email: str


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _next_number(db: AsyncSession) -> str:
    year = date.today().year
    result = await db.execute(
        select(func.count()).where(Devis.number.like(f"{year}-D%"))
    )
    count = result.scalar() or 0
    return f"{year}-D{count + 1:04d}"


def _recalc(d: Devis) -> None:
    d.subtotal = sum(l.line_total for l in d.lines)
    d.tps_amount = round(d.subtotal * d.tps_rate / 100, 2) if d.apply_tps else 0.0
    d.tvq_amount = round(d.subtotal * d.tvq_rate / 100, 2) if d.apply_tvq else 0.0
    d.total = round(d.subtotal + d.tps_amount + d.tvq_amount, 2)


async def _build_out(d: Devis, db: AsyncSession) -> DevisOut:
    stats = await get_open_stats(db, "devis", [d.id])
    last_opened_at, open_count = stats.get(d.id, (None, 0))
    return DevisOut(
        id=d.id,
        number=d.number,
        company_id=d.company_id,
        company_name=d.company.name,
        status=d.status,
        issue_date=d.issue_date,
        valid_until=d.valid_until,
        notes=d.notes,
        apply_tps=d.apply_tps,
        apply_tvq=d.apply_tvq,
        tps_rate=d.tps_rate,
        tvq_rate=d.tvq_rate,
        subtotal=d.subtotal,
        tps_amount=d.tps_amount,
        tvq_amount=d.tvq_amount,
        total=d.total,
        invoice_id=d.invoice_id,
        lines=[LineOut.model_validate(l) for l in d.lines],
        last_opened_at=last_opened_at, open_count=open_count,
    )


async def _get_devis(devis_id: uuid.UUID, db: AsyncSession) -> Devis:
    result = await db.execute(
        select(Devis)
        .options(selectinload(Devis.lines), selectinload(Devis.company))
        .where(Devis.id == devis_id)
    )
    d = result.scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404, detail="Devis introuvable")
    return d


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DevisListItem])
async def list_devis(
    company_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Devis).options(selectinload(Devis.company)).order_by(Devis.created_at.desc())
    if company_id:
        q = q.where(Devis.company_id == company_id)
    if status:
        q = q.where(Devis.status == status)
    result = await db.execute(q)
    all_devis = result.scalars().all()
    open_stats = await get_open_stats(db, "devis", [d.id for d in all_devis])
    return [DevisListItem(
        id=d.id, number=d.number, company_id=d.company_id,
        company_name=d.company.name, status=d.status,
        issue_date=d.issue_date, valid_until=d.valid_until,
        total=d.total, invoice_id=d.invoice_id,
        last_opened_at=open_stats.get(d.id, (None, 0))[0],
        open_count=open_stats.get(d.id, (None, 0))[1],
    ) for d in all_devis]


@router.post("", response_model=DevisOut, status_code=status.HTTP_201_CREATED)
async def create_devis(payload: DevisCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    comp = await db.get(Company, payload.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    today = date.today()
    d = Devis(
        number=await _next_number(db),
        company_id=payload.company_id,
        issue_date=payload.issue_date or today,
        valid_until=payload.valid_until or (today + timedelta(days=30)),
        notes=payload.notes,
        apply_tps=payload.apply_tps if payload.apply_tps is not None else comp.is_taxable,
        apply_tvq=payload.apply_tvq if payload.apply_tvq is not None else comp.tvq_applicable,
    )
    db.add(d)
    await db.flush()
    await db.refresh(d)
    d = await _get_devis(d.id, db)
    _recalc(d)
    await db.commit()
    d = await _get_devis(d.id, db)
    return await _build_out(d, db)


@router.get("/{devis_id}", response_model=DevisOut)
async def get_devis(devis_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _build_out(await _get_devis(devis_id, db), db)


@router.post("/{devis_id}/send", response_model=DevisOut)
async def send_devis(devis_id: uuid.UUID, payload: SendDevisPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Envoie le devis par courriel (pixel de suivi integre -- TASK module Devis)."""
    d = await _get_devis(devis_id, db)
    await send_devis_email(
        to_email=payload.to_email,
        devis_id=str(d.id),
        devis_number=d.number,
        company_name=d.company.name,
        valid_until=d.valid_until.strftime('%Y-%m-%d'),
        lines=[{"description": l.description, "qty": l.qty, "unit_price": l.unit_price, "line_total": l.line_total} for l in d.lines],
        total=d.total,
    )
    if d.status == "brouillon":
        d.status = "envoye"
        await db.commit()
        d = await _get_devis(devis_id, db)
    return await _build_out(d, db)


@router.put("/{devis_id}", response_model=DevisOut)
async def update_devis(devis_id: uuid.UUID, payload: DevisUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await _get_devis(devis_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    _recalc(d)
    await db.commit()
    d = await _get_devis(devis_id, db)
    return await _build_out(d, db)


@router.delete("/{devis_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_devis(devis_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await _get_devis(devis_id, db)
    if d.status not in ("brouillon",):
        raise HTTPException(status_code=400, detail="Seuls les devis en brouillon peuvent être supprimés")
    await db.delete(d)
    await db.commit()


# ── Lines ─────────────────────────────────────────────────────────────────────

@router.post("/{devis_id}/lines", response_model=DevisOut)
async def add_line(devis_id: uuid.UUID, payload: LineCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await _get_devis(devis_id, db)
    line = DevisLine(
        devis_id=d.id,
        catalogue_item_id=payload.catalogue_item_id,
        description=payload.description,
        qty=payload.qty,
        unit_price=payload.unit_price,
        line_total=round(payload.qty * payload.unit_price, 2),
        sort_order=payload.sort_order or len(d.lines),
    )
    db.add(line)
    await db.flush()
    d = await _get_devis(devis_id, db)
    _recalc(d)
    await db.commit()
    d = await _get_devis(devis_id, db)
    return await _build_out(d, db)


@router.put("/{devis_id}/lines/{line_id}", response_model=DevisOut)
async def update_line(devis_id: uuid.UUID, line_id: uuid.UUID, payload: LineUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await _get_devis(devis_id, db)
    line = next((l for l in d.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    line.line_total = round(line.qty * line.unit_price, 2)
    _recalc(d)
    await db.commit()
    d = await _get_devis(devis_id, db)
    return await _build_out(d, db)


@router.delete("/{devis_id}/lines/{line_id}", response_model=DevisOut)
async def delete_line(devis_id: uuid.UUID, line_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    d = await _get_devis(devis_id, db)
    line = next((l for l in d.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    await db.delete(line)
    await db.flush()
    d = await _get_devis(devis_id, db)
    _recalc(d)
    await db.commit()
    d = await _get_devis(devis_id, db)
    return await _build_out(d, db)
