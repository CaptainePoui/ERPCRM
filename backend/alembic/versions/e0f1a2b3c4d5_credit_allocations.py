"""credit_allocations -- application des avoirs clients aux factures

Revision ID: e0f1a2b3c4d5
Revises: 579d36744bb6
Create Date: 2026-10-02

TASK-005.10 : table neuve.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'e0f1a2b3c4d5'
down_revision: Union[str, Sequence[str], None] = '579d36744bb6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'credit_allocations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('credit_invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invoice_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('applied_at', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_credit_allocations_credit_invoice_id', 'credit_allocations', ['credit_invoice_id'])
    op.create_index('ix_credit_allocations_invoice_id', 'credit_allocations', ['invoice_id'])


def downgrade() -> None:
    op.drop_table('credit_allocations')
