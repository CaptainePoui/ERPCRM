"""bank_accounts -- comptes de l'onglet Banque

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5g6
Create Date: 2026-10-01

TASK-042 (Banque) : table neuve, aucune donnee existante touchee.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5g6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bank_accounts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('account_type', sa.String(20), nullable=False, server_default='bank'),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('institution', sa.String(100), nullable=True),
        sa.Column('account_last4', sa.String(4), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('feed_connected', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('bank_accounts')
