"""Pages publiques de Zeko, sans connexion (TASK-026.9, 2026-10-27).

Lien de desinscription au bas des courriels de Zeko : « Vous ne voulez plus que Zeko, l'IA de Simple IP, vous
reponde ? » -- personnel au contact (signe avec SECRET_KEY), decoche la case de sa fiche, note au journal.
"""
import uuid
from html import escape

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.zeko_mail import optout_ok
from app.models.contact import Contact
from app.models.entity_log import EntityLog

router = APIRouter()


def _page(title: str, text: str) -> HTMLResponse:
    return HTMLResponse(f"""<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)}</title></head><body style="font-family:Arial,sans-serif;max-width:560px;margin:60px auto;padding:0 16px;color:#111">
<h2>{escape(title)}</h2><p style="font-size:15px;line-height:1.5">{escape(text)}</p><p style="color:#666;font-size:13px">Simple IP</p></body></html>""")


@router.get("/optout/{contact_id}/{sig}", response_class=HTMLResponse)
async def optout(contact_id: uuid.UUID, sig: str, db: AsyncSession = Depends(get_db)):
    contact = await db.get(Contact, contact_id) if optout_ok(contact_id, sig) else None
    if not contact:
        return _page("Lien invalide", "Ce lien n'est pas valide. Écrivez-nous et nous ferons le changement pour vous.")
    if not contact.zeko_replies_off:
        contact.zeko_replies_off = True
        db.add(EntityLog(entity_id=contact.id, user_id=None, action="field_change", field_name="zeko_replies_off",
                         old_value="False", new_value="True"))
        await db.commit()
    return _page("C'est noté", "Zéko, l'IA de Simple IP, ne vous répondra plus. Un membre de notre équipe vous répondra lui-même.")
