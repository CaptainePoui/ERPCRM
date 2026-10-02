"""recurrences : plusieurs par compagnie, nom, succursale, date de fin, derniere facture

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-10-02

TASK-021.1 : retire l'unicite company_id ; is_telephony marque LA recurrence liee au tenant
SIPV (les evenements de facturation SIPV et l'activation du tenant ne visent qu'elle) -- la
recurrence existante de Simple IP inc. (creee par l'activation SIPV) est marquee telle.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('company_recurring_billings_company_id_key', 'company_recurring_billings', type_='unique')
    op.create_index('ix_company_recurring_billings_company_id', 'company_recurring_billings', ['company_id'])
    op.add_column('company_recurring_billings', sa.Column('name', sa.String(255), nullable=True))
    op.add_column('company_recurring_billings', sa.Column('site_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('company_sites.id', ondelete='SET NULL'), nullable=True))
    op.add_column('company_recurring_billings', sa.Column('end_date', sa.Date(), nullable=True))
    op.add_column('company_recurring_billings', sa.Column('last_invoice_date', sa.Date(), nullable=True))
    op.add_column('company_recurring_billings', sa.Column('is_telephony', sa.Boolean(), nullable=False, server_default=sa.false()))
    # Les recurrences existantes ont toutes ete creees par l'activation du tenant SIPV
    op.execute("UPDATE company_recurring_billings SET is_telephony = true")


def downgrade() -> None:
    for c in ('is_telephony', 'last_invoice_date', 'end_date', 'site_id', 'name'):
        op.drop_column('company_recurring_billings', c)
    op.drop_index('ix_company_recurring_billings_company_id', table_name='company_recurring_billings')
    op.create_unique_constraint('company_recurring_billings_company_id_key', 'company_recurring_billings', ['company_id'])
