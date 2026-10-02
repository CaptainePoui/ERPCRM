import uuid
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, cast, Integer
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.payment import PaymentMethod
from app.models.client_payment import ClientPayment, PaymentAllocation
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
    """Vue d'un encaissement dans le contexte d'une facture (retro-compat frontend)."""
    id: uuid.UUID
    invoice_id: uuid.UUID
    method_code: str
    method_name: str
    amount: float
    discount_rate: float
    discount_amount: float
    net_amount: float
    paid_at: date | None
    notes: str | None
    transaction_ref: str | None
    card_last4: str | None
    status: str
    source: str
    reference: str | None


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


class AllocationIn(BaseModel):
    invoice_id: uuid.UUID
    amount: float


class MultiPaymentCreate(BaseModel):
    """Creation d'un paiement couvrant plusieurs factures (portail ou interne)."""
    method_code: str
    allocations: list[AllocationIn]  # >= 1 entrees
    source: str = "manual"
    status: str = "confirmed"
    notes: str | None = None
    portal_notes: str | None = None
    card_token: str | None = None
    card_last4: str | None = None
    received_at: date | None = None
    generate_reference: bool = False


async def next_payment_reference(db: AsyncSession) -> str:
    """Prochaine reference PAY-AAAA-NNNN : plus grand numero de l'annee + 1.

    Le verrou consultatif (relache au commit/rollback de la transaction) serialise
    deux creations simultanees ; le MAX evite de retomber sur une reference
    existante apres une suppression (un comptage + 1 le faisait).
    """
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('client_payments.reference'))"))
    year = date.today().year
    prefix = f"PAY-{year}-"
    r = await db.execute(
        select(func.max(cast(func.substr(ClientPayment.reference, len(prefix) + 1), Integer)))
        .where(ClientPayment.reference.like(f"{prefix}%"))
    )
    n = (r.scalar() or 0) + 1
    return f"{prefix}{n:04d}"


async def _reload_payment(payment_id: uuid.UUID, db: AsyncSession) -> ClientPayment:
    """Recharge un encaissement avec ses allocations apres commit (un acces paresseux leve MissingGreenlet)."""
    result = await db.execute(
        select(ClientPayment)
        .where(ClientPayment.id == payment_id)
        .options(selectinload(ClientPayment.allocations))
        .execution_options(populate_existing=True)
    )
    return result.scalar_one()


def _payment_out(cp: ClientPayment, invoice_id: uuid.UUID) -> PaymentOut:
    """Formatte un ClientPayment dans la vue d'une facture specifique."""
    alloc = next((a for a in cp.allocations if a.invoice_id == invoice_id), None)
    net = float(alloc.amount_allocated) if alloc else float(cp.amount)
    method = next((a for a in cp.allocations), None)
    return PaymentOut(
        id=cp.id,
        invoice_id=invoice_id,
        method_code=cp.method_code,
        method_name=cp.method_name,
        amount=net,
        discount_rate=0.0,
        discount_amount=0.0,
        net_amount=net,
        paid_at=cp.received_at,
        notes=cp.notes,
        transaction_ref=cp.transaction_ref,
        card_last4=cp.card_last4,
        status=cp.status,
        source=cp.source,
        reference=cp.reference,
    )


async def _recalculate_invoice_status(invoice_id: uuid.UUID, db: AsyncSession) -> None:
    """Recalcule le statut d'une facture selon les encaissements confirmes."""
    inv = await db.get(Invoice, invoice_id)
    if not inv or inv.status == "annulee":
        return

    r = await db.execute(
        select(func.sum(PaymentAllocation.amount_allocated))
        .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
        .where(
            PaymentAllocation.invoice_id == invoice_id,
            ClientPayment.status == "confirmed",
        )
    )
    confirmed_total = r.scalar() or Decimal("0.00")

    if confirmed_total >= inv.total:
        inv.status = "payee"
    elif confirmed_total > 0:
        inv.status = "partiellement_payee"
    elif inv.status in ("payee", "partiellement_payee"):
        # Paiement annule -- repasse a envoyee ou en_retard selon date
        inv.status = "envoyee"


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


# ── Payments (vue par facture, retro-compat frontend) ────────────────────────

@router.get("/invoice/{invoice_id}", response_model=list[PaymentOut])
async def list_payments(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(ClientPayment)
        .join(PaymentAllocation, PaymentAllocation.payment_id == ClientPayment.id)
        .where(PaymentAllocation.invoice_id == invoice_id)
        .options(selectinload(ClientPayment.allocations))
        .order_by(ClientPayment.created_at.desc())
    )
    payments = result.scalars().unique().all()
    return [_payment_out(cp, invoice_id) for cp in payments]


