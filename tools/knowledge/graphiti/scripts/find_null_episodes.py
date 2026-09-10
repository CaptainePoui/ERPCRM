#!/usr/bin/env python3
"""Diagnostic : trouve toute relation (arete) du graphe dont la propriete
`episodes` est NULL au lieu d'une liste -- ce qui casse la desserialisation
Pydantic de EntityEdge et fait echouer TOUT appel a search_memory_facts
(TASK-040.10, constate 2026-09-10). Lecture seule, ne modifie rien.

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/find_null_episodes.py
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
            MATCH (s)-[r]->(t)
            WHERE r.group_id = 'platform' AND r.episodes IS NULL
            RETURN r.uuid AS uuid, type(r) AS rtype, r.fact AS fact,
                   r.created_at AS created_at, r.name AS name,
                   s.name AS src_name, t.name AS tgt_name
            """
        )
        rows = [rec async for rec in result]
        print(f'{len(rows)} arete(s) avec episodes IS NULL (group_id=platform)')
        for rec in rows:
            print('---')
            print('uuid       :', rec['uuid'])
            print('type       :', rec['rtype'], '/ name:', rec['name'])
            print('source     :', rec['src_name'])
            print('target     :', rec['tgt_name'])
            print('fact       :', rec['fact'])
            print('created_at :', rec['created_at'])

        # Meme diagnostic sans filtre group_id, au cas ou l'arete fautive
        # serait sur un autre group_id (erpcrm/sipv legacy) ou n'en a pas.
        result_all = await session.run(
            """
            MATCH (s)-[r]->(t)
            WHERE r.episodes IS NULL
            RETURN count(r) AS n
            """
        )
        rec_all = await result_all.single()
        print(f"\nTotal tous group_id confondus : {rec_all['n']}")

    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
