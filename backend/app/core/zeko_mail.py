"""Zeko et les courriels (2026-10-27).

TASK-047.5 : classer les courriels « A classer » -- d'abord les regles (mail_match.classify, qui ne tournait qu'a
l'arrivee : les fiches creees apres coup ne rattrapaient jamais les anciens courriels), puis Zeko lit le reste et
choisit la compagnie dans la liste des compagnies (jamais un nom invente : seulement un nom exact de la liste, et
seulement s'il est certain). Incertain -> reste « A classer ».

TASK-026.6 : un client ecrit pour deplacer un RDV (ou arrive en retard) -> Zeko lit le courriel et PREPARE une
proposition, Philippe confirme en un clic dans le courriel (pas d'envoi ni de changement d'agenda tout seul) :
- « move » : la nouvelle plage est libre (meme duree, 30 min libres avant et apres) -> deplacer le RDV ;
  retard annonce -> debut decale, fin inchangee ;
- « email » : pas libre -> courriel au client signe Zeko, prochaine plage libre + lien de prise de RDV + lien de
  desinscription personnel (TASK-026.9) ; « suggest » si les reponses sont eteintes ou que le client a refuse ;
- « info » : annulation ou autre -> seulement signale.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select

from app.core import clock, mail_match, zeko

log = logging.getLogger("zeko_mail")

# Marge avant/apres, duree proposee et horizon : reglables (TASK-026.10, Configuration generale -> Agenda)
_JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]


def _json(content: str) -> dict:
    m = re.search(r"\{.*\}", content or "", re.S)
    try:
        return json.loads(m.group(0)) if m else {}
    except ValueError:
        return {}


def _text(msg, n: int = 5000) -> str:
    return (msg.body_text or "")[:n]


def fr_when(dt: datetime) -> str:
    d = dt.astimezone(clock.business_tz())
    return f"{_JOURS[d.weekday()]} {d.day} {_MOIS[d.month - 1]} à {d.hour} h {d.minute:02d}"


def fr_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h} h" if h and not m else f"{h} h {m:02d}" if h else f"{m} min"


# ── TASK-047.5 : classement ──────────────────────────────────────────────────────────────────────────────────────

async def _own_domains(db) -> set[str]:
    from app.models.mailbox import Mailbox
    return {b.email.rsplit("@", 1)[1].lower() for b in (await db.execute(select(Mailbox))).scalars().all() if "@" in b.email}


async def queue_unclassified(db) -> dict:
    """Repasse les regles sur les courriels recus « A classer » ; ce qui reste est mis en file pour Zeko."""
    from app.models.mailbox import Mailbox, MailMessage
    own = await _own_domains(db)
    rows = (await db.execute(select(MailMessage, Mailbox.email).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(
        Mailbox.kind.in_(("shared", "personal")), MailMessage.direction == "in",
        MailMessage.company_id.is_(None), MailMessage.contact_id.is_(None),
        MailMessage.classified_by.is_distinct_from("manual")).order_by(MailMessage.sent_at))).all()
    by_rules = queued = 0
    zeko_on = await zeko.enabled()
    for msg, box_email in rows:
        try:
            async with db.begin_nested():
                await mail_match.classify(db, msg, own, box_email)
        except Exception as exc:
            log.warning("Regles sur le courriel %s : %s", msg.id, exc)
        if msg.company_id or msg.contact_id:
            by_rules += 1
        elif zeko_on and mail_match.domain_of(msg.from_email) not in own and msg.zeko_classify is None:
            msg.zeko_classify = "pending"
            queued += 1
    await db.commit()
    return {"examined": len(rows), "by_rules": by_rules, "queued_for_zeko": queued}


async def classify_with_zeko(db, msg) -> None:
    from app.models.company import Company
    # notre propre compagnie (Administration, is_owner) n'est jamais un choix : tout courriel recu lui est adresse,
    # Zeko la prenait pour « la compagnie concernee » (64 courriels mal classes, ERRORS_LESSONS TASK-047.5)
    from app.core.owner import get_owner
    owner = await get_owner(db)
    own_name = mail_match._LEGAL.sub(" ", mail_match._norm(owner.name)).split() if owner else []
    own_name = " ".join(own_name)

    def is_ours(n: str) -> bool:
        # aussi les fiches dont le nom contient le notre (« Simple IP Rose ») : Zeko y mettait les memes courriels
        return bool(own_name) and f" {own_name} " in f" {' '.join(mail_match._LEGAL.sub(' ', mail_match._norm(n)).split())} "
    names = [n for n, in (await db.execute(select(Company.name).where(Company.is_active.is_(True), Company.is_owner.is_not(True))
                                           .order_by(Company.name))).all() if not is_ours(n)]
    prompt = (
        "Tu es Zéko, l'IA de Simple IP (fournisseur de téléphonie IP et de services informatiques au Québec). "
        "Voici un courriel REÇU PAR Simple IP et la liste de NOS CLIENTS ET FOURNISSEURS. Dis à quelle compagnie de la liste ce courriel "
        "appartient : celle qui l'a envoyé ou dont il parle directement (ex. un reçu de paiement d'un client, un avis "
        "d'un fournisseur de la liste). Le destinataire est toujours Simple IP : ne choisis jamais une compagnie parce que le "
        "courriel est adressé à Simple IP ou parle de Simple IP. Si aucune compagnie de la liste n'est clairement concernée "
        "(infolettre, publicité, banque, service externe qui n'est pas dans la liste), réponds null. Ne devine jamais.\n"
        "Réponds UNIQUEMENT en JSON : {\"compagnie\": \"nom exact copié de la liste\" ou null, \"certain\": true|false}\n\n"
        "Liste :\n" + "\n".join(f"- {n}" for n in names) + "\n\n"
        f"De : {msg.from_name or ''} <{msg.from_email}>\nObjet : {msg.subject or ''}\n\n{_text(msg, 4000)}"
    )
    x = _json(await zeko.complete([{"role": "user", "content": prompt}], purpose="classement_courriel", timeout=900))
    name = (x.get("compagnie") or "").strip() if isinstance(x.get("compagnie"), str) else ""
    msg.zeko_classify = "done"
    if not name or x.get("certain") is not True:
        return
    match = (await db.execute(select(Company.id).where(Company.is_active.is_(True), Company.is_owner.is_not(True),
                                                       func.lower(Company.name) == name.lower()))).scalars().all()
    if len(match) == 1 and not is_ours(name) and not (msg.company_id or msg.contact_id):
        msg.company_id, msg.classified_by = match[0], "zeko"


# ── TASK-026.9 : Zeko repond-il au client ? ──────────────────────────────────────────────────────────────────────

def _optout_sig(contact_id) -> str:
    import hashlib
    import hmac
    from app.core.config import settings
    return hmac.new(settings.SECRET_KEY.encode(), f"zeko-optout:{contact_id}".encode(), hashlib.sha256).hexdigest()[:32]


def optout_url(contact_id) -> str:
    """Lien personnel au contact (signe, sans connexion) : « je ne veux plus que Zeko me reponde »."""
    from app.core.config import settings
    return f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/v1/public/zeko/optout/{contact_id}/{_optout_sig(contact_id)}"


def optout_ok(contact_id, sig: str) -> bool:
    import hmac
    return hmac.compare_digest(_optout_sig(contact_id), sig or "")


async def replies_blocked(db, contact) -> str | None:
    """Pourquoi Zeko ne peut pas ecrire a ce client (None = il peut) : reglage eteint, client qui a refuse, pas de contact."""
    from app.api.v1.endpoints.settings import get_setting
    if (await get_setting(db, "zeko_client_replies_enabled")) != "true":
        return "Les réponses de Zéko aux clients sont éteintes (Administration → Zéko)."
    if not contact:
        return "Ce courriel n'est lié à aucun contact : Zéko n'écrit qu'à un contact (lien de désinscription personnel)."
    if contact.zeko_replies_off:
        return f"{contact.first_name} {contact.last_name}".strip() + " ne veut pas que Zéko lui réponde (fiche du contact)."
    return None


# ── TASK-026.6 : RDV ─────────────────────────────────────────────────────────────────────────────────────────────

async def upcoming_rdv(db, msg) -> list[dict]:
    """RDV a venir (et ceux d'aujourd'hui) relies a ce client par leur ticket -- compagnie ou contact du courriel."""
    from app.core import google_calendar
    from app.models.ticket import Ticket
    conds = []
    if msg.company_id:
        conds.append(Ticket.company_id == msg.company_id)
    if msg.contact_id:
        conds.append(Ticket.contact_id == msg.contact_id)
    if not conds:
        return []
    from sqlalchemy import or_
    tickets = (await db.execute(select(Ticket).where(Ticket.google_calendar_event_id.is_not(None), or_(*conds)))).scalars().all()
    if not tickets:
        return []
    by_event = {t.google_calendar_event_id: t for t in tickets}
    now = datetime.now(timezone.utc)
    events = await google_calendar.list_events(db, now - timedelta(hours=12), now + timedelta(days=_lookahead()))
    out = []
    for e in events:
        t = by_event.get(e["id"])
        if not t or e.get("all_day"):
            continue
        start, end = datetime.fromisoformat(e["start"]), datetime.fromisoformat(e["end"])
        if end < now:
            continue
        out.append({"event_id": e["id"], "calendar_id": e["calendar_id"], "title": e["title"], "description": e.get("description"),
                    "location": e.get("location"), "start": start.isoformat(), "end": end.isoformat(),
                    "minutes": int((end - start).total_seconds() // 60), "ticket_id": str(t.id),
                    "assigned_to_id": str(t.assigned_to_id) if t.assigned_to_id else None})
    return sorted(out, key=lambda r: r["start"])


async def _busy(db, start_utc: datetime, end_utc: datetime, exclude_event_id: str, user_id=None) -> list[tuple[datetime, datetime]]:
    """Plages occupees de l'agenda, le RDV a deplacer exclu ; un RDV propose doit laisser la marge reglee libre avant
    lui (fin d'une plage occupee + marge avant) et apres lui (debut d'une plage occupee - marge apres)."""
    from app.core import agenda_config, google_calendar
    from app.api.v1.endpoints.appointments import _local_busy_blocks
    from app.core import booking
    tech = await booking.tech_of_user(db, user_id)      # TASK-026.11 : technicien du RDV -> ses agendas et sa marge
    if tech:
        return await booking.busy_for(db, tech, start_utc, end_utc, exclude_event_id)
    cfg = await agenda_config.load()
    before, after = timedelta(minutes=int(cfg["zeko_buffer_before"])), timedelta(minutes=int(cfg["zeko_buffer_after"]))
    blocks = []
    for e in await google_calendar.list_events(db, start_utc, end_utc):
        if e["id"] == exclude_event_id or e.get("all_day") or not e.get("editable", True):
            continue
        blocks.append((datetime.fromisoformat(e["start"]) - after, datetime.fromisoformat(e["end"]) + before))
    blocks += [(s - after, e + before) for s, e in await _local_busy_blocks(db, start_utc, end_utc)]
    return blocks


async def _margins(db, user_id=None) -> tuple[int, int]:
    """Marge (avant, apres) : celle du technicien du RDV, sinon celle de Zeko (onglet Agenda) -- TASK-026.13 :
    appliquee aussi a l'ouverture, au diner et a la fermeture."""
    from app.core import agenda_config, booking
    tech = await booking.tech_of_user(db, user_id)
    if tech:
        return tech["buffer_before"], tech["buffer_after"]
    cfg = await agenda_config.load()
    return int(cfg["zeko_buffer_before"]), int(cfg["zeko_buffer_after"])


