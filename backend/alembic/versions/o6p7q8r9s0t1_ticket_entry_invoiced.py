"""Suivi invoiced par entree de ticket -- permet une 2e facture apres reouverture

Revision ID: o6p7q8r9s0t1
Revises: n5o6p7q8r9s0
Create Date: 2026-07-29
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'o6p7q8r9s0t1'
down_revision: Union[str, Sequence[str], None] = 'n5o6p7q8r9s0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ticket_entries', sa.Column('invoiced', sa.Boolean(), nullable=False, server_default='false'))

    # Backfill : tout ticket deja lie a une facture aujourd'hui a deja facture
    # l'ensemble de ses entrees (ancien comportement -- une seule facture par ticket).
    conn = op.get_bind()
    conn.execute(sa.text(
        "UPDATE ticket_entries SET invoiced = true "
        "WHERE ticket_id IN (SELECT id FROM tickets WHERE invoice_id IS NOT NULL)"
    ))


def downgrade() -> None:
    op.drop_column('ticket_entries', 'invoiced')
