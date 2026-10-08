import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Mailbox(Base):
    """Boite de courriel de l'entreprise (TASK-047.1, 2026-10-08) : portabilite@, service@, facturation@, support@...
    Configuree dans Administration -> Integrations ; mot de passe chiffre (Fernet), jamais renvoye a l'ecran.
    functions : a quoi elle sert -- « tickets » (courriels recus -> tickets, envoi des courriels de tickets),
    « invoices » (envoi des factures, avoirs, avis de retard), « devis » (envoi des devis). Une fonction = une seule
    boite. Les avis Interac sont reconnus dans TOUTES les boites actives, quelle que soit leur fonction."""
    __tablename__ = "mailboxes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    display_name: Mapped[str | None] = mapped_column(String(255))        # nom de l'expediteur (« Simple IP Facturation »)
    username: Mapped[str] = mapped_column(String(255), nullable=False)   # identifiant (souvent l'adresse)
    password_enc: Mapped[str | None] = mapped_column(Text)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_port: Mapped[int] = mapped_column(Integer, nullable=False, default=993)
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, default=465)
    functions: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
