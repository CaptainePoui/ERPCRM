"""Blocage après des mauvais mots de passe (TASK-001.1, GO de Philippe 2026-11-01 : « 3 chances, sinon bloqué pour 5 min ;
3 autres : 1 h ; 3 autres : banni, doit demander au gestionnaire de faire une demande ou doit me contacter, administrateur »).

Par compte (users.failed_logins, lock_step, locked_until, banned_at). Les paliers se règlent dans Administration ->
Configuration -> Général (app_settings « login_security », même modèle que core/notifications.py) : nombre d'essais et
durée ; durée 0 = bloqué jusqu'à ce qu'un administrateur débloque le compte. Une connexion réussie remet tout à zéro.
Pendant un blocage, même le bon mot de passe est refusé.
"""
import copy
import json
import time as _time
from datetime import datetime, timedelta, timezone

DEFAULTS = {"steps": [{"attempts": 3, "minutes": 5}, {"attempts": 3, "minutes": 60}, {"attempts": 3, "minutes": 0}]}
KEY = "login_security"
BANNED = ("Compte bloqué après trop d'essais. Demande à ton gestionnaire de faire débloquer ton compte, "
          "ou contacte l'administrateur.")
# TASK-001.2 : le portail client a ses propres paliers (réglables séparément) et son propre message de blocage
PORTAL_KEY = "portal_login_security"
PORTAL_BANNED = ("Accès bloqué après trop d'essais. Demande au gestionnaire de ton entreprise de débloquer ton accès, "
                 "ou contacte Simple IP.")
_TTL = 20
_caches = {KEY: {"at": 0.0, "cfg": copy.deepcopy(DEFAULTS)}, PORTAL_KEY: {"at": 0.0, "cfg": copy.deepcopy(DEFAULTS)}}


def validate(data: dict) -> dict:
    steps = (data or {}).get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError("Au moins un palier")
    out = []
    for n, st in enumerate(steps, 1):
        try:
            a, m = int(st.get("attempts")), int(st.get("minutes"))
        except (TypeError, ValueError, AttributeError):
            raise ValueError(f"Palier {n} : un nombre d'essais et une durée en minutes")
        if not 1 <= a <= 20:
            raise ValueError(f"Palier {n} : de 1 à 20 essais")
        if not 0 <= m <= 60 * 24 * 30:
            raise ValueError(f"Palier {n} : durée de 0 (débloqué par un administrateur) à 43 200 minutes")
        out.append({"attempts": a, "minutes": m})
    return {"steps": out}


async def load(fresh: bool = False, key: str = KEY) -> dict:
    _cache = _caches[key]
    if not fresh and _time.monotonic() - _cache["at"] < _TTL:
        return _cache["cfg"]
    from app.core.database import AsyncSessionLocal
    from app.api.v1.endpoints.settings import get_setting
    async with AsyncSessionLocal() as db:
        raw = await get_setting(db, key)
    try:
        cfg = validate(json.loads(raw)) if raw else copy.deepcopy(DEFAULTS)
    except (ValueError, TypeError):
        cfg = copy.deepcopy(DEFAULTS)
    _cache.update(at=_time.monotonic(), cfg=cfg)
    return cfg


async def save(db, data: dict, key: str = KEY) -> dict:
    from app.api.v1.endpoints.settings import set_setting
    cfg = validate(data)
    await set_setting(db, key, json.dumps(cfg))
    _caches[key].update(at=_time.monotonic(), cfg=cfg)
    return cfg


def refusal(user, now: datetime | None = None, banned_msg: str = BANNED) -> tuple[int, str] | None:
    """(code HTTP, message) si le compte est bloqué en ce moment, sinon None."""
    now = now or datetime.now(timezone.utc)
    if user.banned_at:
        return 403, banned_msg
    if user.locked_until and user.locked_until > now:
        mins = max(1, int((user.locked_until - now).total_seconds() + 59) // 60)
        return 429, f"Trop d'essais. Réessaie dans {mins} minute{'s' if mins > 1 else ''}."
    return None


def failed(user, cfg: dict, now: datetime | None = None, banned_msg: str = BANNED) -> str:
    """Compte un mauvais mot de passe ; applique le palier atteint. Renvoie le message à montrer. Ne fait pas le commit."""
    now = now or datetime.now(timezone.utc)
    steps = cfg["steps"]
    step = steps[min(user.lock_step or 0, len(steps) - 1)]
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins < step["attempts"]:
        left = step["attempts"] - user.failed_logins
        return f"Courriel ou mot de passe invalide ({left} essai{'s' if left > 1 else ''} avant le blocage)."
    user.failed_logins = 0
    user.lock_step = (user.lock_step or 0) + 1
    if step["minutes"] == 0:
        user.banned_at = now
        return banned_msg
    user.locked_until = now + timedelta(minutes=step["minutes"])
    return refusal(user, now, banned_msg)[1]


def succeeded(user) -> None:
    user.failed_logins, user.lock_step, user.locked_until, user.banned_at = 0, 0, None, None


def unlock(user) -> None:
    """Déblocage par un administrateur."""
    succeeded(user)


def state(user, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    return {"banned": bool(user.banned_at), "banned_at": user.banned_at,
            "locked_until": user.locked_until if user.locked_until and user.locked_until > now else None,
            "failed_logins": user.failed_logins or 0}
