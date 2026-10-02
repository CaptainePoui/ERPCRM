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
    if not invoice_ids:
        return {}
    rows = (await db.execute(
        select(PaymentAllocation.invoice_id, func.sum(PaymentAllocation.amount_allocated))
        .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
        .where(PaymentAllocation.invoice_id.in_(invoice_ids), ClientPayment.status == "confirmed")
        .group_by(PaymentAllocation.invoice_id)
    )).all()
    return {i: p for i, p in rows}


def invoice_dict(inv: Invoice, paid: Decimal, company_name: str) -> dict:
    return {
        "id": str(inv.id), "number": inv.number, "company_id": str(inv.company_id), "company_name": company_name,
        "status": inv.status, "issue_date": inv.issue_date, "due_date": inv.due_date,
        "total": float(inv.total), "paid": float(paid), "balance": float(inv.total - paid),
        "site_label": inv.site_label_snapshot,
    }


async def linked_payment_ids(db: AsyncSession) -> set:
    return set((await db.execute(
        select(BankTransaction.client_payment_id).where(BankTransaction.client_payment_id.is_not(None))
    )).scalars().all())


async def payment_dict(db: AsyncSession, cp: ClientPayment, company_name: str) -> dict:
    nums = (await db.execute(
        select(Invoice.number).join(PaymentAllocation, PaymentAllocation.invoice_id == Invoice.id)
        .where(PaymentAllocation.payment_id == cp.id).order_by(Invoice.number)
    )).scalars().all()
    return {
        "id": str(cp.id), "company_id": str(cp.company_id), "company_name": company_name,
        "amount": float(cp.amount), "status": cp.status, "source": cp.source, "method_name": cp.method_name,
        "reference": cp.reference, "received_at": cp.received_at, "invoice_numbers": nums,
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

    # Paiements existants a lier
    linked = await linked_payment_ids(db)
    cps = (await db.execute(
        select(ClientPayment).where(ClientPayment.amount == amount, ClientPayment.status.in_(["confirmed", "pending"]))
    )).scalars().all()
    scored = []
    for cp in cps:
        if cp.id in linked:
            continue
        days = abs((cp.received_at - tx.posted_date).days) if cp.received_at else 0
        if cp.received_at and days > 45:
            continue
        s = 50 - days + (40 if tx.company_id and cp.company_id == tx.company_id else 0) \
            + 30 * name_similarity(tx.payee, names.get(cp.company_id))
        scored.append((s, cp))
    for s, cp in sorted(scored, key=lambda x: -x[0])[:5]:
        d = await payment_dict(db, cp, names.get(cp.company_id, ""))
        d["score"] = round(s)
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
        if tx.company_id and inv.company_id == tx.company_id:
            score += 40
        score += 30 * name_similarity(tx.payee or tx.description, names.get(inv.company_id))
        age = (tx.posted_date - inv.issue_date).days
        if -10 <= age <= 60:
            score += 10
        if score >= 40:
            d = invoice_dict(inv, paid.get(inv.id) or Decimal("0"), names.get(inv.company_id, ""))
            d["score"] = round(score)
            d["exact"] = bal == amount
            cands.append(d)
    cands.sort(key=lambda d: (-d["score"], abs((tx.posted_date - d["issue_date"]).days)))
    out["invoices"] = cands[:limit]

    # Combinaisons pour la compagnie connue (ou la plus probable)
    company_id = tx.company_id or (cands[0] and cands[0]["company_id"] if cands else None)
    if company_id:
        own = sorted([i for i in invs if str(i.company_id) == str(company_id)
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


async def best_exact(db: AsyncSession, tx: BankTransaction) -> dict | None:
    """Suggestion unique et sure pour « Valider » dans l'onglet Reconnu : un seul paiement a
    lier OU une seule facture ouverte de la compagnie reconnue au solde exact. Sinon None."""
    if not tx.company_id or tx.amount <= 0:
        return None
    s = await suggestions(db, tx)
    pays = [p for p in s["payments"] if p["company_id"] == str(tx.company_id)]
    # Paiement recurrent (meme montant chaque mois) : celui du meme jour (+/- 2) est le bon s'il est seul
    close = [p for p in pays if p["received_at"] and abs((p["received_at"] - tx.posted_date).days) <= 2]
    if len(close) == 1:
        return {"kind": "payment", **close[0]}
    if len(pays) == 1:
        return {"kind": "payment", **pays[0]}
    exact = [i for i in s["invoices"] if i["exact"] and i["company_id"] == str(tx.company_id)]
    if len(exact) == 1 and not pays:
        return {"kind": "invoice", **exact[0]}
    return None


async def apply_rules(db: AsyncSession, account_id=None, only_key: str | None = None) -> int:
    """Attribue la compagnie des regles aux lignes non classees sans compagnie (company_source=rule).
    Retourne le nombre de lignes reconnues."""
    rules = (await db.execute(select(BankPayeeRule))).scalars().all()
    by_key = {r.payee_key: r.company_id for r in rules if not only_key or r.payee_key == only_key}
    if not by_key:
        return 0
    q = select(BankTransaction).where(
        BankTransaction.status == "unclassified", BankTransaction.company_id.is_(None), BankTransaction.payee.is_not(None),
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
