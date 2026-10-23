"""Anciennes infos d'une compagnie ou d'un contact (TASK-002.8, 2026-10-23) : ancien nom, ancien courriel, ancien
telephone, avec leurs dates. La fiche reste la meme (identite = id interne, jamais une copie) ; ces valeurs servent a
la reconnaitre encore : recherche (« str » trouve MDI innovations, anciennement Strong-MDI), courriels recus d'une
ancienne adresse, Zeko. Philippe : « avoir une place pour les anciennes infos de contact pour continuer à bien
associer quoi va à qui »."""
import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

KINDS = ("name", "email", "phone")


class FormerInfo(Base):
    __tablename__ = "former_infos"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)          # name | email | phone
    value: Mapped[str] = mapped_column(String(255), nullable=False)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                                                 onupdate=lambda: datetime.now(timezone.utc))
