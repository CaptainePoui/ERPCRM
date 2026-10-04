"""
Script ponctuel (2026-10-04, TASK-005.12) : les 2 factures periodiques creees automatiquement le
2026-10-04 sous l'ancien format (2026-0002, 2026-0003, non transmises) prennent la suite INV-
(decision de Philippe : ERPCRM et l'ancien logiciel tournent en parallele et la meme facture doit
porter le meme numero). Ordre : date de facture. Les anciens numeros ne sont jamais redonnes.

Usage: venv/bin/python3 renumber_recurring_2026.py [--apply]
"""
import asyncio
import sys
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice
from app.core.numbering import next_document_number

OLD = ["2026-0002", "2026-0003"]


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        invs = (await db.execute(select(Invoice).where(Invoice.number.in_(OLD)).order_by(Invoice.issue_date, Invoice.number))).scalars().all()
        for inv in invs:
            if inv.transmission_status != "non_transmise":
                raise SystemExit(f"{inv.number} a été transmise : on ne renumérote pas une facture déjà vue par le client")
            new = await next_document_number(db, "invoice")
            print(f"{inv.number} ({inv.issue_date}, {inv.total} $) -> {new}")
            inv.number = new
        if apply:
            await db.commit()
            print("ÉCRIT")
        else:
            await db.rollback()
            print("ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
