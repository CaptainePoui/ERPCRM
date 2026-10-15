"""
Script ponctuel (2026-10-15, TASK-042.8) : 5e passage : les 2 cheques de 114,98 $ en attente du 4e lot (Philippe ne se souvient pas ; Clinique = client ponctuel).
- Clients absents crees inactifs (regle de Philippe) : Societe commerciale Saint-Georges inc., Clinique des
  professionnels de la sante de Sorel-Tracy (adresses lues sur leurs cheques).
- Paiements « Facture perdue (ancien logiciel) » prouves par un cheque ; cheque Guimond Lavallee #8119 ajoute au
  « Paiement anterieur » de la facture 1312 deja relie au depot du 2020-06-03 (le cheque le confirme).
- En attente de Philippe : Clinique #822 (2020-02-29) et Pro-Sin #8056 (2020-04-09), 114,98 $ chacun, pour deux depots
  de 114,98 $ (2020-04-17 et 2020-05-27) -- lequel va ou ?
Tout ou rien. Usage: venv/bin/python3 apply_cheques_lot4_20261015.py [--apply]
"""
import asyncio
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import account_numbers, payment_documents
from app.models.address import Address, AddressType
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment
from app.models.company import Company
from app.models.entity import Entity, EntityType
from app.models.entity_log import EntityLog
from app.models.payment import PaymentMethod
from app.models.user import User

CROPS = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")
TAG = "chèques numérisés de Philippe (TASK-042.8)"
NOTE = "Paiement d'une facture de l'ancien logiciel dont le document n'a pas été conservé"
NEWCOMP = []
UNSURE = " — jumelage déduit : deux chèques de 114,98 $ (Clinique #822 du 2020-02-29, Pro-Sin #8056 du 2020-04-09) pour deux dépôts de 114,98 $ (2020-04-17, 2020-05-27) ; chaque chèque au dépôt le plus proche après sa date (règle du plus proche)"
NEW = [
    (date(2020, 4, 17), "114.98", "NETTOYAGE PRO-SIN INC.", None, ["ed38dc93-image_2.jpg"]),
    (date(2020, 5, 27), "114.98", "Clinique des professionnels de la santé de Sorel-Tracy", "1259", ["53029140-image_1.jpg"]),
]
ATTACH = []


async def deposit(db, d, amt):
    txs = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(amt)))).scalars().all()
    assert len(txs) == 1, (d, amt, len(txs))
    return txs[0]


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == "philippe@simpleip.tel"))).scalar_one()
        comps = {c.name: c for c in (await db.execute(select(Company))).scalars()}
        for name, addr, phone in NEWCOMP:
            if name in comps:
                continue
            ent = Entity(entity_type=EntityType.company); db.add(ent); await db.flush()
            c = Company(id=ent.id, name=name, is_active=False, account_number=await account_numbers.assign(db), office_phone=phone,
                        notes_internal="Ancien client (2020). Créé d'après ses chèques.")
            db.add(c); await db.flush()
            db.add(Address(entity_id=c.id, address_type=AddressType.billing, is_primary=True, **addr))
            db.add(EntityLog(entity_id=c.id, user_id=user.id, action="created", description=f"Compagnie « {name} » créée, inactive ({TAG})"))
            comps[name] = c
            print(f"cree : {name} ({c.account_number})")
        methods = {m.code: m for m in (await db.execute(select(PaymentMethod))).scalars()}
        for d, amt, cname, num, files in NEW:
            tx = await deposit(db, d, amt)
            assert tx.status == "unclassified", (d, amt, tx.status)
            comp = comps[cname]
            m = methods["cheque" if "DEPOT MOBILE" in tx.description.upper() else "virement"]
            cp = ClientPayment(company_id=comp.id, status="confirmed", source="bank_import", method_code=m.code, method_name=m.name,
                               amount=Decimal(amt), received_at=d, lost_invoice=True, lost_invoice_number=num,
                               notes=f"{NOTE} — dépôt du {d} : {tx.description} — prouvé par le chèque de Philippe" + UNSURE)
            db.add(cp); await db.flush()
            if apply:
                for f in files:
                    payment_documents.save(db, cp.id, (CROPS / f).read_bytes(), ".jpg", f"cheque_{cname[:30]}_{d}.jpg")
            tx.client_payment_id, tx.payment_created = cp.id, True
            tx.status, tx.matched_at = "matched", datetime.now(timezone.utc)
            tx.company_id, tx.company_source = comp.id, "manual"
            print(f"facture perdue : {d} {amt:>8} {cname}{' #' + num if num else ''}")
        for d, amt, files in ATTACH:
            tx = await deposit(db, d, amt)
            assert tx.client_payment_id
            if apply:
                for f in files:
                    payment_documents.save(db, tx.client_payment_id, (CROPS / f).read_bytes(), ".jpg", f"cheque_{d}.jpg")
            print(f"cheque ajoute au paiement deja relie : {d} {amt}")
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
