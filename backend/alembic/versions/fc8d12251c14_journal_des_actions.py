"""journal des actions (TASK-049) : entity_logs devient le journal de tout ERPCRM

Chaque ligne dit sur quel objet (object_type = table, object_id = sa cle), qui (user_id = employe, portal_user_id = client
du portail, aucun des deux = automatique / SIPV, selon source) ; entity_id reste rempli pour une fiche compagnie/contact
(onglet Journal existant). Une fiche supprimee ne supprime plus son journal (SET NULL au lieu de CASCADE).

Revision ID: fc8d12251c14
Revises: 52822cdce421
Create Date: 2026-10-09
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "fc8d12251c14"
down_revision = "52822cdce421"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entity_logs", sa.Column("object_type", sa.String(60), nullable=True))
    op.add_column("entity_logs", sa.Column("object_id", sa.String(100), nullable=True))
    op.add_column("entity_logs", sa.Column("portal_user_id", UUID(as_uuid=True), nullable=True))
    op.add_column("entity_logs", sa.Column("source", sa.String(20), nullable=False, server_default="ecran"))
    op.create_foreign_key("entity_logs_portal_user_id_fkey", "entity_logs", "portal_users", ["portal_user_id"], ["id"], ondelete="SET NULL")
    op.alter_column("entity_logs", "entity_id", nullable=True)
    op.drop_constraint("entity_logs_entity_id_fkey", "entity_logs", type_="foreignkey")
    op.create_foreign_key("entity_logs_entity_id_fkey", "entity_logs", "entities", ["entity_id"], ["id"], ondelete="SET NULL")
    # lignes existantes : l'objet est la fiche elle-meme ; sans auteur = automatique
    op.execute("""UPDATE entity_logs l SET object_type = CASE e.entity_type WHEN 'company' THEN 'companies' ELSE 'contacts' END,
                  object_id = l.entity_id::text FROM entities e WHERE e.id = l.entity_id""")
    op.execute("UPDATE entity_logs SET source = 'automatique' WHERE user_id IS NULL")
    op.create_index("ix_entity_logs_object", "entity_logs", ["object_type", "object_id"])
    op.create_index("ix_entity_logs_created_at", "entity_logs", ["created_at"])
    op.create_index("ix_entity_logs_user_id", "entity_logs", ["user_id"])
    op.create_index("ix_entity_logs_entity_id", "entity_logs", ["entity_id"])


def downgrade() -> None:
    op.drop_index("ix_entity_logs_entity_id", "entity_logs")
    op.drop_index("ix_entity_logs_user_id", "entity_logs")
    op.drop_index("ix_entity_logs_created_at", "entity_logs")
    op.drop_index("ix_entity_logs_object", "entity_logs")
    # les lignes qui ne visent pas une fiche compagnie/contact n'existaient pas avant
    op.execute("DELETE FROM entity_logs WHERE entity_id IS NULL")
    op.drop_constraint("entity_logs_entity_id_fkey", "entity_logs", type_="foreignkey")
    op.create_foreign_key("entity_logs_entity_id_fkey", "entity_logs", "entities", ["entity_id"], ["id"], ondelete="CASCADE")
    op.alter_column("entity_logs", "entity_id", nullable=False)
    op.drop_constraint("entity_logs_portal_user_id_fkey", "entity_logs", type_="foreignkey")
    op.drop_column("entity_logs", "source")
    op.drop_column("entity_logs", "portal_user_id")
    op.drop_column("entity_logs", "object_id")
    op.drop_column("entity_logs", "object_type")
