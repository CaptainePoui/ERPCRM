"""Anciens noms et anciennes coordonnees (TASK-002.8, 2026-10-23) -- une seule fiche, qu'on reconnait encore par ce
qu'elle etait : recherche, courriels recus d'une ancienne adresse, Zeko. Voir app/models/former_info.py."""
import re
from datetime import date

from sqlalchemy import select, func, or_

from app.models.company import Company
from app.models.entity_log import EntityLog
from app.models.former_info import FormerInfo

KIND_FR = {"name": "nom", "email": "courriel", "phone": "téléphone"}


def digits(v: str | None) -> str:
    d = re.sub(r"\D", "", v or "")
    return d[-10:] if len(d) > 10 and d.startswith("1") else d


def clean(kind: str, value: str) -> str:
    v = (value or "").strip()
    return v.lower() if kind == "email" else v


def period(f: FormerInfo) -> str:
    if f.valid_from and f.valid_to:
        return f"du {f.valid_from} au {f.valid_to}"
    if f.valid_to:
        return f"jusqu'au {f.valid_to}"
    if f.valid_from:
        return f"depuis le {f.valid_from}"
    return ""


async def entities_matching(db, text: str, kinds=("name", "email", "phone")) -> dict:
    """{entity_id: [FormerInfo]} dont un ancien nom / courriel / telephone contient le texte cherche."""
    t = (text or "").strip()
    if not t:
        return {}
    conds = []
    if "name" in kinds:
        squash = lambda x: func.regexp_replace(func.unaccent(func.lower(x)), "[^a-z0-9]", "", "g")   # noqa: E731
        conds.append((FormerInfo.kind == "name") & (
            func.unaccent(func.lower(FormerInfo.value)).ilike(func.concat("%", func.unaccent(func.lower(t)), "%"))
            | squash(FormerInfo.value).like(func.concat("%", squash(t), "%"))))
    if "email" in kinds:
        conds.append((FormerInfo.kind == "email") & FormerInfo.value.ilike(f"%{t.lower()}%"))
    d = digits(t)
    if "phone" in kinds and len(d) >= 4:
        conds.append((FormerInfo.kind == "phone") & func.regexp_replace(FormerInfo.value, r"\D", "", "g").like(f"%{d}%"))
    out: dict = {}
    for f in (await db.execute(select(FormerInfo).where(or_(*conds)))).scalars().all():
        out.setdefault(f.entity_id, []).append(f)
    return out


async def entity_of_email(db, addr: str) -> list:
    a = (addr or "").strip().lower()
    return list((await db.execute(select(FormerInfo.entity_id).where(FormerInfo.kind == "email", FormerInfo.value == a))).scalars().all())


async def entities_of_domain(db, dom: str) -> list:
    return list((await db.execute(select(FormerInfo.entity_id).where(
        FormerInfo.kind == "email", FormerInfo.value.like(f"%@{dom.lower()}")))).scalars().all())


async def add(db, entity_id, kind: str, value: str, valid_from: date | None = None, valid_to: date | None = None,
              note: str | None = None, user_id=None) -> FormerInfo:
    if kind not in KIND_FR:
        raise ValueError("Type inconnu (nom, courriel ou téléphone)")
    v = clean(kind, value)
    if not v:
        raise ValueError("Valeur vide")
    if valid_from and valid_to and valid_from > valid_to:
        raise ValueError("La date de début est après la date de fin")
    f = FormerInfo(entity_id=entity_id, kind=kind, value=v, valid_from=valid_from, valid_to=valid_to, note=(note or "").strip() or None)
    db.add(f)
    db.add(EntityLog(entity_id=entity_id, user_id=user_id, action="former_added", field_name=f"ancien {KIND_FR[kind]}",
                     new_value=f"{v} {period(f)}".strip(), description=f.note))
    await db.flush()
    return f


async def rename_company(db, company: Company, new_name: str, previous_until: date | None, previous_from: date | None = None,
                         note: str | None = None, user_id=None, source: str = "ecran") -> FormerInfo:
    """Changement de nom / achat : la fiche prend le nouveau nom, l'ancien est garde avec ses dates."""
    new_name = (new_name or "").strip()
    if not new_name:
        raise ValueError("Nouveau nom vide")
    if new_name == company.name:
        raise ValueError("C'est déjà son nom")
    old = company.name
    f = await add(db, company.id, "name", old, previous_from, previous_until, note, user_id)
    company.name = new_name
    db.add(EntityLog(entity_id=company.id, user_id=user_id, action="renamed", field_name="name", old_value=old,
                     new_value=new_name, description="Changement de nom (l'ancien nom est gardé)", source=source))
    await db.flush()
    return f


async def remove(db, f: FormerInfo, user_id=None) -> None:
    db.add(EntityLog(entity_id=f.entity_id, user_id=user_id, action="former_removed", field_name=f"ancien {KIND_FR.get(f.kind, f.kind)}",
                     old_value=f"{f.value} {period(f)}".strip()))
    await db.delete(f)
    await db.flush()
