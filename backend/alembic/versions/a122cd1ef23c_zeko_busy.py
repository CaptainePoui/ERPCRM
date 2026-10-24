"""zeko busy

Revision ID: a122cd1ef23c
Revises: 0f97e9e4247b
Create Date: 2026-10-24 19:06:54.914851

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a122cd1ef23c'
down_revision: Union[str, Sequence[str], None] = '0f97e9e4247b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('zeko_conversations', sa.Column('busy_since', sa.DateTime(timezone=True), nullable=True))
    op.add_column('zeko_conversations', sa.Column('stop_requested', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('zeko_conversations', 'stop_requested')
    op.drop_column('zeko_conversations', 'busy_since')
