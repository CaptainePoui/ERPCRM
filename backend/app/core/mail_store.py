"""Copie des courriels recus dans ERPCRM (TASK-047.2, 2026-10-09).

La boite reste la source : chaque courriel est garde tel quel (.eml, storage/mail/<boite>/), ses pieces jointes sont
lues dans ce fichier au besoin. Lu/non lu suit dans les deux sens : ouvrir un courriel ici le marque lu dans la boite
(Outlook et cellulaire suivent), et ce qui est lu ailleurs devient lu ici. Rien n'est efface ni deplace, sauf « A jeter »
(expediteur en liste noire, TASK-047.7 : core/mail_junk.py).
Les autres dossiers (Envoyes, Archive, dossiers crees a la main) sont copies aussi, en lecture seule (TASK-047.8).
"""
from __future__ import annotations

import base64
import email
import email.header
import email.policy
import email.utils
import html as htmlmod
import imaplib
import re
import ssl
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

STORE_DIR = Path(__file__).resolve().parents[2] / "storage" / "mail"
DEFAULT_DAYS = 90            # premiere copie d'une boite : 90 derniers jours (modifiable dans la boite)
BATCH = 200                  # courriels copies par tour, les plus anciens d'abord
_INLINE_MAX = 2_000_000      # image integree (cid:) gardee dans le HTML si elle fait moins de 2 Mo


def decode(value) -> str:
    out = []
    for b, enc in email.header.decode_header(str(value or "")):
        if isinstance(b, bytes):
            try:
                out.append(b.decode(enc or "utf-8", errors="replace"))
            except LookupError:
                out.append(b.decode("utf-8", errors="replace"))
        else:
            out.append(b)
    return re.sub(r"\s+", " ", "".join(out)).strip()


def _addresses(msg, header: str) -> str:
    vals = msg.get_all(header) or []
    return ", ".join(f"{decode(n)} <{a}>" if n else a for n, a in email.utils.getaddresses([decode(v) for v in vals]) if a)[:5000]


def _payload_text(part) -> str:
    raw = part.get_payload(decode=True) or b""
    try:
        return raw.decode(part.get_content_charset() or "utf-8", errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


def html_to_text(h: str) -> str:
    h = re.sub(r"(?is)<(script|style|head).*?</\1>", " ", h)
    h = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>|</li>|</h\d>", "\n", h)
    t = htmlmod.unescape(re.sub(r"<[^>]+>", " ", h))
    return re.sub(r"\n[ \t]*\n[\s]*", "\n\n", re.sub(r"[ \t\xa0]+", " ", t)).strip()


def parse(raw: bytes) -> dict:
    """Ce qu'ERPCRM garde du courriel : en-tetes, texte, HTML (images integrees en data:), liste des pieces jointes."""
    msg = email.message_from_bytes(raw)
    plain, rich, attachments, inline = "", "", [], {}
    for i, part in enumerate(msg.walk()):
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        disp = (part.get("Content-Disposition") or "").lower()
        filename = decode(part.get_filename()) if part.get_filename() else None
        cid = (part.get("Content-ID") or "").strip("<> ")
        if ctype == "text/plain" and not filename and "attachment" not in disp and not plain:
            plain = _payload_text(part)
        elif ctype == "text/html" and not filename and "attachment" not in disp and not rich:
            rich = _payload_text(part)
        else:
            data = part.get_payload(decode=True) or b""
            if cid and ctype.startswith("image/") and "attachment" not in disp and len(data) <= _INLINE_MAX:
                inline[cid] = f"data:{ctype};base64,{base64.b64encode(data).decode()}"
                continue
            attachments.append({"i": i, "filename": filename or f"piece-{i}", "ctype": ctype, "size": len(data)})
    if rich and inline:
        rich = re.sub(r'(?i)src=(["\'])cid:([^"\']+)\1', lambda m: f'src="{inline.get(m.group(2), "")}"', rich)
    try:
        sent = email.utils.parsedate_to_datetime(msg.get("Date"))
        if sent and sent.tzinfo is None:
            sent = sent.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError, IndexError):
        sent = None
    name, addr = email.utils.parseaddr(decode(msg.get("From")))
    return {
        "message_id": (msg.get("Message-ID") or "").strip()[:500] or None,
        "in_reply_to": (msg.get("In-Reply-To") or "").strip()[:500] or None,
        "from_email": (addr or "").lower()[:255] or None,
        "from_name": (name or "")[:255] or None,
        "to_addrs": _addresses(msg, "To") or None,
        "cc_addrs": _addresses(msg, "Cc") or None,
        "subject": decode(msg.get("Subject"))[:1000] or None,
        "sent_at": sent,
        "body_text": (plain.strip() or html_to_text(rich))[:200_000] or None,
        "body_html": rich[:3_000_000] or None,
        "attachments": attachments,
    }


