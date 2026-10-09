"""mail inbox

Revision ID: a0edb228d9ba
Revises: f8c36063abbc
Create Date: 2026-10-09 06:54:21.548885

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a0edb228d9ba'
down_revision: Union[str, Sequence[str], None] = 'f8c36063abbc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Boite de reception dans ERPCRM (TASK-047.2) : type de boite + copie des courriels recus."""
    op.add_column('mailboxes', sa.Column('kind', sa.String(length=20), server_default='shared', nullable=False))
    op.add_column('mailboxes', sa.Column('owner_user_id', sa.UUID(), nullable=True))
    op.add_column('mailboxes', sa.Column('sync_since', sa.Date(), nullable=True))
    op.add_column('mailboxes', sa.Column('uidvalidity', sa.BigInteger(), nullable=True))
    op.add_column('mailboxes', sa.Column('last_uid', sa.BigInteger(), server_default='0', nullable=False))
    op.add_column('mailboxes', sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('mailboxes', sa.Column('sync_error', sa.Text(), nullable=True))
    op.create_foreign_key('mailboxes_owner_user_id_fkey', 'mailboxes', 'users', ['owner_user_id'], ['id'], ondelete='SET NULL')
    op.create_table('mail_messages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('mailbox_id', sa.UUID(), nullable=False),
    sa.Column('uidvalidity', sa.BigInteger(), nullable=False),
    sa.Column('uid', sa.BigInteger(), nullable=False),
    sa.Column('message_id', sa.String(length=500), nullable=True),
    sa.Column('in_reply_to', sa.String(length=500), nullable=True),
    sa.Column('from_email', sa.String(length=255), nullable=True),
    sa.Column('from_name', sa.String(length=255), nullable=True),
    sa.Column('to_addrs', sa.Text(), nullable=True),
    sa.Column('cc_addrs', sa.Text(), nullable=True),
    sa.Column('subject', sa.String(length=1000), nullable=True),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('body_text', sa.Text(), nullable=True),
    sa.Column('body_html', sa.Text(), nullable=True),
    sa.Column('attachments', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
    sa.Column('stored_path', sa.String(length=500), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=False),
    sa.Column('flag_pending', sa.Boolean(), nullable=False),
    sa.Column('company_id', sa.UUID(), nullable=True),
    sa.Column('contact_id', sa.UUID(), nullable=True),
    sa.Column('classified_by', sa.String(length=10), nullable=True),
    sa.Column('contact_created', sa.Boolean(), nullable=False),
    sa.Column('signature_status', sa.String(length=10), nullable=True),
    sa.Column('shared', sa.Boolean(), nullable=False),
    sa.Column('ticket_id', sa.UUID(), nullable=True),
    sa.Column('task_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['mailbox_id'], ['mailboxes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['contact_id'], ['contacts.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('mailbox_id', 'uidvalidity', 'uid')
    )
    op.create_index('ix_mail_messages_from_email', 'mail_messages', ['from_email'])
    op.create_index(op.f('ix_mail_messages_mailbox_id'), 'mail_messages', ['mailbox_id'])
    op.create_index(op.f('ix_mail_messages_sent_at'), 'mail_messages', ['sent_at'])
    op.create_index(op.f('ix_mail_messages_company_id'), 'mail_messages', ['company_id'])
    op.create_index(op.f('ix_mail_messages_contact_id'), 'mail_messages', ['contact_id'])


def downgrade() -> None:
    op.drop_table('mail_messages')
    op.drop_constraint('mailboxes_owner_user_id_fkey', 'mailboxes', type_='foreignkey')
    for c in ('sync_error', 'last_sync_at', 'last_uid', 'uidvalidity', 'sync_since', 'owner_user_id', 'kind'):
        op.drop_column('mailboxes', c)
