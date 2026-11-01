"""À qui une pastille s'offre (TASK-002.14, GO de Philippe 2026-11-01 : « ok pour les pastilles contact et compagnie ») :
statuses.applies_to = both | companies | contacts, réglé dans Administration -> Configuration -> Pastilles. Refusé à
l'ajout seulement : une fiche qui porte déjà la pastille la garde (rien ne disparaît sans bruit)."""
from fastapi import HTTPException

from app.models.status import Status

LABEL = {"companies": "aux compagnies", "contacts": "aux contacts"}


async def check(db, status_ids, kind: str) -> None:
    """kind = companies | contacts ; 422 si une des pastilles ne s'offre pas à ce genre de fiche."""
    for sid in status_ids or []:
        s = await db.get(Status, sid)
        if s and (s.applies_to or "both") not in ("both", kind):
            raise HTTPException(status_code=422, detail=f"La pastille « {s.name} » est réservée {LABEL[s.applies_to]}")
