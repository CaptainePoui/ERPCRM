"""
Script ponctuel (2026-10-14, TASK-005.19) : remet les numeros INV- d'ERPCRM en concordance avec l'ancien
logiciel de facturation, qui tourne en parallele (regle TASK-005.12 : la meme facture porte le meme numero).

Cause du decalage (INV-112249 a INV-112256) :
- 3 factures faites dans l'ancien logiciel le 2026-10-02 jamais arrivees dans ERPCRM : Hamak et Cycle Vert
  (periodiques -- l'import des profils du 2 octobre portait deja « derniere facture le 2026-10-02 »),
  MGB (facture manuelle « Ajustement errone »).
- 3 factures faites seulement dans ERPCRM : D'Astous (Texto 500), Physotech (troc 1 069,16 $), Compagnie test (0 $).
Philippe a refait D'Astous et Physotech dans l'ancien logiciel (INV-112260, INV-112261).

Ce que fait le script (tout ou rien) :
- supprime INV-112256 (Compagnie test, 0 $, aucun paiement ni lien) ;
- renumerote les factures non transmises selon l'ancien logiciel (passage par des numeros temporaires) ;
- cree Hamak INV-112249 et Cycle Vert INV-112250 par la facturation periodique normale (cycle du 2026-10-02),
  numero impose, total verifie contre l'ancien logiciel ; SANS le credit du client (celui de Hamak, 263,30 $,
  vient d'un depot deja compte par deux « Paiement anterieur » -- faux credit, voir TASK-042.2 dans
  ERRORS_LESSONS.md) : la facture reste impayee, comme dans l'ancien logiciel ;
- INV-112251 (MGB) laisse libre : en attente de Philippe (credit applique dans l'ancien logiciel, aucun credit
  ouvert dans ERPCRM) ;
- note de l'echange D'Astous : INV-112253 -> INV-112260 ;
- compteur des factures : prochain numero 112262.
Le Journal n'est pas reecrit (trace d'audit).

Usage: venv/bin/python3 renumber_invoices_20261014.py [--apply]
"""
import asyncio
import sys
from datetime import date
from decimal import Decimal

from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice, InvoiceLine
from app.models.company import Company
from app.models.document_counter import DocumentCounter
from app.models.recurring_billing import CompanyRecurringBilling
from app.models.barter import BarterExchange
from app.api.v1.endpoints import recurring_billing as rbmod
from app.core import client_credit

# numero ERPCRM -> (client attendu, total attendu, numero de l'ancien logiciel)
RENUMBER = {
    "INV-112249": ("Construction Nationale", "722.16", "INV-112252"),
    "INV-112250": ("Ls Comptable", "45.88", "INV-112253"),
    "INV-112251": ("Jardin-Ideal", "261.22", "INV-112254"),
    "INV-112252": ("Physotech", "53.93", "INV-112255"),
    "INV-112253": ("D Astous Auto", "137.63", "INV-112260"),
    "INV-112254": ("Physotech", "1069.16", "INV-112261"),
    "INV-112255": ("Waterco", "318.61", "INV-112256"),
}
TEST_INVOICE = ("INV-112256", "Compagnie test", "0.00")
CREATE = [  # (periodique, cycle du, numero, total attendu)
    ("Hamak", date(2026, 9, 2), date(2026, 10, 2), "INV-112249", "191.26"),
    ("Cycle Vert Recycle", date(2026, 9, 2), date(2026, 10, 2), "INV-112250", "82.50"),
]
NEXT_VALUE = 112262


async def _inv(db, number):
    return (await db.execute(select(Invoice).options(selectinload(Invoice.company))
                             .where(Invoice.number == number))).scalar_one_or_none()


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        # 1. Verifications avant tout changement
        for num, (co, tot, _new) in RENUMBER.items():
            inv = await _inv(db, num)
            assert inv, f"{num} introuvable"
            assert inv.company.name == co and f"{inv.total:.2f}" == tot, f"{num} : {inv.company.name} {inv.total} (attendu {co} {tot})"
            assert inv.transmission_status == "non_transmise", f"{num} deja transmise"
        test = await _inv(db, TEST_INVOICE[0])
        assert test and test.company.name == TEST_INVOICE[1] and f"{test.total:.2f}" == TEST_INVOICE[2], "facture test inattendue"
        for n in ("INV-112260", "INV-112261", "INV-112262"):
            assert await _inv(db, n) is None, f"{n} deja pris"

        # 2. Facture test
        await db.execute(delete(InvoiceLine).where(InvoiceLine.invoice_id == test.id))
        await db.delete(test)
        await db.flush()
        print(f"supprimee : {TEST_INVOICE[0]} ({TEST_INVOICE[1]}, 0 $)")

        # 3. Renumerotation (temporaires d'abord : contrainte d'unicite)
        moved = []
        for num in RENUMBER:
            inv = await _inv(db, num)
            inv.number = "TMP-" + num
            moved.append(inv)
        await db.flush()
        for inv in moved:
            old = inv.number[4:]
            inv.number = RENUMBER[old][2]
            print(f"renumerotee : {old} -> {inv.number} ({inv.company.name}, {inv.total} $)")
        await db.flush()

        # 4. Factures periodiques du 2 octobre manquantes
        for name, prev, cycle, number, total in CREATE:
            rb = (await db.execute(select(CompanyRecurringBilling)
                                   .options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.site))
                                   .join(Company, Company.id == CompanyRecurringBilling.company_id)
                                   .where(Company.name == name, CompanyRecurringBilling.is_active.is_(True)))).scalar_one()
            assert rb.last_invoice_date == cycle, f"{name} : derniere facture {rb.last_invoice_date}"
            rb.last_invoice_date = prev
            assert rbmod.next_missing_cycle(rb)[0] == cycle, f"{name} : cycle {rbmod.next_missing_cycle(rb)}"

            async def forced(_db, n=number):
                return n

            async def no_credit(_db, _inv):
                return None
            orig, orig_credit = rbmod._next_number, client_credit.on_issued
            rbmod._next_number, client_credit.on_issued = forced, no_credit
            try:
                inv = await rbmod.create_recurring_invoice(db, rb, issue=True)
            finally:
                rbmod._next_number, client_credit.on_issued = orig, orig_credit
            assert f"{inv.total:.2f}" == total, f"{name} : total {inv.total} (attendu {total})"
            assert rb.last_invoice_date == cycle
            print(f"creee : {inv.number} {name} du {inv.issue_date}, {inv.total} $, statut {inv.status}")

        # 5. Note de l'echange D'Astous
        for bx in (await db.execute(select(BarterExchange).where(BarterExchange.notes.contains("INV-112253")))).scalars():
            bx.notes = bx.notes.replace("INV-112253", "INV-112260")
            print("note de l'echange mise a jour : INV-112253 -> INV-112260")

        # 6. Compteur
        c = (await db.execute(select(DocumentCounter).where(DocumentCounter.key == "invoice"))).scalar_one()
        print(f"compteur : {c.next_value} -> {NEXT_VALUE}")
        c.next_value = NEXT_VALUE
        await db.flush()

        rows = (await db.execute(select(Invoice.number, Company.name, Invoice.issue_date, Invoice.total, Invoice.status)
                                 .join(Company).where(Invoice.number >= "INV-112245").order_by(Invoice.number))).all()
        for r in rows:
            print("  ", *r)
        if apply:
            await db.commit()
            print("APPLIQUE")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
