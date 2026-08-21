---
name: documentation-sync
description: Maintenir PLATFORM_TASKS/BUILD_HISTORY/ERRORS_LESSONS/ARCHITECTURE_PLATFORM a jour apres une fonctionnalite ou une erreur importante. A utiliser a la fin de tout travail non-trivial, avant de considerer la tache terminee.
---

# Synchronisation documentaire

Simple IP Platform a une gestion de projet canonique commune (ERPCRM + SIPV), pas deux listes separees. Voir ARCHITECTURE_PLATFORM.md pour l'emplacement exact des fichiers.

## Apres une fonctionnalite

1. `PLATFORM_TASKS.md` doit refleter le statut reel (a faire / en cours / bloque / termine), scope explicite (`[ERPCRM]`/`[SIPV]`/`[SHARED]`/`[ARCH]`/`[INFRA]`/`[TOOLING]`/`[PLATFORM]`).
2. `BUILD_HISTORY.md` doit recevoir ce qui a ete reellement construit -- architecture retenue, pourquoi, fichiers principaux, etat actuel. Ne jamais inventer une section : ecrire "Non documente" ou "A verifier" plutot que de deviner.
3. Ne dupliquer aucune tache sous deux IDs simplement parce qu'elle touche les deux depots -- un TASK SHARED a un seul ID avec des sous-sections ERPCRM/SIPV.

## Apres une erreur importante

`ERRORS_LESSONS.md` recoit systematiquement les erreurs qui : ont coute du temps, risquent de se repeter, revelent une particularite du systeme, contredisent une doc existante, ou ont cause un incident. Format : ce qu'on croyait / pourquoi c'etait faux / preuve / cause reelle / correction / a ne pas refaire.

Une fausse piste mineure n'a pas besoin d'une entree complete -- utiliser le jugement, mais ne jamais faire disparaitre une erreur corrigee : elle devient de la connaissance.

## Apres une decision d'architecture

`ARCHITECTURE_PLATFORM.md` recoit la decision, le motif, les alternatives considerees, l'impact ERPCRM/SIPV/multi-SIPV. Distinguer explicitement `CURRENT_STATE` de `TARGET_ARCHITECTURE` -- une decision prise aujourd'hui n'est pas deja implementee tant qu'elle ne l'est pas.

## Anciens fichiers TASK

`TASKERPCRM.md`/`TASKSIPV.md` restent les sources historiques archivees (voir migration 2026-08-21). Ne pas y ajouter de nouvelles entrees actives une fois PLATFORM_TASKS.md en place -- verifier son existence avant d'ecrire dans l'ancien fichier par habitude.
