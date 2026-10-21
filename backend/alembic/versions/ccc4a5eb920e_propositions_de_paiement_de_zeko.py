"""propositions de paiement de zeko

Revision ID: ccc4a5eb920e
Revises: 38ef6776564f
Create Date: 2026-10-21 16:16:01.367391

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ccc4a5eb920e'
down_revision: Union[str, Sequence[str], None] = '38ef6776564f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-042.13 (2026-10-21) : Zeko lit les courriels pour trouver les avis de paiement et propose les associations.
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.create_table(
        "zeko_mail_scans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("mail_message_id", UUID(as_uuid=True), sa.ForeignKey("mail_messages.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("result", sa.String(20), nullable=False),
        sa.Column("extracted", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "zeko_proposals",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("mail_message_id", UUID(as_uuid=True), sa.ForeignKey("mail_messages.id", ondelete="SET NULL"), index=True),
        sa.Column("bank_transaction_id", UUID(as_uuid=True), sa.ForeignKey("bank_transactions.id", ondelete="SET NULL"), index=True),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(15), nullable=False, index=True),
        sa.Column("amount", sa.Float()),
        sa.Column("paid_on", sa.DateTime(timezone=True)),
        sa.Column("allocations", sa.Text()),
        sa.Column("explanation", sa.Text()),
        sa.Column("evidence", sa.Text()),
        sa.Column("decided_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("zeko_proposals")
    op.drop_table("zeko_mail_scans")
