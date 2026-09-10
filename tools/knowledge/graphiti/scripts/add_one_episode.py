#!/usr/bin/env python3
"""Ajoute UN item a Graphiti (episode OU triplet), en appelant graphiti-core
directement (pas add_memory/add_triplet du serveur MCP -- meme raison que
backfill_platform_tasks.py : la queue MCP est en memoire et perd tout ce qui
est en attente si le conteneur redemarre). Lit un objet JSON sur stdin.

Deux formats acceptes, distingues par la presence de "fact" :

1) Episode (comportement d'origine, texte a extraire) :
   {"name": "...", "episode_body": "...", "source_description": "...",
    "reference_time": "2026-09-02T12:00:00Z"}  (reference_time optionnel)

2) Triplet (fait precis entre 2 entites nommees, sans extraction --
   methode retenue depuis TASK-040.9/040.5 pour construire le graphe de
   concepts ERPCRM/SIPV) :
   {"type": "triplet", "source": "Facturation", "edge_name": "RELATES_TO",
    "fact": "Facturation est liee a Ticket parce que... (voir TASK-021)",
    "target": "Ticket"}
   La reference TASK-XXX/ERRORS_LESSONS.md se met directement dans le texte
   de "fact" (pas de champ de provenance separe expose par add_triplet cote
   graphiti-core) -- voir skill graphiti-knowledge.

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
from uuid import uuid4

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402
from graphiti_core.edges import EntityEdge  # noqa: E402
from graphiti_core.nodes import EntityNode, EpisodeType  # noqa: E402


async def run_episode(item: dict) -> int:
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


async def run_triplet(item: dict) -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    now = datetime.now(timezone.utc)
    source_node = EntityNode(uuid=str(uuid4()), name=item['source'], group_id='platform', created_at=now)
    target_node = EntityNode(uuid=str(uuid4()), name=item['target'], group_id='platform', created_at=now)
    edge = EntityEdge(
        name=item.get('edge_name', 'RELATES_TO'),
        fact=item['fact'],
        group_id='platform',
        source_node_uuid=source_node.uuid,
        target_node_uuid=target_node.uuid,
        created_at=now,
    )
    await client.add_triplet(source_node, edge, target_node)
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
        if parsed.get('type') == 'triplet' or 'fact' in parsed:
            sys.exit(asyncio.run(run_triplet(parsed)))
        else:
            sys.exit(asyncio.run(run_episode(parsed)))
    except Exception as exc:
        print(f'Echec add_one_episode : {exc}', file=sys.stderr)
        sys.exit(1)
