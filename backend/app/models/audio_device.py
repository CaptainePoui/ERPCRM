"""Appareils audio (TASK-055, 2026-10-23) : chaque ordi, tablette ou cellulaire qui enregistre la voix s'inscrit une
fois sous un nom (« Ordi de Phil ») et envoie la liste de ses micros ; le micro a utiliser se choisit dans
Administration > Configuration > Appareils audio, depuis n'importe quel appareil (Philippe : « avec les appareils
comme l'ordi de Phil, la tablette de Phil, le cell de Phil »). Un navigateur ne voit que ses propres micros : la liste
gardee ici est celle que l'appareil a vue a sa derniere utilisation."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class AudioDevice(Base):
    __tablename__ = "audio_devices"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    mics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)          # [{id, label}] vus par l'appareil
    selected_mic_id: Mapped[str | None] = mapped_column(String(255))                 # None = micro par defaut
    selected_mic_label: Mapped[str | None] = mapped_column(String(255))              # repli si l'id change (permissions effacees)
    last_mic_label: Mapped[str | None] = mapped_column(String(255))                  # micro reellement utilise la derniere fois
    fell_back: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # micro choisi absent -> defaut utilise
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                                                 onupdate=lambda: datetime.now(timezone.utc))

    user: Mapped["User | None"] = relationship("User")
