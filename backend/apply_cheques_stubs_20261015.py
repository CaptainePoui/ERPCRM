import asyncio, sys
from datetime import date
from decimal import Decimal
from pathlib import Path
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models
from app.core import payment_documents
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment
C = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")
STUBS = [  # talon -> depot du cheque correspondant (deja relie), n° de facture pour une facture perdue
    ("7e09c41b-image_3.jpg", date(2020, 9, 30), "873.19", None),     # PAD #15755 -> 1417
    ("5bbb0df3-image_1.jpg", date(2020, 12, 10), "873.19", None),    # PAD #15978 -> 1484
    ("5bbb0df3-image_3.jpg", date(2020, 6, 29), "873.19", None),     # PAD #15551 -> 1372
    ("5bbb0df3-image_2.jpg", date(2020, 10, 14), "45.88", None),     # Cascades #6756 -> 1428
    ("5bbb0df3-image_4.jpg", date(2020, 8, 25), "174.20", None),     # ACVRQ #4068 -> 1396 (ERPCRM : 1423)
    ("59ca16f8-image_2.jpg", date(2020, 6, 29), "321.71", None),     # Cascades #6542 -> 1336, 1289, 1317
    ("59ca16f8-image_1.jpg", date(2019, 12, 16), "3316.87", "1243"), # Immo 1ere #2157
    ("59ca16f8-image_3.jpg", date(2020, 2, 14), "459.90", "1266"),   # J. Carrier #112354
]
async def m(apply):
    async with AsyncSessionLocal() as db:
        for f, d, a, num in STUBS:
            tx = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(a)))).scalar_one()
            cp = await db.get(ClientPayment, tx.client_payment_id)
            if num and cp.lost_invoice and not cp.lost_invoice_number: cp.lost_invoice_number = num
            if apply: payment_documents.save(db, cp.id, (C / f).read_bytes(), ".jpg", f"talon_{d}.jpg")
            print("talon", f, d, a, "n°", cp.lost_invoice_number)
        await (db.commit() if apply else db.rollback())
asyncio.run(m("--apply" in sys.argv))
