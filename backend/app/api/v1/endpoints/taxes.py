"""Onglet « Impôts et formulaires » (TASK-043).

Déclaration de TPS/TVQ : par période (mensuelle / trimestrielle / annuelle, alignée sur
l'exercice), taxes perçues = somme des factures émises datées dans la période (hors
brouillons et annulées ; les avoirs, négatifs, se soustraient), + ajustements fiscaux datés
dans la période, − paiements de taxe rattachés à la période. Les CTI/RTI (taxes payées sur
les achats) n'existent pas encore dans ERPCRM (pas de module Dépenses) : ils se saisissent
comme ajustements (catégorie cti_rti, montants négatifs).
"""
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.settings import get_setting, set_setting
from app.core.tax_reminders import FREQ_MONTHS, _add_months, deadline, complete_declared_tasks
from app.models.invoice import Invoice
from app.models.tax import TaxAdjustment, TaxPayment
from app.models.user import User

router = APIRouter()

ADJ_CATEGORIES = {
    "cti_rti": "CTI/RTI (taxes payées sur les achats)",
    "creance_irrecouvrable": "Créance irrécouvrable",
    "correction": "Correction",
    "autre": "Autre",
}
ZERO = Decimal("0.00")


# ── Périodes ─────────────────────────────────────────────────────────────────

def _periods(today: date, frequency: str, fiscal_start_month: int, count: int) -> list[tuple[date, date]]:
    """Période en cours + `count - 1` précédentes, la plus récente d'abord."""
    step = FREQ_MONTHS[frequency]
    start = date(today.year if today.month >= fiscal_start_month else today.year - 1, fiscal_start_month, 1)
    while _add_months(start, step) <= today:
        start = _add_months(start, step)
    out = []
    for _ in range(count):
        out.append((start, _add_months(start, step) - timedelta(days=1)))
        start = _add_months(start, -step)
    return out


async def _context(db: AsyncSession, frequency: str | None):
    freq = frequency or (await get_setting(db, "tax_filing_frequency") or "").strip() or "trimestrielle"
    if freq not in FREQ_MONTHS:
        raise HTTPException(status_code=400, detail="Fréquence invalide (mensuelle, trimestrielle ou annuelle)")
    lock_s = (await get_setting(db, "tax_lock_date") or "").strip()
    fiscal = int(await get_setting(db, "fiscal_year_start_month") or 1)
    return freq, (date.fromisoformat(lock_s) if lock_s else None), fiscal


async def _summary(db: AsyncSession, start: date, end: date) -> dict:
    inv = (await db.execute(
        select(func.count(), func.coalesce(func.sum(Invoice.subtotal), 0), func.coalesce(func.sum(Invoice.tps_amount), 0),
               func.coalesce(func.sum(Invoice.tvq_amount), 0))
        .where(Invoice.issue_date >= start, Invoice.issue_date <= end, Invoice.status.not_in(["brouillon", "annulee"]))
    )).one()
    adj = (await db.execute(
        select(func.coalesce(func.sum(TaxAdjustment.tps_amount), 0), func.coalesce(func.sum(TaxAdjustment.tvq_amount), 0))
        .where(TaxAdjustment.adjustment_date >= start, TaxAdjustment.adjustment_date <= end)
    )).one()
    paid = (await db.execute(
        select(func.coalesce(func.sum(TaxPayment.tps_amount), 0), func.coalesce(func.sum(TaxPayment.tvq_amount), 0))
        .where(TaxPayment.period_start == start, TaxPayment.period_end == end)
    )).one()
    tps_net, tvq_net = Decimal(inv[2]) + Decimal(adj[0]), Decimal(inv[3]) + Decimal(adj[1])
    return {
        "invoice_count": inv[0], "sales": float(inv[1]),
        "tps_collected": float(inv[2]), "tvq_collected": float(inv[3]),
        "tps_adjustments": float(adj[0]), "tvq_adjustments": float(adj[1]),
        "tps_net": float(tps_net), "tvq_net": float(tvq_net),
        "tps_paid": float(paid[0]), "tvq_paid": float(paid[1]),
        "balance": float(tps_net + tvq_net - Decimal(paid[0]) - Decimal(paid[1])),
    }


