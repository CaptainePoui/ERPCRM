"""ticket invoice link

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-07-01
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tickets',
        sa.Column('invoice_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('invoices.id', ondelete='SET NULL'),
                  nullable=True)
    )


def downgrade() -> None:
    op.drop_column('tickets', 'invoice_id')
