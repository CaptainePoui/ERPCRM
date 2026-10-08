"""Credit d'echange (troc) sur la facture periodique (TASK-005.13).

Regle de Philippe (2026-10-08) : l'echange paie du TEMPS de service d'avance -- « ca ne fait que retarder les
paiements de service ». Un client facture le 12 avec un echange de 3 mois et 8 jours recommence a payer 3 mois
et 8 jours plus tard, le 20, puis chaque 20 : son cycle repart de la date de reprise (meme rythme qu'avant).
- La couverture commence au premier jour pas encore facture (le service deja facture n'est jamais recompte).
- Le credit hors taxes se consomme MOIS PAR MOIS, au prix mensuel du moment ou le mois commence (lignes de la
  facture periodique / mois par cycle) : si les services augmentent, les mois suivants coutent plus cher et la
  reprise arrive plus tot (« nouveau prix »). Les mois deja passes restent au prix de l'epoque.
- Le dernier mois se compte en jours ; le jour entame est laisse au client (arrondi vers le haut).
- A l'epuisement, la facture periodique repart a la date de reprise (start_date) : facture complete, puis meme rythme.
Plusieurs echanges sur la meme facture periodique : le plus vieux d'abord.

2026-10-08, Philippe : « le troc paie d'abord la/les factures ouvertes non payees ; je pourrais faire un troc avec un
client sans facture mensuelle et donc les factures deviennent payees des la creation » -- avant les mois de service,
le credit regle au complet (taxes incluses, comme tout paiement) les factures emises non payees de la compagnie, la
plus vieille d'abord, par un paiement « Troc » (pay_open_invoices) ; appele a l'enregistrement de l'echange et des
qu'une facture est emise (facture envoyee/emise, facture periodique creee). Jamais un brouillon.
"""
import math
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from sqlalchemy import select

from app.core import clock
from app.models.barter import BarterExchange, BarterApplication

CENT = Decimal("0.01")
MONTHS_PER_CYCLE = {"mensuel": 1, "bimestriel": 2, "trimestriel": 3, "biannuel": 6, "annuel": 12}


def _m(v) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def credit_of(b: BarterExchange) -> Decimal:
    """Credit pour le service = la valeur de l'echange. Plus d'ajustements (2026-10-08, Philippe : « les ajustements
    font chier… il n'y en a jamais sauf là parce que je me suis trompé dans sa facturation » -- une erreur de
    facturation se corrige par une facture, ex. INV-112253 pour les textos de D'Astous Auto)."""
    return _m(Decimal(b.received_value))


def used_of(b: BarterExchange) -> Decimal:
    return _m(sum((Decimal(a.amount) for a in b.applications), Decimal("0")))


def remaining_of(b: BarterExchange) -> Decimal:
    return max(credit_of(b) - used_of(b), Decimal("0"))


def cycle_amount(rb) -> Decimal:
    """Montant hors taxes d'un cycle : les lignes de service actuelles (sans les credits de prorata ponctuels)."""
    return _m(sum((Decimal(str(l.qty)) * Decimal(str(l.unit_price)) for l in rb.lines if not l.is_prorata_credit), Decimal("0")))


def monthly_price(rb) -> Decimal | None:
    months = MONTHS_PER_CYCLE.get(rb.frequency)
    return _m(cycle_amount(rb) / months) if months else None


async def credits_for(db, rb) -> list[list]:
    """[[echange, credit restant]] sur cette facture periodique, le plus vieux d'abord."""
    rows = (await db.execute(select(BarterExchange).where(BarterExchange.recurring_billing_id == rb.id)
                             .order_by(BarterExchange.exchange_date, BarterExchange.created_at))).scalars().all()
    return [[b, r] for b in rows if (r := remaining_of(b)) > 0]


OPEN_STATUSES = ("envoyee", "en_retard", "partiellement_payee")


