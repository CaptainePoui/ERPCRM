import uuid
from sqlalchemy import String, Text, Boolean, Float, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_number: Mapped[str | None] = mapped_column(String(50))
    legal_name: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(100))
    neq: Mapped[str | None] = mapped_column(String(20))
    shareholder_type: Mapped[str | None] = mapped_column(String(50))
    employee_count: Mapped[int | None] = mapped_column(Integer)
    annual_revenue: Mapped[float | None] = mapped_column(Float)
    notes_internal: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Gestionnaire interne
    internal_manager_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

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
    contact_companies: Mapped[list["ContactCompany"]] = relationship("ContactCompany", back_populates="company", cascade="all, delete-orphan")
