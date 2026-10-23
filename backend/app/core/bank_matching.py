"""Attribution des transactions bancaires aux paiements et factures (TASK-042, 3 modes).

Mode 1 : suggestions automatiques pour une transaction (paiement deja enregistre a lier,
         facture ouverte du meme montant, combinaison de factures d'une compagnie).
Mode 2 : choix manuel d'une compagnie puis de ses factures (endpoint dans bank.py).
Mode 3 : regle « beneficiaire -> compagnie » (BankPayeeRule), appliquee aux lignes non
         classees et a chaque import ; elle PROPOSE (onglet « Reconnu »), ne confirme jamais.

Aucune ecriture ici sauf apply_rules().
"""
import itertools
import re
import unicodedata
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank_account import BankTransaction, BankPayeeRule
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice

OPEN_STATUSES = ("envoyee", "en_retard", "partiellement_payee")
_STOP = {"inc", "ltee", "ltd", "enr", "senc", "senccrl", "corp", "cie", "les", "le", "la", "de", "du", "des", "et", "the"}


def payee_key(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _tokens(s: str | None) -> set[str]:
    return {t for t in payee_key(s).split() if len(t) > 1 and t not in _STOP}


def name_similarity(payee: str | None, company: str | None) -> float:
    """0..1 : part des mots significatifs du nom de compagnie retrouves dans le beneficiaire
    (prefixes acceptes : « PATIO DESIGN MONTREA » ~ « Patio Desing » via les 4 premieres lettres)."""
    a, b = _tokens(payee), _tokens(company)
    if not a or not b:
        return 0.0
    hit = sum(1 for t in b if any(x == t or (len(t) >= 4 and len(x) >= 4 and x[:4] == t[:4]) for x in a))
    return hit / len(b)


def guess_method(description: str | None) -> str:
    d = payee_key(description)
    if "interac" in d:
        return "interac"
    if "elavon" in d:
        return "elavon"
    if "cheque" in d:
        return "cheque"
    return "virement"


async def invoice_balances(db: AsyncSession, invoice_ids: list) -> dict:
    """Montant regle (paiements confirmes + avoirs appliques) -- meme source que le statut des factures."""
    from app.api.v1.endpoints.payments import settled_amounts
    return await settled_amounts(db, invoice_ids)


def invoice_dict(inv: Invoice, paid: Decimal, company_name: str) -> dict:
    return {
        "id": str(inv.id), "number": inv.number, "company_id": str(inv.company_id), "company_name": company_name,
        "status": inv.status, "issue_date": inv.issue_date, "due_date": inv.due_date,
        "total": float(inv.total), "paid": float(paid), "balance": float(inv.total - paid),
        "site_label": inv.site_label_snapshot, "barter_settlement": inv.barter_settlement,
    }


async def linked_payment_ids(db: AsyncSession) -> set:
    return set((await db.execute(
        select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None))
    )).scalars().all())


async def payment_dict(db: AsyncSession, cp: ClientPayment, company_name: str) -> dict:
    rows = (await db.execute(
        select(Invoice.number, Invoice.issue_date).join(PaymentAllocation, PaymentAllocation.invoice_id == Invoice.id)
        .where(PaymentAllocation.payment_id == cp.id).order_by(Invoice.number)
    )).all()
    nums = [n for n, _ in rows]
    return {
        "id": str(cp.id), "company_id": str(cp.company_id), "company_name": company_name,
        "amount": float(cp.amount), "status": cp.status, "source": cp.source, "method_name": cp.method_name,
        "reference": cp.reference, "received_at": cp.received_at, "invoice_numbers": nums,
        "invoice_date": min((d for _, d in rows), default=None),   # plus vieille facture couverte
    }


