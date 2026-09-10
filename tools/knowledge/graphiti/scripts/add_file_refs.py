#!/usr/bin/env python3
"""Ajoute le chemin du fichier modele source a la fin des faits qui n'ont pas
de reference TASK-XXX (faits trouves en lisant directement le code, pas une
entree PLATFORM_TASKS.md -- le fichier EST leur vraie provenance). Match par
noeud SOURCE de la relation (le champ FK vit presque toujours sur le modele
du noeud source)."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path('/app/mcp/src')))
from neo4j import AsyncGraphDatabase  # noqa: E402

ERPCRM_BASE = 'backend/app/models/'
SIPV_BASE = '/home/sipv/sipv/backend/app/models/'

FILES = {
    # ERPCRM
    'Compagnies': ERPCRM_BASE + 'company.py',
    'Contacts': ERPCRM_BASE + 'contact.py',
    'Ticket': ERPCRM_BASE + 'ticket.py',
    'Facturation': ERPCRM_BASE + 'invoice.py',
    'Catalogue': ERPCRM_BASE + 'catalogue.py',
    'Taches': ERPCRM_BASE + 'task.py',
    'Devis': ERPCRM_BASE + 'devis.py',
    'Commandes_fournisseurs': ERPCRM_BASE + 'purchase_order.py',
    'Equipements': ERPCRM_BASE + 'equipment.py',
    'Maintenance': ERPCRM_BASE + 'maintenance.py',
    'Telephonie': ERPCRM_BASE + 'telephony.py',
    'Succursales': ERPCRM_BASE + 'company_site.py',
    'Portail': ERPCRM_BASE + 'portal.py',
    'Ecom': ERPCRM_BASE + 'ecom.py',
    'Recurrence': ERPCRM_BASE + 'recurring_billing.py',
    'Journal': ERPCRM_BASE + 'entity_log.py',
    'Adresses': ERPCRM_BASE + 'address.py',
    'Photos': ERPCRM_BASE + 'installation_photo.py',
    'Backup': ERPCRM_BASE + 'backup.py',
    'Rapports_CDR': ERPCRM_BASE + 'cdr_report.py',
    'Employes': ERPCRM_BASE + 'employee.py',
    'Paiements': ERPCRM_BASE + 'payment.py',
    'Agenda': ERPCRM_BASE + 'appointment.py',
    'Users': ERPCRM_BASE + 'user.py',
    # SIPV (depot distinct, sipv@192.168.1.55)
    'Tenant': SIPV_BASE + 'tenant.py',
    'Extensions': SIPV_BASE + 'sip.py',
    'Trunks': SIPV_BASE + 'sip.py',
    'DIDs': SIPV_BASE + 'sip.py',
    'Routes': SIPV_BASE + 'dialplan.py',
    'IVR': SIPV_BASE + 'ivr.py',
    'Queues': SIPV_BASE + 'ivr.py',
    'RingGroups': SIPV_BASE + 'ivr.py',
    'PagingGroups': SIPV_BASE + 'ivr.py',
    'ParkingLots': SIPV_BASE + 'ivr.py',
    'Voicemail': SIPV_BASE + 'voicemail.py',
    'CDR': SIPV_BASE + 'cdr.py',
    'E911': SIPV_BASE + 'e911.py',
    'Provisioning': SIPV_BASE + 'provisioning.py',
    'Enregistrements': SIPV_BASE + 'recording.py',
    'Fax': SIPV_BASE + 'fax.py',
    'SMS': SIPV_BASE + 'sms.py',
    'SecuriteSIPV': SIPV_BASE + 'security.py',
    'Horaires': SIPV_BASE + 'schedule.py',
    'AudioPrompts': SIPV_BASE + 'prompt.py',
    'MOH': SIPV_BASE + 'moh.py',
    'Webhooks': SIPV_BASE + 'webhook.py',
    'Serveur_SIPV': SIPV_BASE + 'server.py',
    'ReglagesGlobaux_SIPV': SIPV_BASE + 'settings.py',
    'Acces_Backoffice_SIPV': SIPV_BASE + 'user.py',
    'Tarifs': SIPV_BASE + 'cdr.py',
    'PendingChange': SIPV_BASE + 'pending_change.py',
    'Synchronisation': '/home/sipv/sipv/backend/app/api/v1/endpoints/sync.py + core/erpcrm_client.py',
}


async def run() -> int:
    driver = AsyncGraphDatabase.driver(
        os.environ['NEO4J_URI'], auth=(os.environ['NEO4J_USER'], os.environ['NEO4J_PASSWORD'])
    )
    updated = 0
    skipped = 0
    async with driver.session() as session:
        result = await session.run(
            "MATCH (a:Entity)-[r]->(b:Entity) "
            "WHERE NOT r.fact CONTAINS 'TASK-' AND a.name <> 'Captaine' AND b.name <> 'Captaine' "
            "AND a.name <> 'Claude' AND b.name <> 'Claude' AND NOT r.fact CONTAINS 'contient le module' "
            "AND NOT r.fact CONTAINS 'Infrastructure transversale' "
            "RETURN r.uuid AS uuid, a.name AS source, r.fact AS fact"
        )
        rows = [record async for record in result]
        for row in rows:
            path = FILES.get(row['source'])
            if not path:
                skipped += 1
                print(f"PAS DE FICHIER CONNU pour source={row['source']!r}", file=sys.stderr)
                continue
            await session.run(
                'MATCH ()-[r]->() WHERE r.uuid = $uuid SET r.fact = r.fact + $suffix',
                uuid=row['uuid'], suffix=f' (source : {path})',
            )
            updated += 1
    await driver.close()
    print(f'{updated} faits mis a jour, {skipped} sans fichier connu')
    return 0


if __name__ == '__main__':
    sys.exit(asyncio.run(run()))
