"""journal : fiche parente (TASK-049 etape 2) -- une ligne de facture, une note de ticket... apparait dans l'Historique
de sa facture, de son ticket, meme apres avoir ete supprimee.

Revision ID: f877151f6593
Revises: fc8d12251c14
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa

revision = "f877151f6593"
down_revision = "fc8d12251c14"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entity_logs", sa.Column("parent_type", sa.String(60), nullable=True))
    op.add_column("entity_logs", sa.Column("parent_id", sa.String(100), nullable=True))
    op.create_index("ix_entity_logs_parent", "entity_logs", ["parent_type", "parent_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_logs_parent", "entity_logs")
    op.drop_column("entity_logs", "parent_id")
    op.drop_column("entity_logs", "parent_type")
