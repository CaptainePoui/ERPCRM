"""Arrondi de facturation de temps par article (Investigation/Configuration/Interconnexion)

Revision ID: n5o6p7q8r9s0
Revises: m4n5o6p7q8r9
Create Date: 2026-07-29
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'n5o6p7q8r9s0'
down_revision: Union[str, Sequence[str], None] = 'm4n5o6p7q8r9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('catalogue_items', sa.Column('time_rounding_minutes', sa.Integer(), nullable=True))

    conn = op.get_bind()
    # Investigation + tous les articles Configuration de type service -> bloc 5 min
    conn.execute(sa.text(
        "UPDATE catalogue_items SET time_rounding_minutes = 5 "
        "WHERE type = 'service' AND (name = 'Investigation' OR name ILIKE 'Configuration%')"
    ))
    # Travaux d'interconnexions -> bloc 15 min
    conn.execute(sa.text(
        "UPDATE catalogue_items SET time_rounding_minutes = 15 "
        "WHERE name = 'Travaux d''interconnexions'"
    ))


def downgrade() -> None:
    op.drop_column('catalogue_items', 'time_rounding_minutes')
