"""Paiements par carte reconnus par les recus « Merchant Email Receipt » (TASK-042.11, 2026-10-21).

Philippe : « pour les paiements d'Elavon (bénéficiaire ELAVON MRCH SVC), dans facturation (courriel) j'ai des rapports
d'Elavon (Merchant Email Receipt) avec la facture ». Chaque recu (noreply@mail.authorize.net, deja synchronise dans
Courriels) donne le n° de facture, le montant, l'entreprise et la date. Lecture par expressions regulieres (format fixe,
pas d'IA). Association SURE seulement : une seule combinaison de recus (Elavon verse en lot, un recu peut payer
plusieurs factures, TASK-042.14) fait exactement un depot ELAVON 0 a 5 jours apres, ET les factures ont encore leur
solde -- ou sont deja reglees par des paiements anterieurs non relies qui font le depot ; sinon « a verifier ».
Le depot n'enseigne aucune regle « ELAVON -> client » (Elavon sert tous les clients qui paient par carte).
"""
import re
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select, func

log = logging.getLogger("card_receipts")

SENDER = "noreply@mail.authorize.net"
SUBJECT = "Merchant Email Receipt"


def _field(text: str, name: str) -> str | None:
    m = re.search(rf"^\s*{name}\s*:\s*(.*?)\s*$", text, re.M)
    return m.group(1).strip() or None if m else None


def parse(text: str) -> dict:
    text = re.sub(r"<[^>]+>", "\n", text or "")
    amount = _field(text, "Amount")
    when = _field(text, "Date/Time")
    paid = None
    if when:
        try:
            paid = datetime.strptime(when.split()[0], "%d-%b-%Y").date()
        except ValueError:
            paid = None
    approved = "approved" in (_field(text, "Response") or "").lower()
    return {
        "invoice_number": (_field(text, "Invoice") or "").upper() or None,
        "amount": Decimal(re.sub(r"[^\d.]", "", amount.split()[0])) if amount else None,
        "company_name": _field(text, "Company"),
        "card": _field(text, "Payment Method"),
        "transaction_ref": _field(text, "Transaction ID"),
        "paid_at": paid,
        "approved": approved,
    }


async def scan(db) -> int:
    """Lit les nouveaux recus deja synchronises dans Courriels."""
    from app.models.mailbox import MailMessage
    from app.models.bank_account import CardReceipt
    known = set((await db.execute(select(CardReceipt.mail_message_id))).scalars().all())
    msgs = (await db.execute(select(MailMessage).where(func.lower(MailMessage.from_email) == SENDER,
                                                       MailMessage.subject == SUBJECT))).scalars().all()
    n = 0
    for m in msgs:
        if m.id in known:
            continue
        x = parse(m.body_text or m.body_html or "")
        r = CardReceipt(mail_message_id=m.id, paid_at=x["paid_at"] or (m.sent_at.date() if m.sent_at else None),
                        invoice_number=x["invoice_number"], amount=x["amount"], company_name=(x["company_name"] or "")[:255] or None,
                        card=x["card"], transaction_ref=x["transaction_ref"])
        if not x["approved"]:
            r.status, r.note = "failed", "Paiement refusé ou non approuvé"
        elif not (x["invoice_number"] and x["amount"]):
            r.status, r.note = "failed", "Reçu illisible (facture ou montant manquant)"
        db.add(r)
        n += 1
    await db.flush()
    return n


def invoice_numbers(text: str, main: str | None) -> list[str]:
    """Factures payees par le recu : le champ « Invoice » plus toutes celles nommees dans « Description »
    (un client paie souvent une vieille facture et les nouvelles d'un coup, ex. Talentech 2026-07-15)."""
    text = re.sub(r"<[^>]+>", "\n", text or "")
    nums = [main] if main and main != "NONE" else []
    for n in re.findall(r"\bINV-\d+\b", _field(text, "Description") or "", re.I):
        if n.upper() not in nums:
            nums.append(n.upper())
    return nums


def _subsets(items: list, target: Decimal, limit: int = 16) -> list[tuple]:
    """Toutes les combinaisons de recus dont la somme fait exactement le depot."""
    from itertools import combinations
    top = len(items) if len(items) <= limit else 1     # trop de recus : seulement un recu = un depot
    return [c for k in range(1, top + 1) for c in combinations(items, k)
            if sum((r.amount for r in c), Decimal(0)) == target]


