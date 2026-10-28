"""
Heures d'ouverture + jours feries du Quebec pour le module RDV en ligne (TASK-026).

Horaire : reglable (TASK-026.10) ; par defaut lundi-jeudi 7h30-16h30, vendredi 7h30-12h00, ferme samedi/dimanche.
Feries : les 8 conges statutaires prevus par la Loi sur les normes du travail du
Quebec (Vendredi saint retenu plutot que Lundi de Paques, choix le plus courant).
"""
from datetime import date, time, timedelta
from dateutil.easter import easter

# Heures d'ouverture, 1re heure de RDV et pas des plages : reglables (TASK-026.10, core/agenda_config.py) ;
# valeurs par defaut = lundi-jeudi 7h30-16h30, vendredi 7h30-12h00, ferme la fin de semaine, RDV pas avant 9h30,
# pas de 30 min.


def _t(hhmm: str) -> time:
    h, m = hhmm.split(":")
    return time(int(h), int(m))


def hours_map() -> dict[int, tuple[time, time]]:
    from app.core.agenda_config import current
    return {int(d): (_t(h[0]), _t(h[1])) for d, h in current()["hours"].items() if h}


def lunch_for(d: date) -> tuple[time, time] | None:
    """Diner de ce jour (TASK-026.13), ou None."""
    from app.core.agenda_config import current
    l = current()["lunch"].get(str(d.weekday()))
    return (_t(l[0]), _t(l[1])) if l else None


def rdv_earliest_start() -> time:
    from app.core.agenda_config import current
    return _t(current()["rdv_earliest_start"])


def slot_minutes() -> int:
    from app.core.agenda_config import current
    return int(current()["slot_minutes"])


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    """n-ieme occurrence (1-indexe) d'un jour de semaine (0=lundi) dans un mois."""
    d = date(year, month, 1)
    offset = (weekday - d.weekday()) % 7
    d += timedelta(days=offset + 7 * (n - 1))
    return d


def _last_weekday_before(target: date, weekday: int) -> date:
    d = target
    while d.weekday() != weekday:
        d -= timedelta(days=1)
    return d


def quebec_holidays(year: int) -> set[date]:
    good_friday = easter(year) - timedelta(days=2)
    patriotes = _last_weekday_before(date(year, 5, 25), 0)  # lundi avant le 25 mai
    labour_day = _nth_weekday(year, 9, 0, 1)                # 1er lundi de septembre
    thanksgiving = _nth_weekday(year, 10, 0, 2)             # 2e lundi d'octobre
    return {
        date(year, 1, 1),   # Jour de l'An
        good_friday,        # Vendredi saint
        patriotes,          # Journee nationale des patriotes
        date(year, 6, 24),  # Fete nationale du Quebec
        date(year, 7, 1),   # Fete du Canada
        labour_day,         # Fete du Travail
        thanksgiving,       # Action de grace
        date(year, 12, 25), # Noel
    }


def is_business_day(d: date) -> bool:
    return d.weekday() in hours_map() and d not in quebec_holidays(d.year)


def business_hours_for(d: date) -> tuple[time, time] | None:
    if not is_business_day(d):
        return None
    return hours_map()[d.weekday()]
