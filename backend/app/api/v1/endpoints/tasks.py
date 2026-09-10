import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.task import Task, TaskReminder, TASK_STATUSES, TASK_PRIORITIES
from app.models.ticket import Ticket
from app.models.user import User
from app.core.tracking import get_open_stats
from app.core.email import send_task_email

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class ReminderIn(BaseModel):
    reminder_type: str = "local"
    minutes_before: int = 0
    custom_minutes: int | None = None

class ReminderOut(BaseModel):
    id: uuid.UUID
    reminder_type: str
    minutes_before: int
    custom_minutes: int | None
    sent: bool

class SubTaskOut(BaseModel):
    id: uuid.UUID
    title: str
    status: str
    priority: str
    completed: bool
    assigned_to_id: uuid.UUID | None
    assigned_name: str | None
    due_date: str | None
    due_time: str | None
    link_url: str | None
    estimated_minutes: int | None
    actual_minutes: int | None
    timer_running: bool
    elapsed_seconds: int

class TaskIn(BaseModel):
    title: str
    description: str | None = None
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    ticket_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    parent_task_id: uuid.UUID | None = None
    due_date: str | None = None        # "YYYY-MM-DD"
    due_time: str | None = None        # "HH:MM"
    priority: str = "normale"
    status: str = "en_cours"
    assigned_to_id: uuid.UUID | None = None
    is_template: bool = False
    template_name: str | None = None
    link_url: str | None = None
    estimated_minutes: int | None = None
    reminders: list[ReminderIn] = []

class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    company_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    ticket_id: uuid.UUID | None = None
    invoice_id: uuid.UUID | None = None
    parent_task_id: uuid.UUID | None = None
    due_date: str | None = None
    due_time: str | None = None
    priority: str | None = None
    status: str | None = None
    assigned_to_id: uuid.UUID | None = None
    is_template: bool | None = None
    template_name: str | None = None
    link_url: str | None = None
    estimated_minutes: int | None = None
    completed: bool | None = None
    reminders: list[ReminderIn] | None = None

class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    company_id: uuid.UUID | None
    company_name: str | None
    contact_id: uuid.UUID | None
    contact_name: str | None
    contact_email: str | None
    ticket_id: uuid.UUID | None
    ticket_title: str | None
    invoice_id: uuid.UUID | None
    invoice_number: str | None
    parent_task_id: uuid.UUID | None
    template_id: uuid.UUID | None
    due_date: str | None
    due_time: str | None
    priority: str
    status: str
    assigned_to_id: uuid.UUID | None
    assigned_name: str | None
    is_template: bool
    template_name: str | None
    link_url: str | None
    estimated_minutes: int | None
    actual_minutes: int | None
    suggested_estimated_minutes: int | None = None
    timer_running: bool
    elapsed_seconds: int
    completed: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    reminders: list[ReminderOut]
    subtasks: list[SubTaskOut]
    last_opened_at: datetime | None = None
    open_count: int = 0

class CompleteWithTimePayload(BaseModel):
    minutes: int

class SendTaskPayload(BaseModel):
    to_email: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_opts():
    return (
        selectinload(Task.reminders),
        selectinload(Task.company),
        selectinload(Task.contact),
        selectinload(Task.ticket),
        selectinload(Task.invoice),
        selectinload(Task.assigned_to),
        selectinload(Task.subtasks).selectinload(Task.assigned_to),
    )

def _elapsed_seconds(t: Task) -> int:
    if t.timer_start_at is not None:
        return t.timer_base_seconds + int((datetime.now(timezone.utc) - t.timer_start_at).total_seconds())
    return t.timer_base_seconds

async def _suggested_estimate(template_id: uuid.UUID, db: AsyncSession) -> int | None:
    """Moyenne historique des temps reels (actual_minutes) de toutes les
    instances issues de ce template, +15% -- suggestion pour estimated_minutes
    (TASK-015.15 phase 2), jamais imposee, seulement affichee."""
    result = await db.execute(
        select(func.avg(Task.actual_minutes)).where(Task.template_id == template_id, Task.actual_minutes.isnot(None))
    )
    avg = result.scalar()
    return round(float(avg) * 1.15) if avg is not None else None

