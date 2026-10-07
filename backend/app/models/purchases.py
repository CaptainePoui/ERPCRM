"""Module Achats (TASK-044) : fournisseurs, depenses, factures fournisseurs, paiements effectues
(groupes : un paiement peut regler les factures de plusieurs fournisseurs, ex. remboursement de
carte de credit), avoirs fournisseur, depenses et factures fournisseurs periodiques.

Taxes : chaque ligne porte un code (tps_tvq | tps | tvq | aucune) ; le document est saisi
« hors taxes » (taxes ajoutees) ou « taxes incluses » (montants saisis = total ; taxes extraites,
le total ne bouge jamais d'un cent). Les taxes payees alimentent les CTI/RTI de la declaration
TPS/TVQ (TASK-043).
"""
import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Boolean, Date, DateTime, Integer, Numeric, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


def _now():
    return datetime.now(timezone.utc)


class Vendor(Base):
    __tablename__ = "vendors"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    # Le fournisseur est aussi une compagnie de la CRM (ex. ScopServ, IP Telecom)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    default_category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ExpenseCategory(Base):
    """Compte de depense (ex. Assurance, Frais de fournisseur, Commissions et frais)."""
    __tablename__ = "expense_categories"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    # Les taxes de cette categorie comptent dans les CTI/RTI (faux pour salaires, impots, versements de taxe)
    claims_tax_credits: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    description: Mapped[str | None] = mapped_column(Text)
    tax_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="exclusive")  # exclusive | inclusive
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")     # tps_tvq | tps | tvq | aucune
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)                 # montant saisi
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tps_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tvq_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    paid_through: Mapped[str | None] = mapped_column(String(150))   # ex. compte BNC, carte de credit, remboursement employe
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="SET NULL"))
    reference: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    recurring_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recurring_expenses.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")       # manual | recurring | zoho_import
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    vendor: Mapped["Vendor | None"] = relationship("Vendor", lazy="selectin")
    category: Mapped["ExpenseCategory | None"] = relationship("ExpenseCategory", lazy="selectin")
    lines: Mapped[list["ExpenseLine"]] = relationship("ExpenseLine", cascade="all, delete-orphan",
                                                      order_by="ExpenseLine.sort_order", lazy="selectin")


# Classes d'une ligne de depense (Philippe, 2026-10-07) -- le nom de l'article va en note (description)
LINE_CLASSES = {
    "materiel_taxable": "Matériel taxable", "materiel_non_taxable": "Matériel non taxable",
    "service_taxable": "Service taxable", "service_non_taxable": "Service non taxable",
    "frais_fournisseur": "Frais de fournisseur", "assurance": "Assurance",
}


class ExpenseLine(Base):
    """Ligne d'une depense (une facture peut melanger du taxable et du non taxable). Montants tels
    que saisis selon le mode de la depense (hors taxes ou taxes incluses)."""
    __tablename__ = "expense_lines"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True)
    line_class: Mapped[str] = mapped_column(String(30), nullable=False, default="materiel_taxable")
    description: Mapped[str | None] = mapped_column(Text)          # nom de l'article (note sous la classe)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class ReceiptDocument(Base):
    """Recu ou facture depose (PDF, image, ZIP ouvert) : lu (texte/OCR), analyse par l'IA locale,
    verifie par le programme, puis transforme en depense. Le fichier original est garde (pieces
    justificatives des CTI/RTI)."""
    __tablename__ = "receipt_documents"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    from_zip: Mapped[str | None] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(Text, nullable=False)
    mime: Mapped[str | None] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # pending | reading | analyzing | created | review | failed | duplicate
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="pending")
    text: Mapped[str | None] = mapped_column(Text)
    extracted: Mapped[str | None] = mapped_column(Text)       # JSON lu par l'IA (corrige a la validation)
    checks: Mapped[str | None] = mapped_column(Text)          # JSON : verifications du programme
    error: Mapped[str | None] = mapped_column(Text)
    expense_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RecurringExpense(Base):
    __tablename__ = "recurring_expenses"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    description: Mapped[str | None] = mapped_column(Text)
    tax_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="exclusive")
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    paid_through: Mapped[str | None] = mapped_column(String(150))
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="mensuel")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    last_generated_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    vendor: Mapped["Vendor | None"] = relationship("Vendor", lazy="selectin")
    category: Mapped["ExpenseCategory | None"] = relationship("ExpenseCategory", lazy="selectin")


