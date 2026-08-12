"""DID.schedule_id -- lien vers un Schedule SIPV (Time Condition), pas de FK
locale (Schedule vit seulement cote SIPV, simple proxy).

Revision ID: y6z7a8b9c0d1
Revises: x5y6z7a8b9c0
Create Date: 2026-08-06
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'y6z7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'x5y6z7a8b9c0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dids', sa.Column('schedule_id', UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column('dids', 'schedule_id')
