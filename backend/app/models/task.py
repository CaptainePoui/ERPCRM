import uuid
from datetime import datetime, date, time, timezone
from sqlalchemy import String, Text, Boolean, Date, Time, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

TASK_STATUSES   = ["en_cours", "attente_info_client", "attente_info_sip", "complete", "annule"]
TASK_PRIORITIES = ["basse", "normale", "haute", "urgente"]
REMINDER_TYPES  = ["local", "email", "popup", "sms"]


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="SET NULL"), nullable=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    # Template source d'ou cette instance a ete creee (TASK-015.15 phase 2) --
    # permet de calculer le temps moyen historique par type de tache pour
    # suggerer estimated_minutes (moyenne +15%) et alimenter le rapport de
    # competence par employe. Distinct de parent_task_id (lien checklist).
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM"

    priority: Mapped[str] = mapped_column(String(20), default="normale")
    status: Mapped[str] = mapped_column(String(30), default="en_cours")

    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    is_template: Mapped[bool] = mapped_column(Boolean, default=False)
    template_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Lien vers une page ERPCRM (ou externe) a ouvrir pour executer cette
    # tache, ex. https://portail.simpleip.tel/companies (TASK-015.15 phase 2).
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Duree planifiee (saisie ou acceptee depuis la suggestion moyenne+15%)
    # et duree reellement prise a la derniere execution -- TASK-015.15 phase 2.
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actual_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Chrono par tache (meme pattern que Ticket.timer_start_at/timer_base_seconds,
    # voir tickets.py _elapsed_seconds/timer/pause/timer/resume) -- demarre au
    # clic sur link_url ou sur "Commencer", s'arrete a la confirmation du temps.
    timer_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timer_base_seconds: Mapped[int] = mapped_column(Integer, default=0)

    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company: Mapped["Company | None"] = relationship("Company")
    contact: Mapped["Contact | None"] = relationship("Contact")
    ticket: Mapped["Ticket | None"] = relationship("Ticket")
    invoice: Mapped["Invoice | None"] = relationship("Invoice")
    assigned_to: Mapped["User | None"] = relationship("User")
    reminders: Mapped[list["TaskReminder"]] = relationship("TaskReminder", back_populates="task", cascade="all, delete-orphan")
    subtasks: Mapped[list["Task"]] = relationship("Task", foreign_keys=[parent_task_id], back_populates="parent", order_by="Task.created_at")
    parent: Mapped["Task | None"] = relationship("Task", foreign_keys=[parent_task_id], back_populates="subtasks", remote_side=[id])


class TaskReminder(Base):
    __tablename__ = "task_reminders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)

    reminder_type: Mapped[str] = mapped_column(String(20), default="local")  # local | email | popup | sms
    minutes_before: Mapped[int] = mapped_column(Integer, default=0)  # 0=exact 5 15 30 60 1440 10080 -1=custom
    custom_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped["Task"] = relationship("Task", back_populates="reminders")
