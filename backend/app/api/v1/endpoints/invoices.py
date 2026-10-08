import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core import clock
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.invoice import Invoice, InvoiceLine
from app.models.company import Company
from app.models.company_site import CompanySite
from app.models.catalogue import CatalogueItem
from app.models.user import User
from app.core.tracking import get_open_stats
from app.core.email import send_invoice_email

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class LineOut(BaseModel):
    id: uuid.UUID
    catalogue_item_id: uuid.UUID | None
    description: str
    qty: float
    unit_price: float
    line_total: float
    sort_order: int
    is_taxable: bool = True
    model_config = {"from_attributes": True}


class InvoiceOut(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    due_date: date
    notes: str | None
    apply_tps: bool
    apply_tvq: bool
    tps_rate: float
    tvq_rate: float
    subtotal: float
    tps_amount: float
    tvq_amount: float
    total: float
    is_recurring: bool
    recurrence_frequency: str | None
    recurrence_next_date: date | None
    credit_of_id: uuid.UUID | None
    site_id: uuid.UUID | None
    site_label_snapshot: str | None
    site_address_snapshot: str | None
    lines: list[LineOut]
    transmission_status: str | None = None
    last_opened_at: datetime | None = None
    open_count: int = 0
    barter_settlement: bool = False          # TASK-005.14 : « a regler en troc », jamais de frais de retard
    late_fee_for_id: uuid.UUID | None = None  # facture de frais de retard : la facture en retard qu'elle vise


class InvoiceListItem(BaseModel):
    id: uuid.UUID
    number: str
    company_id: uuid.UUID
    company_name: str
    status: str
    issue_date: date
    due_date: date
    total: float
    is_recurring: bool
    credit_of_id: uuid.UUID | None
    site_label_snapshot: str | None = None
    transmission_status: str | None = None
    last_opened_at: datetime | None = None
    open_count: int = 0
    barter_settlement: bool = False
    late_fee_for_id: uuid.UUID | None = None


class InvoiceCreate(BaseModel):
    company_id: uuid.UUID
    site_id: uuid.UUID | None = None
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    apply_tps: bool = True
    apply_tvq: bool = True
    is_recurring: bool = False
    recurrence_frequency: str | None = None


class InvoiceUpdate(BaseModel):
    status: str | None = None
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = None
    apply_tps: bool | None = None
    apply_tvq: bool | None = None
    is_recurring: bool | None = None
    recurrence_frequency: str | None = None
    recurrence_next_date: date | None = None
    site_id: uuid.UUID | None = None
    clear_site: bool = False  # distingue "site_id absent du payload" de "retirer la succursale"
    transmission_status: str | None = None  # non_transmise | courriel | autre (TASK-005.8)
    barter_settlement: bool | None = None   # « a regler en troc » (TASK-005.14)


class LineCreate(BaseModel):
    catalogue_item_id: uuid.UUID | None = None
    description: str
    qty: float = 1.0
    unit_price: float = 0.0
    sort_order: int = 0
    is_taxable: bool = True


class LineUpdate(BaseModel):
    description: str | None = None
    qty: float | None = None
    unit_price: float | None = None
    sort_order: int | None = None
    is_taxable: bool | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _next_number(db: AsyncSession) -> str:
    """Factures et avoirs : compteur qui ne recule jamais (app/core/numbering.py)."""
    from app.core.numbering import next_document_number
    return await next_document_number(db, "invoice")


async def _next_credit_number(db: AsyncSession) -> str:
    """Avoirs : leur propre suite CN- (meme compteur qui ne recule jamais)."""
    from app.core.numbering import next_document_number
    return await next_document_number(db, "credit")


def _money(v) -> Decimal:
    """Arrondi au cent, demie vers le haut (regle usuelle des taxes ; round() de Python
    arrondit une demie au pair et donnait 1 cent de moins sur certaines factures)."""
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _recalc(inv: Invoice) -> None:
    # Une ligne tout juste creee porte encore un float (payload) : tout ramener en Decimal
    inv.subtotal = sum((Decimal(str(l.line_total)) for l in inv.lines), Decimal("0.00"))
    # Taxes seulement sur les lignes taxables (TASK-005.9)
    taxable = sum((Decimal(str(l.line_total)) for l in inv.lines if l.is_taxable is not False), Decimal("0.00"))
    inv.tps_amount = _money(taxable * inv.tps_rate / 100) if inv.apply_tps else Decimal("0.00")
    inv.tvq_amount = _money(taxable * inv.tvq_rate / 100) if inv.apply_tvq else Decimal("0.00")
    inv.total = _money(inv.subtotal + inv.tps_amount + inv.tvq_amount)


async def _tax_lock_date(db: AsyncSession) -> date | None:
    """Fin de la derniere periode de taxes declaree (parametre tax_lock_date, vide = aucune)."""
    from app.api.v1.endpoints.settings import get_setting
    v = (await get_setting(db, "tax_lock_date") or "").strip()
    return date.fromisoformat(v) if v else None


async def _check_can_revert_to_draft(inv: Invoice, db: AsyncSession) -> None:
    """Une facture ne revient en brouillon que si rien ne l'a encore « fixee » : aucun paiement
    confirme et pas datee dans une periode de taxes deja declaree (sinon : avoir)."""
    from app.models.client_payment import ClientPayment, PaymentAllocation, CreditAllocation
    if (await db.execute(select(func.count()).select_from(CreditAllocation).where(
            (CreditAllocation.invoice_id == inv.id) | (CreditAllocation.credit_invoice_id == inv.id)))).scalar():
        raise HTTPException(status_code=400, detail="Un avoir est appliqué sur ce document : retirez l'application avant de le remettre en brouillon")
    paid = (await db.execute(
        select(func.count()).select_from(PaymentAllocation)
        .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
        .where(PaymentAllocation.invoice_id == inv.id, ClientPayment.status == "confirmed")
    )).scalar() or 0
    if paid:
        raise HTTPException(status_code=400, detail="Cette facture a déjà un paiement confirmé : elle ne peut pas revenir en brouillon")
    lock = await _tax_lock_date(db)
    if lock and inv.issue_date <= lock:
        raise HTTPException(status_code=400, detail=f"Facture datée dans une période de taxes déjà déclarée (jusqu'au {lock}) : elle ne peut plus revenir en brouillon, seulement être créditée")


async def _build_out(inv: Invoice, db: AsyncSession) -> InvoiceOut:
    stats = await get_open_stats(db, "invoice", [inv.id])
    last_opened_at, open_count = stats.get(inv.id, (None, 0))
    return InvoiceOut(
        id=inv.id,
        number=inv.number,
        company_id=inv.company_id,
        company_name=inv.company.name,
        status=inv.status,
        issue_date=inv.issue_date,
        due_date=inv.due_date,
        notes=inv.notes,
        apply_tps=inv.apply_tps,
        apply_tvq=inv.apply_tvq,
        tps_rate=inv.tps_rate,
        tvq_rate=inv.tvq_rate,
        subtotal=inv.subtotal,
        tps_amount=inv.tps_amount,
        tvq_amount=inv.tvq_amount,
        total=inv.total,
        is_recurring=inv.is_recurring,
        recurrence_frequency=inv.recurrence_frequency,
        recurrence_next_date=inv.recurrence_next_date,
        credit_of_id=inv.credit_of_id,
        barter_settlement=inv.barter_settlement,
        late_fee_for_id=inv.late_fee_for_id,
        site_id=inv.site_id,
        site_label_snapshot=inv.site_label_snapshot,
        site_address_snapshot=inv.site_address_snapshot,
        transmission_status=inv.transmission_status,
        lines=[LineOut.model_validate(l) for l in inv.lines],
        last_opened_at=last_opened_at, open_count=open_count,
    )


def _site_address_text(site: CompanySite) -> str:
    line1 = f"{site.civic_number} {site.street_name}" + (f", {site.unit}" if site.unit else "")
    return f"{line1}, {site.city} {site.province} {site.postal_code}"


async def _get_inv(invoice_id: uuid.UUID, db: AsyncSession) -> Invoice:
    # populate_existing : relit les lignes a jour (2026-10-08 : sans ca, une ligne ajoutee ou supprimee dans la meme
    # requete n'etait pas vue par _recalc -- totaux restes a 0 sur INV-112253 apres l'ajout de sa ligne)
    result = await db.execute(
        select(Invoice)
        .options(selectinload(Invoice.lines), selectinload(Invoice.company))
        .where(Invoice.id == invoice_id)
        .execution_options(populate_existing=True)
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(status_code=404, detail="Facture introuvable")
    return inv


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[InvoiceListItem])
async def list_invoices(
    company_id: uuid.UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = select(Invoice).options(selectinload(Invoice.company)).order_by(Invoice.created_at.desc())
    if company_id:
        q = q.where(Invoice.company_id == company_id)
    if status:
        q = q.where(Invoice.status == status)
    result = await db.execute(q)
    invs = result.scalars().all()
    open_stats = await get_open_stats(db, "invoice", [i.id for i in invs])
    return [InvoiceListItem(
        id=i.id, number=i.number, company_id=i.company_id,
        company_name=i.company.name, status=i.status,
        issue_date=i.issue_date, due_date=i.due_date,
        total=i.total, is_recurring=i.is_recurring,
        credit_of_id=i.credit_of_id,
        barter_settlement=i.barter_settlement,
        late_fee_for_id=i.late_fee_for_id,
        site_label_snapshot=i.site_label_snapshot,
        transmission_status=i.transmission_status,
        last_opened_at=open_stats.get(i.id, (None, 0))[0],
        open_count=open_stats.get(i.id, (None, 0))[1],
    ) for i in invs]


@router.post("", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_invoice(payload: InvoiceCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    comp = await db.get(Company, payload.company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")

    site_label_snapshot = None
    site_address_snapshot = None
    if payload.site_id:
        site = await db.get(CompanySite, payload.site_id)
        if not site or site.company_id != payload.company_id:
            raise HTTPException(status_code=400, detail="Succursale invalide pour cette compagnie")
        site_label_snapshot = site.label
        site_address_snapshot = _site_address_text(site)

    today = clock.today()
    inv = Invoice(
        transmission_status="non_transmise",
        number=await _next_number(db),
        company_id=payload.company_id,
        site_id=payload.site_id,
        site_label_snapshot=site_label_snapshot,
        site_address_snapshot=site_address_snapshot,
        issue_date=payload.issue_date or today,
        due_date=payload.due_date or (today + timedelta(days=30)),
        notes=payload.notes,
        apply_tps=payload.apply_tps if payload.apply_tps is not None else comp.is_taxable,
        apply_tvq=payload.apply_tvq if payload.apply_tvq is not None else comp.tvq_applicable,
        is_recurring=payload.is_recurring,
        recurrence_frequency=payload.recurrence_frequency,
    )
    db.add(inv)
    await db.flush()
    await db.refresh(inv)
    # reload with relations
    inv = await _get_inv(inv.id, db)
    _recalc(inv)
    await db.commit()
    await db.refresh(inv)
    inv = await _get_inv(inv.id, db)
    return await _build_out(inv, db)


@router.get("/{invoice_id}", response_model=InvoiceOut)
async def get_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _build_out(await _get_inv(invoice_id, db), db)


class SendInvoicePayload(BaseModel):
    to_email: str


@router.post("/{invoice_id}/send", response_model=InvoiceOut)
async def send_invoice(invoice_id: uuid.UUID, payload: SendInvoicePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Envoie la facture par courriel (pixel de suivi integre -- TASK envoi facture)."""
    inv = await _get_inv(invoice_id, db)
    await send_invoice_email(
        to_email=payload.to_email,
        invoice_id=str(inv.id),
        invoice_number=inv.number,
        company_name=inv.company.name,
        due_date=inv.due_date.strftime('%Y-%m-%d'),
        lines=[{"description": l.description, "qty": l.qty, "unit_price": l.unit_price, "line_total": l.line_total} for l in inv.lines],
        total=inv.total,
    )
    inv.transmission_status = "courriel"
    if inv.status == "brouillon":
        inv.status = "envoyee"
        await db.flush()
        from app.core.barter import pay_open_invoices
        await pay_open_invoices(db, inv.company_id)     # TASK-005.13 : un echange (troc) paie la facture emise
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return await _build_out(inv, db)


@router.put("/{invoice_id}", response_model=InvoiceOut)
async def update_invoice(invoice_id: uuid.UUID, payload: InvoiceUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    updates = payload.model_dump(exclude_unset=True)
    if updates.get("transmission_status") not in (None, "non_transmise", "courriel", "autre"):
        raise HTTPException(status_code=400, detail="État de transmission invalide")
    if updates.get("status") == "brouillon" and inv.status != "brouillon":
        await _check_can_revert_to_draft(inv, db)
    if updates.get("status") == "annulee" and inv.status != "annulee":
        from app.models.client_payment import CreditAllocation
        if (await db.execute(select(func.count()).select_from(CreditAllocation).where(
                (CreditAllocation.invoice_id == inv.id) | (CreditAllocation.credit_invoice_id == inv.id)))).scalar():
            raise HTTPException(status_code=400, detail="Un avoir est appliqué sur ce document : retirez l'application avant de l'annuler")
    clear_site = updates.pop("clear_site", False)
    site_id = updates.pop("site_id", None)
    if clear_site:
        inv.site_id = None
        inv.site_label_snapshot = None
        inv.site_address_snapshot = None
    elif site_id:
        site = await db.get(CompanySite, site_id)
        if not site or site.company_id != inv.company_id:
            raise HTTPException(status_code=400, detail="Succursale invalide pour cette compagnie")
        inv.site_id = site.id
        inv.site_label_snapshot = site.label
        inv.site_address_snapshot = _site_address_text(site)
    was_draft = inv.status == "brouillon"
    for field, value in updates.items():
        setattr(inv, field, value)
    _recalc(inv)
    if was_draft and inv.status != "brouillon" and inv.status != "annulee":
        await db.flush()
        from app.core.barter import pay_open_invoices
        await pay_open_invoices(db, inv.company_id)     # TASK-005.13 : un echange (troc) paie la facture emise
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return await _build_out(inv, db)


@router.delete("/{invoice_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_invoice(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    if inv.status not in ("brouillon",):
        raise HTTPException(status_code=400, detail="Seules les factures en brouillon peuvent être supprimées")
    lock = await _tax_lock_date(db)
    if lock and inv.issue_date <= lock:
        raise HTTPException(status_code=400, detail=f"Facture datée dans une période de taxes déjà déclarée (jusqu'au {lock}) : elle ne peut plus être supprimée, seulement créditée")
    await db.delete(inv)
    await db.commit()


# ── Lines ─────────────────────────────────────────────────────────────────────

@router.post("/{invoice_id}/lines", response_model=InvoiceOut)
async def add_line(invoice_id: uuid.UUID, payload: LineCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = InvoiceLine(
        invoice_id=inv.id,
        catalogue_item_id=payload.catalogue_item_id,
        description=payload.description,
        qty=payload.qty,
        unit_price=payload.unit_price,
        line_total=_money(Decimal(str(payload.qty)) * Decimal(str(payload.unit_price))),
        sort_order=payload.sort_order or len(inv.lines),
        is_taxable=payload.is_taxable,
    )
    db.add(line)
    await db.flush()
    inv = await _get_inv(invoice_id, db)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return await _build_out(inv, db)


@router.put("/{invoice_id}/lines/{line_id}", response_model=InvoiceOut)
async def update_line(invoice_id: uuid.UUID, line_id: uuid.UUID, payload: LineUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = next((l for l in inv.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    line.line_total = _money(Decimal(str(line.qty)) * Decimal(str(line.unit_price)))
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return await _build_out(inv, db)


@router.delete("/{invoice_id}/lines/{line_id}", response_model=InvoiceOut)
async def delete_line(invoice_id: uuid.UUID, line_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    inv = await _get_inv(invoice_id, db)
    line = next((l for l in inv.lines if l.id == line_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    await db.delete(line)
    await db.flush()
    inv = await _get_inv(invoice_id, db)
    _recalc(inv)
    await db.commit()
    inv = await _get_inv(invoice_id, db)
    return await _build_out(inv, db)


# ── Actions ───────────────────────────────────────────────────────────────────

@router.get("/late-fees/preview")
async def late_fees_preview(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Avis de retard qui seraient crees aujourd'hui (TASK-005.14) -- rien n'est ecrit, meme si c'est eteint."""
    from app.core import late_fees
    cfg = await late_fees.config(db)
    out = []
    for c in await late_fees.candidates(db, cfg):
        out.append({"company_id": str(c["company_id"]), "company_name": c["company_name"], "base": float(c["base"]),
                    "interest": float(c["interest"]), "admin": float(c["admin"]), "total": float(c["interest"] + c["admin"]),
                    "last_notice": c["last_notice"], "oldest_number": c["oldest"].number, "oldest_due": c["oldest"].due_date,
                    "invoices": [{"id": str(i.id), "number": i.number, "due_date": i.due_date, "balance": float(b),
                                  "late_fee": i.late_fee_for_id is not None} for i, b in c["invoices"]]})
    return {"enabled": cfg["enabled"], "today": clock.today(), "notices": out}


@router.post("/mark-overdue", status_code=status.HTTP_200_OK)
async def mark_overdue(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    today = clock.today()
    result = await db.execute(
        select(Invoice).where(
            and_(Invoice.status == "envoyee", Invoice.due_date < today)
        )
    )
    overdue = result.scalars().all()
    for inv in overdue:
        inv.status = "en_retard"
    await db.commit()
    return {"updated": len(overdue)}


@router.post("/{invoice_id}/credit", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def create_credit(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    original = await _get_inv(invoice_id, db)
    if original.credit_of_id is not None:
        raise HTTPException(status_code=400, detail="Un avoir ne peut pas être crédité")
    credit = Invoice(
        number=await _next_credit_number(db),
        company_id=original.company_id,
        issue_date=clock.today(),
        due_date=clock.today(),
        notes=f"Avoir pour facture {original.number}",
        apply_tps=original.apply_tps,
        apply_tvq=original.apply_tvq,
        tps_rate=original.tps_rate,
        tvq_rate=original.tvq_rate,
        is_recurring=False,
        credit_of_id=original.id,
    )
    db.add(credit)
    await db.flush()
    for line in original.lines:
        db.add(InvoiceLine(
            invoice_id=credit.id,
            catalogue_item_id=line.catalogue_item_id,
            description=line.description,
            qty=line.qty,
            # Signe inverse (pas -abs) : une ligne de rabais negative redevient positive dans l'avoir
            unit_price=-line.unit_price,
            line_total=-line.line_total,
            sort_order=line.sort_order,
            is_taxable=line.is_taxable,
        ))
    await db.flush()
    credit = await _get_inv(credit.id, db)
    _recalc(credit)
    await db.commit()
    credit = await _get_inv(credit.id, db)
    return await _build_out(credit, db)


@router.post("/{invoice_id}/generate-next", response_model=InvoiceOut, status_code=status.HTTP_201_CREATED)
async def generate_next(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    original = await _get_inv(invoice_id, db)
    if not original.is_recurring or not original.recurrence_frequency:
        raise HTTPException(status_code=400, detail="Facture non récurrente")
    freq_map = {"mensuel": relativedelta(months=1), "bimestriel": relativedelta(months=2), "trimestriel": relativedelta(months=3), "biannuel": relativedelta(months=6), "annuel": relativedelta(years=1)}
    delta = freq_map.get(original.recurrence_frequency)
    if not delta:
        raise HTTPException(status_code=400, detail="Fréquence inconnue")
    base = original.recurrence_next_date or original.due_date
    next_issue = base
    next_due = base + delta
    next_inv = Invoice(
        number=await _next_number(db),
        company_id=original.company_id,
        issue_date=next_issue,
        due_date=next_due,
        notes=original.notes,
        apply_tps=original.apply_tps,
        apply_tvq=original.apply_tvq,
        tps_rate=original.tps_rate,
        tvq_rate=original.tvq_rate,
        is_recurring=True,
        recurrence_frequency=original.recurrence_frequency,
        recurrence_next_date=next_due + delta,
    )
    db.add(next_inv)
    await db.flush()
    for line in original.lines:
        db.add(InvoiceLine(
            invoice_id=next_inv.id,
            catalogue_item_id=line.catalogue_item_id,
            description=line.description,
            qty=line.qty,
            unit_price=line.unit_price,
            line_total=line.line_total,
            sort_order=line.sort_order,
            is_taxable=line.is_taxable,
        ))
    original.recurrence_next_date = next_due
    await db.flush()
    next_inv = await _get_inv(next_inv.id, db)
    _recalc(next_inv)
    await db.commit()
    next_inv = await _get_inv(next_inv.id, db)
    return await _build_out(next_inv, db)


@router.get("/{invoice_id}/pdf")
async def download_invoice_pdf(invoice_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Genere et retourne le PDF d'une facture (avec etat de paiement courant)."""
    from app.core.invoice_pdf import generate_invoice_pdf
    try:
        pdf_bytes = await generate_invoice_pdf(invoice_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    inv = await db.get(Invoice, invoice_id)
    filename = f"facture-{inv.number}.pdf" if inv else f"facture-{invoice_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
