"""add first_invoice_generated to company_recurring_billings

Revision ID: 22e413a7b0dd
Revises: d5e6f7a8b9c0
Create Date: 2026-08-11 13:35:19.383349

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '22e413a7b0dd'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # TASK-033 : aucune facture recurrente n'a jamais ete generee a ce jour
    # (verifie : 0 ligne dans invoices avec is_recurring=true) -- pas de
    # backfill necessaire, default false correct pour toutes les recurrences
    # existantes (leur prochaine facture sera a juste titre traitee comme
    # "premiere").
    op.add_column('company_recurring_billings', sa.Column('first_invoice_generated', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('company_recurring_billings', 'first_invoice_generated')
