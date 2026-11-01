"""Cloche de notifications à côté de Zéko (TASK-047.6, GO de Philippe 2026-11-01).

La cloche LIT L'ÉTAT RÉEL, elle ne garde pas sa propre liste : une ligne disparaît d'elle-même quand c'est réglé (courriel
lu dans ERPCRM ou ailleurs, facture payée ou ignorée, ticket fini, relevé importé). « Le but est de vider la cloche. »
Réglages (Administration -> Configuration -> Notifications), un seul JSON dans app_settings « notifications_config »,
même modèle que core/agenda_config.py : tout est modifiable (logiciel destiné à être vendu).
"""
import copy
import json
import time as _time
from datetime import date, timedelta

TICKET_STATUSES = {"ouvert": "Ouvert", "en_cours": "En cours", "en_attente": "En attente",
                   "en_attente_client": "En attente d'une réponse", "facture": "Facturé", "ferme": "Fermé"}
DEFAULTS = {
    "mail": True,                 # courriels reçus non lus (boîtes que la personne voit)
    "invoices": True,             # factures en retard (sauf celles ignorées dans la cloche)
    "tickets": True,              # tickets pas finis
    "ticket_statuses": ["ouvert", "en_cours", "en_attente_client"],
    "bank": True,                 # rappel d'importer le relevé
    "bank_days": 5,               # jours après le dernier import ; jour fermé (horaire, férié) -> dernier jour ouvert d'avant
    "browser": False,             # notification du navigateur en plus de la cloche (Philippe : la cloche seulement pour l'instant)
}
KEY = "notifications_config"
_TTL = 20
_cache = {"at": 0.0, "cfg": copy.deepcopy(DEFAULTS)}


def _merge(raw: dict) -> dict:
    cfg = copy.deepcopy(DEFAULTS)
    cfg.update({k: v for k, v in (raw or {}).items() if k in DEFAULTS})
    return cfg


async def load(fresh: bool = False) -> dict:
    if not fresh and _time.monotonic() - _cache["at"] < _TTL:
        return _cache["cfg"]
    from app.core.database import AsyncSessionLocal
    from app.api.v1.endpoints.settings import get_setting
    async with AsyncSessionLocal() as db:
        raw = await get_setting(db, KEY)
    try:
        cfg = _merge(json.loads(raw) if raw else {})
    except (ValueError, TypeError):
        cfg = copy.deepcopy(DEFAULTS)
    _cache.update(at=_time.monotonic(), cfg=cfg)
    return cfg


def validate(data: dict) -> dict:
    cfg = _merge(data)
    for k in ("mail", "invoices", "tickets", "bank", "browser"):
        cfg[k] = bool(cfg[k])
    st = [s for s in cfg["ticket_statuses"] or [] if s in TICKET_STATUSES]
    if cfg["tickets"] and not st:
        raise ValueError("Tickets pas finis : coche au moins un statut")
    cfg["ticket_statuses"] = st
    try:
        cfg["bank_days"] = int(cfg["bank_days"])
    except (TypeError, ValueError):
        raise ValueError("Relevé bancaire : un nombre de jours")
    if not 1 <= cfg["bank_days"] <= 90:
        raise ValueError("Relevé bancaire : de 1 à 90 jours")
    return cfg


async def save(db, data: dict) -> dict:
    from app.api.v1.endpoints.settings import set_setting
    cfg = validate(data)
    await set_setting(db, KEY, json.dumps(cfg))
    _cache.update(at=_time.monotonic(), cfg=cfg)
    return cfg


def bank_reminder_day(last_import: date, days: int) -> date:
    """Jour du rappel : dernier import + N jours ; s'il tombe un jour fermé selon l'horaire de l'entreprise (ou un férié),
    avancé au dernier jour ouvert d'avant (Philippe : « je ne peux pas dépasser le délai »). Une entreprise ouverte la fin
    de semaine n'a rien à régler : ses jours sont ouverts. Jamais avant le lendemain de l'import."""
    from app.core.business_hours import is_business_day
    due = last_import + timedelta(days=days)
    d = due
    while d > last_import + timedelta(days=1) and not is_business_day(d):
        d -= timedelta(days=1)
    return d if is_business_day(d) else due


