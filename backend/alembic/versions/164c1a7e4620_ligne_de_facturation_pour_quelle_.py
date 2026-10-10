"""ligne de facturation pour quelle compagnie

TASK-002.4 (2026-10-10) : une ligne de facturation telephonique sait a quelle compagnie appartient le service (une
succursale dans le tenant de sa maison mere) ; elle va dans la recurrence de la compagnie facturee pour elle.

Revision ID: 164c1a7e4620
Revises: 77df140c3ac4
Create Date: 2026-10-10 11:44:45.962142

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '164c1a7e4620'
down_revision: Union[str, Sequence[str], None] = '77df140c3ac4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects.postgresql import UUID


def upgrade() -> None:
    op.add_column("recurring_billing_lines", sa.Column("for_company_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_recurring_billing_lines_for_company_id", "recurring_billing_lines", "companies",
                          ["for_company_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_recurring_billing_lines_for_company_id", "recurring_billing_lines", ["for_company_id"])


def downgrade() -> None:
    op.drop_index("ix_recurring_billing_lines_for_company_id", "recurring_billing_lines")
    op.drop_constraint("fk_recurring_billing_lines_for_company_id", "recurring_billing_lines", type_="foreignkey")
    op.drop_column("recurring_billing_lines", "for_company_id")
