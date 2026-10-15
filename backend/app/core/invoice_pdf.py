"""invoice_pdf.py -- generation PDF des factures via WeasyPrint.

Le bloc vendeur vient de la fiche de la compagnie du proprietaire (core/owner.py, TASK-002.5) -- plus des cles
pdf_seller_* d'app_settings.
"""
from __future__ import annotations
import io
from pathlib import Path
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


_BRAND = Path(__file__).resolve().parents[2] / "storage" / "branding"
_UPLOADS = Path(__file__).resolve().parents[2]

# TASK-005.20 (2026-10-15) : presentation de l'ancien logiciel (Philippe : « je les trouvais bien ») -- logo et vendeur
# a gauche, « FACTURE » + solde du a droite, Facturer a / dates, tableau # / Article & Description / Quantite / Taux /
# Montant avec l'image de l'article et la description sous son nom, totaux jusqu'au solde du, remarques, conditions,
# n° TPS/TVQ en pied de page -- avec une touche ERPCRM : Inter, bande de couleur, carte du solde, pastille d'etat.
_CSS2 = """
@font-face { font-family: Inter; font-weight: 400; src: url("FONTS/Inter-400.woff2"); }
@font-face { font-family: Inter; font-weight: 600; src: url("FONTS/Inter-600.woff2"); }
@font-face { font-family: Inter; font-weight: 700; src: url("FONTS/Inter-700.woff2"); }
@page { size: letter; margin: 14mm 14mm 18mm 14mm;
  @bottom-left { content: "FOOTER"; font-family: Inter, sans-serif; font-size: 7pt; color: #94a3b8; }
  @bottom-right { content: "Page " counter(page) " de " counter(pages); font-family: Inter, sans-serif; font-size: 7pt; color: #94a3b8; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, "DejaVu Sans", sans-serif; font-size: 9pt; color: #1e293b; line-height: 1.45; }
.bar { height: 5px; border-radius: 3px; background: linear-gradient(90deg, #1e3a8a, #2563eb 55%, #38bdf8); margin-bottom: 14px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; }
.seller img { height: 52px; margin-bottom: 6px; }
.seller .name { font-weight: 700; font-size: 10.5pt; color: #0f172a; }
.seller .tag { color: #475569; margin-bottom: 6px; }
.seller .addr { color: #475569; font-size: 8.5pt; }
.doc { text-align: right; }
.doc h1 { font-size: 24pt; font-weight: 700; letter-spacing: .02em; color: #1e3a8a; line-height: 1.1; }
.doc .num { font-weight: 600; color: #334155; margin: 2px 0 10px; }
.pill { display: inline-block; font-size: 7.5pt; font-weight: 700; letter-spacing: .06em; padding: 3px 9px; border-radius: 99px; margin-bottom: 8px; }
.pill.paid { background: #dcfce7; color: #166534; } .pill.late { background: #fee2e2; color: #991b1b; }
.pill.part { background: #fef3c7; color: #92400e; } .pill.draft { background: #e2e8f0; color: #334155; }
.pill.open { background: #dbeafe; color: #1e40af; } .pill.void { background: #f1f5f9; color: #64748b; }
.due { display: inline-block; text-align: right; background: #f1f5f9; border-radius: 10px; padding: 8px 14px; min-width: 150px; }
.due span { display: block; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
.due strong { font-size: 15pt; color: #0f172a; }
.due.zero strong { color: #16a34a; }
.meta { display: flex; justify-content: space-between; margin: 20px 0 14px; }
.billto span, .dates span { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
.billto .co { font-weight: 700; font-size: 10pt; color: #0f172a; margin-top: 2px; }
.billto p { color: #334155; }
.dates table { border-collapse: collapse; }
.dates td { padding: 2px 0 2px 18px; text-align: right; }
.dates td.k { color: #64748b; }
.dates td.v { font-weight: 600; color: #0f172a; }
table.lines { width: 100%; border-collapse: collapse; }
.lines thead th { background: #1e3a8a; color: #fff; font-weight: 600; font-size: 8pt; padding: 7px 8px; text-align: left; }
.lines thead th:first-child { border-radius: 6px 0 0 6px; width: 22px; }
.lines thead th:last-child { border-radius: 0 6px 6px 0; }
.lines th.r, .lines td.r { text-align: right; white-space: nowrap; width: 62px; }
.lines th.r:nth-child(3), .lines td.r:nth-child(3) { width: 48px; }
.lines td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
.lines tr { page-break-inside: avoid; }
.lines td.n { color: #94a3b8; }
.item { display: flex; gap: 10px; }
.item img { width: 34px; height: 34px; object-fit: contain; border-radius: 6px; }
.item .t { font-weight: 600; color: #0f172a; }
.item .d { color: #64748b; font-size: 8pt; white-space: pre-line; }
.item .nt { color: #b45309; font-size: 7.5pt; }
.sum { display: flex; justify-content: flex-end; margin-top: 10px; page-break-inside: avoid; }
.sum table { border-collapse: collapse; min-width: 250px; }
.sum td { padding: 4px 0 4px 24px; text-align: right; white-space: nowrap; }
.sum td.k { color: #475569; }
.sum tr.total td { border-top: 2px solid #1e3a8a; padding-top: 7px; font-weight: 700; font-size: 10.5pt; color: #0f172a; }
.sum tr.bal td { background: #f1f5f9; font-weight: 700; color: #0f172a; padding: 7px 10px 7px 24px; }
.sum tr.bal td.k { border-radius: 6px 0 0 6px; } .sum tr.bal td:last-child { border-radius: 0 6px 6px 0; }
.notes { margin-top: 18px; page-break-inside: avoid; }
.notes span { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: #64748b; }
.notes p { color: #334155; white-space: pre-line; margin-top: 2px; }
.terms { margin-top: 18px; font-size: 6.5pt; color: #94a3b8; }
"""

