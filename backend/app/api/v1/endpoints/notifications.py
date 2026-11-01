"""Cloche de notifications (TASK-047.6) : ce qui reste à régler pour la personne connectée, lu dans l'état réel."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import notifications
from app.core.database import get_db
from app.models.user import User

router = APIRouter()


@router.get("")
async def bell(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Chaque catégorie selon les privilèges de la personne (courriels, ventes, tickets, banque) et les réglages."""
    return await notifications.collect(db, user)
