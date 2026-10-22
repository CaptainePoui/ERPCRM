"""Vendeurs et leurs commissions (TASK-007.2, 2026-10-22).

Un vendeur est un contact (le « Vendeur référent » des fiches clients) payé par un fournisseur (lui-même ou sa
compagnie). Sa commission naît quand un client qu'il a apporté paie une facture : taux et règles propres à chaque
vendeur (10 % du montant avant taxes, factures périodiques seulement, par défaut). Les commissions d'un mois forment
une facture fournisseur « COM-AAAA-MM » : le solde dû au vendeur se suit et se paie comme un compte fournisseur.
"""
import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Boolean, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


def _now():
    return datetime.now(timezone.utc)


class SalesRep(Base):
    __tablename__ = "sales_reps"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, unique=True)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("10"))
    before_taxes: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    recurring_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Factures emises a partir de cette date (celles d'avant sont couvertes par le dernier paiement fait au vendeur)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    contact: Mapped["Contact"] = relationship("Contact", lazy="selectin")
    vendor: Mapped["Vendor"] = relationship("Vendor", lazy="selectin")


class CommissionEntry(Base):
    """Une commission (part payee d'une facture d'un client du vendeur) ou un ajustement fait a la main."""
    __tablename__ = "commission_entries"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sales_rep_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sales_reps.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="commission")   # commission | annulee | ajustement
    allocation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_allocations.id", ondelete="SET NULL"), unique=True)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"))
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    base: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    rate: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False, default=Decimal("0"))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    bill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="SET NULL"), index=True)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
