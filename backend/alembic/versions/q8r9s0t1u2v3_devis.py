"""Module Devis (miroir de Invoice) -- table devis + devis_lines

Revision ID: q8r9s0t1u2v3
Revises: p7q8r9s0t1u2
Create Date: 2026-07-31
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'q8r9s0t1u2v3'
down_revision: Union[str, Sequence[str], None] = 'p7q8r9s0t1u2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'devis',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('number', sa.String(20), nullable=False, unique=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='brouillon'),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('valid_until', sa.Date(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('tps_rate', sa.Float(), nullable=False, server_default='5.0'),
        sa.Column('tvq_rate', sa.Float(), nullable=False, server_default='9.975'),
        sa.Column('apply_tps', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('apply_tvq', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('subtotal', sa.Float(), nullable=False, server_default='0'),
        sa.Column('tps_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('tvq_amount', sa.Float(), nullable=False, server_default='0'),
        sa.Column('total', sa.Float(), nullable=False, server_default='0'),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_table(
        'devis_lines',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('devis_id', UUID(as_uuid=True), sa.ForeignKey('devis.id', ondelete='CASCADE'), nullable=False),
        sa.Column('catalogue_item_id', UUID(as_uuid=True), sa.ForeignKey('catalogue_items.id', ondelete='SET NULL'), nullable=True),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('qty', sa.Float(), nullable=False, server_default='1'),
        sa.Column('unit_price', sa.Float(), nullable=False, server_default='0'),
        sa.Column('line_total', sa.Float(), nullable=False, server_default='0'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('devis_lines')
    op.drop_table('devis')
