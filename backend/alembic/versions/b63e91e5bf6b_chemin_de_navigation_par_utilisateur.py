"""chemin de navigation par utilisateur

Revision ID: b63e91e5bf6b
Revises: 0f0ad0d71eb4
Create Date: 2026-10-21 13:01:36.331030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b63e91e5bf6b'
down_revision: Union[str, Sequence[str], None] = '0f0ad0d71eb4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-054 (2026-10-21) : chemin de navigation garde sur le serveur (bouton Retour).


def upgrade() -> None:
    op.add_column("users", sa.Column("nav_trail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "nav_trail")
