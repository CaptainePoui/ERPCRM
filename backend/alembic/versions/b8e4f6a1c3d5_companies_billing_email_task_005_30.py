"""companies.billing_email (TASK-005.30) : courriel de facturation de la compagnie, utilisé en premier pour les factures,
les avis de retard et les réponses automatiques (avant : contact « comptes payables / facturation », sinon principal).

Revision ID: b8e4f6a1c3d5
Revises: a7d3e5f9b2c4
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa

revision = "b8e4f6a1c3d5"
down_revision = "a7d3e5f9b2c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("billing_email", sa.String(255)))


def downgrade() -> None:
    op.drop_column("companies", "billing_email")
