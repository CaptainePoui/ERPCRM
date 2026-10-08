"""employee email signature and user link

Revision ID: cc4ad27cbd32
Revises: 8e756bdf15d8
Create Date: 2026-10-08 17:45:26.848400

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cc4ad27cbd32'
down_revision: Union[str, Sequence[str], None] = '8e756bdf15d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Signature des courriels de communication par employe (TASK-007.1)."""
    op.add_column("employees", sa.Column("user_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_employees_user_id", "employees", "users", ["user_id"], ["id"], ondelete="SET NULL")
    op.create_unique_constraint("uq_employees_user_id", "employees", ["user_id"])
    op.add_column("employees", sa.Column("email_signature", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("employees", "email_signature")
    op.drop_constraint("uq_employees_user_id", "employees", type_="unique")
    op.drop_constraint("fk_employees_user_id", "employees", type_="foreignkey")
    op.drop_column("employees", "user_id")
