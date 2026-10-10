"""pastilles et internet reseau des compagnies

TASK-002.3 (2026-10-10) : qui fournit l'Internet d'un client et qui s'occupe de son reseau (une compagnie + un contact
prefere chacun, liens, jamais de copie) ; trois pastilles de depart de plus (sous-traitant, fournisseur internet,
reseau / informatique).

Revision ID: 2ed9dd39f015
Revises: f877151f6593
Create Date: 2026-10-10 09:40:17.671096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '2ed9dd39f015'
down_revision: Union[str, Sequence[str], None] = 'f877151f6593'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COLS = [("internet_company_id", "companies"), ("internet_contact_id", "contacts"),
        ("network_company_id", "companies"), ("network_contact_id", "contacts")]
NEW_STATUSES = [("sous-traitant", "#D97706"), ("fournisseur internet", "#0891B2"), ("réseau / informatique", "#059669")]


def upgrade() -> None:
    for col, target in COLS:
        op.add_column("companies", sa.Column(col, UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_companies_{col}", "companies", target, [col], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_companies_{col}", "companies", [col])
    conn = op.get_bind()
    for name, color in NEW_STATUSES:
        conn.execute(sa.text(
            "INSERT INTO statuses (id, name, color, is_system, is_active) "
            "SELECT gen_random_uuid(), :n, :c, false, true WHERE NOT EXISTS (SELECT 1 FROM statuses WHERE name = :n)"
        ), {"n": name, "c": color})


def downgrade() -> None:
    conn = op.get_bind()
    for name, _ in NEW_STATUSES:
        # seulement si personne ne la porte (jamais retirer une pastille d'une fiche)
        conn.execute(sa.text(
            "DELETE FROM statuses s WHERE s.name = :n AND NOT EXISTS (SELECT 1 FROM entity_statuses es WHERE es.status_id = s.id)"
        ), {"n": name})
    for col, _ in reversed(COLS):
        op.drop_index(f"ix_companies_{col}", "companies")
        op.drop_constraint(f"fk_companies_{col}", "companies", type_="foreignkey")
        op.drop_column("companies", col)
