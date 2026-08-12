import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Boolean, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class CatalogueItem(Base):
    __tablename__ = "catalogue_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    price: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="CAD")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Bloc d'arrondi (minutes) pour la facturation de temps depuis un ticket -- 5 ou
    # 15, null = article non facture au temps (flat/materiel). Le prix de l'article
    # sert alors de taux horaire (voir tickets.py create-invoice).
    time_rounding_minutes: Mapped[int | None] = mapped_column(Integer)
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
    # TASK-021/S032 : tag optionnel qui relie un forfait du catalogue à un type
    # de service SIPV (ex: "extension", "did") -- permet à la récurrence de
    # trouver automatiquement le bon prix quand SIPV signale un ajout. Null =
    # article normal, pas lié à la facturation récurrente SIPV.
    sipv_service_type: Mapped[str | None] = mapped_column(String(30))
    # TASK-004.2 : multiplicateur du taux horaire pour les articles "connaissance"
    # (ex: Appel d'urgence = x2). Null = x1, appliqué dans settings.py au moment
    # de synchroniser le prix sur le taux horaire global.
    rate_multiplier: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
