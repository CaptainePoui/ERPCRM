"""Vendeurs (Employes -> Vendeurs, TASK-007.2) : reglages de commission propres a chaque vendeur, ses clients,
ses commissions, ses factures de commission et ce qui lui reste du ; ajustement a la main.
Le paiement fait au vendeur (Interac) s'associe dans Banque a sa facture de commission, comme pour tout fournisseur."""
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock, commissions
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.settings import get_setting
from app.models.user import User
from app.models.company import Company
from app.models.invoice import Invoice
from app.models.purchases import Bill, Vendor, VendorPayment
from app.models.sales_rep import SalesRep, CommissionEntry

router = APIRouter()
ZERO = Decimal("0")


class SalesRepIn(BaseModel):
    contact_id: uuid.UUID
    vendor_id: uuid.UUID
    rate: float | None = None
    referral_rate: float | None = None
    before_taxes: bool = True
    recurring_only: bool = True
    start_date: date
    is_active: bool = True
    notes: str | None = None


class ClientIn(BaseModel):
    support: bool
    rate: float | None = None      # vide = taux du vendeur pour ce mode


class AdjustIn(BaseModel):
    amount: float
    note: str
    entry_date: date | None = None


def _name(r: SalesRep) -> str:
    return f"{r.contact.first_name} {r.contact.last_name}".strip()


async def _summary(db, r: SalesRep) -> dict:
    from app.api.v1.endpoints.purchases import _bill_balances
    bills = (await db.execute(select(Bill).where(Bill.vendor_id == r.vendor_id, Bill.status.not_in(("brouillon", "annulee"))))).scalars().all()
    paid = await _bill_balances(db, [b.id for b in bills]) if bills else {}
    due = sum((max(ZERO, Decimal(b.total) - paid.get(b.id, ZERO)) for b in bills), ZERO)
    earned = sum((Decimal(e.amount) for e in (await db.execute(select(CommissionEntry).where(
        CommissionEntry.sales_rep_id == r.id, CommissionEntry.kind != "annulee"))).scalars().all()), ZERO)
    clients = (await db.execute(select(Company).where(Company.vendor_id == r.contact_id).order_by(Company.name))).scalars().all()
    return {"id": str(r.id), "name": _name(r), "contact_id": str(r.contact_id), "vendor_id": str(r.vendor_id),
            "vendor_name": r.vendor.name, "rate": float(r.rate), "referral_rate": float(r.referral_rate), "before_taxes": r.before_taxes, "recurring_only": r.recurring_only,
            "start_date": r.start_date, "is_active": r.is_active, "notes": r.notes,
            "clients": [_client(r, c) for c in clients],
            "earned": float(earned), "due": float(due)}


def _client(r: SalesRep, c: Company) -> dict:
    rate, mode = commissions.rate_for(r, c)
    return {"id": str(c.id), "name": c.name, "support": c.vendor_support, "custom_rate": float(c.vendor_rate) if c.vendor_rate is not None else None,
            "rate": float(rate), "mode": mode}


