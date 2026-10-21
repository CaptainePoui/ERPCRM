"""Zeko lit les courriels pour trouver les avis de paiement des clients et propose les associations (TASK-042.13).

Philippe (2026-10-21) : « qu'il scanne tous les courriels… il va en trouver plein et il va pouvoir les associer…
facturation@simpleip.tel pour commencer » ; « Zéko le proposera, il ne touchera pas tout seul à tes transactions ».

Un courriel a la fois, en tache de fond (cede toujours la place a une conversation, voir core/zeko.py) :
1. texte du courriel + texte des pieces jointes (PDF, images) ;
2. Zeko dit si c'est un avis de paiement d'un CLIENT, et lit payeur, montant, date, factures (JSON) ;
3. le programme cherche le depot (meme montant, de 3 jours avant a 10 jours apres le courriel) et verifie chaque
   facture (existe, encore assez de solde) : tout concorde -> « proposee » ; sinon « a_corriger » avec la raison.
Rien n'est associe tant que Philippe n'a pas accepte (Banque > Propositions de Zeko).
"""
import json
import logging
import re
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select, func

log = logging.getLogger("zeko_payments")

# Deja lus par leurs propres modules (recus de carte, avis Interac) : pas besoin de Zeko
SKIP_SENDERS = ("noreply@mail.authorize.net", "noreply@authorize.net", "notify@payments.interac.ca", "catch@payments.interac.ca")

PROMPT = (
    "Voici un courriel reçu par Simple IP (entreprise de téléphonie IP au Québec) et le texte de ses pièces jointes. "
    "Est-ce un avis qu'un CLIENT a payé Simple IP (paiement envoyé, dépôt direct, virement, relevé de paiement, avis de "
    "paiement reçu) ? Ce n'est PAS un paiement reçu si c'est une facture d'un fournisseur, une publicité, un rappel, une "
    "demande de paiement, ou un paiement fait PAR Simple IP. Si oui, recopie tels qu'écrits : le payeur, le montant total "
    "payé, la date du paiement (AAAA-MM-JJ) et chaque facture de Simple IP payée avec son montant (une note de crédit "
    "ou un escompte va en montant négatif). Réponds UNIQUEMENT en JSON : "
    '{"paiement_recu": bool, "payeur": str|null, "montant_total": number|null, "date": str|null, '
    '"factures": [{"numero": str, "montant": number|null}]}'
)


async def boxes(db) -> list[str]:
    from app.api.v1.endpoints.settings import get_setting
    v = await get_setting(db, "zeko_scan_boxes")
    return [b.strip().lower() for b in (v or "facturation@simpleip.tel").split(",") if b.strip()]


async def _text_of(m) -> tuple[str, str]:
    """(texte complet pour Zeko, extrait court comme preuve)"""
    from app.core import mail_store
    from app.core.zeko_tools import _attachment_text
    parts = [f"De : {m.from_name or ''} <{m.from_email or ''}>", f"Sujet : {m.subject or ''}", f"Date : {m.sent_at}",
             (m.body_text or re.sub(r"<[^>]+>", " ", m.body_html or ""))[:6000]]
    for a in (m.attachments or [])[:3]:
        try:
            name, ctype, data = mail_store.attachment(m.stored_path, a.get("i"))
            parts.append(f"--- Pièce jointe {name} ---\n" + _attachment_text(name, ctype or "", data)[:6000])
        except Exception as e:
            parts.append(f"--- Pièce jointe {a.get('filename')} : illisible ({e})")
    full = "\n".join(parts)
    return full[:16000], full[:1500]


def _num(v):
    try:
        return Decimal(str(v).replace(",", ".").replace(" ", "").replace("$", "")).quantize(Decimal("0.01"))
    except Exception:
        return None


async def _find_invoice(db, raw: str):
    from app.models.invoice import Invoice
    raw = (raw or "").strip().upper()
    digits = re.sub(r"\D", "", raw)
    cands = [raw] + ([f"INV-{digits}", digits] if digits else [])
    for c in cands:
        inv = (await db.execute(select(Invoice).where(func.upper(Invoice.number) == c))).scalar_one_or_none()
        if inv:
            return inv
    return None


