"""CompanySite.is_primary -- une succursale principale par compagnie, utilisee
pour defaut/auto-assignation 911 des postes sans succursale explicite
(TASK-S010.6).

Revision ID: v3w4x5y6z7a8
Revises: u2v3w4x5y6z7
Create Date: 2026-08-05
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'v3w4x5y6z7a8'
down_revision: Union[str, Sequence[str], None] = 'u2v3w4x5y6z7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('company_sites', sa.Column('is_primary', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('company_sites', 'is_primary')
