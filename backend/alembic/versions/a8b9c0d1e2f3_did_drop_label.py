"""DID.label retire -- fusionne dans notes avant suppression pour ne rien
perdre (demande Philippe 2026-08-06, "on a description" = notes suffit).

Revision ID: a8b9c0d1e2f3
Revises: z7a8b9c0d1e2
Create Date: 2026-08-06
"""
from typing import Union, Sequence
from alembic import op

revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'z7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        UPDATE dids SET notes = CASE
            WHEN notes IS NULL OR notes = '' THEN label
            ELSE notes || ' | ' || label
        END
        WHERE label IS NOT NULL AND label != ''
    """)
    op.drop_column('dids', 'label')


def downgrade() -> None:
    import sqlalchemy as sa
    op.add_column('dids', sa.Column('label', sa.String(100), nullable=True))
