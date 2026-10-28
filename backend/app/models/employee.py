import uuid
from datetime import datetime, timezone, date
from sqlalchemy import Boolean, Float, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from app.core.database import Base


class Employee(Base):
    __tablename__ = "employees"

    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), primary_key=True)
    hourly_rate: Mapped[float | None] = mapped_column(Float)
    monthly_salary: Mapped[float | None] = mapped_column(Float)
    hire_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Signature des courriels de communication (TASK-007.1, 2026-10-08) : compte de connexion de l'employe (celui qui
    # envoie depuis ERPCRM) et signature HTML (images en data:, converties en pieces integrees a l'envoi)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True)
    email_signature: Mapped[str | None] = mapped_column(Text)
    # Prise de RDV en ligne (TASK-026.11) : propose au client sur /rdv, nom affiche, marge libre avant/apres ses RDV
    # (Philippe 30/30, les autres 0 par defaut) et agendas Google qui le rendent occupe.
    booking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    booking_name: Mapped[str | None] = mapped_column(String(100))
    buffer_before: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    buffer_after: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    busy_calendars: Mapped[list[str]] = mapped_column(ARRAY(String(255)), nullable=False, default=list, server_default="{}")

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
