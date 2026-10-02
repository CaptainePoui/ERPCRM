"""Graphique de l'onglet Banque (TASK-042) : entrees, sorties et solde regroupes par periode.

Regroupements : jour, semaine (lundi), 2 semaines, mois, semestre (jan-juin / juil-dec),
annee civile, annee imposable (exercice qui commence au mois `fiscal_start_month`).
Chaque regroupement affiche un nombre fixe de periodes se terminant a la periode
courante ; `offset` recule d'autant de periodes.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

GRANULARITIES = ("day", "week", "biweek", "month", "semester", "year", "fiscal_year")

# Nombre de periodes affichees par regroupement (~ periode lisible)
BUCKET_COUNT = {"day": 30, "week": 12, "biweek": 13, "month": 12, "semester": 6, "year": 5, "fiscal_year": 5}

# Lundi de reference : les paires de semaines restent les memes d'un affichage a l'autre
_BIWEEK_EPOCH = date(2024, 1, 1)

_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _add_months(d: date, n: int) -> date:
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def bucket_start(d: date, g: str, fiscal_start_month: int = 1) -> date:
    if g == "day":
        return d
    if g == "week":
        return d - timedelta(days=d.weekday())
    if g == "biweek":
        monday = d - timedelta(days=d.weekday())
        pairs = (monday - _BIWEEK_EPOCH).days // 14
        return _BIWEEK_EPOCH + timedelta(days=pairs * 14)
    if g == "month":
        return d.replace(day=1)
    if g == "semester":
        return date(d.year, 1 if d.month <= 6 else 7, 1)
    if g == "year":
        return date(d.year, 1, 1)
    if g == "fiscal_year":
        fm = fiscal_start_month
        return date(d.year if d.month >= fm else d.year - 1, fm, 1)
    raise ValueError(g)


def shift(start: date, g: str, n: int) -> date:
    """Debut de la periode situee n periodes plus loin (n negatif = en arriere)."""
    if g == "day":
        return start + timedelta(days=n)
    if g == "week":
        return start + timedelta(days=7 * n)
    if g == "biweek":
        return start + timedelta(days=14 * n)
    if g == "month":
        return _add_months(start, n)
    if g == "semester":
        return _add_months(start, 6 * n)
    if g in ("year", "fiscal_year"):
        return _add_months(start, 12 * n)
    raise ValueError(g)


def label(start: date, g: str, fiscal_start_month: int = 1) -> str:
    if g == "day":
        return f"{start.day} {_MONTHS[start.month - 1]}"
    if g == "week":
        return f"sem. {start.day} {_MONTHS[start.month - 1]}"
    if g == "biweek":
        return f"{start.day} {_MONTHS[start.month - 1]}"
    if g == "month":
        return f"{_MONTHS[start.month - 1]} {start.year}"
    if g == "semester":
        return f"S{1 if start.month == 1 else 2} {start.year}"
    if g == "year":
        return str(start.year)
    if g == "fiscal_year":
        return str(start.year) if fiscal_start_month == 1 else f"{start.year}-{start.year + 1}"
    raise ValueError(g)


@dataclass
class AccountSeries:
    """Transactions d'un compte + solde connu (releve) pour reconstituer le solde a toute date."""
    transactions: list[tuple[date, Decimal]]
    balance: Decimal | None = None
    balance_date: date | None = None

    def balance_at(self, d: date) -> Decimal | None:
        """Solde en fin de journee d. None si inconnu (pas de solde, ou avant les donnees importees)."""
        if self.balance is None or self.balance_date is None or not self.transactions:
            return None
        if d < min(t[0] for t in self.transactions):
            return None
        bal = self.balance
        for td, amt in self.transactions:
            if d < td <= self.balance_date:
                bal -= amt
            elif self.balance_date < td <= d:
                bal += amt
        return bal


def build_chart(series: list[AccountSeries], g: str, today: date, offset: int = 0, fiscal_start_month: int = 1) -> dict:
    n = BUCKET_COUNT[g]
    last = shift(bucket_start(today, g, fiscal_start_month), g, -offset * n)
    starts = [shift(last, g, -i) for i in range(n - 1, -1, -1)]
    range_start, range_end = starts[0], shift(last, g, 1) - timedelta(days=1)

    buckets = []
    any_balance = any(s.balance is not None for s in series)
    for st in starts:
        end = shift(st, g, 1) - timedelta(days=1)
        dep = sum((a for s in series for d, a in s.transactions if st <= d <= end and a > 0), Decimal("0"))
        wd = sum((-a for s in series for d, a in s.transactions if st <= d <= end and a < 0), Decimal("0"))
        bal = None
        if any_balance and st <= today:
            # Fin de periode plafonnee a aujourd'hui (periode en cours)
            values = [s.balance_at(min(end, today)) for s in series if s.balance is not None]
            known = [v for v in values if v is not None]
            bal = float(sum(known)) if known and len(known) == len(values) else None
        buckets.append({
            "label": label(st, g, fiscal_start_month),
            "start": st, "end": end,
            "deposits": float(dep), "withdrawals": float(wd), "balance": bal,
        })

    all_dates = [d for s in series for d, _ in s.transactions]
    return {
        "granularity": g,
        "offset": offset,
        "range_start": range_start,
        "range_end": range_end,
        "buckets": buckets,
        "totals": {
            "deposits": round(sum(b["deposits"] for b in buckets), 2),
            "withdrawals": round(sum(b["withdrawals"] for b in buckets), 2),
        },
        "has_balance": any_balance,
        "has_older": bool(all_dates) and min(all_dates) < range_start,
        "has_newer": offset > 0,
    }
