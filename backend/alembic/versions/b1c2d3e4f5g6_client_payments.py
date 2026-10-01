"""add client_payments and payment_allocations tables

Revision ID: b1c2d3e4f5g6
Revises: a0b1c2d3e4f5
Create Date: 2026-09-29

TASK-005.4 (ex TASK-041, renumerote 2026-10-01) : moteur de paiements multi-factures.
- client_payments : remplace payments pour les encaissements clients
- payment_allocations : repartition d'un paiement sur plusieurs factures
- payments table conservee (0 lignes) pour eviter des erreurs de FK residuelles
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'b1c2d3e4f5g6'
down_revision: Union[str, Sequence[str], None] = 'a0b1c2d3e4f5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'client_payments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='confirmed'),
        sa.Column('source', sa.String(30), nullable=False, server_default='manual'),
        sa.Column('method_code', sa.String(30), nullable=False),
        sa.Column('method_name', sa.String(100), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('reference', sa.String(30), nullable=True, unique=True),
        sa.Column('notes', sa.Text, nullable=True),
        sa.Column('portal_notes', sa.Text, nullable=True),
        sa.Column('transaction_ref', sa.String(100), nullable=True),
        sa.Column('card_token', sa.String(255), nullable=True),
        sa.Column('card_last4', sa.String(4), nullable=True),
        sa.Column('received_at', sa.Date, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_client_payments_company_id', 'client_payments', ['company_id'])
    op.create_index('ix_client_payments_status', 'client_payments', ['status'])

    op.create_table(
        'payment_allocations',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('payment_id', UUID(as_uuid=True), sa.ForeignKey('client_payments.id', ondelete='CASCADE'), nullable=False),
        sa.Column('invoice_id', UUID(as_uuid=True), sa.ForeignKey('invoices.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('amount_allocated', sa.Numeric(14, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_payment_allocations_invoice_id', 'payment_allocations', ['invoice_id'])
    op.create_index('ix_payment_allocations_payment_id', 'payment_allocations', ['payment_id'])


def downgrade() -> None:
    op.drop_table('payment_allocations')
    op.drop_table('client_payments')
