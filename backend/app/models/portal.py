import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class PortalUser(Base):
    """Client portal account — linked to a contact in a company.
    Courriel et nom : ceux de la fiche contact, jamais copies (2026-10-09, Philippe : « c'est lier pas copier ») --
    le client change son courriel dans sa fiche et sa connexion suit."""
    __tablename__ = "portal_users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Delegated permissions (bitfield-style booleans)
    can_view_invoices: Mapped[bool] = mapped_column(Boolean, default=True)
    can_view_tickets: Mapped[bool] = mapped_column(Boolean, default=True)
    can_create_tickets: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_equipment: Mapped[bool] = mapped_column(Boolean, default=False)
    # Téléphonie SIPV — "Mon poste" (poste personnel)
    can_view_own_extension: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit_extension_name: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit_call_forward: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit_dnd: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit_voicemail: Mapped[bool] = mapped_column(Boolean, default=False)
    can_edit_call_plan: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_own_cdr: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_voicemail_messages: Mapped[bool] = mapped_column(Boolean, default=False)
    can_receive_alerts: Mapped[bool] = mapped_column(Boolean, default=False)
    # Téléphonie SIPV — "Gestion téléphonique" (gestionnaire, toute la compagnie)
    can_manage_telephony: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_ivr: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_groups: Mapped[bool] = mapped_column(Boolean, default=False)
    can_manage_audio_prompts: Mapped[bool] = mapped_column(Boolean, default=False)
    can_listen_audio_prompts: Mapped[bool] = mapped_column(Boolean, default=False)
    can_generate_voice_prompts: Mapped[bool] = mapped_column(Boolean, default=False)
    can_view_company_cdr: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    contact: Mapped["Contact"] = relationship("Contact", lazy="joined")

    @property
    def email(self) -> str | None:
        return self.contact.email if self.contact else None

    @property
    def full_name(self) -> str:
        c = self.contact
        return f"{c.first_name or ''} {c.last_name or ''}".strip() if c else ""
