"""
Script ponctuel (2026-10-14, TASK-042.2 -- voir ERRORS_LESSONS.md) : retire les 40 faux credits clients crees le
2026-10-08 a 13:06 UTC par l'association automatique (GO de Philippe : « oui corrige ca en premier »).

- 13 encaissements en double (crees a quelques millisecondes d'un autre, aucune ligne bancaire, aucune
  repartition) : supprimes.
- 27 depots associes par erreur (encaissement cree par l'association, depot dont les factures etaient deja payees
  par un « Paiement anterieur ») : association annulee comme le bouton « Annuler » de la Banque (encaissement
  supprime, depot remis « non classe », statut des factures recalcule). Le depot garde sa compagnie : il attend
  d'etre relie a son paiement (Philippe fournit l'historique complet des factures).
Tout ou rien. Le Journal n'est pas reecrit.

Usage: venv/bin/python3 fix_phantom_credits_20261014.py [--apply]
"""
import asyncio
import sys
from datetime import datetime, timezone

from sqlalchemy import select, func

from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice
from app.api.v1.endpoints.payments import _recalculate_invoice_status

START = datetime(2026, 10, 8, 13, 6, 40, tzinfo=timezone.utc)
END = datetime(2026, 10, 8, 13, 6, 50, tzinfo=timezone.utc)


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        pays = (await db.execute(select(ClientPayment).where(
            ClientPayment.source == "bank_import", ClientPayment.created_at.between(START, END))
            .order_by(ClientPayment.received_at))).scalars().all()
        assert len(pays) == 40, f"{len(pays)} encaissements (attendu 40)"
        names = dict((await db.execute(select(Company.id, Company.name))).all())
        deleted, unmatched, invoices = 0, 0, set()
        total = 0
        for cp in pays:
            txs = (await db.execute(select(BankTransaction).where(BankTransaction.client_payment_id == cp.id))).scalars().all()
            allocs = (await db.execute(select(PaymentAllocation).where(PaymentAllocation.payment_id == cp.id))).scalars().all()
            alloc_sum = sum((a.amount_allocated for a in allocs), 0)
            total += cp.amount - alloc_sum
            label = f"{names[cp.company_id]:<34} {cp.received_at} {cp.amount:>9}"
            if not txs:
                assert not allocs, f"{label} : doublon avec repartition"
                await db.delete(cp)
                deleted += 1
                print(f"doublon supprime   : {label}")
                continue
            assert len(txs) == 1 and txs[0].payment_created and txs[0].status == "matched", f"{label} : lien inattendu"
            tx = txs[0]
            for a in allocs:
                invoices.add(a.invoice_id)
            tx.client_payment_id, tx.status, tx.matched_at = None, "unclassified", None
            tx.payment_created, tx.auto_matched = False, False
            await db.flush()
            await db.delete(cp)
            unmatched += 1
            extra = f" (repartition retiree : {alloc_sum} $)" if allocs else ""
            print(f"association annulee: {label}{extra}")
        await db.flush()
        for iid in invoices:
            await _recalculate_invoice_status(iid, db)
            inv = await db.get(Invoice, iid)
            print(f"facture recalculee : {inv.number} -> {inv.status}")
        await db.flush()
        left = (await db.execute(select(func.count()).select_from(ClientPayment).where(
            ClientPayment.status == "confirmed",
            ClientPayment.amount > select(func.coalesce(func.sum(PaymentAllocation.amount_allocated), 0))
            .where(PaymentAllocation.payment_id == ClientPayment.id).scalar_subquery()))).scalar_one()
        print(f"\n{deleted} doublons supprimes, {unmatched} associations annulees, faux credit retire : {total} $")
        print(f"encaissements confirmes avec une part non repartie restants : {left}")
        if apply:
            await db.commit()
            print("APPLIQUE")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