async def _settle(db, tx, group: list, nums: list[str]) -> tuple[str, str | None]:
    """Associe le depot aux factures des recus. Deux cas surs seulement :
    1) les factures sont deja reglees par des paiements anterieurs non relies a la banque, qui font exactement le
       depot -> le depot est relie a ces paiements (regroupes en un seul encaissement s'il y en a plusieurs) ;
    2) les factures ont encore leur solde -> un encaissement est cree, chaque recu reparti sur ses factures
       (la plus ancienne d'abord). Tout autre cas reste « a verifier » avec la raison."""
    from app.models.invoice import Invoice
    from app.models.client_payment import ClientPayment, PaymentAllocation, PaymentDocument
    from app.models.barter import BarterApplication
    from app.core.bank_matching import invoice_balances, linked_payment_ids
    from app.api.v1.endpoints import bank
    invs = (await db.execute(select(Invoice).where(Invoice.number.in_(nums)))).scalars().all()
    if len(invs) != len(set(nums)):
        missing = sorted(set(nums) - {i.number for i in invs})
        return "a_verifier", f"Facture introuvable dans ERPCRM : {', '.join(missing)}"
    by_num = {i.number: i for i in invs}
    ids = [i.id for i in invs]
    settled = await invoice_balances(db, ids)
    balance = {i.id: Decimal(i.total) - Decimal(settled.get(i.id, 0)) for i in invs}

    # 1) deja reglees par des paiements anterieurs pas encore relies a un depot
    linked = await linked_payment_ids(db)
    pays = (await db.execute(select(ClientPayment).join(PaymentAllocation, PaymentAllocation.payment_id == ClientPayment.id)
                             .where(PaymentAllocation.invoice_id.in_(ids), ClientPayment.status == "confirmed")
                             .distinct())).scalars().all()
    pays = [p for p in pays if p.id not in linked and p.method_code != "troc"]
    if all(balance[i] <= 0 for i in ids) and pays:
        allocs = (await db.execute(select(PaymentAllocation).where(PaymentAllocation.payment_id.in_([p.id for p in pays])))).scalars().all()
        if ({a.invoice_id for a in allocs} == set(ids) and sum((p.amount for p in pays), Decimal(0)) == Decimal(tx.amount)
                and len({p.company_id for p in pays}) == 1):
            keep = pays[0]
            if len(pays) > 1:
                if any(p.source != "zoho_import" for p in pays):
                    return "a_verifier", "Les factures sont déjà payées par plusieurs paiements : regroupement à faire à la main"
                others = [p.id for p in pays[1:]]
                if (await db.execute(select(func.count()).select_from(BarterApplication)
                                     .where(BarterApplication.client_payment_id.in_(others)))).scalar_one():
                    return "a_verifier", "Un des paiements est lié à un échange"
                for a in allocs:
                    a.payment_id = keep.id
                for d in (await db.execute(select(PaymentDocument).where(PaymentDocument.payment_id.in_(others)))).scalars().all():
                    d.payment_id = keep.id
                await db.flush()
                for p in pays[1:]:
                    await db.delete(p)
                keep.amount = Decimal(tx.amount)
                keep.notes = "Paiement antérieur des factures " + ", ".join(sorted(by_num)) + "."
                await db.flush()
            await bank.match_transaction(tx.id, bank.MatchIn(client_payment_id=keep.id, remember_payee=False), db, None)
            return "linked", None
        return "a_verifier", "Les factures sont déjà payées, mais les paiements inscrits ne font pas le montant du dépôt"

    # 2) solde encore ouvert : chaque recu reparti sur ses factures, la plus ancienne d'abord
    left = dict(balance)
    out: dict = {}
    for r, rnums in group:
        rest = Decimal(r.amount)
        for inv in sorted((by_num[n] for n in rnums), key=lambda i: (i.issue_date or date.min, i.number)):
            take = min(rest, max(left[inv.id], Decimal(0)))
            if take > 0:
                out[inv.id] = out.get(inv.id, Decimal(0)) + take
                left[inv.id] -= take
                rest -= take
        if rest > 0:
            return "a_verifier", (f"Les factures {', '.join(rnums)} n'ont plus que "
                                  f"{sum((max(balance[by_num[n].id], Decimal(0)) for n in rnums), Decimal(0)):.2f} $ à payer "
                                  f"(paiement par carte de {r.amount:.2f} $)")
    await db.flush()
    await bank.match_transaction(tx.id, bank.MatchIn(
        allocations=[bank.AllocIn(invoice_id=i, amount=float(a)) for i, a in out.items()],
        method_code="authorizenet", remember_payee=False), db, None)
    return "matched", None


