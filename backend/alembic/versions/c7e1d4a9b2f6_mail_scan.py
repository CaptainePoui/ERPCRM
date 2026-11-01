"""courriels : analyse antivirus, hameconnage et liens dangereux (TASK-047.9)

Revision ID: c7e1d4a9b2f6
Revises: a4c9e2f7b1d3
Create Date: 2026-11-01 10:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7e1d4a9b2f6'
down_revision: Union[str, Sequence[str], None] = 'a4c9e2f7b1d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Resultat de l'analyse de chaque courriel : vide = pas encore analyse ; propre ; danger (scan_detail dit quoi)."""
    op.add_column("mail_messages", sa.Column("scan_status", sa.String(10)))
    op.add_column("mail_messages", sa.Column("scan_detail", sa.String(500)))
    op.add_column("mail_messages", sa.Column("scanned_at", sa.DateTime(timezone=True)))
    op.create_index("ix_mail_messages_scan_status", "mail_messages", ["scan_status"])


def downgrade() -> None:
    op.drop_index("ix_mail_messages_scan_status", table_name="mail_messages")
    op.drop_column("mail_messages", "scanned_at")
    op.drop_column("mail_messages", "scan_detail")
    op.drop_column("mail_messages", "scan_status")
