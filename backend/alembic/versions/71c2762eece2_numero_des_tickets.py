"""numero des tickets

Revision ID: 71c2762eece2
Revises: 878b235ae53d
Create Date: 2026-10-18 20:29:38.660661

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '71c2762eece2'
down_revision: Union[str, Sequence[str], None] = '878b235ae53d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 2026-10-18, Philippe : « dans numérotation des documents on va ajouter ticket, on va commencer à 11000, prochain 11001 ».
# Les tickets existants recoivent 11000, 11001… dans l'ordre de creation ; le compteur « ticket » continue apres.


def upgrade() -> None:
    op.add_column("tickets", sa.Column("number", sa.String(30), nullable=True))
    op.create_index("ix_tickets_number", "tickets", ["number"], unique=True)
    op.execute("""
        UPDATE tickets t SET number = (10999 + r.n)::text
        FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM tickets) r
        WHERE r.id = t.id
    """)
    op.execute("""
        INSERT INTO document_counters (key, prefix, next_value, padding, updated_at)
        VALUES ('ticket', '', 11000 + (SELECT count(*) FROM tickets), 0, now())
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM document_counters WHERE key = 'ticket'")
    op.drop_index("ix_tickets_number", table_name="tickets")
    op.drop_column("tickets", "number")
