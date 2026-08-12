"""TASK-023.32 : DID.after_message_destination_type/destination -- chainage
"Ajouter une destination" apres la lecture d'une phrase (destination_type ==
"message"), demande Philippe 2026-08-07 (nuit).

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-08-07
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = 'a8b9c0d1e2f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dids', sa.Column('after_message_destination_type', sa.String(20), nullable=True))
    op.add_column('dids', sa.Column('after_message_destination', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('dids', 'after_message_destination')
    op.drop_column('dids', 'after_message_destination_type')
