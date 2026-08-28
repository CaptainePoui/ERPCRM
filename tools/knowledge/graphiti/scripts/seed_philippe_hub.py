#!/usr/bin/env python3
"""Episode "hub" unique qui etablit Philippe (alias Captine/Captaine) comme
centre du graphe de connaissance, avec les branches connues.

Sans ca, les episodes techniques (CLAUDE.md, PLATFORM_TASKS.md, ...) ne
mentionnent jamais "Philippe" dans leur texte -- Graphiti extrait ses entites
depuis le contenu de l'episode, donc sans mention explicite, aucun lien vers
un centre commun n'est cree (constate : "CLAUDE.md -- Fichiers de plan" reste
isole). Cet episode force la creation des entites Philippe/Simple IP/Crypto/
Musique et de leurs relations ; les episodes deja ingeres qui mentionnent
"ERPCRM"/"SIPV" se relient ensuite via la resolution d'entites de Graphiti
(meme nom = meme noeud), sans avoir a retoucher ce qui est deja ingere.

Idempotent : verifie qu'aucun episode source_type=philippe_hub n'existe deja
avant d'ecrire. A relancer si le texte du hub doit etre corrige/enrichi (ne
supprime pas l'ancien, il faudrait le faire manuellement dans Neo4j).

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

CONTENT = """Philippe (alias "Captine", aussi ecrit "Captaine") est le centre unique de ce graphe de connaissance -- toute information ajoutee ici, quel que soit le projet, appartient a Philippe. Il ne doit jamais etre fragmente par projet.

Philippe est le fondateur de Simple IP, son entreprise. Simple IP possede un Serveur telephonique Simple IP, qui se divise en deux plans complementaires : ERPCRM (le Control Plane) et SIPV (le Telephony Plane).

En dehors de Simple IP, Philippe a d'autres categories de projets personnels, chacune destinee a accueillir plusieurs projets a venir dans le futur :

- Crypto : projets personnels lies aux cryptomonnaies, distincts de Simple IP. Premier projet connu de cette categorie : DASHV16, pas encore construit, prevu sur une VM separee (192.168.1.101).
- Musique : projets personnels de composition musicale, distincts de Simple IP. Premier projet connu de cette categorie : un projet de composition utilisant Suno pour la musique, avec des paroles ecrites par Philippe avec l'aide de ChatGPT/Gemini.

Ces deux categories, Crypto et Musique, sont ouvertes : d'autres projets personnels de Philippe pourront s'y ajouter plus tard sans changer cette structure."""


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

    logger.info('Ajout de l\'episode hub Philippe...')
    await client.add_episode(
        name='Philippe — centre du graphe de connaissance et hierarchie des projets',
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
