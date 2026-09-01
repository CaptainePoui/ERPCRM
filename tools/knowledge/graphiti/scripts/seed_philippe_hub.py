#!/usr/bin/env python3
"""Episode qui etablit Philippe (alias Captine) comme centre du graphe, avec
Simple IP (contenant ERPCRM et SIPV) et deux categories personnelles ouvertes
(Crypto, Musique) accrochees a Philippe.

2e version (2026-08-30) apres retrait de la 1re (voir remove_philippe_hub.py) :
le nom d'episode "Philippe -- centre du graphe de connaissance et hierarchie
des projets" avait ete juge pedant et faisait doublon avec l'entite Philippe
dans la recherche. Nom raccourci ici -- le tri par type/longueur de
KnowledgeGraphViewer (Entity avant Episodic, libelle court avant long) garde
de toute facon l'entite "Philippe" en tete d'une recherche, peu importe le nom
de cet episode.

Contenu resserre sur demande explicite : ERPCRM et SIPV sont dits CONTENUS
DANS Simple IP directement (pas via un "Serveur telephonique" intermediaire
comme la 1re version), pour que la relation d'appartenance soit sans ambiguite.

Idempotent : verifie qu'aucun episode source_type=philippe_hub n'existe deja.

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/seed_philippe_hub.py
"""

import asyncio
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402
from graphiti_core.nodes import EpisodeType  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('seed_philippe_hub')

SOURCE_DESCRIPTION = 'project=platform; scope=identity_hub; source_type=philippe_hub'

CONTENT = """Philippe (alias "Captine") est le fondateur de Simple IP.

Simple IP contient deux systemes : ERPCRM et SIPV.

En dehors de Simple IP, Philippe a deux autres categories de projets personnels, ouvertes a de futurs projets :

- Crypto : premier projet connu, DASHV16, pas encore construit.
- Musique : premier projet connu, composition avec Suno, paroles ecrites par Philippe avec ChatGPT/Gemini."""


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client
    entity_types = gms.graphiti_service.entity_types
    group_id = gms.config.graphiti.group_id

    async with client.driver.session() as session:
        result = await session.run(
            'MATCH (e:Episodic) WHERE e.source_description CONTAINS $marker '
            'RETURN count(e) AS n',
            marker='source_type=philippe_hub',
        )
        record = await result.single()
        if record and record['n'] > 0:
            logger.info('Episode hub deja present (%s), rien a faire.', record['n'])
            return 0

    logger.info('Ajout de l\'episode hub Philippe (v2, nom court)...')
    await client.add_episode(
        name='Structure des projets de Philippe',
        episode_body=CONTENT,
        source_description=SOURCE_DESCRIPTION,
        source=EpisodeType.text,
        group_id=group_id,
        reference_time=datetime.now(timezone.utc),
        entity_types=entity_types,
        edge_types=None,
        edge_type_map=None,
        excluded_entity_types=None,
        previous_episode_uuids=None,
        custom_extraction_instructions=None,
        update_communities=False,
        saga=None,
        saga_previous_episode_uuid=None,
        uuid=None,
    )
    logger.info('OK.')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
