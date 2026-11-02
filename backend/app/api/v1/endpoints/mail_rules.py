"""Regles des courriels (TASK-006.22) : liste, creation, modification, suppression, apercu des courriels deja recus qui y
repondent, et « aussi sur les anciens ». Section « Courriels » (voir pour lire, modifier pour changer : privileges.guard).
Le moteur est dans core/mail_rules.py."""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.endpoints.auth import get_current_user
from app.core import mail_rules as R
from app.core.database import get_db
from app.models.company import Company
from app.models.contact import Contact
from app.models.mailbox import MailFolder, MailMessage, MailRule
from app.models.user import User

router = APIRouter()


class RuleIn(BaseModel):
    name: str
    match: str = "toutes"
    conditions: list[dict] = []
    actions: dict = {}
    is_active: bool = True
    apply_existing: bool = False      # « aussi sur les anciens » (demandé à la création quand il y en a)


async def _names(db, rules) -> tuple[dict, dict]:
    cids = {uuid.UUID(r.actions["compagnie_id"]) for r in rules if (r.actions or {}).get("compagnie_id")}
    pids = {uuid.UUID(r.actions["contact_id"]) for r in rules if (r.actions or {}).get("contact_id")}
    co = {str(i): n for i, n in (await db.execute(select(Company.id, Company.name).where(Company.id.in_(cids)))).all()} if cids else {}
    ct = {str(i): f"{f} {l}".strip() for i, f, l in (await db.execute(
        select(Contact.id, Contact.first_name, Contact.last_name).where(Contact.id.in_(pids)))).all()} if pids else {}
    return co, ct


def _out(r: MailRule, co: dict, ct: dict) -> dict:
    a = r.actions or {}
    return {"id": str(r.id), "name": r.name, "is_active": r.is_active, "position": r.position, "match": r.match,
            "conditions": r.conditions or [], "actions": a, "source": r.source, "hits": r.hits, "last_hit_at": r.last_hit_at,
            "created_at": r.created_at, "description": R.describe(r),
            "compagnie": co.get(a.get("compagnie_id") or ""), "contact": ct.get(a.get("contact_id") or "")}


async def _one_out(db, r):
    co, ct = await _names(db, [r])
    return _out(r, co, ct)


def _clean(p: RuleIn):
    try:
        return R.validate(p.name, p.match, p.conditions, p.actions)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("")
async def list_rules(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(MailRule).order_by(MailRule.position, MailRule.created_at))).scalars().all()
    co, ct = await _names(db, rows)
    return [_out(r, co, ct) for r in rows]


@router.get("/options")
async def options(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Champs, comparaisons, et dossiers déjà connus des boîtes (pour « déplacer dans un dossier »)."""
    from app.core.mail_junk import FOLDER
    names = (await db.execute(select(MailFolder.name).distinct())).scalars().all()
    shown = sorted({re.split(r"[./]", n)[-1] for n in names if n.upper() != "INBOX"} - {FOLDER}, key=str.lower)
    from app.core.mail_autoreply import VARIABLES
    return {"champs": R.FIELDS, "ops": R.OPS, "dossiers": shown, "variables": VARIABLES}


@router.post("/preview")
async def preview(p: RuleIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Combien de courriels déjà reçus répondent à ces conditions (et les 5 plus récents) — rien n'est changé."""
    try:
        if not p.conditions:
            raise ValueError("Au moins une condition")
        _n, match, conds, _a = R.validate(p.name or "aperçu", p.match, p.conditions, {"lu": True})   # actions pas encore choisies : OK
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    n, sample = await R.existing(db, MailRule(name="aperçu", match=match, conditions=conds, actions={}), limit=5)
    return {"count": n, "sample": [{"id": str(m.id), "from": m.from_name or m.from_email, "subject": m.subject, "sent_at": m.sent_at,
                                    "manual": m.classified_by == "manual"} for m in sample]}


@router.post("", status_code=201)
async def create_rule(p: RuleIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    name, match, conds, actions = _clean(p)
    last = (await db.execute(select(func.max(MailRule.position)))).scalar() or 0
    r = MailRule(name=name, match=match, conditions=conds, actions=actions, is_active=p.is_active, position=last + 10,
                 source="manuel", created_by=user.id)
    db.add(r)
    await db.commit()
    out = await _one_out(db, r)
    if p.apply_existing:
        out["applied"] = await R.apply_existing(db, r)
    return out


@router.put("/{rid}")
async def update_rule(rid: uuid.UUID, p: RuleIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await db.get(MailRule, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    r.name, r.match, r.conditions, r.actions = _clean(p)
    r.is_active = p.is_active
    await db.commit()
    out = await _one_out(db, r)
    if p.apply_existing:
        out["applied"] = await R.apply_existing(db, r)
    return out


@router.put("/{rid}/active")
async def set_active(rid: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await db.get(MailRule, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    r.is_active = bool(body.get("is_active"))
    await db.commit()
    return await _one_out(db, r)


@router.post("/{rid}/move")
async def move(rid: uuid.UUID, body: dict, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Monter / descendre dans l'ordre (les règles passent de haut en bas)."""
    rows = list((await db.execute(select(MailRule).order_by(MailRule.position, MailRule.created_at))).scalars().all())
    i = next((k for k, r in enumerate(rows) if r.id == rid), None)
    if i is None:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    j = i - 1 if body.get("dir") == "up" else i + 1
    if 0 <= j < len(rows):
        rows[i], rows[j] = rows[j], rows[i]
    for k, r in enumerate(rows):
        r.position = (k + 1) * 10
    await db.commit()
    return {"ok": True}


@router.post("/{rid}/apply-existing")
async def apply_existing(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    r = await db.get(MailRule, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    return await R.apply_existing(db, r)


@router.delete("/{rid}")
async def delete_rule(rid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Supprime la règle (demandé par la personne) ; les courriels déjà classés par elle restent où ils sont."""
    r = await db.get(MailRule, rid)
    if not r:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    await db.delete(r)
    await db.commit()
    return {"ok": True}


@router.get("/suggest/{mid}")
async def suggest(mid: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """« Toujours faire ça ? » depuis un courriel : expéditeur + objet sans les dates/numéros qui changent, et la fiche où
    il est classé. Une adresse qui envoie pour plusieurs clients (nos propres adresses, ex. nepasrepondre@) a besoin de
    l'objet ; une autre adresse suffit souvent seule (l'objet est proposé, à retirer au besoin)."""
    m = await db.get(MailMessage, mid)
    if not m:
        raise HTTPException(status_code=404, detail="Courriel introuvable")
    subj = re.sub(r"\s+", " ", re.sub(r"\b\d[\d/:.\-]*\b|#\S+", " ", m.subject or "")).strip(" -:|")
    conds = []
    if m.from_email:
        conds.append({"champ": "expediteur", "op": "est", "valeur": m.from_email})
    if len(subj) >= 4:
        conds.append({"champ": "objet", "op": "contient", "valeur": subj[:200]})
    co, ct = None, None
    if m.company_id:
        co = await db.get(Company, m.company_id)
    if m.contact_id:
        ct = await db.get(Contact, m.contact_id)
    name = f"{subj[:60] or m.from_email or 'Courriel'}" + (f" → {co.name}" if co else "")
    return {"name": name, "match": "toutes", "conditions": conds,
            "actions": {"compagnie_id": str(co.id) if co else None, "contact_id": str(ct.id) if ct else None, "arreter": True},
            "compagnie": co.name if co else None, "contact": f"{ct.first_name} {ct.last_name}".strip() if ct else None}
