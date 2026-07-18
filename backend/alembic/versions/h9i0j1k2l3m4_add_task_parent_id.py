"""add task parent_task_id for subtasks

Revision ID: h9i0j1k2l3m4
Revises: g8h9i0j1k2l3
Create Date: 2026-07-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'h9i0j1k2l3m4'
down_revision = 'g8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('tasks', sa.Column(
        'parent_task_id',
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey('tasks.id', ondelete='SET NULL'),
        nullable=True,
    ))


def downgrade() -> None:
    op.drop_column('tasks', 'parent_task_id')