class Bill(Base):
    """Facture fournisseur. Statut calcule : brouillon | ouverte | partielle | payee | en_retard | annulee."""
    __tablename__ = "bills"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False, index=True)
    bill_number: Mapped[str | None] = mapped_column(String(100))
    bill_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ouverte")
    tax_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="exclusive")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tps_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tvq_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    # Ajustement d'arrondi du fournisseur (ex. -0,01 $) : compris dans le total, hors taxes
    adjustment: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"), server_default="0")
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    notes: Mapped[str | None] = mapped_column(Text)
    recurring_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("recurring_bills.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    vendor: Mapped["Vendor"] = relationship("Vendor", lazy="selectin")
    lines: Mapped[list["BillLine"]] = relationship("BillLine", back_populates="bill", cascade="all, delete-orphan",
                                                   order_by="BillLine.sort_order", lazy="selectin")


class BillLine(Base):
    __tablename__ = "bill_lines"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("1"))
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    bill: Mapped["Bill"] = relationship("Bill", back_populates="lines")
    category: Mapped["ExpenseCategory | None"] = relationship("ExpenseCategory", lazy="selectin")


class RecurringBill(Base):
    __tablename__ = "recurring_bills"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    tax_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="exclusive")
    frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="mensuel")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    last_generated_date: Mapped[date | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)
    vendor: Mapped["Vendor"] = relationship("Vendor", lazy="selectin")
    lines: Mapped[list["RecurringBillLine"]] = relationship("RecurringBillLine", cascade="all, delete-orphan",
                                                            order_by="RecurringBillLine.sort_order", lazy="selectin")


class RecurringBillLine(Base):
    __tablename__ = "recurring_bill_lines"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recurring_bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recurring_bills.id", ondelete="CASCADE"), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    qty: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False, default=Decimal("1"))
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class VendorPayment(Base):
    """Paiement effectue. Peut couvrir les factures de plusieurs fournisseurs (vendor_id vide,
    payee_label ex. « Carte de credit Visa ») -- repartition dans VendorPaymentAllocation."""
    __tablename__ = "vendor_payments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    payee_label: Mapped[str | None] = mapped_column(String(150))
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    method: Mapped[str | None] = mapped_column(String(50))
    reference: Mapped[str | None] = mapped_column(String(100))
    bank_account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    vendor: Mapped["Vendor | None"] = relationship("Vendor", lazy="selectin")
    allocations: Mapped[list["VendorPaymentAllocation"]] = relationship("VendorPaymentAllocation", cascade="all, delete-orphan", lazy="selectin")


class VendorPaymentAllocation(Base):
    __tablename__ = "vendor_payment_allocations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    payment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendor_payments.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="RESTRICT"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)


class VendorCredit(Base):
    """Avoir fournisseur (remboursement, retour) -- s'applique aux factures du meme fournisseur."""
    __tablename__ = "vendor_credits"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="RESTRICT"), nullable=False)
    credit_number: Mapped[str | None] = mapped_column(String(100))
    credit_date: Mapped[date] = mapped_column(Date, nullable=False)
    tax_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="exclusive")
    tax_code: Mapped[str] = mapped_column(String(10), nullable=False, default="tps_tvq")
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tps_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    tvq_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    vendor: Mapped["Vendor"] = relationship("Vendor", lazy="selectin")
    allocations: Mapped[list["VendorCreditAllocation"]] = relationship("VendorCreditAllocation", cascade="all, delete-orphan", lazy="selectin")


class VendorCreditAllocation(Base):
    __tablename__ = "vendor_credit_allocations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    credit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("vendor_credits.id", ondelete="CASCADE"), nullable=False, index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="RESTRICT"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
