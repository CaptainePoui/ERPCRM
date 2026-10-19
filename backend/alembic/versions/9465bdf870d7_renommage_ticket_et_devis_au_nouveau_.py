"""renommage ticket et devis au nouveau format

Revision ID: 9465bdf870d7
Revises: 71c2762eece2
Create Date: 2026-10-19 13:17:20.590154

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9465bdf870d7'
down_revision: Union[str, Sequence[str], None] = '71c2762eece2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 2026-10-19, Philippe : « arrange les nomenclatures de ticket et de devis ». Les numeros donnes avant le changement de
# format prennent le nouveau : ticket 11000 -> T-11000 ; devis 2026-D0001 -> EST-110135 (Philippe : « devis c'est
# EST-110135, prochain EST-110136 »). Les compteurs ne bougent pas (T-11001, EST-110136).


def upgrade() -> None:
    op.execute("UPDATE tickets SET number = 'T-11000' WHERE number = '11000'")
    op.execute("UPDATE devis SET number = 'EST-110135' WHERE number = '2026-D0001'")


def downgrade() -> None:
    op.execute("UPDATE tickets SET number = '11000' WHERE number = 'T-11000'")
    op.execute("UPDATE devis SET number = '2026-D0001' WHERE number = 'EST-110135'")
