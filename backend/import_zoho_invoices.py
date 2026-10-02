"""
Script ponctuel (2026-10-01, TASK-042 Banque) : importe les factures exportees de
Zoho Books (CSV « Factures », une ligne par article) dans ERPCRM, et complete les
fiches compagnies avec l'adresse de facturation, le telephone et le courriel Zoho.

Correspondance client Zoho -> compagnie ERPCRM : table CUSTOMER_MAP ci-dessous,
validee ligne par ligne avec Philippe le 2026-10-01 (aucune correspondance devinee
a l'execution). Un client absent de la table est cree comme nouvelle compagnie.

Regles :
- Fiches existantes : on ne remplit que ce qui est vide, rien n'est ecrase.
  Simple IP inc. n'est jamais modifiee (seules ses factures sont importees).
- Facture deja presente (meme numero) : ignoree -> le script peut etre relance.
- Statut : Draft -> brouillon ; sinon calcule comme le moteur de paiements
  (TASK-005.4) : paye = Total - Balance ; tout paye -> payee, une partie ->
  partiellement_payee, rien -> en_retard si echue, sinon envoyee.
- Le montant deja paye selon Zoho devient UN encaissement confirme par facture
  (source « zoho_import ») : le detail des paiements Zoho n'est pas dans l'export.
- Oxygene = succursale de Maison Le Passeur (dit par Philippe) : factures sur
  Maison Le Passeur, « Oxygene » + adresse dans les champs succursale de la facture
  (une vraie succursale ERPCRM exige un tenant SIPV, que Le Passeur n'a pas).
- Tout ou rien : une seule transaction ; --apply pour ecrire, sinon essai a blanc.

Usage: venv/bin/python3 import_zoho_invoices.py [--apply]
"""
import asyncio
import csv
import glob
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401  (enregistre tous les modeles)
from app.models.company import Company
from app.models.entity import Entity, EntityType
from app.models.address import Address, AddressType
from app.models.communication import CommunicationChannel, ChannelType
from app.models.entity_log import EntityLog
from app.models.invoice import Invoice, InvoiceLine
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.user import User

ZOHO_DIR = "/home/simpleip/Simple_IP/factures_zoho"
LOG_USER_EMAIL = "philippe@simpleip.ca"
REPORT = "/home/simpleip/Simple_IP/factures_zoho/import_report.json"

# Client Zoho -> compagnie ERPCRM existante (nom exact en base). Valide avec Philippe.
CUSTOMER_MAP = {
    "M.C. CRYSTAL INC.": "Mc Crystal",
    "Maison Le Passeur": "Maison Le Passeur",
    "MRST": "MRST",
    "Talentech": "Talentech",
    "Hamak": "Hamak",
    "Jardin-Idéal": "Jardin-Ideal",
    "PHYSOTECH INC.": "Physotech",
    "Waterco": "Waterco",
    "J. LAVOIE EQUIPEMENTS LOURDS INC.": "J. LAVOIE EQUIPEMENTS LOURDS INC.",
    "SST Construction (2016) Inc.": "SST CONSTRUCTION 2016 INC",
    "Les Entreprises CNJ": "Les Entreprises CNJ",
    "Audacie Inc.": "Audacie",
    "Simple IP inc.": "Simple IP inc.",
    "D'Astous Auto": "D Astous Auto",
    "CYCLE VERT RECYCLE INC.": "Cycle Vert Recycle",
    "Remorques 125": "Remorque 125",
    "PISCINES ET SPAS POSEIDON INC.": "Piscine et Spa Paseidon",
    "Kiko Mufflers": "KIKO",
    "GARAGE DU COIN MERCIER INC.": "Garage Du Coin",
    "ABC GESTION PARASITAIRE JEAN-TALON": "ABC Gestion parasitaire",
    "PAD PERIPHERAL ADVANCED DESIGN INC.": "PAD",
    "LES ASSOCIÉS BÉNÉVOLES QUALIFIÉS AU SERVICE DES JEUNES A.B.Q.S.J. INC.": "ABQSJ",
    # Probables confirmees par Philippe
    "HOULE GENDRON, AVOCATS": "Houle Avocat",
    "LS Services Comptables": "Ls Comptable",
    "Centre de santé cardiovasculaire inc.": "Centre Cardio",
    "Rubi Group": "Rubi Canada",
    # Patio Desing a change de nom : la fiche est renommee Construction Nationale
    "Construction Nationale": "Patio Desing",
    # Succursale de Maison Le Passeur
    "Oxygene": "Maison Le Passeur",
}
RENAME = {"Patio Desing": ("Construction Nationale", "Ancien nom : Patio Design (encore utilisé par la banque, ex. « PATIO DESIGN MONTREA »).")}
BRANCH_OF = {"Oxygene": "Maison Le Passeur"}
NEVER_TOUCH = {"Simple IP inc."}

ZOHO_TAG = "import de l'historique de facturation"   # journal seulement ; rien de visible au client (2026-10-02)


