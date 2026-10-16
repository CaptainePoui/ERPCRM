"""
Script ponctuel (2026-10-16, TASK-005.26) : Philippe -- « pour D'Astous on va tester la pause moi-même, fais juste enlever
ce qu'on avait fait pour l'entente ». Retire l'echange (troc) de D'Astous Auto du 2026-10-07 (860,00 $ HT, « Réparation
automobile ») : son utilisation (paiement « Troc » de 137,63 $ sur INV-112260), l'echange et sa piece. INV-112260 redevient
due (statut recalcule). Sauvegarde avant : /home/simpleip/backups/erpcrm_avant_ententes_20261016.sql (+ storage .tgz).
Usage: venv/bin/python3 remove_dastous_barter_20261016.py [--apply]
"""
import asyncio, sys
from pathlib import Path
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.barter import BarterExchange
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice
from app.api.v1.endpoints.payments import _recalculate_invoice_status


async def main(apply):
    async with AsyncSessionLocal() as db:
        co = (await db.execute(select(Company).where(Company.name == "D Astous Auto"))).scalar_one()
        exs = (await db.execute(select(BarterExchange).where(BarterExchange.company_id == co.id))).scalars().all()
        assert len(exs) == 1, len(exs)
        b = exs[0]
        files = [f.stored_path for f in b.files]
        inv_ids = set()
        for a in b.applications:
            if a.client_payment_id:
                cp = await db.get(ClientPayment, a.client_payment_id)
                assert cp.method_code == "troc" and cp.source == "barter"
                inv_ids |= set((await db.execute(select(PaymentAllocation.invoice_id).where(PaymentAllocation.payment_id == cp.id))).scalars())
                print("paiement troc retire :", cp.amount)
                await db.delete(cp)
        await db.delete(b)
        await db.flush()
        for iid in inv_ids:
            await _recalculate_invoice_status(iid, db)
            inv = await db.get(Invoice, iid)
            print("facture", inv.number, "->", inv.status, inv.total)
        print("echange retire :", b.exchange_date, b.received_value, b.description, "| pieces :", len(files))
        if apply:
            await db.commit()
            for p in files:
                Path(p).unlink(missing_ok=True)
            print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT")

asyncio.run(main("--apply" in sys.argv))