async def suggestions(db: AsyncSession, tx: BankTransaction, limit: int = 8) -> dict:
    """Mode 1. Depots seulement. Trois familles, du plus sur au moins sur :
    - payments : encaissement deja enregistre, non lie a la banque, du meme montant
      (paiement declare au portail en attente, historique Zoho) -> le lier ;
    - invoices : facture ouverte, classee par score (montant exact, compagnie, nom, date) ;
    - combos  : plusieurs factures ouvertes d'une meme compagnie dont les soldes font le montant."""
    out = {"payments": [], "invoices": [], "combos": []}
    if tx.amount <= 0:
        return out
    amount = Decimal(tx.amount)
    names = dict((await db.execute(select(Company.id, Company.name))).all())
    # TASK-002.4 : la maison mere peut payer pour ses succursales -- leurs factures comptent comme les siennes, et le nom
    # d'une maison mere dans le depot designe aussi ses succursales
    parents = dict((await db.execute(select(Company.id, Company.parent_company_id))).all())
    def chain(cid):
        out, seen = [cid], {cid}
        while parents.get(out[-1]) and parents[out[-1]] not in seen:
            out.append(parents[out[-1]]); seen.add(out[-1])
        return out
    family: set = set()
    if tx.company_id:
        family = {c for c in names if tx.company_id in chain(c)}
    def name_score(text, cid):
        return max(name_similarity(text, names.get(c)) for c in chain(cid))

    # Paiements existants a lier
    linked = await linked_payment_ids(db)
    cps = (await db.execute(
        select(ClientPayment).where(ClientPayment.amount == amount, ClientPayment.status.in_(["confirmed", "pending"]),
                                    ClientPayment.method_code != "troc")   # un paiement par echange n'entre jamais a la banque
    )).scalars().all()
    scored = []
    for cp in cps:
        if cp.id in linked:
            continue
        days = abs((cp.received_at - tx.posted_date).days) if cp.received_at else 0
        if cp.received_at and days > 45:
            continue
        s = 50 - days + (40 if tx.company_id and cp.company_id in family else 0) \
            + 30 * name_score(tx.payee, cp.company_id)
        scored.append((s, cp))
    for s, cp in sorted(scored, key=lambda x: -x[0])[:5]:
        d = await payment_dict(db, cp, names.get(cp.company_id, ""))
        d["score"] = round(s)
        d["pct"] = max(5, min(100, round(s / 1.2)))     # 120 = meme montant, meme jour, meme client, meme nom
        out["payments"].append(d)

    # Factures ouvertes
    invs = (await db.execute(
        select(Invoice).where(
            Invoice.status.in_(OPEN_STATUSES),
            Invoice.issue_date <= tx.posted_date + timedelta(days=10),
            Invoice.issue_date >= tx.posted_date - timedelta(days=400),
        )
    )).scalars().all()
    paid = await invoice_balances(db, [i.id for i in invs])
    cands = []
    for inv in invs:
        bal = inv.total - (paid.get(inv.id) or Decimal("0"))
        if bal <= 0:
            continue
        score = 0.0
        if bal == amount:
            score += 60
        if tx.company_id and inv.company_id in family:
            score += 40
        score += 30 * name_score(tx.payee or tx.description, inv.company_id)
        # Delai habituel (Philippe, 2026-10-06) : le client paie 1 a 30 jours apres la facture,
        # parfois plus tard s'il est en retard -- indice de classement, jamais une association seule
        age = (tx.posted_date - inv.issue_date).days
        if 1 <= age <= 30:
            score += 15
        elif 0 <= age <= 120:
            score += 8
        elif -10 <= age < 0:
            score += 2
        # 2026-10-08 (Philippe) : une facture deja payee en partie n'est plus « la plus vieille » -- les differences de
        # paiement restent sur leur facture ; seulement si le depot egale exactement son solde. (La marque troc ne
        # compte que pour les frais de retard : une facture troc qui n'a rien recu se paie normalement.)
        if bal != amount and (paid.get(inv.id) or 0) > 0:
            score -= 40
        if score >= 40:
            d = invoice_dict(inv, paid.get(inv.id) or Decimal("0"), names.get(inv.company_id, ""))
            d["score"] = round(score)
            d["pct"] = max(5, min(100, round(score / 1.45)))   # 145 = montant exact + client + nom + 1-30 jours
            d["exact"] = bal == amount
            cands.append(d)
    cands.sort(key=lambda d: (-d["score"], d["issue_date"]))   # a score egal : la plus vieille d'abord (client en retard)
    out["invoices"] = cands[:limit]

    # Combinaisons pour la compagnie connue (ou la plus probable)
    company_id = tx.company_id or (cands[0] and cands[0]["company_id"] if cands else None)
    if company_id:
        fam = {str(c) for c in names if str(company_id) in {str(x) for x in chain(c)}}
        own = sorted([i for i in invs if str(i.company_id) in fam
                      and i.total - (paid.get(i.id) or 0) > 0], key=lambda i: i.issue_date)[-12:]
        bals = [(i, i.total - (paid.get(i.id) or Decimal("0"))) for i in own]
        found = []
        for size in range(2, min(6, len(bals)) + 1):
            for combo in itertools.combinations(bals, size):
                if sum(b for _, b in combo) == amount:
                    found.append([invoice_dict(i, paid.get(i.id) or Decimal("0"), names.get(i.company_id, "")) for i, _ in combo])
                    if len(found) >= 3:
                        break
            if len(found) >= 3:
                break
        out["combos"] = found
    return out