def attachment(path: str, index: int) -> tuple[str, str, bytes]:
    """(nom, type, octets) de la piece jointe numero index du courriel garde."""
    msg = email.message_from_bytes(Path(path).read_bytes())
    for i, part in enumerate(msg.walk()):
        if i == index and not part.is_multipart():
            return decode(part.get_filename()) or f"piece-{i}", part.get_content_type(), part.get_payload(decode=True) or b""
    raise KeyError(index)


def _connect(box: dict):
    conn = imaplib.IMAP4_SSL(box["host"], box["port"], timeout=60, ssl_context=ssl.create_default_context())
    conn.login(box["user"], box["password"])
    return conn


def _uids(conn, *criteria) -> list[int]:
    typ, data = conn.uid("SEARCH", None, *criteria)
    return sorted(int(x) for x in (data[0] or b"").split()) if typ == "OK" else []


def sync_sync(box: dict, known_uidvalidity: int | None, last_uid: int, since: date | None,
              push: dict[int, bool], known_uids: list[int]) -> dict:
    """Un tour de synchronisation d'une boite (bloquant, dans un fil a part).
    push : {uid: lu ?} changes faits dans ERPCRM a ecrire dans la boite.
    known_uids : courriels deja copies dont on relit lu/non lu.
    Retour : {uidvalidity, new: [(uid, raw, seen)], seen: {uid: bool}, more: bool}."""
    conn = _connect(box)
    try:
        typ, data = conn.select("INBOX")
        if typ != "OK":
            raise RuntimeError("Dossier de réception introuvable")
        uv = int(re.search(rb"\d+", conn.response("UIDVALIDITY")[1][0]).group(0))
        if uv != known_uidvalidity:              # la boite a ete renumerotee : on repart de la date de debut
            last_uid, push, known_uids = 0, {}, []
        for uid, seen in push.items():           # ERPCRM -> boite
            conn.uid("STORE", str(uid), "+FLAGS" if seen else "-FLAGS", "(\\Seen)")
        if last_uid:
            new = [u for u in _uids(conn, "UID", f"{last_uid + 1}:*") if u > last_uid]
        else:
            start = since or (date.today() - timedelta(days=DEFAULT_DAYS))
            new = _uids(conn, "SINCE", start.strftime("%d-%b-%Y"))
        have = set(known_uids)
        todo = [u for u in new if u not in have]          # deja copies (date de debut reculee) : pas retelecharges
        more = len(todo) > BATCH
        out = []
        for uid in todo[:BATCH]:
            typ, d = conn.uid("FETCH", str(uid), "(FLAGS BODY.PEEK[])")
            if typ != "OK" or not d or not isinstance(d[0], tuple):
                continue
            out.append((uid, d[0][1], b"\\Seen" in d[0][0]))
        seen = {}
        if known_uids:                           # boite -> ERPCRM (lu ailleurs, dans Outlook ou au cellulaire)
            lo = min(known_uids)
            typ, d = conn.uid("FETCH", f"{lo}:*", "(FLAGS)")
            for item in d or []:
                line = item[0] if isinstance(item, tuple) else item
                if not line:
                    continue
                m = re.search(rb"UID (\d+)", line)
                if m:
                    seen[int(m.group(1))] = b"\\Seen" in line
        last = max([last_uid] + [u for u, _, _ in out] + ([max(new)] if new and not more else []))
        return {"uidvalidity": uv, "new": out, "seen": seen, "more": more, "last_uid": last}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


# Dossiers jamais copies (TASK-047.8) : drapeaux IMAP « special-use », puis le nom (le serveur ne marque pas toujours
# ses dossiers : INBOX.Junk de mail.simpleip.tel n'a pas de drapeau). « A jeter » : core/mail_junk.py.
_SKIP_FLAGS = (b"\\Trash", b"\\Junk", b"\\Drafts", b"\\Noselect", b"\\NonExistent", b"\\All", b"\\Flagged")
_SKIP_NAMES = {"trash", "spam", "junk", "drafts", "deleted", "deleted items", "deleted messages", "junk e-mail", "junk email",
               "corbeille", "brouillons", "pourriel", "pourriels", "courrier indésirable", "indésirables", "éléments supprimés"}
_SENT_NAMES = {"sent", "sent items", "sent messages", "envoyés", "éléments envoyés", "messages envoyés"}


