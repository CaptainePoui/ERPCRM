"""
TASK-021/S032 : facturation récurrente liée aux services SIPV.

Une seule CompanyRecurringBilling par compagnie (date de départ + fréquence,
activée en même temps que le tenant SIPV). SIPV notifie l'ajout/retrait d'un
service via POST /billing/sipv-event (X-Api-Key) ; ERPCRM ajoute/retire la
ligne correspondante et calcule un crédit de prorata au retrait en cours de
cycle. La récurrence n'est PAS une facture — c'est le gabarit vivant à partir
duquel une vraie facture (Invoice) est générée manuellement (bouton), même
principe que Invoice.is_recurring déjà existant, mais avec un suivi des
lignes en dehors du cycle de facturation lui-même.
"""
import uuid
from datetime import date, datetime, timezone
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.invoices import _next_number, _recalc
from app.models.recurring_billing import CompanyRecurringBilling, RecurringBillingLine
from app.models.catalogue import CatalogueItem
from app.models.company import Company
from app.models.invoice import Invoice, InvoiceLine
from app.models.user import User

router = APIRouter()

FREQUENCIES = {
    "mensuel": relativedelta(months=1),
    "bimestriel": relativedelta(months=2),
    "trimestriel": relativedelta(months=3),
    "biannuel": relativedelta(months=6),
    "annuel": relativedelta(years=1),
}


def verify_sipv_api_key(x_api_key: str = Header(...)):
    if not settings.SIPV_API_KEY or x_api_key != settings.SIPV_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clé API invalide")
    return x_api_key


def _cycle_bounds(start_date: date, frequency: str, on_date: date) -> tuple[date, date]:
    """Retourne (début, fin) du cycle de facturation qui contient `on_date`,
    en avançant par sauts de `frequency` depuis `start_date`."""
    delta = FREQUENCIES.get(frequency, FREQUENCIES["mensuel"])
    cycle_start = start_date
    cycle_end = cycle_start + delta
    while cycle_end <= on_date:
        cycle_start = cycle_end
        cycle_end = cycle_start + delta
    return cycle_start, cycle_end


# ── Schemas ──────────────────────────────────────────────────────────────────

class LineOut(BaseModel):
    id: uuid.UUID
    catalogue_item_id: uuid.UUID | None
    description: str
    qty: float
    unit_price: float
    service_ref: str | None
    service_type: str | None
    is_prorata_credit: bool
    sort_order: int
    model_config = {"from_attributes": True}


class RecurringBillingOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    start_date: date
    frequency: str
    is_active: bool
    current_cycle_start: date
    current_cycle_end: date
    lines: list[LineOut]
    subtotal: float


class RecurringBillingCreate(BaseModel):
    start_date: date
    frequency: str = "mensuel"


class RecurringBillingUpdate(BaseModel):
    start_date: date | None = None
    frequency: str | None = None
    is_active: bool | None = None


class LineCreate(BaseModel):
    description: str
    qty: float = 1.0
    unit_price: float = 0.0
    catalogue_item_id: uuid.UUID | None = None
    service_ref: str | None = None
    service_type: str | None = None


def _out(rb: CompanyRecurringBilling) -> RecurringBillingOut:
    cycle_start, cycle_end = _cycle_bounds(rb.start_date, rb.frequency, date.today())
    return RecurringBillingOut(
        id=rb.id, company_id=rb.company_id, company_name=rb.company.name,
        start_date=rb.start_date, frequency=rb.frequency, is_active=rb.is_active,
        current_cycle_start=cycle_start, current_cycle_end=cycle_end,
        lines=[LineOut.model_validate(l) for l in rb.lines],
        subtotal=round(sum(l.qty * l.unit_price for l in rb.lines), 2),
    )


async def _get_rb(rb_id: uuid.UUID, db: AsyncSession) -> CompanyRecurringBilling:
    result = await db.execute(
        select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.company))
        .where(CompanyRecurringBilling.id == rb_id)
    )
    rb = result.scalar_one_or_none()
    if not rb:
        raise HTTPException(status_code=404, detail="Récurrence introuvable")
    return rb


# ── Admin CRUD ───────────────────────────────────────────────────────────────

@router.get("/recurring-billing", response_model=list[RecurringBillingOut])
async def list_recurring_billing(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.company))
        .order_by(CompanyRecurringBilling.start_date)
    )
    return [_out(rb) for rb in result.scalars().all()]


@router.get("/companies/{company_id}/recurring-billing", response_model=RecurringBillingOut | None)
async def get_company_recurring_billing(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.company))
        .where(CompanyRecurringBilling.company_id == company_id)
    )
    rb = result.scalar_one_or_none()
    return _out(rb) if rb else None


