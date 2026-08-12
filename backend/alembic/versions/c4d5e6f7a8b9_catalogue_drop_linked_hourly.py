"""TASK-004.1 : retire CatalogueItem.linked_to_hourly_rate -- remplace par le
type "connaissance" (3e famille du catalogue, prix synchronise au taux horaire
global, voir settings.py).

Revision ID: c4d5e6f7a8b9
Revises: f3a4b5c6d7e8
Create Date: 2026-08-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'f3a4b5c6d7e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('catalogue_items', 'linked_to_hourly_rate')


def downgrade() -> None:
    op.add_column('catalogue_items', sa.Column('linked_to_hourly_rate', sa.Boolean(), nullable=False, server_default='false'))
