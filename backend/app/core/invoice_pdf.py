"""invoice_pdf.py -- generation PDF des factures via WeasyPrint.

Utilise les cles app_settings suivantes (avec valeurs par defaut) :
  pdf_seller_name, pdf_seller_address, pdf_seller_tps, pdf_seller_tvq,
  pdf_seller_phone, pdf_seller_email
"""
from __future__ import annotations
import io
from decimal import Decimal
from datetime import date

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.invoice import Invoice, InvoiceLine
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.app_settings import AppSetting


_CSS = """
@page { size: letter; margin: 18mm 15mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 10pt; color: #111; }
.header { display: flex; justify-content: space-between; margin-bottom: 22px; }
.seller { font-size: 9pt; color: #444; line-height: 1.5; }
.seller strong { font-size: 11pt; color: #111; display: block; margin-bottom: 2px; }
.doc-title { text-align: right; }
.doc-title h1 { font-size: 22pt; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
.doc-title .number { font-size: 13pt; color: #555; }
.meta-grid { display: flex; gap: 32px; margin-bottom: 18px; }
.meta-block { flex: 1; }
.meta-block h3 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
.meta-block p { font-size: 9.5pt; line-height: 1.5; }
.dates { display: flex; gap: 40px; margin-bottom: 18px; }
.date-item span { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #888; display: block; }
.date-item strong { font-size: 10pt; }
.date-item.overdue strong { color: #dc2626; }
table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
thead th { background: #1d4ed8; color: #fff; padding: 6px 8px; text-align: left; font-size: 9pt; }
thead th:last-child { text-align: right; }
tbody tr:nth-child(even) { background: #f8fafc; }
tbody td { padding: 5px 8px; font-size: 9pt; vertical-align: top; border-bottom: 1px solid #e5e7eb; }
tbody td:nth-child(2), tbody td:nth-child(3), tbody td:last-child { text-align: right; }
.totals { margin-left: auto; width: 220px; }
.total-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 9.5pt; }
.total-row.grand { border-top: 2px solid #1d4ed8; margin-top: 4px; padding-top: 6px; font-weight: 700; font-size: 11pt; }
.payments-section { margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 12px; }
.payments-section h2 { font-size: 10pt; margin-bottom: 8px; color: #444; }
.payments-section .total-row { font-size: 9.5pt; }
.payments-section .total-row.balance-zero { color: #059669; }
.payments-section .total-row.balance-due { color: #dc2626; }
.status-banner { text-align: center; padding: 10px 0; font-size: 14pt; font-weight: 700;
  border-radius: 4px; margin-bottom: 18px; }
.banner-paid { background: #d1fae5; color: #065f46; }
.banner-partial { background: #fef9c3; color: #854d0e; }
.banner-pending { background: #e0f2fe; color: #0c4a6e; }
.notes { margin-top: 16px; font-size: 9pt; color: #555; border-left: 3px solid #e5e7eb; padding-left: 8px; }
.footer { margin-top: 30px; font-size: 8pt; color: #aaa; text-align: center; }
.terms { margin-top: 18px; font-size: 6.5pt; color: #999; text-align: center; }
"""

_FMT = lambda v: f"${float(v):,.2f}"
_DATE = lambda d: d.strftime("%Y-%m-%d") if d else ""


async def _get_setting(key: str, default: str, db: AsyncSession) -> str:
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    return s.value if s else default


async def _confirmed_total(invoice_id, db: AsyncSession) -> Decimal:
    """Paiements confirmes + avoirs appliques (TASK-005.10)."""
    from app.api.v1.endpoints.payments import settled_amounts
    return (await settled_amounts(db, [invoice_id])).get(invoice_id, Decimal("0.00"))


async def _pending_total(invoice_id, db: AsyncSession) -> Decimal:
    r = await db.execute(
        select(func.sum(PaymentAllocation.amount_allocated))
        .join(ClientPayment, ClientPayment.id == PaymentAllocation.payment_id)
        .where(
            PaymentAllocation.invoice_id == invoice_id,
            ClientPayment.status.in_(["pending", "processing"]),
        )
    )
    return r.scalar() or Decimal("0.00")


