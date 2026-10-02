"""devis : Float -> Numeric + taxe par ligne

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-10-02

TASK-025.1 : aligne les devis sur les factures (TASK-005.3 / 005.9). 0 devis en base a la migration.
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a6b7c8d9e0f1'
branch_labels = None
depends_on = None

COLS = [
    ('devis', 'tps_rate', 7, 4), ('devis', 'tvq_rate', 7, 4), ('devis', 'subtotal', 14, 2),
    ('devis', 'tps_amount', 14, 2), ('devis', 'tvq_amount', 14, 2), ('devis', 'total', 14, 2),
    ('devis_lines', 'qty', 12, 4), ('devis_lines', 'unit_price', 14, 2), ('devis_lines', 'line_total', 14, 2),
]


def upgrade() -> None:
    for t, c, p, sc in COLS:
        op.alter_column(t, c, existing_type=sa.Float(), type_=sa.Numeric(p, sc), postgresql_using=f'{c}::numeric({p},{sc})')
    op.add_column('devis_lines', sa.Column('is_taxable', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('devis_lines', 'is_taxable')
    for t, c, p, sc in COLS:
        op.alter_column(t, c, existing_type=sa.Numeric(p, sc), type_=sa.Float())
