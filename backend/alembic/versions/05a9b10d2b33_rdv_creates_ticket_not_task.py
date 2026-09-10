"""rdv_creates_ticket_not_task

TASK-015.15 : un RDV cree desormais un Ticket automatiquement (pas une Task).
Le lien vers l'evenement Google Calendar deplace donc de Task vers Ticket.
Donnee a migrer : toute Task existante portant google_calendar_event_id
(cree par l'ancien flux TASK-026.5) doit voir son lien transfere vers un
Ticket nouvellement cree (ou existant si deja lie via ticket_id), pour ne
rien perdre.

Revision ID: 05a9b10d2b33
Revises: 15309e1f3718
Create Date: 2026-08-27 12:40:44.604139

"""
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '05a9b10d2b33'
down_revision: Union[str, Sequence[str], None] = '15309e1f3718'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Note : autogenerate avait aussi detecte la suppression de
    # ix_appointments_start_at et ix_email_opens_entity -- derive preexistante
    # non liee a ce changement, retiree volontairement (meme note que dans
    # 15309e1f3718_task_google_calendar_link.py).
    op.add_column('tickets', sa.Column('google_calendar_event_id', sa.String(length=255), nullable=True))
    op.add_column('tickets', sa.Column('google_calendar_id', sa.String(length=255), nullable=True))

    bind = op.get_bind()

    # Migration de donnees : toute Task avec un lien calendrier existant
    # (ancien flux) devient un Ticket avec ce meme lien, pour ne rien perdre.
    tasks_with_link = bind.execute(sa.text(
        "SELECT id, title, company_id, contact_id, google_calendar_event_id, google_calendar_id "
        "FROM tasks WHERE google_calendar_event_id IS NOT NULL"
    )).fetchall()

    for row in tasks_with_link:
        company_id = row.company_id
        if company_id is None and row.contact_id is not None:
            # Meme resolution que contacts.py : compagnie principale du contact,
            # sinon la premiere compagnie active liee.
            resolved = bind.execute(sa.text(
                "SELECT company_id FROM contact_companies "
                "WHERE contact_id = :cid AND is_active = true "
                "ORDER BY is_primary DESC LIMIT 1"
            ), {"cid": row.contact_id}).fetchone()
            company_id = resolved.company_id if resolved else None

        if company_id is None:
            # Aucune compagnie resoluble -- rien a faire, le lien calendrier
            # de cette tache sera simplement perdu avec la colonne (aucun
            # ticket ne peut exister sans compagnie, company_id NOT NULL).
            continue

        new_ticket_id = uuid.uuid4()
        now = datetime.now(timezone.utc)
        bind.execute(sa.text(
            "INSERT INTO tickets "
            "(id, company_id, contact_id, title, priority, status, is_billable, "
            " created_at, updated_at, timer_base_seconds, last_note_marker_seconds, "
            " draft_note_billable, google_calendar_event_id, google_calendar_id) "
            "VALUES "
            "(:id, :company_id, :contact_id, :title, 'normal', 'en_cours', false, "
            " :now, :now, 0, 0, false, :event_id, :calendar_id)"
        ), {
            "id": new_ticket_id, "company_id": company_id, "contact_id": row.contact_id,
            "title": row.title, "now": now,
            "event_id": row.google_calendar_event_id, "calendar_id": row.google_calendar_id,
        })
        bind.execute(sa.text("UPDATE tasks SET ticket_id = :tid WHERE id = :task_id"),
                     {"tid": new_ticket_id, "task_id": row.id})

    op.drop_column('tasks', 'google_calendar_event_id')
    op.drop_column('tasks', 'google_calendar_id')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('tasks', sa.Column('google_calendar_id', sa.VARCHAR(length=255), autoincrement=False, nullable=True))
    op.add_column('tasks', sa.Column('google_calendar_event_id', sa.VARCHAR(length=255), autoincrement=False, nullable=True))

    bind = op.get_bind()
    tickets_with_link = bind.execute(sa.text(
        "SELECT id, google_calendar_event_id, google_calendar_id FROM tickets "
        "WHERE google_calendar_event_id IS NOT NULL"
    )).fetchall()
    for row in tickets_with_link:
        bind.execute(sa.text(
            "UPDATE tasks SET google_calendar_event_id = :event_id, google_calendar_id = :calendar_id "
            "WHERE ticket_id = :tid"
        ), {"event_id": row.google_calendar_event_id, "calendar_id": row.google_calendar_id, "tid": row.id})

    op.drop_column('tickets', 'google_calendar_id')
    op.drop_column('tickets', 'google_calendar_event_id')
