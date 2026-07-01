"""add invoice credit_of_id

Revision ID: a1b2c3d4e5f6
Revises: 3f636d81dac2
Create Date: 2026-06-29

"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '3f636d81dac2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('credit_of_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_invoices_credit_of_id',
        'invoices', 'invoices',
        ['credit_of_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_invoices_credit_of_id', 'invoices', type_='foreignkey')
    op.drop_column('invoices', 'credit_of_id')
