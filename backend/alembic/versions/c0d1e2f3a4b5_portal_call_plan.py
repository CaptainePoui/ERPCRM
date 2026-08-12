"""TASK-S056 : PortalUser.can_edit_call_plan -- permission "Plan d'appel"
(Canada/US/international/numéros payants) dans le portail Mon poste, demande
Philippe 2026-08-07.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-08-07
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'c0d1e2f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('portal_users', sa.Column('can_edit_call_plan', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('portal_users', 'can_edit_call_plan')
