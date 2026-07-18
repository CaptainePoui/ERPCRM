"""add sipv_sync and phone_other to contacts

Revision ID: g8h9i0j1k2l3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'g8h9i0j1k2l3'
down_revision: Union[str, None] = 'b7a0691596a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('contacts', sa.Column('sipv_sync', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('contacts', sa.Column('phone_other', sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column('contacts', 'phone_other')
    op.drop_column('contacts', 'sipv_sync')
