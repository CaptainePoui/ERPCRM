"""factures de frais de retard (TASK-005.14) : marque « a regler en troc » et lien facture de retard -> facture visee

Revision ID: 8e756bdf15d8
Revises: e1a7648be316

Les factures de retard importees de l'ancien logiciel sont reliees a leur facture d'origine d'apres la ligne
« Frais de retard (2%) — INV-... » : ERPCRM sait ainsi combien de frais ont deja ete factures et ne les double jamais.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "8e756bdf15d8"
down_revision = "e1a7648be316"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invoices", sa.Column("barter_settlement", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("invoices", sa.Column("late_fee_for_id", UUID(as_uuid=True), sa.ForeignKey("invoices.id", ondelete="SET NULL")))
    op.create_index("ix_invoices_late_fee_for_id", "invoices", ["late_fee_for_id"])
    op.execute(r"""
        UPDATE invoices f SET late_fee_for_id = src.id
        FROM invoice_lines l, invoices src
        WHERE l.invoice_id = f.id AND f.credit_of_id IS NULL AND f.late_fee_for_id IS NULL
          AND l.description LIKE 'Frais de retard (2%%) — INV-%%'
          AND src.number = substring(l.description from 'INV-[0-9]+')
    """)


def downgrade():
    op.drop_index("ix_invoices_late_fee_for_id", table_name="invoices")
    op.drop_column("invoices", "late_fee_for_id")
    op.drop_column("invoices", "barter_settlement")
