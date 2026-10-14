"""Rappel chaque semaine des factures en brouillon (TASK-005.22, 2026-10-14).

Philippe : « une facture brouillon devrait se faire rappeler a chaque semaine qu'elle existe... la je l'ai oubliee
depuis tellement longtemps » (HRH 2021, J. Lavoie 2023, jamais envoyees). Une fois par semaine (semaine ISO), s'il y a
des brouillons, une tache « Factures en brouillon » est creee dans le module Taches avec la liste (numero, client,
date, age, montant), assignee au responsable des rappels de declaration (tax_reminder_user_id, sinon un admin), avec
un courriel a 9 h. La tache de la semaine precedente encore ouverte est fermee (remplacee). Un brouillon offert au
client (« Offrir », statut annulee) n'est plus un brouillon : il sort du rappel.
"""
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import clock
from app.models.invoice import Invoice
from app.models.task import Task, TaskReminder
from app.models.user import User, UserRole

MARK = "/invoices?status=brouillon#rappel-brouillons-"    # + annee-semaine ISO : cle d'idempotence


async def _assignee(db: AsyncSession) -> uuid.UUID | None:
    from app.api.v1.endpoints.settings import get_setting
    uid = (await get_setting(db, "tax_reminder_user_id") or "").strip()
    if uid:
        return uuid.UUID(uid)
    return (await db.execute(select(User.id).where(User.role == UserRole.admin, User.is_active.is_(True)).limit(1))).scalar()


async def ensure_draft_reminder_task(db: AsyncSession) -> bool:
    """Cree la tache de la semaine s'il y a des brouillons et qu'elle n'existe pas encore. Idempotent."""
    today = clock.today()
    y, w, _d = today.isocalendar()
    key = f"{MARK}{y}-W{w:02d}"
    if (await db.execute(select(Task.id).where(Task.link_url == key))).first():
        return False
    drafts = (await db.execute(select(Invoice).options(selectinload(Invoice.company))
                               .where(Invoice.status == "brouillon").order_by(Invoice.issue_date))).scalars().all()
    if not drafts:
        return False
    user_id = await _assignee(db)
    if not user_id:
        return False
    for old in (await db.execute(select(Task).where(Task.link_url.like(f"{MARK}%"), Task.completed.is_(False)))).scalars():
        old.completed, old.completed_at, old.status = True, datetime.now().astimezone(), "complete"
    rows = "\n".join(
        f"- {i.number} — {i.company.name} — {i.issue_date.isoformat()} ({(today - i.issue_date).days} jours) — {i.total:.2f} $"
        + (" (avoir)" if i.credit_of_id else "")
        for i in drafts)
    task = Task(
        title=f"Factures en brouillon : {len(drafts)}",
        description=("Ces factures sont encore en brouillon (jamais envoyées, hors déclarations de taxes) :\n"
                     f"{rows}\n\nPour chacune : l'envoyer (changer d'abord sa date pour aujourd'hui si elle tombe dans une "
                     "période de taxes déjà déclarée), l'offrir au client (« Offrir », elle sortira de ce rappel) ou la "
                     "supprimer si c'est une erreur. Ce rappel revient chaque semaine."),
        due_date=today, due_time="09:00", priority="normale", assigned_to_id=user_id, link_url=key,
    )
    db.add(task)
    await db.flush()
    db.add(TaskReminder(task_id=task.id, reminder_type="email", minutes_before=-1, custom_minutes=0))
    await db.commit()
    return True
