"""Paiement « Facture perdue (ancien logiciel) » + documents attaches aux paiements (TASK-005.24, 2026-10-15).

- client_payments.lost_invoice : paiement recu (depot BNC) d'une facture de l'ancien logiciel dont le document est
  perdu (QuickBooks, avant juin 2020). Aucune repartition sur une facture ERPCRM, jamais du credit au dossier, aucun
  effet sur les ventes ni les taxes (deja declarees a l'epoque). Visible au portail et dans la fiche compagnie.
- client_payments.lost_invoice_number : numero de la facture perdue quand on le connait (ex. ecrit sur le cheque).
- payment_documents : pieces attachees a un paiement (cheque numerise, TASK-042.8) dans storage/payment_documents/.

Revision ID: bf3a731c918b
Revises: 2e7ad887ea0f
Create Date: 2026-10-15
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'bf3a731c918b'
down_revision: Union[str, Sequence[str], None] = '2e7ad887ea0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("client_payments", sa.Column("lost_invoice", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("client_payments", sa.Column("lost_invoice_number", sa.String(50), nullable=True))
    op.create_table(
        "payment_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("client_payments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="cheque"),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_payment_documents_payment_id", "payment_documents", ["payment_id"])


def downgrade() -> None:
    op.drop_index("ix_payment_documents_payment_id", table_name="payment_documents")
    op.drop_table("payment_documents")
    op.drop_column("client_payments", "lost_invoice_number")
    op.drop_column("client_payments", "lost_invoice")
