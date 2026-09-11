"""portal user audio permissions

Revision ID: 9ea99349c01f
Revises: 910b7c27fa10
Create Date: 2026-09-11 15:06:39.671048

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9ea99349c01f'
down_revision: Union[str, Sequence[str], None] = '910b7c27fa10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('portal_users', sa.Column('can_listen_audio_prompts', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('portal_users', sa.Column('can_generate_voice_prompts', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column('portal_users', 'can_listen_audio_prompts', server_default=None)
    op.alter_column('portal_users', 'can_generate_voice_prompts', server_default=None)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('portal_users', 'can_generate_voice_prompts')
    op.drop_column('portal_users', 'can_listen_audio_prompts')
