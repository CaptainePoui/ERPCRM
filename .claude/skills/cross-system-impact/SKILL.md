---
name: cross-system-impact
description: Verifier ou placer correctement un changement qui touche plusieurs couches (ERPCRM/SIPV, ou plusieurs dossiers frontend). A utiliser avant d'ajouter du code telephonie/serveur/tenant, et avant d'empiler un composant dans un fichier existant.
---

# Impact cross-systeme -- ne pas mal placer le code

Pattern d'erreur recidivant sur ce projet (CDR, Trunk, ParkingLotsSection dans CompanyDetail.jsx) : ajouter du code au mauvais endroit parce que l'architecture cible n'a pas ete verifiee avant d'ecrire.

## Avant d'ajouter quoi que ce soit

1. Verifier la structure de DOSSIERS frontend reelle, pas juste l'onglet visuel. `frontend/src/pages/telephony/` existe pour la telephonie -- ne pas empiler dans `CompanyDetail.jsx` (deja fait une fois, corrige, ne pas repeter).
2. Verifier le backlog d'architecture (PLATFORM_TASKS.md une fois migre, sinon TASKERPCRM.md/TASKSIPV.md section architecture) AVANT de placer un nouveau composant/service.
3. Determiner si la fonctionnalite est reellement ERPCRM (Control Plane), SIPV (Telephony Plane), ou SHARED (les deux) -- voir ARCHITECTURE_PLATFORM.md.
4. Si SHARED : ne pas dupliquer la logique. Le cote SIPV reste la source de verite pour tout ce qui est validation telephonique (numerotation, collisions, etc.) -- ERPCRM proxie, ne reimplemente pas.

## Une tache SHARED n'est pas deux taches separees

Exemple Parking Lot : c'est UNE tache plateforme avec un volet ERPCRM et un volet SIPV, pas deux fonctionnalites independantes. Documenter les deux volets sous le meme TASK plateforme une fois PLATFORM_TASKS.md en place.

## Verifier apres, pas juste avant

Un composant partage n'est pas termine tant qu'il n'est pas prouve branche dans les vrais endpoints/CRUD (grep + test HTTP reel), pas juste teste en isolation.

## Ne jamais faire

- Empiler un nouveau composant telephonie dans `CompanyDetail.jsx`.
- Dupliquer une entite (ex: Server, Tenant) entre ERPCRM et SIPV sans verifier laquelle est la source de verite.
- Traiter une fonctionnalite qui traverse les deux systemes comme "juste un endpoint de plus" sans verifier le cote SIPV.
