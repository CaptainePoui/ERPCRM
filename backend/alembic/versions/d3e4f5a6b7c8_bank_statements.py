"""bank_statement_imports + bank_transactions -- import de releves bancaires

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-10-01

TASK-042 (Banque) : tables neuves, aucune donnee existante touchee.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, Sequence[str], None] = 'c2d3e4f5a6b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'bank_statement_imports',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bank_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('file_format', sa.String(10), nullable=False),
        sa.Column('stored_path', sa.String(500), nullable=True),
        sa.Column('period_start', sa.Date(), nullable=True),
        sa.Column('period_end', sa.Date(), nullable=True),
        sa.Column('rows_total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rows_new', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('rows_duplicate', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ledger_balance', sa.Numeric(14, 2), nullable=True),
        sa.Column('ledger_balance_date', sa.Date(), nullable=True),
        sa.Column('imported_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        'bank_transactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bank_accounts.id', ondelete='CASCADE'), nullable=False),
        sa.Column('import_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('bank_statement_imports.id', ondelete='SET NULL'), nullable=True),
        sa.Column('posted_date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('payee', sa.String(255), nullable=True),
        sa.Column('reference', sa.String(100), nullable=True),
        sa.Column('fitid', sa.String(255), nullable=True),
        sa.Column('dedup_key', sa.String(300), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='unclassified'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('account_id', 'dedup_key', name='uq_bank_transactions_account_dedup'),
    )
    op.create_index('ix_bank_transactions_account_id', 'bank_transactions', ['account_id'])


def downgrade() -> None:
    op.drop_index('ix_bank_transactions_account_id', table_name='bank_transactions')
    op.drop_table('bank_transactions')
    op.drop_table('bank_statement_imports')
