"""presence utilisateur pour les chronos de ticket

Revision ID: 017f99a0ff4b
Revises: 5ea0bdba86ab
Create Date: 2026-10-17 22:54:57.421417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '017f99a0ff4b'
down_revision: Union[str, Sequence[str], None] = '5ea0bdba86ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-006.5 (2026-10-17) : presence d'un ecran ERPCRM ouvert -- navigateur ferme = chronos en pause.


def upgrade() -> None:
    op.add_column("users", sa.Column("presence_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "presence_at")
