"""echanges (troc) : le credit se consomme mois par mois puis la facture periodique repart a la date de reprise (TASK-005.13)

Revision ID: c7616746abbd
Revises: f1989fa81aee
"""
from alembic import op
import sqlalchemy as sa

revision = "c7616746abbd"
down_revision = "f1989fa81aee"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("company_recurring_billings", sa.Column("barter_since", sa.Date))
    op.add_column("company_recurring_billings", sa.Column("barter_cursor", sa.Date))


def downgrade():
    op.drop_column("company_recurring_billings", "barter_cursor")
    op.drop_column("company_recurring_billings", "barter_since")
