#!/usr/bin/env python3
"""Ecriture directe et RAPIDE d'un fait dans Graphiti -- contourne le LLM local
pour la resolution/dedup (c'est Claude qui a deja verifie les noms existants
avant d'appeler ce script, pas besoin de refaire cette verification via LLM).
Seul l'embedder (nomic-embed-text, rapide -- secondes, pas le modele de chat
lent) est utilise, pour que search_nodes/search_memory_facts fonctionnent
normalement plus tard sur ces faits.

Lit un objet JSON sur stdin :
{"source": "Nom", "source_summary": "...", (optionnel, seulement si le noeud
 source est nouveau) "edge_name": "RELATES_TO", "fact": "...",
 "target": "Nom", "target_summary": "..." (optionnel, idem)}

Comportement : pour source ET target, cherche un noeud EXISTANT par nom exact
(group_id=platform) -- si trouve, reutilise son UUID (n'ecrase jamais son
summary existant). Si absent, cree un nouveau noeud avec le summary fourni
(ou vide si omis -- a eviter, toujours fournir un summary pour un nouveau
concept). Cree ensuite le fait (edge) entre les deux.

Usage : docker exec -i graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 \
    /app/mcp/scripts/fast_write.py <<< '{"source": "X", ...}'

Sortie : "OK" + code 0 si succes, erreur + code non-nul sinon.
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
from graphiti_core.nodes import EntityNode  # noqa: E402

GROUP_ID = 'platform'


async def _get_or_create_node(session, embedder, name: str, summary: str | None) -> EntityNode:
    result = await session.run(
        'MATCH (n:Entity {name: $name, group_id: $group_id}) RETURN n.uuid AS uuid, n.summary AS summary',
        name=name, group_id=GROUP_ID,
    )
    record = await result.single()
    now = datetime.now(timezone.utc)
    if record:
        node = EntityNode(uuid=record['uuid'], name=name, group_id=GROUP_ID, created_at=now,
                           summary=record['summary'] or '')
        return node, False
    node = EntityNode(uuid=str(uuid4()), name=name, group_id=GROUP_ID, created_at=now,
                       summary=summary or '')
    await node.generate_name_embedding(embedder)
    return node, True


async def run(item: dict) -> int:
    await gms.initialize_server()
    client = gms.graphiti_client
    embedder = client.embedder

    async with client.driver.session() as session:
        source_node, source_new = await _get_or_create_node(
            session, embedder, item['source'], item.get('source_summary'))
        target_node, target_new = await _get_or_create_node(
            session, embedder, item['target'], item.get('target_summary'))

        now = datetime.now(timezone.utc)
        edge = EntityEdge(
            uuid=str(uuid4()),
            name=item.get('edge_name', 'RELATES_TO'),
            fact=item['fact'],
            group_id=GROUP_ID,
            source_node_uuid=source_node.uuid,
            target_node_uuid=target_node.uuid,
            created_at=now,
            valid_at=now,
        )
        await edge.generate_embedding(embedder)

        # Ecriture directe : MERGE les noeuds par uuid (idempotent si deja
        # existant, ne touche pas leurs proprietes existantes autres que celles
        # fournies), CREATE le fait.
        for node, is_new in ((source_node, source_new), (target_node, target_new)):
            if is_new:
                await session.run(
                    'MERGE (n:Entity {uuid: $uuid}) '
                    'SET n.name = $name, n.group_id = $group_id, n.created_at = $created_at, '
                    'n.summary = $summary, n.name_embedding = $embedding',
                    uuid=node.uuid, name=node.name, group_id=node.group_id,
                    created_at=node.created_at.isoformat(), summary=node.summary,
                    embedding=node.name_embedding,
                )
        await session.run(
            'MATCH (a:Entity {uuid: $source_uuid}), (b:Entity {uuid: $target_uuid}) '
            'CREATE (a)-[r:RELATES_TO {uuid: $uuid, name: $name, fact: $fact, group_id: $group_id, '
            'created_at: $created_at, valid_at: $valid_at, fact_embedding: $embedding}]->(b)',
            source_uuid=edge.source_node_uuid, target_uuid=edge.target_node_uuid,
            uuid=edge.uuid, name=edge.name, fact=edge.fact, group_id=edge.group_id,
            created_at=edge.created_at.isoformat(), valid_at=edge.valid_at.isoformat(),
            embedding=edge.fact_embedding,
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
        print(f'Echec fast_write : {exc}', file=sys.stderr)
        sys.exit(1)