async def _serialize(t: Task, db: AsyncSession) -> TaskOut:
    stats = await get_open_stats(db, "task", [t.id])
    last_opened_at, open_count = stats.get(t.id, (None, 0))
    subtasks_out = [
        SubTaskOut(
            id=st.id,
            title=st.title,
            status=st.status,
            priority=st.priority,
            completed=st.completed,
            assigned_to_id=st.assigned_to_id,
            assigned_name=st.assigned_to.full_name if st.assigned_to else None,
            due_date=st.due_date.isoformat() if st.due_date else None,
            due_time=st.due_time,
            link_url=st.link_url,
            estimated_minutes=st.estimated_minutes,
            actual_minutes=st.actual_minutes,
            timer_running=st.timer_start_at is not None,
            elapsed_seconds=_elapsed_seconds(st),
        )
        for st in t.subtasks
    ]
    suggested = await _suggested_estimate(t.id, db) if t.is_template else None
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        company_id=t.company_id,
        company_name=t.company.name if t.company else None,
        contact_id=t.contact_id,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}".strip() if t.contact else None,
        contact_email=t.contact.email if t.contact else None,
        ticket_id=t.ticket_id,
        ticket_title=t.ticket.title if t.ticket else None,
        invoice_id=t.invoice_id,
        invoice_number=t.invoice.invoice_number if t.invoice else None,
        parent_task_id=t.parent_task_id,
        template_id=t.template_id,
        due_date=t.due_date.isoformat() if t.due_date else None,
        due_time=t.due_time,
        priority=t.priority,
        status=t.status,
        assigned_to_id=t.assigned_to_id,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        is_template=t.is_template,
        template_name=t.template_name,
        link_url=t.link_url,
        estimated_minutes=t.estimated_minutes,
        actual_minutes=t.actual_minutes,
        suggested_estimated_minutes=suggested,
        timer_running=t.timer_start_at is not None,
        elapsed_seconds=_elapsed_seconds(t),
        completed=t.completed,
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
        reminders=[ReminderOut(id=r.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes, sent=r.sent) for r in t.reminders],
        subtasks=subtasks_out,
        last_opened_at=last_opened_at, open_count=open_count,
    )

async def _get_task(task_id: uuid.UUID, db: AsyncSession) -> Task:
    result = await db.execute(
        select(Task).where(Task.id == task_id).options(*_load_opts())
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    return task


# ── Routes ────────────────────────────────────────────────────────────────────

class UserSimple(BaseModel):
    id: uuid.UUID
    full_name: str
    role: str

@router.get("/assignees", response_model=list[UserSimple])
async def list_assignees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.is_active == True).order_by(User.full_name))
    return [UserSimple(id=u.id, full_name=u.full_name, role=u.role) for u in result.scalars().all()]


class CompetencyRow(BaseModel):
    assigned_to_id: uuid.UUID
    assigned_name: str
    template_id: uuid.UUID
    template_title: str
    employee_avg_minutes: float
    employee_count: int
    team_avg_minutes: float


