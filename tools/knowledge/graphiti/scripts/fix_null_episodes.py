#!/usr/bin/env python3
"""Corrige TASK-040.10 (le bug qui casse la recherche de faits dans Graphiti,
search_memory_facts) : 34 relations avaient `episodes` a NULL au lieu d'une
liste vide, ce qui fait planter la desserialisation Pydantic de EntityEdge
pour TOUTE recherche de faits (pas seulement celles touchant ces relations).
Cause : `fast_write.py` (TASK-040.11) ne mettait jamais la propriete
`episodes` dans son CREATE Cypher -- corrige separement dans le meme lot.

Ce script se contente de mettre `episodes = []` (liste vide, honnete : ces
faits ont ete ecrits directement, sans episode source) sur les relations
concernees. Ne touche a rien d'autre (fact, source, target, embeddings
inchanges).

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/fix_null_episodes.py
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
        # Re-verification juste avant d'ecrire (compte doit etre 34, comme au diagnostic).
        before = await session.run(
            "MATCH ()-[r]->() WHERE r.episodes IS NULL RETURN count(r) AS n"
        )
        n_before = (await before.single())['n']
        print(f'Avant correctif : {n_before} arete(s) avec episodes IS NULL')
        if n_before == 0:
            print('Rien a faire.')
            return 0

        result = await session.run(
            "MATCH ()-[r]->() WHERE r.episodes IS NULL SET r.episodes = [] RETURN count(r) AS n"
        )
        n_fixed = (await result.single())['n']
        print(f'Corrige : {n_fixed} arete(s) -- episodes mis a [] (liste vide).')

        after = await session.run(
            "MATCH ()-[r]->() WHERE r.episodes IS NULL RETURN count(r) AS n"
        )
        n_after = (await after.single())['n']
        print(f'Apres correctif : {n_after} arete(s) restante(s) avec episodes IS NULL (doit etre 0).')

    return 0 if n_after == 0 else 1


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
