#!/usr/bin/env python3
"""Fusionne les deux entites dupliquees "Simple IP Platform" et "Simple IP inc."
en un seul noeud (demande explicite de Philippe, 2026-09-01 : "fait les 2 si on
perd rien").

Contexte : la resolution d'entites de Graphiti n'a jamais reconnu que ces deux
noeuds designaient la meme chose (noms trop differents), ce qui a laisse deux
noeuds "Simple IP" disjoints avec des faits differents (l'un porte la
description technique riche de l'architecture, l'autre porte les faits business
et le rattachement a Philippe/DASHV16/Musique du hub v2).

Approche (perte zero garantie par construction, pas par verification a
posteriori) : le noeud "Simple IP inc." (c5e40e67...) est conserve comme
canonique (plus recent, plus connecte, deja rattache a Philippe). Toutes les
relations qui touchaient "Simple IP Platform" (cdd6f0c6...) sont recreees a
l'identique (memes proprietes : uuid, name, fact, episodes, valid_at, etc.)
avec l'endpoint deplace vers le noeud canonique, puis l'ancienne relation est
supprimee et le noeud "Simple IP Platform" est supprime -- seulement une fois
qu'il n'a plus aucune relation.

Cas particulier : une relation existait DEJA directement entre les deux noeuds
(uuid 6a3d01ae..., fact "Nginx DEPENDS_ON Certbot" -- texte de fait deja
incoherent avec ses vrais endpoints, anomalie preexistante non liee a cette
fusion). Apres fusion des deux noeuds en un seul, cette relation devient une
boucle sur elle-meme (self-loop) sur le noeud canonique. Conservee telle
quelle (rien supprime), signalee separement a Philippe comme anomalie
preexistante a traiter plus tard si souhaite -- hors scope de cette fusion.

Proprietes de noeud fusionnees sans perte :
- summary : concatenation des deux (lignes dupliquees dedupliquees)
- description (dans attributes) : les deux textes concatenes, celui de
  "Simple IP Platform" clairement annote comme fusionne
- labels : union des deux (Entity/Organization/Object)
- created_at : le plus ancien des deux (exactitude temporelle)
- name_embedding : celui du noeud canonique conserve (pas de recalcul)

Execution : docker exec graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/merge_simple_ip_entities.py
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
logger = logging.getLogger('merge_simple_ip_entities')

DUP_UUID = 'cdd6f0c6-5c3e-41ff-9f00-96802742fc30'    # "Simple IP Platform"
CANON_UUID = 'c5e40e67-e7dc-4ccd-bae8-54de41b86aa1'  # "Simple IP inc." -- survit


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
            logger.info('Noeud "Simple IP Platform" deja absent, rien a faire.')
            return 0
        if not canon_rec:
            logger.error('Noeud canonique "Simple IP inc." introuvable, abandon.')
            return 1

        dup, canon = dict(dup_rec['n']), dict(canon_rec['n'])

        before_count = (await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=DUP_UUID
        )).single())['c']
        logger.info('Noeud "Simple IP Platform" : %d relations avant fusion.', before_count)

        # 1. Deplacer toutes les relations OUTGOING de DUP (sauf vers CANON lui-meme) vers CANON
        # (pas d'APOC installe sur cette instance -- recreation manuelle + suppression de l'originale)
        result = await session.run(
            'MATCH (dup:Entity {uuid: $dup})-[r]->(other) WHERE other.uuid <> $canon '
            'RETURN r, other.uuid AS other_uuid, type(r) AS rtype',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        rows = [rec async for rec in result]
        for rec in rows:
            props = dict(rec['r'])
            rtype = rec['rtype']
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

        # 2. Deplacer toutes les relations INCOMING vers DUP (sauf depuis CANON) vers CANON
        result = await session.run(
            'MATCH (other)-[r]->(dup:Entity {uuid: $dup}) WHERE other.uuid <> $canon '
            'RETURN r, other.uuid AS other_uuid, type(r) AS rtype',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        rows = [rec async for rec in result]
        for rec in rows:
            props = dict(rec['r'])
            rtype = rec['rtype']
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

        # 3. La ou les relations directes restantes entre DUP et CANON (exclues des deux boucles
        #    ci-dessus car leur "other" == canon) deviennent des self-loops sur CANON -- conservees
        #    telles quelles (rien supprime), signalees a Philippe comme anomalie preexistante
        #    (ex: fact "Nginx DEPENDS_ON Certbot" deja incoherent avec ses vrais endpoints).
        result = await session.run(
            'MATCH (dup:Entity {uuid: $dup})-[r]-(:Entity {uuid: $canon}) '
            'RETURN r, type(r) AS rtype, startNode(r).uuid AS src, endNode(r).uuid AS tgt',
            dup=DUP_UUID, canon=CANON_UUID,
        )
        direct_rows = [rec async for rec in result]
        for rec in direct_rows:
            props = dict(rec['r'])
            rtype = rec['rtype']
            await session.run(
                f'MATCH (canon:Entity {{uuid: $canon}}) '
                f'CREATE (canon)-[r2:{rtype}]->(canon) SET r2 = $props',
                canon=CANON_UUID, props=props,
            )
            logger.warning(
                'Relation directe %s (%s) transformee en self-loop sur le noeud canonique -- '
                'fact="%s" (anomalie preexistante, hors scope de cette fusion).',
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

        # 4. Fusionner les proprietes du noeud (summary/description/labels/created_at)
        merged_summary = '\n'.join(
            dict.fromkeys(
                (canon.get('summary', '') + '\n' + dup.get('summary', '')).split('\n')
            )
        ).strip()
        merged_description = (
            canon.get('description', '')
            + "\n\n[Fusionne depuis l'entite 'Simple IP Platform', 2026-09-01] "
            + dup.get('description', '')
        ).strip()
        merged_created_at = min(canon.get('created_at'), dup.get('created_at'))

        await session.run(
            """
            MATCH (canon:Entity {uuid: $canon})
            SET canon.summary = $summary,
                canon.description = $description,
                canon.created_at = $created_at
            WITH canon
            SET canon:Object
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
                'ABANDON : %d relations non deplacees restent sur "Simple IP Platform" -- '
                'noeud NON supprime pour ne rien perdre. Verifier manuellement.',
                remaining_after['c'],
            )
            return 1

        await session.run('MATCH (n:Entity {uuid: $uuid}) DELETE n', uuid=DUP_UUID)
        logger.info('OK -- "Simple IP Platform" fusionne dans "Simple IP inc." (%s) et supprime.', CANON_UUID)

        after_count = (await (await session.run(
            'MATCH (n:Entity {uuid: $uuid})-[r]-() RETURN count(r) AS c', uuid=CANON_UUID
        )).single())['c']
        logger.info('Noeud canonique : %d relations apres fusion (avant fusion il en avait deja plusieurs + %d recues).',
                     after_count, before_count)

    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
