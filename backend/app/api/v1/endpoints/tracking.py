import base64
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.email_open import EmailOpen
from app.models.user import User

router = APIRouter()

# 1x1 PNG transparent -- pixel invisible integre dans les courriels (suivi
# d'ouverture style Zoho, TASK infrastructure de suivi).
_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)

ENTITY_TYPES = ["ticket", "invoice", "devis", "task", "appointment"]


@router.get("/{entity_type}/{entity_id}.png")
async def track_open(entity_type: str, entity_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """
    Endpoint PUBLIC (aucune authentification) -- le client courriel du
    destinataire charge cette image sans jamais avoir de jeton d'acces. Chaque
    chargement cree une NOUVELLE ligne (historique complet des ouvertures, pas
    juste la derniere). N'echoue jamais visiblement (retourne toujours le pixel,
    meme si entity_type est inconnu) pour ne jamais casser l'affichage du courriel.
    """
    if entity_type in ENTITY_TYPES:
        db.add(EmailOpen(entity_type=entity_type, entity_id=entity_id))
        await db.commit()
    return Response(content=_PIXEL_PNG, media_type="image/png", headers={
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
    })


class EmailOpenOut(BaseModel):
    opened_at: datetime


@router.get("/{entity_type}/{entity_id}/opens", response_model=list[EmailOpenOut])
async def list_opens(entity_type: str, entity_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Historique complet des ouvertures (plus recent en premier), pour affichage."""
    result = await db.execute(
        select(EmailOpen)
        .where(EmailOpen.entity_type == entity_type, EmailOpen.entity_id == entity_id)
        .order_by(EmailOpen.opened_at.desc())
    )
    return [EmailOpenOut(opened_at=o.opened_at) for o in result.scalars().all()]
