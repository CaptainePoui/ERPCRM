"""Commissions des vendeurs (TASK-007.2, 2026-10-22 ; Philippe : « cet automatisme de 10 % de commission de ces
factures quand on me les paye… qu'il s'actualise automatiquement quand j'ajoute un client avec leur nom comme
vendeur… si j'en manque, je puisse le voir et ajuster, un peu comme un client qui doit me payer mais à l'envers »).

sync() est relancable sans risque (poller des periodiques toutes les 30 min, et chaque ouverture de l'onglet) :
- chaque part de paiement (payment_allocations) sur une facture emise depuis la date de debut du vendeur (les
  factures d'avant sont deja couvertes par ses anciens paiements), d'un client dont il est le « Vendeur référent » (periodique seulement si c'est sa regle), donne une commission :
  taux x part payee (x sous-total / total si « avant taxes ») ; un avoir ou un troc n'est pas un paiement ;
- un paiement retire : commission enlevee si sa facture de commission n'est pas encore payee, sinon ajustement negatif ;
- les commissions d'un mois forment la facture fournisseur « COM-AAAA-MM » du vendeur (compte « Commissions et
  frais », sans taxes) ; une fois payee, ce qui arrive ensuite pour ce mois va dans « COM-AAAA-MM-2 », etc.
"""
import calendar
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select, func, text

from app.core import clock
from app.models.sales_rep import SalesRep, CommissionEntry
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.invoice import Invoice
from app.models.company import Company
from app.models.purchases import Bill, ExpenseCategory

CATEGORY = "Commissions et frais"
ZERO = Decimal("0")
CENT = Decimal("0.01")


def _money(v) -> Decimal:
    return Decimal(v).quantize(CENT, rounding=ROUND_HALF_UP)


def compute(rep: SalesRep, inv: Invoice, paid: Decimal) -> tuple[Decimal, Decimal]:
    """(base, commission) d'une part payee."""
    base = Decimal(paid)
    if rep.before_taxes and inv.total:
        base = _money(base * Decimal(inv.subtotal) / Decimal(inv.total))
    return _money(base), _money(base * Decimal(rep.rate) / 100)


async def _paid_on_bills(db, bill_ids) -> dict:
    from app.api.v1.endpoints.purchases import _bill_balances
    return await _bill_balances(db, list(bill_ids)) if bill_ids else {}


async def _rep_allocations(db, rep: SalesRep) -> list:
    received = func.coalesce(ClientPayment.received_at, func.date(ClientPayment.created_at))
    q = (select(PaymentAllocation, Invoice, ClientPayment, received)
         .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
         .join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
         .join(Company, Company.id == Invoice.company_id)
         .where(Company.vendor_id == rep.contact_id, ClientPayment.status == "confirmed",
                Invoice.credit_of_id.is_(None), Invoice.issue_date >= rep.start_date))
    if rep.recurring_only:
        q = q.where(Invoice.recurring_billing_id.is_not(None))
    return (await db.execute(q)).all()


async def sync_rep(db, rep: SalesRep) -> set:
    """Met les commissions du vendeur a jour ; retourne les factures de commission a refaire."""
    dirty: set = set()
    entries = (await db.execute(select(CommissionEntry).where(CommissionEntry.sales_rep_id == rep.id))).scalars().all()
    paid = await _paid_on_bills(db, {e.bill_id for e in entries if e.bill_id})
    locked = lambda e: bool(e.bill_id) and paid.get(e.bill_id, ZERO) > 0   # noqa: E731 -- deja paye (en partie)
    by_alloc = {e.allocation_id: e for e in entries if e.allocation_id}
    orphans = defaultdict(list)          # paiement retire (ou fusionne : la part revient sous un autre paiement)
    for e in entries:
        if e.kind == "commission" and e.allocation_id is None:
            orphans[(e.invoice_id, Decimal(e.paid_amount))].append(e)

    current = await _rep_allocations(db, rep)
    seen = {alloc.id for alloc, *_ in current}
    for e in entries:   # plus visee par les regles (client sans ce vendeur, date de debut, periodiques) : enlevee si non payee
        if e.kind == "commission" and e.allocation_id and e.allocation_id not in seen and not locked(e):
            dirty.add(e.bill_id)
            by_alloc.pop(e.allocation_id, None)
            await db.delete(e)
    for alloc, inv, pay, received in current:
        e = by_alloc.get(alloc.id)
        if e is None:
            twins = orphans.get((inv.id, Decimal(alloc.amount_allocated)))
            if twins:
                e = twins.pop()
                e.allocation_id = alloc.id
                continue
            base, amount = compute(rep, inv, alloc.amount_allocated)
            db.add(CommissionEntry(sales_rep_id=rep.id, kind="commission", allocation_id=alloc.id, invoice_id=inv.id,
                                   company_id=inv.company_id, entry_date=received, paid_amount=alloc.amount_allocated,
                                   base=base, rate=rep.rate, amount=amount))
            continue
        if Decimal(e.paid_amount) != Decimal(alloc.amount_allocated):     # part changee apres coup
            base, amount = compute(rep, inv, alloc.amount_allocated)
            if locked(e):
                db.add(CommissionEntry(sales_rep_id=rep.id, kind="ajustement", invoice_id=inv.id, company_id=inv.company_id,
                                       entry_date=received, amount=amount - Decimal(e.amount),
                                       note=f"Paiement de {inv.number} modifié ({e.paid_amount} $ → {alloc.amount_allocated} $)"))
                e.paid_amount = alloc.amount_allocated       # la commission deja payee reste telle quelle
            else:
                dirty.add(e.bill_id)
                e.paid_amount, e.base, e.amount = alloc.amount_allocated, base, amount

    for group in orphans.values():
        for e in group:
            if locked(e):
                e.kind = "annulee"
                db.add(CommissionEntry(sales_rep_id=rep.id, kind="ajustement", invoice_id=e.invoice_id, company_id=e.company_id,
                                       entry_date=clock.today(), amount=-Decimal(e.amount),
                                       note="Paiement du client retiré après le paiement de la commission"))
            else:
                dirty.add(e.bill_id)
                await db.delete(e)
    await db.flush()
    return dirty | await place(db, rep)


