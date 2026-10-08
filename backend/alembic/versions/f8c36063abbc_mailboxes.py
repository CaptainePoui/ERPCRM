"""mailboxes

Revision ID: f8c36063abbc
Revises: cc4ad27cbd32
Create Date: 2026-10-08 18:38:15.113030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'f8c36063abbc'
down_revision: Union[str, Sequence[str], None] = 'cc4ad27cbd32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Boites de courriel de l'entreprise (TASK-047.1)."""
    op.create_table('mailboxes',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('display_name', sa.String(length=255), nullable=True),
    sa.Column('username', sa.String(length=255), nullable=False),
    sa.Column('password_enc', sa.Text(), nullable=True),
    sa.Column('host', sa.String(length=255), nullable=False),
    sa.Column('imap_port', sa.Integer(), nullable=False),
    sa.Column('smtp_port', sa.Integer(), nullable=False),
    sa.Column('functions', postgresql.ARRAY(sa.String(length=20)), server_default='{}', nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('last_check_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )


def downgrade() -> None:
    op.drop_table('mailboxes')