async def exact_options(db: AsyncSession, fam_ids, amount: Decimal, day: date) -> tuple[dict, list, list]:
    """Regle de Philippe (2026-10-06/08) : facons EXACTES de payer `amount` avec les plus vieilles factures ouvertes de
    la famille du client (j plus vieilles qui n'ont rien recu + k plus vieux restes, ou le reste d'une seule facture).
    Sert aux depots (best_exact) et aux recus de carte sans n° de facture (card_receipts, TASK-042.14)."""
    open_invs = (await db.execute(select(Invoice).where(
        Invoice.company_id.in_(fam_ids), Invoice.status.in_(OPEN_STATUSES), Invoice.credit_of_id.is_(None),
        Invoice.issue_date <= day + timedelta(days=10)).order_by(Invoice.issue_date, Invoice.number))).scalars().all()
    paid = await invoice_balances(db, [i.id for i in open_invs])
    fresh, rests = [], []
    for inv in open_invs:
        already = paid.get(inv.id) or Decimal("0")
        bal = inv.total - already
        if bal <= 0:
            continue
        if already <= 0:
            fresh.append((inv, bal))
        else:
            rests.append((inv, bal))
    options = {}
    for j in range(min(len(fresh), 12) + 1):
        for k in range(min(len(rests), 12) + 1):
            if j + k == 0:
                continue
            combo = fresh[:j] + rests[:k]
            if sum((b for _i, b in combo), Decimal("0")) == amount:
                options[tuple(sorted(str(i.id) for i, _b in combo))] = combo
    for i, b in rests:                      # client qui paie le reste d'une facture precise
        if b == amount:
            options[(str(i.id),)] = [(i, b)]
    return options, fresh, rests


