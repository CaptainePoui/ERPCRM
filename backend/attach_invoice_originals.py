"""
Script ponctuel (2026-10-14, TASK-005.23) : rattache le PDF d'origine (ancien logiciel / QuickBooks) aux factures
importees, pour que le client voie au portail le document exact qu'il a recu (Philippe : « oui ce serait cool et on les a »).

- Source : Invoices*.zip de /home/simpleip/Simple_IP/factures_zoho (lus et controles par zoho_invoice_pdf.py).
- Seulement les factures importees (pas celles creees par ERPCRM a partir du 2026-10-02, INV-112249 et suivantes,
  qui ont leur propre PDF) et seulement si le document dit encore vrai : meme total que dans ERPCRM ET « Solde du »
  du PDF = solde actuel dans ERPCRM, et facture reglee au complet (un document d'une facture encore ouverte, ou d'un
  brouillon qui sera peut-etre redate, deviendrait faux au prochain paiement). Une facture payee depuis l'export (depot BNC vu par ERPCRM) garderait sinon
  un solde faux sous les yeux du client -> PDF genere par ERPCRM.
- Fichier copie dans storage/invoice_originals/<id de la facture>.pdf ; invoices.original_pdf = ce nom.
- Relancable (deja rattache = remplace par le meme fichier). Tout ou rien pour la base.

Usage: venv/bin/python3 attach_invoice_originals.py [--apply]
"""
import asyncio
import glob
import re
import sys
import zipfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core.invoice_originals import ORIGINALS_DIR
from app.models.invoice import Invoice
from app.api.v1.endpoints.payments import settled_amounts
from zoho_invoice_pdf import parse

ZIPS = "/home/simpleip/Simple_IP/factures_zoho/Invoices*.zip"
FIRST_ERPCRM = 112249          # INV-112249 et suivantes : creees par ERPCRM (TASK-005.19)


def number_of(name: str) -> str:
    return re.sub(r"^nº\s*", "", name.strip())


def erpcrm_made(num: str) -> bool:
    return num.startswith("INV-") and num[4:].isdigit() and int(num[4:]) >= FIRST_ERPCRM


async def main(apply: bool):
    import tempfile
    tmp = Path(tempfile.mkdtemp(prefix="zoho_orig_"))
    for z in sorted(glob.glob(ZIPS)):
        zipfile.ZipFile(z).extractall(tmp)
    files = sorted(tmp.glob("*.pdf"))
    with ProcessPoolExecutor() as ex:
        parsed = list(ex.map(parse, [str(f) for f in files], chunksize=20))
    by_num = {}
    for f, x in zip(files, parsed):
        assert not x["errors"], (f.name, x["errors"])
        by_num[number_of(x["number"])] = (f, x)

    stats, out = Counter(), []
    async with AsyncSessionLocal() as db:
        invs = (await db.execute(select(Invoice).where(Invoice.credit_of_id.is_(None)))).scalars().all()
        settled = await settled_amounts(db, [i.id for i in invs])
        for inv in invs:
            if inv.number not in by_num:
                stats["sans PDF d'origine"] += 1
                continue
            if erpcrm_made(inv.number):
                stats["creee par ERPCRM (garde son PDF)"] += 1
                continue
            f, x = by_num[inv.number]
            balance = inv.total - (settled.get(inv.id) or Decimal(0)) if inv.status not in ("brouillon", "annulee") else inv.total
            if inv.status != "payee" or balance != 0:
                stats["pas encore reglee au complet (PDF genere, suit le solde)"] += 1
                continue
            if inv.total != Decimal(x["total"]) or balance != Decimal(x["balance"]):
                stats["solde change depuis l'export (PDF genere)"] += 1
                out.append(f"{inv.number} : PDF solde {x['balance']} / ERPCRM {balance}")
                continue
            name = f"{inv.id}.pdf"
            if apply:
                ORIGINALS_DIR.mkdir(parents=True, exist_ok=True)
                (ORIGINALS_DIR / name).write_bytes(f.read_bytes())
            inv.original_pdf = name
            stats["rattache"] += 1
        print(dict(stats))
        for o in out[:40]:
            print("  ", o)
        if apply:
            await db.commit()
            print("APPLIQUE")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
