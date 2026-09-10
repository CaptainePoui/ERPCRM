"""Notifications Slack pour le backfill Graphiti.

Le webhook est lu depuis le fichier local `.slack_webhook_url` (jamais commite,
voir .gitignore) plutot qu'une variable d'environnement : ce script tourne via
`docker exec` dans un conteneur deja demarre, qui ne relit jamais .env apres son
demarrage -- une variable ajoutee a .env n'y serait visible qu'apres un restart
du conteneur. Le fichier, lui, est visible immediatement (meme bind mount
`./scripts:/app/mcp/scripts:ro` que ce script).

Silence entre 22h et 6h (heure de Montreal, DST gere via zoneinfo) : les
notifications sont mises en attente dans /tmp (cote conteneur -- ephemere,
perdu si le conteneur redemarre pendant la nuit, mais Neo4j reste la source de
verite du progres, seule la notif elle-meme serait manquee) et regroupees en un
seul message a la premiere occasion apres 6h. Ce n'est pas un envoi exact a
6h00 -- ca depend de la fin du prochain item traite, qui peut prendre plusieurs
heures.
"""

import json
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

_WEBHOOK_FILE = Path(__file__).parent / '.slack_webhook_url'
_PENDING_FILE = Path('/tmp/graphiti_backfill_slack_pending.jsonl')
_MONTREAL_TZ = ZoneInfo('America/Toronto')
_QUIET_START_HOUR = 22
_QUIET_END_HOUR = 6


def _webhook_url() -> str | None:
    if not _WEBHOOK_FILE.exists():
        return None
    url = _WEBHOOK_FILE.read_text(encoding='utf-8').strip()
    return url or None


def _is_quiet_hours(now: datetime) -> bool:
    h = now.hour
    return h >= _QUIET_START_HOUR or h < _QUIET_END_HOUR


def _post(text: str) -> None:
    url = _webhook_url()
    if not url:
        return
    body = json.dumps({'text': text}).encode('utf-8')
    req = urllib.request.Request(
        url, data=body, headers={'Content-type': 'application/json'}
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception:
        # Une notification ratee ne doit jamais faire echouer le backfill.
        pass


def _flush_pending() -> None:
    if not _PENDING_FILE.exists():
        return
    try:
        lines = _PENDING_FILE.read_text(encoding='utf-8').splitlines()
    finally:
        _PENDING_FILE.unlink(missing_ok=True)
    entries = [json.loads(l) for l in lines if l.strip()]
    if not entries:
        return
    header = f':crescent_moon: {len(entries)} notification(s) en attente depuis la nuit :'
    body = '\n'.join(f"- {e['text']}" for e in entries)
    _post(f'{header}\n{body}')


def notify(text: str) -> None:
    """Envoie immediatement, sauf entre 22h et 6h (heure de Montreal) ou la
    notification est mise en attente et regroupee au prochain reveil."""
    now = datetime.now(_MONTREAL_TZ)
    if _is_quiet_hours(now):
        with _PENDING_FILE.open('a', encoding='utf-8') as f:
            f.write(json.dumps({'text': text, 'at': now.isoformat()}) + '\n')
        return
    _flush_pending()
    _post(text)