def _state(start: date, end: date, lock: date | None, today: date) -> str:
    if lock and end <= lock:
        return "declaree"
    if end >= today:
        return "en_cours"
    return "a_produire"


@router.get("/periods")
async def list_periods(frequency: str | None = None, count: int = 8, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    freq, lock, fiscal = await _context(db, frequency)
    today = date.today()
    out = []
    for start, end in _periods(today, freq, fiscal, max(1, min(count, 36))):
        out.append({"start": start, "end": end, "deadline": deadline(end, freq), "state": _state(start, end, lock, today),
                    **await _summary(db, start, end)})
    return {"frequency": freq, "tax_lock_date": lock, "periods": out}


@router.get("/report")
async def period_report(start: date, end: date, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if end < start:
        raise HTTPException(status_code=400, detail="Période invalide")
    _, lock, _ = await _context(db, None)
    invs = (await db.execute(
        select(Invoice).options(selectinload(Invoice.company))
        .where(Invoice.issue_date >= start, Invoice.issue_date <= end, Invoice.status.not_in(["brouillon", "annulee"]))
        .order_by(Invoice.issue_date, Invoice.number)
    )).scalars().all()
    adjs = (await db.execute(select(TaxAdjustment).where(TaxAdjustment.adjustment_date >= start, TaxAdjustment.adjustment_date <= end)
                             .order_by(TaxAdjustment.adjustment_date))).scalars().all()
    pays = (await db.execute(select(TaxPayment).where(TaxPayment.period_start == start, TaxPayment.period_end == end)
                             .order_by(TaxPayment.payment_date))).scalars().all()
    return {
        "start": start, "end": end, "state": _state(start, end, lock, date.today()),
        "summary": await _summary(db, start, end),
        "invoices": [{"id": str(i.id), "number": i.number, "issue_date": i.issue_date, "company_name": i.company.name,
                      "status": i.status, "is_credit": i.credit_of_id is not None, "subtotal": float(i.subtotal),
                      "tps": float(i.tps_amount), "tvq": float(i.tvq_amount), "total": float(i.total)} for i in invs],
        "adjustments": [_adj_out(a) for a in adjs],
        "payments": [_pay_out(p) for p in pays],
    }


class DeclareIn(BaseModel):
    end: date


@router.post("/declare")
async def declare_period(payload: DeclareIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Marque la période comme déclarée : « Taxes déclarées jusqu'au » avance à sa fin
    (les factures de la période sont verrouillées) et la tâche de rappel se ferme."""
    _, lock, _ = await _context(db, None)
    if payload.end >= date.today():
        raise HTTPException(status_code=400, detail="La période n'est pas terminée")
    if lock and payload.end <= lock:
        raise HTTPException(status_code=400, detail=f"Déjà déclarée (taxes déclarées jusqu'au {lock})")
    await set_setting(db, "tax_lock_date", payload.end.isoformat())
    if await complete_declared_tasks(db, payload.end):
        await db.commit()
    return {"tax_lock_date": payload.end}


# ── Ajustements fiscaux ──────────────────────────────────────────────────────

class AdjustmentIn(BaseModel):
    adjustment_date: date
    category: str = "autre"
    tps_amount: float = 0
    tvq_amount: float = 0
    description: str | None = None


def _adj_out(a: TaxAdjustment) -> dict:
    return {"id": str(a.id), "adjustment_date": a.adjustment_date, "category": a.category,
            "category_label": ADJ_CATEGORIES.get(a.category, a.category),
            "tps_amount": float(a.tps_amount), "tvq_amount": float(a.tvq_amount), "description": a.description}


async def _check_unlocked(db: AsyncSession, d: date, what: str) -> None:
    _, lock, _ = await _context(db, None)
    if lock and d <= lock:
        raise HTTPException(status_code=400, detail=f"{what} dans une période déjà déclarée (jusqu'au {lock}) : à inscrire dans une période ouverte")


def _validate_adj(p: AdjustmentIn) -> None:
    if p.category not in ADJ_CATEGORIES:
        raise HTTPException(status_code=400, detail="Catégorie invalide")
    if not p.tps_amount and not p.tvq_amount:
        raise HTTPException(status_code=400, detail="Montant TPS ou TVQ requis")


@router.get("/adjustments")
async def list_adjustments(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(TaxAdjustment).order_by(TaxAdjustment.adjustment_date.desc()))).scalars().all()
    return {"categories": ADJ_CATEGORIES, "items": [_adj_out(a) for a in rows]}


@router.post("/adjustments", status_code=status.HTTP_201_CREATED)
async def create_adjustment(payload: AdjustmentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _validate_adj(payload)
    await _check_unlocked(db, payload.adjustment_date, "Ajustement daté")
    a = TaxAdjustment(adjustment_date=payload.adjustment_date, category=payload.category,
                      tps_amount=Decimal(str(payload.tps_amount)), tvq_amount=Decimal(str(payload.tvq_amount)),
                      description=payload.description, created_by=user.id)
    db.add(a)
    await db.commit()
    return _adj_out(a)


@router.put("/adjustments/{adj_id}")
async def update_adjustment(adj_id: uuid.UUID, payload: AdjustmentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    a = await db.get(TaxAdjustment, adj_id)
    if not a:
        raise HTTPException(status_code=404, detail="Ajustement introuvable")
    _validate_adj(payload)
    await _check_unlocked(db, a.adjustment_date, "Ajustement")
    await _check_unlocked(db, payload.adjustment_date, "Ajustement daté")
    a.adjustment_date, a.category, a.description = payload.adjustment_date, payload.category, payload.description
    a.tps_amount, a.tvq_amount = Decimal(str(payload.tps_amount)), Decimal(str(payload.tvq_amount))
    await db.commit()
    return _adj_out(a)


@router.delete("/adjustments/{adj_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_adjustment(adj_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    a = await db.get(TaxAdjustment, adj_id)
    if not a:
        raise HTTPException(status_code=404, detail="Ajustement introuvable")
    await _check_unlocked(db, a.adjustment_date, "Ajustement")
    await db.delete(a)
    await db.commit()


# ── Paiements de taxe ────────────────────────────────────────────────────────

class TaxPaymentIn(BaseModel):
    payment_date: date
    period_start: date
    period_end: date
    tps_amount: float = 0
    tvq_amount: float = 0
    method: str | None = None
    reference: str | None = None
    notes: str | None = None


def _pay_out(p: TaxPayment) -> dict:
    return {"id": str(p.id), "payment_date": p.payment_date, "period_start": p.period_start, "period_end": p.period_end,
            "tps_amount": float(p.tps_amount), "tvq_amount": float(p.tvq_amount), "method": p.method,
            "reference": p.reference, "notes": p.notes}


def _validate_pay(p: TaxPaymentIn) -> None:
    if p.period_end < p.period_start:
        raise HTTPException(status_code=400, detail="Période invalide")
    if not p.tps_amount and not p.tvq_amount:
        raise HTTPException(status_code=400, detail="Montant TPS ou TVQ requis")


@router.get("/payments")
async def list_tax_payments(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(TaxPayment).order_by(TaxPayment.payment_date.desc()))).scalars().all()
    return [_pay_out(p) for p in rows]


@router.post("/payments", status_code=status.HTTP_201_CREATED)
async def create_tax_payment(payload: TaxPaymentIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _validate_pay(payload)
    p = TaxPayment(**{k: v for k, v in payload.model_dump().items() if k not in ("tps_amount", "tvq_amount")},
                   tps_amount=Decimal(str(payload.tps_amount)), tvq_amount=Decimal(str(payload.tvq_amount)), created_by=user.id)
    db.add(p)
    await db.commit()
    return _pay_out(p)


@router.put("/payments/{pay_id}")
async def update_tax_payment(pay_id: uuid.UUID, payload: TaxPaymentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    p = await db.get(TaxPayment, pay_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    _validate_pay(payload)
    for k, v in payload.model_dump().items():
        setattr(p, k, Decimal(str(v)) if k in ("tps_amount", "tvq_amount") else v)
    await db.commit()
    return _pay_out(p)


@router.delete("/payments/{pay_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tax_payment(pay_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    p = await db.get(TaxPayment, pay_id)
    if not p:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    await db.delete(p)
    await db.commit()