async def examine(db, m) -> str:
    """Examine un courriel ; enregistre le resultat et, si c'est un avis de paiement, la proposition."""
    from app.core import zeko
    from app.models.zeko import ZekoMailScan, ZekoProposal
    from app.models.bank_account import BankTransaction
    from app.core.bank_matching import invoice_balances
    full, evidence = await _text_of(m)
    content = await zeko.complete([{"role": "user", "content": PROMPT + "\n\n" + full}], purpose="avis_paiement", timeout=1800)
    mm = re.search(r"\{.*\}", content, re.S)
    x = json.loads(mm.group(0)) if mm else {}
    if not x.get("paiement_recu"):
        db.add(ZekoMailScan(mail_message_id=m.id, result="pas_un_paiement", extracted=json.dumps(x, ensure_ascii=False)[:4000]))
        return "pas_un_paiement"
    db.add(ZekoMailScan(mail_message_id=m.id, result="paiement", extracted=json.dumps(x, ensure_ascii=False)[:4000]))
    return await build(db, m, x, evidence)


async def build(db, m, x: dict, evidence: str | None) -> str:
    """Construit (ou reconstruit) la proposition d'un avis deja lu -- sans IA : sert aussi a revérifier apres une
    correction de donnees ou l'arrivee d'un nouveau releve."""
    from app.models.zeko import ZekoProposal
    from app.models.bank_account import BankTransaction
    from app.core.bank_matching import invoice_balances
    old = (await db.execute(select(ZekoProposal).where(ZekoProposal.mail_message_id == m.id,
                                                       ZekoProposal.status.in_(("proposee", "a_corriger", "sans_depot", "deja_associe"))))).scalars().all()
    for o in old:
        await db.delete(o)
    await db.flush()
    taken = set((await db.execute(select(ZekoProposal.bank_transaction_id).where(
        ZekoProposal.status.in_(("proposee", "acceptee")), ZekoProposal.bank_transaction_id.is_not(None)))).scalars().all())
    total = _num(x.get("montant_total"))
    lines, problems = [], []
    for f in x.get("factures") or []:
        amt = _num(f.get("montant"))
        inv = await _find_invoice(db, str(f.get("numero") or ""))
        if not inv:
            problems.append(f"facture « {f.get('numero')} » introuvable dans ERPCRM" + (f" ({amt} $)" if amt is not None else ""))
            continue
        lines.append({"inv": inv, "amount": amt})
    if len(lines) == 1 and lines[0]["amount"] is None and total is not None:
        lines[0]["amount"] = total
    comp_ids = {l["inv"].company_id for l in lines}
    allocs = []
    if lines:
        settled = await invoice_balances(db, [l["inv"].id for l in lines])
        for l in lines:
            inv, amt = l["inv"], l["amount"]
            left = Decimal(inv.total) - Decimal(settled.get(inv.id, 0))
            if amt is None:
                problems.append(f"{inv.number} : montant payé non indiqué")
            elif amt > left + Decimal("0.004"):
                problems.append(f"{inv.number} : {amt} $ payés selon l'avis, mais ERPCRM ne lui laisse que {left:.2f} $ à payer")
            allocs.append({"invoice_id": str(inv.id), "number": inv.number, "amount": float(amt) if amt is not None else None,
                           "left": float(left)})
    if total is not None and allocs and all(a["amount"] is not None for a in allocs):
        s = sum(Decimal(str(a["amount"])) for a in allocs)
        if s != total:
            problems.append(f"les factures font {s:.2f} $, l'avis dit {total:.2f} $")
    tx, tx_note = None, None
    sent = m.sent_at.date() if m.sent_at else None
    if total is not None and sent:
        cands = (await db.execute(select(BankTransaction).where(
            BankTransaction.amount == total, BankTransaction.posted_date >= sent - timedelta(days=3),
            BankTransaction.posted_date <= sent + timedelta(days=10)))).scalars().all()
        free = [t for t in cands if t.status == "unclassified" and t.id not in taken]
        if len(free) == 1:
            tx = free[0]
        elif len(free) > 1:
            tx_note = f"{len(free)} dépôts de {total:.2f} $ possibles : choix impossible"
        elif cands:
            tx = cands[0]
            tx_note = "le dépôt est déjà associé"
    if tx and tx.status == "matched":
        status = "deja_associe"
    elif not tx:
        status = "sans_depot"
        problems.append(tx_note or f"aucun dépôt de {total} $ trouvé entre 3 jours avant et 10 jours après l'avis")
    elif problems or not allocs:
        status = "a_corriger"
        if not allocs and not problems:
            problems.append("aucune facture lue dans l'avis")
    else:
        status = "proposee"
    db.add(ZekoProposal(mail_message_id=m.id, bank_transaction_id=tx.id if tx else None,
                        company_id=(next(iter(comp_ids)) if len(comp_ids) == 1 else (tx.company_id if tx else m.company_id)),
                        status=status, amount=float(total) if total is not None else None, paid_on=m.sent_at,
                        allocations=json.dumps(allocs, ensure_ascii=False), explanation="; ".join(problems) or None,
                        evidence=evidence))
    return status


