"""Echanges (troc) d'une compagnie -- fiche, deductions, pieces justificatives, effet sur la facture
periodique (TASK-005.13). Le calcul des cycles couverts est dans app/core/barter.py."""
import re
import uuid
from datetime import date
from decimal import Decimal
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import barter as bt
from app.core.database import get_db
from app.models.barter import BarterExchange, BarterDeduction, BarterFile
from app.models.company import Company
from app.models.invoice import Invoice
from app.models.recurring_billing import CompanyRecurringBilling
from app.models.user import User
from sqlalchemy.orm import selectinload

router = APIRouter()

FILES_DIR = Path(__file__).resolve().parents[4] / "storage" / "barter"
MAX_FILE_BYTES = 25 * 1024 * 1024


class DeductionIn(BaseModel):
    description: str
    qty: float = 1
    unit_price: float


class BarterIn(BaseModel):
    exchange_date: date
    description: str
    received_value: float
    recurring_billing_id: uuid.UUID | None = None
    notes: str | None = None
    deductions: list[DeductionIn] = []


async def _rb(db, rb_id) -> CompanyRecurringBilling:
    return (await db.execute(select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines))
                             .where(CompanyRecurringBilling.id == rb_id))).scalar_one_or_none()


async def _get(db, bid: uuid.UUID) -> BarterExchange:
    b = (await db.execute(select(BarterExchange).where(BarterExchange.id == bid).execution_options(populate_existing=True))).scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=404, detail="Échange introuvable")
    return b


async def _out(db, b: BarterExchange, rb_names: dict) -> dict:
    inv_ids = [a.invoice_id for a in b.applications if a.invoice_id]
    numbers = dict((await db.execute(select(Invoice.id, Invoice.number).where(Invoice.id.in_(inv_ids)))).all()) if inv_ids else {}
    ded_total = sum((Decimal(d.qty) * Decimal(d.unit_price) for d in b.deductions), Decimal("0"))
    return {
        "id": str(b.id), "exchange_date": b.exchange_date, "description": b.description,
        "received_value": float(b.received_value), "notes": b.notes,
        "recurring_billing_id": str(b.recurring_billing_id) if b.recurring_billing_id else None,
        "recurring_name": rb_names.get(b.recurring_billing_id),
        "deductions": [{"id": str(d.id), "description": d.description, "qty": float(d.qty), "unit_price": float(d.unit_price),
                        "total": float(bt._m(Decimal(d.qty) * Decimal(d.unit_price)))} for d in b.deductions],
        "deductions_total": float(bt._m(ded_total)),
        "credit": float(bt.credit_of(b)), "used": float(bt.used_of(b)), "remaining": float(bt.remaining_of(b)),
        "files": [{"id": str(f.id), "filename": f.filename, "size": f.size} for f in b.files],
        "applications": [{"cycle_start": a.cycle_start, "cycle_end": a.cycle_end, "covered_until": a.covered_until,
                          "amount": float(a.amount), "invoice_id": str(a.invoice_id) if a.invoice_id else None,
                          "invoice_number": numbers.get(a.invoice_id)} for a in b.applications],
    }


