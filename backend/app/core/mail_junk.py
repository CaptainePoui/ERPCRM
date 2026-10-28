"""Liste noire et dossier « A jeter » (TASK-047.7, 2026-10-28).

Philippe : « j'aimerais avoir une facon de mettre des courriels en blacklist pour qu'ils aillent direct en a jeter » ;
« la vraie boite suit, je ne veux pas avoir a gerer mes boites courriel une 2e fois » ; garder 1 an.
- Liste : une adresse (calendar-notification@google.com) ou un domaine (google.com, et ses sous-domaines).
- Un courriel recu d'un expediteur de la liste va dans « A jeter » : pas classe, pas lu par Zeko. Ajouter un expediteur
  y met aussi ses anciens courriels ; le retirer les remet dans la boite de reception.
- La vraie boite suit, au tour de copie suivant (app/services/mail_sync.py) : le courriel est deplace dans son dossier
  « A jeter » (cree au besoin), remis dans la boite de reception si on le retire de la liste, efface apres 1 an.
- Apres 1 an : efface ici (fichier .eml compris) et dans la boite -- jamais un courriel qui sert de preuve (recu de
  carte, paiement propose par Zeko) ni un courriel relie a un ticket ou a une tache : ceux-la restent dans « A jeter ».
"""
from __future__ import annotations

import logging
import re
from datetime import timedelta
from pathlib import Path

from sqlalchemy import exists, func, or_, select

from app.core import mail_store

log = logging.getLogger("mail_junk")

FOLDER = "À jeter"
KEEP_DAYS = 365
_ADDR = re.compile(r"^[^@\s]+@[a-z0-9-]+(\.[a-z0-9-]+)+$")
_DOMAIN = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")


def normalize(pattern: str | None) -> str:
    """« @Google.com » -> « google.com » ; ValueError si ce n'est ni une adresse ni un domaine."""
    p = (pattern or "").strip().lower().lstrip("@")
    if not (_ADDR.match(p) or _DOMAIN.match(p)):
        raise ValueError("Une adresse courriel (nom@exemple.com) ou un domaine (exemple.com)")
    return p


def match(addr: str | None, patterns) -> str | None:
    """Element de la liste qui vise cette adresse, ou None."""
    a = (addr or "").strip().lower()
    if "@" not in a:
        return None
    dom = a.rsplit("@", 1)[1]
    for p in patterns:
        if a == p if "@" in p else (dom == p or dom.endswith("." + p)):
            return p
    return None


async def patterns(db) -> list[str]:
    from app.models.mailbox import MailBlock
    return list((await db.execute(select(MailBlock.pattern))).scalars().all())


def _sender_cond(p: str):
    from app.models.mailbox import MailMessage
    f = func.lower(func.coalesce(MailMessage.from_email, ""))
    if "@" in p:
        return f == p
    return or_(f.like(f"%@{p}"), f.like(f"%.{p}"))


async def block(db, p: str) -> int:
    """Courriels deja recus de cet expediteur -> « A jeter » ; la boite suivra. Retour : combien."""
    from app.models.mailbox import MailMessage
    rows = (await db.execute(select(MailMessage).where(MailMessage.direction == "in", MailMessage.junk_at.is_(None),
                                                       _sender_cond(p)))).scalars().all()
    now = mail_store.now()
    for m in rows:
        put_in_junk(m, now)
    return len(rows)


def put_in_junk(m, now=None) -> None:
    m.junk_at = now or mail_store.now()
    m.junk_server = "move" if m.uid is not None else None
    m.junk_error = None
    if m.zeko_classify == "pending":          # Zeko ne lit pas un courriel a jeter
        m.zeko_classify = None
    if m.zeko_rdv == "pending":
        m.zeko_rdv = None


async def unblock(db, p: str, remaining: list[str]) -> int:
    """Retire de la liste : ses courriels reviennent (sauf ceux encore vises par un autre element). Retour : combien."""
    from app.models.mailbox import MailMessage
    rows = (await db.execute(select(MailMessage).where(MailMessage.junk_at.is_not(None), _sender_cond(p)))).scalars().all()
    n = 0
    for m in rows:
        if match(m.from_email, remaining):
            continue
        m.junk_at, m.junk_error = None, None
        m.junk_server = "restore" if m.junk_server == "done" else None
        n += 1
    return n


