"""tickets conversation et chrono par periodes

Revision ID: 5ea0bdba86ab
Revises: d6d2e7b7187f
Create Date: 2026-10-17 21:33:54.009996

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ea0bdba86ab'
down_revision: Union[str, Sequence[str], None] = 'd6d2e7b7187f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects.postgresql import UUID

# TASK-006.5 etape 1 (2026-10-17) : le ticket devient une conversation (messages + images) et un seul temps,
# mesure par periodes de chrono serveur + corrections tracees. Les saisies de temps disparaissent.
# Les 9 tickets existants etaient des essais : Philippe -- « rien n'est en ligne pour l'instant tout est des
# tests, efface les tickets ». Sauvegarde : backups/erpcrm_avant_tickets_20261017.sql.


def upgrade() -> None:
    op.execute("DELETE FROM tickets")
    op.drop_table("ticket_entries")
    for col in ("timer_start_at", "timer_base_seconds", "last_note_marker_seconds", "draft_note_billable"):
        op.drop_column("tickets", col)
    op.drop_constraint("tickets_draft_note_catalogue_item_id_fkey", "tickets", type_="foreignkey")
    op.drop_column("tickets", "draft_note_catalogue_item_id")
    op.alter_column("tickets", "draft_note_desc", new_column_name="draft_message")
    op.add_column("tickets", sa.Column("catalogue_item_id", UUID(as_uuid=True), sa.ForeignKey("catalogue_items.id", ondelete="SET NULL"), nullable=True))
    op.add_column("tickets", sa.Column("invoiced_seconds", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "ticket_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("author_kind", sa.String(20), nullable=False, server_default="tech"),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ticket_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("message_id", UUID(as_uuid=True), sa.ForeignKey("ticket_messages.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255)),
        sa.Column("media_type", sa.String(100), nullable=False, server_default="application/octet-stream"),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ticket_time_periods",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("stop_source", sa.String(30)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "ticket_time_adjustments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="correction"),
        sa.Column("before_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("after_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("delta_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reason", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    # Remet la structure d'avant (vide) ; les anciens tickets d'essai sont dans la sauvegarde.
    op.execute("DELETE FROM tickets")
    op.drop_table("ticket_time_adjustments")
    op.drop_table("ticket_time_periods")
    op.drop_table("ticket_attachments")
    op.drop_table("ticket_messages")
    op.drop_column("tickets", "invoiced_seconds")
    op.drop_column("tickets", "catalogue_item_id")
    op.alter_column("tickets", "draft_message", new_column_name="draft_note_desc")
    op.add_column("tickets", sa.Column("draft_note_catalogue_item_id", UUID(as_uuid=True), sa.ForeignKey("catalogue_items.id", ondelete="SET NULL", name="tickets_draft_note_catalogue_item_id_fkey"), nullable=True))
    op.add_column("tickets", sa.Column("draft_note_billable", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tickets", sa.Column("last_note_marker_seconds", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("tickets", sa.Column("timer_base_seconds", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("tickets", sa.Column("timer_start_at", sa.DateTime(timezone=True)))
    op.create_table(
        "ticket_entries",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("catalogue_item_id", UUID(as_uuid=True), sa.ForeignKey("catalogue_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("duration_minutes", sa.Integer()),
        sa.Column("worked_at", sa.Date(), nullable=False),
        sa.Column("is_billable", sa.Boolean()),
        sa.Column("invoiced", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
