import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.purchase_order import PurchaseOrder, PurchaseOrderLine
from app.models.catalogue import CatalogueItem
from app.models.user import User

router = APIRouter()

PO_STATUSES = {
    "brouillon": "Brouillon",
    "envoye": "Envoyé",
    "partiellement_recu": "Partiellement reçu",
    "recu": "Reçu",
    "annule": "Annulé",
}


class POLineOut(BaseModel):
    id: uuid.UUID
    catalogue_item_id: uuid.UUID | None
    description: str
    quantity: float
    unit_cost: float
    received_qty: float
    total: float

class POLineCreate(BaseModel):
    catalogue_item_id: uuid.UUID | None = None
    description: str
    quantity: float = 1
    unit_cost: float = 0
    received_qty: float = 0

class POLineUpdate(BaseModel):
    description: str | None = None
    quantity: float | None = None
    unit_cost: float | None = None
    received_qty: float | None = None

class POOut(BaseModel):
    id: uuid.UUID
    po_number: str
    supplier_name: str
    supplier_email: str | None
    supplier_phone: str | None
    status: str
    status_label: str
    notes: str | None
    company_id: uuid.UUID | None
    invoice_id: uuid.UUID | None
    ordered_at: datetime | None
    received_at: datetime | None
    created_at: datetime
    updated_at: datetime
    lines: list[POLineOut]
    total: float

class POListItem(BaseModel):
    id: uuid.UUID
    po_number: str
    supplier_name: str
    status: str
    status_label: str
    company_id: uuid.UUID | None
    invoice_id: uuid.UUID | None
    created_at: datetime
    line_count: int
    total: float

class POCreate(BaseModel):
    supplier_name: str
    supplier_email: str | None = None
    supplier_phone: str | None = None
    notes: str | None = None
    company_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None

class POUpdate(BaseModel):
    supplier_name: str | None = None
    supplier_email: str | None = None
    supplier_phone: str | None = None
    notes: str | None = None
    company_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None


def _line_out(line: PurchaseOrderLine) -> POLineOut:
    return POLineOut(
        id=line.id,
        catalogue_item_id=line.catalogue_item_id,
        description=line.description,
        quantity=float(line.quantity),
        unit_cost=float(line.unit_cost),
        received_qty=float(line.received_qty),
        total=float(line.quantity) * float(line.unit_cost),
    )

def _po_out(po: PurchaseOrder) -> POOut:
    lines = [_line_out(l) for l in po.lines]
    total = sum(l.total for l in lines)
    return POOut(
        id=po.id, po_number=po.po_number, supplier_name=po.supplier_name,
        supplier_email=po.supplier_email, supplier_phone=po.supplier_phone,
        status=po.status, status_label=PO_STATUSES.get(po.status, po.status),
        notes=po.notes, company_id=po.company_id, invoice_id=po.invoice_id,
        ordered_at=po.ordered_at, received_at=po.received_at,
        created_at=po.created_at, updated_at=po.updated_at,
        lines=lines, total=total,
    )


async def _next_po_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(PurchaseOrder))
    count = result.scalar() or 0
    return f"BC-{count + 1:05d}"


@router.get("/", response_model=list[POListItem])
async def list_pos(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(PurchaseOrder).options(selectinload(PurchaseOrder.lines))
        .order_by(PurchaseOrder.created_at.desc())
    )
    pos = result.scalars().all()
    items = []
    for po in pos:
        lines = po.lines
        total = sum(float(l.quantity) * float(l.unit_cost) for l in lines)
        items.append(POListItem(
            id=po.id, po_number=po.po_number, supplier_name=po.supplier_name,
            status=po.status, status_label=PO_STATUSES.get(po.status, po.status),
            company_id=po.company_id, invoice_id=po.invoice_id,
            created_at=po.created_at, line_count=len(lines), total=total,
        ))
    return items