# ── La vraie boite (IMAP, bloquant : appele dans un fil a part) ─────────────────────────────────────────────────────

def _utf7(name: str) -> str:
    """Nom de dossier IMAP (UTF-7 modifie, RFC 3501) : « À jeter » -> « &AMA- jeter »."""
    import base64
    out, buf = [], []

    def flush():
        if buf:
            b = base64.b64encode("".join(buf).encode("utf-16-be")).decode().rstrip("=").replace("/", ",")
            out.append(f"&{b}-")
            buf.clear()
    for ch in name:
        if 0x20 <= ord(ch) <= 0x7E:
            flush()
            out.append("&-" if ch == "&" else ch)
        else:
            buf.append(ch)
    flush()
    return "".join(out)


def _q(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _junk_folder(conn) -> str:
    """« A jeter » de cette boite, cree s'il n'existe pas ; sous INBOX quand les autres dossiers y sont (Dovecot)."""
    typ, data = conn.list()
    names, delim = [], "."
    for line in data or []:
        if not line:
            continue
        m = re.match(rb'\((?P<f>[^)]*)\) (?:"(?P<d>[^"]*)"|NIL) (?P<n>.+)$', line if isinstance(line, bytes) else line[0])
        if m:
            delim = (m.group("d") or b".").decode() or delim
            names.append(m.group("n").decode().strip('"'))
    enc = _utf7(FOLDER)
    under_inbox = any(n.upper().startswith("INBOX" + delim) for n in names)
    target = f"INBOX{delim}{enc}" if under_inbox else enc
    if target not in names:
        typ, d = conn.create(_q(target))
        if typ != "OK":
            raise RuntimeError(f"Dossier « {FOLDER} » impossible à créer : {d}")
        conn.subscribe(_q(target))
    return target


def _copyuid(conn) -> int | None:
    typ, d = conn.response("COPYUID")
    for v in d or []:
        if v:
            parts = (v if isinstance(v, bytes) else str(v).encode()).split()
            if len(parts) >= 3 and parts[2].isdigit():
                return int(parts[2])
    return None


def _find(conn, message_id: str | None, uid: int | None) -> int | None:
    """Numero du courriel dans le dossier ouvert : par son Message-ID d'abord (sur meme si la boite renumerote)."""
    if message_id:
        typ, d = conn.uid("SEARCH", None, "HEADER", "Message-ID", _q(message_id))
        found = [int(x) for x in (d[0] or b"").split()] if typ == "OK" and d else []
        if found:
            return found[0]
    if uid:
        typ, d = conn.uid("SEARCH", None, "UID", str(uid))
        if typ == "OK" and d and d[0] and int(d[0].split()[0]) == uid:
            return uid
    return None


def server_sync(box: dict, moves: list, restores: list, purges: list) -> dict:
    """moves : [(id, uid boite de reception)] ; restores : [(id, junk_uid, message_id)] ;
    purges : [(id, junk_server, junk_uid, uid, message_id)].
    Retour : {"moved": {id: junk_uid|None}, "restored": {id: uid|None}, "purged": [id], "errors": {id: texte}}."""
    out = {"moved": {}, "restored": {}, "purged": [], "errors": {}}
    conn = mail_store._connect(box)
    try:
        folder = _junk_folder(conn)
        if moves:
            conn.select("INBOX")
            for mid, uid in moves:
                try:
                    if _find(conn, None, uid) is None:          # deja deplace ou efface dans la boite
                        out["moved"][mid] = None
                        continue
                    conn.response("COPYUID")
                    typ, d = conn.uid("MOVE", str(uid), _q(folder))
                    if typ != "OK":
                        raise RuntimeError(str(d)[:300])
                    out["moved"][mid] = _copyuid(conn)
                except Exception as exc:
                    out["errors"][mid] = str(exc)[:300]
        if restores or any(js == "done" for _, js, _, _, _ in purges):
            conn.select(_q(folder))
            for mid, juid, msgid in restores:
                try:
                    u = _find(conn, msgid, juid)
                    if u is None:                                # deja sorti ou jete dans la boite
                        out["restored"][mid] = None
                        continue
                    conn.response("COPYUID")
                    typ, d = conn.uid("MOVE", str(u), "INBOX")
                    if typ != "OK":
                        raise RuntimeError(str(d)[:300])
                    out["restored"][mid] = _copyuid(conn)
                except Exception as exc:
                    out["errors"][mid] = str(exc)[:300]
            for mid, js, juid, uid, msgid in purges:
                if js != "done":
                    continue
                try:
                    u = _find(conn, msgid, juid)
                    if u is not None:
                        conn.uid("STORE", str(u), "+FLAGS", "(\\Deleted)")
                        conn.uid("EXPUNGE", str(u))
                    out["purged"].append(mid)
                except Exception as exc:
                    out["errors"][mid] = str(exc)[:300]
        if any(js != "done" for _, js, _, _, _ in purges):    # jamais deplace (echec) : encore dans la boite de reception
            conn.select("INBOX")
            for mid, js, juid, uid, msgid in purges:
                if js == "done":
                    continue
                try:
                    u = _find(conn, None, uid) if uid else None   # par son numero seulement : jamais un autre courriel
                    if u is not None:
                        conn.uid("STORE", str(u), "+FLAGS", "(\\Deleted)")
                        conn.uid("EXPUNGE", str(u))
                    out["purged"].append(mid)
                except Exception as exc:
                    out["errors"][mid] = str(exc)[:300]
        return out
    finally:
        try:
            conn.logout()
        except Exception:
            pass


# ── Un tour pour une boite (appele par la copie des courriels, sous son verrou) ─────────────────────────────────────

def _protected():
    """Courriels a ne jamais effacer : preuve d'un paiement, ou relies a un ticket / une tache."""
    from app.models.bank_account import CardReceipt
    from app.models.mailbox import MailMessage
    from app.models.zeko import ZekoProposal
    return or_(MailMessage.ticket_id.is_not(None), MailMessage.task_id.is_not(None),
               exists().where(CardReceipt.mail_message_id == MailMessage.id),
               exists().where(ZekoProposal.mail_message_id == MailMessage.id))


async def run_for_box(db, mb, box: dict) -> None:
    """Met la vraie boite a jour (deplacer, remettre, effacer apres 1 an) ; ne fait rien s'il n'y a rien a faire."""
    import asyncio
    from app.models.mailbox import MailMessage
    same = (MailMessage.mailbox_id == mb.id, MailMessage.uidvalidity == mb.uidvalidity)
    mv = (await db.execute(select(MailMessage).where(*same, MailMessage.junk_server == "move").limit(200))).scalars().all()
    rs = (await db.execute(select(MailMessage).where(*same, MailMessage.junk_server == "restore").limit(200))).scalars().all()
    old = mail_store.now() - timedelta(days=KEEP_DAYS)
    pg = (await db.execute(select(MailMessage).where(MailMessage.mailbox_id == mb.id, MailMessage.junk_at < old,
                                                     ~_protected()).limit(200))).scalars().all()
    if not (mv or rs or pg):
        return
    res = await asyncio.to_thread(server_sync, box, [(m.id, m.uid) for m in mv],
                                  [(m.id, m.junk_uid, m.message_id) for m in rs],
                                  [(m.id, m.junk_server, m.junk_uid, m.uid if m.uidvalidity == mb.uidvalidity else None,
                                    m.message_id) for m in pg])
    errs = res["errors"]
    for m in mv:
        if m.id in errs:
            m.junk_error = errs[m.id]                  # on reessaiera au prochain tour
        elif m.id in res["moved"]:
            m.junk_server, m.junk_uid, m.junk_error = "done", res["moved"][m.id], None
    for m in rs:
        if m.id in errs:
            m.junk_error = errs[m.id]                  # on reessaiera au prochain tour
        elif m.id in res["restored"]:
            new = res["restored"][m.id]
            if new is not None:                        # nouveau numero dans la boite de reception : jamais recopie en double
                m.uid = new
            m.junk_server, m.junk_uid, m.junk_error = None, None, None
    purged = set(res["purged"])
    for m in pg:
        if m.id in errs:
            m.junk_error = errs[m.id]
        elif m.id in purged:
            try:
                Path(m.stored_path).unlink(missing_ok=True)
            except OSError as exc:
                log.warning("Fichier %s pas efface : %s", m.stored_path, exc)
            await db.delete(m)
    if errs:
        log.warning("%s : « %s » -- %d courriel(s) en erreur", mb.email, FOLDER, len(errs))
