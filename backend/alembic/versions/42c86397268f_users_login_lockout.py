"""users login lockout : blocage après des mauvais mots de passe (TASK-001.1)

Revision ID: 42c86397268f
Revises: d1cfafc16430
Create Date: 2026-11-01 19:43:40.385766

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '42c86397268f'
down_revision: Union[str, Sequence[str], None] = 'd1cfafc16430'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("failed_logins", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("lock_step", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("banned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for c in ("banned_at", "locked_until", "lock_step", "failed_logins"):
        op.drop_column("users", c)
