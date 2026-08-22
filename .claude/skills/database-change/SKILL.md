---
name: database-change
description: Regles avant tout changement de schema ou de donnees en base sur ERPCRM ou SIPV. A utiliser avant une migration Alembic, un script de correction de donnees, ou toute modification touchant PostgreSQL.
---

# Changement de base de donnees

## Regle absolue

Jamais de SQL manuel (`UPDATE`/`DELETE`) en production sans demande explicite de Philippe -- meme pour "corriger" un defaut de migration deja en place. Incident deja survenu (2026-08-14), corrige avant impact. Toute correction de donnees passe par une migration Alembic versionnee, pas par une commande ad-hoc.

## Avant toute migration

1. Chercher si le champ/table existe deja (ERPCRM ET SIPV -- ne pas dupliquer une entite qui devrait vivre d'un seul cote).
2. Verifier les FK et leurs regles de suppression (`ondelete="SET NULL"` pour optionnel, `ondelete="CASCADE"` pour obligatoire -- voir pattern dans CLAUDE.md du projet concerne).
3. Toute donnee creee doit rester modifiable plus tard -- jamais de champ create-only, sauf audit explicitement demande comme retroactif.
4. Un tenant/compagnie qui ferme se DESACTIVE, ne se supprime jamais -- garder la trace.

## Apres la migration

- Tester la migration up ET down si raisonnable.
- Redemarrer le backend concerne immediatement si le changement l'exige (jamais laisser un backend tourner avec un schema desynchronise).
- Mettre a jour docs/platform/PLATFORM_TASKS.md avec le numero de migration.

## Multi-tenant / multi-SIPV

Avant d'ajouter un champ sur une entite partagee (Tenant notamment), verifier `multi-sipv-impact` -- une colonne peut avoir besoin d'etre scopee par serveur, pas juste par tenant.
