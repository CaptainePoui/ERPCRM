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

## Alimenter Graphiti

Chacune des trois mises a jour ci-dessus (PLATFORM_TASKS/BUILD_HISTORY, ERRORS_LESSONS, ARCHITECTURE_PLATFORM) doit aussi se refleter dans Graphiti -- la synchronisation documentaire n'est pas terminee tant que cette etape n'est pas faite. **Ne jamais utiliser `add_memory`** pour ca (extraction LLM generique, lente ~20-25 min et de mauvaise qualite sur ce materiel -- voir TASK-040.5) : le graphe ERPCRM/SIPV est deja construit concept par concept avec de vrais noms (Compagnies, Facturation, Ticket... jamais un numero TASK-XXX comme nom de noeud).

Procedure (rapide, quelques secondes, pas de raison de sauter cette etape par souci de temps) :
1. Identifier le ou les concepts deja existants dans le graphe que la tache/erreur touche (`search_nodes` ou requete Cypher directe sur `Entity {group_id:'platform'}` pour confirmer le nom exact -- ne jamais deviner un nom, verifier qu'il existe deja ou decider consciemment d'en creer un nouveau).
2. Ecrire UN fait par relation causale reelle (le "pourquoi", pas juste "lie a") -- integrer la reference TASK-XXX/TASK-SXXX directement dans le texte du fait (jamais un noeud separe pour le numero de tache) ; pour une erreur significative, la reference pointe vers l'entree `ERRORS_LESSONS.md` correspondante plutot que de dupliquer le detail technique dans le fait.
3. Appeler `tools/knowledge/graphiti/scripts/fast_write.py` (dans le conteneur `graphiti-graphiti-mcp-1`) avec un objet JSON `{"source": "...", "edge_name": "RELATES_TO", "fact": "...", "target": "..."}` sur stdin -- voir le docstring du script pour le detail (verification d'existence par nom exact, embedding genere via le modele d'embedding rapide, ecriture directe). Un nouveau concept qui n'existe pas encore doit fournir `source_summary`/`target_summary`.
4. Verifier que le nouveau concept est bien rattache a son systeme parent (ERPCRM ou SIPV) dans la MEME serie d'appels, jamais laisse flottant -- voir `feedback_graphiti_always_attach_to_hub` (memoire persistante).

## Anciens fichiers TASK

`TASKERPCRM.md`/`TASKSIPV.md` restent les sources historiques archivees (voir migration 2026-08-21). Ne pas y ajouter de nouvelles entrees actives une fois PLATFORM_TASKS.md en place -- verifier son existence avant d'ecrire dans l'ancien fichier par habitude.
