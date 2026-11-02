"""zeko_messages images (TASK-006.18)

Revision ID: 0588b5b4ff63
Revises: 42c86397268f
Create Date: 2026-11-01 22:41:35.112879

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0588b5b4ff63'
down_revision: Union[str, Sequence[str], None] = '42c86397268f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Images collees dans la conversation avec Zeko : noms des fichiers de storage/zeko_images."""
    from sqlalchemy.dialects.postgresql import JSONB
    op.add_column("zeko_messages", sa.Column("images", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("zeko_messages", "images")
