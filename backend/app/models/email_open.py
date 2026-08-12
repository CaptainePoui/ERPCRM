import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class EmailOpen(Base):
    """
    Une ligne par ouverture d'un courriel (pixel invisible, style Zoho) -- si le
    destinataire l'ouvre plusieurs fois, chaque ouverture cree une NOUVELLE ligne
    (pas de mise a jour d'une seule ligne) pour garder l'historique complet des
    dates/heures, demande explicite de l'utilisateur.
    """
    __tablename__ = "email_opens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # 'ticket' | 'invoice' | 'devis' | 'task'
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
