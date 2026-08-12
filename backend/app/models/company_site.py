import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class CompanySite(Base):
    """Succursale d'une compagnie -- source de verite pour la facturation
    independante par site ET pour l'adresse 911 (synchronisee vers SIPV,
    voir sipv_e911_address_id / sync_site dans sipv_client.py)."""
    __tablename__ = "company_sites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)

    label: Mapped[str] = mapped_column(String(100), nullable=False)
    # Adresse civique NENA NG911 (meme format que E911Address cote SIPV)
    civic_number: Mapped[str] = mapped_column(String(20), nullable=False)
    street_name: Mapped[str] = mapped_column(String(100), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(20))
    city: Mapped[str] = mapped_column(String(60), nullable=False)
    province: Mapped[str] = mapped_column(String(2), nullable=False)
    postal_code: Mapped[str] = mapped_column(String(10), nullable=False)
    country: Mapped[str] = mapped_column(String(2), nullable=False, default="CA")

    # Contact de facturation -- lie a un vrai Contact ERPCRM (recherche/creation
    # rapide cote frontend), pas un nom libre : evite les doublons de personnes.
    billing_contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    # Courriel de facturation effectif pour ce site -- prerempli depuis le
    # contact au choix, mais editable independamment (peut etre un alias).
    billing_email: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Succursale par defaut de la compagnie -- un seul site principal a la fois
    # (applique cote endpoint), utilise pour presequir/auto-assigner le 911 des
    # postes qui n'ont pas leur propre succursale explicite (TASK-S010.6).
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)

    # Copie synchronisee cote SIPV (E911Address.id) -- toujours renseigne une
    # fois la creation reussie, la sync est bloquante (voir sipv_client.sync_site).
    sipv_e911_address_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    billing_contact: Mapped["Contact | None"] = relationship("Contact")
