"""un fournisseur = une compagnie : une seule fiche fournisseur par compagnie (TASK-044.6)

Revision ID: 9708c961763c
Revises: c7e1d4a9b2f6
Create Date: 2026-11-01 13:00:00

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '9708c961763c'
down_revision: Union[str, Sequence[str], None] = 'c7e1d4a9b2f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """La fiche fournisseur (partie comptable) est liee une pour une a sa compagnie ; une fiche sans compagnie reste permise."""
    op.create_index("uq_vendors_company_id", "vendors", ["company_id"], unique=True,
                    postgresql_where="company_id IS NOT NULL")


def downgrade() -> None:
    op.drop_index("uq_vendors_company_id", table_name="vendors")
