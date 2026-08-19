import aiosmtplib
from datetime import datetime, timezone
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from jinja2 import Environment, BaseLoader
from app.core.config import settings


_TICKET_ENTRY_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #0f3460; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .note-box { background: #f5f7fa; border-left: 4px solid #0f3460; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
  .time-chip { display: inline-block; background: #d5f5e3; color: #1e8449; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; margin-bottom: 20px; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-urgente { background: #fce4e4; color: #c0392b; }
  .badge-normal { background: #d6eaf8; color: #1a5276; }
  .badge-faible { background: #eee; color: #666; }
  .badge-critique { background: #7d3c98; color: #fff; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Mise à jour — Ticket #{{ ticket_id_short }}</h2>
    <div class="sub">{{ ticket_title }}</div>
  </div>
  <div class="body">
    <div class="label">Compagnie</div>
    <div class="value">{{ company_name }}{% if contact_name %} · {{ contact_name }}{% endif %}</div>

    <div class="label">Statut</div>
    <div class="value"><span class="badge badge-{{ priority }}">{{ priority|upper }}</span> &nbsp; {{ status }}</div>

    <div class="label">Note ajoutée par {{ tech_name }}</div>
    <div class="note-box">{{ description }}</div>

    {% if duration_minutes > 0 %}
    <div class="label">Temps travaillé (cette intervention)</div>
    <div class="time-chip">{{ hours }}h {{ mins }}min{% if is_billable %} · Facturable{% else %} · Non facturable{% endif %}</div>
    {% endif %}

    {% if total_minutes > 0 %}
    <div class="label">Total temps accumulé sur ce ticket</div>
    <div class="value">{{ total_hours }}h {{ total_mins }}min</div>
    {% endif %}
  </div>
  <div class="footer">
    Cet email a été envoyé automatiquement par Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""

_TICKET_OPEN_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #184FA0; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .desc-box { background: #f5f7fa; border-left: 4px solid #184FA0; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 14px; line-height: 1.6; margin-bottom: 20px; }
  .portal-btn { display: inline-block; background: #184FA0; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-size: 15px; font-weight: 600; margin: 8px 0 16px; }
  .note-box { background: #FEF9C3; border: 1px solid #FDE68A; border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #78350F; margin-bottom: 16px; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .badge-urgente { background: #fce4e4; color: #c0392b; }
  .badge-urgent { background: #fce4e4; color: #c0392b; }
  .badge-normal { background: #d6eaf8; color: #1a5276; }
  .badge-faible { background: #eee; color: #666; }
  .badge-critique { background: #7d3c98; color: #fff; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Nouveau ticket ouvert — #{{ ticket_id_short }}</h2>
    <div class="sub">{{ ticket_title }}</div>
  </div>
  <div class="body">
    <div class="label">Compagnie</div>
    <div class="value">{{ company_name }}{% if contact_name %} · {{ contact_name }}{% endif %}</div>

    <div class="label">Priorité</div>
    <div class="value"><span class="badge badge-{{ priority }}">{{ priority|upper }}</span></div>

    {% if description %}
    <div class="label">Description</div>
    <div class="desc-box">{{ description }}</div>
    {% endif %}

    {% if portal_url %}
    <div class="label">Portail client</div>
    <a href="{{ portal_url }}" class="portal-btn">Accéder à votre portail →</a>
    <div class="note-box">
      💡 Si vous n'avez pas encore de compte, contactez votre gestionnaire pour obtenir vos accès.
    </div>
    {% endif %}
  </div>
  <div class="footer">
    Cet email a été envoyé automatiquement par Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""

_TICKET_CLOSE_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #1e8449; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .summary-table th { text-align: left; padding: 6px 10px; background: #f0f4f8; font-size: 12px; text-transform: uppercase; color: #555; }
  .summary-table td { padding: 8px 10px; border-top: 1px solid #f0f4f8; font-size: 13px; vertical-align: top; }
  .total-box { background: #d5f5e3; border-radius: 6px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .total-box .lbl { font-size: 13px; color: #1e8449; }
  .total-box .val { font-size: 20px; font-weight: bold; color: #1e8449; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Ticket fermé — #{{ ticket_id_short }}</h2>
    <div class="sub">{{ ticket_title }}</div>
  </div>
  <div class="body">
    <div class="label">Compagnie</div>
    <div class="value">{{ company_name }}{% if contact_name %} · {{ contact_name }}{% endif %}</div>

    <div class="total-box">
      <div class="lbl">Temps total travaillé</div>
      <div class="val">{{ total_hours }}h {{ total_mins }}min</div>
    </div>

    <div class="label">Détail des interventions</div>
    <table class="summary-table">
      <thead><tr><th>Date</th><th>Technicien</th><th>Description</th><th>Durée</th><th>Fact.</th></tr></thead>
      <tbody>
        {% for e in entries %}
        <tr>
          <td>{{ e.worked_at }}</td>
          <td>{{ e.tech }}</td>
          <td>{{ e.description }}</td>
          <td>{{ e.hours }}h{{ e.mins }}min</td>
          <td>{{ '✓' if e.is_billable else '—' }}</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>
  </div>
  <div class="footer">
    Merci de nous avoir fait confiance · Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""


_INVOICE_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #1F5AA6; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .summary-table th { text-align: left; padding: 6px 10px; background: #f0f4f8; font-size: 12px; text-transform: uppercase; color: #555; }
  .summary-table td { padding: 8px 10px; border-top: 1px solid #f0f4f8; font-size: 13px; vertical-align: top; }
  .summary-table td.num { text-align: right; }
  .total-box { background: #EFF6FF; border-radius: 6px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .total-box .lbl { font-size: 13px; color: #1F5AA6; }
  .total-box .val { font-size: 20px; font-weight: bold; color: #1F5AA6; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Facture #{{ invoice_number }}</h2>
    <div class="sub">{{ company_name }}</div>
  </div>
  <div class="body">
    <div class="label">Échéance</div>
    <div class="value">{{ due_date }}</div>

    <table class="summary-table">
      <thead><tr><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead>
      <tbody>
        {% for l in lines %}
        <tr>
          <td>{{ l.description }}</td>
          <td class="num">{{ l.qty }}</td>
          <td class="num">{{ '%.2f'|format(l.unit_price) }} $</td>
          <td class="num">{{ '%.2f'|format(l.line_total) }} $</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>

    <div class="total-box">
      <div class="lbl">Total</div>
      <div class="val">{{ '%.2f'|format(total) }} $</div>
    </div>
  </div>
  <div class="footer">
    Merci de nous avoir fait confiance · Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""


_DEVIS_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #7C3AED; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  .summary-table th { text-align: left; padding: 6px 10px; background: #f0f4f8; font-size: 12px; text-transform: uppercase; color: #555; }
  .summary-table td { padding: 8px 10px; border-top: 1px solid #f0f4f8; font-size: 13px; vertical-align: top; }
  .summary-table td.num { text-align: right; }
  .total-box { background: #F5F3FF; border-radius: 6px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .total-box .lbl { font-size: 13px; color: #7C3AED; }
  .total-box .val { font-size: 20px; font-weight: bold; color: #7C3AED; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Devis #{{ devis_number }}</h2>
    <div class="sub">{{ company_name }}</div>
  </div>
  <div class="body">
    <div class="label">Valide jusqu'au</div>
    <div class="value">{{ valid_until }}</div>

    <table class="summary-table">
      <thead><tr><th>Description</th><th>Qté</th><th>Prix</th><th>Total</th></tr></thead>
      <tbody>
        {% for l in lines %}
        <tr>
          <td>{{ l.description }}</td>
          <td class="num">{{ l.qty }}</td>
          <td class="num">{{ '%.2f'|format(l.unit_price) }} $</td>
          <td class="num">{{ '%.2f'|format(l.line_total) }} $</td>
        </tr>
        {% endfor %}
      </tbody>
    </table>

    <div class="total-box">
      <div class="lbl">Total</div>
      <div class="val">{{ '%.2f'|format(total) }} $</div>
    </div>
  </div>
  <div class="footer">
    Merci de votre intérêt · Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""


_TASK_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #1F5AA6; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .header .sub { font-size: 13px; opacity: .8; margin-top: 4px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .desc-box { background: #f5f7fa; border-left: 4px solid #1F5AA6; padding: 12px 16px; border-radius: 0 4px 4px 0; font-size: 14px; line-height: 1.6; margin-bottom: 16px; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Rendez-vous — {{ title }}</h2>
    {% if company_name %}<div class="sub">{{ company_name }}</div>{% endif %}
  </div>
  <div class="body">
    <div class="label">Date</div>
    <div class="value">{{ due_date }}{% if due_time %} à {{ due_time }}{% endif %}</div>

    {% if description %}
    <div class="label">Détails</div>
    <div class="desc-box">{{ description }}</div>
    {% endif %}
  </div>
  <div class="footer">
    Cet email a été envoyé automatiquement par Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""


_RDV_CONFIRM_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 620px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #1F5AA6; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .body { padding: 24px 28px; }
  .label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: .05em; margin-bottom: 4px; }
  .value { font-size: 15px; margin-bottom: 16px; }
  .footer { background: #f0f4f8; padding: 14px 28px; font-size: 12px; color: #888; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h2>Rendez-vous confirmé — {{ label }}</h2>
  </div>
  <div class="body">
    <div class="label">Date et heure</div>
    <div class="value">{{ date_label }} à {{ time }} ({{ duration_label }})</div>
    {% if address %}
    <div class="label">Adresse de la visite</div>
    <div class="value">{{ address }}</div>
    {% endif %}
    <div class="label">Description</div>
    <div class="value">{{ description }}</div>
  </div>
  <div class="footer">
    Simple IP · support@simpleip.tel
  </div>
</div>
</body>
</html>
"""


def _tracking_pixel(entity_type: str, entity_id) -> str:
    """Pixel invisible (suivi d'ouverture style Zoho) -- l'URL doit etre absolue et
    joignable depuis Internet (PUBLIC_BASE_URL, Nginx+Let's Encrypt), pas juste le
    LAN, sinon le client courriel du destinataire ne pourra jamais la charger."""
    return f'<img src="{settings.PUBLIC_BASE_URL}/api/v1/track/{entity_type}/{entity_id}.png" width="1" height="1" style="display:none" alt="" />'


def _ics_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def build_ics_invite(
    uid: str,
    start_utc: datetime,
    end_utc: datetime,
    summary: str,
    description: str,
    location: str | None,
    attendee_email: str,
    attendee_name: str,
) -> str:
    """Invitation calendrier standard (RFC 5545) -- comme Zoho/Google Calendar,
    fonctionne avec n'importe quel client courriel (Gmail, Outlook, Apple Mail),
    independamment de toute synchro Google Calendar cote serveur."""
    def fmt(dt: datetime) -> str:
        return dt.strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Simple IP//RDV//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}@simpleip.tel",
        f"DTSTAMP:{fmt(datetime.now(timezone.utc))}",
        f"DTSTART:{fmt(start_utc)}",
        f"DTEND:{fmt(end_utc)}",
        f"SUMMARY:{_ics_escape(summary)}",
        f"DESCRIPTION:{_ics_escape(description)}",
    ]
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    lines += [
        f"ORGANIZER;CN=Simple IP:mailto:{settings.SMTP_FROM}",
        f"ATTENDEE;CN={_ics_escape(attendee_name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{attendee_email}",
        "STATUS:CONFIRMED",
        "SEQUENCE:0",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(lines) + "\r\n"


async def _send(to_email: str, subject: str, html_body: str, tracking_entity_type: str | None = None, tracking_entity_id=None, ics_content: str | None = None, attachment: tuple[str, bytes, str] | None = None) -> bool:
    """Send email. Returns True on success, False if SMTP not configured or on error.
    attachment: (filename, content_bytes, mime_subtype) -- ex: ("rapport.csv", b"...", "csv")."""
    if not settings.SMTP_HOST:
        return False
    if tracking_entity_type and tracking_entity_id:
        html_body = html_body + _tracking_pixel(tracking_entity_type, tracking_entity_id)
    if ics_content or attachment:
        msg = MIMEMultipart("mixed")
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(html_body, "html", "utf-8"))
        msg.attach(alt)
        if ics_content:
            ics_part = MIMEText(ics_content, "calendar; method=REQUEST", "utf-8")
            ics_part.add_header("Content-Disposition", "attachment", filename="invite.ics")
            msg.attach(ics_part)
        if attachment:
            filename, content, subtype = attachment
            part = MIMEBase("application", subtype)
            part.set_payload(content)
            encoders.encode_base64(part)
            part.add_header("Content-Disposition", "attachment", filename=filename)
            msg.attach(part)
    else:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(html_body, "html", "utf-8"))
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"] = to_email
    try:
        use_tls = settings.SMTP_PORT == 465
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=use_tls,
            start_tls=settings.SMTP_STARTTLS and not use_tls,
        )
        return True
    except Exception:
        return False


def _render(template_str: str, ctx: dict) -> str:
    env = Environment(loader=BaseLoader())
    return env.from_string(template_str).render(**ctx)


async def send_ticket_open_email(
    to_email: str,
    ticket_id: str,
    ticket_title: str,
    company_name: str,
    contact_name: str | None,
    priority: str,
    description: str | None,
    portal_url: str,
) -> bool:
    ctx = dict(
        ticket_id_short=ticket_id[:8].upper(),
        ticket_title=ticket_title,
        company_name=company_name,
        contact_name=contact_name,
        priority=priority,
        description=description,
        portal_url=portal_url,
    )
    html = _render(_TICKET_OPEN_TMPL, ctx)
    subject = f"[Ticket #{ticket_id[:8].upper()}] Ticket ouvert — {ticket_title}"
    return await _send(to_email, subject, html, tracking_entity_type="ticket", tracking_entity_id=ticket_id)


async def send_ticket_entry_email(
    to_email: str,
    ticket_id: str,
    ticket_title: str,
    company_name: str,
    contact_name: str | None,
    status: str,
    priority: str,
    tech_name: str,
    description: str,
    duration_minutes: int,
    is_billable: bool,
    total_minutes: int,
) -> bool:
    ctx = dict(
        ticket_id_short=ticket_id[:8].upper(),
        ticket_title=ticket_title,
        company_name=company_name,
        contact_name=contact_name,
        status=status,
        priority=priority,
        tech_name=tech_name,
        description=description,
        duration_minutes=duration_minutes,
        hours=duration_minutes // 60,
        mins=duration_minutes % 60,
        is_billable=is_billable,
        total_minutes=total_minutes,
        total_hours=total_minutes // 60,
        total_mins=total_minutes % 60,
    )
    html = _render(_TICKET_ENTRY_TMPL, ctx)
    subject = f"[Ticket #{ticket_id[:8].upper()}] Mise à jour — {ticket_title}"
    return await _send(to_email, subject, html, tracking_entity_type="ticket", tracking_entity_id=ticket_id)


async def send_ticket_close_email(
    to_email: str,
    ticket_id: str,
    ticket_title: str,
    company_name: str,
    contact_name: str | None,
    total_minutes: int,
    entries: list[dict],
) -> bool:
    ctx = dict(
        ticket_id_short=ticket_id[:8].upper(),
        ticket_title=ticket_title,
        company_name=company_name,
        contact_name=contact_name,
        total_minutes=total_minutes,
        total_hours=total_minutes // 60,
        total_mins=total_minutes % 60,
        entries=[{
            **e,
            "hours": e["duration_minutes"] // 60,
            "mins": e["duration_minutes"] % 60,
        } for e in entries],
    )
    html = _render(_TICKET_CLOSE_TMPL, ctx)
    # ⚠️ Bug corrige : le tag devait rester EXACTEMENT "[Ticket #XXXXXXXX]" pour que
    # imap_poller.py (regex \[Ticket #([A-F0-9]{8})\]) puisse reconnaitre une reponse
    # du client -- "[Ticket fermé #...]" ne matchait jamais, brisant la reouverture
    # automatique par reponse courriel sur un ticket ferme/facture.
    subject = f"[Ticket #{ticket_id[:8].upper()}] {ticket_title} — Résumé"
    return await _send(to_email, subject, html, tracking_entity_type="ticket", tracking_entity_id=ticket_id)


async def send_invoice_email(
    to_email: str,
    invoice_id: str,
    invoice_number: str,
    company_name: str,
    due_date: str,
    lines: list[dict],
    total: float,
) -> bool:
    ctx = dict(
        invoice_number=invoice_number,
        company_name=company_name,
        due_date=due_date,
        lines=lines,
        total=total,
    )
    html = _render(_INVOICE_TMPL, ctx)
    subject = f"Facture #{invoice_number} — {company_name}"
    return await _send(to_email, subject, html, tracking_entity_type="invoice", tracking_entity_id=invoice_id)


async def send_devis_email(
    to_email: str,
    devis_id: str,
    devis_number: str,
    company_name: str,
    valid_until: str,
    lines: list[dict],
    total: float,
) -> bool:
    ctx = dict(
        devis_number=devis_number,
        company_name=company_name,
        valid_until=valid_until,
        lines=lines,
        total=total,
    )
    html = _render(_DEVIS_TMPL, ctx)
    subject = f"Devis #{devis_number} — {company_name}"
    return await _send(to_email, subject, html, tracking_entity_type="devis", tracking_entity_id=devis_id)


async def send_task_email(
    to_email: str,
    task_id: str,
    title: str,
    company_name: str | None,
    due_date: str | None,
    due_time: str | None,
    description: str | None,
) -> bool:
    ctx = dict(
        title=title,
        company_name=company_name,
        due_date=due_date or "—",
        due_time=due_time,
        description=description,
    )
    html = _render(_TASK_TMPL, ctx)
    subject = f"Rendez-vous — {title}"
    return await _send(to_email, subject, html, tracking_entity_type="task", tracking_entity_id=task_id)


async def send_task_reminder_email(
    to_email: str,
    task_id: str,
    title: str,
    company_name: str | None,
    due_date: str | None,
    due_time: str | None,
    description: str | None,
) -> bool:
    ctx = dict(
        title=title,
        company_name=company_name,
        due_date=due_date or "—",
        due_time=due_time,
        description=description,
    )
    html = _render(_TASK_TMPL, ctx)
    subject = f"Rappel — {title}"
    return await _send(to_email, subject, html, tracking_entity_type="task", tracking_entity_id=task_id)


async def send_rdv_confirmation_email(
    to_email: str,
    appointment_id: str,
    label: str,
    date_label: str,
    time: str,
    duration_label: str,
    address: str | None,
    description: str,
    attendee_name: str,
    start_utc: datetime,
    end_utc: datetime,
) -> bool:
    ctx = dict(
        label=label,
        date_label=date_label,
        time=time,
        duration_label=duration_label,
        address=address,
        description=description,
    )
    html = _render(_RDV_CONFIRM_TMPL, ctx)
    subject = f"Rendez-vous confirmé — {label}"
    ics = build_ics_invite(
        uid=appointment_id,
        start_utc=start_utc,
        end_utc=end_utc,
        summary=f"{label} — Simple IP",
        description=description,
        location=address,
        attendee_email=to_email,
        attendee_name=attendee_name,
    )
    return await _send(to_email, subject, html, tracking_entity_type="appointment", tracking_entity_id=appointment_id, ics_content=ics)


# ── Rapport CDR programme (TASK-032.2) ──────────────────────────────────────

_CDR_REPORT_TMPL = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 0; background: #f5f7fa; }
  .wrap { max-width: 560px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  .header { background: #0f3460; color: #fff; padding: 20px 28px; }
  .header h2 { margin: 0; font-size: 18px; }
  .body { padding: 24px 28px; font-size: 14px; line-height: 1.5; }
  .footer { padding: 16px 28px; font-size: 11px; color: #999; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h2>{{ report_name }}</h2></div>
  <div class="body">
    <p>Rapport d'appels pour {{ company_name }}, période du {{ period_from }} au {{ period_to }}.</p>
    <p>{{ call_count }} appel(s){{ filter_label }}.</p>
    <p>Le détail est en pièce jointe (fichier CSV).</p>
  </div>
  <div class="footer">Simple IP — rapport envoyé automatiquement</div>
</div>
</body>
</html>
"""


async def send_cdr_report_email(
    to_email: str,
    report_name: str,
    company_name: str,
    period_from: str,
    period_to: str,
    call_count: int,
    filter_label: str,
    csv_bytes: bytes,
    csv_filename: str,
) -> bool:
    ctx = dict(report_name=report_name, company_name=company_name, period_from=period_from, period_to=period_to, call_count=call_count, filter_label=filter_label)
    html = _render(_CDR_REPORT_TMPL, ctx)
    subject = f"{report_name} — {company_name}"
    return await _send(to_email, subject, html, attachment=(csv_filename, csv_bytes, "csv"))
