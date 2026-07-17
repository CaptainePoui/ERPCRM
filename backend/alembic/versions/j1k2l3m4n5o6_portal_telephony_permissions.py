"""add telephony permission fields to portal_users (TASK-017 / TASKSIPV S027)

Revision ID: j1k2l3m4n5o6
Revises: i0j1k2l3m4n5
Create Date: 2026-07-17
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'j1k2l3m4n5o6'
down_revision: Union[str, Sequence[str], None] = 'i0j1k2l3m4n5'
branch_labels = None
depends_on = None

COLUMNS = [
    "can_view_own_extension", "can_edit_extension_name", "can_edit_call_forward",
    "can_edit_dnd", "can_edit_voicemail", "can_view_own_cdr", "can_view_voicemail_messages",
    "can_receive_alerts", "can_manage_telephony", "can_manage_ivr", "can_manage_groups",
    "can_manage_audio_prompts", "can_view_company_cdr",
]


def upgrade() -> None:
    for col in COLUMNS:
        op.add_column('portal_users', sa.Column(col, sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    for col in COLUMNS:
        op.drop_column('portal_users', col)
