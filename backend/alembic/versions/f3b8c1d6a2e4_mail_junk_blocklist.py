"""courriels : liste noire et dossier « A jeter »

Revision ID: f3b8c1d6a2e4
Revises: e7a4b2c8d3f9
Create Date: 2026-10-28 10:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = 'f3b8c1d6a2e4'
down_revision: Union[str, Sequence[str], None] = 'e7a4b2c8d3f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-047.7 : expediteurs en liste noire -> « A jeter », ici et dans la vraie boite."""
    op.create_table(
        "mail_blocks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("pattern", sa.String(255), nullable=False, unique=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.add_column("mail_messages", sa.Column("junk_at", sa.DateTime(timezone=True)))
    op.add_column("mail_messages", sa.Column("junk_server", sa.String(10)))
    op.add_column("mail_messages", sa.Column("junk_uid", sa.BigInteger()))
    op.add_column("mail_messages", sa.Column("junk_error", sa.String(500)))
    op.create_index("ix_mail_messages_junk_at", "mail_messages", ["junk_at"])


def downgrade() -> None:
    op.drop_index("ix_mail_messages_junk_at", table_name="mail_messages")
    for c in ("junk_error", "junk_uid", "junk_server", "junk_at"):
        op.drop_column("mail_messages", c)
    op.drop_table("mail_blocks")
