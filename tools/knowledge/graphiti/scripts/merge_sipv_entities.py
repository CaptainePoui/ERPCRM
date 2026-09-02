#!/usr/bin/env python3
"""Fusionne les deux entites dupliquees "Module SIPV" et "SIPV" en un seul
noeud (demande de Philippe, 2026-09-01, meme traitement que
merge_simple_ip_entities.py pour "Simple IP").

Contexte : comme pour Simple IP, la resolution d'entites de Graphiti n'a
jamais reconnu que ces deux noeuds designaient le meme systeme SIPV -- l'un
("Module SIPV", cree le premier) porte l'architecture technique riche
(deploiement, stack FastAPI/React/ESL/FreeSWITCH, autonomie vs ERPCRM), l'autre
("SIPV", nom court, cree plus tard) porte les faits business/tickets
(TASK-015/018/022/023, DND, pickup group, webhook). Confirme comme le meme
systeme par des faits qui se recoupent directement entre les deux noeuds (ex:
le endpoint /esl/registrations/tenant/{id} apparait des deux cotes).

Noeud canonique retenu : "SIPV" (a3799c6a...) -- nom court, celui utilise
partout ailleurs (code, CLAUDE.md, docs). "Module SIPV" (0c0d554f...) est
fusionne dedans puis supprime.

Meme garantie de perte zero que pour Simple IP : toutes les relations du
doublon sont recreees a l'identique sur le canonique (memes proprietes :
uuid, name, fact, episodes, valid_at...) avant suppression de l'originale ;
le script s'arrete sans rien supprimer si une seule relation n'a pas ete
deplacee.

Cas particulier : DEUX relations existaient deja directement entre les deux
noeuds (SERVED_BY et MAKES_CALL_TO, memes deux faits qui decrivent la meme
chose sous deux angles). Elles deviennent des self-loops sur le noeud
canonique apres fusion -- conservees telles quelles, redondantes mais sans
perte. Le noeud "SIPV" avait deja un self-loop preexistant ("sipv_client.py
proxies calls to SIPV", artefact d'extraction ou sipv_client.py et SIPV ont
ete confondus) -- non touche, hors scope.

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/merge_sipv_entities.py
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
logger = logging.getLogger('merge_sipv_entities')

DUP_UUID = '0c0d554f-d97f-4df3-b171-cd12363d3b41'    # "Module SIPV"
CANON_UUID = 'a3799c6a-e715-4e5f-b2a4-e7943a984da7'  # "SIPV" -- survit


async def run() -> int:
    await gms.initialize_server()
    client = gms.graphiti_client

    async with client.driver.session() as session:
        dup_rec = await (await session.run(
            'MATCH (n:Entity {uuid: $uuid}) RETURN n', uuid=DUP_UUID
        )).single()
        canon_rec = await (await session.run(
            'MATCH (n:Entity {uuid: $uuid}) RETURN n', uuid=CANON_UUID
        )).single()
        if not dup_rec:
            logger.info('Noeud "Module SIPV" deja absent, rien a faire.')
            return 0
        if not canon_rec:
            logger.error('Noeud canonique "SIPV" introuvable, abandon.')
            return 1

        dup, canon = dict(dup_rec['n']), dict(canon_rec['n'])

        before_count = (await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=DUP_UUID
        )).single())['c']
        logger.info('Noeud "Module SIPV" : %d relations avant fusion.', before_count)

        # 1. Relations OUTGOING de DUP (sauf vers CANON) -> recreees sur CANON
        result = await session.run(
            'MATCH (dup:Entity {uuid: $dup})-[r]->(other) WHERE other.uuid <> $canon '
            'RETURN r, other.uuid AS other_uuid, type(r) AS rtype',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        rows = [rec async for rec in result]
        for rec in rows:
            props, rtype = dict(rec['r']), rec['rtype']
            await session.run(
                f'MATCH (canon:Entity {{uuid: $canon}}), (other {{uuid: $other}}) '
                f'CREATE (canon)-[r2:{rtype}]->(other) SET r2 = $props',
                canon=CANON_UUID, other=rec['other_uuid'], props=props,
            )
        for rec in rows:
            await session.run(
                'MATCH (dup:Entity {uuid: $dup})-[r {uuid: $ruuid}]->() DELETE r',
                dup=DUP_UUID, ruuid=dict(rec['r']).get('uuid'),
            )
        moved_out = len(rows)

        # 2. Relations INCOMING vers DUP (sauf depuis CANON) -> recreees sur CANON
        result = await session.run(
            'MATCH (other)-[r]->(dup:Entity {uuid: $dup}) WHERE other.uuid <> $canon '
            'RETURN r, other.uuid AS other_uuid, type(r) AS rtype',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        rows = [rec async for rec in result]
        for rec in rows:
            props, rtype = dict(rec['r']), rec['rtype']
            await session.run(
                f'MATCH (other {{uuid: $other}}), (canon:Entity {{uuid: $canon}}) '
                f'CREATE (other)-[r2:{rtype}]->(canon) SET r2 = $props',
                other=rec['other_uuid'], canon=CANON_UUID, props=props,
            )
        for rec in rows:
            await session.run(
                'MATCH ()-[r {uuid: $ruuid}]->(dup:Entity {uuid: $dup}) DELETE r',
                dup=DUP_UUID, ruuid=dict(rec['r']).get('uuid'),
            )
        moved_in = len(rows)

        # 3. Relations directes DUP<->CANON (dans les deux sens) -> self-loops sur CANON
        result = await session.run(
            'MATCH (dup:Entity {uuid: $dup})-[r]-(:Entity {uuid: $canon}) '
            'RETURN r, type(r) AS rtype',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        direct_rows = [rec async for rec in result]
        for rec in direct_rows:
            props, rtype = dict(rec['r']), rec['rtype']
            await session.run(
                f'MATCH (canon:Entity {{uuid: $canon}}) '
                f'CREATE (canon)-[r2:{rtype}]->(canon) SET r2 = $props',
                canon=CANON_UUID, props=props,
            )
            logger.warning(
                'Relation directe %s (%s) transformee en self-loop -- fact="%s".',
                dict(rec['r']).get('uuid'), rtype, dict(rec['r']).get('fact'),
            )
        for rec in direct_rows:
            await session.run(
                'MATCH (dup:Entity {uuid: $dup})-[r {uuid: $ruuid}]-(:Entity {uuid: $canon}) DELETE r',
                dup=DUP_UUID, canon=CANON_UUID, ruuid=dict(rec['r']).get('uuid'),
            )
        moved_direct = len(direct_rows)

        remaining = await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=DUP_UUID
        )).single()
        logger.info(
            'Deplacees : %s sortantes, %s entrantes, %s directes->self-loop. Relations restantes sur DUP : %s',
            moved_out, moved_in, moved_direct, remaining['c'],
        )

        # 4. Fusionner les proprietes du noeud
        merged_summary = '\n'.join(
            dict.fromkeys(
                (canon.get('summary', '') + '\n' + dup.get('summary', '')).split('\n')
            )
        ).strip()
        merged_description = (
            canon.get('description', '')
            + "\n\n[Fusionne depuis l'entite 'Module SIPV', 2026-09-02] "
            + dup.get('description', '')
        ).strip()
        merged_created_at = min(canon.get('created_at'), dup.get('created_at'))

        await session.run(
            """
            MATCH (canon:Entity {uuid: $canon})
            SET canon.summary = $summary,
                canon.description = $description,
                canon.created_at = $created_at
            """,
            canon=CANON_UUID, summary=merged_summary, description=merged_description,
            created_at=merged_created_at,
        )

        # 5. Supprimer DUP -- seulement s'il n'a plus aucune relation restante
        remaining_after = await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=DUP_UUID
        )).single()
        if remaining_after['c'] > 0:
            logger.error(
                'ABANDON : %d relations non deplacees restent sur "Module SIPV" -- '
                'noeud NON supprime pour ne rien perdre. Verifier manuellement.',
                remaining_after['c'],
            )
            return 1

        await session.run('MATCH (n:Entity {uuid: $uuid}) DELETE n', uuid=DUP_UUID)
        logger.info('OK -- "Module SIPV" fusionne dans "SIPV" (%s) et supprime.', CANON_UUID)

        after_count = (await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=CANON_UUID
        )).single())['c']
        logger.info('Noeud canonique : %d relations apres fusion.', after_count)

    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
