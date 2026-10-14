"""
Script ponctuel (2026-10-14, TASK-005.21) : importe l'historique des factures de l'ancien logiciel AVANT le 2024-09-22
(debut des exports CSV deja importes par import_zoho_invoices.py), a partir des PDF telecharges par Philippe
(Invoices*.zip), y compris les factures de QuickBooks reprises dans l'ancien logiciel (numeros sans « INV- »).
Demande de Philippe : « pour que les clients aient leur facture dans leur portail je les veux ... avec leur bon numero ».

Lecture : zoho_invoice_pdf.py (local, sans IA, chaque facture controlee au cent).

Regles (memes que import_zoho_invoices.py, sauf ce que le PDF ne donne pas) :
- Numero, date, echeance, client, lignes (nom + description, quantite, taux, montant), sous-total, TPS, TVQ, total
  exactement comme le PDF. « ajustement de taxes » (+/- 0,01 $, 80 factures de 2020-2021) : ajoute a la TVQ pour que
  sous-total + TPS + TVQ = total. « nº 1359 » -> « 1359 » comme les autres numeros QuickBooks.
- Ligne taxable ou non (le PDF ne le dit pas) : toutes taxables si la TPS = 5 % du sous-total ; sinon le seul
  ensemble de lignes dont 5 % / 9,975 % redonnent exactement la TPS et la TVQ (ex. frais de retard non taxables) ;
  ambigu ou introuvable -> arret.
- Montant regle = Total - Solde -> UN encaissement confirme « Paiement anterieur » (source zoho_import) date du jour
  de la facture (le PDF n'a pas la date du paiement) ; la part reglee par avoir en est retiree ensuite par
  import_zoho_credits.py (a relancer apres, comme pour l'import des CSV).
- Clients : table CUSTOMER_MAP de import_zoho_invoices.py + correspondances deja etablies par les numeros importes +
  EXTRA_MAP (Philippe, 2026-10-14). Client inconnu -> nouvelle compagnie inactive (ancien client), numero de compte
  txxxx attribue, adresse de facturation du PDF si lisible.
- Ignorees (Philippe, 2026-10-14) : « Simple Test » (test), INV-000787 (frais de retard D'Astous, efface),
  HOLD (en attente de sa reponse). HRH INV-000003 et J. Lavoie INV-000675 : jamais envoyees ni declarees ->
  brouillons a leur vraie date (un brouillon n'entre dans aucune declaration de taxes). Physotech INV-000109 et INV-111258 : « a regler en troc ».
- Numero deja present : doit etre la meme facture (client, date, total), sinon arret. Tout ou rien.

Usage: venv/bin/python3 import_zoho_history_pdf.py [--apply]
"""
import asyncio
import glob
import itertools
import os
import re
import sys
import tempfile
import zipfile
from collections import Counter
from concurrent.futures import ProcessPoolExecutor
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core import account_numbers
from app.models.company import Company
from app.models.entity import Entity, EntityType
from app.models.address import Address, AddressType
from app.models.entity_log import EntityLog
from app.models.invoice import Invoice, InvoiceLine
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.user import User
from import_zoho_invoices import CUSTOMER_MAP, RENAME

LOG_USER_EMAIL = "philippe@simpleip.tel"   # courriel de connexion change depuis le 1er import
from zoho_invoice_pdf import parse

ZIPS = "/home/simpleip/Simple_IP/factures_zoho/Invoices*.zip"
CSV_START = "2024-09-22"          # avant : absent des exports CSV
EXTRA_MAP = {                     # Philippe, 2026-10-14
    "ACVRQ Nesly Dieudonné": "ACVRQ",
    "Vendu RÉSIDENCE LA ROSIÈRE INC. Fermé": "Résidence La Rosière",
}
SKIP_CLIENTS = {"Simple Test"}
SKIP = {"INV-000787": "frais de retard D'Astous -- efface (Philippe)"}
HOLD: dict = {}
# Jamais envoyees ni declarees (Philippe, 2026-10-14) : brouillons a leur vraie date -- hors declarations de taxes
DRAFTS = {"INV-000003": "HRH : jamais envoyee, Philippe appelle le client",
          "INV-000675": "J. Lavoie : jamais envoyee, Philippe la lui donne"}
HOLD_CLIENTS = {"Les Systèmes D'écran Strong-MDI": "meme client que la fiche STRONG (t1043) ? a confirmer"}
BARTER = {"INV-000109", "INV-111258"}
TAG = "import de l'historique de facturation (PDF)"
TPS, TVQ = Decimal("0.05"), Decimal("0.09975")


def m(v: Decimal) -> Decimal:
    return v.quantize(Decimal("0.01"), ROUND_HALF_UP)


