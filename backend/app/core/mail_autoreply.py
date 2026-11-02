"""Reponse automatique d'une regle des courriels (TASK-006.24, GO de Philippe 2026-11-02).

« j'ai reçu un courriel de transfert Interac, mais je ne l'ai pas reçu à la bonne adresse ; j'aimerais qu'automatiquement le
courriel soit répondu et un courriel en Cc à l'adresse où la facture est envoyée pour le client ».

Action « repondre » d'une regle : {texte, objet, a: expediteur | client, cc, cc_client, boite_id, mode: envoyer | preparer}.
- A l'arrivee, la regle met le courriel « en attente » (mail_messages.auto_reply) ; process() fait la suite a chaque tour de
  la copie des courriels : si la reponse va au client, elle attend que le courriel soit classe dans sa fiche (regle,
  adresse, ou Zeko qui lit « X vous a envoye... ») ; l'adresse du client = celle de ses factures (late_fees.billing_email).
- Garde-fous : jamais vers une adresse sans reponse (noreply, notify...) ni vers nos propres boites ; une seule reponse
  par regle et par client (ou expediteur) par jour ; client introuvable (Zeko a fini sans le trouver, ou 2 h passees) ->
  rien n'est envoye, le courriel va dans « A verifier » avec la raison.
- « preparer » : la reponse attend un clic (Envoyer / Modifier / Ne pas envoyer) dans le courriel et la cloche.
"""
from __future__ import annotations

import asyncio
import html as htmlmod
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

log = logging.getLogger("mail_autoreply")
WAIT_CLIENT = timedelta(hours=2)
NO_REPLY = re.compile(r"^(no-?reply|ne-?pas-?repondre|nepasrepondre|donotreply|do-not-reply|notify|notifications?|mailer-daemon|"
                      r"postmaster|bounces?|catch)\b", re.I)


# Dictionnaire des variables (montré dans l'éditeur de règle, avec recherche) : même liste que _fill
VARIABLES = [
    {"code": "{client}", "nom": "Nom du client", "explication": "Nom de la compagnie où le courriel est classé (tel qu'il est dans sa fiche). Vide si le courriel n'est classé nulle part.",
     "exemple": "Centre de santé cardiovasculaire inc."},
    {"code": "{objet}", "nom": "Objet du courriel reçu", "explication": "L'objet du courriel auquel on répond, tel quel. Pour un avis Interac, il contient le nom de l'envoyeur et le montant.",
     "exemple": "Virement Interac : CARDIOVASCULAIRE INC. vous a envoyé 133,03 $. Récupérez votre dépôt!"},
    {"code": "{date}", "nom": "Date du courriel reçu", "explication": "Date d'envoi du courriel reçu (année-mois-jour).", "exemple": "2026-11-01"},
    {"code": "{expediteur}", "nom": "Expéditeur", "explication": "Nom de la personne ou du service qui a envoyé le courriel (sinon son adresse).",
     "exemple": "Interac"},
]


def validate(a: dict | None) -> dict | None:
    """Nettoie l'action « repondre » d'une regle ; ValueError si incomplete. None = pas de reponse."""
    if not a or not a.get("actif"):
        return None
    texte = str(a.get("texte") or "").strip()
    if not texte:
        raise ValueError("Réponse automatique : écris le texte de la réponse")
    if a.get("a") not in ("expediteur", "client"):
        raise ValueError("Réponse automatique : à l'expéditeur ou à l'adresse des factures du client")
    if not a.get("boite_id"):
        raise ValueError("Réponse automatique : choisis la boîte d'où elle part")
    uuid.UUID(str(a["boite_id"]))
    from app.core import mail_send
    cc = str(a.get("cc") or "").strip()
    if cc:
        mail_send.addresses(cc)                 # ValueError si une adresse est invalide
    return {"actif": True, "texte": texte[:5000], "objet": (str(a.get("objet") or "").strip() or "RE: {objet}")[:300],
            "a": a["a"], "cc": cc[:1000], "cc_client": bool(a.get("cc_client")), "boite_id": str(a["boite_id"]),
            "mode": "preparer" if a.get("mode") == "preparer" else "envoyer"}