def dec(v) -> Decimal:
    return Decimal(str(v or "0")).quantize(Decimal("0.01"))


def province(v: str) -> str:
    n = (v or "").strip().lower().replace("é", "e")
    if n in ("quebec", "qebec", "qc", ""):
        return "QC"
    return v.strip()[:2].upper()


def postal(v: str) -> str:
    s = re.sub(r"\s+", "", (v or "").upper())
    return f"{s[:3]} {s[3:]}" if re.fullmatch(r"[A-Z]\d[A-Z]\d[A-Z]\d", s) else (v or "").strip().upper()


def read_zoho():
    invoices = defaultdict(list)
    for f in sorted(glob.glob(f"{ZOHO_DIR}/*.csv")):
        for r in csv.DictReader(open(f, encoding="utf-8-sig")):
            invoices[r["Invoice ID"]].append(r)
    return invoices


def customer_info(invoices):
    """Coordonnees de la facture la plus recente de chaque client."""
    latest = {}
    for rows in invoices.values():
        r = rows[0]
        c = r["Customer Name"]
        if c not in latest or r["Invoice Date"] >= latest[c]["Invoice Date"]:
            latest[c] = r
    out = {}
    for c, r in latest.items():
        street = (r["Billing Address"] or "").strip()
        city = (r["Billing City"] or "").strip()
        code = postal(r["Billing Code"])
        out[c] = {
            "address": {
                "street_1": street, "street_2": (r["Billing Street2"] or "").strip() or None,
                "city": city, "province": province(r["Billing State"]), "postal_code": code,
                "country": "CA",
            } if street and city and code else None,
            "phone": (r["Billing Phone"] or r["Primary Contact Phone"] or "").strip() or None,
            "mobile": (r["Primary Contact Mobile"] or "").strip() or None,
            "email": (r["Primary Contact EmailID"] or "").strip() or None,
        }
    return out


def fmt_address(a):
    return ", ".join(x for x in [a["street_1"], a["street_2"], a["city"], a["province"], a["postal_code"]] if x) if a else None


