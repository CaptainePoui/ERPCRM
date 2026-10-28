"""contact : refus des reponses de Zeko

Revision ID: d5e2a7c9f1b8
Revises: c3d8f1a2b6e4
Create Date: 2026-10-27 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e2a7c9f1b8'
down_revision: Union[str, Sequence[str], None] = 'c3d8f1a2b6e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-026.9 : le client ne veut plus que Zeko lui reponde."""
    op.add_column("contacts", sa.Column("zeko_replies_off", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("contacts", "zeko_replies_off")
