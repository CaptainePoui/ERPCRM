import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.ecom import EcomOrder, EcomOrderLine
from app.models.catalogue import CatalogueItem
from app.models.user import User

router = APIRouter()

ECOM_STATUSES = {
    "nouveau": "Nouveau",
    "en_traitement": "En traitement",
    "confirme": "Confirmé",
    "expedie": "Expédié",
    "livre": "Livré",
    "annule": "Annulé",
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class EcomItemOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    price: float
    category: str | None
    image_url: str | None

class EcomCartLine(BaseModel):
    catalogue_item_id: uuid.UUID
    quantity: float = 1

class EcomOrderRequest(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: str | None = None
    company_name: str | None = None
    customer_notes: str | None = None
    lines: list[EcomCartLine]

class EcomOrderLineOut(BaseModel):
    id: uuid.UUID
    catalogue_item_id: uuid.UUID | None
    description: str
    quantity: float
    unit_price: float
    subtotal: float

class EcomOrderOut(BaseModel):
    id: uuid.UUID
    order_number: str
    customer_name: str
    customer_email: str
    customer_phone: str | None
    company_name: str | None
    status: str
    status_label: str
    notes: str | None
    customer_notes: str | None
    total: float
    created_at: datetime
    lines: list[EcomOrderLineOut]

class EcomOrderListItem(BaseModel):
    id: uuid.UUID
    order_number: str
    customer_name: str
    customer_email: str
    status: str
    status_label: str
    total: float
    created_at: datetime

class EcomStatusUpdate(BaseModel):
    status: str
    notes: str | None = None


def _line_out(l: EcomOrderLine) -> EcomOrderLineOut:
    return EcomOrderLineOut(
        id=l.id, catalogue_item_id=l.catalogue_item_id, description=l.description,
        quantity=float(l.quantity), unit_price=float(l.unit_price),
        subtotal=float(l.quantity) * float(l.unit_price),
    )

def _order_out(o: EcomOrder) -> EcomOrderOut:
    lines = [_line_out(l) for l in o.lines]
    return EcomOrderOut(
        id=o.id, order_number=o.order_number, customer_name=o.customer_name,
        customer_email=o.customer_email, customer_phone=o.customer_phone,
        company_name=o.company_name, status=o.status,
        status_label=ECOM_STATUSES.get(o.status, o.status),
        notes=o.notes, customer_notes=o.customer_notes,
        total=float(o.total), created_at=o.created_at, lines=lines,
    )


async def _next_order_number(db: AsyncSession) -> str:
    result = await db.execute(select(func.count()).select_from(EcomOrder))
    count = result.scalar() or 0
    return f"WEB-{count + 1:05d}"


# ── Public: Catalogue Vitrine ─────────────────────────────────────────────────

@router.get("/catalogue", response_model=list[EcomItemOut])
async def public_catalogue(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CatalogueItem).where(CatalogueItem.is_active == True).order_by(CatalogueItem.name)
    )
    items = result.scalars().all()
    return [
        EcomItemOut(
            id=i.id, name=i.name, description=i.description,
            price=float(i.price or 0), category=i.category,
            image_url=f"/uploads/catalogue/{i.image_filename}" if i.image_filename else None,
        )
        for i in items
    ]


# ── Public: Place Order ────────────────────────────────────────────────────────

@router.post("/orders", response_model=EcomOrderOut, status_code=status.HTTP_201_CREATED)
async def place_order(payload: EcomOrderRequest, db: AsyncSession = Depends(get_db)):
    if not payload.lines:
        raise HTTPException(status_code=400, detail="Panier vide")

    order_number = await _next_order_number(db)
    order_lines = []
    total = 0.0

    for cart_line in payload.lines:
        item = await db.get(CatalogueItem, cart_line.catalogue_item_id)
        if not item or not item.is_active:
            raise HTTPException(status_code=400, detail=f"Article introuvable ou inactif")
        price = float(item.price or 0)
        qty = float(cart_line.quantity)
        order_lines.append(EcomOrderLine(
            catalogue_item_id=item.id, description=item.name,
            quantity=qty, unit_price=price,
        ))
        total += price * qty

    order = EcomOrder(
        order_number=order_number,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        company_name=payload.company_name,
        customer_notes=payload.customer_notes,
        total=total,
    )
    db.add(order)
    await db.flush()
    for line in order_lines:
        line.order_id = order.id
        db.add(line)

    await db.commit()
    result = await db.execute(select(EcomOrder).options(selectinload(EcomOrder.lines)).where(EcomOrder.id == order.id))
    return _order_out(result.scalar_one())


# ── Admin: Order Management ────────────────────────────────────────────────────

@router.get("/orders", response_model=list[EcomOrderListItem])
async def list_orders(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(EcomOrder).order_by(EcomOrder.created_at.desc())
    )
    return [
        EcomOrderListItem(
            id=o.id, order_number=o.order_number, customer_name=o.customer_name,
            customer_email=o.customer_email, status=o.status,
            status_label=ECOM_STATUSES.get(o.status, o.status),
            total=float(o.total), created_at=o.created_at,
        )
        for o in result.scalars().all()
    ]


@router.get("/orders/{order_id}", response_model=EcomOrderOut)
async def get_order(order_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(EcomOrder).options(selectinload(EcomOrder.lines)).where(EcomOrder.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    return _order_out(o)


@router.put("/orders/{order_id}/status", response_model=EcomOrderOut)
async def update_order_status(order_id: uuid.UUID, payload: EcomStatusUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.status not in ECOM_STATUSES:
        raise HTTPException(status_code=400, detail="Statut invalide")
    result = await db.execute(select(EcomOrder).options(selectinload(EcomOrder.lines)).where(EcomOrder.id == order_id))
    o = result.scalar_one_or_none()
    if not o:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    o.status = payload.status
    o.updated_at = datetime.now(timezone.utc)
    if payload.notes:
        o.notes = payload.notes
    await db.commit()
    result = await db.execute(select(EcomOrder).options(selectinload(EcomOrder.lines)).where(EcomOrder.id == order_id))
    return _order_out(result.scalar_one())
