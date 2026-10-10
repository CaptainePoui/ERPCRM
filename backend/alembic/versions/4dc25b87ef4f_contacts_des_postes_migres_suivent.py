"""contacts des postes migres suivent

TASK-051 (2026-10-10, Philippe : « bien oui ils doivent suivre, c'est les postes, les contacts ») : les contacts des postes
100-103 migres de T1001 (Simple IP inc.) vers T1000 (Compagnie test) le 2026-10-10 passent a Compagnie test (le lien
avec Simple IP inc. devient le lien avec Compagnie test). Les prochaines migrations le font d'elles-memes.

Revision ID: 4dc25b87ef4f
Revises: 770786fe22ba
Create Date: 2026-10-10 23:24:02.186616

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4dc25b87ef4f'
down_revision: Union[str, Sequence[str], None] = '770786fe22ba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


CONTACTS = ("84cd6ff4-3398-4095-a061-210f822f6582", "e60df3bf-39f0-44e7-8baf-0dded7324726",
            "6e6e5517-a59c-47f3-b825-25d6f9093171", "4bab1ac2-a828-44e1-9de2-fd6e3799709b")


def _ids(conn):
    src = conn.execute(sa.text("SELECT id FROM companies WHERE name = 'Simple IP inc.'")).scalar()
    dst = conn.execute(sa.text("SELECT id FROM companies WHERE name = 'Compagnie test'")).scalar()
    return src, dst


def upgrade() -> None:
    conn = op.get_bind()
    src, dst = _ids(conn)
    if not src or not dst:
        return
    conn.execute(sa.text("UPDATE contact_companies SET company_id = :d WHERE company_id = :s AND contact_id = ANY(CAST(:c AS uuid[])) "
                         "AND NOT EXISTS (SELECT 1 FROM contact_companies x WHERE x.contact_id = contact_companies.contact_id AND x.company_id = :d)"),
                 {"d": dst, "s": src, "c": list(CONTACTS)})
    conn.execute(sa.text("INSERT INTO entity_logs (id, entity_id, action, description, created_at, source) "
                         "VALUES (gen_random_uuid(), :d, 'contact_linked', :t, now(), 'automatique'), "
                         "(gen_random_uuid(), :s, 'contact_unlinked', :u, now(), 'automatique')"),
                 {"d": dst, "s": src, "t": "Contacts Test Un, Test Deux, Test Trois, Test SIPV liés (suivent leurs postes 100-103, migration du 2026-10-10)",
                  "u": "Contacts Test Un, Test Deux, Test Trois, Test SIPV retirés (suivent leurs postes vers Compagnie test)"})


def downgrade() -> None:
    conn = op.get_bind()
    src, dst = _ids(conn)
    if src and dst:
        conn.execute(sa.text("UPDATE contact_companies SET company_id = :s WHERE company_id = :d AND contact_id = ANY(CAST(:c AS uuid[]))"),
                     {"d": dst, "s": src, "c": list(CONTACTS)})
