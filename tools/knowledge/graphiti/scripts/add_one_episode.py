#!/usr/bin/env python3
"""Ajoute UN episode a Graphiti, en appelant add_episode() directement (pas
add_memory du serveur MCP -- meme raison que backfill_platform_tasks.py :
la queue MCP est en memoire et perd tout ce qui est en attente si le
conteneur redemarre). Lit un objet JSON sur stdin :

{"name": "...", "episode_body": "...", "source_description": "...",
 "reference_time": "2026-09-02T12:00:00Z"}  (reference_time optionnel)

group_id force a "platform" quoi qu'il arrive (voir skill graphiti-knowledge --
jamais de group_id par projet). Concu pour etre appele par
graphiti_queue_consumer.py (cote hote) via `docker exec -i ... | ce script`,
un item a la fois.

Sortie : "OK" sur stdout et code 0 si succes, message d'erreur sur stderr et
code non-nul sinon (le consumer cote hote n'avance son offset que si code 0).
"""

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402
from graphiti_core.nodes import EpisodeType  # noqa: E402


async def run(item: dict) -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    reference_time = None
    if item.get('reference_time'):
        reference_time = datetime.fromisoformat(item['reference_time'].replace('Z', '+00:00'))

    await client.add_episode(
        name=item['name'],
        episode_body=item['episode_body'],
        source_description=item.get('source_description', ''),
        source=EpisodeType.text,
        reference_time=reference_time or datetime.now(timezone.utc),
        group_id='platform',
    )
    print('OK')
    return 0


if __name__ == '__main__':
    try:
        raw = sys.stdin.read()
        parsed = json.loads(raw)
    except Exception as exc:
        print(f'JSON invalide sur stdin : {exc}', file=sys.stderr)
        sys.exit(2)

    try:
        sys.exit(asyncio.run(run(parsed)))
    except Exception as exc:
        print(f'Echec add_episode : {exc}', file=sys.stderr)
        sys.exit(1)
