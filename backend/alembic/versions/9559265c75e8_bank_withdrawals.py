"""retraits bancaires : fournisseur, depense ou paiement fournisseur lie ; regles beneficiaire -> fournisseur (TASK-042.4)

Revision ID: 9559265c75e8
Revises: b3c4d5e6f7a8
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "9559265c75e8"
down_revision = "b3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("bank_transactions", sa.Column("vendor_id", UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="SET NULL")))
    op.add_column("bank_transactions", sa.Column("vendor_source", sa.String(10)))
    op.add_column("bank_transactions", sa.Column("expense_id", UUID(as_uuid=True), sa.ForeignKey("expenses.id", ondelete="SET NULL")))
    op.add_column("bank_transactions", sa.Column("vendor_payment_id", UUID(as_uuid=True), sa.ForeignKey("vendor_payments.id", ondelete="SET NULL")))
    op.alter_column("bank_payee_rules", "company_id", nullable=True)
    op.add_column("bank_payee_rules", sa.Column("vendor_id", UUID(as_uuid=True), sa.ForeignKey("vendors.id", ondelete="CASCADE")))
    op.add_column("bank_payee_rules", sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("expense_categories.id", ondelete="SET NULL")))


def downgrade():
    op.drop_column("bank_payee_rules", "category_id")
    op.drop_column("bank_payee_rules", "vendor_id")
    op.execute("DELETE FROM bank_payee_rules WHERE company_id IS NULL")
    op.alter_column("bank_payee_rules", "company_id", nullable=False)
    for c in ("vendor_payment_id", "expense_id", "vendor_source", "vendor_id"):
        op.drop_column("bank_transactions", c)
