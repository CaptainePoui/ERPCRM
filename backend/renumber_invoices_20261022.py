"""
Script ponctuel (2026-10-22, TASK-005.27) : remet les numeros INV- du 2026-10-22 dans l'ordre de l'ancien
logiciel de facturation (regle TASK-005.12 : la meme facture porte le meme numero). ERPCRM avait departage les
periodiques du meme jour par nom de client ; l'ancien logiciel garde l'ordre de creation de ses periodiques
(Mc Crystal, Oxygene, Maison Le Passeur, MRST, Kiko -- le meme chaque mois depuis 2025-09).
Tout ou rien ; factures non transmises seulement ; les paiements suivent la facture (lien par facture, pas par
numero). Le Journal n'est pas reecrit (trace d'audit).

Usage: venv/bin/python3 renumber_invoices_20261022.py [--apply]
"""
import asyncio
import sys

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice
from app.models.company import Company

# numero ERPCRM -> (client attendu, total attendu, numero de l'ancien logiciel)
RENUMBER = {
    "INV-112267": ("KIKO", "193.67", "INV-112271"),
    "INV-112268": ("MRST", "211.09", "INV-112270"),
    "INV-112270": ("Mc Crystal", "278.59", "INV-112267"),
    "INV-112271": ("Oxygene", "26.33", "INV-112268"),
}


async def _inv(db, number):
    return (await db.execute(select(Invoice).options(selectinload(Invoice.company))
                             .where(Invoice.number == number))).scalar_one_or_none()


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        moved = []
        for num, (co, tot, _new) in RENUMBER.items():
            inv = await _inv(db, num)
            assert inv, f"{num} introuvable"
            assert inv.company.name == co and f"{inv.total:.2f}" == tot, f"{num} : {inv.company.name} {inv.total} (attendu {co} {tot})"
            assert inv.transmission_status == "non_transmise", f"{num} deja transmise"
            inv.number = "TMP-" + num
            moved.append(inv)
        await db.flush()
        for inv in moved:
            old = inv.number[4:]
            inv.number = RENUMBER[old][2]
            print(f"renumerotee : {old} -> {inv.number} ({inv.company.name}, {inv.total} $)")
        await db.flush()
        rows = (await db.execute(select(Invoice.number, Company.name, Invoice.issue_date, Invoice.total, Invoice.status)
                                 .join(Company).where(Invoice.number >= "INV-112264", Invoice.number.like("INV-%"))
                                 .order_by(Invoice.number))).all()
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
