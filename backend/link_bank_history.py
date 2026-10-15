"""
Script ponctuel (2026-10-15, TASK-042.7) : relie les depots BNC historiques aux « Paiement anterieur » importes.
Demande de Philippe : « commence a relier les paiements » ; ne pas recreer les paiements que l'ancien logiciel avait
en double.

Sources (la BNC est la seule verite des montants) :
- depots BNC non classes (releves PDF 2019-2025 + CSV depuis 2025-10) ;
- client du depot : l'historique bancaire de l'ancien logiciel (« Paiement de client », meme montant, date proche),
  sinon les regles beneficiaire -> compagnie deja en place ;
- encaissements « Paiement anterieur » (source zoho_import) pas encore relies, un par facture.

Regle d'association (par client, depots traites dans l'ordre chronologique) :
1. un paiement du meme montant date a 7 jours ou moins du depot (date reelle connue pour les factures 2024-2026) ;
2. sinon le paiement du meme montant dont la facture est datee JUSTE AVANT le depot (0 a 400 jours ; une carte paie le jour
   meme), puis le groupe de 2 a 4 factures le plus recent (parmi les 12 plus proches) ; sinon les plus vieilles factures
   (client en retard qui rattrape). Regle de Philippe du 2026-10-15 (avant : plus vieilles d'abord).
Rien d'approximatif : un montant doit tomber au cent. Ce qui ne tombe pas reste a Philippe (rapport).
Un depot qui paie plusieurs factures : les encaissements sont fusionnes en UN (un depot = un paiement reparti sur
ses factures), date du depot. Un depot qui couvre plusieurs CLIENTS (lot de cartes) n'est pas relie (rapport).

Sortie : rapport (categories, exemples) ; --apply ecrit (tout ou rien).
Usage: venv/bin/python3 link_bank_history.py [--apply]
"""
import asyncio
import csv
import itertools
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.bank_account import BankTransaction, BankPayeeRule
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice
from app.core.bank_matching import payee_key
from import_zoho_invoices import CUSTOMER_MAP, RENAME

HISTORY = "/home/simpleip/Simple_IP/Zoho_Books_historique_2020-2026.csv"
INVOICES_JSON = "/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/invoices.json"
REPORT = "/home/simpleip/Simple_IP/liaison_banque_rapport.json"
EXTRA = {"ACVRQ Nesly Dieudonné": "ACVRQ", "Vendu RÉSIDENCE LA ROSIÈRE INC. Fermé": "Résidence La Rosière",
         "Les Systèmes D'écran Strong-MDI": "STRONG"}     # Oxygene : compagnie a part dans ERPCRM (appris des factures)


def zoho_entries():
    out = []
    for r in csv.DictReader(open(HISTORY, encoding="utf-8-sig")):
        if r["Type_transaction"] != "Paiement de client" or not r["Depot_CAD"]:
            continue
        out.append({"id": r["ID_LIGNE"], "date": date.fromisoformat(r["Date"]), "amount": Decimal(r["Depot_CAD"]),
                    "client": r["Tiers_client_fournisseur"].removeprefix("Client: ").strip(), "used": False})
    return out


