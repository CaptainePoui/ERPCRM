import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    manager = "manager"
    tech = "tech"
    billing = "billing"
    readonly = "readonly"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False, default=UserRole.readonly)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Derniere presence d'un ecran ERPCRM ouvert (battement toutes les 30 s, TASK-006.5) : sans presence depuis
    # 5 min, ses chronos de ticket se mettent en pause a l'heure de cette derniere presence.
    presence_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Chemin de navigation (TASK-054, 2026-10-21) : derniers ecrans visites, garde sur le serveur pour que « Retour »
    # ramene ou on etait meme apres un rafraichissement ou sur un autre appareil (JSON : [{"path": ...}, ...])
    nav_trail: Mapped[str | None] = mapped_column(Text)
