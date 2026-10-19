"""note INV-112261 nouveau numero de devis

Revision ID: 41cc14414030
Revises: 9465bdf870d7
Create Date: 2026-10-19 13:20:30.725067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '41cc14414030'
down_revision: Union[str, Sequence[str], None] = '9465bdf870d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 2026-10-19, Philippe (« oui ») : la note de INV-112261 suit le nouveau numero du devis (2026-D0001 -> EST-110135).


def upgrade() -> None:
    op.execute("UPDATE invoices SET notes = replace(notes, 'devis 2026-D0001', 'devis EST-110135') WHERE number = 'INV-112261'")


def downgrade() -> None:
    op.execute("UPDATE invoices SET notes = replace(notes, 'devis EST-110135', 'devis 2026-D0001') WHERE number = 'INV-112261'")