def _imap_name(line: bytes):
    """(drapeaux, separateur, nom) d'une ligne de LIST."""
    mt = re.match(rb'\((?P<flags>[^)]*)\) (?:"(?P<sep>[^"]*)"|NIL) (?P<name>.+)$', line)
    if not mt:
        return None
    name = mt.group("name").decode(errors="replace").strip()
    if name.startswith('"') and name.endswith('"'):
        name = name[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    return mt.group("flags"), (mt.group("sep") or b"").decode() if mt.group("sep") else "", name


def _utf7_decode(s: str) -> str:
    def dec(m):
        b64 = m.group(1).replace(",", "/")
        return base64.b64decode(b64 + "=" * (-len(b64) % 4)).decode("utf-16-be") if b64 else "&"
    return re.sub(r"&([^-]*)-", dec, s)


def _quote(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def list_folders(conn, skip: set[str]) -> list[tuple[str, bool]]:
    """[(nom IMAP, Envoyes ?)] des dossiers a copier : tout sauf la boite de reception, la Corbeille, les Indesirables,
    les Brouillons et skip (noms affiches en minuscules, ex. « à jeter »)."""
    typ, data = conn.list()
    out = []
    for line in data or []:
        if not isinstance(line, bytes):
            continue
        parsed = _imap_name(line)
        if not parsed:
            continue
        flags, sep, name = parsed
        last = _utf7_decode(name.rsplit(sep, 1)[-1] if sep else name).strip().lower()
        if name.upper() == "INBOX" or last in skip or any(f.lower() in flags.lower() for f in _SKIP_FLAGS) \
                or last in _SKIP_NAMES:
            continue
        out.append((name, b"\\Sent" in flags or last in _SENT_NAMES))
    return out


def folders_sync(box: dict, states: dict[str, tuple[int | None, int]], since: date | None, skip: set[str]) -> dict:
    """Un tour de copie des autres dossiers (bloquant, lecture seule : EXAMINE, BODY.PEEK).
    states : {nom: (uidvalidity connue, dernier numero copie)}.
    Retour : {"folders": {nom: {"sent", "uidvalidity", "last_uid", "new": [(uid, raw, seen)], "error"}}, "more": bool}."""
    conn = _connect(box)
    try:
        res, budget = {}, BATCH
        for name, sent in list_folders(conn, skip):
            f = res[name] = {"sent": sent, "uidvalidity": None, "last_uid": 0, "new": [], "error": None}
            try:
                typ, _ = conn.select(_quote(name), readonly=True)
                if typ != "OK":
                    raise RuntimeError(f"Dossier {_utf7_decode(name)} illisible")
                uv = int(re.search(rb"\d+", conn.response("UIDVALIDITY")[1][0]).group(0))
                known_uv, last_uid = states.get(name, (None, 0))
                if uv != known_uv:               # nouveau dossier, ou renumerote : on repart de la date de debut
                    last_uid = 0
                f["uidvalidity"], f["last_uid"] = uv, last_uid
                if last_uid:
                    todo = [u for u in _uids(conn, "UID", f"{last_uid + 1}:*") if u > last_uid]
                else:
                    start = since or (date.today() - timedelta(days=DEFAULT_DAYS))
                    todo = _uids(conn, "SINCE", start.strftime("%d-%b-%Y"))
                for uid in todo[:max(budget, 0)]:
                    typ, d = conn.uid("FETCH", str(uid), "(FLAGS BODY.PEEK[])")
                    if typ == "OK" and d and isinstance(d[0], tuple):
                        f["new"].append((uid, d[0][1], b"\\Seen" in d[0][0]))
                    f["last_uid"] = uid
                budget -= len(todo)
            except Exception as exc:
                f["error"] = str(exc)[:500]
        return {"folders": res, "more": budget < 0}
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def set_seen_sync(box: dict, uid: int, seen: bool) -> None:
    conn = _connect(box)
    try:
        conn.select("INBOX")
        conn.uid("STORE", str(uid), "+FLAGS" if seen else "-FLAGS", "(\\Seen)")
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def save_raw(mailbox_id, uidvalidity: int, uid: int, raw: bytes, folder_id=None) -> str:
    d = STORE_DIR / str(mailbox_id)
    d.mkdir(parents=True, exist_ok=True)
    p = d / (f"{folder_id}-{uidvalidity}-{uid}.eml" if folder_id else f"{uidvalidity}-{uid}.eml")
    p.write_bytes(raw)
    return str(p)


def now() -> datetime:
    return datetime.now(timezone.utc)
