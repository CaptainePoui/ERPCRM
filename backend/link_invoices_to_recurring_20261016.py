"""
Script ponctuel (2026-10-16, TASK-005.26) : relie chaque facture a sa facture periodique d'origine (« factures enfants »
de l'entente). Sources : colonne « Recurrence Name » des exports de l'ancien logiciel (Facture2*.csv, 2024-09 -> 2026-10),
et la note « Généré depuis la facture périodique « nom » » des factures faites par ERPCRM. Le profil est cherche chez la
meme compagnie : par nom (sans accents/ponctuation), sinon le seul profil de la compagnie. Ajout seulement.
Usage: venv/bin/python3 link_invoices_to_recurring_20261016.py [--apply]
"""
import asyncio, csv, glob, re, sys, unicodedata
from collections import Counter, defaultdict
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice
from app.models.recurring_billing import CompanyRecurringBilling


def sq(s):
    s = ''.join(c for c in unicodedata.normalize('NFD', (s or '').lower()) if unicodedata.category(c) != 'Mn')
    return re.sub(r"[^a-z0-9]", "", s)


async def main(apply):
    rec = {}
    for f in sorted(glob.glob("/home/simpleip/Simple_IP/factures_zoho/Facture2*.csv")):
        for r in csv.DictReader(open(f, encoding="utf-8-sig")):
            if r.get("Recurrence Name"):
                rec[r["Invoice Number"].strip()] = r["Recurrence Name"].strip()
    async with AsyncSessionLocal() as db:
        profiles = defaultdict(list)
        for rb in (await db.execute(select(CompanyRecurringBilling))).scalars():
            profiles[rb.company_id].append(rb)
        invs = (await db.execute(select(Invoice).where(Invoice.recurring_billing_id.is_(None), Invoice.credit_of_id.is_(None)))).scalars().all()
        stats = Counter()
        for inv in invs:
            name = rec.get(inv.number)
            m = re.match(r"Généré depuis la facture périodique « (.*) »", inv.notes or "")
            if not name and m:
                name = m.group(1)
            if not name:
                continue
            cands = profiles.get(inv.company_id, [])
            hit = [rb for rb in cands if sq(rb.name) == sq(name)] or ([cands[0]] if len(cands) == 1 else [])
            if len(hit) != 1:
                stats["profil introuvable ou ambigu"] += 1
                continue
            inv.recurring_billing_id = hit[0].id
            stats["relie"] += 1
        print(dict(stats))
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT")

asyncio.run(main("--apply" in sys.argv))
