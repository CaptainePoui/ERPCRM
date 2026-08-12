"""TASK-021/S032 : facturation récurrente liée au tenant SIPV -- une
CompanyRecurringBilling par compagnie (date de départ + fréquence), avec ses
lignes de service (RecurringBillingLine).

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-08-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'company_recurring_billings',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('start_date', sa.Date, nullable=False),
        sa.Column('frequency', sa.String(20), nullable=False, server_default='mensuel'),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        'recurring_billing_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('recurring_billing_id', UUID(as_uuid=True), sa.ForeignKey('company_recurring_billings.id', ondelete='CASCADE'), nullable=False),
        sa.Column('catalogue_item_id', UUID(as_uuid=True), sa.ForeignKey('catalogue_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('qty', sa.Float, nullable=False, server_default='1'),
        sa.Column('unit_price', sa.Float, nullable=False, server_default='0'),
        sa.Column('service_ref', sa.String(100), nullable=True),
        sa.Column('service_type', sa.String(30), nullable=True),
        sa.Column('is_prorata_credit', sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('recurring_billing_lines')
    op.drop_table('company_recurring_billings')
