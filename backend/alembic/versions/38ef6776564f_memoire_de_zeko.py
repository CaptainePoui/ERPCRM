"""memoire de zeko

Revision ID: 38ef6776564f
Revises: b63e91e5bf6b
Create Date: 2026-10-21 13:34:08.892203

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '38ef6776564f'
down_revision: Union[str, Sequence[str], None] = 'b63e91e5bf6b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-006.5 etape 3 (2026-10-21) : « Ce que Zeko a appris », retenu seulement apres le « oui » de l'utilisateur.
from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.create_table(
        "zeko_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(30), nullable=False, server_default="autre"),
        sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("sender_email", sa.String(255)),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("zeko_rules")
