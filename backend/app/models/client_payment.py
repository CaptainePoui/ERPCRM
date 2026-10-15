import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Boolean, Date, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class ClientPayment(Base):
    """Encaissement client -- peut couvrir plusieurs factures via PaymentAllocation."""
    __tablename__ = "client_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)

    # pending | processing | confirmed | rejected | refunded | cancelled
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    # portal | manual | bank_import | interac_email | gateway
    source: Mapped[str] = mapped_column(String(30), default="manual")

    method_code: Mapped[str] = mapped_column(String(30), nullable=False)
    method_name: Mapped[str] = mapped_column(String(100), nullable=False)

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    # Reference unique affichee au client (ex: PAY-2026-0001) -- pour Interac
    reference: Mapped[str | None] = mapped_column(String(30), unique=True)

    notes: Mapped[str | None] = mapped_column(Text)
    portal_notes: Mapped[str | None] = mapped_column(Text)

    # Champs gateway (Elavon / Authorize.Net)
    transaction_ref: Mapped[str | None] = mapped_column(String(100))
    card_token: Mapped[str | None] = mapped_column(String(255))
    card_last4: Mapped[str | None] = mapped_column(String(4))

    received_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # TASK-005.24 : paiement d'une facture de l'ancien logiciel dont le document est perdu (avant juin 2020) --
    # aucune repartition, jamais du credit au dossier, aucun effet sur ventes/taxes ; visible au portail
    lost_invoice: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    lost_invoice_number: Mapped[str | None] = mapped_column(String(50))

    company: Mapped["Company"] = relationship("Company")
    allocations: Mapped[list["PaymentAllocation"]] = relationship(
        "PaymentAllocation", back_populates="payment", cascade="all, delete-orphan"
    )
    documents: Mapped[list["PaymentDocument"]] = relationship(
        "PaymentDocument", back_populates="payment", cascade="all, delete-orphan", passive_deletes=True,
        order_by="PaymentDocument.created_at"
    )


class PaymentAllocation(Base):
    """Repartition d'un encaissement ClientPayment sur une facture."""
    __tablename__ = "payment_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("client_payments.id", ondelete="CASCADE"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False)
    amount_allocated: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    payment: Mapped["ClientPayment"] = relationship("ClientPayment", back_populates="allocations")
    invoice: Mapped["Invoice"] = relationship("Invoice")


class CreditAllocation(Base):
    """Application d'un avoir (facture negative, credit_of_id) sur une facture du meme client
    (TASK-005.10) : reduit son solde comme un paiement, sans encaissement."""
    __tablename__ = "credit_allocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    credit_invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    applied_at: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PaymentDocument(Base):
    """Piece attachee a un encaissement (TASK-005.24 / TASK-042.8) : cheque numerise, preuve de virement...
    Fichier dans storage/payment_documents/ (hors /uploads public, inclus dans la sauvegarde)."""
    __tablename__ = "payment_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("client_payments.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="cheque", server_default="cheque")
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    payment: Mapped["ClientPayment"] = relationship("ClientPayment", back_populates="documents")
