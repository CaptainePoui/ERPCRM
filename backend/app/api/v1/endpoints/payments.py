import uuid
from decimal import Decimal
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, cast, Integer
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core import clock
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.payment import PaymentMethod
from app.models.client_payment import ClientPayment, PaymentAllocation, CreditAllocation, PaymentDocument
from app.core import payment_documents
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
    kind: str = "payment"   # payment | credit (avoir applique -- se retire par /payments/credit-allocations/{id})


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
    payer_company_id: uuid.UUID | None = None   # TASK-002.4 : la maison mere qui paie pour ses succursales


async def next_payment_reference(db: AsyncSession) -> str:
    """Prochaine reference PAY-AAAA-NNNN : compteur qui ne recule jamais, meme si le dernier
    paiement est supprime (app/core/numbering.py ; avant : plus grand numero + 1)."""
    from app.core.numbering import next_document_number
    return await next_document_number(db, "payment")


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


async def settled_amounts(db: AsyncSession, invoice_ids: list) -> dict:
    """Montant regle par facture = encaissements confirmes + avoirs appliques (TASK-005.10).
    Seule source de verite du solde : statut, portail, banque, PDF."""
    if not invoice_ids:
        return {}
    out: dict = {}
    for iid, s in (await db.execute(
        select(PaymentAllocation.invoice_id, func.sum(PaymentAllocation.amount_allocated))
        .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
        .where(PaymentAllocation.invoice_id.in_(invoice_ids), ClientPayment.status == "confirmed")
        .group_by(PaymentAllocation.invoice_id)
    )).all():
        out[iid] = Decimal(s)
    for iid, s in (await db.execute(
        select(CreditAllocation.invoice_id, func.sum(CreditAllocation.amount))
        .where(CreditAllocation.invoice_id.in_(invoice_ids)).group_by(CreditAllocation.invoice_id)
    )).all():
        out[iid] = out.get(iid, Decimal("0.00")) + Decimal(s)
    return out


async def recalc_credit_status(credit_id: uuid.UUID, db: AsyncSession) -> None:
    """Un avoir entierement applique passe « payee » ; sinon il reste emis (envoyee)."""
    c = await db.get(Invoice, credit_id)
    if not c or c.status in ("brouillon", "annulee"):
        return
    applied = (await db.execute(select(func.sum(CreditAllocation.amount)).where(CreditAllocation.credit_invoice_id == credit_id))).scalar() or 0
    c.status = "payee" if Decimal(applied) >= abs(c.total) else "envoyee"


async def _recalculate_invoice_status(invoice_id: uuid.UUID, db: AsyncSession) -> None:
    """Recalcule le statut d'une facture selon les encaissements confirmes et les avoirs appliques."""
    inv = await db.get(Invoice, invoice_id)
    if not inv or inv.status == "annulee":
        return
    if inv.credit_of_id is not None:
        await recalc_credit_status(invoice_id, db)
        return
    confirmed_total = (await settled_amounts(db, [invoice_id])).get(invoice_id, Decimal("0.00"))

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
    from app.api.v1.endpoints.settings import barter_enabled
    q = select(PaymentMethod).order_by(PaymentMethod.name)
    if not await barter_enabled(db):
        q = q.where(PaymentMethod.code != "troc")       # option Echanges decochee
    return (await db.execute(q)).scalars().all()


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


# ── Paiements recus (liste globale, menu Ventes) ─────────────────────────────

@router.get("")
async def list_all_payments(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Tous les encaissements clients, les plus recents d'abord, avec compagnie et factures couvertes."""
    from app.models.company import Company
    from app.models.bank_account import BankTransaction
    rows = (await db.execute(
        select(ClientPayment, Company.name).join(Company, Company.id == ClientPayment.company_id)
        .order_by(ClientPayment.received_at.desc().nulls_first(), ClientPayment.created_at.desc())
    )).all()
    nums: dict = {}
    for pid, num in (await db.execute(
        select(PaymentAllocation.payment_id, Invoice.number).join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
    )).all():
        nums.setdefault(pid, []).append(num)
    banked = set((await db.execute(select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None)))).scalars().all())
    docs = dict((await db.execute(select(PaymentDocument.payment_id, func.count()).group_by(PaymentDocument.payment_id))).all())
    return [{
        "id": str(cp.id), "company_id": str(cp.company_id), "company_name": name, "amount": float(cp.amount),
        "status": cp.status, "source": cp.source, "method_name": cp.method_name, "reference": cp.reference,
        "received_at": cp.received_at, "created_at": cp.created_at, "invoice_numbers": sorted(nums.get(cp.id, [])),
        "bank_matched": cp.id in banked,
        "lost_invoice": cp.lost_invoice, "lost_invoice_number": cp.lost_invoice_number, "document_count": docs.get(cp.id, 0),
    } for cp, name in rows]


