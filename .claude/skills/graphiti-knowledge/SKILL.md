---
name: graphiti-knowledge
description: Comment et quand interroger ou alimenter Graphiti (memoire relationnelle de la plateforme). A utiliser pour une question "pourquoi/historique/erreurs deja rencontrees", ou apres une decision/erreur importante a conserver.
---

# Utiliser Graphiti

Graphiti (`graphiti-platform`, MCP HTTP `http://localhost:8000/mcp/`) est le graphe de connaissance relationnel et temporel de Simple IP Platform -- pas une copie de Markdown, des relations exploitables (TASK -> Feature -> ERPCRM/SIPV -> Error -> Decision).

## Etat actuel (verifier avant d'utiliser)

Le service `graphiti-mcp` est configure pour demarrer uniquement quand `OPENAI_API_KEY` est fourni dans `tools/knowledge/graphiti/.env` (voir `docker compose ps` dans ce dossier). Sans cette cle, le conteneur reste volontairement arrete -- ne pas presenter une reponse Graphiti comme obtenue si le service est down, verifier son etat d'abord.

## Quand interroger Graphiti

- "Pourquoi cette architecture a ete choisie ?"
- "Quelles erreurs deja rencontrees sur X ?"
- "Cette decision a-t-elle ete remplacee par une autre ?"

Ne pas l'utiliser pour "que fait le code aujourd'hui" (reponse : Serena) ni pour "qu'est-ce qu'il reste a faire" (reponse : PLATFORM_TASKS.md).

## Quand alimenter Graphiti

Apres une decision d'architecture importante, une erreur significative documentee dans ERRORS_LESSONS.md, ou une tache plateforme majeure terminee. Utiliser `group_id` coherent (`platform`/`erpcrm`/`sipv`) et `reference_time` = date reelle de l'evenement, pas la date d'ingestion.

## Provenance obligatoire

Chaque episode ingere doit porter : `project`, `scope`, `source_type`, `source_file`, `task_id`/`error_id` si applicable, `date`. Sans provenance, une information Graphiti n'est pas exploitable pour retrouver la preuve source.

## Hierarchie en cas de contradiction

Graphiti ne remplace jamais Git ni le code. Si Graphiti dit A et le code dit B pour une question d'etat actuel, le code gagne -- Graphiti garde l'ancienne info comme historique, pas comme etat courant.
