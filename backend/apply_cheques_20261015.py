"""
Script ponctuel (2026-10-15, TASK-042.8 / TASK-005.24) : premiers cheques et talons numerises de Philippe.

- Deux anciens clients crees, inactifs, avec numero de compte (Philippe : « crée les clients que tu n'as pas, ça a été
  mes clients ») : J. Carrier Fournitures industrielles inc. (Inolec) et CLAM (Carrefour de liaison et d'aide
  multi-ethnique) -- adresses lues sur leurs cheques/talons.
- Deux liaisons de TASK-042.7 defaites (dépôts sans nom reliés par « un seul client a ce montant ») : le cheque prouve
  57,49 $ du 2020-03-17 = Houle Avocat facture #1300 (pas K-DO 1275) et 120,72 $ du 2020-04-01 = Groupe Lavoie (pas
  Guimond Lavallee 1312). Leurs « Paiement antérieur » reprennent la date de la sauvegarde de 08:35.
- Chaque depot prouve par un cheque ou un talon -> paiement « Facture perdue (ancien logiciel) » (comme
  POST /bank/transactions/{id}/lost-invoice), numero de facture quand le talon le donne, piece(s) attachee(s).
- Cheques d'avant l'incorporation / deposes au compte personnel (sept. 2019, gouvernement, Retraite Quebec) : ignores.
Tout ou rien. Usage: venv/bin/python3 apply_cheques_20261015.py [--apply]
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
LOG_USER_EMAIL = "philippe@simpleip.tel"
TAG = "chèques numérisés de Philippe (TASK-042.8)"
NEW = [
    ("J. Carrier Fournitures industrielles inc.", "Ancien client (2019-2020), aussi « Inolec » sur ses chèques. Créé d'après ses chèques et talons.",
     {"street_1": "3075, rue Sainte-Catherine Est", "city": "Montréal", "province": "QC", "postal_code": "H1W 3X6", "country": "CA"}, None),
    ("CLAM (Carrefour de liaison et d'aide multi-ethnique)", "Ancien client (2019) : installation, débogage, configuration — pas de service mensuel. Créé d'après ses chèques.",
     {"street_1": "7290, rue Hutchison, suite 2", "city": "Montréal", "province": "QC", "postal_code": "H3N 1Z1", "country": "CA"}, "514 271-8207"),
]
UNDO = [  # depot (date, montant) -> date d'origine du « Paiement antérieur » (sauvegarde 08:35)
    (date(2020, 3, 17), Decimal("57.49"), date(2020, 1, 24)),
    (date(2020, 4, 1), Decimal("120.72"), date(2020, 3, 24)),
]
LOST = [  # (date du depot, montant, compagnie, n° de facture, pieces)
    (date(2019, 11, 1), "843.92", "PAD", None, []),                       # deja fait au test (cheque attache)
    (date(2019, 11, 19), "632.36", "NETTOYAGE PRO-SIN INC.", None, ["8b4b69f5-image_1.jpg"]),
    (date(2019, 10, 31), "413.11", "STRONG", None, ["0b2601d9-image_1.jpg"]),
    (date(2019, 12, 6), "887.14", "PAD", "1235", ["eda346ed-image_1.jpg", "b0da7d58-image_4.jpg"]),
    (date(2019, 10, 4), "852.97", "PAD", "1197", ["b0da7d58-image_3.jpg"]),
    (date(2020, 3, 16), "1309.78", "PAD", None, ["0aa00ae0-image_1.jpg"]),
    (date(2019, 12, 17), "287.44", NEW[0][0], "1236", ["b744b902-image_1.jpg"]),
    (date(2020, 1, 7), "459.91", NEW[0][0], "1246", ["5938c5a7-image_0.jpg"]),
    (date(2019, 12, 2), "114.98", NEW[1][0], None, ["eda346ed-image_0.jpg"]),
    (date(2019, 12, 2), "13.80", NEW[1][0], None, ["b0da7d58-image_2.jpg"]),
    (date(2020, 3, 17), "57.49", "Houle Avocat", "1300", ["aa0c5b9e-image_0.jpg"]),
    (date(2020, 4, 1), "120.72", "Groupe Lavoie inc.", None, ["adc56b4e-image_0.jpg"]),
]
NOTE = "Paiement d'une facture de l'ancien logiciel dont le document n'a pas été conservé"


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == LOG_USER_EMAIL))).scalar_one()
        comps = {c.name: c for c in (await db.execute(select(Company))).scalars()}
        for name, note, addr, phone in NEW:
            if name in comps:
                print("existe deja :", name); continue
            ent = Entity(entity_type=EntityType.company); db.add(ent); await db.flush()
            c = Company(id=ent.id, name=name, is_active=False, account_number=await account_numbers.assign(db), notes_internal=note, office_phone=phone)
            db.add(c); await db.flush()
            db.add(Address(entity_id=c.id, address_type=AddressType.billing, is_primary=True, **addr))
            db.add(EntityLog(entity_id=c.id, user_id=user.id, action="created", description=f"Compagnie « {name} » créée, inactive ({TAG})"))
            comps[name] = c
            print(f"cree : {name} ({c.account_number})")
        for d, amt, orig in UNDO:
            tx = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == amt))).scalars().all()
            assert len(tx) == 1, (d, amt, len(tx)); tx = tx[0]
            cp = await db.get(ClientPayment, tx.client_payment_id)
            assert cp and cp.source == "zoho_import" and not tx.payment_created, (d, amt)
            print(f"defait : depot {d} {amt} <- {(await db.get(Company, cp.company_id)).name} ; paiement remis au {orig}")
            cp.received_at = orig
            tx.client_payment_id, tx.status, tx.matched_at, tx.company_id, tx.company_source, tx.auto_matched = None, "unclassified", None, None, None, False
        await db.flush()
        methods = {m.code: m for m in (await db.execute(select(PaymentMethod))).scalars()}
        n = 0
        for d, amt, cname, num, files in LOST:
            txs = (await db.execute(select(BankTransaction).where(BankTransaction.posted_date == d, BankTransaction.amount == Decimal(amt)))).scalars().all()
            assert len(txs) == 1, (d, amt, len(txs)); tx = txs[0]
            comp = comps[cname]
            if tx.status == "matched":
                cp = await db.get(ClientPayment, tx.client_payment_id)
                assert cp.lost_invoice and cp.company_id == comp.id, (d, amt)
                print(f"deja fait : {d} {amt} {cname}"); continue
            assert tx.status == "unclassified", (d, amt, tx.status)
            m = methods["cheque" if "DEPOT MOBILE" in tx.description.upper() else "virement"]
            cp = ClientPayment(company_id=comp.id, status="confirmed", source="bank_import", method_code=m.code, method_name=m.name,
                               amount=Decimal(amt), received_at=d, lost_invoice=True, lost_invoice_number=num,
                               notes=f"{NOTE} — dépôt du {d} : {tx.description}" + (f" — {tx.payee}" if tx.payee else "") + " — prouvé par le chèque de Philippe")
            db.add(cp); await db.flush()
            for f in files:
                p = CROPS / f
                assert p.is_file(), p
                if apply:
                    payment_documents.save(db, cp.id, p.read_bytes(), ".jpg", f"cheque_{cname[:30]}_{d}.jpg")
            tx.client_payment_id, tx.payment_created = cp.id, True
            tx.status, tx.matched_at = "matched", datetime.now(timezone.utc)
            tx.company_id, tx.company_source = comp.id, "manual"
            n += 1
            print(f"facture perdue : {d} {amt:>8} {cname}{' #' + num if num else ''} ({len(files)} piece(s))")
        print(n, "paiements « facture perdue » crees")
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
