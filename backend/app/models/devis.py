import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Float, Boolean, Date, DateTime, Integer, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Devis(Base):
    """Quote/estimate -- miroir d'Invoice, precede la facturation (pas de paiement,
    pas de taxes appliquees automatiquement au meme titre, statuts propres)."""
    __tablename__ = "devis"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="brouillon")  # brouillon envoye accepte refuse expire

    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text)

    tps_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), default=Decimal("5.0"))
    tvq_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), default=Decimal("9.975"))
    apply_tps: Mapped[bool] = mapped_column(Boolean, default=True)
    apply_tvq: Mapped[bool] = mapped_column(Boolean, default=True)

    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tps_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tvq_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    # Facture generee a partir de ce devis (une fois accepte), null tant que non converti
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    lines: Mapped[list["DevisLine"]] = relationship("DevisLine", back_populates="devis", order_by="DevisLine.sort_order", cascade="all, delete-orphan")


class DevisLine(Base):
    __tablename__ = "devis_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    devis_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("devis.id", ondelete="CASCADE"), nullable=False)
    catalogue_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("catalogue_items.id", ondelete="SET NULL"))

    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1.0"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    # Taxe par ligne, comme les factures (TASK-025.1)
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    devis: Mapped["Devis"] = relationship("Devis", back_populates="lines")
    catalogue_item: Mapped["CatalogueItem | None"] = relationship("CatalogueItem")
