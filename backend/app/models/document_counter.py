"""Compteurs de numerotation des documents (2026-10-04, demande de Philippe : « assure-toi que le
compteur ne peut pas descendre »). Un numero emis n'est jamais redonne : la suppression ou
l'annulation d'un document ne fait jamais reculer le compteur. Voir app/core/numbering.py."""
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class DocumentCounter(Base):
    __tablename__ = "document_counters"
    key: Mapped[str] = mapped_column(String(50), primary_key=True)        # invoice | devis | payment | purchase_order | ecom_order
    prefix: Mapped[str] = mapped_column(String(30), nullable=False)       # « {year} » remplace par l'annee en cours
    next_value: Mapped[int] = mapped_column(Integer, nullable=False)      # ne fait que monter
    padding: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                                                 onupdate=lambda: datetime.now(timezone.utc))
