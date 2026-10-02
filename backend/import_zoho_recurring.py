"""
Script ponctuel (2026-10-02, TASK-021.1) : importe les factures periodiques ACTIVES exportees
de Zoho Books (Facture_periodique.csv) dans la Recurrence d'ERPCRM. Les profils expires /
inactifs (clients arretes) ne sont pas importes (decision de Philippe).

- Correspondance client -> compagnie : celle de l'import des factures (import_zoho_invoices.py),
  validee avec Philippe ; Oxygene -> Maison Le Passeur, succursale « Oxygene ».
- first_invoice_generated = vrai : ces profils facturent deja depuis Zoho, la premiere facture
  generee dans ERPCRM ne doit pas doubler les lignes (TASK-033).
- last_invoice_date = debut du cycle de la derniere facture envoyee par Zoho : ERPCRM refuse
  de regenerer un cycle deja facture.
- Verifie pour chaque profil : sous-total ERPCRM = sous-total Zoho, prochain cycle ERPCRM =
  « Next Invoice Date » Zoho.
- Relancable : un profil deja importe (meme compagnie + meme nom) est ignore. Tout ou rien.

Usage: venv/bin/python3 import_zoho_recurring.py [--apply]
"""
import asyncio
import csv
import sys
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.recurring_billing import CompanyRecurringBilling, RecurringBillingLine
from app.api.v1.endpoints.recurring_billing import _cycle_bounds
from import_zoho_invoices import CUSTOMER_MAP, RENAME, BRANCH_OF

FILE = "/home/simpleip/Simple_IP/factures_zoho/Facture_périodique.csv"
FREQ = {"1": "mensuel", "2": "bimestriel", "3": "trimestriel", "6": "biannuel", "12": "annuel"}


def company_name(cust: str) -> str:
    name = CUSTOMER_MAP.get(cust, cust)
    return RENAME[name][0] if name in RENAME else name


async def main(apply: bool):
    profiles: dict = {}
    for r in csv.DictReader(open(FILE, encoding="utf-8-sig")):
        if r["Recurrence Profile Status"] == "Active":
            profiles.setdefault(r["Recurring Invoice ID"], []).append(r)

    problems, created, skipped = [], 0, 0
    async with AsyncSessionLocal() as db:
        companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
        for rows in sorted(profiles.values(), key=lambda rs: rs[0]["Customer Name"]):
            r = rows[0]
            cust, pname = r["Customer Name"], r["Recurring Invoice Name"].strip()
            comp = companies.get(company_name(cust))
            if not comp:
                problems.append(f"{pname} : compagnie introuvable pour le client « {cust} »")
                continue
            if r["Recurrence Frequency"] != "Months" or r["Repeat Every"] not in FREQ:
                problems.append(f"{pname} : fréquence non gérée {r['Recurrence Frequency']} x {r['Repeat Every']}")
                continue
            freq = FREQ[r["Repeat Every"]]
            start = date.fromisoformat(r["Start Date"])
            nxt = date.fromisoformat(r["Next Invoice Date"]) if r["Next Invoice Date"] else None
            last = date.fromisoformat(r["Last Sent Date"]) if r["Last Sent Date"] else None

            exists = (await db.execute(select(CompanyRecurringBilling.id).where(
                CompanyRecurringBilling.company_id == comp.id, CompanyRecurringBilling.name == pname))).first()
            if exists:
                skipped += 1
                continue

            site = None
            if cust in BRANCH_OF:
                site = (await db.execute(select(CompanySite).where(
                    CompanySite.company_id == comp.id, CompanySite.label == cust))).scalar_one_or_none()
                if not site:
                    problems.append(f"{pname} : succursale « {cust} » introuvable")
                    continue

            # Controles de coherence avec Zoho
            lines = []
            for n, x in enumerate(rows):
                desc = (x["Item Name"] or "").strip()
                if (x["Item Desc"] or "").strip():
                    desc = f"{desc} — {x['Item Desc'].strip()}" if desc else x["Item Desc"].strip()
                lines.append(((desc or "Article")[:500], float(x["Quantity"] or 1), float(x["Item Price"] or 0), n))
            sub = sum(Decimal(str(q)) * Decimal(str(p)) for _, q, p, _ in lines).quantize(Decimal("0.01"))
            if sub != Decimal(r["SubTotal"]).quantize(Decimal("0.01")):
                problems.append(f"{pname} : sous-total ERPCRM {sub} ≠ Zoho {r['SubTotal']}")
            if nxt and _cycle_bounds(start, freq, nxt)[0] != nxt:
                problems.append(f"{pname} : prochain cycle ERPCRM {_cycle_bounds(start, freq, nxt)[0]} ≠ Zoho {nxt}")

            rb = CompanyRecurringBilling(
                company_id=comp.id, name=pname, site_id=site.id if site else None, is_telephony=False,
                start_date=start, frequency=freq, is_active=True, first_invoice_generated=True,
                last_invoice_date=_cycle_bounds(start, freq, last)[0] if last else None,
            )
            db.add(rb)
            await db.flush()
            for desc, q, p, n in lines:
                db.add(RecurringBillingLine(recurring_billing_id=rb.id, description=desc, qty=q, unit_price=p, sort_order=n))
            created += 1
            print(f"  {comp.name[:30]:30} {pname[:28]:28} {freq:11} début {start} dernière {rb.last_invoice_date} prochaine Zoho {nxt} sous-total {sub}")

        if problems or not apply:
            await db.rollback()
        else:
            await db.commit()

    print(f"\n{created} profils {'importés' if apply and not problems else 'prêts'}, {skipped} déjà présents")
    for p in problems:
        print("  PROBLÈME :", p)
    print("ÉCRIT" if apply and not problems else ("RIEN ÉCRIT (problèmes ci-dessus)" if problems else "ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)"))


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
