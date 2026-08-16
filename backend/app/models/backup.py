"""Backup cloud automatique de notre propre infra ERPCRM (TASK-035) -- PAS le
stockage cloud client pour enregistrements d'appel (TASK-034, sujet distinct).

Connexion OAuth par fournisseur (Dropbox / Google Drive), chacune avec son
propre fuseau/heure de declenchement et sa propre limite de bande passante.
Les cycles de rotation (frequence + retention) sont definis une fois pour le
projet et partages par les deux clouds -- seul le moment d'envoi et le debit
varient par connexion."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class CloudBackupConnection(Base):
    __tablename__ = "cloud_backup_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "dropbox" ou "google_drive"
    provider: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    # Refresh token chiffre (Fernet, voir app.core.crypto) -- jamais en clair.
    refresh_token_enc: Mapped[str | None] = mapped_column(Text)
    account_label: Mapped[str | None] = mapped_column(String(255))  # ex: email du compte connecte, affichage seulement
    # Credentials app OAuth saisies dans Admin (ex: Dropbox App Key/Secret) --
    # si vide, fallback sur les variables .env du meme nom (ex: Google Drive
    # reutilise GOOGLE_CLIENT_ID/SECRET deja configures pour Calendar).
    client_id: Mapped[str | None] = mapped_column(String(255))
    client_secret_enc: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)  # actif pour le double backup
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="America/Toronto")
    backup_hour: Mapped[str] = mapped_column(String(5), nullable=False, default="02:00")  # HH:MM, heure locale du fuseau ci-dessus
    bandwidth_limit_kbps: Mapped[int | None] = mapped_column(Integer)  # None = illimite
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class BackupCycle(Base):
    __tablename__ = "backup_cycles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # "daily" / "weekly" / "monthly" / "yearly"
    frequency_type: Mapped[str] = mapped_column(String(10), nullable=False)
    # weekly uniquement -- 0=lundi ... 6=dimanche (convention date.weekday())
    day_of_week: Mapped[int | None] = mapped_column(Integer)
    # monthly/yearly uniquement -- 1-31
    day_of_month: Mapped[int | None] = mapped_column(Integer)
    # yearly uniquement -- 1-12
    month_of_year: Mapped[int | None] = mapped_column(Integer)
    retention_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    retention_count: Mapped[int] = mapped_column(Integer, default=3)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class BackupRunLog(Base):
    """Historique des executions -- visibilite Admin (dernier backup: succes/echec)."""
    __tablename__ = "backup_run_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cycle_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    filename: Mapped[str | None] = mapped_column(String(255))
    success: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text)
    triggered_manually: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
