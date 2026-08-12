"""Extension.extension : 10 -> 20 caracteres -- une "ligne vendue" a le meme
numero que son DID (convention UCM de Philippe), pas juste un code court.

Revision ID: w4x5y6z7a8b9
Revises: v3w4x5y6z7a8
Create Date: 2026-08-06
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'w4x5y6z7a8b9'
down_revision: Union[str, Sequence[str], None] = 'v3w4x5y6z7a8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('extensions', 'extension', type_=sa.String(20), existing_type=sa.String(10))


def downgrade() -> None:
    op.alter_column('extensions', 'extension', type_=sa.String(10), existing_type=sa.String(20))
