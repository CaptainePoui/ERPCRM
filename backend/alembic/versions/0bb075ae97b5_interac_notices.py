"""avis de virement Interac lus par courriel (TASK-042.5)

Revision ID: 0bb075ae97b5
Revises: 8bfd27dbcf5f
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0bb075ae97b5"
down_revision = "8bfd27dbcf5f"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "interac_notices",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", sa.String(500), nullable=False, unique=True),
        sa.Column("received_at", sa.DateTime(timezone=True)),
        sa.Column("subject", sa.Text),
        sa.Column("body", sa.Text),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("sender_name", sa.String(255)),
        sa.Column("amount", sa.Numeric(14, 2)),
        sa.Column("sent_date", sa.Date),
        sa.Column("message", sa.Text),
        sa.Column("reference", sa.String(100)),
        sa.Column("error", sa.Text),
        sa.Column("bank_transaction_id", UUID(as_uuid=True), sa.ForeignKey("bank_transactions.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table("interac_notices")
