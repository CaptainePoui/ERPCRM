"""Suivi d'ouverture de courriel (pixel invisible) -- table email_opens

Revision ID: p7q8r9s0t1u2
Revises: o6p7q8r9s0t1
Create Date: 2026-07-31
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'p7q8r9s0t1u2'
down_revision: Union[str, Sequence[str], None] = 'o6p7q8r9s0t1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'email_opens',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('entity_type', sa.String(20), nullable=False),
        sa.Column('entity_id', UUID(as_uuid=True), nullable=False),
        sa.Column('opened_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )
    op.create_index('ix_email_opens_entity', 'email_opens', ['entity_type', 'entity_id'])


def downgrade() -> None:
    op.drop_index('ix_email_opens_entity', table_name='email_opens')
    op.drop_table('email_opens')