async def best_exact(db: AsyncSession, tx: BankTransaction) -> dict | None:
    """Suggestion sure pour « Valider » dans l'onglet Reconnu (et l'association automatique) : un seul paiement a
    lier, sinon la repartition du depot sur les factures de la compagnie reconnue (+ credit). None si ambigu."""
    if not tx.company_id or tx.amount <= 0:
        return None
    s = await suggestions(db, tx)
    # Un paiement deja enregistre n'est « sur » que s'il est proche du depot (10 jours au plus) et ne
    # paie pas une facture emise apres le depot (2026-10-07 : la regle « un seul candidat sur 45 jours »
    # avait lie 6 depots a un paiement d'un autre mois chez des clients mensuels au meme montant).
    # Un paiement plus eloigne n'est pas ce depot : il ne bloque plus la regle de la plus vieille facture
    # (2026-10-07, MRST : un paiement non relie du 24 aout empechait le depot du 6 octobre).
    def gap(p):
        return abs((p["received_at"] - tx.posted_date).days) if p["received_at"] else 9999
    from app.core.company_tree import family_ids
    fam_ids = await family_ids(db, tx.company_id)
    fam = {str(c) for c in fam_ids}
    pays = [p for p in s["payments"] if p["company_id"] in fam and gap(p) <= 10
            and not (p["invoice_date"] and p["invoice_date"] > tx.posted_date + timedelta(days=10))]
    if len(pays) == 1:
        return {"kind": "payment", **pays[0]}
    if pays:
        # Paiement recurrent (meme client, meme montant) : le plus proche du depot, s'il l'est nettement ;
        # a egalite le meme jour (deux paiements identiques), la plus vieille facture.
        pays.sort(key=lambda p: (gap(p), p["invoice_date"] or date.max))
        best, second = pays[0], pays[1]
        if gap(second) > gap(best) or second["received_at"] == best["received_at"]:
            return {"kind": "payment", **best}
        return None
    # Regle de Philippe (2026-10-06) : un depot paie la plus vieille facture ouverte du client, ou les
    # plus vieilles dans l'ordre. Sur seulement si le montant egale exactement la plus vieille, ou la
    # somme des 2, 3... plus vieilles -- sinon (paiement partiel, autre facture) : suggestion, pas automatique.
    # 2026-10-08 (Philippe : « si la facture a eu un paiement elle ne compte plus pour la plus ancienne, sinon je
    # perds les differences de paiement » ; « si le client paie sa facture et 3 retards, il prend les 3 retards les
    # plus vieux ») : deux files -- les factures qui n'ont encore rien recu (les plus vieilles d'abord) et les restes
    # des factures deja payees en partie, les plus vieux d'abord -- restes « a regler en troc » compris (Philippe :
    # « la mention troc c'est juste pour ne pas recevoir de facture de retard et identifier une dette »). Sur si le depot egale exactement : les j plus vieilles factures + les k plus vieux restes, ou le
    # reste d'une seule facture ; une seule possibilite -> associe, plusieurs -> suggestion seulement.
    amount = Decimal(tx.amount)
    options, fresh, rests = await exact_options(db, fam_ids, amount, tx.posted_date)
    if len(options) == 1:
        return _invoice_plan(tx, amount, next(iter(options.values())), Decimal("0"))
    if options:
        return None                         # plusieurs facons exactes : a Philippe de choisir
    # Sans compte exact, seulement ses propres factures (jamais celles d'une succursale sans preuve -- TASK-002.4)
    fresh = [(i, b) for i, b in fresh if i.company_id == tx.company_id]
    rests = [(i, b) for i, b in rests if i.company_id == tx.company_id]
    # 2026-10-08 (Philippe) : pas de compte exact -> le depot du client reconnu s'associe quand meme tout seul : ses plus
    # vieilles factures qui n'ont rien recu au complet, puis le surplus aux plus vieux restes (troc compris), puis, s'il
    # reste de l'argent, en partie a la plus vieille facture suivante ; un depot qui ne couvre aucune facture au complet
    # va en partie sur la plus vieille (« si c'est le nom qu'il connait, oui il l'associe automatique ») ; ce qui depasse
    # tout ce qu'il doit va en credit dans son dossier, meme sans aucune facture ouverte (« il va en credit tout seul »).
    left, combo = amount, []
    nxt = None
    for inv, bal in fresh:
        if bal > left:
            nxt = (inv, bal)
            break
        combo.append((inv, bal))
        left -= bal
    if not combo and nxt:                   # ne couvre aucune facture au complet : en partie sur la plus vieille
        return _invoice_plan(tx, amount, [(nxt[0], amount)], Decimal("0"))   # (Physotech 49,33 $ sur 53,93 $)
    for inv, bal in rests:
        if left <= 0:
            break
        take = min(bal, left)
        combo.append((inv, take))
        left -= take
    if left > 0 and nxt:
        combo.append((nxt[0], left))
        left = Decimal("0")
    # 2026-10-14 (TASK-042.2, 40 faux credits du 2026-10-08) : un paiement deja enregistre du client, pas encore relie
    # a la banque, peut etre ce depot (« Paiement anterieur » importe, plusieurs factures payees par un seul depot,
    # paiement date a plus de 10 jours) -- jamais de credit automatique dans ce cas : a Philippe de relier.
    # Ni pour un depot de la periode de l'historique importe : les dates des « Paiement anterieur » ne suivent pas
    # les depots (LS : depot du 2026-03-04, paiement importe date du 2026-07-06), le depot se relie, il ne cree rien.
    if left > 0 and (await _unlinked_payment_near(db, fam_ids, tx.posted_date)
                     or tx.posted_date <= await _last_imported_payment(db)):
        return None
    return _invoice_plan(tx, amount, combo, left)


async def _last_imported_payment(db: AsyncSession) -> date:
    return (await db.execute(select(func.max(ClientPayment.received_at)).where(
        ClientPayment.source == "zoho_import"))).scalar_one() or date.min


