"""Acces au portail client : le courriel de connexion est celui de la fiche contact, jamais une copie (TASK-014.2,
2026-10-09, Philippe : « c'est lier pas copier »). Un meme courriel ne peut servir qu'a un seul acces portail, sinon la
connexion ne saurait pas quel compte ouvrir -- verifie a la creation de l'acces ET quand le courriel de la fiche change.
"""
from fastapi import HTTPException
from sqlalchemy import func, select


async def check_email_free(db, email: str | None, contact_id) -> None:
    from app.models.contact import Contact
    from app.models.portal import PortalUser
    email = (email or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Ce contact n'a pas de courriel : ajoutez-le à sa fiche, il sert à se connecter au portail")
    other = (await db.execute(select(Contact.first_name, Contact.last_name).join(PortalUser, PortalUser.contact_id == Contact.id)
                              .where(func.lower(Contact.email) == email, Contact.id != contact_id))).first()
    if other:
        raise HTTPException(status_code=409, detail=f"{email} sert déjà à se connecter au portail pour {f'{other[0] or ''} {other[1] or ''}'.strip()} : un courriel par accès portail")


async def guard_contact_email(db, contact_id, new_email: str | None) -> None:
    """Avant de changer le courriel d'une fiche contact : s'il a un acces portail, le nouveau courriel doit etre libre."""
    from app.models.portal import PortalUser
    if (await db.execute(select(PortalUser.id).where(PortalUser.contact_id == contact_id))).first():
        await check_email_free(db, new_email, contact_id)
