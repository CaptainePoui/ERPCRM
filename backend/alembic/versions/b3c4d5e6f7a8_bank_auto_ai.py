"""bank_transactions : association automatique et proposition de l'IA locale (TASK-042.2)

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "b3c4d5e6f7a8"
down_revision = "a2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bank_transactions", sa.Column("auto_matched", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("bank_transactions", sa.Column("ai_status", sa.String(10)))
    op.add_column("bank_transactions", sa.Column("ai_company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL")))
    op.add_column("bank_transactions", sa.Column("ai_confidence", sa.Integer))
    op.add_column("bank_transactions", sa.Column("ai_note", sa.Text))


def downgrade():
    for c in ("ai_note", "ai_confidence", "ai_company_id", "ai_status", "auto_matched"):
        op.drop_column("bank_transactions", c)
