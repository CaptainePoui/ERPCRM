#!/usr/bin/env python3
"""Liste EXHAUSTIVE (pas semantique) de toutes les relations touchant un
noeud donne, dans les deux sens -- pour la passe en profondeur
(docs/platform/graphiti_deep_pass.md), plus fiable que search_memory_facts
(proximite/BFS, pas garanti exhaustif) pour auditer un nOeud precis avant d'y
ajouter des faits. Lecture seule.

Connexion Neo4j DIRECTE (driver neo4j, pas graphiti_mcp_server.initialize_server())
-- volontaire : ce script n'a besoin ni du LLM ni de l'embedder ni du reranker
(BGE, ~2.3 Go charges a chaque appel) pour une simple lecture Cypher. Appele en
boucle (un par noeud de la passe en profondeur), le cout de rechargement
repete de ces modeles a chaque invocation a deja cause un kill pour memoire
basse (2026-09-10) -- corrige en passant par le driver neo4j nu, variables
d'environnement deja presentes dans le conteneur (NEO4J_URI/USER/PASSWORD/DATABASE).

Usage : docker exec -i graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 \
    /app/mcp/scripts/list_node_facts.py <<< 'NomDuNoeud'
"""

import asyncio
import os
import sys

sys.path.insert(0, '/app/mcp/.venv/lib/python3.11/site-packages')

from neo4j import AsyncGraphDatabase  # noqa: E402


async def run(name: str) -> int:
    uri = os.environ['NEO4J_URI']
    user = os.environ['NEO4J_USER']
    password = os.environ['NEO4J_PASSWORD']
    database = os.environ.get('NEO4J_DATABASE', 'neo4j')

    driver = AsyncGraphDatabase.driver(uri, auth=(user, password))
    try:
        async with driver.session(database=database) as session:
            result = await session.run(
                """
                MATCH (n:Entity {name: $name, group_id: 'platform'})-[r]-(m)
                RETURN type(r) AS rtype, r.name AS name, r.fact AS fact,
                       startNode(r).name AS src, endNode(r).name AS tgt,
                       r.created_at AS created_at
                ORDER BY r.created_at
                """,
                name=name,
            )
            rows = [rec async for rec in result]
            print(f'{len(rows)} relation(s) pour "{name}"')
            for rec in rows:
                print('---')
                print(f"{rec['src']} -[{rec['name']}]-> {rec['tgt']}")
                print(rec['fact'])
    finally:
        await driver.close()

    return 0


if __name__ == '__main__':
    name = sys.stdin.read().strip()
    if not name:
        print('Nom de noeud vide sur stdin', file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(run(name)))
