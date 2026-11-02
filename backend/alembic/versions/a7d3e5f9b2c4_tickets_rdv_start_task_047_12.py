"""tickets.rdv_start (TASK-047.12) : heure du RDV du ticket (Google Agenda), pour que la cloche ignore un ticket dont le
RDV n'est pas encore passé. Remplie à la création / modification du RDV dans ERPCRM et relue de Google (core/ticket_rdv.py).

Revision ID: a7d3e5f9b2c4
Revises: f5c8d2e4a6b1
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa

revision = "a7d3e5f9b2c4"
down_revision = "f5c8d2e4a6b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("rdv_start", sa.DateTime(timezone=True)))


def downgrade() -> None:
    op.drop_column("tickets", "rdv_start")
