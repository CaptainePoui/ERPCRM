"""TASK-005.32 : quand, a qui et par quel courriel une facture a ete transmise (Philippe 2026-11-05 : une facture
envoyee par Zoho, confirmee par courriel, porte une marque « Envoyee par Zoho » pendant la transition).
transmission_status recoit une nouvelle valeur « zoho » (colonne texte, pas de contrainte). Ajouts seulement.

Revision ID: b2d5f8a1c3e6
Revises: a1c4e7b2d9f3
Create Date: 2026-11-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "b2d5f8a1c3e6"
down_revision = "a1c4e7b2d9f3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("invoices", sa.Column("transmitted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("invoices", sa.Column("transmitted_to", sa.String(500), nullable=True))
    op.add_column("invoices", sa.Column("transmitted_mail_id", UUID(as_uuid=True), sa.ForeignKey("mail_messages.id", ondelete="SET NULL"), nullable=True))


def downgrade():
    op.drop_column("invoices", "transmitted_mail_id")
    op.drop_column("invoices", "transmitted_to")
    op.drop_column("invoices", "transmitted_at")
