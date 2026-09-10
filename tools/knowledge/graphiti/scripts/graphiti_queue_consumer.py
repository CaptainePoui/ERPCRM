#!/usr/bin/env python3
"""Consommateur unique de la file d'attente Graphiti -- cote HOTE (pas dans le
conteneur, le mount ./scripts est en lecture seule pour le conteneur).

Tourne via cron a la minute. Lit les nouvelles lignes de chaque fichier de
file d'attente (append-only, une ligne JSON = un episode a ajouter) :
- docs/platform/graphiti_queue.jsonl (ERPCRM, local)
- incoming/*.jsonl (pousses par SIPV/DashV16 via scp depuis leur propre cron)

Pour chaque nouvelle ligne, appelle add_one_episode.py A L'INTERIEUR du
conteneur via `docker exec -i` (c'est la que vit graphiti_core). Un seul
item a la fois, jamais en parallele -- si un item echoue, son offset n'avance
pas, il sera retente au prochain passage ; les items precedents dans le meme
fichier restent acquis (offset avance jusqu'a l'echec).

Verrou (.graphiti_write.lock) : ce script l'acquiert avant de traiter quoi
que ce soit, et le relache a la fin (meme en cas d'erreur). Si le verrou est
deja tenu par un autre processus (ex: backfill_platform_tasks.py lance
manuellement), CE PASSAGE NE FAIT RIEN -- reessaie la minute suivante. Un
verrou dont le PID enregistre n'est plus vivant est considere perime et
retire automatiquement (sauf verrous manuels sans PID, ex. celui pose pour
backfill_platform_tasks.py -- jamais retires automatiquement, il faut les
enlever a la main une fois le script protege termine).

Ne PAS lancer plus d'un cron de ce script en parallele sur la meme machine
(le verrou protege contre Graphiti, pas contre deux instances de CE script
qui liraient le meme offset en meme temps) -- une seule ligne crontab.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slack_notify import notify as slack_notify  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[4]
GRAPHITI_DIR = Path(__file__).resolve().parents[1]
LOCK_FILE = Path(__file__).resolve().parent / '.graphiti_write.lock'
STATE_FILE = Path(__file__).resolve().parent / '.graphiti_queue_state.json'
LOG_FILE = Path(__file__).resolve().parent / 'graphiti_queue_consumer.log'
CONTAINER = 'graphiti-graphiti-mcp-1'
ADD_ONE_SCRIPT = '/app/mcp/scripts/add_one_episode.py'

SOURCE_FILES = [
    REPO_ROOT / 'docs' / 'platform' / 'graphiti_queue.jsonl',
    *sorted((GRAPHITI_DIR / 'incoming').glob('*.jsonl')),
]


def log(msg: str) -> None:
    with LOG_FILE.open('a', encoding='utf-8') as f:
        f.write(msg.rstrip('\n') + '\n')


def _item_label(item: dict) -> str:
    if item.get('name'):
        return item['name']
    if 'fact' in item or item.get('type') == 'triplet':
        return f"{item.get('source', '?')} -[{item.get('edge_name', '?')}]-> {item.get('target', '?')}"
    return '?'


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # existe, appartient a un autre utilisateur -- vivant
    return True


def acquire_lock() -> bool:
    if LOCK_FILE.exists():
        content = LOCK_FILE.read_text(encoding='utf-8').strip()
        pid = None
        for line in content.splitlines():
            if line.startswith('PID:'):
                try:
                    pid = int(line.split(':', 1)[1])
                except ValueError:
                    pid = None
        if pid is None:
            log(f'Verrou deja tenu (manuel, sans PID) : {content!r} -- passage ignore.')
            return False
        if pid_alive(pid):
            log(f'Verrou deja tenu par PID {pid} (vivant) -- passage ignore.')
            return False
        log(f'Verrou perime (PID {pid} mort) -- retire automatiquement.')
        LOCK_FILE.unlink()

    LOCK_FILE.write_text(f'PID:{os.getpid()}\nreason:graphiti_queue_consumer.py\n', encoding='utf-8')
    return True


def release_lock() -> None:
    if LOCK_FILE.exists():
        content = LOCK_FILE.read_text(encoding='utf-8')
        if f'PID:{os.getpid()}' in content:
            LOCK_FILE.unlink()


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    return {'offsets': {}}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2), encoding='utf-8')


def add_episode_via_container(item: dict) -> tuple[bool, str]:
    payload = json.dumps(item, ensure_ascii=False)
    try:
        result = subprocess.run(
            ['docker', 'exec', '-i', CONTAINER, '/app/mcp/.venv/bin/python3', ADD_ONE_SCRIPT],
            input=payload, capture_output=True, text=True, timeout=3600,
        )
    except subprocess.TimeoutExpired:
        return False, 'timeout (3600s depasse)'
    if result.returncode == 0:
        return True, result.stdout.strip()
    return False, (result.stderr or result.stdout).strip()


def process_file(path: Path, state: dict) -> None:
    key = str(path)
    offset = state['offsets'].get(key, 0)
    if not path.exists():
        return
    with path.open('r', encoding='utf-8') as f:
        f.seek(offset)
        chunk = f.read()
    if not chunk:
        return
    last_newline = chunk.rfind('\n')
    if last_newline == -1:
        return
    complete_chunk = chunk[: last_newline + 1]
    cursor = offset

    for raw_line in complete_chunk.splitlines(keepends=True):
        line_bytes = len(raw_line.encode('utf-8'))
        stripped = raw_line.strip()
        if not stripped:
            cursor += line_bytes
            state['offsets'][key] = cursor
            continue
        try:
            item = json.loads(stripped)
        except json.JSONDecodeError as exc:
            log(f'{path.name}: ligne JSON invalide, ignoree et sautee -- {exc}')
            cursor += line_bytes
            state['offsets'][key] = cursor
            continue

        label = _item_label(item)
        log(f'{path.name}: traitement de "{label}"...')
        ok, detail = add_episode_via_container(item)
        if ok:
            cursor += line_bytes
            state['offsets'][key] = cursor
            save_state(state)
            log(f'{path.name}: OK -- "{label}"')
            slack_notify(f':white_check_mark: Graphiti -- {label}')
        else:
            log(f'{path.name}: ECHEC sur "{label}" -- {detail} -- retente au prochain passage, arret de ce fichier pour ce passage.')
            slack_notify(f':x: Graphiti ECHEC -- {label} -- {detail[:200]} (retente au prochain passage)')
            return


def main() -> None:
    if not acquire_lock():
        return
    try:
        state = load_state()
        for source in SOURCE_FILES:
            process_file(source, state)
        save_state(state)
    finally:
        release_lock()


if __name__ == '__main__':
    main()
