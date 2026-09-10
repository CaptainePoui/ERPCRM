#!/usr/bin/env python3
"""Liste exhaustive de tous les noeuds Entity (group_id=platform), triee par
nom -- pour construire une checklist de passe en profondeur (dependances),
pas une recherche semantique (search_nodes ne garantit pas l'exhaustivite).
Lecture seule, ne modifie rien.

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/list_all_nodes.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    async with client.driver.session() as session:
        result = await session.run(
            """
            MATCH (n:Entity {group_id: 'platform'})
            OPTIONAL MATCH (n)-[r]-()
            RETURN n.name AS name, n.summary AS summary, count(r) AS degree
            ORDER BY n.name
            """
        )
        rows = [rec async for rec in result]
        print(f'{len(rows)} noeud(s) au total (group_id=platform)')
        for rec in rows:
            summary = (rec['summary'] or '').strip().replace('\n', ' ')
            print(f"{rec['name']} | degre={rec['degree']} | {summary[:100]}")

    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
