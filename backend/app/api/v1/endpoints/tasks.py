import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.task import Task, TaskReminder, TaskChecklistItem, TASK_STATUSES, TASK_PRIORITIES
from app.models.user import User

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

class ChecklistItemIn(BaseModel):
    label: str
    completed: bool = False
    sort_order: int = 0

class ChecklistItemOut(BaseModel):
    id: uuid.UUID
    label: str
    completed: bool
    sort_order: int

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
    checklist_items: list[ChecklistItemOut]

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
    reminders: list[ReminderIn] = []
    checklist_items: list[ChecklistItemIn] = []

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
    completed: bool | None = None
    reminders: list[ReminderIn] | None = None
    checklist_items: list[ChecklistItemIn] | None = None

class TaskOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    company_id: uuid.UUID | None
    company_name: str | None
    contact_id: uuid.UUID | None
    contact_name: str | None
    ticket_id: uuid.UUID | None
    ticket_title: str | None
    invoice_id: uuid.UUID | None
    invoice_number: str | None
    parent_task_id: uuid.UUID | None
    due_date: str | None
    due_time: str | None
    priority: str
    status: str
    assigned_to_id: uuid.UUID | None
    assigned_name: str | None
    is_template: bool
    template_name: str | None
    completed: bool
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    reminders: list[ReminderOut]
    checklist_items: list[ChecklistItemOut]
    subtasks: list[SubTaskOut]

class ChecklistToggle(BaseModel):
    completed: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_opts():
    return (
        selectinload(Task.reminders),
        selectinload(Task.checklist_items),
        selectinload(Task.company),
        selectinload(Task.contact),
        selectinload(Task.ticket),
        selectinload(Task.invoice),
        selectinload(Task.assigned_to),
        selectinload(Task.subtasks).selectinload(Task.assigned_to),
        selectinload(Task.subtasks).selectinload(Task.checklist_items),
    )

def _serialize(t: Task) -> TaskOut:
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
            checklist_items=[ChecklistItemOut(id=c.id, label=c.label, completed=c.completed, sort_order=c.sort_order) for c in st.checklist_items],
        )
        for st in t.subtasks
    ]
    return TaskOut(
        id=t.id,
        title=t.title,
        description=t.description,
        company_id=t.company_id,
        company_name=t.company.name if t.company else None,
        contact_id=t.contact_id,
        contact_name=f"{t.contact.first_name} {t.contact.last_name}".strip() if t.contact else None,
        ticket_id=t.ticket_id,
        ticket_title=t.ticket.title if t.ticket else None,
        invoice_id=t.invoice_id,
        invoice_number=t.invoice.invoice_number if t.invoice else None,
        parent_task_id=t.parent_task_id,
        due_date=t.due_date.isoformat() if t.due_date else None,
        due_time=t.due_time,
        priority=t.priority,
        status=t.status,
        assigned_to_id=t.assigned_to_id,
        assigned_name=t.assigned_to.full_name if t.assigned_to else None,
        is_template=t.is_template,
        template_name=t.template_name,
        completed=t.completed,
        completed_at=t.completed_at,
        created_at=t.created_at,
        updated_at=t.updated_at,
        reminders=[ReminderOut(id=r.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes, sent=r.sent) for r in t.reminders],
        checklist_items=[ChecklistItemOut(id=c.id, label=c.label, completed=c.completed, sort_order=c.sort_order) for c in t.checklist_items],
        subtasks=subtasks_out,
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
    return [_serialize(t) for t in result.scalars().all()]


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
    )
    db.add(task)
    await db.flush()
    for r in body.reminders:
        db.add(TaskReminder(task_id=task.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes))
    for i, c in enumerate(body.checklist_items):
        db.add(TaskChecklistItem(task_id=task.id, label=c.label, completed=c.completed, sort_order=c.sort_order or i))
    await db.commit()
    return _serialize(await _get_task(task.id, db))


@router.get("/templates", response_model=list[TaskOut])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Task).where(Task.is_template == True).options(*_load_opts()).order_by(Task.template_name)
    )
    return [_serialize(t) for t in result.scalars().all()]


@router.post("/from-template/{template_id}", response_model=TaskOut)
async def create_from_template(
    template_id: uuid.UUID,
    body: TaskIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from datetime import date as dt_date
    tpl = await _get_task(template_id, db)
    task = Task(
        title=body.title or tpl.title,
        description=body.description or tpl.description,
        company_id=body.company_id,
        contact_id=body.contact_id,
        ticket_id=body.ticket_id,
        invoice_id=body.invoice_id,
        due_date=dt_date.fromisoformat(body.due_date) if body.due_date else None,
        due_time=body.due_time or tpl.due_time,
        priority=body.priority or tpl.priority,
        status="en_cours",
        assigned_to_id=body.assigned_to_id or tpl.assigned_to_id,
        is_template=False,
    )
    db.add(task)
    await db.flush()
    for r in tpl.reminders:
        db.add(TaskReminder(task_id=task.id, reminder_type=r.reminder_type, minutes_before=r.minutes_before, custom_minutes=r.custom_minutes))
    for c in tpl.checklist_items:
        db.add(TaskChecklistItem(task_id=task.id, label=c.label, completed=False, sort_order=c.sort_order))
    await db.commit()
    return _serialize(await _get_task(task.id, db))


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _serialize(await _get_task(task_id, db))


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
    if body.ticket_id is not None:      task.ticket_id = body.ticket_id
    if body.invoice_id is not None:     task.invoice_id = body.invoice_id
    if "parent_task_id" in body.model_fields_set: task.parent_task_id = body.parent_task_id
    if body.due_date is not None:       task.due_date = dt_date.fromisoformat(body.due_date) if body.due_date else None
    if body.due_time is not None:       task.due_time = body.due_time
    if body.priority is not None:       task.priority = body.priority
    if body.status is not None:         task.status = body.status
    if body.assigned_to_id is not None: task.assigned_to_id = body.assigned_to_id
    if body.is_template is not None:    task.is_template = body.is_template
    if body.template_name is not None:  task.template_name = body.template_name
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
    if body.checklist_items is not None:
        for c in task.checklist_items:
            await db.delete(c)
        for i, c in enumerate(body.checklist_items):
            db.add(TaskChecklistItem(task_id=task.id, label=c.label, completed=c.completed, sort_order=c.sort_order or i))
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _serialize(await _get_task(task.id, db))


@router.post("/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = await _get_task(task_id, db)
    task.completed = True
    task.completed_at = datetime.now(timezone.utc)
    task.status = "complete"
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _serialize(await _get_task(task.id, db))


@router.patch("/{task_id}/checklist/{item_id}", response_model=TaskOut)
async def toggle_checklist_item(
    task_id: uuid.UUID,
    item_id: uuid.UUID,
    body: ChecklistToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(TaskChecklistItem).where(TaskChecklistItem.id == item_id, TaskChecklistItem.task_id == task_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")
    item.completed = body.completed
    await db.commit()
    return _serialize(await _get_task(task_id, db))


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