async def place(db, rep: SalesRep) -> set:
    """Range les commissions sans facture dans la facture du mois (pas encore payee) du vendeur."""
    loose = (await db.execute(select(CommissionEntry).where(CommissionEntry.sales_rep_id == rep.id,
                                                             CommissionEntry.bill_id.is_(None),
                                                             CommissionEntry.kind != "annulee"))).scalars().all()
    dirty: set = set()
    for e in loose:
        bill = await _open_bill(db, rep, e.entry_date)
        e.bill_id = bill.id
        dirty.add(bill.id)
    await db.flush()
    return dirty


async def _open_bill(db, rep: SalesRep, day: date) -> Bill:
    month = f"COM-{day:%Y-%m}"
    bills = (await db.execute(select(Bill).where(Bill.vendor_id == rep.vendor_id, Bill.source == "commission",
                                                 Bill.bill_number.like(f"{month}%")))).scalars().all()
    paid = await _paid_on_bills(db, {b.id for b in bills})
    for b in sorted(bills, key=lambda b: b.bill_number):
        if paid.get(b.id, ZERO) <= 0 and b.status != "annulee":
            return b
    number = month if not bills else f"{month}-{len(bills) + 1}"
    last = date(day.year, day.month, calendar.monthrange(day.year, day.month)[1])
    b = Bill(vendor_id=rep.vendor_id, bill_number=number, bill_date=last, due_date=last, status="ouverte",
             tax_mode="exclusive", source="commission", notes=f"Commissions de {_name(rep)} — calculées par ERPCRM", lines=[])
    db.add(b)
    await db.flush()
    return b


def _name(rep: SalesRep) -> str:
    return f"{rep.contact.first_name} {rep.contact.last_name}".strip()


async def rebuild(db, bill_id) -> None:
    """Refait les lignes d'une facture de commission depuis ses commissions ; la supprime si elle est vide."""
    from app.api.v1.endpoints.purchases import BillIn, BillLineIn, _apply_bill, recalc_bill_status
    from sqlalchemy.orm import selectinload
    b = (await db.execute(select(Bill).options(selectinload(Bill.lines)).where(Bill.id == bill_id))).scalar_one_or_none()
    if not b or b.source != "commission":
        return
    if (await _paid_on_bills(db, {b.id})).get(b.id, ZERO) > 0:
        return
    rows = (await db.execute(select(CommissionEntry, Invoice.number, Company.name)
                             .outerjoin(Invoice, Invoice.id == CommissionEntry.invoice_id)
                             .outerjoin(Company, Company.id == CommissionEntry.company_id)
                             .where(CommissionEntry.bill_id == b.id, CommissionEntry.kind != "annulee")
                             .order_by(CommissionEntry.entry_date, Company.name, Invoice.number))).all()
    if not rows:
        await db.delete(b)
        await db.flush()
        return
    cat = (await db.execute(select(ExpenseCategory.id).where(ExpenseCategory.name == CATEGORY))).scalar_one_or_none()
    lines = []
    for e, number, client in rows:
        if e.kind == "ajustement":
            text = f"Ajustement — {e.note or ''}".strip(" —")
        else:
            text = f"Commission — {client} — {number} : {float(e.rate):g} % de {e.base} $ (payé le {e.entry_date:%Y-%m-%d})"
        lines.append(BillLineIn(description=text[:500], category_id=cat, qty=1, rate=float(e.amount), tax_code="aucune"))
    _apply_bill(b, BillIn(vendor_id=b.vendor_id, bill_number=b.bill_number, bill_date=b.bill_date, due_date=b.due_date,
                          tax_mode="exclusive", notes=b.notes, lines=lines))
    await db.flush()
    await recalc_bill_status(db, b.id)


async def sync(db, rep_id=None) -> None:
    # Un seul calcul a la fois (le poller et l'ouverture de l'onglet peuvent tomber en meme temps)
    await db.execute(text("select pg_advisory_xact_lock(70072)"))
    q = select(SalesRep).where(SalesRep.is_active.is_(True))
    if rep_id:
        q = select(SalesRep).where(SalesRep.id == rep_id)
    for rep in (await db.execute(q)).scalars().all():
        for bid in await sync_rep(db, rep):
            if bid:
                await rebuild(db, bid)
    await db.flush()