async def _unlinked_payment_near(db: AsyncSession, company_ids, day: date, days: int = 45) -> bool:
    linked = select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None))
    return (await db.execute(select(func.count()).select_from(ClientPayment).where(
        ClientPayment.company_id.in_(company_ids), ClientPayment.status == "confirmed",
        ClientPayment.source != "barter", ClientPayment.id.not_in(linked),
        ClientPayment.received_at.between(day - timedelta(days=days), day + timedelta(days=days))))).scalar_one() > 0


def _invoice_plan(tx: BankTransaction, amount: Decimal, combo: list, credit: Decimal) -> dict:
    """Association sure d'un depot : repartition sur des factures (les plus vieilles d'abord) + credit au dossier."""
    combo = sorted(combo, key=lambda x: (x[0].issue_date, x[0].number))
    return {"kind": "invoice" if combo else "credit", "id": str(combo[0][0].id) if combo else None,
            "number": ", ".join(i.number for i, _ in combo), "balance": float(amount), "company_id": str(tx.company_id),
            "oldest_first": True, "credit": float(credit),
            "allocations": [{"invoice_id": str(i.id), "number": i.number, "amount": float(b)} for i, b in combo]}


async def apply_rules(db: AsyncSession, account_id=None, only_key: str | None = None) -> int:
    """Attribue la compagnie des regles aux lignes non classees sans compagnie (company_source=rule).
    Retourne le nombre de lignes reconnues."""
    rules = (await db.execute(select(BankPayeeRule))).scalars().all()
    by_key = {r.payee_key: r.company_id for r in rules if r.company_id and (not only_key or r.payee_key == only_key)}
    if not by_key:
        return 0
    q = select(BankTransaction).where(   # regles client : depots seulement (les retraits -> propose_vendors)
        BankTransaction.status == "unclassified", BankTransaction.company_id.is_(None), BankTransaction.payee.is_not(None),
        BankTransaction.amount > 0,
    )
    if account_id:
        q = q.where(BankTransaction.account_id == account_id)
    n = 0
    for tx in (await db.execute(q)).scalars().all():
        cid = by_key.get(payee_key(tx.payee))
        if cid:
            tx.company_id, tx.company_source = cid, "rule"
            n += 1
    return n


# ── Retraits (TASK-042.4) ────────────────────────────────────────────────────
# Un retrait s'explique par une depense ou un paiement de factures fournisseurs. Les depenses et paiements
# deja enregistres (importes de l'ancien logiciel) se LIENT d'abord -- jamais recrees, sinon tout compte
# en double. Sinon : payer les plus vieilles factures du fournisseur, ou enregistrer une nouvelle depense.

async def linked_withdrawal_ids(db: AsyncSession) -> tuple[set, set]:
    rows = (await db.execute(select(BankTransaction.expense_id, BankTransaction.vendor_payment_id).where(
        (BankTransaction.expense_id.is_not(None)) | (BankTransaction.vendor_payment_id.is_not(None))))).all()
    return {e for e, _ in rows if e}, {p for _, p in rows if p}


