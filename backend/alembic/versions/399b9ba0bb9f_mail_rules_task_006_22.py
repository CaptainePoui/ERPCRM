"""mail_rules (TASK-006.22) : regles des courriels comme Outlook ; mail_messages.rule_id / move_to / move_state / move_error

Revision ID: 399b9ba0bb9f
Revises: 0588b5b4ff63
Create Date: 2026-11-02

Ecrite a la main : l'autogeneration proposait aussi de supprimer des tables et des index sans rapport (jamais applique).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "399b9ba0bb9f"
down_revision = "0588b5b4ff63"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mail_rules",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("match", sa.String(10), nullable=False, server_default="toutes"),
        sa.Column("conditions", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("actions", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("source", sa.String(10), nullable=False, server_default="manuel"),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_hit_at", sa.DateTime(timezone=True)),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.add_column("mail_messages", sa.Column("rule_id", sa.UUID(), sa.ForeignKey("mail_rules.id", ondelete="SET NULL")))
    op.add_column("mail_messages", sa.Column("move_to", sa.String(255)))
    op.add_column("mail_messages", sa.Column("move_state", sa.String(10)))
    op.add_column("mail_messages", sa.Column("move_error", sa.String(500)))


def downgrade() -> None:
    op.drop_column("mail_messages", "move_error")
    op.drop_column("mail_messages", "move_state")
    op.drop_column("mail_messages", "move_to")
    op.drop_column("mail_messages", "rule_id")
    op.drop_table("mail_rules")
