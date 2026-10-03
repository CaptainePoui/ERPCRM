"""
Script ponctuel (2026-10-03, TASK-044 Achats) : importe l'historique des achats exporte de l'ancien
logiciel comptable (Depenses.csv, Facture_fournisseur.csv, Facture_fournisseur_periodique.csv).

- Fournisseurs : un par nom (« Industriel Alliance » = « Industrielle Alliance ») ; ScopServ et
  TECHNI-EXPRESS rattaches a leur compagnie de la CRM.
- Categories de depense = comptes de l'ancien logiciel. Salaires, Taxe (versements TPS/TVQ),
  Impot Quebec et Taxe 911 ne donnent pas de CTI/RTI.
- Depenses : 675, montants et taxes tels quels.
- Factures fournisseurs : 851 ; taxes recalculees par ERPCRM et comparees au total ET aux taxes
  du fichier (ecart = probleme, rien n'est ecrit). Ajustements d'arrondi (+-0,01 $) conserves.
  Le montant deja paye (Total - Balance) devient UN paiement « Paiement antérieur » par facture,
  date de la facture (le fichier ne contient ni les paiements ni leur date).
- Factures periodiques : seulement les profils actifs (les expires ne sont pas importes, comme
  pour la facturation des clients) ; dernier cycle genere = celui de la derniere facture creee.
- Rien de visible ne mentionne l'ancien logiciel (source interne zoho_import seulement).
- Tout ou rien ; refuse de tourner si des achats importes existent deja.

Usage: venv/bin/python3 import_zoho_purchases.py [--apply]
"""
import asyncio
import csv
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal

from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.company import Company
from app.models.purchases import (Vendor, ExpenseCategory, Expense, Bill, RecurringBill, RecurringBillLine,
                                  VendorPayment, VendorPaymentAllocation)
from app.api.v1.endpoints.purchases import BillIn, BillLineIn, _apply_bill, _bill_status, compute_taxes
from app.api.v1.endpoints.recurring_billing import _cycle_bounds

DIR = "/home/simpleip/Simple_IP/factures_zoho/"
C = Decimal("0.01")
TAX = {"Québec": "tps_tvq", "": "aucune", "TVQ 9.975%": "tvq", "TPS 5%": "tps"}
VENDOR_ALIAS = {"Industriel Alliance": "Industrielle Alliance"}
VENDOR_COMPANY = {"ScopServ": "ScopServ", "TECHNI-EXPRESS SERVICES TÉLÉCOM": "TECHNI-EXPRESS SERVICES TÉLÉCOM"}
NO_TAX_CREDITS = {"Salaires et rémunération des employés", "Taxe", "Impôt Québec", "Taxe 911", "RQAP employeur", "Frais bancaires et charges"}
PAID_THROUGH = {"Simple IP": "Compte de l'entreprise", "Remboursements des employés": "Remboursement d'employé"}
FREQ = {("Months", "1"): "mensuel", ("Weeks", "1"): "hebdomadaire", ("Years", "1"): "annuel"}


def rows(name):
    return list(csv.DictReader(open(DIR + name, encoding="utf-8-sig")))


def vname(n: str) -> str:
    n = (n or "").strip()
    return VENDOR_ALIAS.get(n, n)


def dec(v) -> Decimal:
    return Decimal(v or "0").quantize(C)


