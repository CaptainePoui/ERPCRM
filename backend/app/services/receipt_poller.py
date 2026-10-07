"""Analyse des recus deposes (TASK-044.1) -- un a la fois, le plus vieux depot d'abord.

Lecture (pdftotext / Tesseract) -> IA locale (lecture des champs) -> verifications du programme.
Tout est vert et aucune depense identique n'existe deja -> depense creee (fichier joint) puis liee au
retrait bancaire s'il est unique ; sinon « A verifier » (lecture pre-remplie, corrigee par Philippe).
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.receipt_reader import ReadError, extract_text, ai_extract, normalize, settle, check, to_json
from app.models.purchases import ReceiptDocument, Expense, ExpenseCategory, Vendor

log = logging.getLogger("receipt_poller")

_POLL_INTERVAL = 15


async def process_one() -> bool:
    async with AsyncSessionLocal() as db:
        from app.api.v1.endpoints.purchases import RECEIPT_QUEUE_ORDER, create_expense_from_receipt, link_expense_to_bank
        d = (await db.execute(select(ReceiptDocument).where(ReceiptDocument.status.in_(["pending", "reading", "analyzing"]))
                              .order_by(*RECEIPT_QUEUE_ORDER).limit(1))).scalar_one_or_none()
        if not d:
            return False
        try:
            d.status = "reading"
            await db.commit()
            text, method = await asyncio.to_thread(extract_text, Path(d.stored_path))
            d.text = text[:50000]
            if len(text.strip()) < 15:
                raise ReadError("Aucun texte lisible dans ce fichier")
            d.status = "analyzing"
            await db.commit()
            categories = list((await db.execute(select(ExpenseCategory.name).where(ExpenseCategory.is_active.is_(True)))).scalars().all())
            vendors = list((await db.execute(select(Vendor.name).where(Vendor.is_active.is_(True)))).scalars().all())
            r = settle(normalize(await ai_extract(text, categories, vendors)))
            checks = check(r)
            # Meme depense deja enregistree (meme date, meme total) : jamais en double
            if r["date"] and r["total"]:
                same = (await db.execute(select(Expense.id).where(Expense.expense_date == r["date"], Expense.total == r["total"]))).first()
                checks.append({"ok": not same, "label": "Aucune dépense identique déjà enregistrée (même date, même total)"})
            d.extracted, d.checks = to_json(r), json.dumps(checks, ensure_ascii=False)
            d.processed_at = datetime.now(timezone.utc)
            if all(c["ok"] for c in checks):
                e = await create_expense_from_receipt(db, d, r)
                await db.commit()
                await link_expense_to_bank(db, e)
                log.info("Recu %s : depense creee (%s $)", d.filename, r["total"])
            else:
                d.status = "review"
                await db.commit()
        except (ReadError, Exception) as ex:   # noqa: BLE001 -- un recu en echec ne bloque jamais la file
            await db.rollback()
            d = await db.get(ReceiptDocument, d.id)
            d.status, d.error = "failed", str(ex)[:500]
            d.processed_at = datetime.now(timezone.utc)
            await db.commit()
            log.warning("Recu %s : echec (%s)", d.filename, ex)
        return True


async def run_receipt_poller():
    await asyncio.sleep(60)
    while True:
        try:
            if settings.LOCAL_AI_URL:
                while await process_one():
                    pass
        except Exception:
            log.exception("Iteration de l'analyse des recus echouee")
        await asyncio.sleep(_POLL_INTERVAL)
