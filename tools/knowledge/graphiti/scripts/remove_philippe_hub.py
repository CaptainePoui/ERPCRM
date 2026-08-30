#!/usr/bin/env python3
"""Retire l'episode hub "Philippe -- centre du graphe..." (nom juge pedant par
Philippe, redondant avec l'entite "Philippe" deja presente naturellement).

Utilise Graphiti.remove_episode(), pas un DELETE brut : ca retire les entites
qui n'existaient QUE par cet episode (ex: "Simple IP", "Crypto", "Musique",
"Serveur telephonique" -- crees uniquement pour l'occasion), mais garde intact
tout ce qui est aussi mentionne ailleurs (l'entite "Philippe" existait deja
avant ce hub, via ERRORS_LESSONS.md ; "ERPCRM"/"SIPV" sont mentionnes par
des dizaines d'episodes du backfill en cours).

Les branches Crypto/Musique seront reliees plus tard, une fois ERPCRM et SIPV
avances (demande explicite de Philippe, 2026-08-30) -- pas de nouvel episode
cree ici en remplacement.

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/remove_philippe_hub.py
"""

import asyncio
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('remove_philippe_hub')

HUB_EPISODE_UUID = 'd721c16a-8707-4c34-8e14-b45c917dfd00'


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    async with client.driver.session() as session:
        result = await session.run(
            'MATCH (e:Episodic {uuid: $uuid}) RETURN e.name AS name', uuid=HUB_EPISODE_UUID
        )
        record = await result.single()
        if not record:
            logger.info('Episode deja absent, rien a faire.')
            return 0
        logger.info('Retrait de : %s', record['name'])

    await client.remove_episode(HUB_EPISODE_UUID)
    logger.info('OK -- episode et entites orphelines retires, le reste (Philippe/ERPCRM/SIPV) conserve.')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
