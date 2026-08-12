"""DID : did_type retire, status (actif/inactif/en_transit) remplace par
is_active (bool) -- simplification demandee par Philippe (2026-08-06), le
portage n'a pas besoin d'un 3e etat.

Revision ID: z7a8b9c0d1e2
Revises: y6z7a8b9c0d1
Create Date: 2026-08-06
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'z7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'y6z7a8b9c0d1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('dids', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.execute("UPDATE dids SET is_active = false WHERE status != 'actif'")
    op.drop_column('dids', 'status')
    op.drop_column('dids', 'did_type')


def downgrade() -> None:
    op.add_column('dids', sa.Column('did_type', sa.String(20), nullable=False, server_default='did'))
    op.add_column('dids', sa.Column('status', sa.String(20), nullable=False, server_default='actif'))
    op.execute("UPDATE dids SET status = CASE WHEN is_active THEN 'actif' ELSE 'inactif' END")
    op.drop_column('dids', 'is_active')