def taxable_flags(x) -> list[bool]:
    amounts = [Decimal(i["amount"]) for i in x["items"]]
    tps, tvq = Decimal(x["tps"] or 0), Decimal(x["tvq"] or 0)
    if tps == 0 and tvq == 0:
        return [False] * len(amounts)
    if m(sum(amounts) * TPS) == tps:
        return [True] * len(amounts)
    for k in range(1, len(amounts)):                 # le moins de lignes non taxables possible
        hits = [ex for ex in itertools.combinations(range(len(amounts)), k)
                if m(sum(a for n, a in enumerate(amounts) if n not in ex) * TPS) == tps
                and abs(m(sum(a for n, a in enumerate(amounts) if n not in ex) * TVQ) - tvq) <= Decimal("0.01")]
        if len(hits) == 1:
            return [n not in hits[0] for n in range(len(amounts))]
        if hits:
            # plusieurs ensembles possibles : acceptable seulement s'ils excluent des lignes identiques (meme nom, meme montant)
            keys = {tuple(sorted((x["items"][n]["name"], amounts[n]) for n in ex)) for ex in hits}
            if len(keys) == 1:
                return [n not in hits[0] for n in range(len(amounts))]
            raise ValueError(f"{x['number']} : lignes taxables ambigues")
    raise ValueError(f"{x['number']} : aucune combinaison de lignes taxables ne redonne la TPS {tps}")


def number_of(x) -> str:
    return re.sub(r"^nº\s*", "", x["number"].strip())


def description(i) -> str:
    parts = []
    if i["header"]:
        parts.append(" ".join(i["header"]))
    head = i["name"] or (i["desc"][0] if i["desc"] else "Article")
    rest = i["desc"] if i["name"] else i["desc"][1:]
    parts.append(head + (" — " + "\n".join(rest) if rest else ""))
    text = "\n".join(parts)
    return text if len(text) <= 500 else text[:499] + "…"   # colonne de 500 (3 lignes de 2021-2022 coupees)


def pdf_address(x):
    """[rue..., ville, « H2G2H3 Quebec », Canada] -> adresse, sinon None."""
    a = [l for l in x.get("address") or [] if l.strip() and l.strip().lower() != "canada"]
    for n, l in enumerate(a):
        mm = re.match(r"^([A-Za-z]\d[A-Za-z])\s?(\d[A-Za-z]\d)\s+(qu[ée]bec|qc)$", l.strip(), re.I)
        if mm and n >= 2:
            return {"street_1": a[0], "street_2": a[1] if n == 3 else None, "city": a[n - 1],
                    "province": "QC", "postal_code": f"{mm.group(1)} {mm.group(2)}".upper(), "country": "CA"}
    return None


def read_all():
    tmp = tempfile.mkdtemp(prefix="zoho_pdf_")
    for z in sorted(glob.glob(ZIPS)):
        zipfile.ZipFile(z).extractall(tmp)
    files = sorted(glob.glob(os.path.join(tmp, "*.pdf")))
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(parse, files, chunksize=20))
    bad = [r for r in res if r["errors"]]
    if bad:
        raise SystemExit(f"{len(bad)} PDF illisibles : " + "; ".join(f"{r['file']} {r['errors']}" for r in bad[:10]))
    return res


