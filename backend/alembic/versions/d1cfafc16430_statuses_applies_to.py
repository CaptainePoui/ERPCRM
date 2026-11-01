"""statuses applies_to : une pastille s'offre aux compagnies, aux contacts ou aux deux (TASK-002.14)

Revision ID: d1cfafc16430
Revises: f6540abeee20
Create Date: 2026-11-01 19:01:16.546002

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1cfafc16430'
down_revision: Union[str, Sequence[str], None] = 'f6540abeee20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("statuses", sa.Column("applies_to", sa.String(10), nullable=False, server_default="both"))
    # Philippe (2026-11-01) : « vendeur sert à avoir les ristournes, c'est une pastille de contact »
    op.execute("update statuses set applies_to = 'contacts' where lower(name) = 'vendeur'")


def downgrade() -> None:
    op.drop_column("statuses", "applies_to")
