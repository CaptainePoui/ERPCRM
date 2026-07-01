"""add catalogue description and notes

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-29

"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('catalogue_items', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('catalogue_items', sa.Column('notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('catalogue_items', 'notes')
    op.drop_column('catalogue_items', 'description')
