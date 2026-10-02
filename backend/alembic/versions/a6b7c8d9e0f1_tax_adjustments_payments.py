"""tax_adjustments + tax_payments -- onglet Impots et formulaires

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-10-02

TASK-043 : tables neuves, aucune donnee existante touchee.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, Sequence[str], None] = 'f5a6b7c8d9e0'
branch_labels = None
depends_on = None


def _common():
    return [
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    op.create_table(
        'tax_adjustments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('adjustment_date', sa.Date(), nullable=False),
        sa.Column('category', sa.String(30), nullable=False, server_default='autre'),
        sa.Column('tps_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('tvq_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('description', sa.Text(), nullable=True),
        *_common(),
    )
    op.create_table(
        'tax_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('tps_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('tvq_amount', sa.Numeric(14, 2), nullable=False, server_default='0'),
        sa.Column('method', sa.String(50), nullable=True),
        sa.Column('reference', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        *_common(),
    )


def downgrade() -> None:
    op.drop_table('tax_payments')
    op.drop_table('tax_adjustments')
