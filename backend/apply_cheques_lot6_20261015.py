"""
Script ponctuel (2026-10-15, TASK-042.8) : 6e lot (4 photos, 16 cheques, surtout apres juin 2020).
- Cheques ajoutes aux paiements deja relies a leur depot (« Paiement anterieur » de l'historique, factures connues).
- Correction de ma deduction du 5e passage : le cheque J. Carrier #112874 (114,98 $, 2020-05-20) ne peut aller que
  sur le depot de 114,98 $ du 2020-05-27 (seul apres sa date) -> ce paiement passe de la Clinique a J. Carrier ; le
  cheque de la Clinique (#822, 2020-02-29) en est retire et remis en attente avec Pro-Sin #8056 (un seul depot de
  114,98 $ possible pour les deux : 2020-04-17).
- En attente : K-DO #10451 (57,49 $, 2020-05-20 -- depots possibles deja relies a Houle) ; Dany Gauthier Arseneault
  #050 (250 $ a Philippe, « remboursement », 2020-06-07) : absent du compte BNC d'entreprise.
Tout ou rien. Usage: venv/bin/python3 apply_cheques_lot6_20261015.py [--apply]
"""
import asyncio
import shutil
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import payment_documents
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment, PaymentDocument
from app.models.company import Company

CROPS = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")
PENDING = Path(__file__).resolve().parent / "storage" / "payment_documents_pending"
ATTACH = [
    (date(2020, 6, 3), "45.88", "3d1812ba-image_2.jpg"),       # Domaine des Cascades #6496 -> 1362
    (date(2020, 7, 7), "4284.31", "3d1812ba-image_1.jpg"),     # Strong #15005 -> 1349, 1370
    (date(2020, 6, 29), "873.19", "3d1812ba-image_3.jpg"),     # PAD #15551 -> 1372
    (date(2020, 6, 29), "422.54", "7f281df8-image_2.jpg"),     # HRH #3414 -> 1360
    (date(2020, 6, 29), "321.71", "7f281df8-image_1.jpg"),     # Domaine des Cascades #6542 -> 1289, 1317, 1336
    (date(2020, 6, 29), "833.04", "7f281df8-image_3.jpg"),     # PAD #15486 -> 1341
    (date(2020, 8, 17), "12910.62", "e4a438fb-image_1.jpg"),   # Immo 1ere / Residence L'Ermitage #1954 -> 1375
    (date(2020, 8, 17), "120.72", "e4a438fb-image_4.jpg"),     # HRH #3568 -> 1365
    (date(2020, 8, 25), "91.76", "e4a438fb-image_3.jpg"),      # Domaine des Cascades #6644 -> 1384, 1400
    (date(2020, 9, 30), "145.56", "e36f484c-image_2.jpg"),     # Domaine des Cascades #6746 -> 1402, 1409, 1410
    (date(2020, 8, 25), "174.20", "e36f484c-image_1.jpg"),     # ACVRQ #4068 -> 1423
    (date(2020, 8, 28), "873.19", "e36f484c-image_4.jpg"),     # PAD #15755 (date du cheque = date du depot) -> 1417
    (date(2020, 9, 30), "1132.16", "e36f484c-image_3.jpg"),    # Groupe Lavoie #1396 -> 1386
]


async def deposit(db, d, amt):
    txs = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(amt)))).scalars().all()
    assert len(txs) == 1, (d, amt, len(txs))
    return txs[0]


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        for d, amt, f in ATTACH:
            tx = await deposit(db, d, amt)
            assert tx.client_payment_id, (d, amt)
            cp = await db.get(ClientPayment, tx.client_payment_id)
            if apply:
                payment_documents.save(db, cp.id, (CROPS / f).read_bytes(), ".jpg", f"cheque_{d}.jpg")
            print(f"cheque ajoute : {d} {amt:>9} {(await db.get(Company, cp.company_id)).name}")
        # correction du 2020-05-27
        tx = await deposit(db, date(2020, 5, 27), "114.98")
        cp = await db.get(ClientPayment, tx.client_payment_id)
        jc = (await db.execute(select(Company).where(Company.name == "J. Carrier Fournitures industrielles inc."))).scalar_one()
        old = (await db.get(Company, cp.company_id)).name
        assert cp.lost_invoice and old.startswith("Clinique"), old
        docs = (await db.execute(select(PaymentDocument).where(PaymentDocument.payment_id == cp.id))).scalars().all()
        cp.company_id, cp.lost_invoice_number = jc.id, None
        cp.notes = cp.notes.split(" — jumelage déduit")[0] + " — chèque J. Carrier #112874 du 2020-05-20 (seul dépôt de 114,98 $ possible après sa date)"
        tx.company_id = jc.id
        if apply:
            for doc in docs:          # cheque de la Clinique retire : remis en attente
                shutil.move(str(payment_documents.path_of(doc)), PENDING / "cheque_822_Clinique_Sorel-Tracy_114.98_2020-02-29_fact1259.jpg")
                await db.delete(doc)
            payment_documents.save(db, cp.id, (CROPS / "3d1812ba-image_4.jpg").read_bytes(), ".jpg", "cheque_JCarrier_2020-05-20.jpg")
            shutil.copy(CROPS / "7f281df8-image_4.jpg", PENDING / "cheque_050_Dany_Gauthier_Arseneault_250_2020-06-07_personnel.jpg")
            shutil.copy(CROPS / "e4a438fb-image_2.jpg", PENDING / "cheque_10451_KDO_57.49_2020-05-20.jpg")
        print(f"corrige : 2020-05-27 114.98 {old} -> J. Carrier ({len(docs)} piece retiree, remise en attente)")
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
