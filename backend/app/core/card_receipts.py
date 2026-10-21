"""Paiements par carte reconnus par les recus « Merchant Email Receipt » (TASK-042.11, 2026-10-21).

Philippe : « pour les paiements d'Elavon (bénéficiaire ELAVON MRCH SVC), dans facturation (courriel) j'ai des rapports
d'Elavon (Merchant Email Receipt) avec la facture ». Chaque recu (noreply@mail.authorize.net, deja synchronise dans
Courriels) donne le n° de facture, le montant, l'entreprise et la date. Lecture par expressions regulieres (format fixe,
pas d'IA). Association SURE seulement : un seul depot ELAVON du meme montant, 0 a 5 jours apres le paiement, ET la
facture du recu a encore un solde au moins egal au montant ; sinon le recu reste « a verifier » avec la raison.
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


async def match(db) -> int:
    """Relie chaque recu lu au depot ELAVON du meme montant ; associe le depot a la facture si c'est sur."""
    from app.models.bank_account import BankTransaction, CardReceipt
    from app.models.invoice import Invoice
    from app.models.client_payment import PaymentAllocation
    from app.core.bank_matching import invoice_balances
    from app.api.v1.endpoints import bank
    taken = set((await db.execute(select(CardReceipt.bank_transaction_id).where(CardReceipt.bank_transaction_id.is_not(None)))).scalars().all())
    n = 0
    for r in (await db.execute(select(CardReceipt).where(CardReceipt.status.in_(("parsed", "a_verifier"))))).scalars().all():
        inv = (await db.execute(select(Invoice).where(Invoice.number == r.invoice_number))).scalar_one_or_none()
        if not inv:
            r.status, r.note = "a_verifier", f"Facture {r.invoice_number} introuvable dans ERPCRM"
            continue
        r.invoice_id = inv.id
        cands = [t for t in (await db.execute(select(BankTransaction).where(
            BankTransaction.amount == r.amount, BankTransaction.amount > 0,
            BankTransaction.posted_date >= r.paid_at, BankTransaction.posted_date <= r.paid_at + timedelta(days=5)))).scalars().all()
            if (t.id not in taken or t.id == r.bank_transaction_id) and "elavon" in f"{t.description} {t.payee or ''}".lower()]
        if len(cands) != 1:
            r.status, r.note = "a_verifier", ("Aucun dépôt Elavon de ce montant dans les 5 jours" if not cands
                                              else f"{len(cands)} dépôts Elavon de ce montant : choix impossible")
            continue
        tx = cands[0]
        if tx.status == "matched":
            on_inv = tx.client_payment_id and (await db.execute(select(func.count()).select_from(PaymentAllocation).where(
                PaymentAllocation.payment_id == tx.client_payment_id, PaymentAllocation.invoice_id == inv.id))).scalar_one()
            r.bank_transaction_id = tx.id
            taken.add(tx.id)
            r.status, r.note = ("linked", None) if on_inv else ("a_verifier", "Le dépôt est déjà associé à une autre facture")
            continue
        if tx.status != "unclassified":
            r.status, r.note = "a_verifier", "Le dépôt est exclu"
            continue
        settled = (await invoice_balances(db, [inv.id])).get(inv.id, Decimal(0))      # deja regle sur la facture
        balance = Decimal(inv.total) - Decimal(settled)
        if Decimal(balance) < Decimal(r.amount):
            r.status, r.note = "a_verifier", (f"La facture {inv.number} n'a plus que {Decimal(balance):.2f} $ à payer "
                                              f"(paiement par carte de {r.amount:.2f} $)")
            r.bank_transaction_id = tx.id
            taken.add(tx.id)
            continue
        await db.flush()
        await bank.match_transaction(tx.id, bank.MatchIn(
            allocations=[bank.AllocIn(invoice_id=inv.id, amount=float(r.amount))],
            method_code="authorizenet", remember_payee=False), db, None)
        r.bank_transaction_id, r.status, r.note = tx.id, "matched", None
        taken.add(tx.id)
        n += 1
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
