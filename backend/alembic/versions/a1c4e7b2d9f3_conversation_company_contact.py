"""TASK-055 : un enregistrement est relie directement a sa compagnie et a son contact, en plus de son ticket (Philippe
2026-11-05 : « je veux qu'il soit lie a la compagnie, au contact et au ticket… identifie-les avec le # de telephone ou
la compagnie du ticket »). La reconnaissance des voix ne sert plus a relier un contact (elle ne marche pas sur les
appels, a retester plus tard). Les enregistrements deja la recoivent la compagnie et le contact de leur ticket.

conversations.text devient le texte seul, sans nom (la page de la conversation l'affiche ; recherche et Zeko le
lisent) : recalcule a partir des phrases.

Revision ID: a1c4e7b2d9f3
Revises: f3c8a1d5b7e9
Create Date: 2026-11-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a1c4e7b2d9f3"
down_revision = "f3c8a1d5b7e9"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversations", sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("conversations", sa.Column("contact_id", UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_conversations_company_id", "conversations", ["company_id"])
    op.create_index("ix_conversations_contact_id", "conversations", ["contact_id"])
    op.execute("UPDATE conversations c SET company_id = t.company_id, contact_id = t.contact_id FROM tickets t WHERE t.id = c.ticket_id")
    op.execute("""UPDATE conversations c SET text = s.txt FROM (SELECT conversation_id, string_agg(text, ' ' ORDER BY idx) AS txt
                  FROM conversation_segments GROUP BY conversation_id) s WHERE s.conversation_id = c.id""")


def downgrade():
    op.execute("""UPDATE conversations c SET text = s.txt FROM (SELECT conversation_id, string_agg(speaker || ' : ' || text, E'\\n' ORDER BY idx) AS txt
                  FROM conversation_segments GROUP BY conversation_id) s WHERE s.conversation_id = c.id""")
    op.drop_index("ix_conversations_contact_id", "conversations")
    op.drop_index("ix_conversations_company_id", "conversations")
    op.drop_column("conversations", "contact_id")
    op.drop_column("conversations", "company_id")
