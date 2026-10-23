import uuid
from decimal import Decimal
from sqlalchemy import String, Text, Boolean, Float, Integer, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(50))
    office_phone: Mapped[str | None] = mapped_column(String(50))
    # Tenant telephonique SIPV
    sipv_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    sipv_tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    legal_name: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(100))
    neq: Mapped[str | None] = mapped_column(String(20))
    shareholder_type: Mapped[str | None] = mapped_column(String(50))
    employee_count: Mapped[int | None] = mapped_column(Integer)
    annual_revenue: Mapped[float | None] = mapped_column(Float)
    notes_internal: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # TASK-005.26 : entente -- la compagnie ne recoit jamais de frais de retard
    no_late_fees: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Compagnie du proprietaire (TASK-002.5) : une seule, celle qui possede le serveur -- jamais facturee ; ses coordonnees
    # sont imprimees sur les PDF (Administration -> Entreprise les modifie ici)
    is_owner: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    tps_number: Mapped[str | None] = mapped_column(String(40))
    tvq_number: Mapped[str | None] = mapped_column(String(40))

    # Gestionnaire interne
    internal_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    # Vendeur référent (contact)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    # TASK-007.3 : le vendeur fait le premier support (taux « avec support ») ou a seulement refere le client (taux
    # « référence ») ; vendor_rate = taux propre a ce client (vide = taux du vendeur pour ce mode)
    vendor_support: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    vendor_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))

    # Succursale (TASK-002.4) : sa maison mere (plusieurs niveaux possibles) ; facturee a elle-meme, sauf si on choisit une
    # de ses maisons meres (bill_to_company_id)
    parent_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    bill_to_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)

    # Internet et reseau du client (TASK-002.3) : la compagnie qui s'en occupe et son contact prefere -- liens, jamais copies
    internet_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    internet_contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), index=True)
    network_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    network_contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), index=True)

    # Devise
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    exchange_rate: Mapped[float] = mapped_column(Float, default=1.0)

    # Taxes
    is_taxable: Mapped[bool] = mapped_column(Boolean, default=True)
    tvq_applicable: Mapped[bool] = mapped_column(Boolean, default=True)
    tax_country: Mapped[str] = mapped_column(String(2), default="CA")
    tax_province: Mapped[str] = mapped_column(String(2), default="QC")
    tps_rate: Mapped[float] = mapped_column(Float, default=5.0)
    tvq_rate: Mapped[float] = mapped_column(Float, default=9.975)

    entity: Mapped["Entity"] = relationship("Entity", back_populates="company")
    internal_manager: Mapped["User"] = relationship("User", foreign_keys=[internal_manager_id])
    vendor: Mapped["Contact"] = relationship("Contact", foreign_keys=[vendor_id])
    contact_companies: Mapped[list["ContactCompany"]] = relationship("ContactCompany", back_populates="company", cascade="all, delete-orphan")
