#!/usr/bin/env python3
"""Corrige deux faits dont le texte etait deja incoherent avec leurs vrais
endpoints, decouverts en verifiant les fusions "Simple IP" et "SIPV"
(2026-09-01/02). Ne supprime rien : chaque fait garde son uuid, ses episodes
(provenance) et sa date -- seuls les endpoints (source/target) sont corriges
pour correspondre au texte du fait lui-meme.

1. "backend/app/core/sipv_client.py proxies calls to SIPV" (uuid 409f1778...)
   etait un self-loop sur le noeud "SIPV" (a3799c6a...). Le vrai noeud
   "sipv_client.py" existe deja (5000fdad...) et porte deja un fait quasi
   identique et correct (SENDS_REQUESTS_TO, uuid 3e1a6018...). Correction :
   source deplacee de "SIPV" vers "sipv_client.py" -- le fait devient
   sipv_client.py -> SIPV au lieu d'un self-loop sur SIPV.

2. "Nginx DEPENDS_ON Certbot" (uuid 6a3d01ae...) etait un self-loop sur le
   noeud "Simple IP inc." (aucun rapport avec Nginx ni Certbot). Le noeud
   "nginx" existe deja (4626e9cf..., cree le 2026-09-01 par un episode plus
   recent). Aucun noeud "Certbot" n'existe -- cree ici. Correction : source
   deplacee vers "nginx", target deplace vers le nouveau noeud "Certbot".

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/fix_mislabeled_facts.py
"""

import asyncio
import logging
import sys
import uuid as uuid_mod
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('fix_mislabeled_facts')

SIPV_UUID = 'a3799c6a-e715-4e5f-b2a4-e7943a984da7'
SIPV_CLIENT_UUID = '5000fdad-6ed6-4e4b-9837-7bf75549901f'
SELFLOOP_SIPV_EDGE = '409f1778-04b7-4647-b74d-7718bada39d2'

NGINX_UUID = '4626e9cf-794f-46a7-b602-e44da6b2e64a'
SIMPLEIP_UUID = 'c5e40e67-e7dc-4ccd-bae8-54de41b86aa1'
SELFLOOP_NGINX_EDGE = '6a3d01ae-7f1d-4ed1-a45d-5ed46be56f21'


async def fix_edge_endpoint(session, edge_uuid, *, new_source=None, new_target=None):
    result = await session.run(
        'MATCH ()-[r {uuid: $uuid}]->() RETURN r, startNode(r).uuid AS src, endNode(r).uuid AS tgt',
        uuid=edge_uuid,
    )
    rec = await result.single()
    if not rec:
        logger.info('Relation %s deja absente, rien a faire.', edge_uuid)
        return
    props = dict(rec['r'])
    rtype_result = await session.run(
        'MATCH ()-[r {uuid: $uuid}]->() RETURN type(r) AS rtype', uuid=edge_uuid
    )
    rtype = (await rtype_result.single())['rtype']

    src_uuid = new_source or rec['src']
    tgt_uuid = new_target or rec['tgt']

    await session.run(
        f'MATCH (s {{uuid: $src}}), (t {{uuid: $tgt}}) '
        f'CREATE (s)-[r2:{rtype}]->(t) SET r2 = $props',
        src=src_uuid, tgt=tgt_uuid, props=props,
    )
    await session.run('MATCH ()-[r {uuid: $uuid}]->() DELETE r', uuid=edge_uuid)
    logger.info(
        'Relation %s corrigee : %s -> %s (fact="%s").',
        edge_uuid, src_uuid, tgt_uuid, props.get('fact'),
    )


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    async with client.driver.session() as session:
        # 1. sipv_client.py proxies calls to SIPV -- source SIPV -> sipv_client.py
        await fix_edge_endpoint(session, SELFLOOP_SIPV_EDGE, new_source=SIPV_CLIENT_UUID)

        # 2. Nginx DEPENDS_ON Certbot -- creer le noeud Certbot, source -> nginx, target -> Certbot
        certbot_uuid = str(uuid_mod.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        await session.run(
            """
            CREATE (n:Entity:Organization {
                uuid: $uuid, name: 'Certbot', group_id: 'platform',
                created_at: datetime($now),
                summary: 'Nginx DEPENDS_ON Certbot',
                description: "Cree manuellement le 2026-09-02 pour corriger un fait mal ancre (Nginx DEPENDS_ON Certbot etait un self-loop sur Simple IP inc.). Certbot gere le renouvellement automatique des certificats Let's Encrypt pour portail.simpleip.tel (voir project_infrastructure)."
            })
            """,
            uuid=certbot_uuid, now=now,
        )
        logger.info('Noeud "Certbot" cree (%s).', certbot_uuid)
        await fix_edge_endpoint(
            session, SELFLOOP_NGINX_EDGE, new_source=NGINX_UUID, new_target=certbot_uuid,
        )

    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
