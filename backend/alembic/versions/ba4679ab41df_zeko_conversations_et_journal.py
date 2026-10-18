"""zeko conversations et journal

Revision ID: ba4679ab41df
Revises: 017f99a0ff4b
Create Date: 2026-10-18 00:50:25.206323

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'ba4679ab41df'
down_revision: Union[str, Sequence[str], None] = '017f99a0ff4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-006.5 etape 2 (2026-10-18) : Zeko -- conversations gardees et journal des appels au modele.
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.create_table(
        "zeko_conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("tickets.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("title", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "zeko_messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("zeko_conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("tool_calls", sa.Text()),
        sa.Column("tool_call_id", sa.String(100)),
        sa.Column("tool_name", sa.String(60)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "zeko_invocations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("purpose", sa.String(40), nullable=False, index=True),
        sa.Column("provider", sa.String(30), nullable=False, server_default="local"),
        sa.Column("model", sa.String(100)),
        sa.Column("status", sa.String(20), nullable=False, server_default="ok"),
        sa.Column("duration_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("prompt_tokens", sa.Integer()),
        sa.Column("completion_tokens", sa.Integer()),
        sa.Column("error", sa.Text()),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("zeko_conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("zeko_invocations")
    op.drop_table("zeko_messages")
    op.drop_table("zeko_conversations")
