"""monetary Float to Numeric for exact decimal arithmetic

Revision ID: a0b1c2d3e4f5
Revises: 9ea99349c01f
Create Date: 2026-09-29

TASK-005.3 (ex TASK-040, renumerote 2026-10-01) : Float -> Numeric sur invoices, invoice_lines, payments, payment_methods.
- Montants (subtotal, tps_amount, tvq_amount, total, unit_price, line_total,
  amount, discount_amount, net_amount) : NUMERIC(14, 2)
- Taux (tps_rate, tvq_rate, discount_rate) : NUMERIC(7, 4)
- Quantites (qty) : NUMERIC(12, 4)
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'a0b1c2d3e4f5'
down_revision: Union[str, Sequence[str], None] = '9ea99349c01f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('invoices', 'tps_rate',
        existing_type=sa.Float(), type_=sa.Numeric(7, 4),
        postgresql_using='tps_rate::numeric(7,4)')
    op.alter_column('invoices', 'tvq_rate',
        existing_type=sa.Float(), type_=sa.Numeric(7, 4),
        postgresql_using='tvq_rate::numeric(7,4)')
    op.alter_column('invoices', 'subtotal',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='subtotal::numeric(14,2)')
    op.alter_column('invoices', 'tps_amount',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='tps_amount::numeric(14,2)')
    op.alter_column('invoices', 'tvq_amount',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='tvq_amount::numeric(14,2)')
    op.alter_column('invoices', 'total',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='total::numeric(14,2)')

    op.alter_column('invoice_lines', 'qty',
        existing_type=sa.Float(), type_=sa.Numeric(12, 4),
        postgresql_using='qty::numeric(12,4)')
    op.alter_column('invoice_lines', 'unit_price',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='unit_price::numeric(14,2)')
    op.alter_column('invoice_lines', 'line_total',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='line_total::numeric(14,2)')

    op.alter_column('payments', 'amount',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='amount::numeric(14,2)')
    op.alter_column('payments', 'discount_rate',
        existing_type=sa.Float(), type_=sa.Numeric(7, 4),
        postgresql_using='discount_rate::numeric(7,4)')
    op.alter_column('payments', 'discount_amount',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='discount_amount::numeric(14,2)')
    op.alter_column('payments', 'net_amount',
        existing_type=sa.Float(), type_=sa.Numeric(14, 2),
        postgresql_using='net_amount::numeric(14,2)')

    op.alter_column('payment_methods', 'discount_rate',
        existing_type=sa.Float(), type_=sa.Numeric(7, 4),
        postgresql_using='discount_rate::numeric(7,4)')


def downgrade() -> None:
    op.alter_column('invoices', 'tps_rate', existing_type=sa.Numeric(7, 4), type_=sa.Float())
    op.alter_column('invoices', 'tvq_rate', existing_type=sa.Numeric(7, 4), type_=sa.Float())
    op.alter_column('invoices', 'subtotal', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('invoices', 'tps_amount', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('invoices', 'tvq_amount', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('invoices', 'total', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('invoice_lines', 'qty', existing_type=sa.Numeric(12, 4), type_=sa.Float())
    op.alter_column('invoice_lines', 'unit_price', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('invoice_lines', 'line_total', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('payments', 'amount', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('payments', 'discount_rate', existing_type=sa.Numeric(7, 4), type_=sa.Float())
    op.alter_column('payments', 'discount_amount', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('payments', 'net_amount', existing_type=sa.Numeric(14, 2), type_=sa.Float())
    op.alter_column('payment_methods', 'discount_rate', existing_type=sa.Numeric(7, 4), type_=sa.Float())
