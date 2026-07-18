"""add ticket is_billable

Revision ID: i0j1k2l3m4n5
Revises: h9i0j1k2l3m4
Create Date: 2026-07-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'i0j1k2l3m4n5'
down_revision = 'h9i0j1k2l3m4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tickets', sa.Column(
        'is_billable',
        sa.Boolean(),
        nullable=False,
        server_default=sa.false(),
    ))


def downgrade() -> None:
    op.drop_column('tickets', 'is_billable')
