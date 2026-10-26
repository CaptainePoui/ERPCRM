"""Versements au gouvernement (TASK-043.1, 2026-10-07, idee de Philippe : « on pourrait l'associer a une
taxe ou un impot, et si la depense est plus chere ca veut dire qu'il y a eu des frais de retard »).

Un retrait bancaire a Revenu Quebec ou a l'ARC se rattache a une obligation : TPS/TVQ d'un trimestre,
impot des societes d'une annee, retenues a la source d'un mois. Le montant DECLARE (saisi depuis les avis,
pas recalcule par ERPCRM) moins ce qui est deja paye = le reste du ; un versement au-dela = penalites et
interets (non deductibles). Sans montant declare : tout est compte comme paiement du du, signale.
"""
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import clock
from app.models.tax import TaxObligation, TaxPayment

KINDS = {"tps_tvq": "TPS/TVQ", "impot_societe": "Impôt des sociétés", "das": "Retenues à la source", "autre": "Autre versement"}
ZERO = Decimal("0.00")
C = Decimal("0.01")


async def obligation_status(db: AsyncSession, kind: str, start: date, end: date, exclude_payment_id=None) -> dict:
    ob = (await db.execute(select(TaxObligation).where(TaxObligation.kind == kind, TaxObligation.period_start == start,
                                                       TaxObligation.period_end == end))).scalar_one_or_none()
    q = select(func.coalesce(func.sum(TaxPayment.tps_amount + TaxPayment.tvq_amount + TaxPayment.amount), 0)).where(
        TaxPayment.kind == kind, TaxPayment.period_start == start, TaxPayment.period_end == end)
    if exclude_payment_id:
        q = q.where(TaxPayment.id != exclude_payment_id)
    paid = Decimal((await db.execute(q)).scalar())
    if ob is None:
        return {"declared": False, "due": None, "tps_due": None, "tvq_due": None, "paid": float(paid), "remaining": None}
    due = (ob.tps_due + ob.tvq_due) if kind == "tps_tvq" else ob.amount_due
    return {"declared": True, "due": float(due), "tps_due": float(ob.tps_due), "tvq_due": float(ob.tvq_due),
            "paid": float(paid), "remaining": float(max(ZERO, due - paid)), "notes": ob.notes}


def split(amount: Decimal, status: dict, kind: str, fallback_ratio: Decimal | None = None) -> dict:
    """Part qui paie le du / penalites et interets ; pour TPS/TVQ, part TPS et part TVQ."""
    if status["declared"]:
        applied = min(amount, Decimal(str(status["remaining"])))
    else:
        applied = amount
    penalty = amount - applied
    tps = tvq = ZERO
    if kind == "tps_tvq":
        if status["declared"] and (status["tps_due"] + status["tvq_due"]) != 0:
            ratio = Decimal(str(status["tps_due"])) / Decimal(str(status["tps_due"] + status["tvq_due"]))
        else:
            ratio = fallback_ratio if fallback_ratio is not None else Decimal("5") / Decimal("14.975")
        tps = (applied * ratio).quantize(C)
        tvq = applied - tps
    return {"applied": float(applied), "penalty": float(penalty), "tps": float(tps), "tvq": float(tvq),
            "amount": float(applied) if kind != "tps_tvq" else 0.0}


def period_options(kind: str, fiscal_start_month: int, today: date | None = None) -> list[dict]:
    """Periodes proposees : trimestres (TPS/TVQ), annees d'imposition, mois (retenues)."""
    from app.core.tax_reminders import _add_months
    today = today or clock.today()
    out = []
    if kind == "tps_tvq":
        start = date(today.year if today.month >= fiscal_start_month else today.year - 1, fiscal_start_month, 1)
        while _add_months(start, 3) <= today:
            start = _add_months(start, 3)
        for _ in range(16):
            out.append({"start": start, "end": _add_months(start, 3) - timedelta(days=1)})
            start = _add_months(start, -3)
    elif kind == "impot_societe":
        y = today.year if today.month >= fiscal_start_month else today.year - 1
        for k in range(6):
            s = date(y - k, fiscal_start_month, 1)
            out.append({"start": s, "end": _add_months(s, 12) - timedelta(days=1)})
    else:
        s = date(today.year, today.month, 1)
        for _ in range(24):
            out.append({"start": s, "end": _add_months(s, 1) - timedelta(days=1)})
            s = _add_months(s, -1)
    return out
