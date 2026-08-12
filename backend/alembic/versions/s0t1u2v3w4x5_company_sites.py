"""Succursales (company_sites) -- ERPCRM devient maitre, synchronise vers
SIPV (E911Address.erpcrm_site_id). Facturation independante par site sur
Invoice (TASK-S010.4).

Revision ID: s0t1u2v3w4x5
Revises: r9s0t1u2v3w4
Create Date: 2026-08-05
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 's0t1u2v3w4x5'
down_revision: Union[str, Sequence[str], None] = 'r9s0t1u2v3w4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'company_sites',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('civic_number', sa.String(20), nullable=False),
        sa.Column('street_name', sa.String(100), nullable=False),
        sa.Column('unit', sa.String(20), nullable=True),
        sa.Column('city', sa.String(60), nullable=False),
        sa.Column('province', sa.String(2), nullable=False),
        sa.Column('postal_code', sa.String(10), nullable=False),
        sa.Column('country', sa.String(2), nullable=False, server_default='CA'),
        sa.Column('billing_contact_name', sa.String(150), nullable=True),
        sa.Column('billing_email', sa.String(255), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('sipv_e911_address_id', UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )

    op.add_column('invoices', sa.Column('site_id', UUID(as_uuid=True), sa.ForeignKey('company_sites.id', ondelete='SET NULL'), nullable=True))
    op.add_column('invoices', sa.Column('site_label_snapshot', sa.String(100), nullable=True))
    op.add_column('invoices', sa.Column('site_address_snapshot', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('invoices', 'site_address_snapshot')
    op.drop_column('invoices', 'site_label_snapshot')
    op.drop_column('invoices', 'site_id')
    op.drop_table('company_sites')
