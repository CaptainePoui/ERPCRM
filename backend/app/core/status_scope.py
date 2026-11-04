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


def options_of(s: Status) -> list[str]:
    return [o for g in (s.choices or []) for o in (g.get("options") or [])]


def clean_choices(groups) -> list[dict]:
    """TASK-002.20 : [{"group": str|None, "options": [str]}] ; groupes et choix vides retirés, doublons refusés."""
    out, seen = [], set()
    for g in groups or []:
        name = (str(g.get("group") or "")).strip()[:100] or None
        opts = []
        for o in g.get("options") or []:
            o = str(o).strip()
            if not o:
                continue
            if len(o) > 200:
                raise HTTPException(status_code=422, detail=f"Choix trop long (200 caractères au plus) : {o[:40]}…")
            if o.lower() in seen:
                raise HTTPException(status_code=422, detail=f"Choix en double : {o}")
            seen.add(o.lower())
            opts.append(o)
        if opts:
            out.append({"group": name, "options": opts})
    return out


def check_choice(s: Status, choice: str | None) -> str | None:
    """Le choix doit venir du menu de la pastille (ou rien : à choisir plus tard)."""
    choice = (choice or "").strip() or None
    if choice is None:
        return None
    if not s.choice_menu:
        raise HTTPException(status_code=422, detail=f"La pastille « {s.name} » n'a pas de menu déroulant")
    if choice not in options_of(s):
        raise HTTPException(status_code=422, detail=f"« {choice} » n'est pas dans le menu de la pastille « {s.name} »")
    return choice
