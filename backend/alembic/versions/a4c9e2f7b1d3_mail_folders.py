"""courriels : copie des autres dossiers de la boite (Envoyes, Archive...)

Revision ID: a4c9e2f7b1d3
Revises: f3b8c1d6a2e4
Create Date: 2026-10-29 11:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'a4c9e2f7b1d3'
down_revision: Union[str, Sequence[str], None] = 'f3b8c1d6a2e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-047.8 : autres dossiers copies ; un courriel deja copie (meme Message-ID) n'est jamais recopie."""
    op.create_table(
        "mail_folders",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("mailbox_id", UUID(as_uuid=True), sa.ForeignKey("mailboxes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("sent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("uidvalidity", sa.BigInteger()),
        sa.Column("last_uid", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_sync_at", sa.DateTime(timezone=True)),
        sa.Column("sync_error", sa.Text()),
        sa.UniqueConstraint("mailbox_id", "name"),
    )
    op.create_index("ix_mail_folders_mailbox_id", "mail_folders", ["mailbox_id"])
    op.add_column("mail_messages", sa.Column("folder_id", UUID(as_uuid=True),
                                             sa.ForeignKey("mail_folders.id", ondelete="SET NULL")))
    op.add_column("mail_messages", sa.Column("folder_uid", sa.BigInteger()))
    op.create_index("ix_mail_messages_folder_id", "mail_messages", ["folder_id"])
    op.create_index("ix_mail_messages_box_message_id", "mail_messages", ["mailbox_id", "message_id"])


def downgrade() -> None:
    op.drop_index("ix_mail_messages_box_message_id", table_name="mail_messages")
    op.drop_index("ix_mail_messages_folder_id", table_name="mail_messages")
    op.drop_column("mail_messages", "folder_uid")
    op.drop_column("mail_messages", "folder_id")
    op.drop_index("ix_mail_folders_mailbox_id", table_name="mail_folders")
    op.drop_table("mail_folders")
