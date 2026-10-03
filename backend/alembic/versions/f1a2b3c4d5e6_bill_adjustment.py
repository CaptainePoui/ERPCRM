"""bills.adjustment : ajustement d'arrondi d'une facture fournisseur (TASK-044)

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bills", sa.Column("adjustment", sa.Numeric(14, 2), nullable=False, server_default="0"))


def downgrade():
    op.drop_column("bills", "adjustment")