_STATUS = {"payee": ("PAYÉE", "paid"), "en_retard": ("EN RETARD", "late"), "partiellement_payee": ("PARTIELLEMENT PAYÉE", "part"),
           "brouillon": ("BROUILLON", "draft"), "annulee": ("ANNULÉE", "void"), "envoyee": ("À PAYER", "open")}


def _esc(s) -> str:
    import html
    return html.escape(str(s or ""))


def _money(v) -> str:
    return f"{Decimal(str(v)):,.2f} $".replace(",", " ").replace(".", ",")


async def generate_invoice_pdf(invoice_id, db: AsyncSession) -> bytes:
    """Genere le PDF d'une facture (presentation TASK-005.20). Retourne les bytes du PDF."""
    from weasyprint import HTML  # lazy import -- only loaded when needed
    from sqlalchemy.orm import selectinload
    from app.core.owner import seller_info
    from app.models.client_payment import CreditAllocation

    inv = (await db.execute(select(Invoice).where(Invoice.id == invoice_id)
                            .options(selectinload(Invoice.lines).selectinload(InvoiceLine.catalogue_item),
                                     selectinload(Invoice.company)))).scalar_one_or_none()
    if not inv:
        raise ValueError("Facture introuvable")
    info = await seller_info(db)
    settled = await _confirmed_total(invoice_id, db)
    credits = (await db.execute(select(func.sum(CreditAllocation.amount)).where(CreditAllocation.invoice_id == invoice_id))).scalar() or Decimal("0")
    paid = settled - Decimal(credits)
    is_credit = inv.credit_of_id is not None
    balance = Decimal("0") if is_credit or inv.status in ("brouillon", "annulee") and False else max(Decimal("0"), Decimal(str(inv.total)) - settled)

    logo = _BRAND / "invoice_logo.png"
    seller = (f'<img src="{logo.as_uri()}">' if logo.is_file() else "") + f'<div class="name">{_esc(info["name"])}</div>'
    seller += '<div class="tag">La solution est Simple IP</div>'
    seller += '<div class="addr">' + "<br>".join(_esc(x) for x in [*(info["address"] or "").split("\n"), info["phone"], info["email"]] if x) + "</div>"

    label, cls = _STATUS.get(inv.status, (inv.status.upper(), "open"))
    doc_label = "AVOIR" if is_credit else "FACTURE"
    due = "" if is_credit else f'<div class="due{" zero" if balance <= 0 else ""}"><span>Solde dû</span><strong>{_money(balance)}</strong></div>'

    bill = f'<div class="co">{_esc(inv.company.name if inv.company else "")}</div>'
    if inv.site_label_snapshot:
        bill += f"<p>{_esc(inv.site_label_snapshot)}</p>"
    if inv.site_address_snapshot:
        bill += "<p>" + _esc(inv.site_address_snapshot).replace("\n", "<br>") + "</p>"
    elif inv.company:
        from app.core.owner import billing_address, format_address
        addr = format_address(await billing_address(db, inv.company.id))
        if addr:
            bill += "<p>" + _esc(addr).replace("\n", "<br>") + "</p>"

    days = (inv.due_date - inv.issue_date).days if inv.due_date and inv.issue_date else None
    terms = "Payable à réception" if days == 0 else (f"{days} net" if days else "")
    dates = f'<tr><td class="k">Date de facture</td><td class="v">{_DATE(inv.issue_date)}</td></tr>'
    if terms and not is_credit:
        dates += f'<tr><td class="k">Conditions</td><td class="v">{terms}</td></tr>'
    if inv.due_date and not is_credit:
        dates += f'<tr><td class="k">Date d\'échéance</td><td class="v">{_DATE(inv.due_date)}</td></tr>'

    # image de l'article : par le lien au catalogue, sinon par le nom de l'article (lignes importees de l'ancien logiciel)
    from app.models.catalogue import CatalogueItem
    imgs = {k.strip().lower(): v for k, v in (await db.execute(select(CatalogueItem.name, CatalogueItem.image_url)
                                                               .where(CatalogueItem.image_url.is_not(None)))).all() if k}
    rows = ""
    for n, ln in enumerate(sorted(inv.lines, key=lambda l: l.sort_order or 0), 1):
        name, _, desc = (ln.description or "").partition(" — ")
        img = ""
        url = (ln.catalogue_item.image_url if ln.catalogue_item and ln.catalogue_item.image_url else imgs.get(name.strip().lower()))
        if url:
            f = _UPLOADS / url.lstrip("/")
            if f.is_file():
                img = f'<img src="{f.as_uri()}">'
        nt = '<div class="nt">Non taxable</div>' if ln.is_taxable is False else ""
        rows += (f'<tr><td class="n">{n}</td><td><div class="item">{img}<div><div class="t">{_esc(name)}</div>'
                 f'<div class="d">{_esc(desc.strip())}</div>{nt}</div></div></td>'
                 f'<td class="r">{float(ln.qty):g}</td><td class="r">{_money(ln.unit_price)}</td><td class="r">{_money(ln.line_total)}</td></tr>')

    sums = f'<tr><td class="k">Sous-total</td><td>{_money(inv.subtotal)}</td></tr>'
    if inv.apply_tps:
        sums += f'<tr><td class="k">TPS {f'{float(inv.tps_rate):.4g}'.replace('.', ',')} %</td><td>{_money(inv.tps_amount)}</td></tr>'
    if inv.apply_tvq:
        sums += f'<tr><td class="k">TVQ {f'{float(inv.tvq_rate):.4g}'.replace('.', ',')} %</td><td>{_money(inv.tvq_amount)}</td></tr>'
    sums += f'<tr class="total"><td class="k">Total</td><td>{_money(inv.total)}</td></tr>'
    if not is_credit:
        if paid:
            sums += f'<tr><td class="k">Paiement effectué</td><td>−{_money(paid)}</td></tr>'
        if credits:
            sums += f'<tr><td class="k">Crédits appliqués</td><td>−{_money(credits)}</td></tr>'
        sums += f'<tr class="bal"><td class="k">Solde dû</td><td>{_money(balance)}</td></tr>'

    notes = f'<div class="notes"><span>Remarques</span><p>{_esc(inv.notes)}</p></div>' if inv.notes else ""
    terms_html = ""
    if not is_credit:
        from app.core import late_fees
        terms_html = f'<div class="terms">{late_fees.terms_text(await late_fees.config(db))}</div>'
    footer = " · ".join(x for x in [f"TPS {info['tps']}" if info["tps"] else "", f"TVQ {info['tvq']}" if info["tvq"] else ""] if x)
    css = _CSS2.replace("FONTS/", (_BRAND / "fonts").as_uri() + "/").replace('"FOOTER"', '"' + footer.replace('"', "") + '"')

    html = f"""<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>{css}</style></head><body>
<div class="bar"></div>
<div class="top">
  <div class="seller">{seller}</div>
  <div class="doc"><h1>{doc_label}</h1><div class="num">N° {_esc(inv.number)}</div>
    <div><span class="pill {cls}">{label}</span></div>{due}</div>
</div>
<div class="meta">
  <div class="billto"><span>Facturer à</span>{bill}</div>
  <div class="dates"><table>{dates}</table></div>
</div>
<table class="lines"><thead><tr><th>#</th><th>Article &amp; description</th><th class="r">Quantité</th><th class="r">Taux</th><th class="r">Montant</th></tr></thead>
<tbody>{rows}</tbody></table>
<div class="sum"><table>{sums}</table></div>
{notes}
{terms_html}
</body></html>"""
    buf = io.BytesIO()
    HTML(string=html, base_url=str(_BRAND)).write_pdf(buf)
    return buf.getvalue()
