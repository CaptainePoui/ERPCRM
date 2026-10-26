"""Contact ou compagnie deja dans ERPCRM ? (TASK-003.3, 2026-10-26)

Avant de creer une fiche, on cherche une fiche semblable : meme nom sans tenir compte des accents, des majuscules, des
tirets, des espaces ni d'une ou deux lettres de difference (touche accrochee, faute : « MC crystal », « M-C Chrystal »,
« MCCrystal ») ; meme courriel ; meme telephone. Les anciens noms, courriels et telephones (former_infos) comptent aussi.
L'ecran montre alors « existe deja : aller a la fiche / creer quand meme ».
"""
import re
import unicodedata

from sqlalchemy import select

# Formes juridiques ignorees a la fin d'un nom de compagnie (« Simple IP inc. » = « Simple IP »)
_FORMES = re.compile(r"(inc|incorporee|ltee|ltd|limitee|enr|senc|sencrl|corp|cie|llc)$")


def norm(s: str | None) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]", "", s)


def norm_company(s: str | None) -> str:
    n = norm(s)
    m = _FORMES.search(n)
    return n[:m.start()] if m and m.start() >= 3 else n


def digits(s: str | None) -> str:
    d = re.sub(r"\D", "", s or "")
    return d[-10:] if len(d) >= 7 else ""


def _distance(a: str, b: str, limit: int) -> int:
    """Lettres a changer, ajouter, enlever ou inverser pour passer de a a b (arrete des que > limit)."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev2, prev = None, list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
            if prev2 is not None and i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        if min(cur) > limit:
            return limit + 1
        prev2, prev = prev, cur
    return prev[-1]


def same_name(a: str, b: str) -> bool:
    """a et b deja normalises. Nom court : identique ; moyen : 1 lettre ; long : 2 lettres de difference."""
    if not a or not b:
        return False
    if a == b:
        return True
    n = min(len(a), len(b))
    limit = 0 if n <= 3 else 1 if n <= 6 else 2
    return limit > 0 and _distance(a, b, limit) <= limit


async def _former(db, ids) -> dict:
    from app.models.former_info import FormerInfo
    out = {}
    if not ids:
        return out
    for f in (await db.execute(select(FormerInfo).where(FormerInfo.entity_id.in_(ids)))).scalars():
        out.setdefault(f.entity_id, []).append((f.kind, f.value))
    return out


async def similar_contacts(db, first: str, last: str, email: str | None = None, phones=()) -> list[dict]:
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    from app.models.company import Company
    names = {norm(f"{first}{last}"), norm(f"{last}{first}")} - {""}
    mail = (email or "").strip().lower()
    tels = {digits(p) for p in phones} - {""}
    rows = (await db.execute(select(Contact))).scalars().all()
    former = await _former(db, [c.id for c in rows])
    found = []
    for c in rows:
        why = []
        own = [norm(f"{c.first_name}{c.last_name}")] + [norm(v) for k, v in former.get(c.id, []) if k == "name"]
        if any(same_name(n, o) for n in names for o in own):
            why.append("même nom")
        mails = {(x or "").strip().lower() for x in (c.email, c.email_other)} | {v.strip().lower() for k, v in former.get(c.id, []) if k == "email"}
        if mail and mail in mails:
            why.append("même courriel")
        theirs = {digits(x) for x in (c.phone, c.mobile, c.phone_other)} | {digits(v) for k, v in former.get(c.id, []) if k == "phone"}
        if tels & (theirs - {""}):
            why.append("même téléphone")
        if why:
            found.append((c, why))
    out = []
    for c, why in found[:5]:
        comps = (await db.execute(select(Company.name).join(ContactCompany, ContactCompany.company_id == Company.id)
                                  .where(ContactCompany.contact_id == c.id, ContactCompany.is_active == True))).scalars().all()
        out.append({"id": str(c.id), "nom": f"{c.first_name} {c.last_name}".strip(), "courriel": c.email or "",
                    "compagnies": ", ".join(comps), "actif": bool(c.is_active), "raison": ", ".join(why)})
    return out


async def similar_companies(db, name: str, phone: str | None = None) -> list[dict]:
    from app.models.company import Company
    n = norm_company(name)
    tel = digits(phone)
    rows = (await db.execute(select(Company))).scalars().all()
    former = await _former(db, [c.id for c in rows])
    out = []
    for c in rows:
        why = []
        own = [norm_company(c.name), norm_company(c.legal_name)] + [norm_company(v) for k, v in former.get(c.id, []) if k == "name"]
        if any(same_name(n, o) for o in own):
            why.append("même nom")
        theirs = {digits(c.office_phone)} | {digits(v) for k, v in former.get(c.id, []) if k == "phone"}
        if tel and tel in theirs:
            why.append("même téléphone")
        if why:
            out.append({"id": str(c.id), "nom": c.name, "actif": bool(c.is_active), "raison": ", ".join(why)})
    return out[:5]


def conflict(kind: str, matches: list[dict]):
    """409 que l'ecran transforme en « existe deja » (champ allow_duplicate=true pour creer quand meme)."""
    from fastapi import HTTPException
    raise HTTPException(status_code=409, detail={"code": "doublon", "type": kind, "matches": matches,
                                                 "message": f"{'Ce contact' if kind == 'contact' else 'Cette compagnie'} existe peut-être déjà"})
