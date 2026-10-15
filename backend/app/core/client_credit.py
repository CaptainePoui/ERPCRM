"""Credit au dossier du client = argent recu en trop (TASK-042.2, 2026-10-08).

Philippe : « si il y a un surplus qu'il aille en premier a des restes de facture impayes les plus anciens, si il
n'en a pas il le met en credit dans le dossier client » ; « un depot d'un client sans aucune facture ouverte, il va
en credit tout seul ». Le credit n'est pas un avoir (aucun effet sur les ventes ni les taxes) : c'est la partie d'un
encaissement confirme qui n'est repartie sur aucune facture. Il paie tout seul la prochaine facture emise du client
(meme encaissement, nouvelle repartition). Les paiements « Troc » n'en font jamais (toujours repartis au complet), ni
les paiements d'une facture perdue de l'ancien logiciel (TASK-005.24 : ils paient une facture qui n'est pas dans ERPCRM).
"""
from decimal import Decimal

from sqlalchemy import select, func

CENT = Decimal("0.01")


async def credits(db, company_id) -> list[tuple]:
    """[(encaissement, montant non reparti)] du client, le plus vieux d'abord."""
    from app.models.client_payment import ClientPayment, PaymentAllocation
    alloc = (select(PaymentAllocation.payment_id, func.sum(PaymentAllocation.amount_allocated).label("s"))
             .group_by(PaymentAllocation.payment_id).subquery())
    rows = (await db.execute(
        select(ClientPayment, func.coalesce(alloc.c.s, 0)).outerjoin(alloc, alloc.c.payment_id == ClientPayment.id)
        .where(ClientPayment.company_id == company_id, ClientPayment.status == "confirmed",
               ClientPayment.method_code != "troc", ClientPayment.lost_invoice.is_(False),
               ClientPayment.amount - func.coalesce(alloc.c.s, 0) > 0)
        .order_by(ClientPayment.received_at, ClientPayment.created_at))).all()
    return [(cp, (Decimal(cp.amount) - Decimal(s)).quantize(CENT)) for cp, s in rows]


async def balance(db, company_id) -> Decimal:
    return sum((left for _cp, left in await credits(db, company_id)), Decimal("0"))


async def pay_invoice(db, inv) -> Decimal:
    """Le credit du client paie la facture qui vient d'etre emise (son solde restant). Retourne le montant applique.
    Ne fait pas le commit."""
    from app.models.client_payment import PaymentAllocation
    from app.api.v1.endpoints.payments import settled_amounts, _recalculate_invoice_status
    if inv.status in ("brouillon", "annulee") or inv.credit_of_id is not None or Decimal(inv.total) <= 0:
        return Decimal("0")
    owed = Decimal(inv.total) - ((await settled_amounts(db, [inv.id])).get(inv.id) or Decimal("0"))
    used = Decimal("0")
    for cp, left in await credits(db, inv.company_id):
        if owed <= 0:
            break
        take = min(left, owed)
        db.add(PaymentAllocation(payment_id=cp.id, invoice_id=inv.id, amount_allocated=take))
        owed -= take
        used += take
    if used:
        await db.flush()
        await _recalculate_invoice_status(inv.id, db)
    return used


async def on_issued(db, inv) -> None:
    """Facture qui vient d'etre emise : l'echange (troc) du client paie d'abord ses factures ouvertes, puis son credit
    paie ce qui reste de celle-ci. Ne fait pas le commit."""
    from app.core.barter import pay_open_invoices
    await pay_open_invoices(db, inv.company_id)     # TASK-005.13
    await pay_invoice(db, inv)
