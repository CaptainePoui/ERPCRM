import uuid
import unicodedata
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, inspect as sa_inspect
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.entity import Entity, EntityType
from app.models.entity_log import EntityLog
from app.models.company import Company
from app.models.contact import Contact
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

FIELD_LABELS = {
    "name": "Nom de compagnie",
    "account_number": "No compte",
    "office_phone": "Téléphone bureau",
    "legal_name": "Nom légal",
    "neq": "NEQ",
    "website": "Site web",
    "industry": "Secteur d'activité",
    "shareholder_type": "Type d'actionnariat",
    "employee_count": "Nombre d'employés",
    "annual_revenue": "Chiffre d'affaires",
    "notes_internal": "Notes internes",
    "internal_manager_id": "Gestionnaire",
    "currency": "Devise",
    "exchange_rate": "Taux de change",
    "is_taxable": "Client taxable",
    "tax_country": "Pays fiscal",
    "tax_province": "Province fiscale",
    "tps_rate": "TPS",
    "tvq_rate": "TVQ",
    "is_active": "Actif",
    "first_name": "Prénom",
    "last_name": "Nom",
    "email": "Courriel",
    "phone": "Téléphone bureau",
    "mobile": "Cellulaire",
    "extension": "Poste SIP",
    "phone_other": "Autre numéro",
    "sipv_sync": "Synchronisation SIPV",
}

ACTION_LABELS = {
    "field_change": "Modification",
    "status_added": "Statut ajouté",
    "status_removed": "Statut retiré",
    "contact_linked": "Contact lié",
    "contact_unlinked": "Contact retiré",
    "address_added": "Adresse ajoutée",
    "communication_added": "Coordonnée ajoutée",
    "communication_removed": "Coordonnée retirée",
    "photo_added": "Photo d'installation ajoutée",
    "photo_removed": "Photo d'installation retirée",
    "created": "Création",
}


def _normalize(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')


class LogEntryOut(BaseModel):
    id: uuid.UUID
    action: str
    action_label: str
    field_name: str | None
    field_label: str | None
    old_value: str | None
    new_value: str | None
    description: str | None
    user_name: str | None
    created_at: datetime
    can_revert: bool

    model_config = {"from_attributes": True}


def _out(l: EntityLog) -> LogEntryOut:
    return LogEntryOut(
        id=l.id,
        action=l.action,
        action_label=ACTION_LABELS.get(l.action, l.action),
        field_name=l.field_name,
        field_label=FIELD_LABELS.get(l.field_name, l.field_name) if l.field_name else None,
        old_value=l.old_value,
        new_value=l.new_value,
        description=l.description,
        user_name=l.user.full_name if l.user else "Système",
        created_at=l.created_at,
        can_revert=l.action == "field_change" and bool(l.field_name),
    )


@router.get("/{entity_id}/logs", response_model=list[LogEntryOut])
async def get_logs(
    entity_id: uuid.UUID,
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # entity_id peut etre une compagnie (tous ses logs) ou un contact (ses propres
    # changements + les entrees compagnie taguees a lui, ex: telephone bureau partage).
    q = (
        select(EntityLog)
        .where(or_(EntityLog.entity_id == entity_id, EntityLog.contact_id == entity_id))
        .options(selectinload(EntityLog.user))
        .order_by(EntityLog.created_at.desc())
    )
    if search:
        term = _normalize(search)
        like = f"%{term}%"
        matching_fields = [f for f, label in FIELD_LABELS.items() if term in _normalize(label)]
        matching_actions = [a for a, label in ACTION_LABELS.items() if term in _normalize(label)]
        conditions = [
            func.unaccent(func.lower(EntityLog.description)).ilike(like),
            func.unaccent(func.lower(EntityLog.field_name)).ilike(like),
            func.unaccent(func.lower(EntityLog.old_value)).ilike(like),
            func.unaccent(func.lower(EntityLog.new_value)).ilike(like),
            EntityLog.action.in_(matching_actions),
        ]
        if matching_fields:
            conditions.append(EntityLog.field_name.in_(matching_fields))
        q = q.join(User, EntityLog.user_id == User.id, isouter=True).where(
            or_(*conditions, func.unaccent(func.lower(User.full_name)).ilike(like))
        )
    result = await db.execute(q)
    logs = result.scalars().unique().all()
    return [_out(l) for l in logs]


def _cast_value(model_cls, field_name: str, raw: str | None):
    if raw is None:
        return None
    col = sa_inspect(model_cls).columns.get(field_name)
    if col is None:
        return raw
    try:
        py_type = col.type.python_type
    except NotImplementedError:
        return raw
    if py_type is bool:
        return raw == "True"
    if py_type is int:
        return int(raw)
    if py_type is float:
        return float(raw)
    if py_type is uuid.UUID:
        return uuid.UUID(raw)
    return raw


@router.post("/logs/{log_id}/revert", response_model=LogEntryOut)
async def revert_log(log_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    log = await db.get(EntityLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Entrée de journal introuvable")
    if log.action != "field_change" or not log.field_name:
        raise HTTPException(status_code=400, detail="Cette entrée ne peut pas être revertie")

    entity = await db.get(Entity, log.entity_id)
    if not entity:
        raise HTTPException(status_code=404, detail="Fiche introuvable")

    model_cls = Company if entity.entity_type == EntityType.company else Contact
    instance = await db.get(model_cls, log.entity_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Fiche introuvable")

    current_value = getattr(instance, log.field_name, None)
    reverted_value = _cast_value(model_cls, log.field_name, log.old_value)
    setattr(instance, log.field_name, reverted_value)

    new_log = EntityLog(
        entity_id=log.entity_id,
        contact_id=log.contact_id,
        user_id=current_user.id,
        action="field_change",
        field_name=log.field_name,
        old_value=str(current_value) if current_value is not None else None,
        new_value=str(reverted_value) if reverted_value is not None else None,
        description="Reverté depuis le journal",
    )
    db.add(new_log)
    await db.commit()
    result = await db.execute(select(EntityLog).where(EntityLog.id == new_log.id).options(selectinload(EntityLog.user)))
    return _out(result.scalar_one())
