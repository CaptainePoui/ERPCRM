"""IA locale pour la banque (TASK-042.2, 2026-10-05, demande de Philippe : « mon IA locale qui gère
un fichier importé… une sécurité si les autres connexions se perdent »).

Pour chaque depot non reconnu (ai_status = pending), demande a l'IA locale (settings.LOCAL_AI_URL,
API compatible OpenAI -- Ollama) quel client a probablement fait ce depot, parmi les compagnies
facturees dans la derniere annee. Le resultat est une PROPOSITION (ai_company_id, ai_confidence, ai_note) :
Philippe l'accepte ou la corrige dans l'onglet Banque ; l'IA ne confirme jamais rien et ne touche
jamais aux montants. Etape 1 sans IA : correspondance evidente du nom (instantanee). Etape 2 : l'IA,
un depot par appel, la liste des clients en tete (identique d'un appel a l'autre, gardee en memoire
par Ollama) -- les lots de 8 prenaient ~5 min par depot et dispersaient l'attention (2026-10-05).
"""
import asyncio
import json
import logging
import re
import time
from datetime import date, timedelta
from decimal import Decimal

import httpx
from sqlalchemy import select

from app.core import clock, zeko
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.bank_matching import invoice_balances, OPEN_STATUSES, name_similarity, _tokens
from app.models.bank_account import BankTransaction, BankPayeeRule
from app.models.company import Company
from app.models.invoice import Invoice

log = logging.getLogger("bank_ai_poller")

_POLL_INTERVAL = 15            # verification de la file (requete legere) ; l'IA ne tourne que s'il y a du travail
SECONDS_PER_DEPOSIT = 30       # mesure du 2026-10-05 (~27 s) -- sert au decompte affiche
# File : le plus vieil import d'abord (demande de Philippe, 2026-10-06), puis la date du releve
QUEUE_ORDER = (BankTransaction.created_at, BankTransaction.posted_date, BankTransaction.id)
_BATCH = 20          # depots confies a l'IA par passage (un par appel)
_TIMEOUT = 900


async def _context(db) -> tuple[list[dict], list[str]]:
    """Clients factures dans les 13 derniers mois (nom + soldes ouverts s'il y en a) et exemples de
    beneficiaires deja reconnus. Pas seulement les soldes ouverts : un depot peut correspondre a une
    facture deja marquee payee (paiement anterieur importe)."""
    since = clock.today() - timedelta(days=400)
    invs = (await db.execute(select(Invoice).where(Invoice.credit_of_id.is_(None), Invoice.issue_date >= since,
                                                   Invoice.status.not_in(["brouillon", "annulee"])))).scalars().all()
    open_invs = [i for i in invs if i.status in OPEN_STATUSES]
    paid = await invoice_balances(db, [i.id for i in open_invs])
    names = dict((await db.execute(select(Company.id, Company.name))).all())
    by_company: dict = {i.company_id: [] for i in invs}
    for i in sorted(open_invs, key=lambda x: x.issue_date):
        bal = i.total - (paid.get(i.id) or Decimal("0"))
        if bal > 0:
            by_company[i.company_id].append({"date": str(i.issue_date), "solde": f"{bal:.2f}"})
    clients = [{"nom": names[c], **({"factures_ouvertes": b[:6]} if b else {})} for c, b in by_company.items() if c in names]
    rules = (await db.execute(select(BankPayeeRule))).scalars().all()
    examples = [f"« {r.payee_label} » = {names.get(r.company_id, '?')}" for r in rules[:40]]
    return clients, examples


def _name_match(t: BankTransaction, companies: list[tuple]) -> tuple | None:
    """Etape 1, sans IA : le beneficiaire contient clairement le nom d'un seul client
    (ex. « PHYSOTECH » -> Physotech, « PISCINES ET SPA » -> Piscine et Spa Paseidon)."""
    text = t.payee or t.description
    if not _tokens(text):
        return None
    scored = []
    for cid, name in companies:
        fwd = name_similarity(text, name)            # mots du client retrouves dans le beneficiaire
        rev = name_similarity(name, text)            # mots du beneficiaire retrouves dans le client
        if fwd and rev:
            scored.append(((fwd + rev) / 2, cid, name))
    scored.sort(reverse=True)
    if not scored or scored[0][0] < 0.6 or (len(scored) > 1 and scored[0][0] - scored[1][0] < 0.2):
        return None
    return scored[0]