def _lookahead() -> int:
    from app.core import agenda_config
    return int(agenda_config.current()["lookahead_days"])


def proposed_minutes(rdv: dict) -> int:
    """Duree de la plage proposee : celle du RDV d'origine, ou la duree fixe reglee (TASK-026.10)."""
    from app.core import agenda_config
    cfg = agenda_config.current()
    return int(rdv["minutes"]) if cfg["zeko_same_duration"] else int(cfg["zeko_fixed_duration"])


def _in_hours(start: datetime, minutes: int) -> bool:
    from app.core.business_hours import business_hours_for
    local = start.astimezone(clock.business_tz())
    hours = business_hours_for(local.date())
    if not hours:
        return False
    end = local + timedelta(minutes=minutes)
    return local.time() >= hours[0] and end.date() == local.date() and end.time() <= hours[1]


async def is_free(db, start: datetime, minutes: int, exclude_event_id: str, user_id=None) -> bool:
    if start <= datetime.now(timezone.utc) or not _in_hours(start, minutes):
        return False
    from app.api.v1.endpoints.appointments import closed_blocks
    end = start + timedelta(minutes=minutes)
    busy = await _busy(db, start - timedelta(hours=12), end + timedelta(hours=12), exclude_event_id, user_id)
    busy += closed_blocks(start.astimezone(clock.business_tz()).date(), await _margins(db, user_id), clock.business_tz())
    return not any(start < b_end and end > b_start for b_start, b_end in busy)


