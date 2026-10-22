"""vendeurs et commissions (TASK-007.2)

Revision ID: 57ee8f97cbee
Revises: ccc4a5eb920e
Create Date: 2026-10-22 16:07:20.998272

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '57ee8f97cbee'
down_revision: Union[str, Sequence[str], None] = 'ccc4a5eb920e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('sales_reps',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('contact_id', sa.UUID(), nullable=False),
    sa.Column('vendor_id', sa.UUID(), nullable=False),
    sa.Column('rate', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('before_taxes', sa.Boolean(), nullable=False),
    sa.Column('recurring_only', sa.Boolean(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vendor_id'], ['vendors.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('contact_id')
    )
    op.create_table('commission_entries',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('sales_rep_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('allocation_id', sa.UUID(), nullable=True),
    sa.Column('invoice_id', sa.UUID(), nullable=True),
    sa.Column('company_id', sa.UUID(), nullable=True),
    sa.Column('entry_date', sa.Date(), nullable=False),
    sa.Column('paid_amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('base', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('rate', sa.Numeric(precision=6, scale=3), nullable=False),
    sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
    sa.Column('bill_id', sa.UUID(), nullable=True),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['allocation_id'], ['payment_allocations.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['bill_id'], ['bills.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['sales_rep_id'], ['sales_reps.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('allocation_id')
    )
    op.create_index(op.f('ix_commission_entries_bill_id'), 'commission_entries', ['bill_id'], unique=False)
    op.create_index(op.f('ix_commission_entries_sales_rep_id'), 'commission_entries', ['sales_rep_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('commission_entries')
    op.drop_table('sales_reps')
