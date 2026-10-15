"""
Cheques numerises de Philippe (TASK-042.8) -- application par lot, une seule regle (2026-10-15, apres « faire les
chèques, les attribuer à la bonne place et après voir ce qui manque ») :
chaque cheque va au PREMIER depot BNC du meme montant, de sa date -7 j (cheque date d avance) a +70 jours, dont le paiement n'a pas encore de
cheque attache (les cheques d'un client regulier se deposent dans l'ordre) :
- depot deja relie a un paiement de ce client (ou de sa maison mere / ses succursales) -> cheque attache au paiement ;
- depot non classe et anterieur au 2020-06-01 -> paiement « Facture perdue (ancien logiciel) » + cheque ;
- autrement (relie a un autre client, non classe apres juin 2020, aucun depot) -> mis de cote dans
  storage/payment_documents_pending/, sans question ; liste a la fin de la serie.
Entree : fichier TSV « image<TAB>compagnie ERPCRM<TAB>date du cheque<TAB>montant<TAB>n° facture (facultatif) ».
Usage: venv/bin/python3 apply_cheques_auto.py lot.tsv [--apply]
"""
import asyncio
import shutil
import sys
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select, exists
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import payment_documents
from app.core.company_tree import ancestors, descendant_ids
from app.models.bank_account import BankTransaction
from app.models.client_payment import ClientPayment, PaymentDocument
from app.models.company import Company
from app.models.payment import PaymentMethod

CROPS = Path("/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/cheques/all")
PENDING = Path(__file__).resolve().parent / "storage" / "payment_documents_pending"
LOST_BEFORE = date(2020, 6, 1)
NOTE = "Paiement d'une facture de l'ancien logiciel dont le document n'a pas été conservé"


async def family(db, cid):
    return {cid} | {a.id for a in await ancestors(db, cid)} | set(await descendant_ids(db, cid))


async def main(tsv: Path, apply: bool):
    rows = [l.rstrip("\n").split("\t") for l in tsv.read_text().splitlines() if l.strip() and not l.startswith("#")]
    rows.sort(key=lambda r: r[2])                       # dans l'ordre des dates de cheque
    async with AsyncSessionLocal() as db:
        comps = {c.name: c for c in (await db.execute(select(Company))).scalars()}
        methods = {m.code: m for m in (await db.execute(select(PaymentMethod))).scalars()}
        used = set()                                    # paiements qui recoivent un cheque dans ce lot
        pending = []
        for img, cname, d, amt, num in (r + [""] * (5 - len(r)) for r in rows):
            d, amt, num = date.fromisoformat(d), Decimal(amt), (num or None)
            assert (CROPS / img).is_file(), img
            comp = comps.get(cname)
            assert comp, f"compagnie inconnue : {cname}"
            fam = await family(db, comp.id)
            txs = (await db.execute(select(BankTransaction).where(
                BankTransaction.amount == amt, BankTransaction.posted_date.between(d - timedelta(days=7), d + timedelta(days=70)))
                .order_by(BankTransaction.posted_date))).scalars().all()
            pick = None
            for tx in txs:
                if tx.client_payment_id:
                    if tx.client_payment_id in used or (await db.execute(select(exists().where(PaymentDocument.payment_id == tx.client_payment_id)))).scalar():
                        continue                        # ce depot a deja son cheque
                    pick = tx; break
                if tx.status == "unclassified":
                    pick = tx; break
            where = f"{img} {cname} {d} {amt}"
            if pick is None:
                pending.append(f"{where} : aucun dépôt libre du même montant (jusqu'à +70 j)")
                if apply: shutil.copy(CROPS / img, PENDING / f"{d}_{amt}_{cname[:30].replace(' ', '_')}_{img}")
                continue
            if pick.client_payment_id:
                cp = await db.get(ClientPayment, pick.client_payment_id)
                if cp.company_id not in fam:
                    pending.append(f"{where} : le dépôt du {pick.posted_date} est relié à {(await db.get(Company, cp.company_id)).name}")
                    if apply: shutil.copy(CROPS / img, PENDING / f"{d}_{amt}_{cname[:30].replace(' ', '_')}_{img}")
                    continue
                used.add(cp.id)
                if apply: payment_documents.save(db, cp.id, (CROPS / img).read_bytes(), ".jpg", f"cheque_{d}.jpg")
                if num and cp.lost_invoice and not cp.lost_invoice_number: cp.lost_invoice_number = num
                print(f"attaché   {where} -> dépôt du {pick.posted_date}")
                continue
            if pick.posted_date >= LOST_BEFORE:
                pending.append(f"{where} : dépôt du {pick.posted_date} non classé (après juin 2020 : la facture devrait exister)")
                if apply: shutil.copy(CROPS / img, PENDING / f"{d}_{amt}_{cname[:30].replace(' ', '_')}_{img}")
                continue
            m = methods["cheque" if "DEPOT MOBILE" in pick.description.upper() else "virement"]
            cp = ClientPayment(company_id=comp.id, status="confirmed", source="bank_import", method_code=m.code, method_name=m.name,
                               amount=amt, received_at=pick.posted_date, lost_invoice=True, lost_invoice_number=num,
                               notes=f"{NOTE} — dépôt du {pick.posted_date} : {pick.description} — prouvé par le chèque de Philippe")
            db.add(cp); await db.flush(); used.add(cp.id)
            if apply: payment_documents.save(db, cp.id, (CROPS / img).read_bytes(), ".jpg", f"cheque_{d}.jpg")
            pick.client_payment_id, pick.payment_created = cp.id, True
            pick.status, pick.matched_at = "matched", datetime.now(timezone.utc)
            pick.company_id, pick.company_source = comp.id, "manual"
            print(f"perdue    {where} -> dépôt du {pick.posted_date}")
        for p in pending:
            print("de côté  ", p)
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]), "--apply" in sys.argv))
