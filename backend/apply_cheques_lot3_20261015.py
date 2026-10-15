"""
Script ponctuel (2026-10-15, TASK-042.8) : 3e lot (1 photo, 4 cheques).
- Nouveaux paiements « Facture perdue (ancien logiciel) » prouves par un cheque (meme regle que apply_cheques_20261015.py).
- Pieces ajoutees aux paiements deja crees (talon Pro-Sin = factures 1202 et 1206, talon Strong = facture 1216,
  cheques J. Carrier #112104/#112213, cheque PAD #14807) et numero de facture complete.
- Ignore : talon J. Carrier #111654 (facture 1193, 64,98 $, 2019-09-24) -- depose avant le compte BNC d'entreprise.
Tout ou rien. Usage: venv/bin/python3 apply_cheques_lot2_20261015.py [--apply]
"""
import asyncio
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

import cv2
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import payment_documents
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment
from app.models.company import Company
from app.models.payment import PaymentMethod

CROPS = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")
FLIP = set()
NOTE = "Paiement d'une facture de l'ancien logiciel dont le document n'a pas été conservé"
NEW = [  # (date du depot, montant, compagnie, n° de facture, pieces)
    (date(2019, 12, 17), "58.14", "Houle Avocat", "1253", ["0fb6a5e9-image_2.jpg"]),
    (date(2019, 12, 24), "57.49", "HRH SERVICES PRÉHOSPITALIERS INC.", None, ["0fb6a5e9-image_1.jpg"]),
    (date(2020, 2, 14), "459.90", "J. Carrier Fournitures industrielles inc.", None, ["0fb6a5e9-image_4.jpg"]),
]
ADD = []
# En attente : cheque #8178 de l'Agence de recouvrement Oligny et Thibodeau (112,02 $, depose le 2019-12-24) --
# client et facture inconnus, a traiter avec le recouvrement (TASK-005.25)


def data_of(name: str) -> bytes:
    p = CROPS / name
    assert p.is_file(), p
    if name in FLIP:
        ok, buf = cv2.imencode(".jpg", cv2.rotate(cv2.imread(str(p)), cv2.ROTATE_180), [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buf.tobytes()
    return p.read_bytes()


async def deposit(db, d, amt):
    txs = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(amt)))).scalars().all()
    assert len(txs) == 1, (d, amt, len(txs))
    return txs[0]


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        comps = {c.name: c for c in (await db.execute(select(Company))).scalars()}
        methods = {m.code: m for m in (await db.execute(select(PaymentMethod))).scalars()}
        for d, amt, cname, num, files in NEW:
            tx = await deposit(db, d, amt)
            assert tx.status == "unclassified", (d, amt, tx.status)
            comp = comps[cname]
            m = methods["cheque" if "DEPOT MOBILE" in tx.description.upper() else "virement"]
            cp = ClientPayment(company_id=comp.id, status="confirmed", source="bank_import", method_code=m.code, method_name=m.name,
                               amount=Decimal(amt), received_at=d, lost_invoice=True, lost_invoice_number=num,
                               notes=f"{NOTE} — dépôt du {d} : {tx.description} — prouvé par le chèque de Philippe")
            db.add(cp); await db.flush()
            if apply:
                for f in files:
                    payment_documents.save(db, cp.id, data_of(f), ".jpg", f"cheque_{cname[:30]}_{d}.jpg")
            tx.client_payment_id, tx.payment_created = cp.id, True
            tx.status, tx.matched_at = "matched", datetime.now(timezone.utc)
            tx.company_id, tx.company_source = comp.id, "manual"
            print(f"facture perdue : {d} {amt:>8} {cname}{' #' + num if num else ''} ({len(files)} piece(s))")
        for d, amt, num, files in ADD:
            tx = await deposit(db, d, amt)
            cp = await db.get(ClientPayment, tx.client_payment_id)
            assert cp and cp.lost_invoice, (d, amt)
            if num and not cp.lost_invoice_number:
                cp.lost_invoice_number = num
            if apply:
                for f in files:
                    payment_documents.save(db, cp.id, data_of(f), ".jpg", f"cheque_{d}.jpg")
            print(f"pieces ajoutees : {d} {amt:>8} {(await db.get(Company, cp.company_id)).name}{' #' + cp.lost_invoice_number if cp.lost_invoice_number else ''} (+{len(files)})")
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
