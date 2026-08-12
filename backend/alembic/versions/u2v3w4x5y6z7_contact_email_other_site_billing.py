"""Contact gagne email_other (meme pattern que phone_other) ; CompanySite
remplace billing_contact_name (texte libre) par billing_contact_id (FK reelle
vers un Contact) -- evite les doublons de personnes.

Revision ID: u2v3w4x5y6z7
Revises: t1u2v3w4x5y6
Create Date: 2026-08-05
"""
from typing import Union, Sequence
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = 'u2v3w4x5y6z7'
down_revision: Union[str, Sequence[str], None] = 't1u2v3w4x5y6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contacts', sa.Column('email_other', sa.String(255), nullable=True))
    op.add_column('company_sites', sa.Column('billing_contact_id', UUID(as_uuid=True), sa.ForeignKey('contacts.id', ondelete='SET NULL'), nullable=True))
    op.drop_column('company_sites', 'billing_contact_name')


def downgrade() -> None:
    op.add_column('company_sites', sa.Column('billing_contact_name', sa.String(150), nullable=True))
    op.drop_column('company_sites', 'billing_contact_id')
    op.drop_column('contacts', 'email_other')
