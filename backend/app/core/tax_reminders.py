"""Rappels de declaration TPS/TVQ (TASK-005.8, demande de Philippe 2026-10-02).

A la fin de chaque periode de declaration (mensuelle, trimestrielle ou annuelle, alignee
sur l'exercice financier), une tache « Declaration TPS/TVQ » est creee dans le module
Taches, assignee au responsable, avec rappels par courriel : le lendemain de la fin de
la periode, une semaine avant l'echeance et la veille. Elle se ferme quand le parametre
« Taxes declarees jusqu'au » (tax_lock_date) atteint la fin de la periode.

Echeances (Revenu Quebec) : mensuelle / trimestrielle = dernier jour du mois suivant la
periode ; annuelle = 3 mois apres la fin de l'exercice.
"""
import calendar
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.task import Task, TaskReminder

FREQ_MONTHS = {"mensuelle": 1, "trimestrielle": 3, "annuelle": 12}
MARK = "/settings#declaration-tps-tvq-"   # + fin de periode ISO : cle d'idempotence de la tache
_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def _month_end(d: date) -> date:
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def ended_periods(today: date, frequency: str, fiscal_start_month: int, count: int = 4) -> list[tuple[date, date]]:
    """Les `count` dernieres periodes terminees avant aujourd'hui, de la plus ancienne a la plus recente."""
    step = FREQ_MONTHS[frequency]
    # Debut de la periode en cours, aligne sur le debut d'exercice
    start = date(today.year if today.month >= fiscal_start_month else today.year - 1, fiscal_start_month, 1)
    while _add_months(start, step) <= today:
        start = _add_months(start, step)
    out = []
    for _ in range(count):
        prev = _add_months(start, -step)
        out.append((prev, start - timedelta(days=1)))
        start = prev
    return list(reversed(out))


def deadline(period_end: date, frequency: str) -> date:
    return _month_end(_add_months(period_end, 3 if frequency == "annuelle" else 1))


def _fmt(d: date) -> str:
    return f"{'1er' if d.day == 1 else d.day} {_MONTHS[d.month - 1]} {d.year}"


async def ensure_tax_filing_tasks(db: AsyncSession) -> int:
    """Cree les taches manquantes pour les periodes terminees et pas encore declarees. Idempotent."""
    from app.api.v1.endpoints.settings import get_setting
    freq = (await get_setting(db, "tax_filing_frequency") or "").strip()
    user_id = (await get_setting(db, "tax_reminder_user_id") or "").strip()
    if freq not in FREQ_MONTHS or not user_id:
        return 0
    lock_s = (await get_setting(db, "tax_lock_date") or "").strip()
    lock = date.fromisoformat(lock_s) if lock_s else None
    fiscal = int(await get_setting(db, "fiscal_year_start_month") or 1)

    created = 0
    for start, end in ended_periods(clock.today(), freq, fiscal):
        if lock and end <= lock:
            continue
        key = f"{MARK}{end.isoformat()}"
        if (await db.execute(select(Task.id).where(Task.link_url == key))).first():
            continue
        due = deadline(end, freq)
        task = Task(
            title=f"Déclaration TPS/TVQ — période du {_fmt(start)} au {_fmt(end)}",
            description=(
                f"La période de déclaration du {_fmt(start)} au {_fmt(end)} est terminée. "
                f"Produire la déclaration TPS/TVQ (Revenu Québec) d'ici le {_fmt(due)}.\n"
                f"Une fois produite : dans Paramètres, avancer « Taxes déclarées jusqu'au » au {end.isoformat()} "
                f"(verrouille les factures de la période ; cette tâche se fermera d'elle-même)."
            ),
            due_date=due, due_time="09:00", priority="haute",
            assigned_to_id=uuid.UUID(user_id), link_url=key,
        )
        db.add(task)
        await db.flush()
        # Rappel au lendemain de la fin de periode (09:00), puis 1 semaine et 1 jour avant l'echeance
        since_end = int((datetime.combine(due, datetime.min.time()) - datetime.combine(end + timedelta(days=1), datetime.min.time())).total_seconds() // 60)
        for minutes in (since_end, 10080, 1440):
            if minutes > 0:
                db.add(TaskReminder(task_id=task.id, reminder_type="email", minutes_before=-1, custom_minutes=minutes))
        created += 1
    if created:
        await db.commit()
    return created


async def complete_declared_tasks(db: AsyncSession, lock: date) -> int:
    """Ferme les taches de declaration dont la periode est couverte par « Taxes declarees jusqu'au »."""
    n = 0
    for t in (await db.execute(select(Task).where(Task.link_url.like(f"{MARK}%"), Task.completed == False))).scalars().all():
        if date.fromisoformat(t.link_url[len(MARK):]) <= lock:
            t.completed, t.completed_at, t.status = True, datetime.now().astimezone(), "complete"
            n += 1
    return n
