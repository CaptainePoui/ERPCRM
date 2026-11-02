"""portal_users : blocage après des mauvais mots de passe + permission « Débloquer les accès de sa compagnie » (TASK-001.2)

Revision ID: f5c8d2e4a6b1
Revises: e4b7c9d1f2a3
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa

revision = "f5c8d2e4a6b1"
down_revision = "e4b7c9d1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("portal_users", sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("portal_users", sa.Column("lock_step", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("portal_users", sa.Column("locked_until", sa.DateTime(timezone=True)))
    op.add_column("portal_users", sa.Column("banned_at", sa.DateTime(timezone=True)))
    op.add_column("portal_users", sa.Column("can_unlock_access", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    for c in ("can_unlock_access", "banned_at", "locked_until", "lock_step", "failed_logins"):
        op.drop_column("portal_users", c)