@router.post("/invoice/{invoice_id}", response_model=PaymentOut, status_code=status.HTTP_201_CREATED)
async def add_payment(invoice_id: uuid.UUID, payload: PaymentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Encaissement simple sur une seule facture (usage interne / InvoiceDetail)."""
    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    if inv.status == "annulee":
        raise HTTPException(status_code=400, detail="Impossible d'encaisser une facture annulee")

    method_result = await db.execute(select(PaymentMethod).where(PaymentMethod.code == payload.method_code))
    method = method_result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Mode de paiement introuvable")

    amount = Decimal(str(payload.amount))
    cp = ClientPayment(
        company_id=inv.company_id,
        status="confirmed",
        source="manual",
        method_code=method.code,
        method_name=method.name,
        amount=amount,
        notes=payload.notes,
        card_token=payload.card_token,
        card_last4=payload.card_last4,
        received_at=payload.paid_at or date.today(),
    )
    db.add(cp)
    await db.flush()

    alloc = PaymentAllocation(
        payment_id=cp.id,
        invoice_id=invoice_id,
        amount_allocated=amount,
    )
    db.add(alloc)
    await db.flush()

    await _recalculate_invoice_status(invoice_id, db)
    await db.commit()
    cp = await _reload_payment(cp.id, db)

    return _payment_out(cp, invoice_id)


@router.post("/multi", response_model=list[PaymentOut], status_code=status.HTTP_201_CREATED)
async def add_multi_payment(payload: MultiPaymentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Encaissement couvrant plusieurs factures (portail ou interne)."""
    if not payload.allocations:
        raise HTTPException(status_code=400, detail="Au moins une allocation requise")

    method_result = await db.execute(select(PaymentMethod).where(PaymentMethod.code == payload.method_code))
    method = method_result.scalar_one_or_none()
    if not method:
        raise HTTPException(status_code=404, detail="Mode de paiement introuvable")

    total = Decimal(str(sum(a.amount for a in payload.allocations)))
    reference = await next_payment_reference(db) if payload.generate_reference else None

    # Valider que toutes les factures existent et appartiennent a la meme compagnie
    company_id = None
    for alloc_in in payload.allocations:
        inv = await db.get(Invoice, alloc_in.invoice_id)
        if not inv:
            raise HTTPException(status_code=404, detail=f"Facture {alloc_in.invoice_id} introuvable")
        if inv.status == "annulee":
            raise HTTPException(status_code=400, detail=f"Facture {alloc_in.invoice_id} annulee")
        if company_id is None:
            company_id = inv.company_id
        elif company_id != inv.company_id:
            raise HTTPException(status_code=400, detail="Toutes les factures doivent appartenir a la meme compagnie")

    cp = ClientPayment(
        company_id=company_id,
        status=payload.status,
        source=payload.source,
        method_code=method.code,
        method_name=method.name,
        amount=total,
        reference=reference,
        notes=payload.notes,
        portal_notes=payload.portal_notes,
        card_token=payload.card_token,
        card_last4=payload.card_last4,
        received_at=payload.received_at or (date.today() if payload.status == "confirmed" else None),
    )
    db.add(cp)
    await db.flush()

    invoice_ids = []
    for alloc_in in payload.allocations:
        alloc = PaymentAllocation(
            payment_id=cp.id,
            invoice_id=alloc_in.invoice_id,
            amount_allocated=Decimal(str(alloc_in.amount)),
        )
        db.add(alloc)
        invoice_ids.append(alloc_in.invoice_id)
    await db.flush()

    if payload.status == "confirmed":
        for iid in invoice_ids:
            await _recalculate_invoice_status(iid, db)

    await db.commit()
    cp = await _reload_payment(cp.id, db)
    return [_payment_out(cp, iid) for iid in invoice_ids]


@router.patch("/{payment_id}/confirm", response_model=PaymentOut)
async def confirm_payment(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Confirme un paiement en attente (pending -> confirmed) et met a jour les factures."""
    result = await db.execute(
        select(ClientPayment)
        .where(ClientPayment.id == payment_id)
        .options(selectinload(ClientPayment.allocations))
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if cp.status == "confirmed":
        raise HTTPException(status_code=400, detail="Deja confirme")

    cp.status = "confirmed"
    cp.received_at = cp.received_at or date.today()
    for alloc in cp.allocations:
        await _recalculate_invoice_status(alloc.invoice_id, db)

    await db.commit()
    cp = await _reload_payment(cp.id, db)
    first_inv = cp.allocations[0].invoice_id if cp.allocations else None
    return _payment_out(cp, first_inv or cp.id)


@router.patch("/{payment_id}/reject", response_model=PaymentOut)
async def reject_payment(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Rejette un paiement en attente (pending/processing -> rejected), ex. virement jamais recu."""
    result = await db.execute(
        select(ClientPayment)
        .where(ClientPayment.id == payment_id)
        .options(selectinload(ClientPayment.allocations))
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    if cp.status not in ("pending", "processing"):
        raise HTTPException(status_code=400, detail="Seul un paiement en attente peut etre rejete")

    cp.status = "rejected"
    for alloc in cp.allocations:
        await _recalculate_invoice_status(alloc.invoice_id, db)

    await db.commit()
    cp = await _reload_payment(cp.id, db)
    first_inv = cp.allocations[0].invoice_id if cp.allocations else None
    return _payment_out(cp, first_inv or cp.id)


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(ClientPayment)
        .where(ClientPayment.id == payment_id)
        .options(selectinload(ClientPayment.allocations))
    )
    cp = result.scalar_one_or_none()
    if not cp:
        raise HTTPException(status_code=404, detail="Paiement introuvable")

    invoice_ids = [a.invoice_id for a in cp.allocations]
    await db.delete(cp)
    await db.flush()

    for iid in invoice_ids:
        await _recalculate_invoice_status(iid, db)

    await db.commit()
