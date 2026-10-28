import uuid
from datetime import date, datetime, timezone

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Mailbox(Base):
    """Boite de courriel de l'entreprise (TASK-047.1, 2026-10-08) : portabilite@, service@, facturation@, support@...
    Configuree dans Administration -> Integrations ; mot de passe chiffre (Fernet), jamais renvoye a l'ecran.
    functions : a quoi elle sert -- « tickets » (courriels recus -> tickets, envoi des courriels de tickets),
    « invoices » (envoi des factures, avoirs, avis de retard), « devis » (envoi des devis). Une fonction = une seule
    boite. Les avis Interac sont reconnus dans TOUTES les boites actives, quelle que soit leur fonction."""
    __tablename__ = "mailboxes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    display_name: Mapped[str | None] = mapped_column(String(255))        # nom de l'expediteur (« Simple IP Facturation »)
    username: Mapped[str] = mapped_column(String(255), nullable=False)   # identifiant (souvent l'adresse)
    password_enc: Mapped[str | None] = mapped_column(Text)
    host: Mapped[str] = mapped_column(String(255), nullable=False)
    imap_port: Mapped[int] = mapped_column(Integer, nullable=False, default=993)
    smtp_port: Mapped[int] = mapped_column(Integer, nullable=False, default=465)
    functions: Mapped[list[str]] = mapped_column(ARRAY(String(20)), nullable=False, default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Boite de reception (TASK-047.2) : « shared » = toute l'equipe la voit (service@, facturation@, portabilite@) ;
    # « personal » = seulement son proprietaire (philippe@) ; « send_only » = jamais lue (nepasrepondre@).
    # Une boite « tickets » n'est pas copiee : ses courriels deviennent des tickets (imap_poller).
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="shared", server_default="shared")
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    sync_since: Mapped[date | None] = mapped_column(Date)            # premiere copie : courriels recus depuis cette date
    uidvalidity: Mapped[int | None] = mapped_column(BigInteger)
    last_uid: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_error: Mapped[str | None] = mapped_column(Text)
    last_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class MailMessage(Base):
    """Copie d'un courriel recu (TASK-047.2, 2026-10-09), ou envoye depuis ERPCRM (direction « out », TASK-047.3). La boite reste la source : le courriel complet est garde
    tel quel (.eml, storage/mail) et lu/non lu est synchronise dans les deux sens (Outlook et cellulaire suivent).
    Classe automatiquement dans la fiche (compagnie/contact) d'apres l'adresse de l'expediteur ; « A classer » sinon."""
    __tablename__ = "mail_messages"
    __table_args__ = (UniqueConstraint("mailbox_id", "uidvalidity", "uid"),
                      Index("ix_mail_messages_from_email", "from_email"))

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mailbox_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False, index=True)
    uidvalidity: Mapped[int | None] = mapped_column(BigInteger)          # vide pour un courriel envoye d'ici
    uid: Mapped[int | None] = mapped_column(BigInteger)
    direction: Mapped[str] = mapped_column(String(3), nullable=False, default="in", server_default="in")  # in | out (envoye d'ici, TASK-047.3)
    sent_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    copy_error: Mapped[str | None] = mapped_column(String(500))       # envoye, mais copie dans Envoyes de la boite impossible
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # repondu d'ici
    message_id: Mapped[str | None] = mapped_column(String(500))
    in_reply_to: Mapped[str | None] = mapped_column(String(500), index=True)
    from_email: Mapped[str | None] = mapped_column(String(255))
    from_name: Mapped[str | None] = mapped_column(String(255))
    to_addrs: Mapped[str | None] = mapped_column(Text)
    cc_addrs: Mapped[str | None] = mapped_column(Text)
    subject: Mapped[str | None] = mapped_column(String(1000))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    body_text: Mapped[str | None] = mapped_column(Text)
    body_html: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")  # [{i, filename, ctype, size}]
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    flag_pending: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)   # lu/non lu change ici, pas encore ecrit dans la boite
    company_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), index=True)
    classified_by: Mapped[str | None] = mapped_column(String(10))     # auto | manual
    # TASK-047.4 : contact lie a plusieurs compagnies, compagnie pas trouvee -> popup a la lecture ; « Me le rappeler
    # plus tard » = true sur CE courriel seulement : le prochain courriel du fil (recu ou envoye) redemande.
    company_ask_later: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Zeko (core/zeko_mail.py) : classement d'un courriel « A classer » (TASK-047.5) et lecture d'un changement de RDV
    # (TASK-026.6) -- pending | done | none | failed ; la proposition RDV attend la confirmation de Philippe.
    zeko_classify: Mapped[str | None] = mapped_column(String(10))
    zeko_rdv: Mapped[str | None] = mapped_column(String(10))
    zeko_rdv_proposal: Mapped[dict | None] = mapped_column(JSONB)
    contact_created: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # contact cree a partir de ce courriel
    signature_status: Mapped[str | None] = mapped_column(String(10))  # pending | done | failed (lecture de la signature par l'IA)
    shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # boite personnelle : partage avec l'equipe
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tickets.id", ondelete="SET NULL"))
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
