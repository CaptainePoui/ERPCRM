"""Factures de frais de retard (TASK-005.14, 2026-10-07).

Regles de Philippe : 24 % par annee = 2 % par mois, plus des frais de gestion de 9,95 $ par avis de retard ; le
client a 30 jours pour payer (echeance), mais les frais partent 15 jours plus tard (« histoire de laisser un cheque
arriver par la poste »), puis un nouvel avis chaque 30 jours tant que c'est impaye. Les 2 % portent sur TOUT le
solde en retard du client, factures de retard comprises (« si le client est a 2 factures impayees, le 2 % est sur
la 1re facture, la facture de frais et la 2e facture ») -> UNE facture de retard par client et par periode.
Aucune taxe (des frais exiges pour un paiement en retard ne sont pas une vente de service). Jamais compte : une
facture « a regler en troc » (la marque est sur la facture, pas sur le client : une facture sans la marque se paie
comme tout le monde), un brouillon, une facture annulee ou payee, un avoir, une facture pas encore echue.
Mise en marche par Philippe dans Parametres (eteinte au depart : « pas tant que tout n'est pas fluide ») ; les
factures creees sont emises mais non transmises (c'est Philippe qui les envoie). Les avis deja faits, y compris par
l'ancien logiciel (factures de retard reliees par la migration 8e756bdf15d8), comptent : jamais deux avis au meme
client a moins de 30 jours ; les periodes manquees ne sont pas rattrapees d'un coup.
"""
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import select, func

from app.core import clock

KEYS = {
    "late_fees_enabled": "false",
    "late_fee_monthly_rate": "2",       # % par periode (24 % par annee)
    "late_fee_admin": "9.95",           # frais de gestion par facture de retard
    "late_fee_grace_days": "15",        # jours apres l'echeance avant la premiere facture de retard
    "late_fee_interval_days": "30",     # jours entre deux factures de retard
}
OPEN_STATUSES = ("envoyee", "en_retard", "partiellement_payee")
CENT = Decimal("0.01")


def _m(v) -> Decimal:
    return Decimal(str(v)).quantize(CENT, rounding=ROUND_HALF_UP)


def _fr(v) -> str:
    """1234.5 -> « 1 234,50 » (texte des factures)."""
    return f"{_m(v):,.2f}".replace(",", " ").replace(".", ",")


async def config(db) -> dict:
    from app.api.v1.endpoints.settings import get_setting
    raw = {k: (await get_setting(db, k)) or d for k, d in KEYS.items()}
    return {"enabled": raw["late_fees_enabled"] == "true", "rate": Decimal(raw["late_fee_monthly_rate"]),
            "admin": _m(raw["late_fee_admin"]), "grace": int(raw["late_fee_grace_days"]),
            "interval": int(raw["late_fee_interval_days"])}


