"""versements au gouvernement : obligations declarees (TPS/TVQ, impot, retenues) et paiements lies au releve (TASK-043.1)

Revision ID: 8bfd27dbcf5f
Revises: 0e67a0b1142c
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "8bfd27dbcf5f"
down_revision = "0e67a0b1142c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tax_obligations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("tps_due", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("tvq_due", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("amount_due", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("kind", "period_start", "period_end", name="uq_tax_obligations_period"),
    )
    op.add_column("tax_payments", sa.Column("kind", sa.String(20), nullable=False, server_default="tps_tvq"))
    op.add_column("tax_payments", sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("tax_payments", sa.Column("penalty_amount", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("tax_payments", sa.Column("bank_transaction_id", UUID(as_uuid=True), sa.ForeignKey("bank_transactions.id", ondelete="SET NULL")))
    op.add_column("bank_transactions", sa.Column("tax_payment_id", UUID(as_uuid=True), sa.ForeignKey("tax_payments.id", ondelete="SET NULL")))


def downgrade():
    op.drop_column("bank_transactions", "tax_payment_id")
    for c in ("bank_transaction_id", "penalty_amount", "amount", "kind"):
        op.drop_column("tax_payments", c)
    op.drop_table("tax_obligations")
