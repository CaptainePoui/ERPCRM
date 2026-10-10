"""PDF a telecharger des devis et des ententes d'echange (troc) -- TASK-005.17, 2026-10-08.

Philippe : « je veux des pdf pour tout echange : facture, avoir, devis, entente (troc) ». Meme allure que le PDF de
facture (app/core/invoice_pdf.py : feuille de style, coordonnees du vendeur dans app_settings), qui reste inchange.
"""
from __future__ import annotations
import io
from html import escape

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.invoice_pdf import _CSS, _FMT, _DATE, _get_setting

_EXTRA_CSS = """
.facts { margin-bottom: 18px; }
.facts .total-row { width: 100%; }
.section-title { font-size: 10pt; color: #444; margin: 18px 0 8px; }
.muted { color: #888; }
"""


def _e(v) -> str:
    return escape(str(v or "")).replace("\n", "<br>")


async def _seller(db: AsyncSession) -> tuple[str, str]:
    """(nom, bloc HTML) du vendeur -- memes reglages que la facture."""
    from app.core.owner import seller_info          # fiche de la compagnie du proprietaire (TASK-002.5)
    info = await seller_info(db)
    name = info["name"]
    block = f"<strong>{_e(name)}</strong>"
    for key, prefix in (("address", ""), ("tps", "TPS # "), ("tvq", "TVQ # "), ("phone", ""), ("email", "")):
        if info[key]:
            block += f"<br>{prefix}{_e(info[key])}"
    return name, block


def _page(seller_block: str, title: str, number: str, body: str, footer: str) -> bytes:
    from weasyprint import HTML  # lazy import -- only loaded when needed
    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>{_CSS}{_EXTRA_CSS}</style></head>
<body>
  <div class="header">
    <div class="seller">{seller_block}</div>
    <div class="doc-title"><h1>{title}</h1><div class="number">{_e(number)}</div></div>
  </div>
  {body}
  <div class="footer">{footer}</div>
</body>
</html>"""
    buf = io.BytesIO()
    HTML(string=html).write_pdf(buf)
    return buf.getvalue()


async def generate_devis_pdf(devis_id, db: AsyncSession) -> tuple[bytes, str]:
    """PDF d'un devis. Retourne (bytes, nom de fichier)."""
    from app.models.devis import Devis
    d = (await db.execute(select(Devis).where(Devis.id == devis_id)
                          .options(selectinload(Devis.lines), selectinload(Devis.company)))).scalar_one_or_none()
    if not d:
        raise ValueError("Devis introuvable")
    seller_name, seller_block = await _seller(db)

    rows = "".join(f"""<tr>
        <td>{_e(ln.description)}{' <em>(non taxable)</em>' if ln.is_taxable is False else ''}</td>
        <td>{float(ln.qty):g}</td><td>{_FMT(ln.unit_price)}</td><td>{_FMT(ln.line_total)}</td></tr>""" for ln in d.lines)
    totals = f'<div class="total-row"><span>Sous-total</span><span>{_FMT(d.subtotal)}</span></div>'
    if d.apply_tps:
        totals += f'<div class="total-row"><span>TPS ({float(d.tps_rate):.4g}%)</span><span>{_FMT(d.tps_amount)}</span></div>'
    if d.apply_tvq:
        totals += f'<div class="total-row"><span>TVQ ({float(d.tvq_rate):.4g}%)</span><span>{_FMT(d.tvq_amount)}</span></div>'
    totals += f'<div class="total-row grand"><span>Total</span><span>{_FMT(d.total)}</span></div>'
    banner = '<div class="status-banner banner-paid">ACCEPTÉ</div>' if d.status == "accepte" else ""
    notes = f'<div class="notes">{_e(d.notes)}</div>' if d.notes else ""

    body = f"""
  {banner}
  <div class="meta-grid"><div class="meta-block"><h3>Préparé pour</h3><p><strong>{_e(d.company.name)}</strong></p></div></div>
  <div class="dates">
    <div class="date-item"><span>Date du devis</span><strong>{_DATE(d.issue_date)}</strong></div>
    <div class="date-item"><span>Valide jusqu'au</span><strong>{_DATE(d.valid_until)}</strong></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:55%">Description</th><th style="width:10%;text-align:right">Qté</th>
      <th style="width:15%;text-align:right">Prix unit.</th><th style="width:20%;text-align:right">Total</th>
    </tr></thead>
    <tbody>{rows}</tbody>
  </table>
  <div class="totals">{totals}</div>
  {notes}"""
    return _page(seller_block, "Devis", d.number, body, f"{_e(seller_name)} &mdash; {_e(d.number)}"), f"devis-{d.number}.pdf"


