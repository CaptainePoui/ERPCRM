"""Horloge de l'entreprise : quel jour on est, selon son fuseau horaire (2026-10-07/08).

Le serveur tourne en UTC : `date.today()` donnait le lendemain des 20 h, heure du Quebec (facture des textos de
D'Astous Auto datee du 8 octobre au lieu du 7). Philippe : « c'est super important que tout le ERPCRM et le SIPV soit
au bon fuseau horaire… le serveur est ici a Montreal ». Toute date « d'aujourd'hui » du backend passe par today() ;
les horodatages techniques restent en UTC (colonnes timezone=True). Fuseau configurable dans Parametres (logiciel
destine a etre vendu) ; relu au demarrage puis chaque minute par chaque processus (ports 8010 et 8011).
"""
import asyncio
import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

log = logging.getLogger("clock")

DEFAULT_TZ = "America/Toronto"      # Montreal (meme fuseau ; « America/Montreal » est un ancien alias)
SETTING_KEY = "business_timezone"
_REFRESH_SECONDS = 60

_tz = ZoneInfo(DEFAULT_TZ)


def validate(name: str) -> str:
    name = (name or "").strip()
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError(f"Fuseau horaire inconnu : « {name} »")
    return name


def set_business_tz(name: str) -> None:
    global _tz
    _tz = ZoneInfo(validate(name))


def business_tz() -> ZoneInfo:
    return _tz


def now() -> datetime:
    """Maintenant, a l'heure de l'entreprise (datetime avec fuseau)."""
    return datetime.now(_tz)


def today() -> date:
    """Aujourd'hui, a l'heure de l'entreprise -- a utiliser partout a la place de date.today()."""
    return datetime.now(_tz).date()


def zones() -> list[str]:
    return sorted(z for z in available_timezones() if "/" in z and not z.startswith(("Etc/", "SystemV/", "posix/", "right/")))


async def load() -> None:
    from app.core.database import AsyncSessionLocal
    from app.api.v1.endpoints.settings import get_setting
    async with AsyncSessionLocal() as db:
        name = (await get_setting(db, SETTING_KEY)) or DEFAULT_TZ
    try:
        set_business_tz(name)
    except ValueError:
        log.error("Fuseau horaire « %s » invalide dans les parametres, %s utilise", name, DEFAULT_TZ)
        set_business_tz(DEFAULT_TZ)


async def run_refresher() -> None:
    """Relit le fuseau chaque minute (un changement fait par l'autre processus est pris en compte)."""
    while True:
        try:
            await load()
        except Exception:
            log.exception("Lecture du fuseau horaire echouee")
        await asyncio.sleep(_REFRESH_SECONDS)
