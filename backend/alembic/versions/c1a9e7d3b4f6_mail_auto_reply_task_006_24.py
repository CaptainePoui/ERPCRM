"""mail_messages.auto_reply (TASK-006.24) : reponse automatique d'une regle des courriels
{etat: attente | preparee | envoyee | pas_envoyee | annulee, regle_id, brouillon {de, a, cc, objet, html}, raison, le}

Revision ID: c1a9e7d3b4f6
Revises: b5e8d0f4c2a7
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c1a9e7d3b4f6"
down_revision = "b5e8d0f4c2a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mail_messages", sa.Column("auto_reply", postgresql.JSONB()))


def downgrade() -> None:
    op.drop_column("mail_messages", "auto_reply")
