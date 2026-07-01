import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class EntityType(str, enum.Enum):
    company = "company"
    person = "person"


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[EntityType] = mapped_column(SAEnum(EntityType), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company", back_populates="entity", uselist=False)
    contact: Mapped["Contact"] = relationship("Contact", back_populates="entity", uselist=False)
    statuses: Mapped[list["EntityStatus"]] = relationship("EntityStatus", back_populates="entity", cascade="all, delete-orphan")
    communication_channels: Mapped[list["CommunicationChannel"]] = relationship("CommunicationChannel", back_populates="entity", cascade="all, delete-orphan")
    addresses: Mapped[list["Address"]] = relationship("Address", back_populates="entity", cascade="all, delete-orphan")