async def main(apply: bool):
    async with AsyncSessionLocal() as db:
        companies = {c.name: c for c in (await db.execute(select(Company))).scalars()}
        inv_rows = (await db.execute(select(Invoice.number, Invoice.company_id))).all()
        num2co = dict(inv_rows)
        # nom de client de l'ancien logiciel -> compagnie : appris des factures (meme numero), puis tables connues
        learned = {}
        for x in json.load(open(INVOICES_JSON)):
            n = re.sub(r"^nº\s*", "", x["number"])
            if n in num2co:
                learned.setdefault(x["client"], num2co[n])

        def company_of(name):
            if name in EXTRA and EXTRA[name] in companies:
                return companies[EXTRA[name]].id
            if name in learned:
                return learned[name]
            n = CUSTOMER_MAP.get(name, name)
            n = RENAME.get(n, (n,))[0] if n not in companies else n
            return companies[n].id if n in companies else None

        zoho = zoho_entries()
        unknown_names = Counter(z["client"] for z in zoho if company_of(z["client"]) is None)
        rules = {r.payee_key: r.company_id for r in (await db.execute(select(BankPayeeRule))).scalars() if r.company_id}

        txs = (await db.execute(select(BankTransaction).where(BankTransaction.status == "unclassified", BankTransaction.amount > 0)
                                .order_by(BankTransaction.posted_date, BankTransaction.amount))).scalars().all()
        linked_ids = set((await db.execute(select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None)))).scalars())
        # depots deja relies (passage precedent) : leur ligne d'historique est prise, sinon un autre depot du meme montant
        # pourrait la reprendre a la relance (Jardin-Ideal 261,22 $ du 2025-07-22, 2026-10-15)
        done = (await db.execute(select(BankTransaction).where(BankTransaction.amount > 0, BankTransaction.client_payment_id.is_not(None))
                                 .order_by(BankTransaction.posted_date))).scalars().all()
        for t in done:
            zs = [z for z in zoho if not z["used"] and z["amount"] == Decimal(t.amount) and -3 <= (z["date"] - t.posted_date).days <= 7
                  and company_of(z["client"]) == t.company_id]
            if zs:
                min(zs, key=lambda z: abs((z["date"] - t.posted_date).days))["used"] = True
        pays = (await db.execute(select(ClientPayment).options(selectinload(ClientPayment.allocations))
                                 .where(ClientPayment.source == "zoho_import", ClientPayment.status == "confirmed"))).scalars().all()
        inv_date = dict((await db.execute(select(Invoice.id, Invoice.issue_date))).all())
        inv_num = dict((await db.execute(select(Invoice.id, Invoice.number))).all())
        free = defaultdict(list)            # compagnie -> paiements non relies
        for p in pays:
            if p.id in linked_ids:
                continue
            idate = min((inv_date[a.invoice_id] for a in p.allocations), default=p.received_at)
            free[p.company_id].append({"p": p, "idate": idate, "amount": Decimal(p.amount)})
        for lst in free.values():
            lst.sort(key=lambda x: x["idate"])

        cats, examples, plan = Counter(), defaultdict(list), []
        names = companies_by_id(companies)

        def client_of(tx):
            """(compagnie, source) du depot, ou (None, raison)."""
            amt, d0 = Decimal(tx.amount), tx.posted_date
            zs = [z for z in zoho if not z["used"] and z["amount"] == amt and -3 <= (z["date"] - d0).days <= 7]
            clients = {company_of(z["client"]) for z in zs}
            group = None
            if not zs:                       # lot (cartes) : plusieurs paiements du meme jour qui font la somme
                same = [z for z in zoho if not z["used"] and -1 <= (z["date"] - d0).days <= 3 and z["amount"] < amt]
                for k in (2, 3, 4):
                    hits = [c for c in itertools.combinations(same, k) if sum(z["amount"] for z in c) == amt]
                    if len(hits) == 1:
                        group = list(hits[0])
                        break
                if group:
                    clients = {company_of(z["client"]) for z in group}
            rule_cid = tx.company_id or (rules.get(payee_key(tx.payee)) if tx.payee else None)

            def has_pay(c):
                return any(f["amount"] == amt and 0 <= (d0 - f["idate"]).days <= 400 for f in free[c])
            if len(clients) > 1:             # meme montant, meme jour, plusieurs clients : le beneficiaire ou le seul qui doit ce montant
                if rule_cid in clients:
                    clients = {rule_cid}
                else:
                    owing = {c for c in clients if c and has_pay(c)}
                    if len(owing) == 1:
                        clients = owing
            if len(clients) == 1 and None not in clients:
                return next(iter(clients)), "historique", (group or [z for z in zs if company_of(z["client"]) == next(iter(clients))][:1])
            if len(clients) > 1:
                return None, "plusieurs", group or zs
            if rule_cid:
                return rule_cid, "regle beneficiaire", []
            if not tx.payee:                 # depot sans nom (cheque, Interac) : un seul paiement de ce montant, tous clients
                owing = [c for c in free if has_pay(c)]
                if len(owing) == 1 and sum(1 for f in free[owing[0]] if f["amount"] == amt
                                           and 0 <= (d0 - f["idate"]).days <= 120) == 1:
                    return owing[0], "montant unique", []
            return None, "inconnu", []

        def find(tx, cid, dated):
            """dated=True : seulement les paiements dates a 7 jours du depot (date reelle connue, attribution de l'ancien
            logiciel), seuls ou en groupe ; dated=False : factures juste avant le depot, puis les plus vieilles."""
            amt, d0 = Decimal(tx.amount), tx.posted_date
            cand = [f for f in free[cid] if 0 <= (d0 - f["idate"]).days <= 400]
            if dated:                        # date reelle de l'ancien logiciel : facture datee jusqu'a 5 j apres acceptee
                near = [f for f in free[cid] if -5 <= (d0 - f["idate"]).days <= 400 and abs((f["p"].received_at - d0).days) <= 7]
                single = [f for f in near if f["amount"] == amt]
                if single:
                    return [min(single, key=lambda f: abs((f["p"].received_at - d0).days))], "meme montant, date du paiement"
                for k in (2, 3, 4):
                    for combo in itertools.combinations(near[:12], k):
                        if sum(f["amount"] for f in combo) == amt:
                            return list(combo), f"{k} factures, date du paiement"
                return None, None
            # 2026-10-15 (Philippe) : d'abord les factures datees juste avant le depot (91 % des paiements dates de
            # l'ancien logiciel arrivent dans les 40 jours, 47 % le jour meme), seule ou en groupe ; les plus vieilles
            # seulement ensuite (client en retard qui rattrape). Avant : plus vieilles d'abord -> Poseidon 1 302,22 $ du
            # 2021-11-05 (aout + septembre) non relie, aout et septembre pris par des depots de 2022.
            recent = sorted(cand, key=lambda f: f["idate"], reverse=True)
            same_amt = [f for f in recent if f["amount"] == amt]
            if same_amt:
                return [same_amt[0]], "meme montant, facture juste avant"
            for k in (2, 3, 4):
                hits = [c for c in itertools.combinations(recent[:12], k) if sum(f["amount"] for f in c) == amt]
                if hits:            # le groupe le plus recent : sa plus vieille facture la plus proche du depot
                    best = max(hits, key=lambda c: (min(f["idate"] for f in c), sum(f["idate"].toordinal() for f in c)))
                    return sorted(best, key=lambda f: f["idate"]), f"{k} factures juste avant"
            for k in (2, 3, 4):
                for combo in itertools.combinations(cand[:10], k):
                    if sum(f["amount"] for f in combo) == amt:
                        return list(combo), f"{k} plus vieilles factures"
            return None, None

        # en tours : un depot relie libere ses paiements, ce qui peut lever l'ambiguite d'un autre (meme montant) ;
        # on recommence avec ceux qui restent jusqu'a ce qu'un tour ne relie plus rien (avant : relancer --apply a la main)
        remaining, rounds = list(txs), 0
        while True:
            rounds += 1
            cats = Counter({k: v for k, v in cats.items() if k.startswith("relie")})
            examples = defaultdict(list)
            pending, unlinked = [], []
            n_before = len(plan)
            for tx in remaining:
                cid, src, zused = client_of(tx)
                if cid is None:
                    unlinked.append(tx)
                    if src == "plusieurs":
                        cats["plusieurs clients possibles / lot de cartes"] += 1
                        examples["plusieurs clients"].append(f"{tx.posted_date} {tx.amount} {tx.description} {tx.payee or ''} -> {[z['client'] for z in zused]}")
                    else:
                        cats["client inconnu"] += 1
                        examples["client inconnu"].append(f"{tx.posted_date} {tx.amount} {tx.description} {tx.payee or tx.reference or ''}")
                    continue
                for z in zused:
                    z["used"] = True
                pending.append((tx, cid, src, zused))
            for dated in (True, False):          # 1re passe : attribution datee ; 2e : factures juste avant, puis plus vieilles
                rest = []
                for tx, cid, src, zused in pending:
                    pick, how = find(tx, cid, dated)
                    if not pick:
                        rest.append((tx, cid, src, zused))
                        continue
                    for f in pick:
                        free[cid].remove(f)
                    cats[f"relie ({how})" + (" -- client par montant unique" if src == "montant unique" else "")] += 1
                    plan.append((tx, cid, [f["p"] for f in pick], src))
                pending = rest
            for tx, cid, src, zused in pending:
                unlinked.append(tx)
                for z in zused:              # pas relie : l'historique reste disponible au tour suivant
                    z["used"] = False
                cats["client connu, aucun paiement anterieur qui tombe juste"] += 1
                examples["aucun paiement"].append(f"{tx.posted_date} {tx.amount} {tx.description} {tx.payee or ''} -> {names.get(cid)}")
            if len(plan) == n_before:
                break
            remaining = sorted(unlinked, key=lambda t: (t.posted_date, t.amount))
        print("Tours :", rounds)

        # paiements anterieurs restes sans depot, sur la periode couverte par la BNC
        first_bank = date(2019, 10, 1)
        left = [f for lst in free.values() for f in lst if f["p"].received_at >= first_bank]
        by_co = Counter(names.get(f["p"].company_id) for f in left)
        print("Depots non classes :", len(txs))
        for k, v in cats.most_common():
            print(f"  {v:5d}  {k}")
        print("Clients de l'historique sans compagnie :", dict(unknown_names))
        print(f"Paiements anterieurs SANS depot BNC (depuis {first_bank}) : {len(left)}, {sum(f['amount'] for f in left)} $")
        print("  par client :", by_co.most_common(15))
        for k, v in examples.items():
            print(f"-- {k} ({len(v)}) :")
            for e in v[:12]:
                print("   ", e)

        json.dump({"linked": [{"date": str(tx.posted_date), "amount": str(tx.amount), "bank": f"{tx.description} {tx.payee or ''}".strip(),
                               "company": names.get(cid), "client_from": src,
                               "invoices": sorted(inv_num[a.invoice_id] for p in ps for a in p.allocations)}
                              for tx, cid, ps, src in plan],
                   "categories": dict(cats), "examples": {k: v for k, v in examples.items()},
                   "unlinked_payments": [{"company": names.get(f["p"].company_id), "amount": str(f["amount"]),
                                          "invoice_date": str(f["idate"]), "invoices": [inv_num[a.invoice_id] for a in f["p"].allocations]}
                                         for f in sorted(left, key=lambda f: f["idate"])]},
                  open(REPORT, "w"), ensure_ascii=False, indent=1)
        if apply:
            now = datetime.now().astimezone()
            for tx, cid, ps, src in plan:
                keep = ps[0]
                if len(ps) > 1:          # un depot = un paiement reparti sur ses factures
                    for other in ps[1:]:
                        # par la relation : un simple changement de payment_id laisse la repartition dans
                        # other.allocations, et la suppression de other l'emporte (cascade delete-orphan) --
                        # erreur du 2026-10-15, 110 repartitions recreees depuis la sauvegarde
                        for a in list(other.allocations):
                            other.allocations.remove(a)
                            keep.allocations.append(a)
                        keep.amount = Decimal(keep.amount) + Decimal(other.amount)
                        await db.flush()
                        await db.delete(other)
                    nums = sorted(inv_num[a.invoice_id] for p in ps for a in p.allocations)
                    keep.notes = f"Paiement antérieur des factures {', '.join(nums)}."
                keep.received_at = tx.posted_date
                tx.company_id, tx.company_source = cid, ("rule" if src == "regle beneficiaire" else tx.company_source or "manual")
                tx.client_payment_id, tx.status, tx.matched_at, tx.payment_created = keep.id, "matched", now, False
            await db.commit()
            print("APPLIQUE :", len(plan), "depots relies")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")



def companies_by_id(companies):
    return {c.id: n for n, c in companies.items()}


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