async def _get(db, rid) -> SalesRep:
    r = await db.get(SalesRep, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Vendeur introuvable")
    return r


@router.get("")
async def list_reps(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await commissions.sync(db)
    await db.commit()
    reps = (await db.execute(select(SalesRep))).scalars().all()
    out = [await _summary(db, r) for r in reps]
    default = await get_setting(db, "commission_rate")
    return {"default_rate": float(default or 10), "reps": sorted(out, key=lambda x: (not x["is_active"], x["name"].lower()))}


@router.get("/by-contact/{contact_id}")
async def rep_of_contact(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Taux du vendeur pour la fiche client (sans recalcul) ; null si ce contact n'est pas un vendeur."""
    r = (await db.execute(select(SalesRep).where(SalesRep.contact_id == contact_id))).scalar_one_or_none()
    if not r:
        return None
    return {"id": str(r.id), "rate": float(r.rate), "referral_rate": float(r.referral_rate), "is_active": r.is_active}


@router.get("/{rid}")
async def get_rep(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.api.v1.endpoints.purchases import _bill_balances
    r = await _get(db, rid)
    await commissions.sync(db, r.id)
    await db.commit()
    rows = (await db.execute(select(CommissionEntry, Invoice.number, Company.name, Bill.bill_number)
                             .outerjoin(Invoice, Invoice.id == CommissionEntry.invoice_id)
                             .outerjoin(Company, Company.id == CommissionEntry.company_id)
                             .outerjoin(Bill, Bill.id == CommissionEntry.bill_id)
                             .where(CommissionEntry.sales_rep_id == r.id)
                             .order_by(CommissionEntry.entry_date.desc(), CommissionEntry.created_at.desc()))).all()
    bills = (await db.execute(select(Bill).where(Bill.vendor_id == r.vendor_id).order_by(Bill.bill_date.desc()))).scalars().all()
    paid = await _bill_balances(db, [b.id for b in bills]) if bills else {}
    pays = (await db.execute(select(VendorPayment).where(VendorPayment.vendor_id == r.vendor_id)
                             .order_by(VendorPayment.payment_date.desc()))).scalars().all()
    d = await _summary(db, r)
    d["entries"] = [{"id": str(e.id), "kind": e.kind, "date": e.entry_date, "client": client,
                     "company_id": str(e.company_id) if e.company_id else None, "invoice": number,
                     "invoice_id": str(e.invoice_id) if e.invoice_id else None, "paid_amount": float(e.paid_amount),
                     "base": float(e.base), "rate": float(e.rate), "mode": e.mode, "amount": float(e.amount), "note": e.note,
                     "bill_number": bill_number, "bill_id": str(e.bill_id) if e.bill_id else None}
                    for e, number, client, bill_number in rows]
    d["bills"] = [{"id": str(b.id), "number": b.bill_number, "date": b.bill_date, "total": float(b.total),
                   "paid": float(paid.get(b.id, ZERO)), "status": b.status, "auto": b.source == "commission",
                   "balance": float(max(ZERO, Decimal(b.total) - paid.get(b.id, ZERO))) if b.status not in ("brouillon", "annulee") else 0.0}
                  for b in bills]
    d["payments"] = [{"id": str(p.id), "date": p.payment_date, "amount": float(p.amount), "method": p.method,
                      "reference": p.reference} for p in pays]
    return d


async def _check(db, p: SalesRepIn, rid=None) -> None:
    if any(v is not None and not (0 <= v <= 100) for v in (p.rate, p.referral_rate)):
        raise HTTPException(status_code=400, detail="Taux entre 0 et 100 %")
    if not await db.get(Vendor, p.vendor_id):
        raise HTTPException(status_code=400, detail="Fournisseur introuvable")
    other = (await db.execute(select(SalesRep).where(SalesRep.contact_id == p.contact_id))).scalar_one_or_none()
    if other and other.id != rid:
        raise HTTPException(status_code=400, detail="Ce contact est déjà un vendeur")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_rep(p: SalesRepIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _check(db, p)
    rate = p.rate if p.rate is not None else float(await get_setting(db, "commission_rate") or 10)
    r = SalesRep(contact_id=p.contact_id, vendor_id=p.vendor_id, rate=Decimal(str(rate)),
                 referral_rate=Decimal(str(p.referral_rate if p.referral_rate is not None else 5)), before_taxes=p.before_taxes,
                 recurring_only=p.recurring_only, start_date=p.start_date, is_active=p.is_active, notes=p.notes)
    db.add(r)
    await db.flush()
    await commissions.sync(db, r.id)
    await db.commit()
    return await get_rep(r.id, db)


@router.put("/{rid}")
async def update_rep(rid: uuid.UUID, p: SalesRepIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, rid)
    await _check(db, p, r.id)
    if p.vendor_id != r.vendor_id and (await db.execute(select(CommissionEntry.id).where(
            CommissionEntry.sales_rep_id == r.id, CommissionEntry.bill_id.is_not(None)).limit(1))).first():
        raise HTTPException(status_code=400, detail="Ce vendeur a déjà des factures de commission : le fournisseur payé ne change plus")
    r.contact_id, r.vendor_id, r.before_taxes, r.recurring_only = p.contact_id, p.vendor_id, p.before_taxes, p.recurring_only
    r.start_date, r.is_active, r.notes = p.start_date, p.is_active, p.notes
    if p.rate is not None:
        r.rate = Decimal(str(p.rate))      # les commissions deja calculees gardent leur taux
    if p.referral_rate is not None:
        r.referral_rate = Decimal(str(p.referral_rate))
    await db.flush()
    await commissions.sync(db, r.id)
    await db.commit()
    return await get_rep(r.id, db)


@router.put("/{rid}/clients/{company_id}")
async def update_client(rid: uuid.UUID, company_id: uuid.UUID, p: ClientIn, db: AsyncSession = Depends(get_db),
                        _: User = Depends(get_current_user)):
    """Mode (avec support / référence) et taux propre d'un client du vendeur ; vaut pour les paiements suivants."""
    r = await _get(db, rid)
    c = await db.get(Company, company_id)
    if not c or c.vendor_id != r.contact_id:
        raise HTTPException(status_code=404, detail="Ce client n'est pas à ce vendeur")
    if p.rate is not None and not (0 <= p.rate <= 100):
        raise HTTPException(status_code=400, detail="Taux entre 0 et 100 %")
    c.vendor_support = p.support
    c.vendor_rate = Decimal(str(p.rate)) if p.rate is not None else None
    await db.commit()
    return await get_rep(r.id, db)


@router.post("/{rid}/adjust", status_code=status.HTTP_201_CREATED)
async def adjust(rid: uuid.UUID, p: AdjustIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, rid)
    if not p.amount or not p.note.strip():
        raise HTTPException(status_code=400, detail="Montant et raison requis")
    db.add(CommissionEntry(sales_rep_id=r.id, kind="ajustement", entry_date=p.entry_date or clock.today(),
                           amount=Decimal(str(p.amount)).quantize(Decimal("0.01")), note=p.note.strip()))
    await db.flush()
    for bid in await commissions.place(db, r):
        await commissions.rebuild(db, bid)
    await db.commit()
    return await get_rep(r.id, db)


@router.delete("/{rid}/entries/{eid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_adjustment(rid: uuid.UUID, eid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.api.v1.endpoints.purchases import _bill_balances
    e = await db.get(CommissionEntry, eid)
    if not e or e.sales_rep_id != rid or e.kind != "ajustement":
        raise HTTPException(status_code=404, detail="Ajustement introuvable")
    if e.bill_id and (await _bill_balances(db, [e.bill_id])).get(e.bill_id, ZERO) > 0:
        raise HTTPException(status_code=400, detail="Sa facture de commission est déjà payée : faites un ajustement inverse")
    bid = e.bill_id
    await db.delete(e)
    await db.flush()
    if bid:
        await commissions.rebuild(db, bid)
    await db.commit()
