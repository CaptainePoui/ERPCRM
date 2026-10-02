"""
Script ponctuel (2026-10-02, TASK-005.10 Avoirs) : importe les avoirs (notes de credit) Zoho Books
appliques sur des factures deja presentes dans ERPCRM, et corrige les encaissements « Historique
Zoho » de ces factures.

Pourquoi : l'import des factures (import_zoho_invoices.py) a converti « Total - Balance » en UN
encaissement par facture ; or ce montant contenait aussi les avoirs appliques. Resultat : de faux
encaissements et des taxes de vente surestimees (un avoir reduit les taxes percues, pas un paiement).

Source : Facture_de_factures_d’avoir.csv (Zoho : une ligne par application avoir -> facture),
recoupe avec la liste d'avoirs donnee par Philippe (avoirs_liste_philippe.txt). Les avoirs appliques
uniquement sur des factures anterieures a l'import ERPCRM sont ignores (rien a regler ici).

Regles :
- Avoir = facture « CN-xxxxx » a montants negatifs, credit_of_id = la (premiere) facture creditee,
  datee de la date Zoho, entierement appliquee -> statut payee.
- Avoir egal au total d'une seule facture -> ses lignes copiees en negatif (memes taxes).
  Sinon une ligne par facture creditee ; la base hors taxes est retrouvee pour que
  base + TPS + TVQ (arrondies demie vers le haut sur la base totale) = montant exact de Zoho.
- L'encaissement « Historique Zoho » de chaque facture est diminue du montant des avoirs
  (supprime s'il tombe a 0). Un encaissement deja rapproche a la banque n'est jamais touche
  (signale comme probleme -> rien n'est ecrit).
- MGB ASSOCIES (CN-00297, INV-111428) : Zoho avait l'avoir a 1230.18 $ (hors taxes saisi comme
  taxes incluses) dont 1069.95 $ appliques -> 160.23 $ de credit fantome. Importe a 1069.95 $
  taxes incluses (correction demandee par Philippe le 2026-10-02) : solde a 0.
- Relancable (avoir deja present = ignore). Tout ou rien.

Usage: venv/bin/python3 import_zoho_credits.py [--apply]
"""
import asyncio
import csv
import sys
from collections import defaultdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice, InvoiceLine
from app.models.client_payment import ClientPayment, PaymentAllocation, CreditAllocation
from app.models.bank_account import BankTransaction
from app.api.v1.endpoints.invoices import _recalc

FILE = "/home/simpleip/Simple_IP/factures_zoho/Facture_de_factures_d’avoir.csv"
# Applications absentes de l'export mais confirmees par Philippe (liste d'avoirs + explication)
MISSING_APPLICATIONS = [
    # CN-00208 : ABC Gestion parasitaire, un mois facture en trop (INV-111654) credite le 2025-07-24
    {"Date": "2025-07-24", "Credit Note Number": "CN-00208", "Invoice Number": "INV-111654", "Amount": "462.66"},
]
C = Decimal("0.01")


def money(v) -> Decimal:
    return Decimal(v).quantize(C, rounding=ROUND_HALF_UP)


def base_for(total: Decimal, tps_rate: Decimal, tvq_rate: Decimal) -> Decimal | None:
    """Base B telle que B + arrondi(B*TPS) + arrondi(B*TVQ) = total (taxes incluses)."""
    guess = money(total / (1 + (tps_rate + tvq_rate) / 100))
    for d in range(0, 6):
        for b in (guess + d * C, guess - d * C):
            if b + money(b * tps_rate / 100) + money(b * tvq_rate / 100) == total:
                return b
    return None