# ── Detail d'un paiement + pieces jointes (TASK-005.24 / TASK-042.8, 2026-10-15) ──

async def payment_detail_dict(db: AsyncSession, cp: ClientPayment) -> dict:
    from app.models.company import Company
    from app.models.bank_account import BankTransaction
    comp = await db.get(Company, cp.company_id)
    allocs = (await db.execute(select(PaymentAllocation, Invoice.number).join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
                               .where(PaymentAllocation.payment_id == cp.id).order_by(Invoice.number))).all()
    tx = (await db.execute(select(BankTransaction).where(BankTransaction.client_payment_id == cp.id))).scalars().first()
    docs = (await db.execute(select(PaymentDocument).where(PaymentDocument.payment_id == cp.id).order_by(PaymentDocument.created_at))).scalars().all()
    return {
        "id": str(cp.id), "company_id": str(cp.company_id), "company_name": comp.name if comp else None,
        "amount": float(cp.amount), "status": cp.status, "source": cp.source, "method_name": cp.method_name,
        "reference": cp.reference, "received_at": cp.received_at, "notes": cp.notes,
        "lost_invoice": cp.lost_invoice, "lost_invoice_number": cp.lost_invoice_number,
        "allocations": [{"invoice_id": str(a.invoice_id), "number": n, "amount": float(a.amount_allocated)} for a, n in allocs],
        "bank": {"id": str(tx.id), "account_id": str(tx.account_id), "posted_date": tx.posted_date, "amount": float(tx.amount),
                 "description": tx.description, "payee": tx.payee} if tx else None,
        "documents": [{"id": str(d.id), "kind": d.kind, "original_name": d.original_name, "created_at": d.created_at,
                       "media_type": payment_documents.media_type(d)} for d in docs],
    }


