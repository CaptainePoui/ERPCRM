"""TASK-002.18 (GO de Philippe 2026-11-02) : spécialisations des contacts = les fonctions ; pastilles = type de compagnie

1. functions : color, contact_tabs (onglets que la spécialisation apporte sur la fiche contact) ; ajout « associé », « autre » ;
   onglets de départ : responsable telephonie, responsable 911, technique -> Téléphonie, Provisionnement, Courriels ;
   les autres -> Courriels.
2. Pastilles des contacts converties : IT -> fonction « TI », Reseaux -> fonction « reseau », chez chaque compagnie
   active du contact ; les pastilles de type de compagnie (client, fournisseur…) retirées des contacts ; « vendeur »
   reste la seule pastille de contact.
3. statuses : type de compagnie -> offert aux compagnies seulement ; IT et Reseaux désactivées (jamais supprimées) ;
   statuses.contact_tabs vidés sauf vendeur (les onglets du contact viennent des spécialisations).

Revision ID: e4b7c9d1f2a3
Revises: d2f6a8c0e1b9
Create Date: 2026-11-02
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e4b7c9d1f2a3"
down_revision = "d2f6a8c0e1b9"
branch_labels = None
depends_on = None

COLORS = {"TI": "#2563EB", "reseau": "#059669", "technique": "#0891B2", "facturation": "#D97706", "comptes payables": "#B45309",
          "comptes a recevoir": "#CA8A04", "reception": "#DB2777", "proprietaire": "#7C3AED", "associé": "#9333EA",
          "direction": "#4F46E5", "administration": "#64748B", "gestionnaire": "#0F766E", "achats": "#EA580C",
          "securite": "#DC2626", "responsable telephonie": "#0284C7", "responsable 911": "#B91C1C",
          "responsable informatique": "#1D4ED8", "autre": "#6B7280"}
PHONE = ("responsable telephonie", "responsable 911", "technique")


def upgrade() -> None:
    op.add_column("functions", sa.Column("color", sa.String(7)))
    op.add_column("functions", sa.Column("contact_tabs", postgresql.JSONB(), nullable=False, server_default="[]"))
    conn = op.get_bind()
    for name in ("associé", "autre"):
        if not conn.execute(sa.text("SELECT 1 FROM functions WHERE lower(name) = lower(:n)"), {"n": name}).first():
            conn.execute(sa.text("INSERT INTO functions (id, name, is_active) VALUES (:i, :n, true)"), {"i": uuid.uuid4(), "n": name})
    for name, color in COLORS.items():
        conn.execute(sa.text("UPDATE functions SET color = :c WHERE name = :n"), {"c": color, "n": name})
    conn.execute(sa.text("""UPDATE functions SET contact_tabs = CASE WHEN name = ANY(:p)
                                THEN '["telephonie", "provisionnement", "courriels"]'::jsonb ELSE '["courriels"]'::jsonb END"""),
                 {"p": list(PHONE)})
    # 2. pastilles IT / Reseaux des contacts -> fonctions TI / reseau chez leurs compagnies actives
    for status, fn in (("it", "TI"), ("reseaux", "reseau")):
        conn.execute(sa.text("""
            INSERT INTO contact_company_functions (contact_company_id, function_id)
            SELECT cc.id, f.id FROM entity_statuses es
              JOIN statuses s ON s.id = es.status_id AND lower(s.name) = :s
              JOIN contacts ct ON ct.id = es.entity_id
              JOIN contact_companies cc ON cc.contact_id = ct.id AND cc.is_active IS NOT FALSE
              JOIN functions f ON f.name = :f
            ON CONFLICT DO NOTHING"""), {"s": status, "f": fn})
    conn.execute(sa.text("""
        DELETE FROM entity_statuses es USING statuses s, contacts ct
         WHERE s.id = es.status_id AND ct.id = es.entity_id AND lower(s.name) <> 'vendeur'"""))
    # 3. pastilles : type de compagnie seulement ; IT et Reseaux désactivées
    conn.execute(sa.text("UPDATE statuses SET is_active = false, applies_to = 'contacts' WHERE lower(name) IN ('it', 'reseaux')"))
    conn.execute(sa.text("UPDATE statuses SET applies_to = 'companies' WHERE lower(name) NOT IN ('it', 'reseaux', 'vendeur')"))
    conn.execute(sa.text("UPDATE statuses SET contact_tabs = '[]'::jsonb WHERE lower(name) <> 'vendeur'"))


def downgrade() -> None:
    # Les pastilles retirées des contacts ne reviennent pas (les fonctions converties restent) ; seules les colonnes partent.
    op.drop_column("functions", "contact_tabs")
    op.drop_column("functions", "color")