async def collect(db, user) -> dict:
    """Ce que la cloche montre à cette personne, selon ses privilèges et les réglages."""
    from sqlalchemy import func, select
    from app.core import agenda_config, clock, privileges
    from app.models.bank_account import BankAccount, BankStatementImport
    from app.models.company import Company
    from app.models.invoice import Invoice
    from app.models.mailbox import Mailbox, MailMessage
    from app.models.ticket import Ticket
    from app.api.v1.endpoints.mail import _visible

    cfg = await load()
    await agenda_config.load()                       # horaire de l'entreprise, pour le jour du rappel bancaire
    privs = await privileges.for_user_id(db, user.id)
    today = clock.today()
    out = []

    if cfg["mail"] and privileges.allows(privs, "courriels"):
        q = (select(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id)
             .where(_visible(user), MailMessage.junk_at.is_(None), MailMessage.direction == "in",
                    MailMessage.is_read.is_(False), ~Mailbox.functions.any("tickets")))
        n = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar()
        if n:
            rows = (await db.execute(q.order_by(MailMessage.sent_at.desc().nulls_last()).limit(5))).scalars().all()
            out.append({"kind": "mail", "label": "Courriels non lus", "count": n, "path": "/mail?view=unread",
                        "lines": [{"text": f"{m.from_name or m.from_email or '?'} : {m.subject or '(sans objet)'}",
                                   "path": "/mail?view=unread"} for m in rows]})

    if cfg["invoices"] and privileges.allows(privs, "ventes"):
        q = (select(Invoice, Company.name).join(Company, Company.id == Invoice.company_id, isouter=True)
             .where(Invoice.status == "en_retard", Invoice.credit_of_id.is_(None), Invoice.bell_ignored_at.is_(None)))
        rows = (await db.execute(q.order_by(Invoice.due_date.desc().nulls_last()))).all()
        if rows:
            out.append({"kind": "invoices", "label": "Factures en retard", "count": len(rows), "path": "/invoices?status=en_retard",
                        "lines": [{"text": f"{i.number} · {name or '?'} · échue le {i.due_date:%Y-%m-%d}" if i.due_date
                                   else f"{i.number} · {name or '?'}", "path": f"/invoices/{i.id}"} for i, name in rows[:5]]})

    if cfg["tickets"] and cfg["ticket_statuses"] and privileges.allows(privs, "tickets"):
        q = (select(Ticket, Company.name).join(Company, Company.id == Ticket.company_id, isouter=True)
             .where(Ticket.status.in_(cfg["ticket_statuses"])))
        rows = (await db.execute(q.order_by(Ticket.created_at.desc()))).all()
        if rows:
            from app.core.zeko_tools import ticket_no
            out.append({"kind": "tickets", "label": "Tickets pas finis", "count": len(rows),
                        "path": "/tickets?statuts=" + ",".join(cfg["ticket_statuses"]),
                        "lines": [{"text": f"{ticket_no(t)} · {name or '?'} · {t.title or ''} ({TICKET_STATUSES.get(t.status, t.status)})",
                                   "path": f"/tickets/{t.id}"} for t, name in rows[:5]]})

    if cfg["bank"] and privileges.allows(privs, "banque"):
        last = (await db.execute(select(BankStatementImport.account_id, func.max(BankStatementImport.created_at))
                                 .join(BankAccount, BankAccount.id == BankStatementImport.account_id)
                                 .where(BankAccount.is_active.is_(True)).group_by(BankStatementImport.account_id))).all()
        names = dict((await db.execute(select(BankAccount.id, BankAccount.name))).all())
        tz = clock.business_tz()
        lines = []
        for acc, at in last:
            d = at.astimezone(tz).date()
            due = bank_reminder_day(d, cfg["bank_days"])
            if today >= due:
                lines.append({"text": f"{names.get(acc, 'Compte')} : dernier relevé importé le {d:%Y-%m-%d}", "path": f"/bank/{acc}"})
        if lines:
            out.append({"kind": "bank", "label": "Relevé bancaire à importer", "count": len(lines),
                        "path": lines[0]["path"] if len(lines) == 1 else "/bank", "lines": lines})

    return {"items": out, "total": sum(i["count"] for i in out), "browser": cfg["browser"]}
