"""Courriel de connexion d'un compte employe (TASK-014.2, 2026-10-09).

Philippe : « le user est toujours le courriel du tech ou du client, mais il est lie a un code unique derriere… on change de
courriel et rien ne change dans l'historique, juste que de telle date a telle date c'etait ce courriel ». L'historique est
rattache a l'identifiant interne du compte (jamais au courriel) ; le courriel de connexion = son courriel professionnel,
change a un seul endroit (fiche Employe ou Administration -> Utilisateurs, les deux passent ici) ; sa boite personnelle suit
et le changement est inscrit au journal de sa fiche (ancien, nouveau, date, qui).
"""
from fastapi import HTTPException
from sqlalchemy import func, select


async def set_login_email(db, user, new_email: str, by_user=None) -> None:
    from app.models.employee import Employee
    from app.models.entity_log import EntityLog
    from app.models.mailbox import Mailbox
    from app.models.user import User
    new = (new_email or "").strip().lower()
    if not new or "@" not in new:
        raise HTTPException(status_code=400, detail="Courriel de connexion invalide")
    old = (user.email or "").lower()
    if new == old:
        return
    if (await db.execute(select(User.id).where(func.lower(User.email) == new, User.id != user.id))).first():
        raise HTTPException(status_code=409, detail=f"{new} sert déjà à se connecter pour un autre compte")
    user.email = new
    mb = (await db.execute(select(Mailbox).where(Mailbox.kind == "personal", Mailbox.owner_user_id == user.id))).scalars().first()
    if mb and mb.email.lower() != new:
        if (await db.execute(select(Mailbox.id).where(func.lower(Mailbox.email) == new, Mailbox.id != mb.id))).first():
            raise HTTPException(status_code=409, detail=f"{new} est déjà une autre boîte de l'entreprise (Administration → Intégrations)")
        if (mb.username or "").lower() in ("", mb.email.lower()):
            mb.username = new
        mb.email, mb.uidvalidity, mb.last_uid = new, None, 0      # autre adresse : on recopie depuis le debut
    contact_id = (await db.execute(select(Employee.contact_id).where(Employee.user_id == user.id))).scalar_one_or_none()
    if contact_id:
        db.add(EntityLog(entity_id=contact_id, user_id=by_user.id if by_user else None, action="field_change",
                         field_name="Courriel de connexion", old_value=old or None, new_value=new))
