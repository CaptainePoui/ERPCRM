"""recus de paiement par carte

Revision ID: 491d43d8d577
Revises: 41cc14414030
Create Date: 2026-10-21 12:36:44.807901

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '491d43d8d577'
down_revision: Union[str, Sequence[str], None] = '41cc14414030'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-042.11 (2026-10-21) : recus « Merchant Email Receipt » (paiements par carte Authorize.Net / Elavon).
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.create_table(
        "card_receipts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("mail_message_id", UUID(as_uuid=True), sa.ForeignKey("mail_messages.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("paid_at", sa.Date()),
        sa.Column("invoice_number", sa.String(50)),
        sa.Column("amount", sa.Numeric(14, 2)),
        sa.Column("company_name", sa.String(255)),
        sa.Column("card", sa.String(50)),
        sa.Column("transaction_ref", sa.String(50)),
        sa.Column("status", sa.String(12), nullable=False, server_default="parsed"),
        sa.Column("note", sa.Text()),
        sa.Column("bank_transaction_id", UUID(as_uuid=True), sa.ForeignKey("bank_transactions.id", ondelete="SET NULL")),
        sa.Column("invoice_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("card_receipts")