@router.get("/companies/{company_id}")
async def list_barters(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Echanges de la compagnie + ses factures periodiques avec l'effet du credit restant (cycles couverts,
    facture repoussee)."""
    rbs = (await db.execute(select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines))
                            .where(CompanyRecurringBilling.company_id == company_id)
                            .order_by(CompanyRecurringBilling.created_at))).scalars().all()
    names = {rb.id: (rb.name or "Facture périodique") for rb in rbs}
    rows = (await db.execute(select(BarterExchange).where(BarterExchange.company_id == company_id)
                             .order_by(BarterExchange.exchange_date.desc(), BarterExchange.created_at.desc()))).scalars().all()
    recurrences = []
    for rb in rbs:
        recurrences.append({"id": str(rb.id), "name": names[rb.id], "frequency": rb.frequency, "is_active": rb.is_active,
                            "cycle_amount": float(bt.cycle_amount(rb)), "last_invoice_date": rb.last_invoice_date,
                            "projection": await bt.projection(db, rb) if rb.is_active else []})
    return {"exchanges": [await _out(db, b, names) for b in rows], "recurrences": recurrences}


async def _apply(db, b: BarterExchange, payload: BarterIn) -> None:
    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="Décrivez ce que la compagnie a donné")
    if payload.received_value <= 0:
        raise HTTPException(status_code=400, detail="La valeur reçue doit être plus grande que 0")
    if payload.recurring_billing_id:
        rb = await _rb(db, payload.recurring_billing_id)
        if not rb or rb.company_id != b.company_id:
            raise HTTPException(status_code=400, detail="Facture périodique introuvable pour cette compagnie")
    if b.applications and payload.recurring_billing_id != b.recurring_billing_id:
        raise HTTPException(status_code=400, detail="Le crédit a déjà servi sur cette facture périodique : elle ne peut plus être changée")
    b.exchange_date, b.description = payload.exchange_date, payload.description.strip()[:500]
    b.received_value, b.notes = bt._m(payload.received_value), (payload.notes or "").strip() or None
    b.recurring_billing_id = payload.recurring_billing_id
    b.deductions.clear()
    for i, d in enumerate(payload.deductions):
        if d.description.strip() and d.unit_price:
            b.deductions.append(BarterDeduction(description=d.description.strip()[:500], qty=bt._m(d.qty), unit_price=bt._m(d.unit_price), sort_order=i))
    if bt.credit_of(b) < 0:
        raise HTTPException(status_code=400, detail="Les déductions dépassent la valeur reçue")
    if bt.credit_of(b) < bt.used_of(b):
        raise HTTPException(status_code=400, detail=f"Le crédit ne peut pas être plus petit que ce qui a déjà servi ({bt.used_of(b)} $)")


@router.post("/companies/{company_id}", status_code=201)
async def create_barter(company_id: uuid.UUID, payload: BarterIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if not await db.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    b = BarterExchange(company_id=company_id, deductions=[], files=[], applications=[])
    await _apply(db, b, payload)
    db.add(b)
    await db.commit()
    return {"id": str(b.id)}


@router.put("/{bid}")
async def update_barter(bid: uuid.UUID, payload: BarterIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await _get(db, bid)
    await _apply(db, b, payload)
    await db.commit()
    return {"id": str(b.id)}


@router.delete("/{bid}")
async def delete_barter(bid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await _get(db, bid)
    if b.applications:
        raise HTTPException(status_code=400, detail="Le crédit a déjà servi sur la facturation : l'échange reste comme preuve")
    paths = [f.stored_path for f in b.files]
    await db.delete(b)
    await db.commit()
    for p in paths:
        Path(p).unlink(missing_ok=True)
    return {"deleted": True}


@router.post("/{bid}/files")
async def upload_files(bid: uuid.UUID, files: list[UploadFile] = File(...), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    b = await _get(db, bid)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    added = []
    for up in files:
        raw = await up.read()
        if not raw:
            continue
        if len(raw) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail=f"« {up.filename} » dépasse 25 Mo")
        fid = uuid.uuid4()
        name = (up.filename or "fichier")[:255]
        path = FILES_DIR / f"{fid}_{re.sub(r'[^A-Za-z0-9._-]+', '_', name)[:150]}"
        path.write_bytes(raw)
        b.files.append(BarterFile(id=fid, filename=name, stored_path=str(path), size=len(raw)))
        added.append(name)
    await db.commit()
    return {"added": added}


@router.get("/files/{fid}")
async def get_file(fid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    f = await db.get(BarterFile, fid)
    if not f or not Path(f.stored_path).exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return FileResponse(f.stored_path, filename=f.filename)


@router.delete("/files/{fid}")
async def delete_file(fid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    f = await db.get(BarterFile, fid)
    if not f:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    path = f.stored_path
    await db.delete(f)
    await db.commit()
    Path(path).unlink(missing_ok=True)
    return {"deleted": True}
