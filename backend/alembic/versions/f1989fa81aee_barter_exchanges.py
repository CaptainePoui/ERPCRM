"""echanges (troc) : fiche, deductions, pieces justificatives, cycles couverts (TASK-005.13)

Revision ID: f1989fa81aee
Revises: 0bb075ae97b5
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "f1989fa81aee"
down_revision = "0bb075ae97b5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "barter_exchanges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recurring_billing_id", UUID(as_uuid=True), sa.ForeignKey("company_recurring_billings.id", ondelete="SET NULL")),
        sa.Column("exchange_date", sa.Date, nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("received_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_barter_exchanges_company_id", "barter_exchanges", ["company_id"])
    op.create_index("ix_barter_exchanges_recurring_billing_id", "barter_exchanges", ["recurring_billing_id"])
    op.create_table(
        "barter_deductions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("barter_id", UUID(as_uuid=True), sa.ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("qty", sa.Numeric(10, 2), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_index("ix_barter_deductions_barter_id", "barter_deductions", ["barter_id"])
    op.create_table(
        "barter_files",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("barter_id", UUID(as_uuid=True), sa.ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("size", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_barter_files_barter_id", "barter_files", ["barter_id"])
    op.create_table(
        "barter_applications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("barter_id", UUID(as_uuid=True), sa.ForeignKey("barter_exchanges.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recurring_billing_id", UUID(as_uuid=True), sa.ForeignKey("company_recurring_billings.id", ondelete="SET NULL")),
        sa.Column("cycle_start", sa.Date, nullable=False),
        sa.Column("cycle_end", sa.Date, nullable=False),
        sa.Column("covered_until", sa.Date, nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="CASCADE")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_barter_applications_barter_id", "barter_applications", ["barter_id"])


def downgrade():
    op.drop_table("barter_applications")
    op.drop_table("barter_files")
    op.drop_table("barter_deductions")
    op.drop_table("barter_exchanges")
