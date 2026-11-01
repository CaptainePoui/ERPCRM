"""statuses company_tabs : onglets de la fiche compagnie apportés par chaque pastille (TASK-002.13)

Revision ID: f6540abeee20
Revises: 5ad286eac216
Create Date: 2026-11-01 18:22:45.187300

"""
from typing import Sequence, Union

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f6540abeee20'
down_revision: Union[str, Sequence[str], None] = '5ad286eac216'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("statuses", sa.Column("company_tabs", postgresql.JSONB(), nullable=False, server_default="[]"))
    # Réglages de départ proposés à Philippe (2026-11-01), modifiables dans Administration -> Configuration -> Pastilles
    defaults = {
        "client": ["tickets", "conversations", "telephonie", "transactions", "entente", "inventaire", "photos"],
        "fournisseur": ["transactions"],
        "réseau / informatique": ["inventaire"],
        "fournisseur internet": ["inventaire"],
    }
    conn = op.get_bind()
    for name, tabs in defaults.items():
        conn.execute(sa.text("update statuses set company_tabs = cast(:t as jsonb) where lower(name) = :n"),
                     {"t": json.dumps(tabs), "n": name})


def downgrade() -> None:
    op.drop_column("statuses", "company_tabs")