async def main(apply: bool):
    pdfs = read_all()
    today = date.today()
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == LOG_USER_EMAIL))).scalar_one()
        companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
        by_id = {c.id: c for c in companies.values()}
        existing = {i.number: i for i in (await db.execute(select(Invoice))).scalars().all()}

        def log(entity_id, action, text):
            db.add(EntityLog(entity_id=entity_id, user_id=user.id, action=action, description=text))

        # correspondances deja etablies par les factures importees des CSV (meme numero -> meme client)
        learned = {}
        for x in pdfs:
            e = existing.get(number_of(x))
            if e:
                learned.setdefault(x["client"], by_id[e.company_id].name)

        todo, skipped, held, mismatches = [], Counter(), [], []
        for x in sorted(pdfs, key=lambda x: (x["date"], number_of(x))):
            num = number_of(x)
            if num in existing:
                e = existing[num]
                if x["date"] < CSV_START and not (str(e.issue_date) == x["date"] and e.total == Decimal(x["total"])):
                    mismatches.append(f"{num} : ERPCRM {e.issue_date} {e.total} ≠ PDF {x['date']} {x['total']}")
                skipped["deja dans ERPCRM"] += 1
                continue
            if x["date"] >= CSV_START:
                skipped["periode des CSV (brouillons non importes)"] += 1
                continue
            if x["client"] in SKIP_CLIENTS or num in SKIP:
                skipped["ignorees (Philippe)"] += 1
                continue
            if num in HOLD or x["client"] in HOLD_CLIENTS:
                held.append(f"{num} {x['date']} {x['client']} {x['total']} $ -- {HOLD.get(num) or HOLD_CLIENTS[x['client']]}")
                continue
            todo.append(x)
        if mismatches:
            raise SystemExit("ARRET -- meme numero, facture differente :\n" + "\n".join(mismatches))
        nums = Counter(number_of(x) for x in todo)
        dup = [n for n, c in nums.items() if c > 1]
        if dup:
            raise SystemExit(f"ARRET -- numeros en double dans les PDF : {dup}")

        # compagnies
        target, created = {}, []
        for cust in sorted({x["client"] for x in todo}):
            # deja etabli par les factures en base d'abord (fiches renommees depuis, ex. Patio Desing -> Construction Nationale)
            name = EXTRA_MAP.get(cust) or learned.get(cust) or CUSTOMER_MAP.get(cust) or (cust if cust in companies else None)
            if name in RENAME and name not in companies:
                name = RENAME[name][0]
            if name and name in companies:
                target[cust] = companies[name]
                continue
            name = name or cust
            if name in companies:
                target[cust] = companies[name]
                continue
            entity = Entity(entity_type=EntityType.company)
            db.add(entity)
            await db.flush()
            comp = Company(id=entity.id, name=name, is_active=False, account_number=await account_numbers.assign(db),
                           notes_internal="Ancien client (historique de facturation 2020-2024).")
            db.add(comp)
            await db.flush()
            log(comp.id, "created", f"Compagnie « {name} » créée, inactive ({TAG})")
            addr = pdf_address(next(x for x in sorted(todo, key=lambda x: x["date"], reverse=True) if x["client"] == cust))
            if addr:
                db.add(Address(entity_id=comp.id, address_type=AddressType.billing, is_primary=True, **addr))
            companies[name] = comp
            target[cust] = comp
            created.append(f"{name} ({comp.account_number}){'' if addr else ' -- sans adresse'}")

        # factures
        stats = Counter()
        for x in todo:
            num = number_of(x)
            comp = target[x["client"]]
            flags = taxable_flags(x)
            subtotal, total = Decimal(x["subtotal"]), Decimal(x["total"])
            tps = Decimal(x["tps"] or 0)
            tvq = Decimal(x["tvq"] or 0) + sum((Decimal(v) for _k, v in x["other_totals"]), Decimal(0))
            assert subtotal + tps + tvq == total, num
            settled = total - Decimal(x["balance"])
            issue = date.fromisoformat(x["date"])
            due = date.fromisoformat(x["due"]) if x["due"] else issue
            if num in DRAFTS:
                status = "brouillon"
            elif settled >= total:
                status = "payee"
            elif settled > 0:
                status = "partiellement_payee"
            else:
                status = "en_retard" if due < today else "envoyee"
            inv = Invoice(number=num, company_id=comp.id, status=status, issue_date=issue, due_date=due,
                          notes=(f"Objet : {x['subject']}" if x["subject"] else None),
                          apply_tps=tps != 0, apply_tvq=tvq != 0, subtotal=subtotal, tps_amount=tps, tvq_amount=tvq,
                          total=total, barter_settlement=num in BARTER)
            db.add(inv)
            await db.flush()
            for n, (i, tax) in enumerate(zip(x["items"], flags)):
                db.add(InvoiceLine(invoice_id=inv.id, description=description(i), qty=Decimal(i["qty"]),
                                   unit_price=Decimal(i["rate"]), line_total=Decimal(i["amount"]), sort_order=n,
                                   is_taxable=tax))
            if settled > 0 and status != "brouillon":
                cp = ClientPayment(company_id=comp.id, status="confirmed", source="zoho_import", method_code="zoho",
                                   method_name="Paiement antérieur", amount=settled, received_at=issue,
                                   notes=f"Paiement antérieur de la facture {num}.")
                db.add(cp)
                await db.flush()
                db.add(PaymentAllocation(payment_id=cp.id, invoice_id=inv.id, amount_allocated=settled))
                stats["encaissements"] += 1
                stats["regle $"] += settled
            stats[status] += 1
            stats["factures"] += 1
            stats["total $"] += total
            stats["QuickBooks" if not num.startswith("INV-") else "INV-"] += 1
            if not all(flags):
                stats["avec lignes non taxables"] += 1
        await db.flush()

        print("Ignorees :", dict(skipped))
        print(f"En attente ({len(held)}) :")
        for h in held:
            print("  ", h)
        print(f"Compagnies creees ({len(created)}) :")
        for c in created:
            print("  ", c)
        print("Factures :", {k: (str(v) if isinstance(v, Decimal) else v) for k, v in stats.items()})
        print("Dates :", todo[0]["date"], "->", todo[-1]["date"])
        if apply:
            await db.commit()
            print("APPLIQUE")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
