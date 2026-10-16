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
from decimal import Decimal
from datetime import date, datetime, timedelta, timezone
from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core import clock
from app.core.database import get_db
from app.core.config import settings
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.invoices import _next_number, _recalc, _money
from app.core import barter
from app.models.recurring_billing import CompanyRecurringBilling, RecurringBillingLine
from app.models.catalogue import CatalogueItem
from app.models.company import Company
from app.models.invoice import Invoice, InvoiceLine
from app.models.user import User

from app.api.v1.endpoints.settings import payment_terms_days
router = APIRouter()

FREQUENCIES = {
    "mensuel": relativedelta(months=1),
    "bimestriel": relativedelta(months=2),
    "trimestriel": relativedelta(months=3),
    "biannuel": relativedelta(months=6),
    "annuel": relativedelta(years=1),
    "hebdomadaire": relativedelta(weeks=1),   # factures fournisseurs (ex. abonnement hebdomadaire)
}


def verify_sipv_api_key(x_api_key: str = Header(...)):
    if not settings.SIPV_API_KEY or x_api_key != settings.SIPV_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clé API invalide")
    return x_api_key


def _cycle_bounds(start_date: date, frequency: str, on_date: date) -> tuple[date, date]:
    """Retourne (début, fin) du cycle de facturation qui contient `on_date`,
    en avançant par sauts de `frequency` depuis `start_date`."""
    delta = FREQUENCIES.get(frequency, FREQUENCIES["mensuel"])
    # Chaque cycle se calcule depuis start_date (start + k sauts), jamais depuis le cycle precedent :
    # sinon un debut le 30 ou 31 glisse au 28 apres fevrier et ne revient jamais (2026-10-03).
    k = 0
    while start_date + delta * (k + 1) <= on_date:
        k += 1
    return start_date + delta * k, start_date + delta * (k + 1)


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
    name: str | None = None
    site_id: uuid.UUID | None = None
    site_label: str | None = None
    is_telephony: bool = False
    start_date: date
    end_date: date | None = None
    last_invoice_date: date | None = None
    frequency: str
    is_active: bool
    current_cycle_start: date
    current_cycle_end: date
    lines: list[LineOut]
    subtotal: float
    pause_start: date | None = None      # TASK-005.26
    pause_end: date | None = None
    unpaused_next: date | None = None     # prochain cycle sans la pause (debut propose d'une pause)
    next_total: float = 0                 # montant de la prochaine facture, taxes comprises
    terms_days: int | None = None         # conditions : jours entre la facture et son echeance (fin du cycle)


class RecurringBillingCreate(BaseModel):
    start_date: date
    frequency: str = "mensuel"


class RecurringBillingUpdate(BaseModel):
    start_date: date | None = None
    frequency: str | None = None
    is_active: bool | None = None
    name: str | None = None
    end_date: date | None = None
    clear_end_date: bool = False  # distingue « absent » de « retirer la date de fin »


class LineCreate(BaseModel):
    description: str
    qty: float = 1.0
    unit_price: float = 0.0
    catalogue_item_id: uuid.UUID | None = None
    service_ref: str | None = None
    service_type: str | None = None


def _out(rb: CompanyRecurringBilling) -> RecurringBillingOut:
    # current_cycle_* = prochain cycle a facturer (le plus ancien pas encore facture)
    cycle_start, cycle_end = next_missing_cycle(rb)
    return RecurringBillingOut(
        id=rb.id, company_id=rb.company_id, company_name=rb.company.name,
        name=rb.name, site_id=rb.site_id, site_label=rb.site.label if rb.site else None,
        is_telephony=rb.is_telephony, end_date=rb.end_date, last_invoice_date=rb.last_invoice_date,
        start_date=rb.start_date, frequency=rb.frequency, is_active=rb.is_active,
        current_cycle_start=cycle_start, current_cycle_end=cycle_end,
        lines=[LineOut.model_validate(l) for l in rb.lines],
        subtotal=round(sum(l.qty * l.unit_price for l in rb.lines), 2),
        pause_start=rb.pause_start, pause_end=rb.pause_end, unpaused_next=_unpaused_next(rb),
        next_total=_next_total(rb),
    )


def _next_total(rb) -> float:
    sub = sum((_money(Decimal(str(l.qty)) * Decimal(str(l.unit_price))) for l in rb.lines), Decimal("0"))
    co = rb.company
    tps = _money(sub * Decimal("5") / 100) if co is None or co.is_taxable is not False else Decimal("0")
    tvq = _money(sub * Decimal("9.975") / 100) if co is None or (co.is_taxable is not False and co.tvq_applicable is not False) else Decimal("0")
    return float(sub + tps + tvq)


