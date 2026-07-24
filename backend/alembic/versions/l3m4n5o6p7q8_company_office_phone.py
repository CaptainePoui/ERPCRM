"""add office_phone to companies and contact_id to entity_logs

Revision ID: l3m4n5o6p7q8
Revises: k2l3m4n5o6p7
Create Date: 2026-07-22
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'l3m4n5o6p7q8'
down_revision: Union[str, Sequence[str], None] = 'k2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('office_phone', sa.String(length=50), nullable=True))
    op.add_column('entity_logs', sa.Column('contact_id', UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'entity_logs_contact_id_fkey', 'entity_logs', 'contacts',
        ['contact_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('entity_logs_contact_id_fkey', 'entity_logs', type_='foreignkey')
    op.drop_column('entity_logs', 'contact_id')
    op.drop_column('companies', 'office_phone')