async def main(apply: bool):
    exp_rows = rows("Dépenses.csv")
    bill_rows = defaultdict(list)
    for r in rows("Facture_fournisseur.csv"):
        bill_rows[r["Bill ID"]].append(r)
    rec_rows = defaultdict(list)
    for r in rows("Facture_fournisseur_périodique.csv"):
        if r["Recurrence Profile Status"] == "Active":
            rec_rows[(r["Recurring Bill Name"].strip(), r["Vendor Name"])].append(r)

    problems = []
    async with AsyncSessionLocal() as db:
        for model in (Expense, Bill, VendorPayment):
            if (await db.execute(select(func.count()).select_from(model).where(model.source == "zoho_import"))).scalar():
                raise SystemExit(f"Des achats importés existent déjà ({model.__tablename__}) : rien n'est fait")

        # ── Fournisseurs et categories ────────────────────────────────────
        vendors = {v.name: v for v in (await db.execute(select(Vendor))).scalars().all()}
        names = {vname(r["Vendor"]) for r in exp_rows} | {vname(rs[0]["Vendor Name"]) for rs in bill_rows.values()} \
            | {vname(k[1]) for k in rec_rows}
        names.discard("")
        companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
        new_vendors = []
        for n in sorted(names):
            if n not in vendors:
                comp = companies.get(VENDOR_COMPANY.get(n, ""))
                vendors[n] = Vendor(name=n, company_id=comp.id if comp else None)
                db.add(vendors[n])
                new_vendors.append(n + (f" (compagnie {comp.name})" if comp else ""))
        cats = {c.name: c for c in (await db.execute(select(ExpenseCategory))).scalars().all()}
        accounts = {r["Expense Account"] for r in exp_rows} | {x["Account"] for rs in bill_rows.values() for x in rs} \
            | {x["Account"] for rs in rec_rows.values() for x in rs}
        accounts.discard("")
        new_cats = []
        for a in sorted(accounts):
            if a not in cats:
                cats[a] = ExpenseCategory(name=a, claims_tax_credits=a not in NO_TAX_CREDITS)
                db.add(cats[a])
                new_cats.append(a)
        await db.flush()

        # ── Depenses ──────────────────────────────────────────────────────
        n_exp = 0
        kept_as_is = []
        for r in exp_rows:
            mode = "inclusive" if r["Is Inclusive Tax"] == "true" else "exclusive"
            code = TAX[r["Tax Name"]]
            amount = dec(r["Expense Amount"])
            t = compute_taxes([(amount, code)], mode)
            if t["total"] != dec(r["Total"]):
                problems.append(f"Dépense {r['Expense Date']} {r['Expense Account']} : ERPCRM {t['total']} ≠ fichier {r['Total']}")
            ftax = dec(r["Tax Amount"])
            if t["tps_amount"] + t["tvq_amount"] != ftax:
                # Recu avec une partie non taxable (ex. pourboire) : on garde les taxes reellement payees
                tps = (ftax * 5 / Decimal("14.975")).quantize(C)
                t = {"subtotal": t["total"] - ftax, "tps_amount": tps, "tvq_amount": ftax - tps, "total": t["total"]}
                kept_as_is.append(f"{r['Expense Date']} {r['Expense Account']} {r['Total']} $ : taxes {ftax} $ du reçu conservées")
            v = vendors.get(vname(r["Vendor"]))
            db.add(Expense(
                expense_date=date.fromisoformat(r["Expense Date"]), vendor_id=v.id if v else None,
                category_id=cats[r["Expense Account"]].id, description=(r["Expense Description"] or "").strip() or None,
                tax_mode=mode, tax_code=code, amount=amount, subtotal=t["subtotal"], tps_amount=t["tps_amount"],
                tvq_amount=t["tvq_amount"], total=t["total"], paid_through=PAID_THROUGH.get(r["Paid Through"], r["Paid Through"]),
                reference=(r["Reference#"] or "").strip() or None, source="zoho_import"))
            n_exp += 1

        # ── Factures fournisseurs ─────────────────────────────────────────
        n_bills = n_paid = 0
        paid_total = Decimal("0")
        by_status = defaultdict(int)
        for rs in sorted(bill_rows.values(), key=lambda x: (x[0]["Bill Date"], x[0]["Bill Number"])):
            r = rs[0]
            mode = "inclusive" if r["Is Inclusive Tax"] == "true" else "exclusive"
            lines = []
            for x in rs:
                desc = (x["Item Name"] or "").strip()
                if (x["Description"] or "").strip():
                    desc = f"{desc} — {x['Description'].strip()}" if desc else x["Description"].strip()
                qty, rate = Decimal(x["Quantity"] or "1"), Decimal(x["Rate"] or "0")
                if mode == "exclusive" and (qty * rate).quantize(C) != dec(x["Item Total"]):
                    problems.append(f"Facture {r['Bill Number']} : ligne {qty} x {rate} ≠ {x['Item Total']}")
                lines.append(BillLineIn(description=desc[:500], category_id=cats[x["Account"]].id if x["Account"] else None,
                                        qty=float(qty), rate=float(rate), tax_code=TAX[x["Tax Name"]]))
            b = Bill(status="ouverte", source="zoho_import", lines=[])
            _apply_bill(b, BillIn(vendor_id=vendors[vname(r["Vendor Name"])].id, bill_number=(r["Bill Number"] or "").strip() or None,
                                  bill_date=date.fromisoformat(r["Bill Date"]),
                                  due_date=date.fromisoformat(r["Due Date"]) if r["Due Date"] else None,
                                  tax_mode=mode, adjustment=float(dec(r["Adjustment"])),
                                  notes=(r["Vendor Notes"] or "").strip() or None, lines=lines))
            zt = dec(r["Total"])
            ztax = sum((Decimal(x["Tax Amount"] or 0) for x in rs), Decimal("0")).quantize(C)
            if b.total != zt or b.tps_amount + b.tvq_amount != ztax:
                problems.append(f"Facture {r['Bill Number']} ({r['Vendor Name']}) : ERPCRM {b.total} / taxes "
                                f"{b.tps_amount + b.tvq_amount} ≠ fichier {zt} / {ztax}")
            db.add(b)
            await db.flush()
            paid = zt - dec(r["Balance"])
            if paid > 0:
                vp = VendorPayment(payment_date=b.bill_date, vendor_id=b.vendor_id, amount=paid, method="Paiement antérieur",
                                   notes=f"Paiement antérieur de la facture {b.bill_number or ''} (date réelle inconnue).".replace("  ", " "),
                                   source="zoho_import", allocations=[VendorPaymentAllocation(bill_id=b.id, amount=paid)])
                db.add(vp)
                n_paid += 1
                paid_total += paid
            b.status = _bill_status(b, paid)
            expected = {"Paid": "payee", "Open": "ouverte", "Overdue": "en_retard"}.get(r["Bill Status"])
            if b.status != expected and not (expected in ("ouverte", "en_retard") and b.status == "partielle"):
                problems.append(f"Facture {r['Bill Number']} : statut ERPCRM {b.status} ≠ fichier {r['Bill Status']}")
            by_status[b.status] += 1
            n_bills += 1

        # ── Factures periodiques actives ──────────────────────────────────
        n_rec = 0
        existing = {(x.name, x.vendor_id) for x in (await db.execute(select(RecurringBill))).scalars().all()}
        for (name, vend), rs in rec_rows.items():
            r = rs[0]
            v = vendors[vname(vend)]
            if (name, v.id) in existing:
                continue
            freq = FREQ.get((r["Recurrence Frequency"], r["Repeat Every"]))
            if not freq:
                problems.append(f"Récurrence {name} : fréquence non gérée {r['Recurrence Frequency']} x {r['Repeat Every']}")
                continue
            start = date.fromisoformat(r["Start Date"])
            last = date.fromisoformat(r["Last Sent Date"]) if r["Last Sent Date"] else None
            mode = "inclusive" if r["Is Inclusive Tax"] == "true" else "exclusive"
            rb = RecurringBill(name=name, vendor_id=v.id, tax_mode=mode, frequency=freq, start_date=start,
                               end_date=date.fromisoformat(r["End Date"]) if r["End Date"] else None,
                               last_generated_date=_cycle_bounds(start, freq, last)[0] if last else None, is_active=True, lines=[])
            items = []
            for n, x in enumerate(rs):
                desc = (x["Description"] or "").strip() or x["Account"]
                rb.lines.append(RecurringBillLine(description=desc[:500], category_id=cats[x["Account"]].id if x["Account"] else None,
                                                  qty=Decimal(x["Quantity"] or "1"), rate=Decimal(x["Rate"] or "0"),
                                                  tax_code=TAX[x["Tax Name"]], sort_order=n))
                items.append(((Decimal(x["Quantity"] or "1") * Decimal(x["Rate"] or "0")).quantize(C), TAX[x["Tax Name"]]))
            if compute_taxes(items, mode)["total"] != dec(r["Total"]):
                problems.append(f"Récurrence {name} : total ERPCRM {compute_taxes(items, mode)['total']} ≠ fichier {r['Total']}")
            db.add(rb)
            n_rec += 1
            print(f"  récurrence {name[:32]:32} {v.name[:28]:28} {freq:12} début {start} dernier cycle {rb.last_generated_date}")

        if problems or not apply:
            await db.rollback()
        else:
            await db.commit()

    print(f"Fournisseurs créés : {len(new_vendors)} — {', '.join(new_vendors)}")
    print(f"Catégories créées : {len(new_cats)} — {', '.join(new_cats)}")
    print(f"Dépenses : {n_exp} ; factures fournisseurs : {n_bills} {dict(by_status)} ; "
          f"paiements antérieurs : {n_paid} ({paid_total} $) ; factures périodiques actives : {n_rec}")
    for k in (kept_as_is if 'kept_as_is' in dir() else []):
        print("  CONSERVÉ :", k)
    for p in problems[:40]:
        print("  PROBLÈME :", p)
    if len(problems) > 40:
        print(f"  … {len(problems) - 40} autres problèmes")
    print("ÉCRIT" if apply and not problems else ("RIEN ÉCRIT (problèmes ci-dessus)" if problems else "ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)"))


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
