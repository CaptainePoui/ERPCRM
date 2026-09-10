#!/usr/bin/env python3
"""Correctif ponctuel : les noeuds crees via add_triplet (voir add_one_episode.py,
mode triplet) n'avaient jamais de `summary` rempli -- EntityNode() n'en recevait
aucun a la construction. Ce script ecrit directement le summary de chaque noeud
via une simple mise a jour de propriete Neo4j (pas de passage par le LLM, pas de
resolution/dedup -- juste un SET sur des noeuds deja resolus par leur nom exact).

Usage (dans le conteneur, qui a le driver neo4j) :
    docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 \
        /app/mcp/scripts/backfill_summaries.py
"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

from neo4j import AsyncGraphDatabase  # noqa: E402

SUMMARIES = json.loads(Path('/app/mcp/scripts/_summaries_data.json').read_text(encoding='utf-8'))


async def run() -> int:
    uri = os.environ['NEO4J_URI']
    user = os.environ['NEO4J_USER']
    password = os.environ['NEO4J_PASSWORD']
    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    updated = 0
    async with driver.session() as session:
        for name, summary in SUMMARIES.items():
            result = await session.run(
                'MATCH (n:Entity {name: $name}) WHERE n.summary IS NULL OR n.summary = "" '
                'SET n.summary = $summary RETURN n.name',
                name=name, summary=summary,
            )
            record = await result.single()
            if record:
                updated += 1
            else:
                print(f'PAS TROUVE ou deja rempli : {name}', file=sys.stderr)
    await driver.close()
    print(f'{updated}/{len(SUMMARIES)} noeuds mis a jour')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
