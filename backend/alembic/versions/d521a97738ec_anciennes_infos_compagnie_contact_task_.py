"""anciennes infos compagnie contact TASK-002.8

Revision ID: d521a97738ec
Revises: 306b54677bf7
Create Date: 2026-10-23 13:56:28.165959

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd521a97738ec'
down_revision: Union[str, Sequence[str], None] = '306b54677bf7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'former_infos',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('entity_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('value', sa.String(length=255), nullable=False),
        sa.Column('valid_from', sa.Date(), nullable=True),
        sa.Column('valid_to', sa.Date(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['entity_id'], ['entities.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_former_infos_entity_id', 'former_infos', ['entity_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_former_infos_entity_id', table_name='former_infos')
    op.drop_table('former_infos')
