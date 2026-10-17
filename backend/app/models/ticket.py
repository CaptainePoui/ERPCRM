import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

TICKET_STATUSES = ["ouvert", "en_cours", "en_attente", "en_attente_client", "facture", "ferme"]


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)

    priority: Mapped[str] = mapped_column(String(20), default="normal")  # faible normal urgent critique
    status: Mapped[str] = mapped_column(String(20), default="ouvert")    # ouvert en_cours en_attente en_attente_client facture ferme

    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=False)
    # Service facture, choisi une fois pour tout le ticket (TASK-006.5, 2026-10-17) -- plus de service par note.
    catalogue_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("catalogue_items.id", ondelete="SET NULL"), nullable=True)
    # Temps deja facture (secondes) : un ticket rouvert ne facture que le temps ajoute depuis.
    invoiced_seconds: Mapped[int] = mapped_column(Integer, default=0)
    # Brouillon du message en cours, garde cote serveur (survit a un rechargement, suit l'appareil).
    draft_message: Mapped[str | None] = mapped_column(Text)

    # Lien vers le RDV Google Calendar qui a cree ce ticket automatiquement (TASK-015.15).
    google_calendar_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_calendar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    company: Mapped["Company"] = relationship("Company")
    contact: Mapped["Contact | None"] = relationship("Contact")
    assigned_to: Mapped["User | None"] = relationship("User")
    catalogue_item: Mapped["CatalogueItem | None"] = relationship("CatalogueItem")
    messages: Mapped[list["TicketMessage"]] = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketMessage.created_at")
    periods: Mapped[list["TicketTimePeriod"]] = relationship("TicketTimePeriod", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketTimePeriod.started_at")
    adjustments: Mapped[list["TicketTimeAdjustment"]] = relationship("TicketTimeAdjustment", back_populates="ticket", cascade="all, delete-orphan", order_by="TicketTimeAdjustment.created_at")


class TicketMessage(Base):
    """Un message de la conversation du ticket (TASK-006.5) : texte libre + images, horodate, sans temps attache.
    author_kind : tech (utilisateur ERPCRM), client (reponse courriel), systeme (evenement)."""
    __tablename__ = "ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    author_kind: Mapped[str] = mapped_column(String(20), default="tech")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="messages")
    user: Mapped["User | None"] = relationship("User")
    attachments: Mapped[list["TicketAttachment"]] = relationship("TicketAttachment", back_populates="message", cascade="all, delete-orphan", order_by="TicketAttachment.created_at")


class TicketAttachment(Base):
    """Image (ou fichier) collee dans un message ; fichier dans storage/ticket_attachments/<id>.<ext>."""
    __tablename__ = "ticket_attachments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ticket_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    message: Mapped["TicketMessage"] = relationship("TicketMessage", back_populates="attachments")


class TicketTimePeriod(Base):
    """Une periode de chrono d'un technicien sur un ticket (heures ecrites par le serveur seulement).
    En cours tant que ended_at est NULL. Plusieurs tickets peuvent tourner en meme temps (choix du technicien)."""
    __tablename__ = "ticket_time_periods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Pourquoi elle s'est arretee : pause, fermeture, autre_ticket (pause choisie au demarrage d'un autre), attente_client
    stop_source: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="periods")
    user: Mapped["User | None"] = relationship("User")


class TicketTimeAdjustment(Base):
    """Trace de chaque correction du temps total (clic sur le chrono) ou de temps offert : avant/apres, qui, quand, pourquoi.
    kind : correction (change le temps du ticket) | offert (temps retire de la facture, le temps travaille reste)."""
    __tablename__ = "ticket_time_adjustments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(20), default="correction")
    before_seconds: Mapped[int] = mapped_column(Integer, default=0)
    after_seconds: Mapped[int] = mapped_column(Integer, default=0)
    delta_seconds: Mapped[int] = mapped_column(Integer, default=0)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="adjustments")
    user: Mapped["User | None"] = relationship("User")
