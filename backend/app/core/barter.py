"""Credit d'echange (troc) applique a la facture periodique (TASK-005.13).

Regle de Philippe : le montant hors taxes de l'echange repousse la facture. Le credit s'applique a partir du
premier cycle pas encore facture (le service deja facture et paye n'est jamais recompte) :
- credit >= montant du cycle : cycle couvert au complet, aucune facture (ni taxes) ;
- credit < montant du cycle : la facture est repoussee a la date ou le credit s'epuise (au prorata des jours
  du cycle) ; elle garde les lignes habituelles et une ligne negative « Echange (troc) » du credit utilise,
  les taxes ne portent que sur le reste a payer.
Plusieurs echanges sur la meme facture periodique : le plus vieux d'abord.
"""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select

from app.models.barter import BarterExchange, BarterApplication

CENT = Decimal("0.01")


def _m(v) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def credit_of(b: BarterExchange) -> Decimal:
    return _m(Decimal(b.received_value) - sum((Decimal(d.qty) * Decimal(d.unit_price) for d in b.deductions), Decimal("0")))


def used_of(b: BarterExchange) -> Decimal:
    return _m(sum((Decimal(a.amount) for a in b.applications), Decimal("0")))


def remaining_of(b: BarterExchange) -> Decimal:
    return max(credit_of(b) - used_of(b), Decimal("0"))


def cycle_amount(rb) -> Decimal:
    """Montant hors taxes d'un cycle : les lignes actuelles de la facture periodique."""
    return _m(sum((Decimal(str(l.qty)) * Decimal(str(l.unit_price)) for l in rb.lines), Decimal("0")))


async def credits_for(db, rb) -> list[list]:
    """[[echange, credit restant]] sur cette facture periodique, le plus vieux d'abord."""
    rows = (await db.execute(select(BarterExchange).where(BarterExchange.recurring_billing_id == rb.id)
                             .order_by(BarterExchange.exchange_date, BarterExchange.created_at))).scalars().all()
    return [[b, r] for b in rows if (r := remaining_of(b)) > 0]


def plan_cycle(credits: list[list], amount: Decimal, cycle_start: date, cycle_end: date) -> dict | None:
    """Ce que le credit couvre sur ce cycle (sans rien ecrire). None si aucun credit."""
    if amount <= 0 or not credits:
        return None
    left, uses = amount, []
    for c in credits:
        if left <= 0:
            break
        take = min(c[1], left)
        if take > 0:
            uses.append((c[0], take))
            left -= take
    total = amount - left
    if total <= 0:
        return None
    days = (cycle_end - cycle_start).days
    if left <= 0:
        return {"full": True, "uses": uses, "used": total, "billed_from": None, "covered_until": cycle_end - timedelta(days=1), "to_bill": Decimal("0")}
    covered = int(total / amount * days)              # jours entiers couverts (arrondi vers le bas)
    billed_from = cycle_start + timedelta(days=covered)
    return {"full": False, "uses": uses, "used": total, "billed_from": billed_from,
            "covered_until": max(cycle_start, billed_from - timedelta(days=1)), "to_bill": _m(left)}


def consume(credits: list[list], plan: dict) -> None:
    for c in credits:
        for b, take in plan["uses"]:
            if c[0] is b:
                c[1] -= take


def record(db, rb, plan: dict, cycle_start: date, cycle_end: date, invoice_id=None) -> None:
    for b, take in plan["uses"]:
        db.add(BarterApplication(barter_id=b.id, recurring_billing_id=rb.id, cycle_start=cycle_start, cycle_end=cycle_end,
                                 covered_until=plan["covered_until"], amount=_m(take), invoice_id=invoice_id))


async def projection(db, rb, max_cycles: int = 40) -> list[dict]:
    """Cycles a venir touches par le credit restant : couverts au complet, puis la facture repoussee."""
    from app.api.v1.endpoints.recurring_billing import _cycle_bounds, next_missing_cycle
    credits = await credits_for(db, rb)
    amount = cycle_amount(rb)
    if not credits or amount <= 0:
        return []
    start, end = next_missing_cycle(rb)
    if not rb.first_invoice_generated:          # la premiere facture (facturee d'avance) n'est jamais couverte
        start, end = _cycle_bounds(rb.start_date, rb.frequency, end)
    out = []
    for _ in range(max_cycles):
        if rb.end_date and start > rb.end_date:
            break
        plan = plan_cycle(credits, amount, start, end)
        if not plan:
            break
        consume(credits, plan)
        out.append({"cycle_start": start, "cycle_end": end, "covered_until": plan["covered_until"], "used": float(plan["used"]),
                    "full": plan["full"], "billed_from": plan["billed_from"], "to_bill": float(plan["to_bill"])})
        if not plan["full"]:
            break
        start, end = _cycle_bounds(rb.start_date, rb.frequency, end)
    if out:
        # Retour au rythme habituel : la facture du cycle suivant, a sa date normale
        nxt, nxt_end = _cycle_bounds(rb.start_date, rb.frequency, out[-1]["cycle_end"])
        if not (rb.end_date and nxt > rb.end_date):
            out.append({"cycle_start": nxt, "cycle_end": nxt_end, "normal": True, "to_bill": float(amount)})
    return out
