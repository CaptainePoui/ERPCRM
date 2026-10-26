"""zeko projets et client des conversations

Revision ID: 8891c11a4e0a
Revises: 410d75c2cae7
Create Date: 2026-10-26 11:55:19.538944

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8891c11a4e0a'
down_revision: Union[str, Sequence[str], None] = '410d75c2cae7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-006.8 : projets pour classer ses conversations avec Zeko ; conversation rattachee a un client."""
    from sqlalchemy.dialects.postgresql import UUID
    op.create_table(
        "zeko_projects",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.add_column("zeko_conversations", sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("zeko_projects.id", ondelete="SET NULL"), nullable=True))
    op.add_column("zeko_conversations", sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("zeko_conversations", sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_zeko_conversations_project_id", "zeko_conversations", ["project_id"])
    op.create_index("ix_zeko_conversations_company_id", "zeko_conversations", ["company_id"])
    op.create_index("ix_zeko_conversations_contact_id", "zeko_conversations", ["contact_id"])


def downgrade() -> None:
    op.drop_index("ix_zeko_conversations_contact_id", "zeko_conversations")
    op.drop_index("ix_zeko_conversations_company_id", "zeko_conversations")
    op.drop_index("ix_zeko_conversations_project_id", "zeko_conversations")
    op.drop_column("zeko_conversations", "contact_id")
    op.drop_column("zeko_conversations", "company_id")
    op.drop_column("zeko_conversations", "project_id")
    op.drop_table("zeko_projects")
