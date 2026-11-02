"""Taxes des documents découverts après coup (TASK-044.5, décision de Philippe 2026-11-01 : « je veux réclamer ou donner
toutes les taxes des factures que je découvre dès que je les découvre »).

- tax_declarations : quand chaque période a été déclarée (pour savoir si un document a été saisi APRÈS la déclaration de
  sa période). Rempli au moment de déclarer ; reprise : juillet-septembre 2026 déclarée le 2026-11-01 (fin de journée,
  heure de l'Est) ; les périodes d'avant ont été déclarées hors ERPCRM : leur moment = fin de l'import Zoho (2026-10-05).
- tax_adjustments.doc_kind / doc_id : l'ajustement « document découvert après coup » pointe son document (compté une fois).

Revision ID: d1a6b8c3e5f7
Revises: c9f5a7b2d4e6
Create Date: 2026-11-02
"""
import uuid

from alembic import op
import sqlalchemy as sa

revision = "d1a6b8c3e5f7"
down_revision = "c9f5a7b2d4e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tax_declarations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False, unique=True),
        sa.Column("declared_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("how", sa.String(20), nullable=False, server_default="manuel"),
    )
    op.add_column("tax_adjustments", sa.Column("doc_kind", sa.String(20)))
    op.add_column("tax_adjustments", sa.Column("doc_id", sa.UUID()))
    op.create_index("ix_tax_adjustments_doc", "tax_adjustments", ["doc_kind", "doc_id"], unique=True)
    op.get_bind().execute(sa.text("""INSERT INTO tax_declarations (id, period_start, period_end, declared_at, how)
                                     VALUES (:i, '2026-07-01', '2026-09-30', '2026-11-02 04:59:59+00', 'reprise')"""), {"i": uuid.uuid4()})
    op.get_bind().execute(sa.text("""INSERT INTO app_settings (key, value) VALUES ('tax_late_docs_since', '2026-10-05')
                                     ON CONFLICT (key) DO NOTHING"""))


def downgrade() -> None:
    op.drop_index("ix_tax_adjustments_doc", table_name="tax_adjustments")
    op.drop_column("tax_adjustments", "doc_id")
    op.drop_column("tax_adjustments", "doc_kind")
    op.drop_table("tax_declarations")
