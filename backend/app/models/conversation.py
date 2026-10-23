"""Conversations enregistrees avec un client (TASK-055 etape 3, 2026-10-23 ; Philippe : « enregistrer a partir du
ticket quand un client me parle, qu'il sache la distinction de moi et le client… si je peux associer la voix a un
contact c'est super »). Une conversation appartient a un ticket (donc a sa compagnie et a son contact -- pas de
copie) ; son son est garde dans storage/conversations, sa transcription est decoupee en phrases avec qui parle.
Rien ne sort du serveur : transcription et voix reconnues localement."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.core.database import Base

STATUSES = ("recording", "pending", "transcribing", "done", "error")


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="recording")
    mime: Mapped[str] = mapped_column(String(50), nullable=False, default="audio/webm")
    duration: Mapped[float | None] = mapped_column(Float)
    text: Mapped[str | None] = mapped_column(Text)                   # transcription complete (recherche)
    error: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_chunk_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    transcribed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    ticket: Mapped["Ticket"] = relationship("Ticket")
    user: Mapped["User | None"] = relationship("User")
    segments: Mapped[list["ConversationSegment"]] = relationship("ConversationSegment", order_by="ConversationSegment.idx",
                                                                  cascade="all, delete-orphan")


class ConversationSegment(Base):
    """Une phrase : qui parle (un utilisateur, un contact, ou « Client 1 » tant qu'on ne sait pas) et son texte."""
    __tablename__ = "conversation_segments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    start: Mapped[float] = mapped_column(Float, nullable=False)
    end: Mapped[float] = mapped_column(Float, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    speaker: Mapped[str] = mapped_column(String(100), nullable=False)       # etiquette tant que personne n'est associe
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"))
    embedding: Mapped[list[float] | None] = mapped_column(ARRAY(Float))     # empreinte de la voix de cette phrase

    user: Mapped["User | None"] = relationship("User")
    contact: Mapped["Contact | None"] = relationship("Contact")


class VoicePrint(Base):
    """Empreinte de voix d'un utilisateur (enregistree une fois) ou d'un contact (apprise quand on dit « c'est lui »)."""
    __tablename__ = "voice_prints"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), unique=True)
    embedding: Mapped[list[float]] = mapped_column(ARRAY(Float), nullable=False)
    samples: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
                                                 onupdate=lambda: datetime.now(timezone.utc))
