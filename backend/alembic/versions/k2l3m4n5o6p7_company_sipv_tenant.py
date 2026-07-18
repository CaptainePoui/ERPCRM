"""add sipv_enabled and sipv_tenant_id to companies

Revision ID: k2l3m4n5o6p7
Revises: j1k2l3m4n5o6
Create Date: 2026-07-18
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'k2l3m4n5o6p7'
down_revision: Union[str, Sequence[str], None] = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('sipv_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('companies', sa.Column('sipv_tenant_id', UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column('companies', 'sipv_tenant_id')
    op.drop_column('companies', 'sipv_enabled')
