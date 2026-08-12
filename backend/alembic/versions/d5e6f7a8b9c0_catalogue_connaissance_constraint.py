"""TASK-004.2 : le CHECK constraint catalogue_items_type_check ne connaissait
que service/materiel -- ajout de "connaissance" (bloquait toute reclassification
depuis l'ecran "Classer les articles", IntegrityError silencieuse cote UI).
Ajoute aussi rate_multiplier (ex: Appel d'urgence = x2 du taux horaire).

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('catalogue_items_type_check', 'catalogue_items', type_='check')
    op.create_check_constraint(
        'catalogue_items_type_check', 'catalogue_items',
        "type IN ('service', 'materiel', 'connaissance')",
    )
    op.add_column('catalogue_items', sa.Column('rate_multiplier', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('catalogue_items', 'rate_multiplier')
    op.drop_constraint('catalogue_items_type_check', 'catalogue_items', type_='check')
    op.create_check_constraint(
        'catalogue_items_type_check', 'catalogue_items',
        "type IN ('service', 'materiel')",
    )