async def match(db) -> int:
    """Relie les recus lus aux depots ELAVON. Un depot peut regrouper plusieurs recus du meme jour (Elavon verse
    en lot) et un recu peut payer plusieurs factures : la combinaison de recus doit faire exactement le depot et
    etre la seule possible, sinon rien n'est associe (Philippe 2026-10-22 : « même règle que les paiements »)."""
    from app.models.bank_account import BankTransaction, CardReceipt
    from app.models.mailbox import MailMessage
    from app.models.client_payment import PaymentAllocation
    from app.models.invoice import Invoice
    pending = (await db.execute(select(CardReceipt, MailMessage).join(MailMessage, MailMessage.id == CardReceipt.mail_message_id)
                                .where(CardReceipt.status.in_(("parsed", "a_verifier")), CardReceipt.amount > 0))).all()
    nums = {r.id: invoice_numbers(m.body_text or m.body_html or "", r.invoice_number) for r, m in pending}
    recs = [r for r, _ in pending]
    if not recs:
        return 0
    lo = min(r.paid_at for r in recs)
    deposits = [t for t in (await db.execute(select(BankTransaction).where(
        BankTransaction.amount > 0, BankTransaction.posted_date >= lo,
        BankTransaction.posted_date <= max(r.paid_at for r in recs) + timedelta(days=5)))).scalars().all()
        if "elavon" in f"{t.description} {t.payee or ''}".lower()]

    # recus deja couverts par un depot associe a leurs factures -> « linked »
    for r in recs:
        for t in deposits:
            if t.status == "matched" and t.client_payment_id and r.paid_at <= t.posted_date <= r.paid_at + timedelta(days=5):
                on = set((await db.execute(select(Invoice.number).join(PaymentAllocation, PaymentAllocation.invoice_id == Invoice.id)
                                           .where(PaymentAllocation.payment_id == t.client_payment_id))).scalars().all())
                if on and set(nums[r.id]) <= on and Decimal(t.amount) >= Decimal(r.amount):
                    r.status, r.note, r.bank_transaction_id = "linked", None, t.id
                    break
    recs = [r for r in recs if r.status != "linked"]

    pairs = []      # (depot, combinaison de recus) possibles
    for t in deposits:
        if t.status != "unclassified":
            continue
        cands = sorted((r for r in recs if r.paid_at <= t.posted_date <= r.paid_at + timedelta(days=5)), key=lambda r: r.paid_at)
        subs = _subsets(cands, Decimal(t.amount))
        if len(subs) == 1:
            pairs.append((t, subs[0]))
        elif len(subs) > 1:
            for r in {r for c in subs for r in c}:
                r.status, r.note = "a_verifier", f"Plusieurs combinaisons de reçus font le dépôt de {t.amount:.2f} $ : choix impossible"
    used: dict = {}
    for t, c in pairs:
        for r in c:
            used[r.id] = used.get(r.id, 0) + 1
    n = 0
    for t, c in pairs:
        if any(used[r.id] > 1 for r in c):
            for r in c:
                r.status, r.note = "a_verifier", "Ce reçu correspond à plus d'un dépôt Elavon : choix impossible"
            continue
        group = [(r, nums[r.id]) for r in c]
        allnums = list(dict.fromkeys(x for _, ns in group for x in ns))
        status, note = await _settle(db, t, group, allnums)
        for r in c:
            r.status, r.note = status, note
            r.bank_transaction_id = t.id
            inv = (await db.execute(select(Invoice.id).where(Invoice.number == r.invoice_number))).scalar_one_or_none()
            r.invoice_id = inv
        if status in ("matched", "linked"):
            n += 1
    for r in recs:
        if r.status in ("parsed", "a_verifier") and not any(r in c for _, c in pairs) and not (r.note or "").startswith("Plusieurs"):
            same = [t for t in deposits if t.status == "matched" and Decimal(t.amount) == Decimal(r.amount)
                    and r.paid_at <= t.posted_date <= r.paid_at + timedelta(days=5)]
            r.status, r.note = "a_verifier", ("Le dépôt est déjà associé à une autre facture" if same else
                                              "Aucun dépôt Elavon de ce montant (seul ou avec d'autres reçus) dans les 5 jours")
    await db.flush()
    return n


async def run_once() -> dict:
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        new = await scan(db)
        await db.commit()
    async with AsyncSessionLocal() as db:
        matched = await match(db)
        await db.commit()
    if new or matched:
        log.info("Recus de carte : %d nouveaux, %d depots associes", new, matched)
    return {"new": new, "matched": matched}
