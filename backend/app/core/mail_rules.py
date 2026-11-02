"""Regles des courriels, comme celles d'Outlook (TASK-006.22, Philippe 2026-11-02).

« j'aimerais le même système que les règles de Outlook : on peut choisir juste l'expéditeur ou le titre ou plein d'autres
options, et on peut même en choisir plusieurs ; on pourrait aussi choisir de les mettre lus ou de les déplacer dans la
corbeille... ou déplacer dans un autre dossier » ; « quand on crée une règle et qu'il y en a plusieurs, il nous demande si
on veut le faire sur tous les anciens aussi ».

Appliquees par le PROGRAMME a l'arrivee d'un courriel dans la boite de reception (instantane, sans IA), avant le classement
par adresse (mail_match). Une regle = des conditions (toutes, ou au moins une) et des actions. Les regles passent dans
l'ordre (position) ; la premiere qui repond s'applique, jamais les suivantes (case « Arreter ici » retiree : Philippe
2026-11-02, « enlève ça, ça va toujours être le cas »). Le classement d'une regle n'ecrase jamais
un classement fait a la main.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

FIELDS = {"expediteur": "Expéditeur (adresse ou nom)", "destinataire": "Destinataire (À ou Cc)", "objet": "Objet",
          "corps": "Texte du courriel", "piece_jointe": "Nom d'une pièce jointe", "boite": "Boîte qui reçoit"}
OPS = {"contient": "contient", "ne_contient_pas": "ne contient pas", "est": "est exactement", "commence_par": "commence par",
       "finit_par": "finit par", "existe": "existe (au moins une)"}
MATCH = ("toutes", "une")


def _norm(v) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(v or "").lower()) if unicodedata.category(c) != "Mn").strip()


def validate(name: str, match: str, conditions: list, actions: dict) -> tuple[str, str, list, dict]:
    """Nettoie une regle ; ValueError avec un message clair si elle est incomplete."""
    name = (name or "").strip()[:200]
    if not name:
        raise ValueError("Donne un nom à la règle")
    if match not in MATCH:
        raise ValueError("Correspondance : toutes les conditions, ou au moins une")
    out = []
    for c in conditions or []:
        f, op, v = (c or {}).get("champ"), (c or {}).get("op"), str((c or {}).get("valeur") or "").strip()
        if f not in FIELDS or op not in OPS:
            raise ValueError("Condition incomplète : choisis le champ et la comparaison")
        if op == "existe" and f != "piece_jointe":
            raise ValueError("« existe » sert seulement pour une pièce jointe")
        if op != "existe" and not v:
            raise ValueError(f"Condition « {FIELDS[f]} {OPS[op]} » : il manque le texte")
        out.append({"champ": f, "op": op, "valeur": v[:500]})
    if not out:
        raise ValueError("Au moins une condition")
    a = actions or {}
    clean = {"compagnie_id": str(a["compagnie_id"]) if a.get("compagnie_id") else None,
             "contact_id": str(a["contact_id"]) if a.get("contact_id") else None,
             "lu": bool(a.get("lu")), "a_jeter": bool(a.get("a_jeter")),
             "dossier": (str(a.get("dossier") or "").strip()[:200] or None),
             "arreter": True,      # Philippe 2026-11-02 : toujours la première règle qui répond, case retirée
             "repondre": None}
    from app.core import mail_autoreply
    clean["repondre"] = mail_autoreply.validate(a.get("repondre"))       # TASK-006.24
    if clean["a_jeter"] and clean["dossier"]:
        raise ValueError("Choisis « À jeter » ou un dossier, pas les deux")
    if not (clean["compagnie_id"] or clean["contact_id"] or clean["lu"] or clean["a_jeter"] or clean["dossier"] or clean["repondre"]):
        raise ValueError("Au moins une action : classer, marquer lu, À jeter, déplacer dans un dossier ou répondre")
    if clean["repondre"] and clean["a_jeter"]:
        raise ValueError("Une réponse automatique et « À jeter » ne vont pas ensemble")
    for k in ("compagnie_id", "contact_id"):
        if clean[k]:
            uuid.UUID(clean[k])
    return name, match, out, clean


def _values(field: str, msg, box_email: str) -> list[str]:
    if field == "expediteur":
        return [msg.from_email or "", msg.from_name or "", f"{msg.from_name or ''} <{msg.from_email or ''}>"]
    if field == "destinataire":
        return [x for x in re.split(r"[,;]", f"{msg.to_addrs or ''},{msg.cc_addrs or ''}") if x.strip()] + \
               [f"{msg.to_addrs or ''} {msg.cc_addrs or ''}"]
    if field == "objet":
        return [msg.subject or ""]
    if field == "corps":
        return [msg.body_text or ""]
    if field == "piece_jointe":
        return [a.get("filename") or "" for a in (msg.attachments or [])]
    if field == "boite":
        return [box_email or ""]
    return []


def _one(c: dict, msg, box_email: str) -> bool:
    vals = [_norm(v) for v in _values(c["champ"], msg, box_email)]
    if c["op"] == "existe":
        return any(vals)
    want = _norm(c["valeur"])
    if c["op"] == "ne_contient_pas":
        return not any(want in v for v in vals)
    test = {"contient": lambda v: want in v, "est": lambda v: v == want,
            "commence_par": lambda v: v.startswith(want), "finit_par": lambda v: v.endswith(want)}[c["op"]]
    return any(test(v) for v in vals)


def matches(rule, msg, box_email: str) -> bool:
    res = [_one(c, msg, box_email) for c in rule.conditions or []]
    return bool(res) and (all(res) if rule.match == "toutes" else any(res))


def apply(rule, msg, *, classify: bool = True) -> list[str]:
    """Actions de la regle sur ce courriel (rien n'est commite ici). Retour : ce qui a ete fait, en mots."""
    from app.core import mail_junk
    a, done = rule.actions or {}, []
    if classify and (a.get("compagnie_id") or a.get("contact_id")) and msg.classified_by != "manual":
        msg.company_id = uuid.UUID(a["compagnie_id"]) if a.get("compagnie_id") else None
        msg.contact_id = uuid.UUID(a["contact_id"]) if a.get("contact_id") else None
        msg.classified_by, msg.rule_id = "regle", rule.id
        if msg.zeko_classify == "pending":
            msg.zeko_classify = None
        done.append("classé")
    if msg.direction == "out" or msg.folder_id:          # copie d'un autre dossier ou envoyé : seulement le classement
        if done:
            rule.hits = (rule.hits or 0) + 1
            rule.last_hit_at = datetime.now(timezone.utc)
        return done
    if a.get("lu") and not msg.is_read:
        msg.is_read = True
        msg.flag_pending = msg.uid is not None          # écrit dans la vraie boîte au prochain passage
        msg.rule_id = msg.rule_id or rule.id
        done.append("marqué lu")
    if a.get("a_jeter") and not msg.junk_at:
        mail_junk.put_in_junk(msg)
        msg.rule_id = msg.rule_id or rule.id
        done.append("mis dans « À jeter »")
    elif a.get("dossier") and msg.uid is not None and not msg.junk_at and msg.move_state != "done":
        msg.move_to, msg.move_state, msg.move_error = a["dossier"], "move", None
        msg.rule_id = msg.rule_id or rule.id
        done.append(f"déplacé dans « {a['dossier']} »")
    if done:
        rule.hits = (rule.hits or 0) + 1
        rule.last_hit_at = datetime.now(timezone.utc)
    return done


async def active(db) -> list:
    from app.models.mailbox import MailRule
    return list((await db.execute(select(MailRule).where(MailRule.is_active.is_(True))
                                  .order_by(MailRule.position, MailRule.created_at))).scalars().all())


def run(rules: list, msg, box_email: str) -> bool:
    """A l'arrivee : les regles dans l'ordre. True si une regle a classe le courriel (le classement par adresse ne passe
    alors pas)."""
    classified = False
    for r in rules:
        if not matches(r, msg, box_email):
            continue
        if "classé" in apply(r, msg):
            classified = True
        from app.core import mail_autoreply
        mail_autoreply.start(msg, r)          # TASK-006.24 : seulement à l'arrivée, jamais sur les anciens
        break                          # la première règle qui répond, jamais les suivantes (Philippe 2026-11-02)
    return classified


async def existing(db, rule, limit: int | None = None) -> tuple[int, list]:
    """Courriels deja copies (boite de reception et autres dossiers, pas a jeter) qui repondent a la regle : (nombre, les
    plus recents). Les copies des autres dossiers comptent : ex. les rapports Patio Design deja ranges par une regle
    Outlook dans « Patio desing » (copies marquees « envoye » parce qu'ils viennent d'une de nos adresses)."""
    from app.models.mailbox import Mailbox, MailMessage
    rows = (await db.execute(select(MailMessage, Mailbox.email).join(Mailbox, Mailbox.id == MailMessage.mailbox_id)
                             .where(MailMessage.junk_at.is_(None))
                             .order_by(MailMessage.sent_at.desc()))).all()
    hit = [m for m, box in rows if matches(rule, m, box)]
    return len(hit), hit[:limit] if limit else hit


async def apply_existing(db, rule) -> dict:
    """« Aussi sur les anciens » : les actions sur les courriels deja recus qui repondent ; un classement fait a la main
    n'est jamais change."""
    from app.models.mailbox import Mailbox
    n, msgs = await existing(db, rule)
    counts = {"vus": n, "classes": 0, "lus": 0, "a_jeter": 0, "deplaces": 0, "garde_a_la_main": 0}
    for m in msgs:
        if m.classified_by == "manual" and ((rule.actions or {}).get("compagnie_id") or (rule.actions or {}).get("contact_id")):
            counts["garde_a_la_main"] += 1
        done = apply(rule, m)
        counts["classes"] += "classé" in done
        counts["lus"] += "marqué lu" in done
        counts["a_jeter"] += "mis dans « À jeter »" in done
        counts["deplaces"] += any(d.startswith("déplacé") for d in done)
    await db.commit()
    return counts


def describe(rule) -> str:
    """La regle en une phrase (liste, Zeko)."""
    conds = [f"{FIELDS[c['champ']].split(' (')[0].lower()} {OPS[c['op']]}" + ("" if c["op"] == "existe" else f" « {c['valeur']} »")
             for c in rule.conditions or []]
    return (" et " if rule.match == "toutes" else " ou ").join(conds)


# ── TASK-006.23 : courriels à vérifier (cloche, vue « À vérifier ») ─────────────────────────────────────────────────

def to_review(days: int):
    """Condition SQL : reçu, pas à jeter, et (classé par Zéko pas encore vu, contact créé pas encore vu, ou « À classer »
    reçu depuis `days` jours une fois que Zéko l'a lu ou n'avait pas à le lire). Une règle, un « C'est bon » ou un
    classement à la main le sortent de la liste."""
    from datetime import timedelta
    from sqlalchemy import and_, or_
    from app.models.mailbox import MailMessage
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return and_(MailMessage.direction == "in", MailMessage.junk_at.is_(None), or_(
        MailMessage.auto_reply["etat"].astext.in_(("preparee", "pas_envoyee")),     # TASK-006.24
        and_(MailMessage.classified_by == "zeko", MailMessage.reviewed_at.is_(None)),
        and_(MailMessage.contact_created.is_(True), MailMessage.reviewed_at.is_(None)),
        and_(MailMessage.company_id.is_(None), MailMessage.contact_id.is_(None), MailMessage.sent_at >= since,
             MailMessage.zeko_classify.is_distinct_from("pending"))))


def review_reason(m) -> str:
    st = (m.auto_reply or {}).get("etat")
    if st == "preparee":
        return "réponse automatique à envoyer"
    if st == "pas_envoyee":
        return "réponse automatique pas envoyée"
    if m.classified_by == "zeko" and not m.reviewed_at:
        return "classé par Zéko"
    if m.contact_created and not m.reviewed_at:
        return "contact créé"
    return "à classer"
