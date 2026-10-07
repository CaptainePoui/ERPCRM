import uuid
from decimal import Decimal
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Boolean, Date, DateTime, Integer, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class BankAccount(Base):
    """Compte de l'onglet Banque (TASK-042) : compte bancaire, carte de credit ou compte interne (petite caisse)."""
    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # bank | credit_card | petty_cash
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bank")
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    institution: Mapped[str | None] = mapped_column(String(100))
    # 4 derniers chiffres seulement -- affiche xxxx1234
    account_last4: Mapped[str | None] = mapped_column(String(4))
    notes: Mapped[str | None] = mapped_column(Text)

    # Connexion bancaire (flux) -- aucune source branchee pour l'instant
    feed_connected: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Un compte ferme se desactive, ne se supprime jamais
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class BankStatementImport(Base):
    """Un releve bancaire importe (OFX/QFX/QBO ou CSV) dans un compte."""
    __tablename__ = "bank_statement_imports"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    # ofx | csv
    file_format: Mapped[str] = mapped_column(String(10), nullable=False)
    # Fichier original conserve hors du dossier public (re-lecture possible)
    stored_path: Mapped[str | None] = mapped_column(String(500))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    rows_total: Mapped[int] = mapped_column(Integer, default=0)
    rows_new: Mapped[int] = mapped_column(Integer, default=0)
    rows_duplicate: Mapped[int] = mapped_column(Integer, default=0)
    # Solde fourni par le releve (OFX LEDGERBAL) -- absent d'un CSV
    ledger_balance: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    ledger_balance_date: Mapped[date | None] = mapped_column(Date)
    imported_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BankTransaction(Base):
    """Ligne recue de la banque (releve importe). Montant signe : positif = depot, negatif = retrait."""
    __tablename__ = "bank_transactions"
    __table_args__ = (UniqueConstraint("account_id", "dedup_key", name="uq_bank_transactions_account_dedup"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    import_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_statement_imports.id", ondelete="SET NULL"))
    posted_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payee: Mapped[str | None] = mapped_column(String(255))
    reference: Mapped[str | None] = mapped_column(String(100))
    # Identifiant unique de la banque (OFX FITID) -- absent d'un CSV
    fitid: Mapped[str | None] = mapped_column(String(255))
    # Empeche de reimporter deux fois la meme ligne (FITID, sinon date+montant+description+rang)
    dedup_key: Mapped[str] = mapped_column(String(300), nullable=False)
    # unclassified | matched | excluded
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unclassified")
    # Attribution (TASK-042) : compagnie (manuelle ou par regle de beneficiaire) et encaissement lie
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    # manual | rule -- une ligne non classee avec une compagnie venant d'une regle = « Reconnu »
    company_source: Mapped[str | None] = mapped_column(String(10))
    client_payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("client_payments.id", ondelete="SET NULL"))
    # Vrai si l'encaissement a ete cree par l'attribution (on le supprime en annulant) ;
    # faux s'il existait deja (paiement declare au portail, historique Zoho) -- on le delie seulement
    payment_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Associee automatiquement a l'import (suggestion unique et exacte) -- annulable comme les autres
    auto_matched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Proposition de l'IA locale (jamais appliquee seule) : pending | done | failed | accepted
    ai_status: Mapped[str | None] = mapped_column(String(10))
    ai_company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    ai_confidence: Mapped[int | None] = mapped_column(Integer)
    ai_note: Mapped[str | None] = mapped_column(Text)
    # Retraits (TASK-042.4) : fournisseur reconnu/attribue, et ce qui explique le retrait -- une depense
    # ou un paiement de factures fournisseurs (existant, ou cree par l'association : payment_created)
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="SET NULL"))
    vendor_source: Mapped[str | None] = mapped_column(String(10))          # manual | rule | name | match (venu d'une association)
    expense_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expenses.id", ondelete="SET NULL"))
    vendor_payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendor_payments.id", ondelete="SET NULL"))
    # Versement au gouvernement (TASK-043.1) -- TPS/TVQ, impot, retenues
    tax_payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tax_payments.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class BankPayeeRule(Base):
    """Regle « beneficiaire du releve -> compagnie » (mode 3 d'attribution) : appliquee aux
    lignes non classees existantes et a chaque import ; propose sans jamais confirmer seule."""
    __tablename__ = "bank_payee_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Beneficiaire normalise (minuscules, sans accents ni ponctuation) -- unique
    payee_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    payee_label: Mapped[str] = mapped_column(String(255), nullable=False)
    # Depot -> compagnie (client) ; retrait -> fournisseur (+ compte de depense habituel). Une des deux.
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"))
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("vendors.id", ondelete="CASCADE"))
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("expense_categories.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class InteracNotice(Base):
    """Avis de virement Interac recu par courriel (TASK-042.5) : donne le NOM de l'expediteur, que le
    releve BNC n'a pas (« VIREMENT INTERAC »). Lu en lecture seule dans la boite configuree, analyse
    par l'IA locale, puis relie au depot du meme montant (a quelques jours pres)."""
    __tablename__ = "interac_notices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    message_id: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    subject: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str | None] = mapped_column(Text)
    # pending (a analyser) | parsed | matched | ignored (pas un virement recu) | failed
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    sender_name: Mapped[str | None] = mapped_column(String(255))
    amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    sent_date: Mapped[date | None] = mapped_column(Date)
    message: Mapped[str | None] = mapped_column(Text)        # message du payeur (souvent un n° de facture)
    reference: Mapped[str | None] = mapped_column(String(100))
    error: Mapped[str | None] = mapped_column(Text)
    bank_transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
