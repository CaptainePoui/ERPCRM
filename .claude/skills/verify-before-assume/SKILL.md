---
name: verify-before-assume
description: Methode obligatoire avant toute affirmation technique sur ERPCRM ou SIPV -- identifier la source de verite reelle et prouver plutot que supposer. A utiliser des qu'une question porte sur "comment ca marche", "est-ce que X existe deja", ou avant de conclure une investigation.
---

# Verifier avant de supposer

Regle fondatrice du projet Simple IP Platform : ne jamais remplir un trou par une conclusion vraisemblable.

## Methode

1. **Identifier le type de question** et la source de verite qui y repond (voir table plus bas).
2. **Chercher dans le code reel** via Serena (`serena-erpcrm` et/ou `serena-sipv`) -- `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`. Ne pas deviner un chemin de fichier : le chercher.
3. **Verifier la DB** si la question porte sur des donnees (requete reelle, pas une supposition sur le schema).
4. **Verifier le runtime** si la question porte sur un comportement observable (services actifs, logs, config reellement chargee -- pas juste ce qui est sur disque).
5. **Utiliser Git** pour l'historique (`git log`, `git blame`) plutot que de deviner pourquoi quelque chose existe.
6. **Utiliser Graphiti** (`graphiti-platform`, une fois OPENAI_API_KEY fourni) pour le contexte/decisions passees, PLATFORM_TASKS, BUILD_HISTORY, ERRORS_LESSONS.
7. **Comparer les sources** si plusieurs existent. En cas de contradiction, le code/runtime gagne pour l'etat actuel ; l'ancienne doc reste utile comme historique.
8. **Produire un niveau de confiance explicite** dans la reponse finale.

## Source de verite par type de question

| Question | Source prioritaire |
|---|---|
| Que fait le code aujourd'hui ? | Serena + lecture du code |
| Quel est le comportement actuel ? | Runtime / logs / DB / config reellement chargee |
| Pourquoi ca a ete construit ainsi ? | BUILD_HISTORY.md + Graphiti |
| Quelles erreurs deja rencontrees ? | ERRORS_LESSONS.md + Graphiti |
| Qu'est-ce qu'il reste a faire ? | PLATFORM_TASKS.md |
| Quelle architecture est decidee ? | ARCHITECTURE_PLATFORM.md + Graphiti |
| Preference/habitude du projet | Auto Memory (memoire de travail, pas une source durable) |

## Vocabulaire de conclusion obligatoire

Pour toute investigation non triviale, qualifier la conclusion avec un de ces mots, jamais une affirmation nue :

- **PROUVE** -- verifie directement (code lu, requete executee, test reel)
- **TRES PROBABLE** -- forte convergence d'indices mais pas de test direct
- **HYPOTHESE** -- piste plausible, non verifiee
- **REFUTE** -- contredit par une verification directe
- **A VERIFIER** -- aucune verification faite, ne pas presenter comme un fait

## Ce qu'il ne faut jamais faire

- Affirmer qu'un fichier/endpoint/champ existe sans l'avoir trouve par Serena/grep.
- Dire "ca devrait marcher comme ça" sans avoir lu le code reel.
- Traiter TASKERPCRM.md/TASKSIPV.md/PLATFORM_TASKS.md comme forcement a jour -- ce sont des guides, pas la verite (ils peuvent avoir derive). Toujours croiser avec l'etat reel du systeme.
- Confondre "config sur disque" et "config reellement chargee" (SIPV notamment : FreeSWITCH/Kamailio peuvent tourner avec une config differente de celle sur disque tant qu'un reload n'a pas ete fait).
