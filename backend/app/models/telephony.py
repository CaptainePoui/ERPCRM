import uuid
from datetime import datetime, date, timezone
from sqlalchemy import String, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class DID(Base):
    __tablename__ = "dids"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)

    number: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    porting_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    # Routage d'appel reel (TASK-S010.5) -- synchronise vers SIPV/TenantDID,
    # qui reste la source reelle du dialplan pour les DID actifs.
    destination_type: Mapped[str | None] = mapped_column(String(20))  # extension ivr queue voicemail hangup message ...
    destination: Mapped[str | None] = mapped_column(String(100))
    # TASK-023.32 -- uniquement significatif quand destination_type == "message" :
    # action apres la lecture de la phrase ("Ajouter une destination" cote UI).
    # Null = raccrocher (comportement par defaut, voir TASKSIPV TASK-S047).
    after_message_destination_type: Mapped[str | None] = mapped_column(String(20))
    after_message_destination: Mapped[str | None] = mapped_column(String(100))
    # Succursale (organisationnel/911) -- distinct de la destination technique.
    site_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("company_sites.id", ondelete="SET NULL"), nullable=True)
    # Copie synchronisee cote SIPV (TenantDID.id).
    sipv_tenant_did_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    # Horaire (Schedule SIPV, TASK-S016/S010.7) -- pas de FK locale, Schedule
    # n'existe que cote SIPV (simple proxy, pas de copie maitre ici).
    schedule_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    site: Mapped["CompanySite | None"] = relationship("CompanySite")


class Extension(Base):
    __tablename__ = "extensions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    did_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("dids.id", ondelete="SET NULL"), nullable=True)

    # 20 pas 10 -- une "ligne vendue" (produit facture au client) a le meme
    # numero que son DID (convention UCM de Philippe), pas juste un code court.
    extension: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    voicemail_email: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    company: Mapped["Company"] = relationship("Company")
    did: Mapped["DID | None"] = relationship("DID")
