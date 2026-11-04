"""TASK-002.20 : une pastille peut être un menu déroulant (Philippe 2026-11-04 : « dans les réglages de pastille on peut
lui dire que c'est un menu déroulant et on a un espace pour le menu déroulant ») ; le choix est gardé sur la fiche.

statuses.choice_menu (bool), statuses.choices (JSONB : [{"group": str|None, "options": [str]}]),
entity_statuses.choice (texte). Ajouts seulement, rien de retiré.

Revision ID: f3c8a1d5b7e9
Revises: e2b7c4d9f1a8
Create Date: 2026-11-04
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "f3c8a1d5b7e9"
down_revision = "e2b7c4d9f1a8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("statuses", sa.Column("choice_menu", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("statuses", sa.Column("choices", JSONB(), nullable=False, server_default="[]"))
    op.add_column("entity_statuses", sa.Column("choice", sa.String(200), nullable=True))


def downgrade():
    op.drop_column("entity_statuses", "choice")
    op.drop_column("statuses", "choices")
    op.drop_column("statuses", "choice_menu")
