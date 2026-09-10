#!/usr/bin/env python3
"""Correctif ponctuel : ajoute la reference TASK-XXX de genese a la fin du
texte des faits 'ERPCRM CONTAINS <module>' -- simple ajout de texte sur une
propriete existante, pas de nouvel embedding necessaire (le texte du fait
change peu, la recherche reste utilisable ; regenerer l'embedding serait plus
correct mais cette correction est volontairement legere/rapide)."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))
from neo4j import AsyncGraphDatabase  # noqa: E402

GENESIS = {
    'Users': 'TASK-001',
    'Compagnies': 'TASK-002',
    'Contacts': 'TASK-003',
    'Catalogue': 'TASK-004',
    'Facturation': 'TASK-005',
    'Ticket': 'TASK-006',
    'Employes': 'TASK-007',
    'Commandes_fournisseurs': 'TASK-008',
    'Ecom': 'TASK-009',
    'Equipements': 'TASK-010',
    'Maintenance': 'TASK-011',
    'Telephonie': 'TASK-012',
    'Taches': 'TASK-015',
    'Portail': 'TASK-017',
    'Photos': 'TASK-024',
    'Devis': 'TASK-025',
    'Agenda': 'TASK-015, TASK-026',
    'Recurrence': 'TASK-021',
    'Succursales': 'TASK-023.29',
    'Rapports_CDR': 'TASK-032.2',
    'Backup': 'TASK-035',
    'Paiements': 'TASK-005',
}


async def run() -> int:
    driver = AsyncGraphDatabase.driver(
        os.environ['NEO4J_URI'], auth=(os.environ['NEO4J_USER'], os.environ['NEO4J_PASSWORD'])
    )
    updated = 0
    async with driver.session() as session:
        for name, task in GENESIS.items():
            result = await session.run(
                "MATCH (a:Entity {name:'ERPCRM'})-[r]->(b:Entity {name:$name}) "
                "WHERE r.fact CONTAINS 'contient le module' AND NOT r.fact CONTAINS 'TASK-' "
                "SET r.fact = r.fact + ' Genese : ' + $task + '.' "
                "RETURN r.uuid",
                name=name, task=task,
            )
            record = await result.single()
            if record:
                updated += 1
            else:
                print(f'PAS TROUVE ou deja fait : {name}', file=sys.stderr)
    await driver.close()
    print(f'{updated}/{len(GENESIS)} faits mis a jour')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
