"""DID gagne destination (routage reel, synchronise vers SIPV) + site_id
(succursale, organisationnel/911) -- TASK-S010.5.

Revision ID: t1u2v3w4x5y6
Revises: s0t1u2v3w4x5
Create Date: 2026-08-05
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 't1u2v3w4x5y6'
down_revision: Union[str, Sequence[str], None] = 's0t1u2v3w4x5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dids', sa.Column('destination_type', sa.String(20), nullable=True))
    op.add_column('dids', sa.Column('destination', sa.String(100), nullable=True))
    op.add_column('dids', sa.Column('site_id', UUID(as_uuid=True), sa.ForeignKey('company_sites.id', ondelete='SET NULL'), nullable=True))
    op.add_column('dids', sa.Column('sipv_tenant_did_id', UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column('dids', 'sipv_tenant_did_id')
    op.drop_column('dids', 'site_id')
    op.drop_column('dids', 'destination')
    op.drop_column('dids', 'destination_type')