@router.post("/companies/{company_id}/recurring-billing", response_model=RecurringBillingOut, status_code=status.HTTP_201_CREATED)
async def create_recurring_billing(company_id: uuid.UUID, payload: RecurringBillingCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Créée automatiquement quand le checkbox "Tenant téléphonique SIPV" est
    activé (voir companies.py::toggle_sipv_tenant) -- exposée séparément aussi
    pour pouvoir corriger la date/fréquence après coup depuis l'onglet Récurrence."""
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Fréquence invalide (mensuel/biannuel/annuel)")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    existing = await db.execute(select(CompanyRecurringBilling).where(CompanyRecurringBilling.company_id == company_id))
    rb = existing.scalar_one_or_none()
    if rb:
        rb.start_date = payload.start_date
        rb.frequency = payload.frequency
        rb.is_active = True
    else:
        rb = CompanyRecurringBilling(company_id=company_id, start_date=payload.start_date, frequency=payload.frequency)
        db.add(rb)
    await db.commit()
    return _out(await _get_rb(rb.id, db))


@router.put("/recurring-billing/{rb_id}", response_model=RecurringBillingOut)
async def update_recurring_billing(rb_id: uuid.UUID, payload: RecurringBillingUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rb = await _get_rb(rb_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "frequency" in data and data["frequency"] not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Fréquence invalide (mensuel/biannuel/annuel)")
    for k, v in data.items():
        setattr(rb, k, v)
    await db.commit()
    return _out(await _get_rb(rb_id, db))


@router.post("/recurring-billing/{rb_id}/lines", response_model=LineOut, status_code=status.HTTP_201_CREATED)
async def add_line(rb_id: uuid.UUID, payload: LineCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rb = await _get_rb(rb_id, db)
    line = RecurringBillingLine(recurring_billing_id=rb.id, **payload.model_dump())
    db.add(line)
    await db.commit()
    await db.refresh(line)
    return LineOut.model_validate(line)


@router.delete("/recurring-billing/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_line(line_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    line = await db.get(RecurringBillingLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    await db.delete(line)
    await db.commit()


def _dated_desc(description: str, period_start: date, period_end: date) -> str:
    return f"{description} — {period_start.isoformat()} au {period_end.isoformat()}"


@router.post("/recurring-billing/{rb_id}/generate-invoice", status_code=status.HTTP_201_CREATED)
async def generate_invoice_from_recurring(rb_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Crée une vraie Invoice (is_recurring=True) à partir des lignes actuelles
    de la récurrence -- snapshot au moment de la génération, comme pour
    invoices.py::generate_next. Les lignes de crédit de prorata (ponctuelles)
    sont retirées de la récurrence après génération, pas reconduites au
    prochain cycle ; les lignes de service normales restent.

    TASK-033 : chaque ligne indique sa période de service exacte dans la
    description (transparence totale envers le client, demande explicite).
    La toute première facture d'une récurrence double les lignes de service
    (période courante + période suivante, chacune datée séparément) --
    les services sont facturés d'avance mais le client a 30 jours pour payer ;
    sans ce doublement, la 1ère facture donnerait 30 jours de service gratuit
    avant le premier paiement et désynchroniserait le cycle par la suite.
    Les crédits de prorata ne sont jamais doublés (ponctuels par nature)."""
    rb = await _get_rb(rb_id, db)
    if not rb.lines:
        raise HTTPException(status_code=400, detail="Aucune ligne à facturer")
    cycle_start, cycle_end = _cycle_bounds(rb.start_date, rb.frequency, date.today())
    is_first_invoice = not rb.first_invoice_generated
    next_cycle_start, next_cycle_end = _cycle_bounds(rb.start_date, rb.frequency, cycle_end)

    inv = Invoice(
        number=await _next_number(db),
        company_id=rb.company_id,
        issue_date=cycle_start,
        due_date=cycle_end,
        notes="Généré depuis la récurrence téléphonique SIPV",
        is_recurring=True,
        recurrence_frequency=rb.frequency,
        recurrence_next_date=cycle_end,
    )
    db.add(inv)
    await db.flush()
    sort_order = 0
    for line in rb.lines:
        db.add(InvoiceLine(
            invoice_id=inv.id, catalogue_item_id=line.catalogue_item_id,
            description=_dated_desc(line.description, cycle_start, cycle_end),
            qty=line.qty, unit_price=line.unit_price,
            line_total=round(line.qty * line.unit_price, 2), sort_order=sort_order,
        ))
        sort_order += 1
        if is_first_invoice and not line.is_prorata_credit:
            db.add(InvoiceLine(
                invoice_id=inv.id, catalogue_item_id=line.catalogue_item_id,
                description=_dated_desc(f"{line.description} (facturé d'avance)", next_cycle_start, next_cycle_end),
                qty=line.qty, unit_price=line.unit_price,
                line_total=round(line.qty * line.unit_price, 2), sort_order=sort_order,
            ))
            sort_order += 1
    if is_first_invoice:
        rb.first_invoice_generated = True
    # Les crédits de prorata sont ponctuels -- une fois facturés, ils disparaissent
    # de la récurrence (sinon ils seraient refacturés indéfiniment au cycle suivant).
    for line in list(rb.lines):
        if line.is_prorata_credit:
            await db.delete(line)
    await db.flush()
    inv_result = await db.execute(
        select(Invoice).options(selectinload(Invoice.lines), selectinload(Invoice.company)).where(Invoice.id == inv.id)
    )
    inv = inv_result.scalar_one()
    _recalc(inv)
    await db.commit()
    return {"invoice_id": str(inv.id), "invoice_number": inv.number, "total": inv.total}


# ── Webhook SIPV -> ERPCRM ───────────────────────────────────────────────────

class SipvBillingEvent(BaseModel):
    tenant_id: uuid.UUID
    action: str  # extension_added / extension_removed / did_added / did_removed
    service_type: str  # "extension", "did", ...
    service_ref: str  # identifiant stable du service (ex: extension id SIPV) -- sert à retrouver la ligne au retrait
    description: str | None = None
    effective_date: date | None = None


@router.post("/billing/sipv-event")
async def sipv_billing_event(payload: SipvBillingEvent, db: AsyncSession = Depends(get_db), _: str = Depends(verify_sipv_api_key)):
    result = await db.execute(select(Company).where(Company.sipv_tenant_id == payload.tenant_id))
    company = result.scalar_one_or_none()
    if not company:
        return {"status": "ignored", "reason": "tenant inconnu côté ERPCRM"}

    rb_result = await db.execute(
        select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines))
        .where(CompanyRecurringBilling.company_id == company.id)
    )
    rb = rb_result.scalar_one_or_none()
    if not rb or not rb.is_active:
        return {"status": "ignored", "reason": "pas de récurrence active pour cette compagnie"}

    effective = payload.effective_date or date.today()

    if payload.action.endswith("_added"):
        cat_result = await db.execute(select(CatalogueItem).where(CatalogueItem.sipv_service_type == payload.service_type, CatalogueItem.is_active == True))
        cat_item = cat_result.scalar_one_or_none()
        unit_price = cat_item.price if cat_item else 0.0
        desc = payload.description or (cat_item.name if cat_item else f"Service SIPV ({payload.service_type}) — ⚠️ aucun forfait catalogue configuré")
        line = RecurringBillingLine(
            recurring_billing_id=rb.id, catalogue_item_id=cat_item.id if cat_item else None,
            description=desc, qty=1, unit_price=unit_price,
            service_ref=payload.service_ref, service_type=payload.service_type,
        )
        db.add(line)

        # TASK-033 : prorata a l'ajout, symetrique du prorata au retrait
        # ci-dessous -- un service ajoute en cours de cycle ne doit pas etre
        # facture plein prix des la prochaine facture (qui couvre tout le
        # cycle courant, meme les jours avant que le service existe). Credit
        # ponctuel pour les jours du cycle courant PRECEDANT `effective`.
        cycle_start, cycle_end = _cycle_bounds(rb.start_date, rb.frequency, effective)
        cycle_days = max((cycle_end - cycle_start).days, 1)
        days_before = max((effective - cycle_start).days, 0)
        prorata_credit = 0.0
        if days_before > 0 and unit_price:
            prorata_credit = round(-(unit_price / cycle_days) * days_before, 2)
            db.add(RecurringBillingLine(
                recurring_billing_id=rb.id, catalogue_item_id=None,
                description=f"Prorata ajout : {desc} ({days_before}j non dus sur {cycle_days}j)",
                qty=1, unit_price=prorata_credit, is_prorata_credit=True,
                service_type=payload.service_type,
            ))
        await db.commit()
        return {"status": "added", "unit_price": unit_price, "catalogue_matched": bool(cat_item), "prorata_credit": prorata_credit}

    if payload.action.endswith("_removed"):
        line = next((l for l in rb.lines if l.service_ref == payload.service_ref and not l.is_prorata_credit), None)
        if not line:
            return {"status": "ignored", "reason": "aucune ligne correspondante à retirer"}
        cycle_start, cycle_end = _cycle_bounds(rb.start_date, rb.frequency, effective)
        cycle_days = max((cycle_end - cycle_start).days, 1)
        days_remaining = max((cycle_end - effective).days, 0)
        credit_amount = round(-(line.unit_price / cycle_days) * days_remaining, 2)
        removed_desc = line.description
        await db.delete(line)
        if credit_amount != 0:
            db.add(RecurringBillingLine(
                recurring_billing_id=rb.id, catalogue_item_id=None,
                description=f"Prorata retrait : {removed_desc} ({days_remaining}j restants sur {cycle_days}j)",
                qty=1, unit_price=credit_amount, is_prorata_credit=True,
                service_type=payload.service_type,
            ))
        await db.commit()
        return {"status": "removed", "credit_amount": credit_amount}

    return {"status": "ignored", "reason": "action inconnue"}
