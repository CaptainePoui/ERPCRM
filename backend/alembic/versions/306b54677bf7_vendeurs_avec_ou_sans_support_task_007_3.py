"""vendeurs avec ou sans support TASK-007.3

Revision ID: 306b54677bf7
Revises: 57ee8f97cbee
Create Date: 2026-10-23 11:36:27.563957

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '306b54677bf7'
down_revision: Union[str, Sequence[str], None] = '57ee8f97cbee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('companies', sa.Column('vendor_support', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('companies', sa.Column('vendor_rate', sa.Numeric(6, 3), nullable=True))
    op.add_column('sales_reps', sa.Column('referral_rate', sa.Numeric(6, 3), server_default='5', nullable=False))
    op.add_column('commission_entries', sa.Column('mode', sa.String(12), nullable=True))
    op.execute("update commission_entries set mode = 'support' where kind <> 'ajustement'")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('commission_entries', 'mode')
    op.drop_column('sales_reps', 'referral_rate')
    op.drop_column('companies', 'vendor_rate')
    op.drop_column('companies', 'vendor_support')