@router.get("/report/competency", response_model=list[CompetencyRow])
async def competency_report(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Temps moyen par employe et par type de tache (template_id), compare a
    la moyenne d'equipe sur la meme tache -- TASK-015.15 phase 2, demande
    explicite de Philippe pour ajuster le planing (+15%) sans pénaliser les
    employes plus lents."""
    per_employee = (await db.execute(
        select(
            Task.assigned_to_id, User.full_name, Task.template_id,
            func.avg(Task.actual_minutes), func.count(Task.id),
        )
        .join(User, User.id == Task.assigned_to_id)
        .where(Task.actual_minutes.isnot(None), Task.template_id.isnot(None), Task.assigned_to_id.isnot(None))
        .group_by(Task.assigned_to_id, User.full_name, Task.template_id)
    )).all()

    team_avgs = dict((await db.execute(
        select(Task.template_id, func.avg(Task.actual_minutes))
        .where(Task.actual_minutes.isnot(None), Task.template_id.isnot(None))
        .group_by(Task.template_id)
    )).all())

    template_ids = {row[2] for row in per_employee}
    templates = {}
    if template_ids:
        result = await db.execute(select(Task.id, Task.title).where(Task.id.in_(template_ids)))
        templates = dict(result.all())

    return [
        CompetencyRow(
            assigned_to_id=assigned_to_id, assigned_name=full_name,
            template_id=template_id, template_title=templates.get(template_id, "?"),
            employee_avg_minutes=round(float(avg_minutes), 1), employee_count=count,
            team_avg_minutes=round(float(team_avgs.get(template_id, avg_minutes)), 1),
        )
        for assigned_to_id, full_name, template_id, avg_minutes, count in per_employee
    ]


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    status: str | None = None,
    priority: str | None = None,
    assigned_to_id: uuid.UUID | None = None,
    company_id: uuid.UUID | None = None,
    contact_id: uuid.UUID | None = None,
    ticket_id: uuid.UUID | None = None,
    invoice_id: uuid.UUID | None = None,
    parent_task_id: uuid.UUID | None = None,
    templates_only: bool = False,
    due_from: str | None = None,
    due_to: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Task).options(*_load_opts())
    if templates_only:
        q = q.where(Task.is_template == True)
    else:
        q = q.where(Task.is_template == False)
    if parent_task_id:
        q = q.where(Task.parent_task_id == parent_task_id)
    else:
        q = q.where(Task.parent_task_id == None)
    if status:
        q = q.where(Task.status == status)
    if priority:
        q = q.where(Task.priority == priority)
    if assigned_to_id:
        q = q.where(Task.assigned_to_id == assigned_to_id)
    if company_id:
        q = q.where(Task.company_id == company_id)
    if contact_id:
        q = q.where(Task.contact_id == contact_id)
    if ticket_id:
        q = q.where(Task.ticket_id == ticket_id)
    if invoice_id:
        q = q.where(Task.invoice_id == invoice_id)
    if due_from:
        from datetime import date as dt_date
        q = q.where(Task.due_date >= dt_date.fromisoformat(due_from))
    if due_to:
        from datetime import date as dt_date
        q = q.where(Task.due_date <= dt_date.fromisoformat(due_to))
    q = q.order_by(Task.due_date.asc().nullslast(), Task.created_at.desc())
    result = await db.execute(q)
    return [await _serialize(t, db) for t in result.scalars().all()]


@router.post("", response_model=TaskOut)
async def create_task(
    body: TaskIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as dt_date
    task = Task(
        title=body.title,
        description=body.description,
        company_id=body.company_id,
        contact_id=body.contact_id,
        ticket_id=body.ticket_id,
        invoice_id=body.invoice_id,
        parent_task_id=body.parent_task_id,
        due_date=dt_date.fromisoformat(body.due_date) if body.due_date else None,
        due_time=body.due_time,
        priority=body.priority,
        status=body.status,
        assigned_to_id=body.assigned_to_id,
        is_template=body.is_template,
        template_name=body.template_name,
        link_url=body.link_url,
        estimated_minutes=body.estimated_minutes,
    )
    db.add(task)
    await db.flush()
    for r in body.reminders:
        db.add(TaskReminder(task_id=task.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes))
    await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.get("/templates", response_model=list[TaskOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task).where(Task.is_template == True).options(*_load_opts()).order_by(Task.template_name)
    )
    return [await _serialize(t, db) for t in result.scalars().all()]


async def _copy_from_template(
    tpl: Task, db: AsyncSession, *,
    parent_task_id: uuid.UUID | None,
    company_id: uuid.UUID | None,
    contact_id: uuid.UUID | None,
    ticket_id: uuid.UUID | None,
    invoice_id: uuid.UUID | None,
    assigned_to_id: uuid.UUID | None,
    title: str | None = None,
    due_date=None,
    due_time: str | None = None,
) -> Task:
    """Instancie une vraie Task depuis un template, garde le lien de lignage
    (template_id) pour le calcul de moyenne, et copie recursivement les
    sous-taches (= checklist, TASK-015.15 phase 2) du template."""
    task = Task(
        title=title or tpl.title,
        description=tpl.description,
        company_id=company_id,
        contact_id=contact_id,
        ticket_id=ticket_id,
        invoice_id=invoice_id,
        parent_task_id=parent_task_id,
        template_id=tpl.id,
        due_date=due_date,
        due_time=due_time or tpl.due_time,
        priority=tpl.priority,
        status="en_cours",
        assigned_to_id=assigned_to_id or tpl.assigned_to_id,
        is_template=False,
        link_url=tpl.link_url,
        estimated_minutes=tpl.estimated_minutes,
    )
    db.add(task)
    await db.flush()
    for r in tpl.reminders:
        db.add(TaskReminder(task_id=task.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes))
    # Un seul niveau de copie (tpl.subtasks est deja charge par _get_task) --
    # meme profondeur que le reste de l'app, qui n'affiche pas de sous-sous-taches.
    for sub_tpl in tpl.subtasks:
        sub_task = Task(
            title=sub_tpl.title, description=sub_tpl.description,
            company_id=company_id, contact_id=contact_id, ticket_id=ticket_id, invoice_id=invoice_id,
            parent_task_id=task.id, template_id=sub_tpl.id,
            due_time=sub_tpl.due_time, priority=sub_tpl.priority, status="en_cours",
            assigned_to_id=sub_tpl.assigned_to_id, is_template=False,
            link_url=sub_tpl.link_url, estimated_minutes=sub_tpl.estimated_minutes,
        )
        db.add(sub_task)
    return task


@router.post("/from-template/{template_id}", response_model=TaskOut)
async def create_from_template(
    template_id: uuid.UUID,
    body: TaskIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as dt_date
    tpl = await _get_task(template_id, db)
    task = await _copy_from_template(
        tpl, db, parent_task_id=body.parent_task_id,
        company_id=body.company_id, contact_id=body.contact_id,
        ticket_id=body.ticket_id, invoice_id=body.invoice_id,
        assigned_to_id=body.assigned_to_id, title=body.title,
        due_date=dt_date.fromisoformat(body.due_date) if body.due_date else None,
        due_time=body.due_time,
    )
    await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _serialize(await _get_task(task_id, db), db)


@router.post("/{task_id}/send", response_model=TaskOut)
async def send_task(
    task_id: uuid.UUID,
    payload: SendTaskPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, db)
    await send_task_email(
        to_email=payload.to_email,
        task_id=str(task.id),
        title=task.title,
        company_name=task.company.name if task.company else None,
        due_date=task.due_date.isoformat() if task.due_date else None,
        due_time=task.due_time,
        description=task.description,
    )
    return await _serialize(task, db)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as dt_date
    task = await _get_task(task_id, db)
    if body.title is not None:          task.title = body.title
    if body.description is not None:    task.description = body.description
    if body.company_id is not None:     task.company_id = body.company_id
    if body.contact_id is not None:     task.contact_id = body.contact_id
    if "ticket_id" in body.model_fields_set: task.ticket_id = body.ticket_id
    if body.invoice_id is not None:     task.invoice_id = body.invoice_id
    if "parent_task_id" in body.model_fields_set: task.parent_task_id = body.parent_task_id
    if body.due_date is not None:       task.due_date = dt_date.fromisoformat(body.due_date) if body.due_date else None
    if body.due_time is not None:       task.due_time = body.due_time
    if body.priority is not None:       task.priority = body.priority
    if body.status is not None:         task.status = body.status
    if body.assigned_to_id is not None: task.assigned_to_id = body.assigned_to_id
    if body.is_template is not None:    task.is_template = body.is_template
    if body.template_name is not None:  task.template_name = body.template_name
    if body.link_url is not None:       task.link_url = body.link_url
    if body.estimated_minutes is not None: task.estimated_minutes = body.estimated_minutes
    if body.completed is not None:
        task.completed = body.completed
        task.completed_at = datetime.now(timezone.utc) if body.completed else None
        if body.completed:
            task.status = "complete"
    if body.reminders is not None:
        for r in task.reminders:
            await db.delete(r)
        for r in body.reminders:
            db.add(TaskReminder(task_id=task.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes))
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.post("/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Completion simple, sans chrono (tache jamais demarree -- rien a
    confirmer/corriger comme temps, voir /complete-with-time sinon)."""
    task = await _get_task(task_id, db)
    task.completed = True
    task.completed_at = datetime.now(timezone.utc)
    task.status = "complete"
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.post("/{task_id}/timer/start", response_model=TaskOut)
async def start_task_timer(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Demarre le chrono de cette tache (clic sur link_url ou 'Commencer') --
    idempotent, ne fait rien si deja en cours (TASK-015.15 phase 2)."""
    task = await _get_task(task_id, db)
    if task.timer_start_at is None:
        task.timer_start_at = datetime.now(timezone.utc)
        await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.post("/{task_id}/complete-with-time", response_model=TaskOut)
async def complete_task_with_time(
    task_id: uuid.UUID,
    body: CompleteWithTimePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Coche la tache en enregistrant le temps reel (chronometre, corrigible
    par l'utilisateur avant confirmation, ex. pause toilette). L'ecart entre
    le temps chronometre et le temps confirme est repercute sur le chrono du
    ticket lie -- pas besoin de tout recalculer a la fin (demande explicite
    de Philippe, 2026-08-27)."""
    task = await _get_task(task_id, db)
    raw_elapsed_minutes = round(_elapsed_seconds(task) / 60)
    delta_seconds = (body.minutes - raw_elapsed_minutes) * 60

    task.actual_minutes = body.minutes
    task.timer_base_seconds = 0
    task.timer_start_at = None
    task.completed = True
    task.completed_at = datetime.now(timezone.utc)
    task.status = "complete"
    task.updated_at = datetime.now(timezone.utc)

    if task.ticket_id and delta_seconds != 0:
        ticket = await db.get(Ticket, task.ticket_id)
        if ticket:
            ticket.timer_base_seconds = max(0, ticket.timer_base_seconds + delta_seconds)

    await db.commit()
    return await _serialize(await _get_task(task.id, db), db)


@router.delete("/{task_id}")
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, db)
    await db.delete(task)
    await db.commit()
    return {"ok": True}