async def next_free(db, after: datetime, minutes: int, exclude_event_id: str, user_id=None) -> datetime | None:
    """Prochaine plage de meme duree, 30 min libres avant et apres, dans les heures de RDV (pas avant demain)."""
    from app.api.v1.endpoints.appointments import _day_slots
    tz = clock.business_tz()
    now_local = datetime.now(tz)
    earliest = max(after.astimezone(tz), datetime.combine((now_local + timedelta(days=1)).date(), time(0, 0), tzinfo=tz))
    start_utc = earliest.astimezone(timezone.utc)
    busy = [(b.astimezone(tz), e.astimezone(tz)) for b, e in await _busy(db, start_utc - timedelta(days=1), start_utc + timedelta(days=_lookahead()), exclude_event_id, user_id)]
    margins = await _margins(db, user_id)
    for i in range(_lookahead()):
        d = (earliest + timedelta(days=i)).date()
        slots = _day_slots("rdv", minutes, d, earliest, busy, margins)
        if slots:
            return datetime.combine(d, slots[0], tzinfo=tz).astimezone(timezone.utc)
    return None


def _email_text(first_name: str, minutes: int, proposal: datetime | None, link: str) -> str:
    hello = f"Bonjour {first_name}," if first_name else "Bonjour,"
    offer = (f"Je peux vous proposer le {fr_when(proposal)} ({fr_duration(minutes)})."
             if proposal else "Je n'ai pas trouvé de plage libre dans les prochaines semaines.")
    return (f"{hello}\n\nJe suis Zéko, l'IA de Simple IP. {{responsable}} ne semble pas disponible dans cette plage horaire. "
            f"{offer}\n\nVous pouvez aussi choisir la plage qui vous convient à ce lien : {link}\n\n"
            "Merci,\nZéko, l'IA de Simple IP")