async def recheck_all() -> int:
    """Revérifie sans IA les avis pas encore acceptables (donnees corrigees, nouveau releve importe)."""
    from app.core.database import AsyncSessionLocal
    from app.models.zeko import ZekoProposal, ZekoMailScan
    from app.models.mailbox import MailMessage
    n = 0
    async with AsyncSessionLocal() as db:
        props = (await db.execute(select(ZekoProposal).where(ZekoProposal.status.in_(("a_corriger", "sans_depot", "proposee"))))).scalars().all()
        for p in props:
            m = await db.get(MailMessage, p.mail_message_id) if p.mail_message_id else None
            sc = (await db.execute(select(ZekoMailScan).where(ZekoMailScan.mail_message_id == p.mail_message_id))).scalar_one_or_none()
            if not m or not sc or not sc.extracted:
                continue
            before = p.status
            ev = p.evidence
            after = await build(db, m, json.loads(sc.extracted), ev)
            n += after != before
        await db.commit()
    return n


async def run_once(limit: int = 1) -> int:
    """Examine les prochains courriels pas encore lus (boites choisies), les plus recents d'abord."""
    from app.core import zeko
    from app.core.database import AsyncSessionLocal
    from app.models.mailbox import MailMessage, Mailbox
    from app.models.zeko import ZekoMailScan
    if not await zeko.enabled():
        return 0
    n = 0
    async with AsyncSessionLocal() as db:
        bx = await boxes(db)
        done = select(ZekoMailScan.mail_message_id)
        msgs = (await db.execute(select(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(
            func.lower(Mailbox.email).in_(bx), MailMessage.direction == "in", MailMessage.id.not_in(done),
            func.lower(func.coalesce(MailMessage.from_email, "")).not_in(SKIP_SENDERS))
            .order_by(MailMessage.sent_at.desc()).limit(limit))).scalars().all()
        for m in msgs:
            try:
                status = await examine(db, m)
                await db.commit()
                log.info("Zeko avis de paiement : %s (%s) -> %s", m.subject, m.from_email, status)
            except Exception as e:
                await db.rollback()
                db.add(ZekoMailScan(mail_message_id=m.id, result="erreur", extracted=str(e)[:2000]))
                await db.commit()
                log.exception("Zeko avis de paiement : echec sur %s", m.id)
            n += 1
    return n


async def run_poller():
    import asyncio
    await asyncio.sleep(180)
    while True:
        try:
            done = await run_once()
        except Exception:
            log.exception("Zeko avis de paiement")
            done = 0
        if not done:
            try:
                await recheck_all()
            except Exception:
                log.exception("Zeko avis de paiement : reverification")
        await asyncio.sleep(20 if done else 600)
