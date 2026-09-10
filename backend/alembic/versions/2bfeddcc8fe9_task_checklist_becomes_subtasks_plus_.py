"""task_checklist_becomes_subtasks_plus_timer

TASK-015.15 phase 2 : la "checklist" (TaskChecklistItem, texte simple) fusionne
avec le mecanisme des sous-taches (Task.parent_task_id, deja capable de
templates/recherche) -- demande explicite de Philippe (2026-08-27) : garder le
mot "checklist" mais avec le systeme de sous-tache derriere. Chaque
TaskChecklistItem existant devient une vraie Task (parent_task_id = tache
d'origine), ordre preserve via created_at decale.

Revision ID: 2bfeddcc8fe9
Revises: 05a9b10d2b33
Create Date: 2026-08-27 14:03:08.742545

"""
import uuid
from datetime import timedelta, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2bfeddcc8fe9'
down_revision: Union[str, Sequence[str], None] = '05a9b10d2b33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Note : autogenerate avait aussi detecte la suppression de
    # ix_appointments_start_at et ix_email_opens_entity -- derive preexistante
    # non liee a ce changement, retiree volontairement (meme note que dans
    # les 2 migrations precedentes).
    op.add_column('tasks', sa.Column('template_id', sa.UUID(), nullable=True))
    op.add_column('tasks', sa.Column('link_url', sa.String(length=500), nullable=True))
    op.add_column('tasks', sa.Column('estimated_minutes', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('actual_minutes', sa.Integer(), nullable=True))
    op.add_column('tasks', sa.Column('timer_start_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tasks', sa.Column('timer_base_seconds', sa.Integer(), nullable=False, server_default='0'))
    op.create_foreign_key('tasks_template_id_fkey', 'tasks', 'tasks', ['template_id'], ['id'], ondelete='SET NULL')

    bind = op.get_bind()
    items = bind.execute(sa.text(
        "SELECT id, task_id, label, completed, sort_order FROM task_checklist_items ORDER BY task_id, sort_order"
    )).fetchall()

    task_created_at = {
        row.id: row.created_at
        for row in bind.execute(sa.text("SELECT id, created_at FROM tasks")).fetchall()
    }

    for item in items:
        parent_created_at = task_created_at.get(item.task_id)
        if parent_created_at is None:
            continue  # tache parente introuvable (ne devrait pas arriver, FK deja en place) -- ignore plutot que deviner
        new_created_at = parent_created_at + timedelta(seconds=item.sort_order + 1)
        bind.execute(sa.text(
            "INSERT INTO tasks "
            "(id, title, parent_task_id, priority, status, is_template, completed, "
            " timer_base_seconds, created_at, updated_at) "
            "VALUES "
            "(:id, :title, :parent_id, 'normale', :status, false, :completed, "
            " 0, :created_at, :created_at)"
        ), {
            "id": uuid.uuid4(), "title": item.label, "parent_id": item.task_id,
            "status": "complete" if item.completed else "en_cours",
            "completed": item.completed, "created_at": new_created_at,
        })

    op.drop_table('task_checklist_items')


def downgrade() -> None:
    """Downgrade schema."""
    # Les sous-taches issues d'anciens checklist_items ne sont PAS reconverties
    # (impossible de distinguer de facon fiable une sous-tache "vraie" d'une
    # migree une fois fusionnees) -- elles restent des Task normales, downgrade
    # recree seulement la table vide.
    op.create_table('task_checklist_items',
    sa.Column('id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('task_id', sa.UUID(), autoincrement=False, nullable=False),
    sa.Column('label', sa.VARCHAR(length=255), autoincrement=False, nullable=False),
    sa.Column('completed', sa.BOOLEAN(), autoincrement=False, nullable=False),
    sa.Column('sort_order', sa.INTEGER(), autoincrement=False, nullable=False),
    sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], name=op.f('task_checklist_items_task_id_fkey'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('task_checklist_items_pkey'))
    )
    op.drop_constraint('tasks_template_id_fkey', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'timer_base_seconds')
    op.drop_column('tasks', 'timer_start_at')
    op.drop_column('tasks', 'actual_minutes')
    op.drop_column('tasks', 'estimated_minutes')
    op.drop_column('tasks', 'link_url')
    op.drop_column('tasks', 'template_id')