def start(msg, rule) -> bool:
    """A l'arrivee, une regle qui repond : le courriel attend sa reponse (process la fait)."""
    a = (rule.actions or {}).get("repondre")
    if not a or not a.get("actif") or msg.direction != "in" or msg.auto_reply:
        return False
    msg.auto_reply = {"etat": "attente", "regle_id": str(rule.id), "depuis": datetime.now(timezone.utc).isoformat()}
    return True


def _fill(t: str, msg, client: str | None) -> str:
    when = msg.sent_at.astimezone().strftime("%Y-%m-%d") if msg.sent_at else ""
    return (t.replace("{client}", client or "").replace("{objet}", msg.subject or "").replace("{date}", when)
             .replace("{expediteur}", msg.from_name or msg.from_email or ""))


def _ok_address(addr: str | None, own: set[str]) -> bool:
    a = (addr or "").strip().lower()
    return "@" in a and not NO_REPLY.search(a.split("@")[0]) and a.rsplit("@", 1)[1] not in own


async def _draft(db, msg, rule) -> tuple[dict | None, str | None]:
    """(brouillon, None) prêt à partir, (None, "attendre") si le client n'est pas encore connu, ou (None, raison)."""
    from app.core import late_fees, mail_send
    from app.models.company import Company
    from app.models.mailbox import Mailbox
    a = (rule.actions or {}).get("repondre") or {}
    box = await db.get(Mailbox, uuid.UUID(a["boite_id"]))
    if not box or not box.is_active or not box.password_enc:
        return None, "la boîte d'envoi n'est plus active ou n'a pas de mot de passe"
    own = {b.rsplit("@", 1)[-1].lower() for b, in (await db.execute(select(Mailbox.email))).all()}
    need_client = a["a"] == "client" or a.get("cc_client")
    client, billing = None, None
    if need_client:
        if not msg.company_id:
            return None, "attendre"
        co = await db.get(Company, msg.company_id)
        client = co.name if co else None
        billing = await late_fees.billing_email(db, msg.company_id)
        if not billing:
            return None, f"{client or 'le client'} n'a aucune adresse pour les factures (contact « comptes payables » ou « facturation »)"
    to = billing if a["a"] == "client" else msg.from_email
    if not _ok_address(to, own):
        return None, f"pas de réponse à {to or '(aucune adresse)'} : adresse sans réponse ou une de nos boîtes"
    cc = [x for _, x in mail_send.addresses(a.get("cc") or "")]
    if a.get("cc_client") and billing and billing.lower() not in [x.lower() for x in cc] and billing.lower() != to.lower():
        cc.append(billing)
    body = htmlmod.escape(_fill(a["texte"], msg, client)).replace("\n", "<br>")
    return {"de": box.email, "boite_id": str(box.id), "a": to, "cc": ", ".join(cc), "objet": _fill(a["objet"], msg, client)[:300],
            "html": f'<div style="font-family:Arial,sans-serif;font-size:14px">{body}</div>', "client": client}, None


async def _already(db, msg, rule) -> bool:
    """Une seule réponse par règle et par client (sinon par expéditeur) par jour : jamais de boucle."""
    from app.models.mailbox import MailMessage
    since = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    who = MailMessage.company_id == msg.company_id if msg.company_id else MailMessage.from_email == msg.from_email
    rows = (await db.execute(select(MailMessage.auto_reply).where(
        MailMessage.id != msg.id, who, MailMessage.auto_reply["regle_id"].astext == str(rule.id),
        MailMessage.auto_reply["etat"].astext == "envoyee"))).scalars().all()
    return any((r or {}).get("le", "") >= since for r in rows)