async def main(apply: bool):
    apps: dict = defaultdict(list)
    for r in csv.DictReader(open(FILE, encoding="utf-8-sig")):
        apps[r["Credit Note Number"].strip()].append(r)
    for r in MISSING_APPLICATIONS:
        apps[r["Credit Note Number"]].append(r)

    problems, created, skipped, out_of_scope = [], 0, 0, 0
    pay_reduced, pay_deleted = 0, 0
    async with AsyncSessionLocal() as db:
        invs = {i.number: i for i in (await db.execute(select(Invoice).options(selectinload(Invoice.lines)))).scalars().all()}
        matched_payments = set((await db.execute(
            select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None)))).scalars().all())
        credit_by_invoice: dict = defaultdict(Decimal)

        for cn, rows in sorted(apps.items()):
            present = [r["Invoice Number"].strip() in invs for r in rows]
            if not any(present):
                out_of_scope += 1
                continue
            if not all(present):
                problems.append(f"{cn} : appliqué en partie sur des factures absentes d'ERPCRM")
                continue
            if cn in invs:
                skipped += 1
                continue
            targets = [(invs[r["Invoice Number"].strip()], Decimal(r["Amount"]).quantize(C)) for r in rows]
            companies = {t.company_id for t, _ in targets}
            if len(companies) != 1:
                problems.append(f"{cn} : factures de plusieurs clients")
                continue
            cn_date = date.fromisoformat(rows[0]["Date"])
            total = sum((a for _, a in targets), Decimal("0.00"))
            first = targets[0][0]
            credit = Invoice(
                number=cn, company_id=first.company_id, status="envoyee", issue_date=cn_date, due_date=cn_date,
                notes=f"Avoir sur {'la facture' if len(targets) == 1 else 'les factures'} {', '.join(t.number for t, _ in targets)}.",
                apply_tps=any(t.tps_amount for t, _ in targets), apply_tvq=any(t.tvq_amount for t, _ in targets),
                tps_rate=first.tps_rate, tvq_rate=first.tvq_rate, is_recurring=False, credit_of_id=first.id, lines=[],
                site_label_snapshot=first.site_label_snapshot, site_address_snapshot=first.site_address_snapshot,
            )
            db.add(credit)
            await db.flush()
            lines = []
            if len(targets) == 1 and total == first.total:
                for l in first.lines:
                    lines.append(InvoiceLine(invoice_id=credit.id, catalogue_item_id=l.catalogue_item_id, description=l.description,
                                             qty=l.qty, unit_price=-l.unit_price, line_total=-l.line_total,
                                             sort_order=l.sort_order, is_taxable=l.is_taxable))
            else:
                taxed = [(t, a) for t, a in targets if t.tps_amount or t.tvq_amount]
                untaxed = [(t, a) for t, a in targets if not (t.tps_amount or t.tvq_amount)]
                if taxed and untaxed:
                    problems.append(f"{cn} : mélange de factures taxées et non taxées")
                taxed_total = sum((a for _, a in taxed), Decimal("0.00"))
                base = base_for(taxed_total, first.tps_rate, first.tvq_rate) if taxed else Decimal("0.00")
                if base is None:
                    problems.append(f"{cn} : aucune base hors taxes ne donne exactement {taxed_total} $")
                    continue
                left = base
                for n, (t, a) in enumerate(taxed):
                    b = left if n == len(taxed) - 1 else money(base * a / taxed_total)
                    left -= b
                    lines.append(InvoiceLine(invoice_id=credit.id, description=f"Crédit sur la facture {t.number}",
                                             qty=Decimal("1"), unit_price=-b, line_total=-b, sort_order=n, is_taxable=True))
                for n, (t, a) in enumerate(untaxed, start=len(taxed)):
                    lines.append(InvoiceLine(invoice_id=credit.id, description=f"Crédit sur la facture {t.number}",
                                             qty=Decimal("1"), unit_price=-a, line_total=-a, sort_order=n, is_taxable=False))
            credit.lines.extend(lines)
            _recalc(credit)
            if credit.total != -total:
                problems.append(f"{cn} : total ERPCRM {credit.total} ≠ -{total} (Zoho)")
            credit.status = "payee"
            for t, a in targets:
                db.add(CreditAllocation(credit_invoice_id=credit.id, invoice_id=t.id, amount=a, applied_at=cn_date))
                credit_by_invoice[t.id] += a
            created += 1

        # Encaissements « Historique Zoho » : retirer la part qui etait en realite des avoirs
        for inv_id, amt in credit_by_invoice.items():
            inv = next(i for i in invs.values() if i.id == inv_id)
            rows = (await db.execute(
                select(PaymentAllocation, ClientPayment).join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
                .where(PaymentAllocation.invoice_id == inv_id, ClientPayment.source == "zoho_import"))).all()
            if len(rows) != 1:
                problems.append(f"{inv.number} : {len(rows)} encaissement(s) Historique Zoho (1 attendu)")
                continue
            pa, cp = rows[0]
            if pa.amount_allocated < amt:
                problems.append(f"{inv.number} : encaissement Zoho {pa.amount_allocated} < avoirs {amt}")
                continue
            if cp.id in matched_payments:
                problems.append(f"{inv.number} : encaissement Zoho déjà rapproché à la banque")
                continue
            if pa.amount_allocated == amt:
                await db.delete(pa)
                await db.delete(cp)
                pay_deleted += 1
            else:
                pa.amount_allocated -= amt
                cp.amount -= amt
                pay_reduced += 1

        await db.flush()
        # Controle : chaque facture touchee reste entierement reglee (comme dans Zoho)
        from app.api.v1.endpoints.payments import settled_amounts
        settled = await settled_amounts(db, list(credit_by_invoice))
        for inv_id in credit_by_invoice:
            inv = next(i for i in invs.values() if i.id == inv_id)
            if settled.get(inv_id, 0) != inv.total and inv.status == "payee":
                problems.append(f"{inv.number} : réglé {settled.get(inv_id)} ≠ total {inv.total}")

        if problems or not apply:
            await db.rollback()
        else:
            await db.commit()

    print(f"{created} avoirs {'importés' if apply and not problems else 'prêts'} ({sum(credit_by_invoice.values())} $ sur "
          f"{len(credit_by_invoice)} factures), {skipped} déjà présents, {out_of_scope} hors périmètre (factures antérieures à ERPCRM)")
    print(f"Encaissements antérieurs (source zoho_import) : {pay_reduced} diminués, {pay_deleted} supprimés (entièrement des avoirs)")
    for p in problems:
        print("  PROBLÈME :", p)
    print("ÉCRIT" if apply and not problems else ("RIEN ÉCRIT (problèmes ci-dessus)" if problems else "ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)"))


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
