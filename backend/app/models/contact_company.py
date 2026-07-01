import uuid
from sqlalchemy import Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class ContactCompany(Base):
    __tablename__ = "contact_companies"
    __table_args__ = (UniqueConstraint("contact_id", "company_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    contact: Mapped["Contact"] = relationship("Contact", back_populates="contact_companies")
    company: Mapped["Company"] = relationship("Company", back_populates="contact_companies")
    functions: Mapped[list["ContactCompanyFunction"]] = relationship("ContactCompanyFunction", back_populates="contact_company", cascade="all, delete-orphan")


class ContactCompanyFunction(Base):
    __tablename__ = "contact_company_functions"
    __table_args__ = (UniqueConstraint("contact_company_id", "function_id"),)

    contact_company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contact_companies.id", ondelete="CASCADE"), primary_key=True)
    function_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("functions.id", ondelete="CASCADE"), primary_key=True)

    contact_company: Mapped["ContactCompany"] = relationship("ContactCompany", back_populates="functions")
    function: Mapped["Function"] = relationship("Function", back_populates="contact_company_functions")
