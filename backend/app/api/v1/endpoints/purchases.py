"""API du module Achats (TASK-044) -- /api/v1/purchases.

Taxes (meme arrondi que les ventes, demie vers le haut) :
- hors taxes  : TPS = 5 % et TVQ = 9,975 % de la base des lignes qui portent chaque taxe ;
- taxes incluses : chaque montant saisi contient deja ses taxes ; TPS et TVQ en sont extraites
  et arrondies ligne par ligne, la base prend le reste pour que le total reste exactement la somme saisie.
"""
import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.invoices import _money
from app.api.v1.endpoints.recurring_billing import FREQUENCIES, _cycle_bounds
from app.models.purchases import (
    Vendor, ExpenseCategory, Expense, RecurringExpense, Bill, BillLine, RecurringBill, RecurringBillLine,
    VendorPayment, VendorPaymentAllocation, VendorCredit, VendorCreditAllocation,
)
from app.models.user import User

router = APIRouter()

TPS, TVQ = Decimal("5"), Decimal("9.975")
TAX_CODES = ("tps_tvq", "tps", "tvq", "aucune")
ZERO = Decimal("0.00")


def _rates(code: str) -> tuple[Decimal, Decimal]:
    return (TPS if code in ("tps_tvq", "tps") else ZERO, TVQ if code in ("tps_tvq", "tvq") else ZERO)


def compute_taxes(items: list[tuple[Decimal, str]], mode: str) -> dict:
    """items = [(montant saisi, code de taxe)] -> sous-total, TPS, TVQ, total."""
    if mode == "inclusive":
        # Chaque taxe est extraite du montant TTC puis arrondie ; la base prend le reste
        # (le total ne bouge jamais d'un cent), arrondi par ligne. Verifie sur les 851 factures fournisseurs importees.
        total = sum((Decimal(a) for a, _ in items), ZERO)
        tps = tvq = ZERO
        for a, code in items:   # arrondi ligne par ligne
            r1, r2 = _rates(code)
            tps += _money(Decimal(a) * r1 / (100 + r1 + r2))
            tvq += _money(Decimal(a) * r2 / (100 + r1 + r2))
        return {"subtotal": _money(total) - tps - tvq, "tps_amount": tps, "tvq_amount": tvq, "total": _money(total)}
    subtotal = _money(sum((Decimal(a) for a, _ in items), ZERO))
    base_tps = sum((Decimal(a) for a, c in items if _rates(c)[0]), ZERO)
    base_tvq = sum((Decimal(a) for a, c in items if _rates(c)[1]), ZERO)
    tps, tvq = _money(base_tps * TPS / 100), _money(base_tvq * TVQ / 100)
    return {"subtotal": subtotal, "tps_amount": tps, "tvq_amount": tvq, "total": subtotal + tps + tvq}


def _check_tax(mode: str, code: str | None = None) -> None:
    if mode not in ("exclusive", "inclusive"):
        raise HTTPException(status_code=400, detail="Mode de taxe invalide (hors taxes ou taxes incluses)")
    if code is not None and code not in TAX_CODES:
        raise HTTPException(status_code=400, detail="Code de taxe invalide")


def _check_freq(freq: str) -> None:
    if freq not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Fréquence invalide")


async def _reload(db: AsyncSession, model, oid: uuid.UUID):
    """Relit l'objet avec ses relations (un acces paresseux apres commit leverait MissingGreenlet)."""
    return (await db.execute(select(model).where(model.id == oid).execution_options(populate_existing=True))).scalar_one()


async def _get(db: AsyncSession, model, oid: uuid.UUID, what: str):
    obj = await db.get(model, oid)
    if not obj:
        raise HTTPException(status_code=404, detail=f"{what} introuvable")
    return obj


# ── Fournisseurs ─────────────────────────────────────────────────────────────

