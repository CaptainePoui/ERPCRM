"""task_google_calendar_link

Revision ID: 15309e1f3718
Revises: 3792331071d9
Create Date: 2026-08-26 20:46:08.623699

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '15309e1f3718'
down_revision: Union[str, Sequence[str], None] = '3792331071d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Note : autogenerate avait aussi detecte la suppression de ix_appointments_start_at
    # et ix_email_opens_entity -- derive preexistante non liee a ce changement, retiree
    # volontairement de cette migration pour ne toucher que ce qui est demande.
    op.add_column('tasks', sa.Column('google_calendar_event_id', sa.String(length=255), nullable=True))
    op.add_column('tasks', sa.Column('google_calendar_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('tasks', 'google_calendar_id')
    op.drop_column('tasks', 'google_calendar_event_id')
