"""privileges des employes (TASK-007.4)

Revision ID: 410d75c2cae7
Revises: a122cd1ef23c
Create Date: 2026-10-25 14:24:32.899591

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '410d75c2cae7'
down_revision: Union[str, Sequence[str], None] = 'a122cd1ef23c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects import postgresql

# Profils de depart (TASK-007.4, 2026-10-25) : modifiables ensuite dans Administration > Privileges (sauf « Tout »)
COMPTABLE = {"clients": "voir", "ventes": "modifier", "achats": "modifier", "banque": "modifier", "fiscalite": "modifier",
             "agenda": "modifier", "zeko": "modifier"}
TECHNICIEN = {"clients": "modifier", "acces_clients": "voir", "telephonie": "modifier", "tickets": "modifier",
              "courriels": "modifier", "catalogue": "voir", "commandes": "voir", "agenda": "modifier", "zeko": "modifier"}


def upgrade() -> None:
    op.create_table(
        "privilege_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("full_access", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("grants", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.add_column("users", sa.Column("privilege_profile_id", postgresql.UUID(as_uuid=True),
                                     sa.ForeignKey("privilege_profiles.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("privilege_overrides", postgresql.JSONB(), nullable=False, server_default="{}"))
    import json, uuid
    tout = str(uuid.uuid4())
    t = sa.table("privilege_profiles", sa.column("id", postgresql.UUID), sa.column("name", sa.String),
                 sa.column("full_access", sa.Boolean), sa.column("grants", postgresql.JSONB))
    op.bulk_insert(t, [
        {"id": tout, "name": "Tout", "full_access": True, "grants": {}},
        {"id": str(uuid.uuid4()), "name": "Comptable", "full_access": False, "grants": COMPTABLE},
        {"id": str(uuid.uuid4()), "name": "Technicien", "full_access": False, "grants": TECHNICIEN},
    ])
    op.execute(sa.text("UPDATE users SET privilege_profile_id = :p WHERE role = 'admin'").bindparams(p=tout))


def downgrade() -> None:
    op.drop_column("users", "privilege_overrides")
    op.drop_column("users", "privilege_profile_id")
    op.drop_table("privilege_profiles")
