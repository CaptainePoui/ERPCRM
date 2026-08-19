"""TASK-032.2 : rapports CDR programmes par courriel (fiche compagnie, onglet CDR)."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class CdrReportSchedule(Base):
    __tablename__ = "cdr_report_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Courriels separes par virgule -- pas de table separee, jamais plus
    # qu'une poignee de destinataires pour ce genre de rapport.
    recipients: Mapped[str] = mapped_column(Text, nullable=False)
    # Filtres -- None = tous
    extension: Mapped[str | None] = mapped_column(String(20))
    direction: Mapped[str | None] = mapped_column(String(10))  # inbound / outbound

    # Recurrence -- meme pattern que BackupCycle (TASK-035), + days_of_week
    # (nouveau) pour le mode "journalier avec jours choisis" demande ici.
    # "custom_days" / "weekly" / "monthly"
    frequency_type: Mapped[str] = mapped_column(String(20), nullable=False, default="weekly")
    days_of_week: Mapped[list[int] | None] = mapped_column(ARRAY(Integer))  # custom_days -- 0=lundi..6=dimanche
    day_of_week: Mapped[int | None] = mapped_column(Integer)  # weekly -- 0=lundi..6=dimanche
    day_of_month: Mapped[int | None] = mapped_column(Integer)  # monthly -- 1-31

    send_hour: Mapped[str] = mapped_column(String(5), nullable=False, default="08:00")  # HH:MM, heure locale
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="America/Toronto")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class CdrReportRunLog(Base):
    """Historique des envois -- meme esprit que BackupRunLog."""
    __tablename__ = "cdr_report_run_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schedule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cdr_report_schedules.id", ondelete="CASCADE"), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    recipient_count: Mapped[int] = mapped_column(Integer, default=0)
    triggered_manually: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
