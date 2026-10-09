"""mail_send -- courriels envoyes depuis ERPCRM (TASK-047.3)

Revision ID: 573fc8c0b97a
Revises: a0edb228d9ba
Create Date: 2026-10-09 11:57:41.156496

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '573fc8c0b97a'
down_revision: Union[str, Sequence[str], None] = 'a0edb228d9ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("mail_messages", sa.Column("direction", sa.String(3), nullable=False, server_default="in"))
    op.add_column("mail_messages", sa.Column("sent_by_user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("mail_messages_sent_by_user_id_fkey", "mail_messages", "users", ["sent_by_user_id"], ["id"], ondelete="SET NULL")
    op.add_column("mail_messages", sa.Column("copy_error", sa.String(500), nullable=True))
    op.add_column("mail_messages", sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True))
    op.alter_column("mail_messages", "uidvalidity", existing_type=sa.BigInteger(), nullable=True)
    op.alter_column("mail_messages", "uid", existing_type=sa.BigInteger(), nullable=True)
    op.create_index("ix_mail_messages_in_reply_to", "mail_messages", ["in_reply_to"])


def downgrade() -> None:
    op.drop_index("ix_mail_messages_in_reply_to", table_name="mail_messages")
    op.execute("DELETE FROM mail_messages WHERE direction = 'out'")
    op.alter_column("mail_messages", "uid", existing_type=sa.BigInteger(), nullable=False)
    op.alter_column("mail_messages", "uidvalidity", existing_type=sa.BigInteger(), nullable=False)
    op.drop_column("mail_messages", "answered_at")
    op.drop_column("mail_messages", "copy_error")
    op.drop_constraint("mail_messages_sent_by_user_id_fkey", "mail_messages", type_="foreignkey")
    op.drop_column("mail_messages", "sent_by_user_id")
    op.drop_column("mail_messages", "direction")
