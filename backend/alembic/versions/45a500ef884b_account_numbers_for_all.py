"""Un numero de compte (txxxx) pour toutes les compagnies (TASK-002.7, 2026-10-14). Philippe : « tous identifiés avec un
txxx, qu'ils soient hébergés ou pas ; ça devient le numéro de compte utilisé en tenant ; les filtres trouvent tout avec
txxx ». Les compagnies sans numero recoivent le suivant (reglage next_tenant_number, depart t1046), dans leur ordre de
creation ; le numero ne change plus jamais ; doublons interdits (index unique).

Revision ID: 45a500ef884b
Revises: 4dc25b87ef4f
Create Date: 2026-10-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '45a500ef884b'
down_revision: Union[str, Sequence[str], None] = '4dc25b87ef4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KEY = "next_tenant_number"


def upgrade() -> None:
    bind = op.get_bind()
    n = bind.execute(sa.text("SELECT value FROM app_settings WHERE key = :k"), {"k": KEY}).scalar()
    n = int(n) if n else 1046
    rows = bind.execute(sa.text("""SELECT c.id FROM companies c JOIN entities e ON e.id = c.id
                                   WHERE c.account_number IS NULL ORDER BY e.created_at, c.name""")).all()
    assigned = []
    for (cid,) in rows:
        bind.execute(sa.text("UPDATE companies SET account_number = :a WHERE id = :i"), {"a": f"t{n}", "i": cid})
        assigned.append(str(cid))
        n += 1
    if bind.execute(sa.text("SELECT 1 FROM app_settings WHERE key = :k"), {"k": KEY}).scalar():
        bind.execute(sa.text("UPDATE app_settings SET value = :v WHERE key = :k"), {"v": str(n), "k": KEY})
    else:
        bind.execute(sa.text("INSERT INTO app_settings (key, value, description) VALUES (:k, :v, :d)"),
                     {"k": KEY, "v": str(n), "d": "Prochain numero de compte auto-assigne (format t####)"})
    # memoire des numeros donnes ici, pour pouvoir les retirer au downgrade
    bind.execute(sa.text("CREATE TABLE IF NOT EXISTS _account_numbers_45a500 (company_id uuid PRIMARY KEY)"))
    for cid in assigned:
        bind.execute(sa.text("INSERT INTO _account_numbers_45a500 VALUES (:i)"), {"i": cid})
    op.create_index("uq_companies_account_number", "companies", ["account_number"], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("uq_companies_account_number", table_name="companies")
    count = bind.execute(sa.text("SELECT count(*) FROM _account_numbers_45a500")).scalar()
    bind.execute(sa.text("UPDATE companies SET account_number = NULL WHERE id IN (SELECT company_id FROM _account_numbers_45a500)"))
    bind.execute(sa.text("UPDATE app_settings SET value = (CAST(value AS integer) - :c)::text WHERE key = :k"), {"c": count, "k": KEY})
    bind.execute(sa.text("DROP TABLE _account_numbers_45a500"))
