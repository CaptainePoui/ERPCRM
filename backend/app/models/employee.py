import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Boolean, Float, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Employee(Base):
    __tablename__ = "employees"

    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    hourly_rate: Mapped[float | None] = mapped_column(Float)
    monthly_salary: Mapped[float | None] = mapped_column(Float)
    hire_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    contact: Mapped["Contact"] = relationship("Contact")
    salary_payments: Mapped[list["SalaryPayment"]] = relationship("SalaryPayment", back_populates="employee", cascade="all, delete-orphan")


class SalaryPayment(Base):
    __tablename__ = "salary_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("employees.contact_id", ondelete="CASCADE"), nullable=False)
    period_year: Mapped[int]
    period_month: Mapped[int]
    amount: Mapped[float]
    status: Mapped[str] = mapped_column(String(20), default="a_payer")  # a_payer | paye
    interac_confirmation: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    employee: Mapped["Employee"] = relationship("Employee", back_populates="salary_payments")
