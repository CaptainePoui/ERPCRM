"""DID.carrier retire -- inutile, tout passe par le meme transporteur (demande
Philippe 2026-08-06).

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-08-06
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'x5y6z7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'w4x5y6z7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('dids', 'carrier')


def downgrade() -> None:
    op.add_column('dids', sa.Column('carrier', sa.String(100), nullable=True))
