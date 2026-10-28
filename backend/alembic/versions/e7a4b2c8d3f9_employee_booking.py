"""employe : prise de RDV en ligne (reservable, marges, agendas)

Revision ID: e7a4b2c8d3f9
Revises: d5e2a7c9f1b8
Create Date: 2026-10-27 16:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = 'e7a4b2c8d3f9'
down_revision: Union[str, Sequence[str], None] = 'd5e2a7c9f1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """TASK-026.11 : choix du technicien sur la page de prise de RDV."""
    op.add_column("employees", sa.Column("booking_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("employees", sa.Column("booking_name", sa.String(100)))
    op.add_column("employees", sa.Column("buffer_before", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("employees", sa.Column("buffer_after", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("employees", sa.Column("busy_calendars", ARRAY(sa.String(255)), nullable=False, server_default="{}"))


def downgrade() -> None:
    for c in ("busy_calendars", "buffer_after", "buffer_before", "booking_name", "booking_enabled"):
        op.drop_column("employees", c)
