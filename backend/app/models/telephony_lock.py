import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class TelephonyLock(Base):
    """Verrou d'edition telephonie par compagnie (TASK-020).

    Une seule ligne par compagnie (company_id unique) -- premier arrive/premier
    servi entre pairs du meme type (tech vs tech, client vs client), mais un
    tech preempte toujours un verrou detenu par un client. Expire apres 30 min
    d'inactivite glissante (last_activity_at). Voir core/telephony_lock.py
    pour la logique d'acquisition.
    """
    __tablename__ = "telephony_locks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True)
    holder_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "tech" | "client"
    holder_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    holder_label: Mapped[str] = mapped_column(String(255), nullable=False)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
