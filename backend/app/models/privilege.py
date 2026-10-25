import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base

# Privileges des employes (TASK-007.4, 2026-10-25) : un profil dit, pour chaque section d'ERPCRM (core/privileges.py),
# si on peut la voir ou la modifier. Le profil « Tout » (full_access) donne tout et ne se modifie pas.


class PrivilegeProfile(Base):
    __tablename__ = "privilege_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    full_access: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    grants: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")   # {section: "voir" | "modifier"}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
