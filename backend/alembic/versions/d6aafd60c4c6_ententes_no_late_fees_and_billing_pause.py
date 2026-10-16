"""Ententes (TASK-005.26, 2026-10-16) : « pas de frais de retard » par compagnie + pause de la facturation periodique.

- companies.no_late_fees : la compagnie ne recoit jamais d'avis de frais de retard (Philippe : « je peux choisir qu'une
  entreprise ne paie pas de frais de retard »).
- company_recurring_billings.pause_start / pause_end : aucune facture pour les cycles qui commencent dans
  [pause_start, pause_end[ ; a la reprise (pause_end), le cycle repart de cette date, meme rythme.

Revision ID: d6aafd60c4c6
Revises: bf3a731c918b
Create Date: 2026-10-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd6aafd60c4c6'
down_revision: Union[str, Sequence[str], None] = 'bf3a731c918b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("no_late_fees", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("company_recurring_billings", sa.Column("pause_start", sa.Date(), nullable=True))
    op.add_column("company_recurring_billings", sa.Column("pause_end", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("company_recurring_billings", "pause_end")
    op.drop_column("company_recurring_billings", "pause_start")
    op.drop_column("companies", "no_late_fees")