def _unpaused_next(rb) -> date:
    return rb.start_date if not rb.last_invoice_date or rb.last_invoice_date < rb.start_date \
        else _cycle_bounds(rb.start_date, rb.frequency, rb.last_invoice_date)[1]


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

async def telephony_recurrence(db: AsyncSession, company_id: uuid.UUID, with_lines: bool = False) -> CompanyRecurringBilling | None:
    """LA recurrence liee au tenant SIPV de la compagnie (TASK-021.1 : une compagnie peut en
    avoir plusieurs, mais l'activation du tenant et les evenements SIPV ne visent que celle-ci)."""
    q = select(CompanyRecurringBilling).where(
        CompanyRecurringBilling.company_id == company_id, CompanyRecurringBilling.is_telephony == True
    ).order_by(CompanyRecurringBilling.created_at).limit(1)
    if with_lines:
        q = q.options(selectinload(CompanyRecurringBilling.lines))
    return (await db.execute(q)).scalar_one_or_none()


@router.get("/recurring-billing", response_model=list[RecurringBillingOut])
async def list_recurring_billing(company_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Toutes les factures periodiques (Ventes : le regroupement des ententes) ; ?company_id= : celles d'un client
    (onglet Entente de sa fiche, TASK-005.26)."""
    q = select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.company))
    if company_id:
        q = q.where(CompanyRecurringBilling.company_id == company_id)
    result = await db.execute(q.order_by(CompanyRecurringBilling.start_date))
    terms = await payment_terms_days(db)
    return [_out(rb).model_copy(update={"terms_days": terms}) for rb in result.scalars().all()]


@router.get("/companies/{company_id}/recurring-billing", response_model=RecurringBillingOut | None)
async def get_company_recurring_billing(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    # Compatibilite : la recurrence telephonie si elle existe, sinon la plus ancienne
    result = await db.execute(
        select(CompanyRecurringBilling).options(selectinload(CompanyRecurringBilling.lines), selectinload(CompanyRecurringBilling.company))
        .where(CompanyRecurringBilling.company_id == company_id)
        .order_by(CompanyRecurringBilling.is_telephony.desc(), CompanyRecurringBilling.start_date).limit(1)
    )
    rb = result.scalar_one_or_none()
    return _out(rb) if rb else None


@router.post("/companies/{company_id}/recurring-billing", response_model=RecurringBillingOut, status_code=status.HTTP_201_CREATED)
async def create_recurring_billing(company_id: uuid.UUID, payload: RecurringBillingCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Créée automatiquement quand le checkbox "Tenant téléphonique SIPV" est
    activé (voir companies.py::toggle_sipv_tenant) -- exposée séparément aussi
    pour pouvoir corriger la date/fréquence après coup depuis l'onglet Récurrence."""
    from app.core.owner import refuse_if_owner
    await refuse_if_owner(db, company_id)               # TASK-002.5 : jamais facturee
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Fréquence invalide (mensuel/biannuel/annuel)")
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    rb = await telephony_recurrence(db, company_id)
    if rb:
        rb.start_date = payload.start_date
        rb.frequency = payload.frequency
        rb.is_active = True
    else:
        rb = CompanyRecurringBilling(company_id=company_id, start_date=payload.start_date, frequency=payload.frequency, is_telephony=True)
        db.add(rb)
    await db.commit()
    return _out(await _get_rb(rb.id, db))


@router.put("/recurring-billing/{rb_id}", response_model=RecurringBillingOut)
async def update_recurring_billing(rb_id: uuid.UUID, payload: RecurringBillingUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rb = await _get_rb(rb_id, db)
    data = payload.model_dump(exclude_unset=True)
    if "frequency" in data and data["frequency"] not in FREQUENCIES:
        raise HTTPException(status_code=400, detail="Fréquence invalide (mensuel/biannuel/annuel)")
    if data.pop("clear_end_date", False):
        rb.end_date = None
        data.pop("end_date", None)
    if data.get("end_date") and data["end_date"] < data.get("start_date", rb.start_date):
        raise HTTPException(status_code=400, detail="La date de fin doit suivre la date de début")
    for k, v in data.items():
        setattr(rb, k, v)
    await db.commit()
    return _out(await _get_rb(rb_id, db))


@router.get("/recurring-billing/{rb_id}/preview")
async def preview_recurring(rb_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """TASK-005.26 (Philippe : « je veux la facture, c'est une facture qui est périodique, pas un résumé ») : la
    prochaine facture de cette facture periodique, rendue comme une vraie facture -- rien n'est enregistre."""
    from app.core.invoice_pdf import generate_invoice_pdf
    from app.core.pdf_preview import pdf_pages
    from app.api.v1.endpoints.invoices import _recalc
    rb = await _get_rb(rb_id, db)
    cycle_start, cycle_end = next_missing_cycle(rb)
    inv = Invoice(number=f"P{uuid.uuid4().hex[:12]}", company_id=rb.company_id, issue_date=cycle_start,
                  due_date=cycle_start + timedelta(days=await payment_terms_days(db)),
                  status="periodique", site_id=rb.site_id, site_label_snapshot=rb.site.label if rb.site else None,
                  is_recurring=True, recurrence_frequency=rb.frequency)
    db.add(inv)
    await db.flush()
    for n, line in enumerate(rb.lines):
        db.add(InvoiceLine(invoice_id=inv.id, catalogue_item_id=line.catalogue_item_id,
                           description=_dated_desc(line.description, cycle_start, cycle_end), qty=line.qty,
                           unit_price=line.unit_price, sort_order=n,
                           line_total=_money(Decimal(str(line.qty)) * Decimal(str(line.unit_price)))))
    await db.flush()
    inv = (await db.execute(select(Invoice).options(selectinload(Invoice.lines)).where(Invoice.id == inv.id))).scalar_one()
    _recalc(inv)
    await db.flush()
    from app.core.invoice_pdf import invoice_html
    try:
        html = await invoice_html(inv.id, db)
    finally:
        await db.rollback()           # apercu seulement : aucune facture, aucun numero consomme
    return {"html": html, "cycle_start": cycle_start, "cycle_end": cycle_end}


@router.get("/recurring-billing/{rb_id}/invoices")
async def recurring_children(rb_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """TASK-005.26 : « toutes les factures enfants » -- les factures faites depuis cette facture periodique, avec leur solde."""
    from app.api.v1.endpoints.payments import settled_amounts
    invs = (await db.execute(select(Invoice).where(Invoice.recurring_billing_id == rb_id, Invoice.status.not_in(["brouillon"]))
                             .order_by(Invoice.issue_date.desc(), Invoice.number.desc()))).scalars().all()
    paid = await settled_amounts(db, [i.id for i in invs])
    out, unpaid = [], Decimal("0")
    for i in invs:
        bal = Decimal("0") if i.status == "annulee" else max(Decimal("0"), Decimal(i.total) - (paid.get(i.id) or Decimal("0")))
        unpaid += bal
        out.append({"id": str(i.id), "number": i.number, "issue_date": i.issue_date, "due_date": i.due_date,
                    "total": float(i.total), "balance": float(bal), "status": i.status})
    return {"invoices": out, "unpaid": float(unpaid)}


class LineUpdate(BaseModel):
    description: str | None = None
    qty: float | None = None
    unit_price: float | None = None


@router.put("/recurring-billing/lines/{line_id}", response_model=LineOut)
async def update_line(line_id: uuid.UUID, payload: LineUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    line = await db.get(RecurringBillingLine, line_id)
    if not line:
        raise HTTPException(status_code=404, detail="Ligne introuvable")
    for k, v in payload.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(line, k, v)
    await db.commit()
    return line


class PauseIn(BaseModel):
    pause_start: date | None = None     # par defaut aujourd'hui : la pause commence quand on la donne
    pause_end: date


@router.put("/recurring-billing/{rb_id}/pause", response_model=RecurringBillingOut)
async def set_pause(rb_id: uuid.UUID, payload: PauseIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """TASK-005.26 : pause de facturation (ex. 8 mois et 12 jours gratuits) -- aucun cycle qui commence dans la pause
    n'est facture ; a la reprise, le cycle repart de cette date, meme rythme. Modifiable, annulable."""
    rb = await _get_rb(rb_id, db)
    payload.pause_start = rb.pause_start or payload.pause_start or clock.today()
    if payload.pause_end <= payload.pause_start:
        raise HTTPException(status_code=400, detail="La fin de la pause doit suivre son début")
    rb.pause_start, rb.pause_end = payload.pause_start, payload.pause_end
    await db.commit()
    return _out(await _get_rb(rb_id, db))


@router.delete("/recurring-billing/{rb_id}/pause", response_model=RecurringBillingOut)
async def clear_pause(rb_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rb = await _get_rb(rb_id, db)
    rb.pause_start = rb.pause_end = None
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


def next_missing_cycle(rb) -> tuple[date, date]:
    """Prochain cycle a facturer : celui qui suit le dernier facture (ou le premier). Un cycle
    oublie n'est jamais saute -- chaque generation rattrape le plus ancien cycle manquant."""
    # Derniere facture anterieure au debut du cycle : le cycle a ete deplace (reprise apres un echange, TASK-005.13)
    nxt = rb.start_date if not rb.last_invoice_date or rb.last_invoice_date < rb.start_date \
        else _cycle_bounds(rb.start_date, rb.frequency, rb.last_invoice_date)[1]
    shifted = paused_next(rb, nxt)
    if shifted:                   # TASK-005.26 : la pause repousse le cycle de sa duree
        return _cycle_bounds(shifted, rb.frequency, shifted)
    return _cycle_bounds(rb.start_date, rb.frequency, nxt)


def paused_next(rb, nxt: date) -> date | None:
    """Philippe (2026-10-16) : « si je fais une pause de 8 mois et 2 jours, c'est juste une pause, le cycle continue
    après ; s'il restait 23 jours avant sa facturation, quand ça recommence il reste 23 jours » -- la prochaine facture
    est repoussee de la duree de la pause (pause_end - pause_start, en jours), le rythme reprend de la."""
    if not (getattr(rb, "pause_start", None) and rb.pause_end) or nxt < rb.pause_start:
        return None
    return nxt + (rb.pause_end - rb.pause_start)


def resume_after_pause(rb, today: date) -> bool:
    """La date repoussee est arrivee : le cycle repart de cette date (meme rythme) et la pause est effacee."""
    nxt = rb.start_date if not rb.last_invoice_date or rb.last_invoice_date < rb.start_date \
        else _cycle_bounds(rb.start_date, rb.frequency, rb.last_invoice_date)[1]
    shifted = paused_next(rb, nxt)
    if not shifted or shifted > today:
        return False
    rb.start_date = shifted
    rb.pause_start = rb.pause_end = None
    return True


class NothingToGenerate(Exception):
    pass


class CycleCoveredByBarter(Exception):
    """Service couvert par un echange (troc) : des mois ont ete comptes sur le credit, aucune facture
    (TASK-005.13). L'appelant fait le commit."""
    pass


async def create_recurring_invoice(db: AsyncSession, rb: CompanyRecurringBilling, issue: bool = False) -> Invoice:
    """Facture du prochain cycle manquant (voir generate_invoice_from_recurring). issue=True (creation
    automatique) : facture emise mais « non transmise » -- c'est Philippe qui l'envoie au client.
    Leve NothingToGenerate si rien n'est du. Ne fait pas le commit."""
    if not rb.lines:
        raise NothingToGenerate("Aucune ligne à facturer")
    from app.models.company import Company as _Co
    owner_co = await db.get(_Co, rb.company_id)
    if owner_co and owner_co.is_owner:                  # TASK-002.5 : la compagnie du proprietaire n'est jamais facturee
        from app.core.owner import NOT_BILLED
        raise NothingToGenerate(NOT_BILLED)
    # TASK-005.13 : echange (troc) -- le credit paie des mois de service ; a l'epuisement, le cycle repart a la
    # date de reprise (start_date deplace). Jamais avant la toute premiere facture (facturee d'avance).
    barter_changed = False
    if rb.first_invoice_generated:
        barter_changed = await barter.advance(db, rb, clock.today())
        if rb.barter_cursor is not None:
            await db.flush()
            msg = f"Service payé par l'échange (troc) jusqu'au {rb.barter_cursor - timedelta(days=1)}"
            if barter_changed:
                raise CycleCoveredByBarter(msg)
            raise NothingToGenerate(msg)
    resume_after_pause(rb, clock.today())          # TASK-005.26
    cycle_start, cycle_end = next_missing_cycle(rb)
    if barter_changed and cycle_start > clock.today():
        await db.flush()
        raise CycleCoveredByBarter(f"Échange (troc) épuisé : la facturation reprend le {cycle_start}")
    if rb.end_date and cycle_start > rb.end_date:
        raise NothingToGenerate(f"Facture périodique terminée le {rb.end_date} : plus aucune facture à générer")
    if cycle_start > clock.today():
        raise NothingToGenerate(f"Rien à facturer : le prochain cycle commence le {cycle_start}")
    is_first_invoice = not rb.first_invoice_generated
    next_cycle_start, next_cycle_end = _cycle_bounds(rb.start_date, rb.frequency, cycle_end)

    inv = Invoice(
        number=await _next_number(db),
        company_id=rb.company_id,
        issue_date=cycle_start,
        due_date=cycle_start + timedelta(days=await payment_terms_days(db)),
        notes=f"Généré depuis la facture périodique « {rb.name} »" if rb.name else "Généré depuis la récurrence téléphonique SIPV",
        site_id=rb.site_id,
        site_label_snapshot=rb.site.label if rb.site else None,
        is_recurring=True,
        recurrence_frequency=rb.frequency,
        recurrence_next_date=cycle_end,
        recurring_billing_id=rb.id,
    )
    if issue:
        inv.status, inv.transmission_status = "envoyee", "non_transmise"
    db.add(inv)
    await db.flush()
    sort_order = 0
    for line in rb.lines:
        db.add(InvoiceLine(
            invoice_id=inv.id, catalogue_item_id=line.catalogue_item_id,
            description=_dated_desc(line.description, cycle_start, cycle_end),
            qty=line.qty, unit_price=line.unit_price,
            line_total=_money(Decimal(str(line.qty)) * Decimal(str(line.unit_price))), sort_order=sort_order,
        ))
        sort_order += 1
        if is_first_invoice and not line.is_prorata_credit:
            db.add(InvoiceLine(
                invoice_id=inv.id, catalogue_item_id=line.catalogue_item_id,
                description=_dated_desc(f"{line.description} (facturé d'avance)", next_cycle_start, next_cycle_end),
                qty=line.qty, unit_price=line.unit_price,
                line_total=_money(Decimal(str(line.qty)) * Decimal(str(line.unit_price))), sort_order=sort_order,
            ))
            sort_order += 1
    if is_first_invoice:
        rb.first_invoice_generated = True
    rb.last_invoice_date = cycle_start
    # Les crédits de prorata sont ponctuels -- une fois facturés, ils disparaissent
    # de la récurrence (sinon ils seraient refacturés indéfiniment au cycle suivant).
    for line in list(rb.lines):
        if line.is_prorata_credit:
            await db.delete(line)
    await db.flush()
    inv = (await db.execute(
        select(Invoice).options(selectinload(Invoice.lines), selectinload(Invoice.company)).where(Invoice.id == inv.id)
    )).scalar_one()
    _recalc(inv)
    if issue:
        await db.flush()
        from app.core.client_credit import on_issued
        await on_issued(db, inv)   # TASK-005.13 / 042.2 : l'echange (troc), puis le credit du client, paient la facture emise
    return inv


async def lock_recurrence(db: AsyncSession, rb_id: uuid.UUID) -> CompanyRecurringBilling:
    """Verrouille la recurrence le temps de la generation (bouton et creation automatique
    simultanes ne peuvent pas facturer deux fois le meme cycle)."""
    await db.execute(select(CompanyRecurringBilling.id).where(CompanyRecurringBilling.id == rb_id).with_for_update())
    rb = await _get_rb(rb_id, db)
    await db.refresh(rb)
    return rb


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
    rb = await lock_recurrence(db, rb_id)
    try:
        inv = await create_recurring_invoice(db, rb)
    except NothingToGenerate as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except CycleCoveredByBarter as e:
        await db.commit()
        return {"covered": True, "detail": str(e)}
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

    # TASK-002.4 : un service d'une succursale (son adresse 911) est facture a la compagnie choisie pour elle
    from app.core import branch_billing
    if payload.action.endswith("_removed"):
        rb_line = (await db.execute(select(RecurringBillingLine).join(CompanyRecurringBilling).where(
            CompanyRecurringBilling.is_telephony == True, RecurringBillingLine.service_ref == payload.service_ref,
            RecurringBillingLine.is_prorata_credit == False))).scalars().first()
        rb = await db.get(CompanyRecurringBilling, rb_line.recurring_billing_id, options=[selectinload(CompanyRecurringBilling.lines)]) if rb_line else None
        owner = company
    else:
        owner = await branch_billing.service_owner(db, company, payload.service_type, payload.service_ref)
        rb = await branch_billing.target_for(db, company, owner)
    if not rb or not rb.is_active:
        return {"status": "ignored", "reason": "pas de récurrence active pour cette compagnie"}

    effective = payload.effective_date or clock.today()

    if payload.action.endswith("_added"):
        cat_result = await db.execute(select(CatalogueItem).where(CatalogueItem.sipv_service_type == payload.service_type, CatalogueItem.is_active == True))
        cat_item = cat_result.scalar_one_or_none()
        unit_price = cat_item.price if cat_item else 0.0
        desc = payload.description or (cat_item.name if cat_item else f"Service SIPV ({payload.service_type}) — ⚠️ aucun forfait catalogue configuré")
        line = RecurringBillingLine(
            recurring_billing_id=rb.id, catalogue_item_id=cat_item.id if cat_item else None,
            description=desc, qty=1, unit_price=unit_price,
            service_ref=payload.service_ref, service_type=payload.service_type, for_company_id=owner.id,
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
