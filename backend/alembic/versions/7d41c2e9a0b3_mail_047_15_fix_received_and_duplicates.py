"""TASK-047.15 (GO de Philippe 2026-11-02) : courriels de nos adresses ADRESSES a leur boite = recus ; doublons sans Message-ID

1. Copies d'autres dossiers (pas « Envoyes ») venant d'une de nos boites et adressees a la boite elle-meme (ex. rapports
   ScopServ de nepasrepondre@ vers service@, dossier « Patio desing ») : direction « out » -> « in » ; leur classement
   automatique d'« envoye » (Simple IP inc.) est retire (« A classer », une regle les classera). Un classement a la main
   n'est jamais touche.
2. Doublons sans Message-ID (meme boite, expediteur, objet, date d'envoi) entre la boite de reception et un autre dossier :
   la copie de la boite de reception est retiree (le courriel est maintenant dans le dossier), seulement si rien n'y est
   rattache (ticket, tache, recu de carte, proposition ou lecture de Zeko, classement a la main). Fichier brut efface.
Constate avant : 37 courriels pour (1), 22 paires pour (2), aucune dependance.

Revision ID: 7d41c2e9a0b3
Revises: 399b9ba0bb9f
Create Date: 2026-11-02
"""
from pathlib import Path

from alembic import op
import sqlalchemy as sa

revision = "7d41c2e9a0b3"
down_revision = "399b9ba0bb9f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    n1 = conn.execute(sa.text("""
        UPDATE mail_messages m
           SET direction = 'in',
               company_id = CASE WHEN m.classified_by = 'auto' THEN NULL ELSE m.company_id END,
               contact_id = CASE WHEN m.classified_by = 'auto' THEN NULL ELSE m.contact_id END,
               classified_by = CASE WHEN m.classified_by = 'auto' THEN NULL ELSE m.classified_by END
          FROM mailboxes b, mail_folders f
         WHERE b.id = m.mailbox_id AND f.id = m.folder_id AND NOT f.sent
           AND m.direction = 'out'
           AND lower(m.from_email) IN (SELECT lower(email) FROM mailboxes)
           AND position(lower(b.email) IN lower(coalesce(m.to_addrs, '') || ',' || coalesce(m.cc_addrs, ''))) > 0
    """)).rowcount
    dup = conn.execute(sa.text("""
        SELECT DISTINCT i.id, i.stored_path
          FROM mail_messages i
          JOIN mail_messages f ON f.mailbox_id = i.mailbox_id AND f.folder_id IS NOT NULL AND i.folder_id IS NULL
                              AND i.message_id IS NULL AND f.message_id IS NULL AND f.sent_at = i.sent_at
                              AND lower(f.from_email) IS NOT DISTINCT FROM lower(i.from_email)
                              AND f.subject IS NOT DISTINCT FROM i.subject
         WHERE i.ticket_id IS NULL AND i.task_id IS NULL AND i.classified_by IS DISTINCT FROM 'manual'
           AND NOT EXISTS (SELECT 1 FROM card_receipts c WHERE c.mail_message_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM zeko_proposals z WHERE z.mail_message_id = i.id)
           AND NOT EXISTS (SELECT 1 FROM zeko_mail_scans s WHERE s.mail_message_id = i.id)
    """)).all()
    if dup:
        conn.execute(sa.text("DELETE FROM mail_messages WHERE id = ANY(:ids)"), {"ids": [r[0] for r in dup]})
        for _id, path in dup:
            try:
                if path:
                    Path(path).unlink(missing_ok=True)
            except OSError:
                pass
    print(f"TASK-047.15 : {n1} courriel(s) remis « reçus », {len(dup)} doublon(s) retiré(s)")


def downgrade() -> None:
    # Les doublons retirés ne se recréent pas (la copie du dossier reste) ; la direction corrigée reste « reçu ».
    pass
