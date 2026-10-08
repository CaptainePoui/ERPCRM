"""echanges (troc) : les deductions deviennent des ajustements -- sens (en faveur de Simple IP ou du client) et note (TASK-005.13)

Revision ID: 4b6da2ad48bd
Revises: c7616746abbd
"""
from alembic import op
import sqlalchemy as sa

revision = "4b6da2ad48bd"
down_revision = "c7616746abbd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("barter_deductions", sa.Column("direction", sa.String(10), nullable=False, server_default="simpleip"))
    op.add_column("barter_deductions", sa.Column("note", sa.Text))


def downgrade():
    op.drop_column("barter_deductions", "note")
    op.drop_column("barter_deductions", "direction")