async def send(db, msg, draft: dict, user_id=None) -> None:
    """Envoie le brouillon (même envoi que le bouton « Envoyer » des courriels) : copie dans Envoyés de la boîte et ici,
    classée dans la fiche du courriel d'origine ; le courriel d'origine est marqué « répondu »."""
    from app.core import mail_match, mail_send, mail_store
    from app.core import mailboxes as mbx
    from app.models.mailbox import Mailbox, MailMessage
    box = await db.get(Mailbox, uuid.UUID(draft["boite_id"]))
    to, cc = mail_send.addresses(draft["a"]), mail_send.addresses(draft.get("cc") or "")
    html = draft["html"] + mail_send.quote_html(msg)
    raw, _mid = mail_send.build(sender=box.email, sender_name=box.display_name or "", to=to, cc=cc, subject=draft["objet"] or "(sans objet)",
                                html_body=html, files=[], in_reply_to=msg.message_id,
                                references=mail_send.references_of(msg.stored_path) if msg.stored_path else None)
    boxd = {"host": box.host, "port": box.imap_port, "smtp_port": box.smtp_port, "user": box.username,
            "password": mbx.password_of(box), "email": box.email}
    await asyncio.wait_for(asyncio.to_thread(mail_send.send_sync, boxd, raw, [x for _, x in to + cc]), 90)
    out = MailMessage(mailbox_id=box.id, direction="out", stored_path=mail_send.save_sent(box.id, raw), is_read=True,
                      sent_by_user_id=user_id, company_id=msg.company_id, contact_id=msg.contact_id,
                      classified_by=msg.classified_by or ("auto" if msg.company_id else None), **mail_store.parse(raw))
    if not out.company_id:
        for _, x in to + cc:
            c_id, p_id = await mail_match.by_address(db, x.lower())
            if c_id or p_id:
                out.company_id, out.contact_id, out.classified_by = c_id, p_id, "auto"
                break
    db.add(out)
    msg.answered_at = mail_store.now()
    msg.auto_reply = {**(msg.auto_reply or {}), "etat": "envoyee", "brouillon": draft, "le": datetime.now(timezone.utc).isoformat(),
                      "raison": None}
    await db.commit()
    try:
        same = box.id == msg.mailbox_id
        await asyncio.wait_for(asyncio.to_thread(mail_send.after_send_sync, boxd, raw, msg.uid if same else None,
                                                 msg.uidvalidity if same else None), 60)
    except Exception as exc:
        out.copy_error = (str(exc) or exc.__class__.__name__)[:500]
        await db.commit()


async def process(db) -> int:
    """Un tour : les courriels qui attendent leur réponse automatique. Retour : combien ont avancé."""
    from app.models.mailbox import MailMessage, MailRule
    rows = (await db.execute(select(MailMessage).where(MailMessage.auto_reply["etat"].astext == "attente").limit(50))).scalars().all()
    n = 0
    for m in rows:
        ar = dict(m.auto_reply or {})
        rule = await db.get(MailRule, uuid.UUID(ar["regle_id"])) if ar.get("regle_id") else None
        if not rule or not ((rule.actions or {}).get("repondre") or {}).get("actif"):
            m.auto_reply = {**ar, "etat": "annulee", "raison": "la règle n'existe plus ou ne répond plus"}
            n += 1
            continue
        if m.junk_at:
            m.auto_reply = {**ar, "etat": "annulee", "raison": "courriel mis dans « À jeter »"}
            n += 1
            continue
        try:
            draft, why = await _draft(db, m, rule)
        except Exception as exc:                      # noqa: BLE001 -- un courriel en erreur ne bloque jamais les autres
            draft, why = None, f"erreur : {str(exc)[:200]}"
        if why == "attendre":                         # client pas encore connu : on attend que Zéko ait lu (2 h au plus)
            started = datetime.fromisoformat(ar["depuis"]) if ar.get("depuis") else datetime.now(timezone.utc)
            if m.zeko_classify != "done" and datetime.now(timezone.utc) - started < WAIT_CLIENT:
                continue
            m.auto_reply = {**ar, "etat": "pas_envoyee", "raison": "client introuvable : classe le courriel dans sa fiche, puis « Envoyer »"}
            n += 1
            continue
        if why:
            m.auto_reply = {**ar, "etat": "pas_envoyee", "raison": why}
            n += 1
            continue
        if await _already(db, m, rule):
            m.auto_reply = {**ar, "etat": "pas_envoyee", "brouillon": draft,
                            "raison": "déjà répondu aujourd'hui par cette règle (une réponse par jour au plus)"}
            n += 1
            continue
        if rule.actions["repondre"].get("mode") == "preparer":
            m.auto_reply = {**ar, "etat": "preparee", "brouillon": draft}
            n += 1
            continue
        try:
            await send(db, m, draft)
        except Exception as exc:                      # noqa: BLE001
            await db.rollback()
            m = await db.get(MailMessage, m.id)
            m.auto_reply = {**ar, "etat": "pas_envoyee", "brouillon": draft, "raison": f"envoi impossible : {str(exc)[:200]}"}
            log.warning("Réponse automatique du courriel %s : %s", m.id, exc)
        n += 1
    await db.commit()
    return n