@router.post("/", response_model=POOut, status_code=status.HTTP_201_CREATED)
async def create_po(payload: POCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    po_number = await _next_po_number(db)
    po = PurchaseOrder(po_number=po_number, **payload.model_dump())
    db.add(po)
    await db.flush()
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po.id))
    po = result.scalar_one()
    await db.commit()
    return _po_out(po)


@router.get("/{po_id}", response_model=POOut)
async def get_po(po_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    return _po_out(po)


@router.put("/{po_id}", response_model=POOut)
async def update_po(po_id: uuid.UUID, payload: POUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    if po.status in ("recu", "annule"):
        raise HTTPException(status_code=400, detail="Impossible de modifier un BC reçu ou annulé")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(po, k, v)
    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    return _po_out(result.scalar_one())


@router.post("/{po_id}/status", response_model=POOut)
async def change_status(po_id: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    new_status = body.get("status")
    if new_status not in PO_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    po.status = new_status
    po.updated_at = datetime.now(timezone.utc)
    if new_status == "envoye" and not po.ordered_at:
        po.ordered_at = datetime.now(timezone.utc)
    if new_status == "recu" and not po.received_at:
        po.received_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    return _po_out(result.scalar_one())


@router.delete("/{po_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_po(po_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    if po.status == "recu":
        raise HTTPException(status_code=400, detail="Impossible de supprimer un BC reçu")
    await db.delete(po)
    await db.commit()


# ── Lines ──────────────────────────────────────────────────────────────────────

@router.post("/{po_id}/lines", response_model=POOut, status_code=status.HTTP_201_CREATED)
async def add_line(po_id: uuid.UUID, payload: POLineCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result.scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=404, detail="Bon de commande introuvable")
    if po.status in ("recu", "annule"):
        raise HTTPException(status_code=400, detail="BC reçu ou annulé, ajout impossible")
    # Auto-fill description from catalogue
    desc = payload.description
    cost = payload.unit_cost
    if payload.catalogue_item_id and not desc:
        cat = await db.get(CatalogueItem, payload.catalogue_item_id)
        if cat:
            desc = cat.name
            if cost == 0 and cat.price:
                cost = float(cat.price)
    line = PurchaseOrderLine(order_id=po_id, description=desc, quantity=payload.quantity, unit_cost=cost,
                             catalogue_item_id=payload.catalogue_item_id, received_qty=payload.received_qty)
    db.add(line)
    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    result = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    return _po_out(result.scalar_one())


@router.put("/{po_id}/lines/{line_id}", response_model=POOut)
async def update_line(po_id: uuid.UUID, line_id: uuid.UUID, payload: POLineUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrderLine).where(PurchaseOrderLine.id == line_id, PurchaseOrderLine.order_id == po_id))
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(line, k, v)
    # Auto-update status based on received qty
    result2 = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result2.scalar_one()
    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    # Recalc status after commit
    result3 = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result3.scalar_one()
    if po.status == "envoye":
        total_qty = sum(float(l.quantity) for l in po.lines)
        recv_qty = sum(float(l.received_qty) for l in po.lines)
        if recv_qty >= total_qty and total_qty > 0:
            po.status = "recu"
            po.received_at = datetime.now(timezone.utc)
        elif recv_qty > 0:
            po.status = "partiellement_recu"
        await db.commit()
    result4 = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    return _po_out(result4.scalar_one())


@router.delete("/{po_id}/lines/{line_id}", response_model=POOut)
async def delete_line(po_id: uuid.UUID, line_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PurchaseOrderLine).where(PurchaseOrderLine.id == line_id, PurchaseOrderLine.order_id == po_id))
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    await db.delete(line)
    result2 = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    po = result2.scalar_one()
    po.updated_at = datetime.now(timezone.utc)
    await db.commit()
    result3 = await db.execute(select(PurchaseOrder).options(selectinload(PurchaseOrder.lines)).where(PurchaseOrder.id == po_id))
    return _po_out(result3.scalar_one())
