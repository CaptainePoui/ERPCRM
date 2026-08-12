"""Module RDV en ligne -- table appointments (TASK-026)

Revision ID: r9s0t1u2v3w4
Revises: q8r9s0t1u2v3
Create Date: 2026-08-01
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'r9s0t1u2v3w4'
down_revision: Union[str, Sequence[str], None] = 'q8r9s0t1u2v3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'appointments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('type', sa.String(10), nullable=False),
        sa.Column('status', sa.String(10), nullable=False, server_default='confirme'),
        sa.Column('start_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('contact_id', UUID(as_uuid=True), sa.ForeignKey('contacts.id', ondelete='SET NULL'), nullable=True),
        sa.Column('company_id', UUID(as_uuid=True), sa.ForeignKey('companies.id', ondelete='SET NULL'), nullable=True),
        sa.Column('task_id', UUID(as_uuid=True), sa.ForeignKey('tasks.id', ondelete='SET NULL'), nullable=True),
        sa.Column('google_event_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_appointments_start_at', 'appointments', ['start_at'])


def downgrade() -> None:
    op.drop_index('ix_appointments_start_at', table_name='appointments')
    op.drop_table('appointments')
