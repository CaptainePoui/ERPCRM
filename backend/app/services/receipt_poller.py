"""Analyse des recus deposes (TASK-044.1) -- un a la fois, le plus vieux depot d'abord.

Lecture (pdftotext / Tesseract) -> IA locale (lecture des champs) -> verifications du programme.
Tout est vert et aucune depense identique n'existe deja -> depense creee (fichier joint) puis liee au
retrait bancaire s'il est unique ; sinon « A verifier » (lecture pre-remplie, corrigee par Philippe).
"""
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.receipt_reader import ReadError, extract_text, ai_extract, normalize, settle, check, to_json
from app.models.purchases import ReceiptDocument, Expense, ExpenseCategory, Vendor

log = logging.getLogger("receipt_poller")

_POLL_INTERVAL = 15


def _file_tokens(name: str) -> set[str]:
    from app.core.bank_matching import _tokens
    return {t for t in _tokens(re.sub(r"\.[a-z0-9]{2,4}$", "", name.lower())) if not t.isdigit() and len(t) > 2}


async def vendor_examples(db, text: str, filename: str) -> tuple:
    """Fournisseur reconnu + lectures validees de ses factures (les plus recentes d'abord). C'est
    l'« entrainement » de l'IA : chaque facture validee ou corrigee par Philippe devient l'exemple des
    suivantes. Reconnaissance : 1) nom de fichier semblable a celui d'une facture deja validee du
    fournisseur (« Bell_Cell… » -> Bell Cellulaire) ; 2) nom du fournisseur dans le nom du fichier ou le
    texte (« scopserv.com » -> ScopServ) -- a egalite entre plusieurs fournisseurs, aucun n'est choisi."""
    from app.core.bank_matching import _tokens
    ft = _file_tokens(filename)
    by_file: dict = {}
    if ft:
        for vid, fname in (await db.execute(select(Expense.vendor_id, ReceiptDocument.filename)
                                            .join(Expense, Expense.id == ReceiptDocument.expense_id)
                                            .where(ReceiptDocument.status == "created", Expense.vendor_id.is_not(None)))).all():
            other = _file_tokens(fname)
            if other and len(ft & other) / len(ft | other) >= 0.5:
                by_file[vid] = by_file.get(vid, 0) + 1
    vendor_id = None
    if len(by_file) == 1:
        vendor_id = next(iter(by_file))
    else:
        hay = _tokens(f"{filename} {text[:4000]}")
        scored = sorted(((len(tk), vid) for vid, name in (await db.execute(select(Vendor.id, Vendor.name).where(Vendor.is_active.is_(True)))).all()
                         if (tk := _tokens(name)) and tk <= hay), key=lambda x: x[0], reverse=True)
        if scored and (len(scored) == 1 or scored[0][0] > scored[1][0]):
            vendor_id = scored[0][1]
    if not vendor_id:
        return None, []
    rows = (await db.execute(select(ReceiptDocument.extracted).join(Expense, Expense.id == ReceiptDocument.expense_id)
                             .where(Expense.vendor_id == vendor_id, ReceiptDocument.status == "created")
                             .order_by(ReceiptDocument.processed_at.desc().nulls_last()).limit(2))).scalars().all()
    out = []
    for x in rows:
        ex = json.loads(x)
        ex.pop("correction", None)
        out.append(ex)
    return vendor_id, out


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
            hint_vendor_id, examples = await vendor_examples(db, text, d.filename)
            r = settle(normalize(await ai_extract(text, categories, vendors, d.filename, examples)))
            # Fournisseur lu par l'IA inconnu (ex. un nom de produit « SCOPCOMM ») mais fournisseur reconnu
            # dans le nom du fichier ou le texte (« scopserv.com ») : le fournisseur reconnu l'emporte
            vendor_id = None
            if hint_vendor_id:
                from app.core.bank_matching import name_similarity
                ai_name = r["fournisseur"] or ""
                if not any((name_similarity(ai_name, n) + name_similarity(n, ai_name)) / 2 >= 0.6
                           for n in (await db.execute(select(Vendor.name))).scalars().all()):
                    hv = await db.get(Vendor, hint_vendor_id)
                    r["fournisseur"], vendor_id = hv.name, hv.id
            checks = check(r)
            # Meme depense deja enregistree (meme date, meme total) : jamais en double
            if r["date"] and r["total"]:
                same = (await db.execute(select(Expense.id).where(Expense.expense_date == r["date"], Expense.total == r["total"]))).first()
                checks.append({"ok": not same, "label": "Aucune dépense identique déjà enregistrée (même date, même total)"})
            # Nouveau fournisseur qui ressemble a un existant (« Bell Mobilité » / « Bell Cellulaire ») : a confirmer
            if not vendor_id and r["fournisseur"]:
                from app.core.bank_matching import name_similarity, _tokens
                names = list((await db.execute(select(Vendor.name).where(Vendor.is_active.is_(True)))).scalars().all())
                exact = any((name_similarity(r["fournisseur"], n) + name_similarity(n, r["fournisseur"])) / 2 >= 0.6 for n in names)
                alike = [n for n in names if _tokens(n) & _tokens(r["fournisseur"])]
                if not exact and alike:
                    checks.append({"ok": False, "label": f"Fournisseur « {r['fournisseur']} » nouveau, ressemble à : {', '.join(alike[:3])} — à confirmer"})
            d.extracted, d.checks = to_json(r), json.dumps(checks, ensure_ascii=False)
            d.processed_at = datetime.now(timezone.utc)
            if all(c["ok"] for c in checks):
                e = await create_expense_from_receipt(db, d, r, vendor_id)
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
