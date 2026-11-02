"""statuses.contact_tabs (TASK-002.17, GO de Philippe 2026-11-02) : onglets que la pastille apporte sur la fiche contact.
Reglages de depart acceptes par Philippe (« les règles de départ me conviennent ») : client -> Téléphonie, Courriels,
Provisionnement ; IT, Reseaux, fournisseur -> Courriels ; les autres : aucun (modifiables dans Administration -> Pastilles).

Revision ID: d2f6a8c0e1b9
Revises: c1a9e7d3b4f6
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2f6a8c0e1b9"
down_revision = "c1a9e7d3b4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("statuses", sa.Column("contact_tabs", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.execute("""UPDATE statuses SET contact_tabs = '["telephonie", "courriels", "provisionnement"]' WHERE lower(name) = 'client'""")
    op.execute("""UPDATE statuses SET contact_tabs = '["courriels"]' WHERE lower(name) IN ('it', 'reseaux', 'fournisseur')""")


def downgrade() -> None:
    op.drop_column("statuses", "contact_tabs")
