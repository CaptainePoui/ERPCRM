import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Float, Boolean, Date, DateTime, Integer, ForeignKey
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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    company: Mapped["Company"] = relationship("Company")
    contact: Mapped["Contact | None"] = relationship("Contact")
    assigned_to: Mapped["User | None"] = relationship("User")
    # ⚠️ Bug corrige : trie uniquement par worked_at (un DATE, pas datetime) laissait
    # l'ordre indefini entre plusieurs entrees de la MEME journee -- une note tout
    # juste enregistree pouvait se retrouver enfouie plutot qu'en haut/bas de facon
    # previsible ("elle n'apparait pas de suite"). created_at (timestamp complet,
    # toujours croissant a l'insertion) sert de departage.
    entries: Mapped[list["TicketEntry"]] = relationship("TicketEntry", back_populates="ticket", cascade="all, delete-orphan", order_by="(TicketEntry.worked_at.desc(), TicketEntry.created_at.desc())")


class TicketEntry(Base):
    __tablename__ = "ticket_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    catalogue_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("catalogue_items.id", ondelete="SET NULL"), nullable=True)

    description: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    worked_at: Mapped[date] = mapped_column(Date, nullable=False)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=False)
    # Marque une fois incluse dans une facture -- permet de rouvrir un ticket deja
    # facture et de facturer SEULEMENT le nouveau temps accumule depuis (une 2e
    # facture distincte), sans jamais refacturer les memes minutes deux fois.
    invoiced: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    ticket: Mapped["Ticket"] = relationship("Ticket", back_populates="entries")
    user: Mapped["User | None"] = relationship("User")
    catalogue_item: Mapped["CatalogueItem | None"] = relationship("CatalogueItem")
