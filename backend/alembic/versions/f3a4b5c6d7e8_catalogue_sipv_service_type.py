"""TASK-021/S032 : CatalogueItem.sipv_service_type -- tag optionnel pour lier
un forfait catalogue à un type de service SIPV (ex: "extension"), permet à la
récurrence de trouver le bon prix automatiquement.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('catalogue_items', sa.Column('sipv_service_type', sa.String(30), nullable=True))


def downgrade() -> None:
    op.drop_column('catalogue_items', 'sipv_service_type')
