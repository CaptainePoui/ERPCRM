"""TASK-021/S032 : article catalogue "Prorata" -- utilisé pour les lignes de
crédit générées quand un service SIPV est retiré en cours de cycle de
facturation. Prix à 0 par défaut (le montant réel est calculé ligne par ligne
au moment du retrait, pas un prix fixe de catalogue) -- description explique
le calcul à chaque fois.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-08
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        INSERT INTO catalogue_items (id, name, type, price, currency, is_active, description, created_at)
        SELECT gen_random_uuid(), 'Prorata', 'service', 0, 'CAD', true,
               'Crédit ou charge au prorata pour un service SIPV ajouté/retiré en cours de cycle de facturation. Le montant est calculé automatiquement, jamais un prix fixe.',
               now()
        WHERE NOT EXISTS (SELECT 1 FROM catalogue_items WHERE name = 'Prorata')
    """)


def downgrade() -> None:
    op.execute("DELETE FROM catalogue_items WHERE name = 'Prorata'")