async def main(apply: bool):
    invoices = read_zoho()
    info = customer_info(invoices)
    today = date.today()
    report = {"apply": apply, "companies_created": [], "companies_renamed": [], "companies_filled": [],
              "invoices_created": 0, "invoices_skipped_existing": 0, "payments_created": 0,
              "by_status": defaultdict(int), "created_company_ids": [], "created_invoice_ids": [], "created_payment_ids": []}

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == LOG_USER_EMAIL))).scalar_one()
        companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}

        def log(entity_id, action, description):
            db.add(EntityLog(entity_id=entity_id, user_id=user.id, action=action, description=description))

        # ── Compagnies ────────────────────────────────────────────────────
        target = {}   # client Zoho -> Company
        for cust in sorted({rows[0]["Customer Name"] for rows in invoices.values()}):
            name = CUSTOMER_MAP.get(cust)
            if name is not None:
                if name not in companies:
                    raise SystemExit(f"Compagnie introuvable en base : {name!r} (client Zoho {cust!r})")
                target[cust] = companies[name]
                continue
            entity = Entity(entity_type=EntityType.company)
            db.add(entity)
            await db.flush()
            comp = Company(id=entity.id, name=cust)
            db.add(comp)
            await db.flush()
            log(entity.id, "created", f"Compagnie « {cust} » créée ({ZOHO_TAG})")
            companies[cust] = comp
            target[cust] = comp
            report["companies_created"].append(cust)
            report["created_company_ids"].append(str(comp.id))

        for old, (new, note) in RENAME.items():
            comp = companies[old]
            comp.name = new
            comp.notes_internal = (comp.notes_internal + "\n" if comp.notes_internal else "") + note
            log(comp.id, "updated", f"Renommée « {old} » → « {new} » (changement de nom du client)")
            report["companies_renamed"].append(f"{old} -> {new}")

        # Coordonnees : seulement ce qui est vide ; jamais Simple IP ; succursale = note sur la maison mere
        for cust, comp in target.items():
            if comp.name in NEVER_TOUCH or cust in NEVER_TOUCH:
                continue
            i = info[cust]
            if cust in BRANCH_OF:
                addr = fmt_address(i["address"])
                note = f"Succursale Oxygene (factures Zoho « Oxygene ») : {addr or 'adresse inconnue'}" + (f" · {i['email']}" if i["email"] else "")
                if not (comp.notes_internal or "").count("Succursale Oxygene"):
                    comp.notes_internal = (comp.notes_internal + "\n" if comp.notes_internal else "") + note
                    report["companies_filled"].append(f"{comp.name} : note succursale Oxygene")
                continue
            existing_addr = (await db.execute(select(Address).where(Address.entity_id == comp.id))).scalars().all()
            existing_comm = (await db.execute(select(CommunicationChannel).where(CommunicationChannel.entity_id == comp.id))).scalars().all()
            filled = []
            if i["address"] and not existing_addr:
                db.add(Address(entity_id=comp.id, address_type=AddressType.billing, is_primary=True, **i["address"]))
                log(comp.id, "address_added", f"Adresse (billing) ajoutée ({ZOHO_TAG})")
                filled.append("adresse")
            have = {(c.channel_type, c.value.strip().lower()) for c in existing_comm}
            for ctype, val in ((ChannelType.phone, i["phone"]), (ChannelType.mobile, i["mobile"]), (ChannelType.email, i["email"])):
                if val and (ctype, val.lower()) not in have and not any(c.channel_type == ctype for c in existing_comm):
                    db.add(CommunicationChannel(entity_id=comp.id, channel_type=ctype, value=val, is_primary=True))
                    log(comp.id, "communication_added", f"Coordonnée {ctype.value} « {val} » ajoutée ({ZOHO_TAG})")
                    filled.append(ctype.value)
            if i["phone"] and not comp.office_phone:
                comp.office_phone = i["phone"]
            if filled:
                report["companies_filled"].append(f"{comp.name} : {', '.join(filled)}")

        # ── Factures ──────────────────────────────────────────────────────
        existing_numbers = set((await db.execute(select(Invoice.number))).scalars().all())
        for rows in sorted(invoices.values(), key=lambda rs: (rs[0]["Invoice Date"], rs[0]["Invoice Number"])):
            r = rows[0]
            number = r["Invoice Number"].strip()
            if number in existing_numbers:
                report["invoices_skipped_existing"] += 1
                continue
            cust = r["Customer Name"]
            comp = target[cust]
            subtotal, total, balance = dec(r["SubTotal"]), dec(r["Total"]), dec(r["Balance"])
            tax_total = total - subtotal
            taxable = sum((dec(x["Item Total"]) for x in rows if x["Item Tax"]), Decimal("0"))
            tps = (taxable * Decimal("0.05")).quantize(Decimal("0.01")) if tax_total > 0 else Decimal("0.00")
            tvq = tax_total - tps if tax_total > 0 else Decimal("0.00")
            issue = date.fromisoformat(r["Invoice Date"])
            due = date.fromisoformat(r["Due Date"]) if r["Due Date"] else issue
            paid = total - balance

            if r["Invoice Status"] == "Draft":
                status = "brouillon"
            elif paid >= total:
                status = "payee"
            elif paid > 0:
                status = "partiellement_payee"
            else:
                status = "en_retard" if due < today else "envoyee"

            inv = Invoice(
                number=number, company_id=comp.id, status=status, issue_date=issue, due_date=due,
                notes=None,   # la note s'imprime sur le PDF client : rien sur l'origine de l'import
                apply_tps=tax_total > 0, apply_tvq=tax_total > 0,
                subtotal=subtotal, tps_amount=tps, tvq_amount=tvq, total=total,
            )
            if cust in BRANCH_OF:
                inv.site_label_snapshot = cust
                inv.site_address_snapshot = fmt_address(info[cust]["address"])
            db.add(inv)
            await db.flush()
            for n, x in enumerate(rows):
                desc = (x["Item Name"] or "").strip()
                if (x["Item Desc"] or "").strip():
                    desc = f"{desc} — {x['Item Desc'].strip()}" if desc else x["Item Desc"].strip()
                db.add(InvoiceLine(
                    invoice_id=inv.id, description=(desc or "Article")[:500],
                    qty=Decimal(str(x["Quantity"] or "1")), unit_price=dec(x["Item Price"]),
                    line_total=dec(x["Item Total"]), sort_order=n,
                ))
            report["invoices_created"] += 1
            report["by_status"][status] += 1
            report["created_invoice_ids"].append(str(inv.id))

            if status != "brouillon" and paid > 0:
                received = date.fromisoformat(r["Last Payment Date"]) if r["Last Payment Date"] else issue
                cp = ClientPayment(
                    company_id=comp.id, status="confirmed", source="zoho_import",
                    method_code="zoho", method_name="Paiement antérieur", amount=paid,
                    received_at=received, notes=f"Paiement antérieur de la facture {number}.",
                )
                db.add(cp)
                await db.flush()
                db.add(PaymentAllocation(payment_id=cp.id, invoice_id=inv.id, amount_allocated=paid))
                report["payments_created"] += 1
                report["created_payment_ids"].append(str(cp.id))

        if apply:
            await db.commit()
        else:
            await db.rollback()

    report["by_status"] = dict(report["by_status"])
    if apply:
        with open(REPORT, "w") as fh:
            json.dump({**report, "written_at": datetime.now(timezone.utc).isoformat()}, fh, ensure_ascii=False, indent=1)
    short = {k: v for k, v in report.items() if not k.startswith("created_") or k == "companies_created"}
    print(json.dumps(short, ensure_ascii=False, indent=1))
    print("ECRIT" if apply else "ESSAI A BLANC -- rien n'a ete ecrit (--apply pour ecrire)")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
