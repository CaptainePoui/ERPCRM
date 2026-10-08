"""echanges (troc) : le credit paie d'abord les factures ouvertes -- paiement « Troc » lie a l'usage du credit (TASK-005.13)

Revision ID: e1a7648be316
Revises: 4b6da2ad48bd
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "e1a7648be316"
down_revision = "4b6da2ad48bd"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("barter_applications", sa.Column("client_payment_id", UUID(as_uuid=True),
                                                   sa.ForeignKey("client_payments.id", ondelete="CASCADE")))
    op.execute("INSERT INTO payment_methods (id, code, name, discount_rate, is_active) "
               "SELECT gen_random_uuid(), 'troc', 'Troc', 0, true WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE code = 'troc')")


def downgrade():
    op.drop_column("barter_applications", "client_payment_id")
    op.execute("DELETE FROM payment_methods WHERE code = 'troc' AND NOT EXISTS (SELECT 1 FROM client_payments WHERE method_code = 'troc')")
