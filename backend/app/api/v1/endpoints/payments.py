import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.payment import Payment, PaymentMethod
from app.models.invoice import Invoice
from app.models.user import User

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class PaymentMethodOut(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    discount_rate: float
    is_active: bool
    model_config = {"from_attributes": True}


class PaymentOut(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    method_code: str
    method_name: str
    amount: float
    discount_rate: float
    discount_amount: float
    net_amount: float
    paid_at: date
    notes: str | None
    transaction_ref: str | None
    card_last4: str | None
    model_config = {"from_attributes": True}


class PaymentCreate(BaseModel):
    method_code: str
    amount: float
    paid_at: date | None = None
    notes: str | None = None
    card_token: str | None = None
    card_last4: str | None = None


class PaymentMethodUpdate(BaseModel):
    name: str | None = None
    discount_rate: float | None = None
    is_active: bool | None = None


# ── Payment Methods ───────────────────────────────────────────────────────────

@router.get("/methods", response_model=list[PaymentMethodOut])
async def list_methods(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PaymentMethod).order_by(PaymentMethod.name))
    return result.scalars().all()


@router.put("/methods/{method_id}", response_model=PaymentMethodOut)
async def update_method(method_id: uuid.UUID, payload: PaymentMethodUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(PaymentMethod).where(PaymentMethod.id == method_id))
    method = result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Mode introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(method, field, value)
    await db.commit()
    await db.refresh(method)
    return method


# ── Payments ──────────────────────────────────────────────────────────────────

@router.get("/invoice/{invoice_id}", response_model=list[PaymentOut])
async def list_payments(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Payment).where(Payment.invoice_id == invoice_id).order_by(Payment.paid_at.desc())
    )
    return result.scalars().all()


@router.post("/invoice/{invoice_id}", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def add_payment(invoice_id: uuid.UUID, payload: PaymentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    if inv.status in ("annulee",):
        raise HTTPException(status_code=400, detail="Impossible d'encaisser une facture annulée")

    method_result = await db.execute(select(PaymentMethod).where(PaymentMethod.code == payload.method_code))
    method = method_result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Mode de paiement introuvable")

    discount_rate = method.discount_rate
    discount_amount = round(payload.amount * discount_rate / 100, 2)
    net_amount = round(payload.amount - discount_amount, 2)

    payment = Payment(
        invoice_id=invoice_id,
        method_code=method.code,
        method_name=method.name,
        amount=payload.amount,
        discount_rate=discount_rate,
        discount_amount=discount_amount,
        net_amount=net_amount,
        paid_at=payload.paid_at or date.today(),
        notes=payload.notes,
        card_token=payload.card_token,
        card_last4=payload.card_last4,
    )
    db.add(payment)
    await db.flush()

    # Calculer total encaissé et marquer payée si soldée
    total_paid_result = await db.execute(
        select(func.sum(Payment.net_amount)).where(Payment.invoice_id == invoice_id)
    )
    total_paid = total_paid_result.scalar() or 0
    if total_paid >= inv.total and inv.status not in ("payee",):
        inv.status = "payee"

    await db.commit()
    await db.refresh(payment)
    return payment


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Payment).options(selectinload(Payment.invoice)).where(Payment.id == payment_id))
    payment = result.scalar_one_or_none()
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    await db.delete(payment)
    await db.commit()