async def withdrawal_suggestions(db: AsyncSession, tx: BankTransaction) -> dict:
    from app.models.purchases import Expense, VendorPayment, Bill
    out = {"expenses": [], "vendor_payments": [], "bills": []}
    if tx.amount >= 0:
        return out
    amount = -Decimal(tx.amount)
    linked_e, linked_p = await linked_withdrawal_ids(db)
    for e in (await db.execute(select(Expense).where(
            Expense.total == amount, Expense.expense_date >= tx.posted_date - timedelta(days=15),
            Expense.expense_date <= tx.posted_date + timedelta(days=15)))).scalars().all():
        if e.id in linked_e or (tx.vendor_id and e.vendor_id and e.vendor_id != tx.vendor_id):
            continue
        out["expenses"].append({"kind": "expense", "id": str(e.id), "date": e.expense_date, "gap": abs((e.expense_date - tx.posted_date).days),
                                "pct": max(10, 100 - 5 * abs((e.expense_date - tx.posted_date).days)),
                                "vendor_name": e.vendor.name if e.vendor else None, "category_name": e.category.name if e.category else None,
                                "description": e.description, "amount": float(e.total), "vendor_id": str(e.vendor_id) if e.vendor_id else None})
    for p in (await db.execute(select(VendorPayment).where(
            VendorPayment.amount == amount, VendorPayment.payment_date >= tx.posted_date - timedelta(days=35),
            VendorPayment.payment_date <= tx.posted_date + timedelta(days=15)))).scalars().all():
        if p.id in linked_p or (tx.vendor_id and p.vendor_id and p.vendor_id != tx.vendor_id):
            continue
        bills = {b.id: b for b in (await db.execute(select(Bill).where(Bill.id.in_([a.bill_id for a in p.allocations])))).scalars().all()} if p.allocations else {}
        out["vendor_payments"].append({"kind": "vendor_payment", "id": str(p.id), "date": p.payment_date, "gap": abs((p.payment_date - tx.posted_date).days),
                                       "pct": max(10, 100 - 3 * abs((p.payment_date - tx.posted_date).days)),
                                       "payee": p.vendor.name if p.vendor else p.payee_label, "amount": float(p.amount),
                                       "bill_numbers": [bills[a.bill_id].bill_number or "" for a in p.allocations if a.bill_id in bills],
                                       "vendor_id": str(p.vendor_id) if p.vendor_id else None})
    for k in ("expenses", "vendor_payments"):
        out[k].sort(key=lambda d: d["gap"])
    if tx.vendor_id:
        out["bills"] = await open_bills_oldest_first(db, tx.vendor_id)
    return out


async def open_bills_oldest_first(db: AsyncSession, vendor_id) -> list:
    from app.models.purchases import Bill
    from app.api.v1.endpoints.purchases import _bill_balances
    bills = (await db.execute(select(Bill).where(Bill.vendor_id == vendor_id, Bill.status.in_(["ouverte", "partielle", "en_retard"]))
                              .order_by(Bill.bill_date, Bill.bill_number))).scalars().all()
    paid = await _bill_balances(db, [b.id for b in bills])
    out = []
    for b in bills:
        bal = b.total - paid.get(b.id, Decimal("0"))
        if bal > 0:
            out.append({"id": str(b.id), "bill_number": b.bill_number, "bill_date": b.bill_date, "balance": float(bal), "total": float(b.total)})
    return out


# Virement Interac envoye (TASK-042.15) : le releve BNC ne donne pas le destinataire -- seulement « VIREMENT INTERAC »,
# « VIRDT INTERAC », « MOBILE VIRDT IT ». Jamais de regle beneficiaire -> fournisseur sur ce libelle (il vaut pour tous).
_GENERIC_TRANSFER = re.compile(r"INTERAC|VIRDT", re.I)


def generic_transfer(tx: BankTransaction) -> bool:
    return not (tx.payee or "").strip() and bool(_GENERIC_TRANSFER.search(tx.description or ""))


