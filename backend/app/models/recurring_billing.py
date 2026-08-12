import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Float, Boolean, Date, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class CompanyRecurringBilling(Base):
    """
    TASK-021/S032 : une seule récurrence par compagnie, activée en même temps
    que le tenant SIPV (checkbox "Tenant téléphonique SIPV"). Regroupe TOUTES
    les lignes de services facturables (postes, DID, etc.) sur une même
    facture récurrente -- pas une récurrence séparée par service.
    """
    __tablename__ = "company_recurring_billings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    # mensuel / biannuel / annuel
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="mensuel")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # TASK-033 : la toute premiere facture generee pour cette recurrence double
    # les lignes (periode courante + periode suivante d'avance, chacune datee) --
    # sert a resynchroniser le cycle de facturation (services factures d'avance)
    # avec le delai de paiement de 30 jours. Une fois True, plus jamais redouble.
    first_invoice_generated: Mapped[bool] = mapped_column(Boolean, default=False, server_default='false')
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    lines: Mapped[list["RecurringBillingLine"]] = relationship(
        "RecurringBillingLine", back_populates="recurring_billing",
        cascade="all, delete-orphan", order_by="RecurringBillingLine.sort_order",
    )


class RecurringBillingLine(Base):
    """Ligne de service facturable dans la récurrence (poste, DID, ou crédit
    de prorata au retrait d'un service en cours de cycle)."""
    __tablename__ = "recurring_billing_lines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recurring_billing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("company_recurring_billings.id", ondelete="CASCADE"), nullable=False)
    catalogue_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("catalogue_items.id", ondelete="SET NULL"))
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    qty: Mapped[float] = mapped_column(Float, default=1.0)
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)
    # Référence au service SIPV d'origine (ex: extension id) -- permet de
    # retrouver/retirer LA bonne ligne quand SIPV signale un retrait, sans
    # dépendre du texte de la description.
    service_ref: Mapped[str | None] = mapped_column(String(100))
    service_type: Mapped[str | None] = mapped_column(String(30))
    # Ligne de crédit de prorata (générée au retrait) -- affichée/traitée
    # différemment d'une ligne de service normale (jamais reconduite elle-même).
    is_prorata_credit: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    recurring_billing: Mapped["CompanyRecurringBilling"] = relationship("CompanyRecurringBilling", back_populates="lines")
    catalogue_item: Mapped["CatalogueItem | None"] = relationship("CatalogueItem")
