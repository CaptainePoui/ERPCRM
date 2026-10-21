import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base

# Zeko, l'IA unique d'ERPCRM (TASK-006.5 etape 2, 2026-10-18) : conversations gardees, journal de chaque appel.


class ZekoConversation(Base):
    """Une conversation avec Zeko : personnelle (bouton du haut) ou rattachee a un ticket (partagee par les techniciens)."""
    __tablename__ = "zeko_conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True, index=True)
    title: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages: Mapped[list["ZekoMessage"]] = relationship("ZekoMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ZekoMessage.created_at")


class ZekoMessage(Base):
    """role : user (technicien) | assistant (Zeko) | tool (donnees lues par Zeko, gardees pour la suite de l'echange)."""
    __tablename__ = "zeko_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("zeko_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[str | None] = mapped_column(Text)        # JSON des appels d'outils demandes par Zeko
    tool_call_id: Mapped[str | None] = mapped_column(String(100))
    tool_name: Mapped[str | None] = mapped_column(String(60))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    conversation: Mapped["ZekoConversation"] = relationship("ZekoConversation", back_populates="messages")
    user: Mapped["User | None"] = relationship("User")


class ZekoInvocation(Base):
    """Journal de chaque appel au modele : qui l'a demande (fonction), modele, duree, jetons, resultat. Pas le contenu."""
    __tablename__ = "zeko_invocations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    purpose: Mapped[str] = mapped_column(String(40), nullable=False, index=True)   # conversation, depot_bancaire, recu, interac, signature
    provider: Mapped[str] = mapped_column(String(30), default="local")
    model: Mapped[str | None] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default="ok")                   # ok | erreur | interrompu
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer)
    completion_tokens: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    # IA externe seulement : ce qui est vraiment parti (deja expurge) et la reponse recue -- trace locale complete
    request_redacted: Mapped[str | None] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("zeko_conversations.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class ZekoRule(Base):
    """Ce que Zeko a appris (TASK-006.5 etape 3, 2026-10-21), seulement apres le « oui » de l'utilisateur. Range dans
    ERPCRM (visible, modifiable, supprimable dans l'Administration), jamais seulement dans la memoire de l'IA.
    kind : avis_paiement (ex. « Mc Crystal envoie un PDF Releve des depots directs depuis n.gendron@... »), autre."""
    __tablename__ = "zeko_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="autre")
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    sender_email: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ZekoMailScan(Base):
    """Courriel deja examine par Zeko pour y trouver un avis de paiement (TASK-042.13) : jamais relu deux fois."""
    __tablename__ = "zeko_mail_scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mail_message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mail_messages.id", ondelete="CASCADE"), nullable=False, unique=True)
    result: Mapped[str] = mapped_column(String(20), nullable=False)      # paiement | pas_un_paiement | erreur
    extracted: Mapped[str | None] = mapped_column(Text)                  # ce que Zeko a lu (JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ZekoProposal(Base):
    """Proposition de Zeko : ce depot paie ces factures, preuve a l'appui (un courriel). Philippe accepte ou refuse ;
    Zeko ne touche jamais seul a une transaction. status : proposee | a_corriger | sans_depot | deja_associe | acceptee | refusee"""
    __tablename__ = "zeko_proposals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mail_message_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("mail_messages.id", ondelete="SET NULL"), index=True)
    bank_transaction_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="SET NULL"), index=True)
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(15), nullable=False, index=True)
    amount: Mapped[float | None] = mapped_column()
    paid_on: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    allocations: Mapped[str | None] = mapped_column(Text)               # JSON [{invoice_id, number, amount}]
    explanation: Mapped[str | None] = mapped_column(Text)
    evidence: Mapped[str | None] = mapped_column(Text)                  # extrait du courriel / de la piece jointe
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
