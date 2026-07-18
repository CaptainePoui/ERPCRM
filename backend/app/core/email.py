import aiosmtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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


async def _send(to_email: str, subject: str, html_body: str) -> bool:
    """Send email. Returns True on success, False if SMTP not configured or on error."""
    if not settings.SMTP_HOST:
        return False
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))
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
    return await _send(to_email, subject, html)


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
    return await _send(to_email, subject, html)


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
    subject = f"[Ticket fermé #{ticket_id[:8].upper()}] {ticket_title} — Résumé"
    return await _send(to_email, subject, html)