async def _bills_by_amount(db: AsyncSession, tx: BankTransaction) -> dict | None:
    """Virement sans destinataire : un seul fournisseur dont les plus vieilles factures ouvertes (emises au plus tard a la
    fin du mois du virement) font exactement le montant -> ses factures ; deux fournisseurs possibles ou aucun -> rien."""
    from app.models.purchases import Bill, Vendor
    from app.api.v1.endpoints.purchases import _bill_balances
    amount = -Decimal(str(tx.amount))
    bills = (await db.execute(select(Bill).where(Bill.status.in_(["ouverte", "partielle", "en_retard"]), Bill.vendor_id.is_not(None))
                              .order_by(Bill.vendor_id, Bill.bill_date, Bill.bill_number))).scalars().all()
    paid = await _bill_balances(db, [b.id for b in bills]) if bills else {}
    nxt = date(tx.posted_date.year + tx.posted_date.month // 12, tx.posted_date.month % 12 + 1, 1)
    month_end = nxt - timedelta(days=1)       # factures du mois du virement comprises (commissions datees du dernier jour)
    by_vendor: dict = {}
    for b in bills:
        bal = Decimal(b.total) - paid.get(b.id, Decimal("0"))
        if bal > 0:
            by_vendor.setdefault(b.vendor_id, []).append((b, bal))
    found = []
    for vid, rows in by_vendor.items():
        run, picked = Decimal("0"), []
        for b, bal in rows:
            if b.bill_date > month_end:
                break
            run += bal
            picked.append((b, bal))
            if run >= amount:
                break
        if run == amount:
            found.append((vid, picked))
    if len(found) != 1:
        return None
    vid, picked = found[0]
    vendor = await db.get(Vendor, vid)
    return {"kind": "bills", "id": str(picked[0][0].id), "amount": float(amount), "oldest_first": True, "by_amount": True,
            "vendor_id": str(vid), "vendor_name": vendor.name if vendor else None,
            "bill_numbers": [b.bill_number or "" for b, _ in picked],
            "allocations": [{"bill_id": str(b.id), "amount": float(bal)} for b, bal in picked]}


async def best_exact_withdrawal(db: AsyncSession, tx: BankTransaction) -> dict | None:
    """Suggestion sure pour un retrait : une seule depense / un seul paiement enregistre du meme montant
    (le plus proche s'il l'est nettement, 10 jours au plus) ; sinon, fournisseur confirme ET montant =
    la plus vieille facture ouverte ou la somme des plus vieilles (meme regle que les depots)."""
    if tx.amount >= 0:
        return None
    s = await withdrawal_suggestions(db, tx)
    cands = sorted(s["expenses"] + s["vendor_payments"], key=lambda d: d["gap"])
    if cands:
        best = cands[0]
        if best["gap"] <= 10 and (len(cands) == 1 or cands[1]["gap"] > best["gap"]):
            return best
        return None
    if not tx.vendor_id and generic_transfer(tx):
        return await _bills_by_amount(db, tx)
    if not tx.vendor_id or tx.vendor_source not in ("manual", "rule"):
        return None
    amount, run, picked = -Decimal(tx.amount), Decimal("0"), []
    for b in s["bills"]:
        run += Decimal(str(b["balance"]))
        picked.append(b)
        if run == amount:
            return {"kind": "bills", "id": picked[0]["id"], "amount": float(amount), "oldest_first": True,
                    "bill_numbers": [b["bill_number"] or "" for b in picked],
                    "allocations": [{"bill_id": b["id"], "amount": b["balance"]} for b in picked]}
        if run > amount:
            break
    return None


async def propose_vendors(db: AsyncSession, tx_ids: list | None = None) -> int:
    """Retraits sans fournisseur : regle du beneficiaire (vendor_source=rule), sinon correspondance
    evidente du nom avec un fournisseur (vendor_source=name = proposition a accepter)."""
    from app.models.purchases import Vendor
    rules = {r.payee_key: r for r in (await db.execute(select(BankPayeeRule).where(BankPayeeRule.vendor_id.is_not(None)))).scalars().all()}
    vendors = list((await db.execute(select(Vendor.id, Vendor.name).where(Vendor.is_active.is_(True)))).all())
    # Fournisseur venu d'une regle supprimee, ou d'une regle sur un libelle de virement Interac (vaut pour tous) : retire
    stale = select(BankTransaction).where(BankTransaction.amount < 0, BankTransaction.status == "unclassified",
                                          BankTransaction.vendor_source == "rule")
    if tx_ids is not None:
        stale = stale.where(BankTransaction.id.in_(tx_ids))
    for tx in (await db.execute(stale)).scalars().all():
        if generic_transfer(tx) or payee_key(tx.payee or tx.description) not in rules:
            tx.vendor_id, tx.vendor_source = None, None
    q = select(BankTransaction).where(BankTransaction.amount < 0, BankTransaction.status == "unclassified", BankTransaction.vendor_id.is_(None))
    if tx_ids is not None:
        q = q.where(BankTransaction.id.in_(tx_ids))
    n = 0
    for tx in (await db.execute(q)).scalars().all():
        if generic_transfer(tx):
            continue          # destinataire inconnu : reconnu par le montant (_bills_by_amount) ou a la main
        rule = rules.get(payee_key(tx.payee or tx.description))
        if rule:
            tx.vendor_id, tx.vendor_source = rule.vendor_id, "rule"
            n += 1
            continue
        text = tx.payee or tx.description
        scored = sorted((((name_similarity(text, nm) + name_similarity(nm, text)) / 2, vid) for vid, nm in vendors
                         if name_similarity(text, nm) and name_similarity(nm, text)), reverse=True)
        if scored and scored[0][0] >= 0.6 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.2):
            tx.vendor_id, tx.vendor_source = scored[0][1], "name"
            n += 1
    return n