async def rdv_with_zeko(db, msg) -> None:
    """Prepare la proposition (jamais appliquee ici) ; msg.zeko_rdv = done | none."""
    from app.core import agenda_config
    from app.core.config import settings
    from app.models.contact import Contact
    await agenda_config.load()
    rdvs = await upcoming_rdv(db, msg)
    if not rdvs:
        msg.zeko_rdv = "none"
        return
    tz = clock.business_tz()
    sent = (msg.sent_at or datetime.now(timezone.utc)).astimezone(tz)
    listing = "\n".join(f"{i + 1}) « {r['title']} » le {fr_when(datetime.fromisoformat(r['start']))}, durée {fr_duration(r['minutes'])}"
                        for i, r in enumerate(rdvs))
    prompt = (
        "Tu es Zéko, l'IA de Simple IP. Un client nous écrit. Lis SEULEMENT son nouveau message (pas les messages cités plus "
        "bas). Est-ce qu'il demande de changer un de ses rendez-vous ci-dessous : le déplacer à une autre date/heure, "
        "l'annuler, ou annoncer qu'il arrivera en retard (à quelle heure) ?\n"
        f"Date du courriel : {_JOURS[sent.weekday()]} {sent.strftime('%Y-%m-%d %H:%M')}\n"
        f"Ses rendez-vous :\n{listing}\n\n"
        "Réponds UNIQUEMENT en JSON : {\"rdv\": numéro du rendez-vous ou null, \"action\": \"deplacer\"|\"retard\"|\"annuler\"|\"aucune\", "
        "\"nouvelle_date\": \"AAAA-MM-JJ\" ou null, \"nouvelle_heure\": \"HH:MM\" ou null, \"resume\": \"une phrase en français\"}\n"
        "« retard » : nouvelle_heure = l'heure où il arrivera. « deplacer » sans date ou heure précise : null.\n\n"
        f"De : {msg.from_name or ''} <{msg.from_email}>\nObjet : {msg.subject or ''}\n\n{_text(msg)}"
    )
    x = _json(await zeko.complete([{"role": "user", "content": prompt}], purpose="rdv_courriel", timeout=900))
    action = x.get("action") if x.get("action") in ("deplacer", "retard", "annuler") else None
    try:
        rdv = rdvs[int(x.get("rdv")) - 1] if action and x.get("rdv") is not None else None
    except (ValueError, TypeError, IndexError):
        rdv = None
    if not rdv:
        msg.zeko_rdv = "none"
        return
    summary = str(x.get("resume") or "")[:300]
    start, end = datetime.fromisoformat(rdv["start"]), datetime.fromisoformat(rdv["end"])
    new_start = None
    try:
        d = date.fromisoformat(x["nouvelle_date"]) if x.get("nouvelle_date") else start.astimezone(tz).date()
        if x.get("nouvelle_heure"):
            hh, mm = (int(v) for v in str(x["nouvelle_heure"]).split(":")[:2])
            new_start = datetime.combine(d, time(hh, mm), tzinfo=tz).astimezone(timezone.utc)
    except (ValueError, TypeError, KeyError):
        new_start = None
    proposal = {"action": action, "summary": summary, "rdv": rdv, "status": "pending"}
    if action == "annuler":
        proposal["kind"] = "info"
    elif action == "retard" and new_start and start < new_start < end:
        # il arrive plus tard : debut decale, fin inchangee -- rien a ecrire au client
        proposal.update(kind="move", new_start=new_start.isoformat(), new_end=end.isoformat())
    elif new_start and await is_free(db, new_start, rdv["minutes"], rdv["event_id"], rdv.get("assigned_to_id")):
        proposal.update(kind="move", new_start=new_start.isoformat(), new_end=(new_start + timedelta(minutes=rdv["minutes"])).isoformat())
    else:
        minutes = proposed_minutes(rdv)
        free = await next_free(db, new_start or start, minutes, rdv["event_id"], rdv.get("assigned_to_id"))
        contact = await db.get(Contact, msg.contact_id) if msg.contact_id else None
        subject = msg.subject or ""
        proposal.update(requested=new_start.isoformat() if new_start else None,
                        offer_start=free.isoformat() if free else None,
                        offer_end=(free + timedelta(minutes=minutes)).isoformat() if free else None)
        blocked = await replies_blocked(db, contact)
        if blocked:                       # TASK-026.9 : Zeko n'ecrit pas, il montre seulement la plage a Philippe
            proposal.update(kind="suggest", blocked=blocked)
        else:
            proposal.update(kind="email", to=msg.from_email, subject=subject if subject.lower().startswith("re:") else f"RE: {subject}",
                            text=_email_text(contact.first_name, minutes, free, f"{settings.PUBLIC_BASE_URL.rstrip('/')}/rdv"))
    msg.zeko_rdv_proposal = proposal
    msg.zeko_rdv = "done"