def _system_prompt(clients: list[dict], examples: list[str]) -> str:
    """Identique d'un depot a l'autre : Ollama garde ce debut en memoire et ne le relit pas."""
    return (
        "Tu aides une entreprise québécoise à identifier quel client a fait un dépôt bancaire.\n"
        "Clients facturés dans la dernière année (nom, et factures ouvertes avec date et solde s'il y en a) :\n" + json.dumps(clients, ensure_ascii=False) + "\n"
        + ("Bénéficiaires déjà reconnus par le passé :\n" + "\n".join(examples) + "\n" if examples else "")
        + "Choisis le client le plus probable dans la liste (nom EXACT tel qu'écrit) ou null si rien ne permet de le dire. "
        "Un nom de bénéficiaire qui ressemble au nom du client, ou un montant égal au solde d'une facture ouverte, sont des indices forts. "
        "Un client paie habituellement entre 1 et 30 jours après la date de la facture, parfois plus tard s'il est en retard ; "
        "une facture datée après le dépôt est peu probable (sauf paiement d'avance). "
        "Ne devine pas : certitude basse si tu n'es pas sûr.\n"
        "Réponds UNIQUEMENT en JSON : {\"client\": \"...\" ou null, \"certitude\": 0-100, \"raison\": \"courte phrase en français\"}"
    )


def _parse(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("pas de JSON")
    return json.loads(m.group(0))


async def _ask(system: str, t: BankTransaction) -> dict:
    deposit = {"date": str(t.posted_date), "montant": f"{t.amount:.2f}", "description": t.description, "beneficiaire": t.payee or ""}
    # Par Zeko (core/zeko.py). Reflexion courte : ~90 jetons au lieu de plusieurs centaines, meme reponse sur les cas
    # testes (PATIO DESIGN -> Construction Nationale, 90 %) ; c'est l'ecriture qui coute sur ce processeur.
    content = await zeko.complete([{"role": "system", "content": system},
                                   {"role": "user", "content": "Dépôt à identifier : " + json.dumps(deposit, ensure_ascii=False)}],
                                  purpose="depot_bancaire", timeout=_TIMEOUT)
    return _parse(content)


async def run_bank_ai_once() -> int:
    """Traite les depots en attente : d'abord par les noms (instantane), puis l'IA, UN depot par
    appel (plus rapide et plus juste que des lots sur ce serveur sans carte graphique)."""
    if not await zeko.enabled():
        return 0
    async with AsyncSessionLocal() as db:
        # Comparaison des noms sur TOUS les depots en attente (instantane), l'IA ensuite par paquets
        txs = (await db.execute(select(BankTransaction).where(BankTransaction.ai_status == "pending")
                                .order_by(*QUEUE_ORDER))).scalars().all()
        if not txs:
            return 0
        clients, examples = await _context(db)
        invoiced = select(Invoice.company_id).distinct()
        companies = list((await db.execute(select(Company.id, Company.name).where(Company.id.in_(invoiced)))).all())
        by_name = {n.strip().lower(): cid for cid, n in companies}
        rest = []
        for t in txs:
            m = _name_match(t, companies)
            if m:
                score, cid, name = m
                t.ai_company_id, t.ai_confidence, t.ai_status = cid, min(95, round(score * 100)), "done"
                t.ai_note = f"Le bénéficiaire « {t.payee or t.description} » correspond au nom du client (comparaison des noms)"
            else:
                rest.append(t)
        await db.commit()
        rest = rest[:_BATCH]
        system = _system_prompt(clients, examples)
        for t in rest:
            started = time.monotonic()
            try:
                a = await _ask(system, t)
            except Exception as e:
                log.warning("IA locale indisponible ou reponse illisible (%s) -- nouvel essai au prochain passage", e)
                break
            t.ai_company_id = by_name.get((a.get("client") or "").strip().lower())   # nom inconnu = pas de proposition
            t.ai_confidence = int(a.get("certitude") or 0) if t.ai_company_id else None
            t.ai_note = (a.get("raison") or "")[:500] or None
            t.ai_status = "done"
            await db.commit()
            log.info("IA locale : depot du %s (%s $) analyse en %.0f s", t.posted_date, t.amount, time.monotonic() - started)
        return len(txs) - len(rest) + sum(1 for t in rest if t.ai_status == "done")


async def run_sure_pass() -> int:
    """Associe toutes les lignes dont la correspondance est sure (Philippe, 2026-10-07 : « pas besoin
    de l'étape Valider, le rapprochement est sûr ») : une facture creee plus tard, une regle ajoutee ou
    un recu transforme en depense peuvent rendre sure une ligne restee en attente. Annulable."""
    from app.api.v1.endpoints.bank import _auto_associate
    async with AsyncSessionLocal() as db:
        ids = list((await db.execute(select(BankTransaction.id).where(BankTransaction.status == "unclassified"))).scalars().all())
        from app.core.bank_matching import propose_vendors
        await propose_vendors(db, ids)
        await db.commit()
        n = await _auto_associate(db, ids)
    if n:
        log.info("Rapprochement : %d transaction(s) associee(s) (correspondance sure)", n)
    return n


_SURE_EVERY = 600


async def run_bank_ai_poller():
    await asyncio.sleep(90)
    last_sure = 0.0
    while True:
        try:
            if time.monotonic() - last_sure >= _SURE_EVERY:
                await run_sure_pass()
                last_sure = time.monotonic()
            while await run_bank_ai_once():
                pass
        except Exception:
            log.exception("Iteration de l'IA bancaire echouee")
        await asyncio.sleep(_POLL_INTERVAL)
