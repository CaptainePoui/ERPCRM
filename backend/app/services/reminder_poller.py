"""
Reminder poller: checks every 60s for TaskReminder rows (reminder_type="email")
dont l'heure de declenchement est passee et qui n'ont pas encore ete envoyes ->
envoie un courriel de rappel au technicien assigne et marque sent=True.

due_date/due_time sont saisis en heure locale (America/Montreal) cote frontend
(inputs date/time du navigateur) mais le serveur tourne en UTC -- la conversion
est necessaire ici pour declencher au bon moment.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import AsyncSessionLocal
from app.models.task import Task, TaskReminder
from app.core.email import send_task_reminder_email

log = logging.getLogger("reminder_poller")

_POLL_INTERVAL = 60  # seconds
_LOCAL_TZ = ZoneInfo("America/Montreal")


def _fire_at_utc(task: Task, reminder: TaskReminder) -> datetime | None:
    if not task.due_date:
        return None
    hh, mm = (int(x) for x in (task.due_time or "00:00").split(":"))
    local_due = datetime(task.due_date.year, task.due_date.month, task.due_date.day, hh, mm, tzinfo=_LOCAL_TZ)
    minutes = reminder.custom_minutes if reminder.minutes_before == -1 else reminder.minutes_before
    return (local_due - timedelta(minutes=minutes or 0)).astimezone(timezone.utc)


async def _check_once():
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(TaskReminder)
            .where(TaskReminder.reminder_type == "email", TaskReminder.sent == False)
            .options(
                selectinload(TaskReminder.task).selectinload(Task.assigned_to),
                selectinload(TaskReminder.task).selectinload(Task.company),
            )
        )
        reminders = result.scalars().all()
        now = datetime.now(timezone.utc)
        for r in reminders:
            task = r.task
            if not task or task.completed or task.is_template:
                continue
            fire_at = _fire_at_utc(task, r)
            if fire_at is None or fire_at > now:
                continue
            to_email = task.assigned_to.email if task.assigned_to else None
            if to_email:
                try:
                    await send_task_reminder_email(
                        to_email=to_email,
                        task_id=str(task.id),
                        title=task.title,
                        company_name=task.company.name if task.company else None,
                        due_date=task.due_date.isoformat() if task.due_date else None,
                        due_time=task.due_time,
                        description=task.description,
                    )
                except Exception:
                    log.exception("Echec envoi rappel pour la tache %s", task.id)
            else:
                log.warning("Rappel du a la tache %s mais aucun technicien assigne avec courriel", task.id)
            r.sent = True
            r.sent_at = now
        if reminders:
            await db.commit()


async def run_reminder_poller():
    while True:
        try:
            await _check_once()
        except Exception:
            log.exception("Iteration du poller de rappels echouee")
        await asyncio.sleep(_POLL_INTERVAL)
