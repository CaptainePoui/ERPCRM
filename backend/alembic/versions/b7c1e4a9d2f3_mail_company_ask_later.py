"""courriel : me le rappeler plus tard (compagnie a associer)

Revision ID: b7c1e4a9d2f3
Revises: 44478d4eaddc
Create Date: 2026-10-27 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7c1e4a9d2f3'
down_revision: Union[str, Sequence[str], None] = '44478d4eaddc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-047.4 : courriel d'un contact a plusieurs compagnies -- « Me le rappeler plus tard »."""
    op.add_column("mail_messages", sa.Column("company_ask_later", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("mail_messages", "company_ask_later")
