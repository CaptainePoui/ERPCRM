"""
Script ponctuel (2026-10-15, TASK-042.8) : 7e lot (1 photo, 4 cheques) -- cheques ajoutes aux paiements deja relies (depot le plus proche apres la date du cheque).
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
    (date(2020, 9, 30), "45.88", "a147acb8-image_2.jpg"),     # Domaine des Cascades #6703 (2020-09-03)
    (date(2020, 10, 14), "45.88", "a147acb8-image_1.jpg"),    # Domaine des Cascades #6756 (2020-10-04)
    (date(2020, 10, 14), "241.45", "a147acb8-image_4.jpg"),   # ScopServ #3131 « Facture #0013 & 0014 » -> INV-000013-14
    (date(2020, 10, 20), "873.19", "a147acb8-image_3.jpg"),   # PAD #15829 (2020-10-06)
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
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