@router.get("/{payment_id}/detail")
async def payment_detail(payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    cp = await db.get(ClientPayment, payment_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    return await payment_detail_dict(db, cp)


@router.post("/{payment_id}/documents", status_code=status.HTTP_201_CREATED)
async def add_payment_document(payment_id: uuid.UUID, file: UploadFile = File(...), kind: str = Form("cheque"),
                               db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Ajoute une piece (cheque numerise, preuve) a un paiement."""
    from pathlib import Path
    cp = await db.get(ClientPayment, payment_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    ext = Path(file.filename or "").suffix.lower()
    if ext not in payment_documents.TYPES:
        raise HTTPException(status_code=400, detail="Format accepté : image (JPG, PNG, WEBP) ou PDF")
    data = await file.read()
    if not data or len(data) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Fichier vide ou trop gros (20 Mo au plus)")
    payment_documents.save(db, cp.id, data, ext, file.filename, kind if kind in ("cheque", "preuve") else "cheque")
    await db.commit()
    return await payment_detail_dict(db, cp)


@router.get("/documents/{doc_id}/file")
async def payment_document_file(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from fastapi.responses import FileResponse
    doc = await db.get(PaymentDocument, doc_id)
    if not doc or not payment_documents.path_of(doc).is_file():
        raise HTTPException(status_code=404, detail="Document introuvable")
    return FileResponse(payment_documents.path_of(doc), media_type=payment_documents.media_type(doc))


@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_payment_document(doc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    doc = await db.get(PaymentDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    f = payment_documents.path_of(doc)
    await db.delete(doc)
    await db.commit()
    f.unlink(missing_ok=True)


class LostInvoiceUpdate(BaseModel):
    company_id: uuid.UUID | None = None
    invoice_number: str | None = None
    notes: str | None = None


@router.patch("/{payment_id}/lost-invoice")
async def update_lost_invoice(payment_id: uuid.UUID, payload: LostInvoiceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Toujours modifiable : client, numero de la facture perdue, note (le depot bancaire suit le client)."""
    from app.models.company import Company
    from app.models.bank_account import BankTransaction
    cp = await db.get(ClientPayment, payment_id)
    if not cp or not cp.lost_invoice:
        raise HTTPException(status_code=404, detail="Paiement de facture perdue introuvable")
    if payload.company_id and payload.company_id != cp.company_id:
        if not await db.get(Company, payload.company_id):
            raise HTTPException(status_code=404, detail="Compagnie introuvable")
        cp.company_id = payload.company_id
        for tx in (await db.execute(select(BankTransaction).where(BankTransaction.client_payment_id == cp.id))).scalars().all():
            tx.company_id, tx.company_source = payload.company_id, "manual"
    if payload.invoice_number is not None:
        cp.lost_invoice_number = payload.invoice_number.strip().lstrip("#") or None
    if payload.notes is not None:
        cp.notes = payload.notes.strip() or None
    await db.commit()
    return await payment_detail_dict(db, cp)


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
    out = [_payment_out(cp, invoice_id) for cp in payments]
    # Avoirs appliques sur cette facture
    for ca, credit in (await db.execute(
        select(CreditAllocation, Invoice).join(Invoice, Invoice.id == CreditAllocation.credit_invoice_id)
        .where(CreditAllocation.invoice_id == invoice_id)
    )).all():
        amt = float(ca.amount)
        out.append(PaymentOut(id=ca.id, invoice_id=invoice_id, method_code="avoir", method_name=f"Avoir {credit.number}",
                              amount=amt, discount_rate=0.0, discount_amount=0.0, net_amount=amt,
                              paid_at=ca.applied_at or credit.issue_date, notes=None, transaction_ref=None, card_last4=None,
                              status="confirmed", source="avoir", reference=credit.number, kind="credit"))
    return out


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
    if method.code == "troc":
        from app.api.v1.endpoints.settings import require_barter
        await require_barter(db)

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
        received_at=payload.paid_at or clock.today(),
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
    if method.code == "troc":
        from app.api.v1.endpoints.settings import require_barter
        await require_barter(db)

    total = Decimal(str(sum(a.amount for a in payload.allocations)))
    reference = await next_payment_reference(db) if payload.generate_reference else None

    # Valider que toutes les factures existent et appartiennent a la meme compagnie (ou a ses succursales)
    inv_companies: set = set()
    for alloc_in in payload.allocations:
        inv = await db.get(Invoice, alloc_in.invoice_id)
        if not inv:
            raise HTTPException(status_code=404, detail=f"Facture {alloc_in.invoice_id} introuvable")
        if inv.status == "annulee":
            raise HTTPException(status_code=400, detail=f"Facture {alloc_in.invoice_id} annulee")
        if payload.status == "confirmed" and payload.source == "manual":      # paiement groupe de l'ecran (TASK-046)
            if inv.status == "brouillon" or inv.credit_of_id is not None:
                raise HTTPException(status_code=400, detail=f"Facture {inv.number} : brouillon ou avoir")
            left = inv.total - ((await settled_amounts(db, [inv.id])).get(inv.id) or Decimal("0"))
            if Decimal(str(alloc_in.amount)) > left + Decimal("0.005"):
                raise HTTPException(status_code=400, detail=f"Facture {inv.number} : il ne reste que {left} $ à payer")
        inv_companies.add(inv.company_id)
    # TASK-002.4 : une maison mere peut payer pour ses succursales (paiement a son nom)
    from app.core.company_tree import payer_for
    company_id = await payer_for(db, inv_companies, payload.payer_company_id)
    if not company_id:
        raise HTTPException(status_code=400, detail="Les factures doivent être celles d'une même compagnie ou de ses succursales")

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
        received_at=payload.received_at or (clock.today() if payload.status == "confirmed" else None),
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
    cp.received_at = cp.received_at or clock.today()
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


# ── Avoirs appliques (TASK-005.10) ───────────────────────────────────────────

class CreditApplyIn(BaseModel):
    allocations: list[AllocationIn]
    applied_at: date | None = None


async def _credit_summary(db: AsyncSession, credit: Invoice) -> dict:
    rows = (await db.execute(
        select(CreditAllocation, Invoice).join(Invoice, Invoice.id == CreditAllocation.invoice_id)
        .where(CreditAllocation.credit_invoice_id == credit.id).order_by(Invoice.issue_date)
    )).all()
    applied = sum((ca.amount for ca, _ in rows), Decimal("0.00"))
    return {"credit_id": str(credit.id), "number": credit.number, "total": float(abs(credit.total)),
            "applied": float(applied), "remaining": float(abs(credit.total) - applied),
            "allocations": [{"id": str(ca.id), "invoice_id": str(i.id), "invoice_number": i.number, "issue_date": i.issue_date,
                             "amount": float(ca.amount), "applied_at": ca.applied_at} for ca, i in rows]}


async def _get_credit(credit_id: uuid.UUID, db: AsyncSession) -> Invoice:
    c = await db.get(Invoice, credit_id)
    if not c or (c.credit_of_id is None and c.total >= 0):
        raise HTTPException(status_code=404, detail="Avoir introuvable")
    return c


@router.get("/credits/open")
async def open_credits(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Avoirs emis du client dont il reste un montant a appliquer."""
    credits = (await db.execute(select(Invoice).where(
        Invoice.company_id == company_id, Invoice.credit_of_id.is_not(None),
        Invoice.status.not_in(["brouillon", "annulee"])).order_by(Invoice.issue_date))).scalars().all()
    out = [await _credit_summary(db, c) for c in credits]
    return [c for c in out if c["remaining"] > 0.005]


@router.get("/credits/{credit_id}/candidates")
async def credit_candidates(credit_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Factures du meme client avec un solde a regler (les plus anciennes d'abord)."""
    credit = await _get_credit(credit_id, db)
    invs = (await db.execute(select(Invoice).where(
        Invoice.company_id == credit.company_id, Invoice.credit_of_id.is_(None),
        Invoice.status.in_(["envoyee", "en_retard", "partiellement_payee"])).order_by(Invoice.issue_date))).scalars().all()
    settled = await settled_amounts(db, [i.id for i in invs])
    out = []
    for i in invs:
        bal = i.total - settled.get(i.id, Decimal("0.00"))
        if bal > 0:
            out.append({"invoice_id": str(i.id), "number": i.number, "issue_date": i.issue_date, "total": float(i.total), "balance": float(bal)})
    return out


@router.get("/credits/{credit_id}")
async def get_credit_allocations(credit_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _credit_summary(db, await _get_credit(credit_id, db))


@router.post("/credits/{credit_id}/apply")
async def apply_credit(credit_id: uuid.UUID, payload: CreditApplyIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Applique l'avoir sur une ou plusieurs factures du meme client (sans depasser ni le reste
    de l'avoir ni le solde de chaque facture)."""
    credit = await _get_credit(credit_id, db)
    if credit.status in ("brouillon", "annulee"):
        raise HTTPException(status_code=400, detail="Émettez d'abord l'avoir (il est en brouillon ou annulé)")
    summary = await _credit_summary(db, credit)
    total = sum((Decimal(str(a.amount)) for a in payload.allocations), Decimal("0.00"))
    if not payload.allocations or any(a.amount <= 0 for a in payload.allocations):
        raise HTTPException(status_code=400, detail="Montants invalides")
    if total > Decimal(str(summary["remaining"])) + Decimal("0.005"):
        raise HTTPException(status_code=400, detail=f"Il ne reste que {summary['remaining']:.2f} $ sur cet avoir")
    settled = await settled_amounts(db, [a.invoice_id for a in payload.allocations])
    for a in payload.allocations:
        inv = await db.get(Invoice, a.invoice_id)
        if not inv or inv.company_id != credit.company_id:
            raise HTTPException(status_code=400, detail="Un avoir ne s'applique qu'aux factures du même client")
        if inv.credit_of_id is not None or inv.status in ("brouillon", "annulee"):
            raise HTTPException(status_code=400, detail=f"Facture {inv.number} : brouillon, annulée ou avoir")
        left = inv.total - settled.get(inv.id, Decimal("0.00"))
        if Decimal(str(a.amount)) > left + Decimal("0.005"):
            raise HTTPException(status_code=400, detail=f"Facture {inv.number} : il ne reste que {left} $ à régler")
        db.add(CreditAllocation(credit_invoice_id=credit.id, invoice_id=inv.id, amount=Decimal(str(a.amount)),
                                applied_at=payload.applied_at or clock.today()))
    await db.flush()
    for a in payload.allocations:
        await _recalculate_invoice_status(a.invoice_id, db)
    await recalc_credit_status(credit.id, db)
    await db.commit()
    return await _credit_summary(db, credit)


@router.delete("/credit-allocations/{alloc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_credit_allocation(alloc_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ca = await db.get(CreditAllocation, alloc_id)
    if not ca:
        raise HTTPException(status_code=404, detail="Application introuvable")
    inv_id, credit_id = ca.invoice_id, ca.credit_invoice_id
    await db.delete(ca)
    await db.flush()
    await _recalculate_invoice_status(inv_id, db)
    await recalc_credit_status(credit_id, db)
    await db.commit()


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
    files = [payment_documents.path_of(d) for d in (await db.execute(select(PaymentDocument).where(PaymentDocument.payment_id == cp.id))).scalars().all()]
    await db.delete(cp)
    await db.flush()

    for iid in invoice_ids:
        await _recalculate_invoice_status(iid, db)

    await db.commit()
    for f in files:
        f.unlink(missing_ok=True)