async def generate_invoice_pdf(invoice_id, db: AsyncSession) -> bytes:
    """Genere le PDF d'une facture. Retourne les bytes du PDF."""
    from weasyprint import HTML  # lazy import -- only loaded when needed

    inv = await db.get(Invoice, invoice_id)
    if not inv:
        raise ValueError("Facture introuvable")

    # Charger les lignes
    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(Invoice).where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.lines), selectinload(Invoice.company))   # nom du client lu plus bas
    )
    inv = r.scalar_one()

    # Infos vendeur depuis app_settings
    seller_name = await _get_setting("pdf_seller_name", "Simple IP inc.", db)
    seller_address = await _get_setting("pdf_seller_address", "", db)
    seller_tps = await _get_setting("pdf_seller_tps", "", db)
    seller_tvq = await _get_setting("pdf_seller_tvq", "", db)
    seller_phone = await _get_setting("pdf_seller_phone", "", db)
    seller_email = await _get_setting("pdf_seller_email", "", db)

    confirmed = await _confirmed_total(invoice_id, db)
    pending = await _pending_total(invoice_id, db)
    balance = Decimal(str(inv.total)) - confirmed

    # Banniere de statut
    if inv.status == "payee":
        banner = '<div class="status-banner banner-paid">PAYEE</div>'
    elif inv.status == "partiellement_payee":
        banner = '<div class="status-banner banner-partial">PARTIELLEMENT PAYEE</div>'
    elif pending > 0:
        banner = '<div class="status-banner banner-pending">PAIEMENT EN ATTENTE DE CONFIRMATION</div>'
    else:
        banner = ""

    # En-tete section paiements (uniquement si confirmes ou en attente)
    payments_html = ""
    if confirmed > 0 or pending > 0:
        bal_class = "balance-zero" if balance <= 0 else "balance-due"
        payments_html = f"""
        <div class="payments-section">
            <h2>Etat des paiements</h2>
            <div class="totals">
                <div class="total-row"><span>Total encaisse</span><span>{_FMT(confirmed)}</span></div>
        """
        if pending > 0:
            payments_html += f'<div class="total-row"><span>En attente de confirmation</span><span>{_FMT(pending)}</span></div>'
        payments_html += f"""
                <div class="total-row {bal_class}"><span>Solde restant</span><span>{_FMT(max(Decimal("0"), balance))}</span></div>
            </div>
        </div>
        """

    # Lignes du tableau
    lines_rows = ""
    for ln in inv.lines:
        lines_rows += f"""
        <tr>
            <td>{ln.description}{' <em>(non taxable)</em>' if ln.is_taxable is False else ''}</td>
            <td>{float(ln.qty):g}</td>
            <td>{_FMT(ln.unit_price)}</td>
            <td>{_FMT(ln.line_total)}</td>
        </tr>
        """

    # Totaux
    totals_html = f'<div class="total-row"><span>Sous-total</span><span>{_FMT(inv.subtotal)}</span></div>'
    if inv.apply_tps:
        totals_html += f'<div class="total-row"><span>TPS ({float(inv.tps_rate):.4g}%)</span><span>{_FMT(inv.tps_amount)}</span></div>'
    if inv.apply_tvq:
        totals_html += f'<div class="total-row"><span>TVQ ({float(inv.tvq_rate):.4g}%)</span><span>{_FMT(inv.tvq_amount)}</span></div>'
    totals_html += f'<div class="total-row grand"><span>Total</span><span>{_FMT(inv.total)}</span></div>'

    # Infos adresse client
    client_block = f"<p><strong>{inv.company.name}</strong></p>" if hasattr(inv, 'company') and inv.company else ""
    if inv.site_label_snapshot:
        client_block += f"<p>{inv.site_label_snapshot}</p>"
    if inv.site_address_snapshot:
        client_block += f"<p>{inv.site_address_snapshot.replace(chr(10), '<br>')}</p>"

    # Infos vendeur
    seller_block = f"<strong>{seller_name}</strong>"
    if seller_address:
        seller_block += f"<br>{seller_address.replace(chr(10), '<br>')}"
    if seller_tps:
        seller_block += f"<br>TPS # {seller_tps}"
    if seller_tvq:
        seller_block += f"<br>TVQ # {seller_tvq}"
    if seller_phone:
        seller_block += f"<br>{seller_phone}"
    if seller_email:
        seller_block += f"<br>{seller_email}"

    doc_label = "Avoir" if inv.credit_of_id else "Facture"
    overdue_class = " overdue" if inv.status == "en_retard" else ""
    notes_html = f'<div class="notes">{inv.notes}</div>' if inv.notes else ""
    # TASK-005.14 : taux annuel obligatoire (Loi sur l'interet), en tout petit -- pas sur un avoir
    terms_html = ""
    if not inv.credit_of_id:
        from app.core import late_fees
        terms_html = f'<div class="terms">{late_fees.terms_text(await late_fees.config(db))}</div>'

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><style>{_CSS}</style></head>
<body>
  <div class="header">
    <div class="seller">{seller_block}</div>
    <div class="doc-title">
      <h1>{doc_label}</h1>
      <div class="number">{inv.number}</div>
    </div>
  </div>
  {banner}
  <div class="meta-grid">
    <div class="meta-block">
      <h3>Facturer a</h3>
      {client_block}
    </div>
  </div>
  <div class="dates">
    <div class="date-item">
      <span>Date d'emission</span>
      <strong>{_DATE(inv.issue_date)}</strong>
    </div>
    <div class="date-item{overdue_class}">
      <span>Date d'echeance</span>
      <strong>{_DATE(inv.due_date)}</strong>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:55%">Description</th>
        <th style="width:10%;text-align:right">Qte</th>
        <th style="width:15%;text-align:right">Prix unit.</th>
        <th style="width:20%;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      {lines_rows}
    </tbody>
  </table>
  <div class="totals">
    {totals_html}
  </div>
  {payments_html}
  {notes_html}
  {terms_html}
  <div class="footer">{seller_name} &mdash; {inv.number}</div>
</body>
</html>"""

    buf = io.BytesIO()
    HTML(string=html).write_pdf(buf)
    return buf.getvalue()