async def pay_open_invoices(db, company_id) -> int:
    """Le credit restant des echanges de la compagnie (plus vieux d'abord) paie ses factures emises non payees, la plus
    vieille d'abord. Un paiement « Troc » par facture. Retourne le nombre de factures touchees. Ne fait pas le commit."""
    from app.models.invoice import Invoice
    from app.models.client_payment import ClientPayment, PaymentAllocation
    from app.api.v1.endpoints.payments import settled_amounts, _recalculate_invoice_status, next_payment_reference
    rows = (await db.execute(select(BarterExchange).where(BarterExchange.company_id == company_id)
                             .order_by(BarterExchange.exchange_date, BarterExchange.created_at))).scalars().all()
    credits = [[b, r] for b in rows if (r := remaining_of(b)) > 0]
    if not credits:
        return 0
    invoices = (await db.execute(select(Invoice).where(
        Invoice.company_id == company_id, Invoice.status.in_(OPEN_STATUSES), Invoice.credit_of_id.is_(None), Invoice.total > 0)
        .order_by(Invoice.issue_date, Invoice.number))).scalars().all()
    paid = await settled_amounts(db, [i.id for i in invoices])
    today, n = clock.today(), 0
    for inv in invoices:
        total_left = sum((c[1] for c in credits), Decimal("0"))
        balance = _m(Decimal(inv.total) - (paid.get(inv.id) or Decimal("0")))
        if total_left <= 0:
            break
        if balance <= 0:
            continue
        take = min(balance, total_left)
        uses = _take(credits, take)
        credits = [c for c in credits if c[1] > 0]
        names = " ; ".join(f"{b.exchange_date.isoformat()} {b.description}" for b, _t in uses)
        cp = ClientPayment(company_id=company_id, status="confirmed", source="barter", method_code="troc", method_name="Troc",
                           amount=_m(take), received_at=today, reference=await next_payment_reference(db),
                           notes=f"Payé par l'échange (troc) : {names}")
        db.add(cp)
        await db.flush()
        db.add(PaymentAllocation(payment_id=cp.id, invoice_id=inv.id, amount_allocated=_m(take)))
        for b, t in uses:
            db.add(BarterApplication(barter_id=b.id, cycle_start=today, cycle_end=today, covered_until=today,
                                     amount=_m(t), invoice_id=inv.id, client_payment_id=cp.id))
        await db.flush()
        await _recalculate_invoice_status(inv.id, db)
        n += 1
    return n


def _take(credits: list[list], amount: Decimal) -> list[tuple]:
    uses, left = [], amount
    for c in credits:
        if left <= 0:
            break
        t = min(c[1], left)
        if t > 0:
            uses.append((c[0], t))
            c[1] -= t
            left -= t
    return uses


def step(credits: list[list], monthly: Decimal, cursor: date) -> dict:
    """Consomme le mois de service qui commence a `cursor` (sans rien ecrire). resume = date de reprise si le
    credit s'epuise dans ce mois (ou pile a sa fin), sinon None."""
    seg_end = cursor + relativedelta(months=1)
    total = sum((c[1] for c in credits), Decimal("0"))
    if total >= monthly:
        uses = _take(credits, monthly)
        left = sum((c[1] for c in credits), Decimal("0"))
        return {"start": cursor, "end": seg_end, "covered_until": seg_end - timedelta(days=1), "uses": uses,
                "amount": monthly, "days": None, "resume": seg_end if left <= 0 else None}
    days_in = (seg_end - cursor).days
    days = min(days_in, math.ceil(total * days_in / monthly))       # le jour entame est laisse au client
    uses = _take(credits, total)
    return {"start": cursor, "end": seg_end, "covered_until": cursor + timedelta(days=days - 1), "uses": uses,
            "amount": total, "days": days, "resume": cursor + timedelta(days=days)}


def _resume(rb, on: date) -> None:
    """Le cycle de la facture periodique repart a la date de reprise."""
    rb.start_date = on
    rb.barter_since = rb.barter_cursor = None


async def advance(db, rb, today: date) -> bool:
    """Consomme les mois de service commences (<= today). Retourne True si quelque chose a ete enregistre.
    Appelee par la generation des factures periodiques (bouton et creation automatique)."""
    from app.api.v1.endpoints.recurring_billing import next_missing_cycle
    credits = await credits_for(db, rb)
    monthly = monthly_price(rb)
    if not monthly or monthly <= 0:
        return False
    if rb.barter_cursor is None:
        if not credits:
            return False
        start, _end = next_missing_cycle(rb)
        if start > today:
            return False
        rb.barter_since = rb.barter_cursor = start
    changed = False
    while rb.barter_cursor is not None and rb.barter_cursor <= today:
        if not credits:
            _resume(rb, rb.barter_cursor)      # credit retire entre-temps : reprise au premier jour non couvert
            return True
        s = step(credits, monthly, rb.barter_cursor)
        for b, take in s["uses"]:
            db.add(BarterApplication(barter_id=b.id, recurring_billing_id=rb.id, cycle_start=s["start"], cycle_end=s["end"],
                                     covered_until=s["covered_until"], amount=_m(take)))
        changed = True
        credits = [c for c in credits if c[1] > 0]
        if s["resume"]:
            _resume(rb, s["resume"])
        else:
            rb.barter_cursor = s["end"]
    return changed


