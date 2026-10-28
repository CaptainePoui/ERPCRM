"""Options d'agenda reglables (TASK-026.10, 2026-10-27) -- Administration -> Configuration generale -> Agenda.

Avant : codees en dur (heures d'ouverture et 1re heure de RDV dans business_hours.py, durees/delais/horizon dans
appointments.py, marge de Zeko dans zeko_mail.py). Les valeurs par defaut ci-dessous sont exactement celles-la : rien
ne change tant qu'on ne touche pas a l'ecran. Un seul reglage JSON (app_settings « agenda_config »), relu au plus
toutes les 20 s dans chaque service (8010 et 8011) ; les fonctions synchrones lisent la derniere copie chargee.
"""
import copy
import json
import re
import time as _time

DEFAULTS = {
    # 0 = lundi ... 6 = dimanche ; null = ferme
    "hours": {"0": ["07:30", "16:30"], "1": ["07:30", "16:30"], "2": ["07:30", "16:30"], "3": ["07:30", "16:30"],
              "4": ["07:30", "12:00"], "5": None, "6": None},
    # Diner (TASK-026.13) : ferme au milieu de la journee ; null = pas de diner ce jour-la
    "lunch": {"0": ["12:00", "13:00"], "1": ["12:00", "13:00"], "2": ["12:00", "13:00"], "3": ["12:00", "13:00"],
              "4": None, "5": None, "6": None},
    "rdv_earliest_start": "09:30",      # un RDV (visite) pas avant ; un appel des l'ouverture
    "slot_minutes": 30,                 # pas entre deux debuts de plage
    "lookahead_days": 45,               # jusqu'ou on cherche une plage libre
    "appel_min_delay_hours": 1,         # un appel : au plus tot dans N heures
    "rdv_min_delay_days": 1,            # un RDV : au plus tot dans N jours (1 = demain)
    "durations": {"appel": {"default": 30, "min": 30, "max": 120, "step": 15},
                  "distance": {"default": 60, "min": 30, "max": 240, "step": 15},
                  "rdv": {"default": 60, "min": 60, "max": 420, "step": 30}},
    # Page publique /rdv (TASK-026.11) : plages calculees sur cette duree (le client choisit l'heure, puis le type)
    "online_slot_minutes": 60,
    # Techniciens affiches sur /rdv mais jamais disponibles : « aucune disponibilite avant » aujourd'hui + N mois
    "demo_techs": ["Sophie Bélanger", "Marc-André Lavoie", "Julien Côté"],
    "demo_months": 2.7,
    # Message au client qui accepte l'urgence sur /rdv (TASK-026.14)
    "urgent_notice": "Un texto va être envoyé au technicien de garde. Vous pouvez nous joindre en tout temps au "
                     "514-282-2009, option d'urgence 8, suivie du 2.",
    # Zeko (TASK-026.6) : plage proposee a un client qui veut deplacer son RDV
    "zeko_buffer_before": 30,           # minutes libres avant
    "zeko_buffer_after": 30,            # minutes libres apres
    "zeko_same_duration": True,         # meme duree que le RDV d'origine ; sinon zeko_fixed_duration
    "zeko_fixed_duration": 60,
}
KEY = "agenda_config"
_TTL = 20
_cache = {"at": 0.0, "cfg": copy.deepcopy(DEFAULTS)}
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _merge(raw: dict) -> dict:
    cfg = copy.deepcopy(DEFAULTS)
    for k, v in (raw or {}).items():
        if k in ("hours", "lunch", "durations") and isinstance(v, dict):
            for kk, vv in v.items():
                if kk in cfg[k]:
                    cfg[k][kk] = {**cfg[k][kk], **vv} if k == "durations" and isinstance(vv, dict) else vv
        elif k in cfg:
            cfg[k] = v
    return cfg


def current() -> dict:
    """Derniere copie chargee (appelants synchrones)."""
    return _cache["cfg"]


async def load(fresh: bool = False) -> dict:
    if not fresh and _time.monotonic() - _cache["at"] < _TTL:
        return _cache["cfg"]
    from app.core.database import AsyncSessionLocal
    from app.api.v1.endpoints.settings import get_setting
    async with AsyncSessionLocal() as db:
        raw = await get_setting(db, KEY)
    try:
        cfg = _merge(json.loads(raw) if raw else {})
    except (ValueError, TypeError):
        cfg = copy.deepcopy(DEFAULTS)
    _cache.update(at=_time.monotonic(), cfg=cfg)
    return cfg


def validate(data: dict) -> dict:
    """Refuse ce qui casserait la prise de RDV ; retourne la configuration complete."""
    cfg = _merge(data)
    for day, h in cfg["hours"].items():
        if h is None:
            continue
        if not (isinstance(h, list) and len(h) == 2 and all(isinstance(x, str) and _HHMM.match(x) for x in h) and h[0] < h[1]):
            raise ValueError("Heures d'ouverture : début et fin au format HH:MM, le début avant la fin")
    for day, l in cfg["lunch"].items():
        if l is None:
            continue
        h = cfg["hours"].get(day)
        if not (isinstance(l, list) and len(l) == 2 and all(isinstance(x, str) and _HHMM.match(x) for x in l) and l[0] < l[1]):
            raise ValueError("Dîner : début et fin au format HH:MM, le début avant la fin")
        if not h or l[0] < h[0] or l[1] > h[1]:
            raise ValueError("Dîner : doit être compris dans les heures d'ouverture du même jour")
    if not _HHMM.match(str(cfg["rdv_earliest_start"])):
        raise ValueError("Première heure d'un RDV : format HH:MM")
    ints = {"online_slot_minutes": (15, 480), "slot_minutes": (5, 120), "lookahead_days": (1, 365), "appel_min_delay_hours": (0, 72), "rdv_min_delay_days": (0, 30),
            "zeko_buffer_before": (0, 240), "zeko_buffer_after": (0, 240), "zeko_fixed_duration": (5, 600)}
    for k, (lo, hi) in ints.items():
        if not isinstance(cfg[k], int) or not lo <= cfg[k] <= hi:
            raise ValueError(f"Valeur hors limites : {k} ({lo} à {hi})")
    for kind, r in cfg["durations"].items():
        if not all(isinstance(r.get(x), int) and r[x] > 0 for x in ("default", "min", "max", "step")) or not r["min"] <= r["default"] <= r["max"]:
            raise ValueError(f"Durées ({kind}) : minimum ≤ par défaut ≤ maximum, en minutes")
    cfg["zeko_same_duration"] = bool(cfg["zeko_same_duration"])
    cfg["urgent_notice"] = str(cfg["urgent_notice"] or "").strip()[:500]
    if not isinstance(cfg["demo_techs"], list) or not all(isinstance(n, str) for n in cfg["demo_techs"]):
        raise ValueError("Techniciens affichés non disponibles : une liste de noms")
    cfg["demo_techs"] = [n.strip()[:60] for n in cfg["demo_techs"] if n.strip()][:10]
    try:
        cfg["demo_months"] = round(float(cfg["demo_months"]), 1)
    except (TypeError, ValueError):
        raise ValueError("Mois avant une disponibilité : un nombre")
    if not 0 < cfg["demo_months"] <= 24:
        raise ValueError("Mois avant une disponibilité : de 0,1 à 24")
    return cfg


async def save(db, data: dict) -> dict:
    from app.api.v1.endpoints.settings import set_setting
    cfg = validate(data)
    await set_setting(db, KEY, json.dumps(cfg))
    _cache.update(at=_time.monotonic(), cfg=cfg)
    return cfg
