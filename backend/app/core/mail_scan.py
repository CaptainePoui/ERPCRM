"""Analyse des courriels (TASK-047.9) : virus et hameconnage par ClamAV (logiciel libre, service clamav-daemon sur ce
serveur, base mise a jour par clamav-freshclam), et liens compares a une liste publique de domaines d'hameconnage
(Phishing.Database, licence MIT, telechargee ici une fois par jour : aucun lien ne sort pour etre verifie ailleurs).

Un avertissement SEULEMENT si on trouve quelque chose (Philippe, 2026-11-01 : pas d'avertissement « expediteur inconnu »).
Toujours en lecture : on ne supprime ni ne deplace jamais un courriel."""
import asyncio
import logging
import re
import socket
import struct
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.mailbox import MailMessage

log = logging.getLogger("mail_scan")

CLAMD_SOCKET = "/var/run/clamav/clamd.ctl"
PHISHING_URL = "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt"
LIST_PATH = Path(__file__).resolve().parents[2] / "storage" / "securite" / "phishing-domains.txt"
_LIST_MAX_AGE = 24 * 3600
_POLL_INTERVAL = 60
_BATCH = 50
# Plateformes partagees inscrites telles quelles dans la liste : un lien vers elles n'est pas un danger en soi
_SHARED = {"sites.google.com"}
_LINK = re.compile(r"(?i)\b(?:https?://|www\.)([a-z0-9.-]+\.[a-z]{2,})")

_domains: set[str] = set()
_domains_mtime = 0.0


class ScanUnavailable(Exception):
    pass


def _clamd(data: bytes) -> str:
    """Reponse de clamd pour ces octets (« stream: OK » ou « stream: <signature> FOUND »)."""
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(300)
    try:
        s.connect(CLAMD_SOCKET)
        s.sendall(b"zINSTREAM\0")
        for i in range(0, len(data), 1 << 16):
            chunk = data[i:i + (1 << 16)]
            s.sendall(struct.pack("!L", len(chunk)) + chunk)
        s.sendall(struct.pack("!L", 0))
        out = b""
        while not out.endswith(b"\0"):
            b = s.recv(4096)
            if not b:
                break
            out += b
    except OSError as e:
        raise ScanUnavailable(f"antivirus injoignable ({e})") from e
    finally:
        s.close()
    return out.rstrip(b"\0").decode(errors="replace").strip()


def _load_domains() -> set[str]:
    global _domains, _domains_mtime
    try:
        mtime = LIST_PATH.stat().st_mtime
    except FileNotFoundError:
        return _domains
    if mtime != _domains_mtime:
        _domains = {d.strip().lower() for d in LIST_PATH.read_text(errors="ignore").split() if d.strip()} - _SHARED
        _domains_mtime = mtime
        log.info("Liste d'hameconnage : %d domaines", len(_domains))
    return _domains


async def refresh_list() -> None:
    """Telecharge la liste si elle a plus d'un jour (fichier remplace d'un coup, jamais a moitie ecrit)."""
    try:
        if time.time() - LIST_PATH.stat().st_mtime < _LIST_MAX_AGE:
            return
    except FileNotFoundError:
        pass
    LIST_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = LIST_PATH.with_suffix(".tmp")
    async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=15), follow_redirects=True) as c:
        r = await c.get(PHISHING_URL)
        r.raise_for_status()
    if r.text.count("\n") < 1000:             # liste vide ou page d'erreur : on garde l'ancienne
        raise ValueError(f"liste d'hameconnage suspecte ({r.text.count(chr(10))} lignes)")
    tmp.write_text(r.text)
    tmp.replace(LIST_PATH)


def bad_links(text: str) -> list[str]:
    """Domaines des liens du courriel qui sont dans la liste d'hameconnage."""
    bad = _load_domains()
    hosts = {h.lower().rstrip(".") for h in _LINK.findall(text or "")}
    return sorted(h for h in hosts if h in bad or h.removeprefix("www.") in bad)


async def scan_message(m: MailMessage) -> tuple[str, str | None]:
    """(« propre », « danger » ou « partiel », detail). Leve ScanUnavailable si l'antivirus ne repond pas."""
    found = []
    data = await asyncio.to_thread(Path(m.stored_path).read_bytes)
    res = await asyncio.to_thread(_clamd, data)
    if res.endswith("FOUND"):
        sig = res.split(":", 1)[-1].removesuffix("FOUND").strip()
        found.append(("Hameçonnage" if "Phishing" in sig else "Virus") + f" détecté par l'antivirus ({sig})")
    links = bad_links(f"{m.body_html or ''} {m.body_text or ''}")
    if links:
        found.append("Lien vers un site d'hameçonnage connu : " + ", ".join(links[:5]))
    if found:
        return "danger", " ; ".join(found)[:500]
    if not res.endswith(" OK"):               # ex. trop gros pour l'antivirus : liens verifies, pieces jointes non
        return "partiel", f"Antivirus : {res.split(':', 1)[-1].strip()[:200]} (liens vérifiés seulement)"
    return "propre", None


async def scan_pending() -> int:
    """Analyse les courriels pas encore analyses (les plus recents d'abord). Retourne le nombre analyse."""
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(MailMessage).where(MailMessage.scan_status.is_(None))
                                 .order_by(MailMessage.sent_at.desc().nulls_last()).limit(_BATCH))).scalars().all()
        for m in rows:
            try:
                m.scan_status, m.scan_detail = await scan_message(m)
            except FileNotFoundError:
                m.scan_status, m.scan_detail = "propre", "fichier du courriel introuvable : rien à analyser"
            m.scanned_at = datetime.now(timezone.utc)
            if m.scan_status == "danger":
                log.warning("Courriel dangereux de %s (%s) : %s", m.from_email, m.subject, m.scan_detail)
        await db.commit()
        return len(rows)


async def run_mail_scan_poller():
    while True:
        try:
            await refresh_list()
        except Exception as e:                # noqa: BLE001 -- sans nouvelle liste, on garde l'ancienne
            log.warning("Liste d'hameconnage non mise a jour : %s", e)
        try:
            while await scan_pending() == _BATCH:
                pass
        except ScanUnavailable as e:
            log.warning("Analyse des courriels en attente : %s", e)
        except Exception:                     # noqa: BLE001
            log.exception("Analyse des courriels")
        await asyncio.sleep(_POLL_INTERVAL)
