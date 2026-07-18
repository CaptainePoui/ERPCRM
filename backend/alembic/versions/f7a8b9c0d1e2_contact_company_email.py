"""contact_company email per link

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-01
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contact_companies',
        sa.Column('email', sa.String(255), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('contact_companies', 'email')
