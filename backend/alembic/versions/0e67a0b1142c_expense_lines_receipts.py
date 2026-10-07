"""lignes de depense (6 classes) et recus deposes analyses par l'IA locale (TASK-044.1)

Revision ID: 0e67a0b1142c
Revises: 9559265c75e8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0e67a0b1142c"
down_revision = "9559265c75e8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "expense_lines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("expense_id", UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("line_class", sa.String(30), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_code", sa.String(10), nullable=False),
        sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="SET NULL")),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
    )
    op.create_table(
        "receipt_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("from_zip", sa.String(255)),
        sa.Column("stored_path", sa.Text, nullable=False),
        sa.Column("mime", sa.String(100)),
        sa.Column("size", sa.Integer, nullable=False, server_default="0"),
        sa.Column("sha256", sa.String(64), nullable=False, index=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("text", sa.Text),
        sa.Column("extracted", sa.Text),
        sa.Column("checks", sa.Text),
        sa.Column("error", sa.Text),
        sa.Column("expense_id", UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="SET NULL")),
        sa.Column("uploaded_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
    )


def downgrade():
    op.drop_table("receipt_documents")
    op.drop_table("expense_lines")
