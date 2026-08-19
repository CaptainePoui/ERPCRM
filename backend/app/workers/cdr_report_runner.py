"""TASK-032.2 : rapports CDR programmes par courriel. Meme pattern que
backup_runner.py (poller asyncio in-process, pas de cron systeme)."""
import csv
import io
import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core import sipv_client, email as email_core
from app.models.company import Company
from app.models.cdr_report import CdrReportSchedule, CdrReportRunLog

log = logging.getLogger("cdr_report_runner")

_DIRECTION_LABELS = {"inbound": "entrants", "outbound": "sortants"}
_PAGE_SIZE = 500  # max cote SIPV (page_size <= 500)


def _is_schedule_due(schedule: CdrReportSchedule, today: date) -> bool:
    if schedule.frequency_type == "custom_days":
        return today.weekday() in (schedule.days_of_week or [])
    if schedule.frequency_type == "weekly":
        return today.weekday() == schedule.day_of_week
    if schedule.frequency_type == "monthly":
        return today.day == schedule.day_of_month
    return False


async def _fetch_all_cdr(tenant_id: str, extension: str | None, direction: str | None, date_from: datetime, date_to: datetime) -> list[dict]:
    items: list[dict] = []
    page = 1
    while True:
        result = await sipv_client.list_cdr(
            tenant_id, page=page, page_size=_PAGE_SIZE, extension=extension, direction=direction,
            date_from=date_from.isoformat(), date_to=date_to.isoformat(),
        )
        items.extend(result["items"])
        if len(items) >= result["total"] or not result["items"]:
            break
        page += 1
    return items


def _build_csv(items: list[dict]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "De", "Vers", "Direction", "Duree (s)", "Statut", "Cout"])
    for c in items:
        writer.writerow([
            c["start_time"] or "", c["src"] or "", c["dst"] or "",
            c["direction"] or "", c["billsec"] if c["billsec"] is not None else "",
            c["disposition"] or "", c["cost"] if c["cost"] is not None else "",
        ])
    return buf.getvalue().encode("utf-8-sig")  # BOM -- Excel ouvre les accents correctement


def _filter_label(schedule: CdrReportSchedule) -> str:
    parts = []
    if schedule.extension:
        parts.append(f"poste {schedule.extension}")
    if schedule.direction:
        parts.append(_DIRECTION_LABELS.get(schedule.direction, schedule.direction))
    return " -- " + ", ".join(parts) if parts else ""


def _default_period_start(schedule: CdrReportSchedule, now: datetime) -> datetime:
    """Premier envoi (jamais de last_sent_at) : fenêtre par défaut selon la
    fréquence, pas juste 'depuis la création' (qui donnerait un rapport quasi
    vide si le rapport est créé et envoyé le même jour)."""
    if schedule.frequency_type == "monthly":
        return now - timedelta(days=30)
    return now - timedelta(days=7)  # weekly / custom_days


async def _send_report(db, schedule: CdrReportSchedule, company: Company, manual: bool) -> bool:
    now = datetime.now(timezone.utc)
    period_from = schedule.last_sent_at or _default_period_start(schedule, now)
    log_row = CdrReportRunLog(schedule_id=schedule.id, success=False, triggered_manually=manual)
    try:
        items = await _fetch_all_cdr(str(company.sipv_tenant_id), schedule.extension, schedule.direction, period_from, now)
        csv_bytes = _build_csv(items)
        recipients = [r.strip() for r in schedule.recipients.split(",") if r.strip()]
        csv_filename = f"cdr_{schedule.name.lower().replace(' ', '_')}_{now.date().isoformat()}.csv"
        sent_ok = 0
        for to_email in recipients:
            ok = await email_core.send_cdr_report_email(
                to_email, schedule.name, company.name,
                period_from.astimezone(ZoneInfo(schedule.timezone)).strftime("%Y-%m-%d %H:%M"),
                now.astimezone(ZoneInfo(schedule.timezone)).strftime("%Y-%m-%d %H:%M"),
                len(items), _filter_label(schedule), csv_bytes, csv_filename,
            )
            if ok:
                sent_ok += 1
        log_row.call_count = len(items)
        log_row.recipient_count = sent_ok
        log_row.success = sent_ok > 0 and sent_ok == len(recipients)
        if sent_ok < len(recipients):
            log_row.error_message = f"{sent_ok}/{len(recipients)} destinataires rejoints (SMTP non configuré ou erreur)"
        schedule.last_sent_at = now
    except httpx.HTTPError as e:
        log.exception("Echec rapport CDR schedule %s", schedule.id)
        log_row.error_message = f"SIPV injoignable: {e}"[:2000]
    except Exception as e:
        log.exception("Echec rapport CDR schedule %s", schedule.id)
        log_row.error_message = str(e)[:2000]
    db.add(log_row)
    await db.commit()
    return log_row.success


async def run_manual(schedule_id) -> CdrReportRunLog:
    async with AsyncSessionLocal() as db:
        schedule = await db.get(CdrReportSchedule, schedule_id)
        if not schedule:
            raise ValueError("Rapport introuvable")
        company = await db.get(Company, schedule.company_id)
        if not company or not company.sipv_tenant_id:
            raise ValueError("Compagnie sans tenant SIPV actif")
        await _send_report(db, schedule, company, manual=True)
        result = await db.execute(
            select(CdrReportRunLog).where(CdrReportRunLog.schedule_id == schedule_id).order_by(CdrReportRunLog.sent_at.desc()).limit(1)
        )
        return result.scalar_one()


async def run_scheduled():
    async with AsyncSessionLocal() as db:
        schedules = (await db.execute(select(CdrReportSchedule).where(CdrReportSchedule.is_active == True))).scalars().all()
        for schedule in schedules:
            now_local = datetime.now(ZoneInfo(schedule.timezone))
            hh, mm = (int(x) for x in schedule.send_hour.split(":"))
            scheduled_today = now_local.replace(hour=hh, minute=mm, second=0, microsecond=0)
            if now_local < scheduled_today:
                continue  # heure pas encore atteinte aujourd'hui

            if not _is_schedule_due(schedule, now_local.date()):
                continue

            # Une seule tentative par jour -- meme garde-fou que backup_runner.py
            # (evite une boucle d'envois identiques sur une erreur permanente).
            already = await db.execute(
                select(CdrReportRunLog).where(
                    CdrReportRunLog.schedule_id == schedule.id,
                    CdrReportRunLog.sent_at >= scheduled_today.astimezone(ZoneInfo("UTC")).replace(tzinfo=None),
                )
            )
            if already.scalars().first():
                continue

            company = await db.get(Company, schedule.company_id)
            if not company or not company.sipv_tenant_id:
                continue
            await _send_report(db, schedule, company, manual=False)
