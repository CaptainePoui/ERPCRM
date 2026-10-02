"""attribution des transactions bancaires + transmission des factures

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-10-02

TASK-042 (3 modes d'attribution) et TASK-005.8 (« Non transmise »). Colonnes neuves
nullables / avec defaut, table neuve : aucune donnee existante modifiee.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, Sequence[str], None] = 'e4f5a6b7c8d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('invoices', sa.Column('transmission_status', sa.String(20), nullable=True))
    op.add_column('bank_transactions', sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True))
    op.add_column('bank_transactions', sa.Column('company_source', sa.String(10), nullable=True))
    op.add_column('bank_transactions', sa.Column('client_payment_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('client_payments.id', ondelete='SET NULL'), nullable=True))
    op.add_column('bank_transactions', sa.Column('payment_created', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('bank_transactions', sa.Column('matched_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'bank_payee_rules',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('payee_key', sa.String(255), nullable=False, unique=True),
        sa.Column('payee_label', sa.String(255), nullable=False),
        sa.Column('company_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('bank_payee_rules')
    for c in ('matched_at', 'payment_created', 'client_payment_id', 'company_source', 'company_id'):
        op.drop_column('bank_transactions', c)
    op.drop_column('invoices', 'transmission_status')
