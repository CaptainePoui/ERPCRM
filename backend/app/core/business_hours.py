"""
Heures d'ouverture + jours feries du Quebec pour le module RDV en ligne (TASK-026).

Horaire : lundi-jeudi 7h30-16h30, vendredi 7h30-12h00, ferme samedi/dimanche.
Feries : les 8 conges statutaires prevus par la Loi sur les normes du travail du
Quebec (Vendredi saint retenu plutot que Lundi de Paques, choix le plus courant).
"""
from datetime import date, time, timedelta
from dateutil.easter import easter

BUSINESS_HOURS: dict[int, tuple[time, time]] = {
    0: (time(7, 30), time(16, 30)),  # lundi
    1: (time(7, 30), time(16, 30)),  # mardi
    2: (time(7, 30), time(16, 30)),  # mercredi
    3: (time(7, 30), time(16, 30)),  # jeudi
    4: (time(7, 30), time(12, 0)),   # vendredi
    # 5 (samedi), 6 (dimanche) : absents = ferme
}

SLOT_GRANULARITY_MINUTES = 30

# Heure de debut la plus tot pour un RDV (visite) -- un Appel peut demarrer des
# l'ouverture, un RDV pas avant 9h30.
RDV_EARLIEST_START = time(9, 30)


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
    return d.weekday() in BUSINESS_HOURS and d not in quebec_holidays(d.year)


def business_hours_for(d: date) -> tuple[time, time] | None:
    if not is_business_day(d):
        return None
    return BUSINESS_HOURS[d.weekday()]
