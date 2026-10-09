import uuid
from datetime import datetime, timezone, date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.employee import Employee, SalaryPayment
from app.models.contact import Contact
from app.models.invoice import Invoice
from app.models.user import User
from app.api.v1.endpoints.settings import get_setting

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class EmployeeOut(BaseModel):
    contact_id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    hourly_rate: float | None
    monthly_salary: float | None
    hire_date: date | None
    is_active: bool
    user_id: uuid.UUID | None = None
    has_signature: bool = False

class EmployeeCreate(BaseModel):
    contact_id: uuid.UUID
    hourly_rate: float | None = None
    monthly_salary: float | None = None
    hire_date: date | None = None

class EmployeeUpdate(BaseModel):
    user_id: uuid.UUID | None = None      # compte de connexion (TASK-007.1)
    hourly_rate: float | None = None
    monthly_salary: float | None = None
    hire_date: date | None = None
    is_active: bool | None = None

class SalaryPaymentOut(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    first_name: str
    last_name: str
    period_year: int
    period_month: int
    amount: float
    status: str
    interac_confirmation: str | None
    notes: str | None
    paid_at: datetime | None
    created_at: datetime

class SalaryPaymentCreate(BaseModel):
    employee_id: uuid.UUID
    period_year: int
    period_month: int
    amount: float
    notes: str | None = None

class SalaryPaymentPay(BaseModel):
    interac_confirmation: str | None = None
    notes: str | None = None

class CommissionOut(BaseModel):
    contact_id: uuid.UUID
    first_name: str
    last_name: str
    period_year: int
    period_month: int
    invoiced_total: float
    commission_amount: float
    commission_rate: float


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_employee(contact_id: uuid.UUID, db: AsyncSession) -> Employee:
    r = await db.execute(
        select(Employee).options(selectinload(Employee.contact))
        .where(Employee.contact_id == contact_id)
    )
    emp = r.scalar_one_or_none()
    if not emp:
        raise HTTPException(status_code=404, detail="Employé introuvable")
    return emp

def _emp_out(emp: Employee) -> EmployeeOut:
    return EmployeeOut(
        contact_id=emp.contact_id,
        first_name=emp.contact.first_name,
        last_name=emp.contact.last_name,
        email=emp.contact.email,
        hourly_rate=emp.hourly_rate,
        monthly_salary=emp.monthly_salary,
        hire_date=emp.hire_date,
        is_active=emp.is_active,
        user_id=emp.user_id,
        has_signature=bool((emp.email_signature or "").strip()),
    )


# ── Employee endpoints ────────────────────────────────────────────────────────

@router.get("", response_model=list[EmployeeOut])
async def list_employees(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await db.execute(select(Employee).options(selectinload(Employee.contact)).where(Employee.is_active == True))
    return [_emp_out(e) for e in r.scalars().all()]


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(payload: EmployeeCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    existing = await db.execute(select(Employee).where(Employee.contact_id == payload.contact_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce contact est déjà un employé")
    emp = Employee(contact_id=payload.contact_id, hourly_rate=payload.hourly_rate,
                   monthly_salary=payload.monthly_salary, hire_date=payload.hire_date)
    db.add(emp)
    await db.commit()
    return _emp_out(await _get_employee(payload.contact_id, db))


@router.patch("/{contact_id}", response_model=EmployeeOut)
async def update_employee(contact_id: uuid.UUID, payload: EmployeeUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    emp = await _get_employee(contact_id, db)
    data = payload.model_dump(exclude_unset=True)
    if data.get("user_id"):
        if not await db.get(User, data["user_id"]):
            raise HTTPException(status_code=400, detail="Compte de connexion introuvable")
        other = (await db.execute(select(Employee).where(Employee.user_id == data["user_id"], Employee.contact_id != contact_id))).scalar_one_or_none()
        if other:
            raise HTTPException(status_code=409, detail="Ce compte de connexion est déjà relié à un autre employé")
    if "user_id" in data and data["user_id"] != emp.user_id and emp.user_id:
        # sa boite personnelle (TASK-047.2) suit le compte de connexion de l'employe
        from app.models.mailbox import Mailbox
        for mb in (await db.execute(select(Mailbox).where(Mailbox.kind == "personal", Mailbox.owner_user_id == emp.user_id))).scalars().all():
            mb.owner_user_id = data["user_id"]
    for k, v in data.items():
        setattr(emp, k, v)
    await db.commit()
    return _emp_out(await _get_employee(contact_id, db))


# ── Signature des courriels de communication (TASK-007.1, 2026-10-08) ─────────
# Philippe : une signature par employé, texte et images, polices au choix ; ajoutée aux courriels de communication
# (tickets, tâches) envoyés par son compte de connexion -- jamais aux factures (« pas les factures envoyées avec une
# signature, juste les courriels de communication »). Images gardées en data: dans le HTML, converties en pièces
# intégrées à l'envoi (core/signature.py).

MAX_SIGNATURE_BYTES = 3 * 1024 * 1024


class SignatureIO(BaseModel):
    html: str = ""


@router.get("/users")
async def list_login_accounts(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Comptes de connexion actifs, pour relier un employé à celui qu'il utilise."""
    rows = (await db.execute(select(User).where(User.is_active == True).order_by(User.full_name))).scalars().all()
    return [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in rows]


@router.get("/{contact_id}/signature", response_model=SignatureIO)
async def get_signature(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return SignatureIO(html=(await _get_employee(contact_id, db)).email_signature or "")


@router.put("/{contact_id}/signature", response_model=SignatureIO)
async def save_signature(contact_id: uuid.UUID, payload: SignatureIO, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if len(payload.html.encode()) > MAX_SIGNATURE_BYTES:
        raise HTTPException(status_code=400, detail="Signature trop lourde (3 Mo maximum) : réduisez la taille des images")
    emp = await _get_employee(contact_id, db)
    from app.core.signature import is_empty
    emp.email_signature = None if is_empty(payload.html) else payload.html
    await db.commit()
    return SignatureIO(html=emp.email_signature or "")


# ── Courriels de l'employe (TASK-047.2, 2026-10-09) ───────────────────────────
# Philippe : « philippe@ apparait a la meme place que tous les services mais juste moi je le vois ; ce courriel on va
# le mettre dans Employe : le courriel professionnel et le courriel perso, qui va servir juste a envoyer les paies ou a
# ecrire a l'employe ». Professionnel = sa boite personnelle (copiee dans la boite de reception, visible par lui et le
# patron) ; personnel = l'adresse de sa fiche contact.

class EmployeeMailIn(BaseModel):
    work_email: str | None = None
    password: str | None = None            # vide = garder celui enregistre
    sync_since: date | None = None
    personal_email: str | None = None


async def _work_box(db, emp):
    from app.models.mailbox import Mailbox
    if not emp.user_id:
        return None
    return (await db.execute(select(Mailbox).where(Mailbox.kind == "personal", Mailbox.owner_user_id == emp.user_id))).scalars().first()


def _mail_out(emp, mb, login: str | None = None) -> dict:
    return {"personal_email": emp.contact.email, "work_email": login or (mb.email if mb else None), "login_email": login,
            "mailbox_id": str(mb.id) if mb else None, "has_password": bool(mb and mb.password_enc),
            "sync_since": mb.sync_since.isoformat() if mb and mb.sync_since else None,
            "last_sync_at": mb.last_sync_at if mb else None, "sync_error": mb.sync_error if mb else None,
            "last_error": mb.last_error if mb else None}


@router.get("/{contact_id}/mail")
async def get_employee_mail(contact_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    emp = await _get_employee(contact_id, db)
    return _mail_out(emp, await _work_box(db, emp), await _login(db, emp))


async def _login(db, emp) -> str | None:
    if not emp.user_id:
        return None
    return (await db.execute(select(User.email).where(User.id == emp.user_id))).scalar_one_or_none()


@router.put("/{contact_id}/mail")
async def save_employee_mail(contact_id: uuid.UUID, p: EmployeeMailIn, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    """Courriel professionnel = son courriel de connexion a ERPCRM (un seul endroit, core/accounts.py) et l'adresse de sa
    boite personnelle ; courriel personnel = celui de sa fiche contact."""
    from app.core import mailboxes as mbx
    from app.core.accounts import set_login_email
    from app.core.portal_access import guard_contact_email
    from app.core.crypto import encrypt
    from app.models.mailbox import Mailbox
    emp = await _get_employee(contact_id, db)
    personal = (p.personal_email or "").strip().lower() or None
    if personal and "@" not in personal:
        raise HTTPException(status_code=400, detail="Courriel personnel invalide")
    if personal != (emp.contact.email or "").lower() or None:
        await guard_contact_email(db, emp.contact.id, personal)
    emp.contact.email = personal
    work = (p.work_email or "").strip().lower() or None
    mb = await _work_box(db, emp)
    if work:
        if "@" not in work:
            raise HTTPException(status_code=400, detail="Courriel professionnel invalide")
        if not emp.user_id:
            raise HTTPException(status_code=400, detail="Choisissez d'abord le compte de connexion de l'employé : sa boîte n'est visible que par lui")
        other = (await db.execute(select(Mailbox).where(func.lower(Mailbox.email) == work))).scalars().first()
        if other and (not mb or other.id != mb.id):
            if other.kind == "personal" or other.functions:
                raise HTTPException(status_code=409, detail=f"{work} est déjà une boîte de l'entreprise avec une fonction ou un autre propriétaire (Administration → Intégrations)")
            if mb:
                await db.delete(mb)
            mb = other                                  # deja ajoutee dans Administration : elle devient sa boite personnelle
            mb.kind, mb.owner_user_id = "personal", emp.user_id
        if not mb and not p.password:
            await set_login_email(db, await db.get(User, emp.user_id), work, me)
            await db.commit()                          # courriel de connexion seulement, sans boite copiee ici
            emp = await _get_employee(contact_id, db)
            return _mail_out(emp, None, await _login(db, emp))
        if not mb:
            host = mbx.default_host()
            if not host:
                raise HTTPException(status_code=400, detail="Serveur de courriel inconnu : ajoutez d'abord une boîte dans Administration → Intégrations")
            mb = Mailbox(kind="personal", owner_user_id=emp.user_id, host=host, imap_port=993, smtp_port=465, functions=[], is_active=True)
            db.add(mb)
        if mb.email != work:
            mb.uidvalidity, mb.last_uid = None, 0      # autre adresse : on recopie depuis le debut
        mb.email, mb.username = work, work
        mb.display_name = f"{emp.contact.first_name} {emp.contact.last_name}".strip()
        mbx.set_since(mb, p.sync_since)
        if p.password:
            mb.password_enc, mb.last_error = encrypt(p.password), None
    elif mb:
        await db.delete(mb)                            # rien n'est touche dans la boite elle-meme
        mb = None
    if work:
        await db.flush()
        await set_login_email(db, await db.get(User, emp.user_id), work, me)   # sa connexion suit (boite deja a jour)
    await db.commit()
    emp = await _get_employee(contact_id, db)
    return _mail_out(emp, await _work_box(db, emp), await _login(db, emp))


# ── Salary payments ───────────────────────────────────────────────────────────

def _pay_out(p: SalaryPayment) -> SalaryPaymentOut:
    return SalaryPaymentOut(
        id=p.id, employee_id=p.employee_id,
        first_name=p.employee.contact.first_name,
        last_name=p.employee.contact.last_name,
        period_year=p.period_year, period_month=p.period_month,
        amount=p.amount, status=p.status,
        interac_confirmation=p.interac_confirmation, notes=p.notes,
        paid_at=p.paid_at, created_at=p.created_at,
    )

_pay_opts = [selectinload(SalaryPayment.employee).selectinload(Employee.contact)]


@router.get("/payments", response_model=list[SalaryPaymentOut])
async def list_payments(year: int | None = None, month: int | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(SalaryPayment).options(*_pay_opts).order_by(SalaryPayment.period_year.desc(), SalaryPayment.period_month.desc())
    if year:
        q = q.where(SalaryPayment.period_year == year)
    if month:
        q = q.where(SalaryPayment.period_month == month)
    r = await db.execute(q)
    return [_pay_out(p) for p in r.scalars().all()]


@router.post("/payments", response_model=SalaryPaymentOut, status_code=status.HTTP_201_CREATED)
async def create_payment(payload: SalaryPaymentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    p = SalaryPayment(id=uuid.uuid4(), **payload.model_dump())
    db.add(p)
    await db.commit()
    r = await db.execute(select(SalaryPayment).options(*_pay_opts).where(SalaryPayment.id == p.id))
    return _pay_out(r.scalar_one())


@router.post("/payments/{payment_id}/pay", response_model=SalaryPaymentOut)
async def mark_paid(payment_id: uuid.UUID, payload: SalaryPaymentPay, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await db.execute(select(SalaryPayment).options(*_pay_opts).where(SalaryPayment.id == payment_id))
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Paiement introuvable")
    p.status = "paye"
    p.paid_at = datetime.now(timezone.utc)
    if payload.interac_confirmation:
        p.interac_confirmation = payload.interac_confirmation
    if payload.notes:
        p.notes = payload.notes
    await db.commit()
    return _pay_out(p)


# ── Commissions ───────────────────────────────────────────────────────────────

@router.get("/commissions", response_model=list[CommissionOut])
async def commissions_report(year: int, month: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.company import Company
    rate_str = await get_setting(db, "commission_rate")
    rate = float(rate_str) / 100

    # Get all companies with a vendor
    companies_r = await db.execute(
        select(Company).options(selectinload(Company.vendor))
        .where(Company.vendor_id.isnot(None))
    )
    companies = companies_r.scalars().all()

    results = []
    for company in companies:
        # Sum invoices for this company in this period
        inv_r = await db.execute(
            select(func.sum(Invoice.total)).where(
                Invoice.company_id == company.id,
                extract('year', Invoice.issue_date) == year,
                extract('month', Invoice.issue_date) == month,
            )
        )
        total = inv_r.scalar() or 0.0
        if total > 0:
            results.append(CommissionOut(
                contact_id=company.vendor.id,
                first_name=company.vendor.first_name,
                last_name=company.vendor.last_name,
                period_year=year,
                period_month=month,
                invoiced_total=total,
                commission_amount=round(total * rate, 2),
                commission_rate=float(rate_str),
            ))
    return results
