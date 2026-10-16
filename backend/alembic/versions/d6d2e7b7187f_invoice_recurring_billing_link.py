"""Facture -> facture periodique d'origine (TASK-005.26, 2026-10-16) : « toutes les factures enfants » de l'entente.

Revision ID: d6d2e7b7187f
Revises: d6aafd60c4c6
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd6d2e7b7187f'
down_revision: Union[str, Sequence[str], None] = 'd6aafd60c4c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("recurring_billing_id", postgresql.UUID(as_uuid=True),
                                        sa.ForeignKey("company_recurring_billings.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_invoices_recurring_billing_id", "invoices", ["recurring_billing_id"])


def downgrade() -> None:
    op.drop_index("ix_invoices_recurring_billing_id", table_name="invoices")
    op.drop_column("invoices", "recurring_billing_id")
