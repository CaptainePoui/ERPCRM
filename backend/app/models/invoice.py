import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Boolean, Date, DateTime, Integer, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)

    status: Mapped[str] = mapped_column(String(20), default="brouillon")
    # statuts: brouillon envoyee payee partiellement_payee en_retard annulee

    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    notes: Mapped[str | None] = mapped_column(Text)

    # Taxes
    tps_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), default=Decimal("5.0"))
    tvq_rate: Mapped[Decimal] = mapped_column(Numeric(7, 4), default=Decimal("9.975"))
    apply_tps: Mapped[bool] = mapped_column(Boolean, default=True)
    apply_tvq: Mapped[bool] = mapped_column(Boolean, default=True)

    # Totaux calcules (denormalises pour affichage rapide)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tps_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    tvq_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))

    # Recurrence
    is_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    recurrence_frequency: Mapped[str | None] = mapped_column(String(20))  # mensuel trimestriel annuel
    recurrence_next_date: Mapped[date | None] = mapped_column(Date)

    # Credit (avoir)
    credit_of_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)

    # Succursale -- snapshot fige a la creation
    site_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("company_sites.id", ondelete="SET NULL"), nullable=True)
    site_label_snapshot: Mapped[str | None] = mapped_column(String(100))
    site_address_snapshot: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    site: Mapped["CompanySite"] = relationship("CompanySite")
    lines: Mapped[list["InvoiceLine"]] = relationship("InvoiceLine", back_populates="invoice", order_by="InvoiceLine.sort_order", cascade="all, delete-orphan")


class InvoiceLine(Base):
    __tablename__ = "invoice_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    catalogue_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("catalogue_items.id", ondelete="SET NULL"))

    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1.0"))
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0.00"))
    # TASK-005.9 : taxe par ligne (TPS/TVQ seulement sur les lignes taxables, comme Zoho)
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="lines")
    catalogue_item: Mapped["CatalogueItem | None"] = relationship("CatalogueItem")