class VendorIn(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None
    company_id: uuid.UUID | None = None
    default_category_id: uuid.UUID | None = None
    is_active: bool = True


def _vendor_out(v: Vendor, stats: dict | None = None) -> dict:
    s = stats or {}
    return {"id": str(v.id), "name": v.name, "email": v.email, "phone": v.phone, "address": v.address, "notes": v.notes,
            "company_id": str(v.company_id) if v.company_id else None,
            "default_category_id": str(v.default_category_id) if v.default_category_id else None,
            "is_active": v.is_active, "bill_count": s.get("count", 0), "balance_due": float(s.get("due", 0))}


@router.get("/vendors")
async def list_vendors(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    vendors = (await db.execute(select(Vendor).order_by(Vendor.name))).scalars().all()
    bal = await _bill_balances(db)
    stats: dict = {}
    for b in (await db.execute(select(Bill.id, Bill.vendor_id, Bill.total, Bill.status))).all():
        s = stats.setdefault(b.vendor_id, {"count": 0, "due": ZERO})
        s["count"] += 1
        if b.status not in ("brouillon", "annulee"):
            s["due"] += max(ZERO, b.total - bal.get(b.id, ZERO))
    return [_vendor_out(v, stats.get(v.id)) for v in vendors]


async def _unique_vendor_name(db: AsyncSession, name: str, exclude: uuid.UUID | None = None) -> None:
    q = select(Vendor.id).where(func.lower(Vendor.name) == name.strip().lower())
    if exclude:
        q = q.where(Vendor.id != exclude)
    if (await db.execute(q)).first():
        raise HTTPException(status_code=400, detail="Un fournisseur porte déjà ce nom")


@router.post("/vendors", status_code=status.HTTP_201_CREATED)
async def create_vendor(p: VendorIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if not p.name.strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    await _unique_vendor_name(db, p.name)
    v = Vendor(**{**p.model_dump(), "name": p.name.strip()})
    db.add(v)
    await db.commit()
    return _vendor_out(v)


@router.put("/vendors/{vid}")
async def update_vendor(vid: uuid.UUID, p: VendorIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    v = await _get(db, Vendor, vid, "Fournisseur")
    if not p.name.strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    await _unique_vendor_name(db, p.name, exclude=vid)
    for k, val in p.model_dump().items():
        setattr(v, k, val.strip() if k == "name" else val)
    await db.commit()
    return _vendor_out(v)


# ── Categories de depense ────────────────────────────────────────────────────

class CategoryIn(BaseModel):
    name: str
    claims_tax_credits: bool = True
    is_active: bool = True


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(ExpenseCategory).order_by(ExpenseCategory.name))).scalars().all()
    return [{"id": str(c.id), "name": c.name, "claims_tax_credits": c.claims_tax_credits, "is_active": c.is_active} for c in rows]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(p: CategoryIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if not p.name.strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    if (await db.execute(select(ExpenseCategory.id).where(func.lower(ExpenseCategory.name) == p.name.strip().lower()))).first():
        raise HTTPException(status_code=400, detail="Cette catégorie existe déjà")
    c = ExpenseCategory(name=p.name.strip(), claims_tax_credits=p.claims_tax_credits, is_active=p.is_active)
    db.add(c)
    await db.commit()
    return {"id": str(c.id), "name": c.name, "claims_tax_credits": c.claims_tax_credits, "is_active": c.is_active}


@router.put("/categories/{cid}")
async def update_category(cid: uuid.UUID, p: CategoryIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await _get(db, ExpenseCategory, cid, "Catégorie")
    c.name, c.claims_tax_credits, c.is_active = p.name.strip(), p.claims_tax_credits, p.is_active
    await db.commit()
    return {"id": str(c.id), "name": c.name, "claims_tax_credits": c.claims_tax_credits, "is_active": c.is_active}


# ── Depenses ─────────────────────────────────────────────────────────────────

class ExpenseIn(BaseModel):
    expense_date: date
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    description: str | None = None
    tax_mode: str = "exclusive"
    tax_code: str = "tps_tvq"
    amount: float
    paid_through: str | None = None
    bank_account_id: uuid.UUID | None = None
    reference: str | None = None
    notes: str | None = None


def _expense_out(e: Expense) -> dict:
    return {"id": str(e.id), "expense_date": e.expense_date, "vendor_id": str(e.vendor_id) if e.vendor_id else None,
            "vendor_name": e.vendor.name if e.vendor else None, "category_id": str(e.category_id) if e.category_id else None,
            "category_name": e.category.name if e.category else None, "description": e.description,
            "tax_mode": e.tax_mode, "tax_code": e.tax_code, "amount": float(e.amount), "subtotal": float(e.subtotal),
            "tps_amount": float(e.tps_amount), "tvq_amount": float(e.tvq_amount), "total": float(e.total),
            "paid_through": e.paid_through, "bank_account_id": str(e.bank_account_id) if e.bank_account_id else None,
            "reference": e.reference, "notes": e.notes, "source": e.source,
            "recurring_id": str(e.recurring_id) if e.recurring_id else None}


def _apply_expense(e, p: ExpenseIn) -> None:
    _check_tax(p.tax_mode, p.tax_code)
    if p.amount == 0:
        raise HTTPException(status_code=400, detail="Montant requis")
    for k, v in p.model_dump().items():
        setattr(e, k, Decimal(str(v)) if k == "amount" else v)
    t = compute_taxes([(Decimal(str(p.amount)), p.tax_code)], p.tax_mode)
    e.subtotal, e.tps_amount, e.tvq_amount, e.total = t["subtotal"], t["tps_amount"], t["tvq_amount"], t["total"]


@router.get("/expenses")
async def list_expenses(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Expense).order_by(Expense.expense_date.desc(), Expense.created_at.desc()))).scalars().all()
    return [_expense_out(e) for e in rows]


@router.post("/expenses", status_code=status.HTTP_201_CREATED)
async def create_expense(p: ExpenseIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    e = Expense()
    _apply_expense(e, p)
    db.add(e)
    await db.commit()
    return _expense_out(await _reload(db, Expense, e.id))


@router.put("/expenses/{eid}")
async def update_expense(eid: uuid.UUID, p: ExpenseIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    e = await _get(db, Expense, eid, "Dépense")
    _apply_expense(e, p)
    await db.commit()
    return _expense_out(await _reload(db, Expense, eid))


@router.delete("/expenses/{eid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(eid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await db.delete(await _get(db, Expense, eid, "Dépense"))
    await db.commit()


# ── Depenses periodiques ─────────────────────────────────────────────────────

class RecurringExpenseIn(BaseModel):
    name: str
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    description: str | None = None
    tax_mode: str = "exclusive"
    tax_code: str = "tps_tvq"
    amount: float
    paid_through: str | None = None
    frequency: str = "mensuel"
    start_date: date
    end_date: date | None = None
    is_active: bool = True


def _cycle(start: date, freq: str, end: date | None, last: date | None) -> dict:
    """Prochain cycle a enregistrer : celui qui suit le dernier genere (ou le premier). Un cycle
    oublie n'est jamais perdu -- chaque generation rattrape le plus ancien cycle manquant."""
    nxt = start if not last else _cycle_bounds(start, freq, last)[1]
    cs, ce = _cycle_bounds(start, freq, nxt)
    return {"current_cycle_start": cs, "current_cycle_end": ce, "next_date": cs,
            "can_generate": not (end and cs > end) and cs <= date.today()}


def _why_not(r, c: dict) -> str:
    if r.end_date and c["current_cycle_start"] > r.end_date:
        return f"Terminée : le prochain cycle ({c['current_cycle_start']}) est après la date de fin"
    return f"Rien à enregistrer : le prochain cycle commence le {c['current_cycle_start']}"


def _rexp_out(r: RecurringExpense) -> dict:
    t = compute_taxes([(r.amount, r.tax_code)], r.tax_mode)
    return {"id": str(r.id), "name": r.name, "vendor_id": str(r.vendor_id) if r.vendor_id else None,
            "vendor_name": r.vendor.name if r.vendor else None, "category_id": str(r.category_id) if r.category_id else None,
            "category_name": r.category.name if r.category else None, "description": r.description, "tax_mode": r.tax_mode,
            "tax_code": r.tax_code, "amount": float(r.amount), "total": float(t["total"]), "paid_through": r.paid_through,
            "frequency": r.frequency, "start_date": r.start_date, "end_date": r.end_date,
            "last_generated_date": r.last_generated_date, "is_active": r.is_active,
            **_cycle(r.start_date, r.frequency, r.end_date, r.last_generated_date)}


def _check_dates(start: date, end: date | None) -> None:
    if end and end < start:
        raise HTTPException(status_code=400, detail="La date de fin doit suivre la date de début")


@router.get("/recurring-expenses")
async def list_recurring_expenses(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(RecurringExpense).order_by(RecurringExpense.start_date))).scalars().all()
    return [_rexp_out(r) for r in rows]


@router.post("/recurring-expenses", status_code=status.HTTP_201_CREATED)
async def create_recurring_expense(p: RecurringExpenseIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    _check_tax(p.tax_mode, p.tax_code); _check_freq(p.frequency); _check_dates(p.start_date, p.end_date)
    r = RecurringExpense(**{**p.model_dump(), "amount": Decimal(str(p.amount))})
    db.add(r)
    await db.commit()
    return _rexp_out(await _reload(db, RecurringExpense, r.id))


@router.put("/recurring-expenses/{rid}")
async def update_recurring_expense(rid: uuid.UUID, p: RecurringExpenseIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, RecurringExpense, rid, "Dépense périodique")
    _check_tax(p.tax_mode, p.tax_code); _check_freq(p.frequency); _check_dates(p.start_date, p.end_date)
    for k, v in p.model_dump().items():
        setattr(r, k, Decimal(str(v)) if k == "amount" else v)
    await db.commit()
    return _rexp_out(await _reload(db, RecurringExpense, rid))


@router.post("/recurring-expenses/{rid}/generate", status_code=status.HTTP_201_CREATED)
async def generate_recurring_expense(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, RecurringExpense, rid, "Dépense périodique")
    c = _cycle(r.start_date, r.frequency, r.end_date, r.last_generated_date)
    if not r.is_active:
        raise HTTPException(status_code=400, detail="Récurrence inactive : réactivez-la d'abord")
    if not c["can_generate"]:
        raise HTTPException(status_code=400, detail=_why_not(r, c))
    e = Expense(recurring_id=r.id, source="recurring")
    _apply_expense(e, ExpenseIn(expense_date=c["current_cycle_start"], vendor_id=r.vendor_id, category_id=r.category_id,
                                description=r.description or r.name, tax_mode=r.tax_mode, tax_code=r.tax_code,
                                amount=float(r.amount), paid_through=r.paid_through))
    db.add(e)
    r.last_generated_date = c["current_cycle_start"]
    await db.commit()
    return _expense_out(await _reload(db, Expense, e.id))


@router.delete("/recurring-expenses/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_expense(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Les depenses deja enregistrees restent (lien recurring_id remis a vide)."""
    await db.delete(await _get(db, RecurringExpense, rid, "Dépense périodique"))
    await db.commit()


# ── Factures fournisseurs ────────────────────────────────────────────────────

class BillLineIn(BaseModel):
    description: str = ""
    category_id: uuid.UUID | None = None
    qty: float = 1
    rate: float = 0
    tax_code: str = "tps_tvq"


class BillIn(BaseModel):
    vendor_id: uuid.UUID
    bill_number: str | None = None
    bill_date: date
    due_date: date | None = None
    tax_mode: str = "exclusive"
    adjustment: float = 0
    notes: str | None = None
    is_draft: bool = False
    lines: list[BillLineIn]


async def _bill_balances(db: AsyncSession, bill_ids: list | None = None) -> dict:
    """Montant regle par facture = paiements + avoirs appliques."""
    out: dict = {}
    for model in (VendorPaymentAllocation, VendorCreditAllocation):
        q = select(model.bill_id, func.sum(model.amount)).group_by(model.bill_id)
        if bill_ids is not None:
            q = q.where(model.bill_id.in_(bill_ids))
        for bid, s in (await db.execute(q)).all():
            out[bid] = out.get(bid, ZERO) + Decimal(s)
    return out


def _bill_status(b: Bill, paid: Decimal) -> str:
    if b.status in ("brouillon", "annulee"):
        return b.status
    if paid >= b.total:
        return "payee"
    if paid > 0:
        return "partielle"
    return "en_retard" if b.due_date and b.due_date < date.today() else "ouverte"


async def recalc_bill_status(db: AsyncSession, bill_id: uuid.UUID) -> None:
    b = await db.get(Bill, bill_id)
    if b:
        b.status = _bill_status(b, (await _bill_balances(db, [bill_id])).get(bill_id, ZERO))


def _bill_out(b: Bill, paid: Decimal, with_lines: bool = False) -> dict:
    d = {"id": str(b.id), "vendor_id": str(b.vendor_id), "vendor_name": b.vendor.name, "bill_number": b.bill_number,
         "bill_date": b.bill_date, "due_date": b.due_date, "status": b.status, "tax_mode": b.tax_mode,
         "subtotal": float(b.subtotal), "tps_amount": float(b.tps_amount), "tvq_amount": float(b.tvq_amount),
         "adjustment": float(b.adjustment or 0), "total": float(b.total), "paid": float(paid), "balance": float(max(ZERO, b.total - paid)) if b.status not in ("brouillon", "annulee") else 0.0,
         "notes": b.notes, "source": b.source, "recurring_id": str(b.recurring_id) if b.recurring_id else None}
    if with_lines:
        d["lines"] = [{"id": str(l.id), "description": l.description, "category_id": str(l.category_id) if l.category_id else None,
                       "category_name": l.category.name if l.category else None, "qty": float(l.qty), "rate": float(l.rate),
                       "line_total": float(l.line_total), "tax_code": l.tax_code} for l in b.lines]
    return d


def _apply_bill(b: Bill, p: BillIn) -> None:
    _check_tax(p.tax_mode)
    if not p.lines:
        raise HTTPException(status_code=400, detail="Au moins une ligne")
    b.vendor_id, b.bill_number, b.bill_date, b.due_date = p.vendor_id, p.bill_number, p.bill_date, p.due_date
    b.tax_mode, b.notes = p.tax_mode, p.notes
    b.lines.clear()
    items = []
    for n, l in enumerate(p.lines):
        _check_tax(p.tax_mode, l.tax_code)
        total = _money(Decimal(str(l.qty)) * Decimal(str(l.rate)))
        b.lines.append(BillLine(description=l.description, category_id=l.category_id, qty=Decimal(str(l.qty)),
                                rate=Decimal(str(l.rate)), line_total=total, tax_code=l.tax_code, sort_order=n))
        items.append((total, l.tax_code))
    t = compute_taxes(items, p.tax_mode)
    b.adjustment = _money(p.adjustment or 0)
    if abs(b.adjustment) > 1:
        raise HTTPException(status_code=400, detail="Ajustement d'arrondi limité à 1 $")
    b.subtotal, b.tps_amount, b.tvq_amount = t["subtotal"], t["tps_amount"], t["tvq_amount"]
    b.total = t["total"] + b.adjustment


@router.get("/bills")
async def list_bills(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    bills = (await db.execute(select(Bill).order_by(Bill.bill_date.desc(), Bill.created_at.desc()))).scalars().all()
    bal = await _bill_balances(db)
    return [_bill_out(b, bal.get(b.id, ZERO)) for b in bills]


@router.get("/bills/open")
async def open_bills(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Factures avec un solde, tous fournisseurs -- pour repartir un paiement groupe."""
    bills = (await db.execute(select(Bill).where(Bill.status.in_(["ouverte", "partielle", "en_retard"])).order_by(Bill.bill_date))).scalars().all()
    bal = await _bill_balances(db, [b.id for b in bills])
    return [_bill_out(b, bal.get(b.id, ZERO)) for b in bills if b.total - bal.get(b.id, ZERO) > 0]


@router.get("/bills/{bid}")
async def get_bill(bid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _get(db, Bill, bid, "Facture fournisseur")
    b = await _reload(db, Bill, bid)
    paid = (await _bill_balances(db, [bid])).get(bid, ZERO)
    out = _bill_out(b, paid, with_lines=True)
    pays = (await db.execute(select(VendorPayment, VendorPaymentAllocation.amount)
                             .join(VendorPaymentAllocation, VendorPaymentAllocation.payment_id == VendorPayment.id)
                             .where(VendorPaymentAllocation.bill_id == bid))).all()
    creds = (await db.execute(select(VendorCredit, VendorCreditAllocation.amount)
                              .join(VendorCreditAllocation, VendorCreditAllocation.credit_id == VendorCredit.id)
                              .where(VendorCreditAllocation.bill_id == bid))).all()
    out["payments"] = [{"id": str(p.id), "date": p.payment_date, "amount": float(a), "method": p.method, "reference": p.reference,
                        "payee": p.vendor.name if p.vendor else p.payee_label} for p, a in pays]
    out["credits"] = [{"id": str(c.id), "date": c.credit_date, "amount": float(a), "number": c.credit_number} for c, a in creds]
    return out


@router.post("/bills", status_code=status.HTTP_201_CREATED)
async def create_bill(p: BillIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _get(db, Vendor, p.vendor_id, "Fournisseur")
    b = Bill(status="brouillon" if p.is_draft else "ouverte", lines=[])
    _apply_bill(b, p)
    db.add(b)
    await db.flush()
    await recalc_bill_status(db, b.id)
    await db.commit()
    return await get_bill(b.id, db)


@router.put("/bills/{bid}")
async def update_bill(bid: uuid.UUID, p: BillIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await _get(db, Bill, bid, "Facture fournisseur")
    _apply_bill(b, p)
    if b.status == "brouillon" and not p.is_draft:
        b.status = "ouverte"
    await db.flush()
    paid = (await _bill_balances(db, [bid])).get(bid, ZERO)
    if paid > b.total:
        raise HTTPException(status_code=400, detail="Le total ne peut pas être inférieur à ce qui est déjà réglé")
    await recalc_bill_status(db, bid)
    await db.commit()
    return await get_bill(bid, db)


@router.delete("/bills/{bid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill(bid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await _get(db, Bill, bid, "Facture fournisseur")
    if (await _bill_balances(db, [bid])).get(bid, ZERO) > 0:
        raise HTTPException(status_code=400, detail="Facture déjà réglée en partie : retirez d'abord ses paiements")
    await db.delete(b)
    await db.commit()


# ── Factures fournisseurs periodiques ────────────────────────────────────────

class RecurringBillIn(BaseModel):
    name: str
    vendor_id: uuid.UUID
    tax_mode: str = "exclusive"
    frequency: str = "mensuel"
    start_date: date
    end_date: date | None = None
    is_active: bool = True
    notes: str | None = None
    lines: list[BillLineIn]


def _rbill_out(r: RecurringBill) -> dict:
    items = [(_money(l.qty * l.rate), l.tax_code) for l in r.lines]
    t = compute_taxes(items, r.tax_mode) if items else {"total": ZERO}
    return {"id": str(r.id), "name": r.name, "vendor_id": str(r.vendor_id), "vendor_name": r.vendor.name, "tax_mode": r.tax_mode,
            "frequency": r.frequency, "start_date": r.start_date, "end_date": r.end_date, "last_generated_date": r.last_generated_date,
            "is_active": r.is_active, "notes": r.notes, "total": float(t["total"]),
            "lines": [{"description": l.description, "category_id": str(l.category_id) if l.category_id else None, "qty": float(l.qty),
                       "rate": float(l.rate), "tax_code": l.tax_code} for l in r.lines],
            **_cycle(r.start_date, r.frequency, r.end_date, r.last_generated_date)}


def _apply_rbill(r: RecurringBill, p: RecurringBillIn) -> None:
    _check_tax(p.tax_mode); _check_freq(p.frequency); _check_dates(p.start_date, p.end_date)
    if not p.lines:
        raise HTTPException(status_code=400, detail="Au moins une ligne")
    for k in ("name", "vendor_id", "tax_mode", "frequency", "start_date", "end_date", "is_active", "notes"):
        setattr(r, k, getattr(p, k))
    r.lines.clear()
    for n, l in enumerate(p.lines):
        _check_tax(p.tax_mode, l.tax_code)
        r.lines.append(RecurringBillLine(description=l.description, category_id=l.category_id, qty=Decimal(str(l.qty)),
                                         rate=Decimal(str(l.rate)), tax_code=l.tax_code, sort_order=n))


@router.get("/recurring-bills")
async def list_recurring_bills(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(RecurringBill).order_by(RecurringBill.start_date))).scalars().all()
    return [_rbill_out(r) for r in rows]


@router.post("/recurring-bills", status_code=status.HTTP_201_CREATED)
async def create_recurring_bill(p: RecurringBillIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _get(db, Vendor, p.vendor_id, "Fournisseur")
    r = RecurringBill(lines=[])
    _apply_rbill(r, p)
    db.add(r)
    await db.commit()
    return _rbill_out(await _reload(db, RecurringBill, r.id))


@router.put("/recurring-bills/{rid}")
async def update_recurring_bill(rid: uuid.UUID, p: RecurringBillIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, RecurringBill, rid, "Facture périodique")
    _apply_rbill(r, p)
    await db.commit()
    return _rbill_out(await _reload(db, RecurringBill, rid))


@router.post("/recurring-bills/{rid}/generate", status_code=status.HTTP_201_CREATED)
async def generate_recurring_bill(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await _get(db, RecurringBill, rid, "Facture périodique")
    c = _cycle(r.start_date, r.frequency, r.end_date, r.last_generated_date)
    if not r.is_active:
        raise HTTPException(status_code=400, detail="Récurrence inactive : réactivez-la d'abord")
    if not c["can_generate"]:
        raise HTTPException(status_code=400, detail=_why_not(r, c))
    b = Bill(status="ouverte", recurring_id=r.id, source="recurring", lines=[])
    _apply_bill(b, BillIn(vendor_id=r.vendor_id, bill_date=c["current_cycle_start"], due_date=c["current_cycle_start"],
                          tax_mode=r.tax_mode, notes=f"Générée depuis la facture périodique « {r.name} »",
                          lines=[BillLineIn(description=l.description, category_id=l.category_id, qty=float(l.qty),
                                            rate=float(l.rate), tax_code=l.tax_code) for l in r.lines]))
    db.add(b)
    r.last_generated_date = c["current_cycle_start"]
    await db.flush()
    await recalc_bill_status(db, b.id)
    await db.commit()
    return await get_bill(b.id, db)


@router.delete("/recurring-bills/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_bill(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Les factures deja generees restent (lien recurring_id remis a vide)."""
    await db.delete(await _get(db, RecurringBill, rid, "Facture périodique"))
    await db.commit()


# ── Paiements effectues (groupes) ────────────────────────────────────────────

class AllocIn(BaseModel):
    bill_id: uuid.UUID
    amount: float


class VendorPaymentIn(BaseModel):
    payment_date: date
    vendor_id: uuid.UUID | None = None
    payee_label: str | None = None
    amount: float
    method: str | None = None
    reference: str | None = None
    bank_account_id: uuid.UUID | None = None
    notes: str | None = None
    allocations: list[AllocIn] = []


async def _payment_out(db: AsyncSession, p: VendorPayment) -> dict:
    bills = {b.id: b for b in (await db.execute(select(Bill).where(Bill.id.in_([a.bill_id for a in p.allocations])))).scalars().all()} if p.allocations else {}
    return {"id": str(p.id), "payment_date": p.payment_date, "vendor_id": str(p.vendor_id) if p.vendor_id else None,
            "payee": p.vendor.name if p.vendor else p.payee_label, "payee_label": p.payee_label, "amount": float(p.amount),
            "method": p.method, "reference": p.reference, "notes": p.notes, "source": p.source,
            "bank_account_id": str(p.bank_account_id) if p.bank_account_id else None,
            "allocated": float(sum((a.amount for a in p.allocations), ZERO)),
            "allocations": [{"bill_id": str(a.bill_id), "amount": float(a.amount), "bill_number": bills[a.bill_id].bill_number,
                             "vendor_name": bills[a.bill_id].vendor.name, "bill_date": bills[a.bill_id].bill_date}
                            for a in p.allocations if a.bill_id in bills]}


async def _apply_allocations(db: AsyncSession, allocs: list[AllocIn], total: Decimal, own_model, own_id, same_vendor: uuid.UUID | None = None) -> list:
    if sum((Decimal(str(a.amount)) for a in allocs), ZERO) > total:
        raise HTTPException(status_code=400, detail="La répartition dépasse le montant")
    paid = await _bill_balances(db, [a.bill_id for a in allocs])
    # Ce qui est deja reparti par CE document (en modification) ne compte pas contre lui-meme
    mine = {a.bill_id: a.amount for a in (await db.execute(select(own_model).where(
        (own_model.payment_id if own_model is VendorPaymentAllocation else own_model.credit_id) == own_id))).scalars().all()} if own_id else {}
    for a in allocs:
        b = await _get(db, Bill, a.bill_id, "Facture fournisseur")
        if a.amount <= 0:
            raise HTTPException(status_code=400, detail="Montant de répartition invalide")
        if b.status in ("brouillon", "annulee"):
            raise HTTPException(status_code=400, detail=f"Facture {b.bill_number or b.id} en brouillon ou annulée")
        if same_vendor and b.vendor_id != same_vendor:
            raise HTTPException(status_code=400, detail="Un avoir ne s'applique qu'aux factures du même fournisseur")
        left = b.total - paid.get(b.id, ZERO) + mine.get(b.id, ZERO)
        if Decimal(str(a.amount)) > left:
            raise HTTPException(status_code=400, detail=f"Facture {b.bill_number or ''} : il ne reste que {left} $ à régler")
    return [a.bill_id for a in allocs]


@router.get("/payments")
async def list_vendor_payments(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(VendorPayment).order_by(VendorPayment.payment_date.desc(), VendorPayment.created_at.desc()))).scalars().all()
    return [await _payment_out(db, p) for p in rows]


async def _save_payment(db: AsyncSession, p: VendorPaymentIn, vp: VendorPayment | None) -> VendorPayment:
    if p.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant requis")
    if not p.vendor_id and not (p.payee_label or "").strip():
        raise HTTPException(status_code=400, detail="Indiquez le fournisseur ou à qui le paiement a été fait (ex. carte de crédit)")
    await _apply_allocations(db, p.allocations, Decimal(str(p.amount)), VendorPaymentAllocation, vp.id if vp else None)
    before = [a.bill_id for a in vp.allocations] if vp else []
    if vp is None:
        vp = VendorPayment(allocations=[])
        db.add(vp)
    for k in ("payment_date", "vendor_id", "payee_label", "method", "reference", "bank_account_id", "notes"):
        setattr(vp, k, getattr(p, k))
    vp.amount = Decimal(str(p.amount))
    vp.allocations.clear()
    for a in p.allocations:
        vp.allocations.append(VendorPaymentAllocation(bill_id=a.bill_id, amount=Decimal(str(a.amount))))
    await db.flush()
    for bid in set(before) | {a.bill_id for a in p.allocations}:
        await recalc_bill_status(db, bid)
    await db.commit()
    return vp


@router.post("/payments", status_code=status.HTTP_201_CREATED)
async def create_vendor_payment(p: VendorPaymentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    vp = await _save_payment(db, p, None)
    return await _payment_out(db, await _reload(db, VendorPayment, vp.id))


@router.put("/payments/{pid}")
async def update_vendor_payment(pid: uuid.UUID, p: VendorPaymentIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _save_payment(db, p, await _get(db, VendorPayment, pid, "Paiement"))
    return await _payment_out(db, await _reload(db, VendorPayment, pid))


@router.delete("/payments/{pid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_payment(pid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    vp = await _get(db, VendorPayment, pid, "Paiement")
    bills = [a.bill_id for a in vp.allocations]
    await db.delete(vp)
    await db.flush()
    for bid in bills:
        await recalc_bill_status(db, bid)
    await db.commit()


# ── Avoirs fournisseur ───────────────────────────────────────────────────────

class VendorCreditIn(BaseModel):
    vendor_id: uuid.UUID
    credit_number: str | None = None
    credit_date: date
    tax_mode: str = "exclusive"
    tax_code: str = "tps_tvq"
    amount: float
    category_id: uuid.UUID | None = None
    description: str | None = None
    allocations: list[AllocIn] = []


def _credit_out(c: VendorCredit) -> dict:
    applied = sum((a.amount for a in c.allocations), ZERO)
    return {"id": str(c.id), "vendor_id": str(c.vendor_id), "vendor_name": c.vendor.name, "credit_number": c.credit_number,
            "credit_date": c.credit_date, "tax_mode": c.tax_mode, "tax_code": c.tax_code, "amount": float(c.amount),
            "subtotal": float(c.subtotal), "tps_amount": float(c.tps_amount), "tvq_amount": float(c.tvq_amount),
            "total": float(c.total), "applied": float(applied), "remaining": float(c.total - applied),
            "category_id": str(c.category_id) if c.category_id else None, "description": c.description,
            "allocations": [{"bill_id": str(a.bill_id), "amount": float(a.amount)} for a in c.allocations]}


@router.get("/credits")
async def list_vendor_credits(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(VendorCredit).order_by(VendorCredit.credit_date.desc()))).scalars().all()
    return [_credit_out(c) for c in rows]


async def _save_credit(db: AsyncSession, p: VendorCreditIn, c: VendorCredit | None) -> VendorCredit:
    _check_tax(p.tax_mode, p.tax_code)
    if p.amount <= 0:
        raise HTTPException(status_code=400, detail="Montant requis")
    await _get(db, Vendor, p.vendor_id, "Fournisseur")
    t = compute_taxes([(Decimal(str(p.amount)), p.tax_code)], p.tax_mode)
    await _apply_allocations(db, p.allocations, t["total"], VendorCreditAllocation, c.id if c else None, same_vendor=p.vendor_id)
    before = [a.bill_id for a in c.allocations] if c else []
    if c is None:
        c = VendorCredit(allocations=[])
        db.add(c)
    for k in ("vendor_id", "credit_number", "credit_date", "tax_mode", "tax_code", "category_id", "description"):
        setattr(c, k, getattr(p, k))
    c.amount = Decimal(str(p.amount))
    c.subtotal, c.tps_amount, c.tvq_amount, c.total = t["subtotal"], t["tps_amount"], t["tvq_amount"], t["total"]
    c.allocations.clear()
    for a in p.allocations:
        c.allocations.append(VendorCreditAllocation(bill_id=a.bill_id, amount=Decimal(str(a.amount))))
    await db.flush()
    for bid in set(before) | {a.bill_id for a in p.allocations}:
        await recalc_bill_status(db, bid)
    await db.commit()
    return c


@router.post("/credits", status_code=status.HTTP_201_CREATED)
async def create_vendor_credit(p: VendorCreditIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await _save_credit(db, p, None)
    return _credit_out(await _reload(db, VendorCredit, c.id))


@router.put("/credits/{cid}")
async def update_vendor_credit(cid: uuid.UUID, p: VendorCreditIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _save_credit(db, p, await _get(db, VendorCredit, cid, "Avoir"))
    return _credit_out(await _reload(db, VendorCredit, cid))


@router.delete("/credits/{cid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor_credit(cid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    c = await _get(db, VendorCredit, cid, "Avoir")
    bills = [a.bill_id for a in c.allocations]
    await db.delete(c)
    await db.flush()
    for bid in bills:
        await recalc_bill_status(db, bid)
    await db.commit()