async def candidates(db, cfg: dict | None = None, today: date | None = None) -> list[dict]:
    """Clients a qui un avis de retard est du aujourd'hui (rien n'est ecrit) : au moins une facture (ou facture de
    retard) en retard depuis l'echeance + 15 jours, et aucun avis depuis 30 jours. Base des 2 % = solde de toutes
    ses factures echues non payees."""
    from app.models.invoice import Invoice
    from app.models.company import Company
    from app.api.v1.endpoints.payments import settled_amounts
    cfg = cfg or await config(db)
    today = today or clock.today()
    rows = (await db.execute(select(Invoice).where(
        Invoice.status.in_(OPEN_STATUSES), Invoice.credit_of_id.is_(None), Invoice.barter_settlement.is_(False),
        Invoice.total > 0, Invoice.due_date <= today).order_by(Invoice.due_date, Invoice.number))).scalars().all()
    if not rows:
        return []
    paid = await settled_amounts(db, [i.id for i in rows])
    by_company: dict = {}
    for inv in rows:
        bal = _m(Decimal(inv.total) - (paid.get(inv.id) or Decimal("0")))
        if bal > 0:
            by_company.setdefault(inv.company_id, []).append((inv, bal))
    last_notice = dict((await db.execute(select(Invoice.company_id, func.max(Invoice.issue_date)).where(
        Invoice.late_fee_for_id.is_not(None), Invoice.credit_of_id.is_(None),
        Invoice.company_id.in_(list(by_company))).group_by(Invoice.company_id))).all())
    names = dict((await db.execute(select(Company.id, Company.name).where(Company.id.in_(list(by_company))))).all())
    out = []
    for cid, items in by_company.items():
        late = [(i, b) for i, b in items if i.due_date + timedelta(days=cfg["grace"]) <= today]
        if not late:
            continue
        last = last_notice.get(cid)
        if last and (today - last).days < cfg["interval"]:
            continue
        base = sum((b for _i, b in items), Decimal("0"))
        out.append({"company_id": cid, "company_name": names.get(cid), "invoices": items, "oldest": late[0][0],
                    "base": _m(base), "last_notice": last,
                    "interest": _m(base * cfg["rate"] / 100), "admin": cfg["admin"]})
    return sorted(out, key=lambda c: c["oldest"].due_date)


async def create_fee_invoice(db, c: dict, cfg: dict, today: date | None = None):
    """L'avis de retard d'un client : 2 % du solde en retard + frais de gestion, sans taxes, emis non transmis.
    late_fee_for_id = sa plus vieille facture en retard. Ne fait pas le commit."""
    from app.models.invoice import Invoice, InvoiceLine
    from app.api.v1.endpoints.invoices import _next_number, _recalc, _get_inv
    src, today = c["oldest"], today or clock.today()
    rate = f"{cfg['rate'].normalize():f}".replace(".", ",")
    detail = ", ".join(f"{i.number} ({_fr(b)} $)" for i, b in c["invoices"])
    inv = Invoice(number=await _next_number(db), company_id=c["company_id"],
                  issue_date=today, due_date=today + timedelta(days=30), status="envoyee", transmission_status="non_transmise",
                  apply_tps=False, apply_tvq=False, late_fee_for_id=src.id,
                  notes=f"Solde en retard au {today.isoformat()} : {_fr(c['base'])} $ — {detail}.")
    db.add(inv)
    await db.flush()
    db.add(InvoiceLine(invoice_id=inv.id, description=f"Frais de retard ({rate} %) sur le solde en retard de {_fr(c['base'])} $",
                       qty=1, unit_price=float(c["interest"]), line_total=c["interest"], sort_order=0, is_taxable=False))
    db.add(InvoiceLine(invoice_id=inv.id, description="Frais de gestion — avis de retard de paiement", qty=1,
                       unit_price=float(c["admin"]), line_total=c["admin"], sort_order=1, is_taxable=False))
    await db.flush()
    inv = await _get_inv(inv.id, db)
    _recalc(inv)
    return inv


async def run(db) -> int:
    """Cree les avis de retard dus (seulement si la mise en marche est activee). Retourne le nombre cree."""
    cfg = await config(db)
    if not cfg["enabled"]:
        return 0
    n = 0
    for c in await candidates(db, cfg):
        await create_fee_invoice(db, c, cfg)
        await db.commit()
        n += 1
    return n


def terms_text(cfg: dict) -> str:
    """Mention obligatoire du taux annuel (Loi sur l'interet : un taux par mois doit etre accompagne de son
    equivalent annuel), imprimee en petit au bas des factures."""
    rate = cfg["rate"]
    yearly = (rate * 12).normalize()
    fmt = lambda d: f"{d.normalize():f}".replace(".", ",")
    return (f"Tout solde impayé à l'échéance porte intérêt à {fmt(rate)} % par mois ({fmt(yearly)} % par année), "
            f"plus des frais de gestion de {_fr(cfg['admin'])} $ par avis de retard.")
