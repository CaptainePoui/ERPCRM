"""Creation automatique des periodiques (2026-10-04, demande de Philippe : « fais le periodique,
que ce soit achat ou vente ») -- meme pattern que reminder_poller.py.

Toutes les 30 minutes, pour chaque periodique active, cree tous les cycles dus jusqu'a aujourd'hui
(rattrapage du plus ancien d'abord ; chaque cycle une seule fois, verrou sur la periodique) :
- Achats (parametre recurring_auto_purchases, active par defaut) : factures fournisseurs et depenses.
- Ventes (parametre recurring_auto_sales, active le 2026-10-04) : factures creees dans l'ordre
  chronologique toutes compagnies confondues (marche en parallele avec l'ancien logiciel : memes
  numeros INV-) ; facture client emise mais
  « non transmise » -- ERPCRM n'envoie jamais rien au client tout seul. Un cycle date dans une
  periode de taxes deja declaree n'est jamais cree automatiquement (a faire a la main).
Chaque document est enregistre dans sa propre transaction : une erreur n'arrete pas les autres.
"""
import asyncio
import logging
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.api.v1.endpoints.settings import get_setting
from app.api.v1.endpoints.purchases import (NothingDue, _lock, create_recurring_bill, create_recurring_expense)
from app.api.v1.endpoints.recurring_billing import (NothingToGenerate, CycleCoveredByBarter, create_recurring_invoice,
                                                    lock_recurrence, next_missing_cycle)
from app.models.purchases import RecurringBill, RecurringExpense
from app.models.recurring_billing import CompanyRecurringBilling

log = logging.getLogger("recurring_poller")

_POLL_INTERVAL = 30 * 60   # secondes
_MAX_CYCLES = 60           # garde-fou par periodique et par passage


async def _ids(model) -> list:
    async with AsyncSessionLocal() as db:
        return list((await db.execute(select(model.id).where(model.is_active.is_(True)))).scalars().all())


async def _purchases() -> int:
    made = 0
    for model, create in ((RecurringBill, create_recurring_bill), (RecurringExpense, create_recurring_expense)):
        for rid in await _ids(model):
            for _ in range(_MAX_CYCLES):
                async with AsyncSessionLocal() as db:
                    try:
                        r = await _lock(db, model, rid)
                        await create(db, r)
                        await db.commit()
                        made += 1
                        log.info("Periodique d'achat %s (%s) : cycle cree", r.name, model.__tablename__)
                    except NothingDue:
                        await db.rollback()
                        break
                    except Exception:
                        await db.rollback()
                        log.exception("Periodique d'achat %s : creation echouee", rid)
                        break
    return made


async def _next_due_sale(tax_lock: date | None, skip: set):
    """Cycle du le plus ancien, toutes compagnies confondues : les factures sont creees dans l'ordre
    chronologique (comme l'ancien logiciel qui tourne en parallele -- memes numeros INV-)."""
    async with AsyncSessionLocal() as db:
        rbs = (await db.execute(select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines),
                                                                         selectinload(CompanyRecurringBilling.company))
                                .where(CompanyRecurringBilling.is_active.is_(True)))).scalars().all()
        due = []
        for rb in rbs:
            if rb.id in skip or not rb.lines:
                continue
            start, _end = next_missing_cycle(rb)
            if start > date.today() or (rb.end_date and start > rb.end_date):
                continue
            if tax_lock and start <= tax_lock:
                log.warning("Facture periodique %s : cycle du %s dans une periode de taxes declaree, non cree", rb.name, start)
                skip.add(rb.id)
                continue
            due.append((start, rb.company.name, rb.id))
        return min(due)[2] if due else None


async def _sales() -> int:
    made = 0
    async with AsyncSessionLocal() as db:
        lock_s = (await get_setting(db, "tax_lock_date") or "").strip()
    tax_lock = date.fromisoformat(lock_s) if lock_s else None
    skip: set = set()
    for _ in range(_MAX_CYCLES * 10):
        rid = await _next_due_sale(tax_lock, skip)
        if rid is None:
            break
        async with AsyncSessionLocal() as db:
            try:
                rb = await lock_recurrence(db, rid)
                inv = await create_recurring_invoice(db, rb, issue=True)
                await db.commit()
                made += 1
                log.info("Facture periodique %s : facture %s creee (non transmise)", rb.name, inv.number)
            except NothingToGenerate:
                await db.rollback()
                skip.add(rid)
            except CycleCoveredByBarter as e:
                log.info("Facture periodique %s : %s", rb.name, e)
                await db.commit()        # cycle marque fait, sans facture ; le cycle suivant peut etre du aussi
            except Exception:
                await db.rollback()
                log.exception("Facture periodique %s : creation echouee", rid)
                skip.add(rid)
    return made


async def run_recurring_once() -> dict:
    async with AsyncSessionLocal() as db:
        purchases_on = (await get_setting(db, "recurring_auto_purchases")) == "true"
        sales_on = (await get_setting(db, "recurring_auto_sales")) == "true"
    return {"purchases": await _purchases() if purchases_on else None,
            "sales": await _sales() if sales_on else None}


async def run_recurring_poller():
    await asyncio.sleep(60)   # laisser le demarrage se terminer
    while True:
        try:
            await run_recurring_once()
        except Exception:
            log.exception("Iteration du poller des periodiques echouee")
        await asyncio.sleep(_POLL_INTERVAL)
