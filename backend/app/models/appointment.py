import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

APPOINTMENT_TYPES = ["appel", "rdv"]
APPOINTMENT_STATUSES = ["confirme", "annule"]


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    type: Mapped[str] = mapped_column(String(10), nullable=False)  # appel | rdv
    status: Mapped[str] = mapped_column(String(10), default="confirme")

    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)

    address: Mapped[str | None] = mapped_column(String(500))  # rdv seulement
    description: Mapped[str | None] = mapped_column(Text)

    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"))

    google_event_id: Mapped[str | None] = mapped_column(String(255))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    contact: Mapped["Contact | None"] = relationship("Contact")
    company: Mapped["Company | None"] = relationship("Company")
    task: Mapped["Task | None"] = relationship("Task")
