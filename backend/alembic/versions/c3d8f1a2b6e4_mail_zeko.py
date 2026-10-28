"""courriels : classement et RDV par Zeko

Revision ID: c3d8f1a2b6e4
Revises: b7c1e4a9d2f3
Create Date: 2026-10-27 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'c3d8f1a2b6e4'
down_revision: Union[str, Sequence[str], None] = 'b7c1e4a9d2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-047.5 / TASK-026.6 : Zeko classe les courriels « A classer » et prepare les changements de RDV."""
    op.add_column("mail_messages", sa.Column("zeko_classify", sa.String(10)))
    op.add_column("mail_messages", sa.Column("zeko_rdv", sa.String(10)))
    op.add_column("mail_messages", sa.Column("zeko_rdv_proposal", JSONB))
    op.create_index("ix_mail_messages_zeko_pending", "mail_messages", ["zeko_classify", "zeko_rdv"])


def downgrade() -> None:
    op.drop_index("ix_mail_messages_zeko_pending", table_name="mail_messages")
    op.drop_column("mail_messages", "zeko_rdv_proposal")
    op.drop_column("mail_messages", "zeko_rdv")
    op.drop_column("mail_messages", "zeko_classify")
