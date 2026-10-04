"""document_counters : compteurs de numerotation qui ne reculent jamais (2026-10-04)

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa

revision = "a2b3c4d5e6f7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

# (cle, prefixe stocke, prefixe de l'annee courante pour l'amorce, remplissage, table, colonne)
SEEDS = [
    ("invoice", "{year}-", "2026-", 4, "invoices", "number"),
    ("devis", "{year}-D", "2026-D", 4, "devis", "number"),
    ("payment", "PAY-{year}-", "PAY-2026-", 4, "client_payments", "reference"),
    ("purchase_order", "BC-", "BC-", 5, "purchase_orders", "po_number"),
    ("ecom_order", "WEB-", "WEB-", 5, "ecom_orders", "order_number"),
]


def upgrade():
    op.create_table(
        "document_counters",
        sa.Column("key", sa.String(50), primary_key=True),
        sa.Column("prefix", sa.String(30), nullable=False),
        sa.Column("next_value", sa.Integer, nullable=False),
        sa.Column("padding", sa.Integer, nullable=False, server_default="4"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    # Amorce : prochain numero = plus grand numero deja emis + 1 (jamais en dessous)
    for key, prefix, current, padding, table, col in SEEDS:
        op.execute(f"""
            INSERT INTO document_counters (key, prefix, next_value, padding)
            SELECT '{key}', '{prefix}', COALESCE(MAX(CAST(SUBSTRING({col} FROM {len(current) + 1}) AS INTEGER)), 0) + 1, {padding}
            FROM {table} WHERE {col} LIKE '{current}%' AND SUBSTRING({col} FROM {len(current) + 1}) ~ '^[0-9]+$'
        """)


def downgrade():
    op.drop_table("document_counters")
