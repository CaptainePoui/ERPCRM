"""portal_link_contact -- le compte portail lit le courriel et le nom de la fiche contact, plus de copie (TASK-014.2)

Revision ID: aa1fdaf3780b
Revises: 573fc8c0b97a
Create Date: 2026-10-09 13:07:36.365954

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa1fdaf3780b'
down_revision: Union[str, Sequence[str], None] = '573fc8c0b97a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # aucun compte portail sans fiche contact (verifie le 2026-10-09 : 0 compte portail en tout)
    n = op.get_bind().execute(sa.text("SELECT count(*) FROM portal_users WHERE contact_id IS NULL")).scalar()
    if n:
        raise RuntimeError(f"{n} compte(s) portail sans fiche contact : les relier a une fiche avant cette migration")
    op.alter_column("portal_users", "contact_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=False)
    op.drop_constraint("portal_users_email_key", "portal_users", type_="unique")
    op.drop_column("portal_users", "email")
    op.drop_column("portal_users", "full_name")


def downgrade() -> None:
    op.add_column("portal_users", sa.Column("full_name", sa.String(255), nullable=True))
    op.add_column("portal_users", sa.Column("email", sa.String(255), nullable=True))
    op.execute("""UPDATE portal_users p SET email = c.email, full_name = trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,''))
                  FROM contacts c WHERE c.id = p.contact_id""")
    op.execute("UPDATE portal_users SET email = id::text WHERE email IS NULL")
    op.alter_column("portal_users", "email", nullable=False)
    op.alter_column("portal_users", "full_name", nullable=False)
    op.create_unique_constraint("portal_users_email_key", "portal_users", ["email"])
    op.alter_column("portal_users", "contact_id", existing_type=sa.dialects.postgresql.UUID(as_uuid=True), nullable=True)
