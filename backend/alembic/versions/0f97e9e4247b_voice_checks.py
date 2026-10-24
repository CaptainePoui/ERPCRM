"""voice checks

Revision ID: 0f97e9e4247b
Revises: 6b0131087178
Create Date: 2026-10-24 11:17:06.697654

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '0f97e9e4247b'
down_revision: Union[str, Sequence[str], None] = '6b0131087178'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('voice_checks',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('voice_print_id', sa.UUID(), nullable=False),
    sa.Column('line', sa.Integer(), nullable=True),
    sa.Column('status', sa.String(length=15), nullable=False),
    sa.Column('suffix', sa.String(length=10), nullable=False),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['voice_print_id'], ['voice_prints.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_voice_checks_voice_print_id'), 'voice_checks', ['voice_print_id'], unique=False)
    op.add_column('voice_prints', sa.Column('check_lines', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('voice_prints', 'check_lines')
    op.drop_index(op.f('ix_voice_checks_voice_print_id'), table_name='voice_checks')
    op.drop_table('voice_checks')
