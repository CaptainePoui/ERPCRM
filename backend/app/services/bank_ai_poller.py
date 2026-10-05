"""IA locale pour la banque (TASK-042.2, 2026-10-05, demande de Philippe : « mon IA locale qui gère
un fichier importé… une sécurité si les autres connexions se perdent »).

Pour chaque depot non reconnu (ai_status = pending), demande a l'IA locale (settings.LOCAL_AI_URL,
API compatible OpenAI -- Ollama) quel client a probablement fait ce depot, parmi les compagnies
facturees dans la derniere annee. Le resultat est une PROPOSITION (ai_company_id, ai_confidence, ai_note) :
Philippe l'accepte ou la corrige dans l'onglet Banque ; l'IA ne confirme jamais rien et ne touche
jamais aux montants. Lent sur ce serveur (~1 min par appel, sans carte graphique) : lots de 8 lignes,
en arriere-plan.
"""
import asyncio
import json
import logging
import re
from datetime import date, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.bank_matching import invoice_balances, OPEN_STATUSES
from app.models.bank_account import BankTransaction, BankPayeeRule
from app.models.company import Company
from app.models.invoice import Invoice

log = logging.getLogger("bank_ai_poller")

_POLL_INTERVAL = 60
_BATCH = 8
_TIMEOUT = 900


async def _context(db) -> tuple[list[dict], list[str]]:
    """Clients factures dans les 13 derniers mois (nom + soldes ouverts s'il y en a) et exemples de
    beneficiaires deja reconnus. Pas seulement les soldes ouverts : un depot peut correspondre a une
    facture deja marquee payee (paiement anterieur importe)."""
    since = date.today() - timedelta(days=400)
    invs = (await db.execute(select(Invoice).where(Invoice.credit_of_id.is_(None), Invoice.issue_date >= since,
                                                   Invoice.status.not_in(["brouillon", "annulee"])))).scalars().all()
    open_invs = [i for i in invs if i.status in OPEN_STATUSES]
    paid = await invoice_balances(db, [i.id for i in open_invs])
    names = dict((await db.execute(select(Company.id, Company.name))).all())
    by_company: dict = {i.company_id: [] for i in invs}
    for i in open_invs:
        bal = i.total - (paid.get(i.id) or Decimal("0"))
        if bal > 0:
            by_company[i.company_id].append(f"{bal:.2f}")
    clients = [{"nom": names[c], **({"soldes_ouverts": b[:6]} if b else {})} for c, b in by_company.items() if c in names]
    rules = (await db.execute(select(BankPayeeRule))).scalars().all()
    examples = [f"« {r.payee_label} » = {names.get(r.company_id, '?')}" for r in rules[:40]]
    return clients, examples


def _prompt(txs: list[BankTransaction], clients: list[dict], examples: list[str]) -> str:
    lines = [{"n": k, "date": str(t.posted_date), "montant": f"{t.amount:.2f}", "description": t.description,
              "beneficiaire": t.payee or ""} for k, t in enumerate(txs)]
    return (
        "Tu aides une entreprise québécoise à identifier quel client a fait chaque dépôt bancaire.\n"
        "Clients facturés dans la dernière année (nom, et soldes ouverts s'il y en a) :\n" + json.dumps(clients, ensure_ascii=False) + "\n"
        + ("Bénéficiaires déjà reconnus par le passé :\n" + "\n".join(examples) + "\n" if examples else "")
        + "Dépôts à identifier :\n" + json.dumps(lines, ensure_ascii=False) + "\n"
        "Pour chaque dépôt, choisis le client le plus probable dans la liste (nom EXACT tel qu'écrit) ou null si "
        "rien ne permet de le dire. Un montant égal à un solde ouvert est un indice fort. Ne devine pas : "
        "certitude basse si tu n'es pas sûr.\n"
        "Réponds UNIQUEMENT en JSON : [{\"n\": 0, \"client\": \"...\" ou null, \"certitude\": 0-100, "
        "\"raison\": \"courte phrase en français\"}]"
    )


def _parse(text: str) -> list[dict]:
    m = re.search(r"\[.*\]", text, re.S)
    if not m:
        raise ValueError("pas de JSON")
    return json.loads(m.group(0))


async def run_bank_ai_once() -> int:
    if not settings.LOCAL_AI_URL:
        return 0
    async with AsyncSessionLocal() as db:
        txs = (await db.execute(select(BankTransaction).where(BankTransaction.ai_status == "pending")
                                .order_by(BankTransaction.posted_date).limit(_BATCH))).scalars().all()
        if not txs:
            return 0
        clients, examples = await _context(db)
        by_name = {n.strip().lower(): cid for cid, n in (await db.execute(select(Company.id, Company.name))).all()}
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                r = await client.post(f"{settings.LOCAL_AI_URL.rstrip('/')}/chat/completions", json={
                    "model": settings.LOCAL_AI_MODEL, "temperature": 0,
                    "messages": [{"role": "user", "content": _prompt(txs, clients, examples)}]})
                r.raise_for_status()
                answers = {a.get("n"): a for a in _parse(r.json()["choices"][0]["message"]["content"])}
        except Exception as e:
            log.warning("IA locale indisponible ou reponse illisible (%s) -- nouvel essai au prochain passage", e)
            return 0
        for k, t in enumerate(txs):
            a = answers.get(k) or {}
            name = (a.get("client") or "").strip().lower()
            t.ai_company_id = by_name.get(name)          # nom inconnu = pas de proposition
            t.ai_confidence = int(a.get("certitude") or 0) if t.ai_company_id else None
            t.ai_note = (a.get("raison") or "")[:500] or None
            t.ai_status = "done"
        await db.commit()
        log.info("IA locale : %d depot(s) analyse(s)", len(txs))
        return len(txs)


async def run_bank_ai_poller():
    await asyncio.sleep(90)
    while True:
        try:
            while await run_bank_ai_once():
                pass
        except Exception:
            log.exception("Iteration de l'IA bancaire echouee")
        await asyncio.sleep(_POLL_INTERVAL)
