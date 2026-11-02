"""mail_messages.reviewed_at (TASK-006.23) : un classement par Zeko / un contact cree a partir d'un courriel, vu et accepte
par la personne (« C'est bon ») ; la cloche « Courriels a verifier » ne montre que ce qui ne l'est pas. Les courriels deja
la au moment de la mise en place sont marques vus (la cloche commence avec les nouveaux ; la revue avec Zeko couvre les
anciens).

Revision ID: b5e8d0f4c2a7
Revises: 7d41c2e9a0b3
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa

revision = "b5e8d0f4c2a7"
down_revision = "7d41c2e9a0b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mail_messages", sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE mail_messages SET reviewed_at = now() WHERE classified_by = 'zeko' OR contact_created")


def downgrade() -> None:
    op.drop_column("mail_messages", "reviewed_at")
