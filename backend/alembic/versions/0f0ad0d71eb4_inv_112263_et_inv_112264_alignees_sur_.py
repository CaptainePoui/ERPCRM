"""INV-112263 et INV-112264 alignees sur Zoho

Revision ID: 0f0ad0d71eb4
Revises: 491d43d8d577
Create Date: 2026-10-21 12:38:49.428668

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0f0ad0d71eb4'
down_revision: Union[str, Sequence[str], None] = '491d43d8d577'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 2026-10-21, Philippe : « Zoho pour l'instant est la référence, ajuste-les dans ERPCRM ». Dans Zoho : INV-112263 =
# SST Construction (229,03 $), INV-112264 = Audacie (311,05 $) ; ERPCRM les avait inversees. Ni l'une ni l'autre n'a
# ete envoyee depuis ERPCRM ; aucun paiement ni note ne cite ces numeros.


def _swap(a, b):
    op.execute(f"UPDATE invoices SET number = 'TMP-SWAP' WHERE number = '{a}'")
    op.execute(f"UPDATE invoices SET number = '{a}' WHERE number = '{b}'")
    op.execute(f"UPDATE invoices SET number = '{b}' WHERE number = 'TMP-SWAP'")


def upgrade() -> None:
    _swap("INV-112263", "INV-112264")


def downgrade() -> None:
    _swap("INV-112263", "INV-112264")
