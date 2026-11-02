import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class Status(Base):
    __tablename__ = "statuses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(7))
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Onglets que cette pastille apporte sur la fiche compagnie (TASK-002.13, core/company_tabs.py)
    company_tabs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # Onglets que cette pastille apporte sur la fiche contact (TASK-002.17, core/contact_tabs.py)
    contact_tabs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    # À qui la pastille s'offre (TASK-002.14) : both | companies | contacts ; une fiche qui la porte déjà la garde
    applies_to: Mapped[str] = mapped_column(String(10), nullable=False, default="both", server_default="both")

    entity_statuses: Mapped[list["EntityStatus"]] = relationship("EntityStatus", back_populates="status")


class EntityStatus(Base):
    __tablename__ = "entity_statuses"
    __table_args__ = (UniqueConstraint("entity_id", "status_id"),)

    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("entities.id", ondelete="CASCADE"), primary_key=True)
    status_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("statuses.id", ondelete="CASCADE"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    entity: Mapped["Entity"] = relationship("Entity", back_populates="statuses")
    status: Mapped["Status"] = relationship("Status", back_populates="entity_statuses")
