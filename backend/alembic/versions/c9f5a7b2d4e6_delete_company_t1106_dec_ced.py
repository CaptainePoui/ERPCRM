"""Supprimer la compagnie « Gouvernement (DEC/CED) » t1106 — demande explicite de Philippe (2026-11-02 : « Gouvernement
(DEC/CED) on supprime, pourquoi tu l'as désactivée… et pourquoi tu ne l'as pas seulement changée de nom !!! bon c'est fait
donc supprime-la »). Exception à la règle « jamais supprimer une compagnie » parce qu'il le demande.

Vérifié avant : désactivée depuis le 2026-10-28, rien n'y est rattaché (0 contact, courriel, ticket, tâche, facture ; seule
sa fiche et 4 lignes de journal, qui restent au journal, détachées : ON DELETE SET NULL). Garde-fou : ne supprime que si
c'est encore exactement cette fiche, désactivée, au numéro t1106.

Revision ID: c9f5a7b2d4e6
Revises: b8e4f6a1c3d5
Create Date: 2026-11-02
"""
from alembic import op
import sqlalchemy as sa

revision = "c9f5a7b2d4e6"
down_revision = "b8e4f6a1c3d5"
branch_labels = None
depends_on = None

CID = "2c7a5466-7df6-4743-a95d-029fcf58f093"


def upgrade() -> None:
    conn = op.get_bind()
    ok = conn.execute(sa.text("""SELECT 1 FROM companies WHERE id = :i AND account_number = 't1106'
                                  AND name = 'Gouvernement (DEC/CED)' AND is_active = false"""), {"i": CID}).first()
    if ok:
        conn.execute(sa.text("DELETE FROM entities WHERE id = :i"), {"i": CID})     # la fiche compagnie part avec (CASCADE)
        print("Gouvernement (DEC/CED) t1106 supprimée")
    else:
        print("Gouvernement (DEC/CED) t1106 : pas trouvée telle quelle, rien supprimé")


def downgrade() -> None:
    pass        # une suppression ne se recrée pas
