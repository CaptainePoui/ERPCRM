"""conversations et voix TASK-055

Revision ID: 6b0131087178
Revises: 4b7e0a3ed055
Create Date: 2026-10-23 17:17:12.411476

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '6b0131087178'
down_revision: Union[str, Sequence[str], None] = '4b7e0a3ed055'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # TASK-055 etape 3 (2026-10-23) : seules les nouvelles tables (l'autogeneration voyait aussi des ecarts sans rapport)
    op.create_table('voice_prints',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('contact_id', sa.UUID(), nullable=True),
    sa.Column('embedding', postgresql.ARRAY(sa.Float()), nullable=False),
    sa.Column('samples', sa.Integer(), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('contact_id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('conversations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('ticket_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=15), nullable=False),
    sa.Column('mime', sa.String(length=50), nullable=False),
    sa.Column('duration', sa.Float(), nullable=True),
    sa.Column('text', sa.Text(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('last_chunk_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('transcribed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conversations_ticket_id'), 'conversations', ['ticket_id'], unique=False)
    op.create_table('conversation_segments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('conversation_id', sa.UUID(), nullable=False),
    sa.Column('idx', sa.Integer(), nullable=False),
    sa.Column('start', sa.Float(), nullable=False),
    sa.Column('end', sa.Float(), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('speaker', sa.String(length=100), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('contact_id', sa.UUID(), nullable=True),
    sa.Column('embedding', postgresql.ARRAY(sa.Float()), nullable=True),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['conversation_id'], ['conversations.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_conversation_segments_conversation_id'), 'conversation_segments', ['conversation_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_conversation_segments_conversation_id'), table_name='conversation_segments')
    op.drop_table('conversation_segments')
    op.drop_index(op.f('ix_conversations_ticket_id'), table_name='conversations')
    op.drop_table('conversations')
    op.drop_table('voice_prints')
