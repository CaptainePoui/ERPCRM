"""
Script ponctuel (2026-10-07, TASK-044.2) : dans l'historique importe de l'ancien logiciel, la meme charge
figure a la fois en FACTURE FOURNISSEUR et en DEPENSE (meme fournisseur, meme montant, dates a 10 jours
pres) -- Industrielle Alliance 53 fois, Techni-Express 27, Global 1 une fois. Decision de Philippe
(« oui go corrige les doublons ») : la facture fournisseur est le vrai document ; la depense en double est
retiree. Si la depense etait liee a un retrait du releve, le retrait est relie au paiement de la facture
(paiement existant non lie, du meme montant) ; si la facture n'a pas de tel paiement, le retrait la paie
(paiement cree par l'association, annulable dans Banque).
Paires appariees une a une (une facture ne sert qu'une fois), la plus proche en date d'abord. Tout ou rien.

Usage: venv/bin/python3 fix_duplicate_expenses.py [--apply]
"""
import asyncio
import sys
from collections import Counter
from decimal import Decimal

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.bank_account import BankTransaction
from app.models.purchases import Expense, Bill, Vendor, VendorPayment, VendorPaymentAllocation, ReceiptDocument
from app.api.v1.endpoints.purchases import recalc_bill_status


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        names = dict((await db.execute(select(Vendor.id, Vendor.name))).all())
        cands = []
        for e, b in (await db.execute(select(Expense, Bill).join(Bill, (Bill.vendor_id == Expense.vendor_id) & (Bill.total == Expense.total))
                                      .where(Expense.vendor_id.is_not(None)))).all():
            gap = abs((b.bill_date - e.expense_date).days)
            if gap <= 10:
                cands.append((gap, e, b))
        cands.sort(key=lambda x: (x[0], x[1].expense_date))
        used_e, used_b, pairs = set(), set(), []
        for gap, e, b in cands:
            if e.id in used_e or b.id in used_b:
                continue
            used_e.add(e.id); used_b.add(b.id); pairs.append((e, b))
        linked_vp = set((await db.execute(select(BankTransaction.vendor_payment_id).where(BankTransaction.vendor_payment_id.is_not(None)))).scalars().all())
        stats, problems = Counter(), []
        for e, b in pairs:
            if (await db.execute(select(ReceiptDocument.id).where(ReceiptDocument.expense_id == e.id))).first():
                problems.append(f"{names[e.vendor_id]} {e.expense_date} : dépense créée depuis un reçu — laissée")
                continue
            tx = (await db.execute(select(BankTransaction).where(BankTransaction.expense_id == e.id))).scalar_one_or_none()
            if tx:
                vp = None
                for p in (await db.execute(select(VendorPayment).join(VendorPaymentAllocation, VendorPaymentAllocation.payment_id == VendorPayment.id)
                                           .where(VendorPaymentAllocation.bill_id == b.id))).scalars().all():
                    if p.id not in linked_vp and p.amount == -tx.amount:
                        vp = p
                        break
                if vp:
                    tx.expense_id, tx.vendor_payment_id, tx.payment_created = None, vp.id, False
                    linked_vp.add(vp.id)
                    stats["retrait relié au paiement existant de la facture"] += 1
                else:
                    vp = VendorPayment(payment_date=tx.posted_date, vendor_id=b.vendor_id, amount=-tx.amount, method="Banque",
                                       reference=tx.reference, bank_account_id=tx.account_id, source="bank_import",
                                       notes=f"Retrait bancaire du {tx.posted_date} (était une dépense en double de la facture)",
                                       allocations=[VendorPaymentAllocation(bill_id=b.id, amount=min(b.total, -tx.amount))])
                    db.add(vp)
                    await db.flush()
                    tx.expense_id, tx.vendor_payment_id, tx.payment_created = None, vp.id, True
                    await recalc_bill_status(db, b.id)
                    stats["retrait : paiement créé pour la facture"] += 1
            await db.delete(e)
            stats[f"dépense retirée — {names[e.vendor_id]}"] += 1
        await db.flush()
        total = sum((e.total for e, _ in pairs), Decimal("0"))
        print(f"{len(pairs)} paires facture/dépense ({total} $) :")
        for k, v in sorted(stats.items()):
            print(f"  {v:3} × {k}")
        for p in problems:
            print("  NOTE :", p)
        if apply:
            await db.commit(); print("ÉCRIT")
        else:
            await db.rollback(); print("ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
