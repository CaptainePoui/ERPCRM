"""TASK-024.2 : les images déjà jointes aux tickets vont dans les Photos de la compagnie (comme les nouvelles) ; la pièce
jointe du ticket pointe la photo (« photo:<nom> »). Fichier déplacé de storage/ticket_attachments vers
uploads/installation_photos ; légende : ticket, titre, date. Constaté avant : 1 image (T-11001, AAA Compagnie test).

Revision ID: e2b7c4d9f1a8
Revises: d1a6b8c3e5f7
Create Date: 2026-11-04
"""
import shutil
import uuid
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "e2b7c4d9f1a8"
down_revision = "d1a6b8c3e5f7"
branch_labels = None
depends_on = None

BASE = Path(__file__).resolve().parents[2]
SRC, DST = BASE / "storage" / "ticket_attachments", BASE / "uploads" / "installation_photos"


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("""
        SELECT a.id, a.filename, a.created_at, t.number, t.title, t.company_id, m.user_id
          FROM ticket_attachments a JOIN ticket_messages m ON m.id = a.message_id JOIN tickets t ON t.id = m.ticket_id
         WHERE a.media_type LIKE 'image/%' AND a.filename NOT LIKE 'photo:%' AND t.company_id IS NOT NULL""")).all()
    DST.mkdir(parents=True, exist_ok=True)
    for aid, fname, created, number, title, company_id, user_id in rows:
        src = SRC / Path(fname).name
        if not src.exists():
            continue
        new = f"ticket-{aid}{src.suffix}"
        shutil.move(str(src), str(DST / new))
        conn.execute(sa.text("""INSERT INTO installation_photos (id, company_id, filename, caption, uploaded_by_id, created_at)
                                VALUES (:i, :c, :f, :cap, :u, :d)"""),
                     {"i": uuid.uuid4(), "c": company_id, "f": new, "u": user_id, "d": created,
                      "cap": f"Collée dans le ticket {number or ''} « {(title or '')[:80]} » le {created:%Y-%m-%d %H:%M} (UTC)"})
        conn.execute(sa.text("UPDATE ticket_attachments SET filename = :f WHERE id = :i"), {"f": "photo:" + new, "i": aid})
    print(f"TASK-024.2 : {len(rows)} image(s) de ticket déplacée(s) dans les Photos")


def downgrade() -> None:
    pass        # les photos restent (elles sont aussi dans la fiche de la compagnie)
