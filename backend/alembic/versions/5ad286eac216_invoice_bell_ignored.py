"""cloche : une facture en retard peut etre ignoree dans la cloche (TASK-047.6)

Revision ID: 5ad286eac216
Revises: 9708c961763c
Create Date: 2026-11-01 15:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '5ad286eac216'
down_revision: Union[str, Sequence[str], None] = '9708c961763c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Vide = la cloche en parle tant qu'elle est en retard ; rempli = ignoree (qui et quand). La facture reste « en retard »."""
    op.add_column("invoices", sa.Column("bell_ignored_at", sa.DateTime(timezone=True)))
    op.add_column("invoices", sa.Column("bell_ignored_by", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")))


def downgrade() -> None:
    op.drop_column("invoices", "bell_ignored_by")
    op.drop_column("invoices", "bell_ignored_at")
