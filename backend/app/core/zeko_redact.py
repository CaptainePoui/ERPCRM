"""Expurgation locale avant tout envoi a une IA externe (TASK-006.5 etape 4, 2026-10-18 ; cahier Zeko : « expurgation
locale texte/images, journal complet local »). Les donnees des clients restent chez Simple IP : courriels, numeros de
telephone, adresses IP/MAC, codes postaux, adresses civiques et NOMS connus d'ERPCRM (clients, personnes) sont
remplaces par des etiquettes avant l'envoi."""
import re
import time
import unicodedata

from sqlalchemy import select

_cache = {"at": 0.0, "names": []}

_PATTERNS = [
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[courriel]"),
    (re.compile(r"\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b"), "[adresse MAC]"),
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b"), "[adresse IP]"),
    (re.compile(r"(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)"), "[téléphone]"),
    (re.compile(r"\b[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d\b"), "[code postal]"),
    (re.compile(r"\b\d{1,6}[,]?\s+(?:rue|boul(?:evard)?\.?|blvd|avenue|av\.?|ch(?:emin)?\.?|route|rang|place|montée)\s+[^\n,;]{2,40}", re.I), "[adresse]"),
]


def _fold(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


async def _names() -> list[tuple[str, str]]:
    """Noms de clients et de personnes d'ERPCRM (relus au plus toutes les 10 min), du plus long au plus court."""
    if _cache["names"] and time.monotonic() - _cache["at"] < 600:
        return _cache["names"]
    from app.core.database import AsyncSessionLocal
    from app.models.company import Company
    from app.models.contact import Contact
    out = []
    async with AsyncSessionLocal() as db:
        for (n,) in (await db.execute(select(Company.name))).all():
            if n and len(n.strip()) >= 3:
                out.append((n.strip(), "[client]"))
        for fn, ln in (await db.execute(select(Contact.first_name, Contact.last_name))).all():
            full = f"{fn or ''} {ln or ''}".strip()
            if len(full) >= 4:
                out.append((full, "[personne]"))
            if ln and len(ln.strip()) >= 4:
                out.append((ln.strip(), "[personne]"))
    out.sort(key=lambda x: -len(x[0]))
    _cache.update(at=time.monotonic(), names=out)
    return out


async def redact(text: str) -> str:
    for rx, label in _PATTERNS:
        text = rx.sub(label, text)
    folded = _fold(text)
    for name, label in await _names():
        f = _fold(name)
        start = 0
        while True:
            i = folded.find(f, start)
            if i < 0:
                break
            j = i + len(f)
            if (i == 0 or not folded[i - 1].isalnum()) and (j >= len(folded) or not folded[j].isalnum()):
                text = text[:i] + label + text[j:]
                folded = folded[:i] + _fold(label) + folded[j:]
                start = i + len(label)
            else:
                start = j
    return text
