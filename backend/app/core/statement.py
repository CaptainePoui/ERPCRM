"""État de compte d'un client (TASK-005.31, GO de Philippe 2026-11-01 : « go, on le met dans l'onglet Transactions »).

« Voici tout ce que vous nous devez » : factures ouvertes (reste à payer), vieillissement (courant, 1-30, 31-60, 61-90,
plus de 90 jours de retard), avoirs disponibles, paiements reçus de la période, solde. Mêmes montants que l'onglet
Transactions (companies.company_finance : paiements confirmés + avoirs appliqués). PDF avec les coordonnées du
propriétaire (même allure que les factures, core/doc_pdf.py), envoi par courriel au courriel de facturation.
"""
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select

BUCKETS = [("courant", "Pas encore dû"), ("1_30", "1 à 30 jours"), ("31_60", "31 à 60 jours"), ("61_90", "61 à 90 jours"),
           ("90_plus", "Plus de 90 jours")]


def _bucket(due: date | None, today: date) -> str:
    late = (today - due).days if due else 0
    return "courant" if late <= 0 else "1_30" if late <= 30 else "31_60" if late <= 60 else "61_90" if late <= 90 else "90_plus"


async def build(db, company_id, start: date | None = None, end: date | None = None) -> dict:
    from app.api.v1.endpoints.companies import company_finance
    from app.models.client_payment import ClientPayment
    from app.models.company import Company
    from app.core import clock
    today = clock.today()
    end = end or today
    start = start or (end - timedelta(days=90))
    co = await db.get(Company, company_id)
    fin = await company_finance(company_id, db=db, _=None)
    open_inv = [t for t in fin["transactions"] if t["kind"] == "invoice" and t["remaining"] > 0.005
                and t["status"] not in ("brouillon", "annulee")]
    aging = {k: 0.0 for k, _ in BUCKETS}
    for t in open_inv:
        due = date.fromisoformat(str(t["due_date"])) if t.get("due_date") else None
        t["bucket"] = _bucket(due, today)
        t["days_late"] = max(0, (today - due).days) if due else 0
        aging[t["bucket"]] += t["remaining"]
    pays = (await db.execute(select(ClientPayment).where(
        ClientPayment.company_id == company_id, ClientPayment.status == "confirmed",
        ClientPayment.received_at >= start, ClientPayment.received_at <= end).order_by(ClientPayment.received_at))).scalars().all()
    owed = round(sum(t["remaining"] for t in open_inv), 2)
    credits = round(fin["summary"].get("credits_available") or 0, 2)
    return {"company": {"id": str(co.id), "name": co.name, "account_number": co.account_number, "billing_email": co.billing_email},
            "date": today.isoformat(), "start": start.isoformat(), "end": end.isoformat(),
            "invoices": sorted(open_inv, key=lambda t: (t.get("due_date") or "", t.get("number") or "")),
            "aging": {k: round(v, 2) for k, v in aging.items()}, "aging_labels": dict(BUCKETS),
            "payments": [{"date": p.received_at.isoformat() if p.received_at else None, "amount": float(p.amount),
                          "method": p.method_name, "reference": p.reference} for p in pays],
            "owed": owed, "credits": credits, "balance": round(owed - credits, 2)}


async def pdf(db, data: dict) -> tuple[bytes, str]:
    from app.core.doc_pdf import _e, _page, _seller
    from app.core.invoice_pdf import _money
    _name, seller = await _seller(db)
    c = data["company"]
    rows = "".join(f"<tr><td>{_e(t['number'])}</td><td>{_e(t.get('issue_date'))}</td><td>{_e(t.get('due_date'))}</td>"
                   f"<td class='r'>{t['days_late'] or ''}</td><td class='r'>{_money(t['total'])}</td>"
                   f"<td class='r'>{_money(t['total'] - t['remaining'])}</td><td class='r'><b>{_money(t['remaining'])}</b></td></tr>"
                   for t in data["invoices"]) or "<tr><td colspan='7' class='muted'>Aucune facture à payer.</td></tr>"
    aging = "".join(f"<td class='r'>{_money(data['aging'][k])}</td>" for k in data["aging_labels"])
    pays = "".join(f"<tr><td>{_e(p['date'])}</td><td>{_e(p['method'])}</td><td>{_e(p['reference'])}</td><td class='r'>{_money(p['amount'])}</td></tr>"
                   for p in data["payments"]) or "<tr><td colspan='4' class='muted'>Aucun paiement reçu dans la période.</td></tr>"
    body = f"""
<style>table.st {{ width:100%; border-collapse:collapse; font-size:9pt; margin-bottom:10px }} table.st th, table.st td {{ padding:4px 6px; border-bottom:1px solid #ddd; text-align:left }}
table.st .r {{ text-align:right }} .big {{ font-size:13pt }}</style>
<div class="facts"><strong>{_e(c['name'])}</strong>{(' — ' + _e(c['account_number'])) if c.get('account_number') else ''}<br>
État de compte au {_e(data['date'])} · paiements du {_e(data['start'])} au {_e(data['end'])}</div>
<div class="section-title">Factures à payer</div>
<table class="st"><tr><th>Facture</th><th>Date</th><th>Échéance</th><th class="r">Jours de retard</th><th class="r">Total</th><th class="r">Payé / crédité</th><th class="r">Reste</th></tr>{rows}</table>
<div class="section-title">Vieillissement du solde</div>
<table class="st"><tr>{''.join(f"<th class='r'>{_e(l)}</th>" for l in data['aging_labels'].values())}</tr><tr>{aging}</tr></table>
<div class="section-title">Paiements reçus dans la période</div>
<table class="st"><tr><th>Date</th><th>Mode</th><th>Référence</th><th class="r">Montant</th></tr>{pays}</table>
<table class="st" style="width:50%;margin-left:50%">
<tr><td>Total des factures à payer</td><td class="r">{_money(data['owed'])}</td></tr>
<tr><td>Avoirs disponibles</td><td class="r">− {_money(data['credits'])}</td></tr>
<tr><td class="big"><b>Solde</b></td><td class="r big"><b>{_money(data['balance'])}</b></td></tr></table>"""
    out = _page(seller, "ÉTAT DE COMPTE", data["date"], body, "Merci de votre confiance.")
    safe = "".join(ch for ch in (c.get("account_number") or c["name"]) if ch.isalnum() or ch in "-_")[:40]
    return out, f"etat-de-compte-{safe}-{data['date']}.pdf"
