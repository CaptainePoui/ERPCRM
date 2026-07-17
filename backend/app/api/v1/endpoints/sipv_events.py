"""
Webhook SIPV -> ERPCRM.
SIPV appelle cet endpoint pour notifier ERPCRM d'evenements cote telephonie
(nom d'extension change, extension creee/supprimee) afin de garder le contact
lie a jour (champ `extension`, `sipv_sync`).
Authentifie par X-Api-Key (settings.SIPV_API_KEY) — jamais par login utilisateur.
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.models.contact import Contact

router = APIRouter()


def verify_sipv_api_key(x_api_key: str = Header(...)):
    if not settings.SIPV_API_KEY or x_api_key != settings.SIPV_API_KEY:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cle API invalide")
    return x_api_key


class SIPVEvent(BaseModel):
    action: str  # contact_name_changed, extension_deleted, extension_created
    erpcrm_contact_id: uuid.UUID
    data: dict = {}


@router.post("/event", status_code=status.HTTP_200_OK)
async def sipv_event(
    payload: SIPVEvent,
    db: AsyncSession = Depends(get_db),
    _: str = Depends(verify_sipv_api_key),
):
    result = await db.execute(select(Contact).where(Contact.id == payload.erpcrm_contact_id))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    if payload.action == "extension_created":
        contact.sipv_sync = True
        if "extension" in payload.data:
            contact.extension = payload.data["extension"]
    elif payload.action == "extension_deleted":
        contact.sipv_sync = False
        contact.extension = None
    elif payload.action == "contact_name_changed":
        for field in ("extension", "phone_other"):
            if field in payload.data:
                setattr(contact, field, payload.data[field])
    else:
        raise HTTPException(status_code=400, detail=f"Action inconnue : {payload.action}")

    await db.commit()
    return {"status": "ok", "action": payload.action, "contact_id": str(contact.id)}
