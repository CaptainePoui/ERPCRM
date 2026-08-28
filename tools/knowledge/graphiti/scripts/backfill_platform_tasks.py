#!/usr/bin/env python3
"""Reprend le backfill de PLATFORM_TASKS.md (section ERPCRM) et ERRORS_LESSONS.md
dans Graphiti, interrompu le 2026-08-27 23h27 (arret du conteneur en plein
traitement d'un episode).

Cause reelle de la perte : services/queue_service.py du serveur MCP met les
episodes en attente dans un asyncio.Queue EN MEMOIRE -- tout item en cours ou
encore en attente au moment d'un arret du conteneur est perdu, pas seulement
celui en cours de traitement. Ce script contourne cette queue : il appelle
graphiti_client.add_episode() directement, un item a la fois, et attend la fin
reelle de chacun avant de passer au suivant.

Resumable sans etat separe a maintenir : a chaque lancement, la liste des
items manquants est recalculee en comparant les docs a ce qui existe deja dans
Neo4j (source de verite). Si le script ou le conteneur meurt en cours de route,
le prochain lancement reprend exactement ou c'est reste -- au pire un seul item
a refaire, jamais plus.

Attention : ne pas appeler add_memory (session Claude Code / MCP) sur le meme
group_id pendant que ce script tourne -- deux ecritures concurrentes sur le
meme groupe pourraient creer des entites en double (le serveur MCP ne serialise
que ses propres appels entre eux, pas les ecritures d'un processus externe).

Execution (a l'interieur du conteneur graphiti-mcp, qui a la config/deps
deja validees) :
    docker exec graphiti-graphiti-mcp-1 python3 /app/mcp/scripts/backfill_platform_tasks.py
"""

import asyncio
import logging
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))

import graphiti_mcp_server as gms  # noqa: E402
from graphiti_core.nodes import EpisodeType  # noqa: E402

logging.basicConfig(
    level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('backfill_platform_tasks')

PLATFORM_TASKS_MD = Path('/app/mcp/platform_docs/PLATFORM_TASKS.md')
ERRORS_LESSONS_MD = Path('/app/mcp/platform_docs/ERRORS_LESSONS.md')
SIPV_SECTION_MARKER = '# PLATFORM_TASKS.md — Section SIPV'

TASK_HEADER_RE = re.compile(r'^(?:##|###) (TASK-\d+(?:\.\d+)?) (.+)$', re.MULTILINE)
ERROR_HEADER_RE = re.compile(r'^## (\d+)\. (.+)$', re.MULTILINE)


def _split_on_headers(text: str, header_re: re.Pattern) -> list[tuple[re.Match, str]]:
    """Coupe `text` en blocs qui commencent a chaque match de `header_re`."""
    matches = list(header_re.finditer(text))
    blocks = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].rstrip()
        body = re.sub(r'\n-{3,}\s*$', '', body).rstrip()
        blocks.append((m, body))
    return blocks


def parse_platform_tasks(text: str) -> list[dict]:
    """Un item par header TASK-XXX / TASK-XXX.Y de la section ERPCRM uniquement
    (la section SIPV, TASK-SXXX, n'a jamais fait partie de ce backfill -- voir
    les episodes deja ingeres, tous project=erpcrm)."""
    sipv_pos = text.find(SIPV_SECTION_MARKER)
    erpcrm_text = text[:sipv_pos] if sipv_pos != -1 else text

    items = []
    for m, body in _split_on_headers(erpcrm_text, TASK_HEADER_RE):
        task_id = m.group(1)
        items.append(
            {
                'id': task_id,
                'name': f'{task_id} {m.group(2)}'.strip(),
                'content': body,
                'source_description': (
                    'project=erpcrm; scope=task; source_type=platform_tasks_md; '
                    f'source_file=docs/platform/PLATFORM_TASKS.md; task_id={task_id}'
                ),
            }
        )
    return items


def parse_errors_lessons(text: str) -> list[dict]:
    items = []
    for m, body in _split_on_headers(text, ERROR_HEADER_RE):
        error_id = m.group(1)
        items.append(
            {
                'id': error_id,
                'name': f'ERRORS_LESSONS.md — {error_id}. {m.group(2)}'.strip(),
                'content': body,
                'source_description': (
                    'project=platform; scope=error_lesson; source_type=errors_lessons_md; '
                    f'source_file=docs/platform/ERRORS_LESSONS.md; error_id={error_id}'
                ),
            }
        )
    return items


async def existing_ids(driver, source_type: str, id_key: str) -> set[str]:
    """Identifiants deja ingeres pour ce source_type, lus directement dans Neo4j."""
    ids: set[str] = set()
    async with driver.session() as session:
        result = await session.run(
            'MATCH (e:Episodic) WHERE e.source_description CONTAINS $marker '
            'RETURN e.source_description AS desc',
            marker=f'source_type={source_type}',
        )
        async for record in result:
            match = re.search(rf'{id_key}=(\S+)', record['desc'] or '')
            if match:
                ids.add(match.group(1))
    return ids


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client
    entity_types = gms.graphiti_service.entity_types
    group_id = gms.config.graphiti.group_id

    task_items = parse_platform_tasks(PLATFORM_TASKS_MD.read_text(encoding='utf-8'))
    error_items = parse_errors_lessons(ERRORS_LESSONS_MD.read_text(encoding='utf-8'))

    done_tasks = await existing_ids(client.driver, 'platform_tasks_md', 'task_id')
    done_errors = await existing_ids(client.driver, 'errors_lessons_md', 'error_id')

    todo = [it for it in task_items if it['id'] not in done_tasks]
    todo += [it for it in error_items if it['id'] not in done_errors]

    logger.info(
        f'PLATFORM_TASKS.md (ERPCRM) : {len(task_items) - len(done_tasks)} manquants '
        f'sur {len(task_items)}. ERRORS_LESSONS.md : {len(error_items) - len(done_errors)} '
        f'manquants sur {len(error_items)}.'
    )

    if not todo:
        logger.info('Rien a faire -- backfill deja complet.')
        return 0

    failures = []
    for i, item in enumerate(todo, start=1):
        logger.info(f'[{i}/{len(todo)}] {item["name"]}')
        try:
            await client.add_episode(
                name=item['name'],
                episode_body=item['content'],
                source_description=item['source_description'],
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
            logger.info('  -> OK')
        except Exception:
            logger.exception(f'  -> ECHEC sur {item["id"]} (sera retente au prochain lancement)')
            failures.append(item['id'])

    if failures:
        logger.error(f'Termine avec {len(failures)} echec(s) : {failures}')
        return 1

    logger.info('Backfill termine sans erreur -- plus aucun item manquant.')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
