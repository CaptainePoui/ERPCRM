"""Echanges (troc) avec des compagnies clientes (TASK-005.13, 2026-10-07).

Une compagnie donne un bien ou un service a Simple IP (ex. D'Astous Auto repare la voiture, 860 $ hors
taxes). Choix de Philippe : « je rentre le montant hors taxe qui se retrouve a repousser la facture » --
le credit hors taxes (valeur recue moins les deductions, ex. textos non factures) couvre les cycles de la
facture periodique choisie a partir du premier cycle pas encore facture : aucune facture tant qu'un cycle
est couvert au complet, puis la facture reprend au prorata, a la date ou le credit s'epuise. Les pieces
justificatives (facture du garage, photo) restent jointes a la fiche : trace et preuve de l'echange.
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import String, Text, Date, DateTime, Numeric, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class BarterExchange(Base):
    __tablename__ = "barter_exchanges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    # La facture periodique que le credit repousse
    recurring_billing_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("company_recurring_billings.id", ondelete="SET NULL"), index=True)
    exchange_date: Mapped[date] = mapped_column(Date, nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)       # ce que la compagnie a donne
    received_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)   # hors taxes
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    deductions: Mapped[list["BarterDeduction"]] = relationship("BarterDeduction", cascade="all, delete-orphan", order_by="BarterDeduction.sort_order", lazy="selectin")
    files: Mapped[list["BarterFile"]] = relationship("BarterFile", cascade="all, delete-orphan", order_by="BarterFile.created_at", lazy="selectin")
    applications: Mapped[list["BarterApplication"]] = relationship("BarterApplication", cascade="all, delete-orphan", order_by="BarterApplication.cycle_start", lazy="selectin")


class BarterDeduction(Base):
    """Ajustement de l'echange (2026-10-08, separe de la valeur recue a la demande de Philippe). direction
    « simpleip » = en faveur de Simple IP, retire du credit (ex. texto 500 non facture, 6 x 19,95 $) ;
    « client » = en faveur du client, ajoute au credit. La note explique pourquoi."""
    __tablename__ = "barter_deductions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    barter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=1)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    direction: Mapped[str] = mapped_column(String(10), nullable=False, default="simpleip", server_default="simpleip")
    note: Mapped[str | None] = mapped_column(Text)


class BarterFile(Base):
    """Piece justificative (facture du fournisseur, photo...). Fichier garde hors du dossier public."""
    __tablename__ = "barter_files"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    barter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BarterApplication(Base):
    """Credit utilise sur un cycle de la facture periodique. invoice_id vide = cycle couvert au complet
    (aucune facture) ; sinon = facture repoussee au prorata (supprimer la facture rend le credit)."""
    __tablename__ = "barter_applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    barter_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False, index=True)
    recurring_billing_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("company_recurring_billings.id", ondelete="SET NULL"))
    cycle_start: Mapped[date] = mapped_column(Date, nullable=False)
    cycle_end: Mapped[date] = mapped_column(Date, nullable=False)
    covered_until: Mapped[date] = mapped_column(Date, nullable=False)     # dernier jour couvert par le credit
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
