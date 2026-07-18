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

class EmployeeCreate(BaseModel):
    contact_id: uuid.UUID
    hourly_rate: float | None = None
    monthly_salary: float | None = None
    hire_date: date | None = None

class EmployeeUpdate(BaseModel):
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
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(emp, k, v)
    await db.commit()
    return _emp_out(await _get_employee(contact_id, db))


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