async def generate_barter_pdf(barter_id, db: AsyncSession) -> tuple[bytes, str]:
    """PDF d'une entente d'echange (troc) : ce que la compagnie a donne, sa valeur hors taxes, ce que le credit a
    paye (factures, cycles de la facture periodique) et ce qui reste. Retourne (bytes, nom de fichier)."""
    from app.core import barter as bt
    from app.models.barter import BarterExchange
    from app.models.company import Company
    from app.models.invoice import Invoice
    from app.models.recurring_billing import CompanyRecurringBilling
    b = (await db.execute(select(BarterExchange).where(BarterExchange.id == barter_id))).scalar_one_or_none()
    if not b:
        raise ValueError("Échange introuvable")
    company = await db.get(Company, b.company_id)
    rb = await db.get(CompanyRecurringBilling, b.recurring_billing_id) if b.recurring_billing_id else None
    inv_ids = [a.invoice_id for a in b.applications if a.invoice_id]
    numbers = dict((await db.execute(select(Invoice.id, Invoice.number).where(Invoice.id.in_(inv_ids)))).all()) if inv_ids else {}
    seller_name, seller_block = await _seller(db)

    uses = ""
    for a in b.applications:
        if a.client_payment_id:
            what = f"Facture {_e(numbers.get(a.invoice_id, ''))} payée par l'échange"
            when = _DATE(a.cycle_start)
        elif a.invoice_id:
            what = f"Service du {_DATE(a.cycle_start)} au {_DATE(a.covered_until)} (facture {_e(numbers.get(a.invoice_id, ''))} au prorata)"
            when = _DATE(a.cycle_start)
        else:
            what = f"Service du {_DATE(a.cycle_start)} au {_DATE(a.covered_until)} couvert, aucune facture"
            when = _DATE(a.cycle_start)
        uses += f"<tr><td>{when}</td><td style=\"text-align:left\">{what}</td><td>{_FMT(a.amount)}</td></tr>"
    uses_html = f"""
  <h2 class="section-title">Utilisation du crédit</h2>
  <table>
    <thead><tr><th style="width:18%">Date</th><th style="width:62%">Description</th><th style="width:20%;text-align:right">Montant</th></tr></thead>
    <tbody>{uses}</tbody>
  </table>""" if uses else '<p class="muted" style="margin-bottom:16px">Le crédit n\'a pas encore servi.</p>'

    rb_line = f"<p>Crédit appliqué à : {_e(rb.name or 'Facture périodique')}</p>" if rb else ""
    files = "".join(f"<br>{_e(f.filename)}" for f in b.files)
    files_html = f'<div class="notes"><strong>Pièces justificatives</strong>{files}</div>' if files else ""
    notes = f'<div class="notes">{_e(b.notes)}</div>' if b.notes else ""
    number = f"Échange du {_DATE(b.exchange_date)}"

    body = f"""
  <div class="meta-grid">
    <div class="meta-block"><h3>Entente avec</h3><p><strong>{_e(company.name if company else '')}</strong></p>{rb_line}</div>
  </div>
  <div class="dates">
    <div class="date-item"><span>Date de l'échange</span><strong>{_DATE(b.exchange_date)}</strong></div>
  </div>
  <table>
    <thead><tr><th style="width:72%">Reçu de la compagnie</th><th style="width:28%;text-align:right">Valeur (hors taxes)</th></tr></thead>
    <tbody><tr><td>{_e(b.description)}</td><td>{_FMT(b.received_value)}</td></tr></tbody>
  </table>
  {uses_html}
  <div class="totals">
    <div class="total-row"><span>Crédit de l'échange</span><span>{_FMT(bt.credit_of(b))}</span></div>
    <div class="total-row"><span>Utilisé</span><span>{_FMT(bt.used_of(b))}</span></div>
    <div class="total-row grand"><span>Reste</span><span>{_FMT(bt.remaining_of(b))}</span></div>
  </div>
  {notes}
  {files_html}"""
    slug = "".join(c if c.isalnum() else "-" for c in (company.name if company else "echange")).strip("-")[:40]
    return (_page(seller_block, "Entente d'échange", number, body, f"{_e(seller_name)} &mdash; {_e(number)}"),
            f"echange-{slug}-{b.exchange_date.isoformat()}.pdf")
