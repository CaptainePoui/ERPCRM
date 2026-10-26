"""zeko depots de documents

Revision ID: 44478d4eaddc
Revises: 8891c11a4e0a
Create Date: 2026-10-26 12:58:23.115772

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44478d4eaddc'
down_revision: Union[str, Sequence[str], None] = '8891c11a4e0a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-006.9 : documents deposes sur Zeko, reconnus puis places au bon endroit apres un oui."""
    from sqlalchemy.dialects.postgresql import UUID, JSONB
    op.create_table(
        "zeko_drops",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(500), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False, index=True),
        sa.Column("size", sa.Integer, nullable=False, server_default="0"),
        sa.Column("origin", sa.String(500)),
        sa.Column("context", sa.Text),
        sa.Column("page_company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL")),
        sa.Column("page_contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending", index=True),
        sa.Column("text", sa.Text),
        sa.Column("analysis", JSONB),
        sa.Column("rejected", JSONB, nullable=False, server_default="[]"),
        sa.Column("instruction", sa.Text),
        sa.Column("result", JSONB),
        sa.Column("error", sa.String(500)),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL"), index=True),
        sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("zeko_drops")