async def projection(db, rb, max_months: int = 240) -> dict | None:
    """Ce qui est prevu pour cette facture periodique : mois couverts (deja comptes + a venir au prix actuel),
    factures habituelles sautees, date de reprise et prochaines factures du nouveau cycle."""
    from app.api.v1.endpoints.recurring_billing import FREQUENCIES, next_missing_cycle
    credits = await credits_for(db, rb)
    monthly = monthly_price(rb)
    if not monthly or monthly <= 0 or (rb.barter_cursor is None and not credits):
        return None
    months = []
    if rb.barter_cursor is not None:
        since, cursor = rb.barter_since, rb.barter_cursor
        rows = (await db.execute(select(BarterApplication).where(
            BarterApplication.recurring_billing_id == rb.id, BarterApplication.cycle_start >= since)
            .order_by(BarterApplication.cycle_start))).scalars().all()
        by_start: dict = {}
        for a in rows:
            m = by_start.setdefault(a.cycle_start, {"start": a.cycle_start, "covered_until": a.covered_until, "amount": Decimal("0"), "done": True})
            m["amount"] += Decimal(a.amount)
        months = list(by_start.values())
    else:
        since = cursor = next_missing_cycle(rb)[0]
    credit_total = sum((m["amount"] for m in months), Decimal("0")) + sum((c[1] for c in credits), Decimal("0"))
    # Echanges de cette couverture (deja comptes depuis since, ou credit restant) : valeur totale et ajustements
    ids = {c[0].id for c in credits}
    if rb.barter_cursor is not None:
        ids |= set((await db.execute(select(BarterApplication.barter_id).where(
            BarterApplication.recurring_billing_id == rb.id, BarterApplication.cycle_start >= since))).scalars().all())
    exchanges = (await db.execute(select(BarterExchange).where(BarterExchange.id.in_(ids)))).scalars().all() if ids else []
    exchange_value = sum((Decimal(b.received_value) for b in exchanges), Decimal("0"))
    # Factures ouvertes payees par ces echanges (avant les mois de service)
    paid_invoices = []
    for b in exchanges:
        for a in b.applications:
            if a.client_payment_id:
                paid_invoices.append({"invoice_id": a.invoice_id, "date": a.cycle_start, "amount": Decimal(a.amount)})
    if paid_invoices:
        from app.models.invoice import Invoice
        numbers = dict((await db.execute(select(Invoice.id, Invoice.number).where(
            Invoice.id.in_([x["invoice_id"] for x in paid_invoices])))).all())
        for x in paid_invoices:
            x["number"] = numbers.get(x["invoice_id"])
    credit_total += sum((x["amount"] for x in paid_invoices), Decimal("0"))
    resume = None
    for _ in range(max_months):
        if not credits:
            resume = cursor
            break
        s = step(credits, monthly, cursor)
        credits = [c for c in credits if c[1] > 0]
        months.append({"start": s["start"], "covered_until": s["covered_until"], "amount": s["amount"], "done": False, "days": s["days"]})
        if s["resume"]:
            resume = s["resume"]
            break
        cursor = s["end"]
    delta = FREQUENCIES[rb.frequency]
    # Suivi du jour (2026-10-08, Philippe : « voir ou on en est de la dette peu importe le jour que je regarde ») :
    # mois termines au complet + le mois en cours au prorata des jours deja passes
    today = clock.today()
    consumed = sum((x["amount"] for x in paid_invoices if x["date"] <= today), Decimal("0"))
    for m in months:
        if m["start"] > today:
            continue
        length = (m["covered_until"] - m["start"]).days + 1
        elapsed = min((today - m["start"]).days + 1, length)
        consumed += Decimal(m["amount"]) * elapsed / length
    consumed = _m(consumed)
    last_day = resume - timedelta(days=1) if resume else None
    total_days = (resume - since).days if resume else None
    gauge = {"today": today, "exchange_value": float(_m(exchange_value)),
             "credit_total": float(_m(credit_total)), "consumed": float(consumed),
             "remaining": float(_m(credit_total - consumed)), "last_day": last_day, "total_days": total_days,
             "day_index": max(0, min((today - since).days + 1, total_days or 0)) if today >= since else 0,
             "state": "a_venir" if today < since else ("termine" if last_day and today > last_day else "en_cours")}
    # Factures habituelles qui ne seront pas faites : dates de l'ancien cycle entre le debut de la couverture et la reprise
    skipped, d, k = [], rb.start_date, 0
    while d < since:
        k += 1
        d = rb.start_date + delta * k
    while resume and d < resume and len(skipped) < 60:
        skipped.append(d)
        k += 1
        d = rb.start_date + delta * k
    return {
        "monthly_price": float(monthly), "since": since, "resume_on": resume,
        "months": [{"start": m["start"], "covered_until": m["covered_until"], "amount": float(_m(m["amount"])),
                    "done": m["done"], "days": m.get("days") or ((m["covered_until"] - m["start"]).days + 1 if m["covered_until"] < m["start"] + relativedelta(months=1) - timedelta(days=1) else None)}
                   for m in months],
        "skipped": skipped,
        "next_invoices": [resume + delta * i for i in range(3)] if resume else [],
        "gauge": gauge,
        "paid_invoices": [{"invoice_id": x["invoice_id"], "number": x["number"], "date": x["date"], "amount": float(_m(x["amount"]))}
                          for x in sorted(paid_invoices, key=lambda x: x["date"])],
    }
