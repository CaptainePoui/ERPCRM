"""
Script ponctuel (2026-10-15, TASK-042.8) : fin de la serie de cheques -- ce qui etait mis de cote et se regle avec
certitude (le cheque donne le client ; un seul depot et un seul paiement possibles) :
- HRH #7703 (287,44 $) : depot non classe du 2024-01-15 <- « Paiement anterieur » libre de INV-000840 ;
- Domaine des Cascades (45,88 $, 2021-05-04) : depot non classe du 2021-05-28 <- « Paiement anterieur » libre de 1318 ;
- Societe commerciale Saint-Georges (371,66 $, « Téléphone ») : depot non classe du 2021-01-11, aucune facture -> facture perdue ;
- Jardins Bleu & Or #3968 (327,68 $) : depose le 2024-12-10 (87 j apres) -> cheque attache ;
- MGB #41446 : date lue 31-01-2025 (pas 31-10) -> depot du 2025-02-11, cheque attache.
Usage: venv/bin/python3 apply_cheques_final_20261015.py [--apply]
"""
import asyncio, sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import payment_documents
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice
from app.models.payment import PaymentMethod
from app.api.v1.endpoints.payments import _recalculate_invoice_status

C = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")


async def tx_of(db, d, a):
    return (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(a)))).scalar_one()


async def link_free(db, d, a, inv_number, img, apply):
    tx = await tx_of(db, d, a)
    assert tx.status == "unclassified"
    cp = (await db.execute(select(ClientPayment).join(PaymentAllocation, PaymentAllocation.payment_id == ClientPayment.id)
                           .join(Invoice, Invoice.id == PaymentAllocation.invoice_id).where(Invoice.number == inv_number, ClientPayment.amount == Decimal(a)))).scalar_one()
    cp.received_at = d
    tx.client_payment_id, tx.payment_created, tx.status, tx.matched_at = cp.id, False, "matched", datetime.now(timezone.utc)
    tx.company_id, tx.company_source = cp.company_id, "manual"
    if apply: payment_documents.save(db, cp.id, (C / img).read_bytes(), ".jpg", f"cheque_{d}.jpg")
    print("relie", d, a, "->", inv_number)


async def attach(db, d, a, img, apply):
    tx = await tx_of(db, d, a)
    if apply: payment_documents.save(db, tx.client_payment_id, (C / img).read_bytes(), ".jpg", f"cheque_{d}.jpg")
    print("attache", d, a)


async def main(apply):
    async with AsyncSessionLocal() as db:
        await link_free(db, date(2024, 1, 15), "287.44", "INV-000840", "3a755caa-image_1.jpg", apply)
        await link_free(db, date(2021, 5, 28), "45.88", "1318", "92d0a9ca-image_1.jpg", apply)
        tx = await tx_of(db, date(2021, 1, 11), "371.66")
        assert tx.status == "unclassified"
        comp = (await db.execute(select(Company).where(Company.name == "Société commerciale Saint-Georges inc."))).scalar_one()
        m = (await db.execute(select(PaymentMethod).where(PaymentMethod.code == "cheque"))).scalar_one()
        cp = ClientPayment(company_id=comp.id, status="confirmed", source="bank_import", method_code=m.code, method_name=m.name,
                           amount=Decimal("371.66"), received_at=tx.posted_date, lost_invoice=True,
                           notes="Paiement d'une facture de l'ancien logiciel absente des exports (« Téléphone ») — dépôt du 2021-01-11 : DEPOT MOBILE — prouvé par le chèque de Philippe")
        db.add(cp); await db.flush()
        if apply: payment_documents.save(db, cp.id, (C / "8181d247-image_4.jpg").read_bytes(), ".jpg", "cheque_2020-12-15.jpg")
        tx.client_payment_id, tx.payment_created, tx.status, tx.matched_at = cp.id, True, "matched", datetime.now(timezone.utc)
        tx.company_id, tx.company_source = comp.id, "manual"
        print("facture perdue Saint-Georges 371.66")
        await attach(db, date(2024, 12, 10), "327.68", "d3da9151-image_4.jpg", apply)
        await attach(db, date(2025, 2, 11), "2999.76", "d3da9151-image_1.jpg", apply)
        await (db.commit() if apply else db.rollback()); print("APPLIQUE" if apply else "ESSAI SEULEMENT")

asyncio.run(main("--apply" in sys.argv))
