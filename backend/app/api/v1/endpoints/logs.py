import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.entity_log import EntityLog
from app.models.user import User
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

FIELD_LABELS = {
    "name": "Nom de compagnie",
    "account_number": "No compte",
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
}

ACTION_LABELS = {
    "field_change": "Modification",
    "status_added": "Statut ajouté",
    "status_removed": "Statut retiré",
    "contact_linked": "Contact lié",
    "contact_unlinked": "Contact retiré",
    "address_added": "Adresse ajoutée",
    "communication_added": "Coordonnée ajoutée",
    "created": "Création",
}


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

    model_config = {"from_attributes": True}


@router.get("/{entity_id}/logs", response_model=list[LogEntryOut])
async def get_logs(entity_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(EntityLog)
        .where(EntityLog.entity_id == entity_id)
        .options(selectinload(EntityLog.user))
        .order_by(EntityLog.created_at.desc())
    )
    logs = result.scalars().all()
    return [LogEntryOut(
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
    ) for l in logs]
