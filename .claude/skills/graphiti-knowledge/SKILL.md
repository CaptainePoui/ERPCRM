---
name: graphiti-knowledge
description: Comment et quand interroger ou alimenter Graphiti (memoire relationnelle de la plateforme). A utiliser pour une question "pourquoi/historique/erreurs deja rencontrees", ou apres une decision/erreur importante a conserver.
---

# Utiliser Graphiti

Graphiti (`graphiti-platform`, MCP HTTP `http://localhost:8000/mcp/`) est un graphe de **concepts reels** de Simple IP Platform -- jamais une copie mecanique de Markdown, jamais un numero TASK-XXX comme nom de noeud. Chaque noeud porte le vrai nom du concept (Compagnies, Facturation, Ticket, Tenant, Extensions...) avec un resume court ; chaque relation explique le POURQUOI (relation causale), avec la reference TASK-XXX/TASK-SXXX integree dans le texte du fait comme simple pointeur vers le detail technique -- jamais comme nom d'entite. Voir TASK-040.5/`ERRORS_LESSONS.md` pour l'historique complet de cette refonte (l'ancienne methode -- backfill mecanique de tout `PLATFORM_TASKS.md` -- a produit un graphe inutilisable, 77% de noeuds nommes par numero de tache, resumes vides, table rase decidee le 2026-09-04).

## Etat actuel (verifier avant d'utiliser)

`graphiti-mcp` tourne 100% local (Ollama `gpt-oss:20b` pour la resolution/dedup LLM, `nomic-embed-text` pour les embeddings -- rapide, secondes). Verifier `mcp__graphiti-platform__get_status` avant d'affirmer que le service est down.

## Quand interroger Graphiti (revise 2026-09-10, elargi au-dela de "ou on est rendu")

**Des qu'une demande touche un concept du projet, pas seulement pour "pourquoi/historique"** :
- Nouvelle fonctionnalite, bug, decision d'approche -- chercher le(s) module(s) concerne(s) AVANT de coder, pour voir ce qui existe deja, ce qui est deja decide, les pieges deja documentes (references ERRORS_LESSONS.md integrees dans les faits).
- Avant de creer un nouveau `TASK-XXX`/`TASK-SXXX` ou de nommer un nouveau concept -- verifier dans Graphiti s'il existe deja sous un autre nom. Remplace le grep manuel dans PLATFORM_TASKS.md pour cette verification (plus rapide, deja structure par concept).
- Bloque sur un probleme -- verifier si la situation (ou une proche) est deja documentee avant de repartir de zero.
- "Pourquoi cette architecture a ete choisie ?", "Comment X et Y sont-ils relies ?" (usage historique, toujours valide).

**Exception** : demandes purement mecaniques sans concept projet (corriger une faute de frappe, lancer une commande, committer) -- pas de recherche, n'apporterait rien.

Ne pas l'utiliser pour "que fait le code aujourd'hui" (reponse : lire le code / Serena) ni pour "qu'est-ce qu'il reste a faire" (reponse : PLATFORM_TASKS.md). Consulter Graphiti EN PREMIER pour un concept (nom + resume + relations), puis suivre la reference TASK-XXX vers PLATFORM_TASKS.md/ERRORS_LESSONS.md seulement pour le detail technique fin -- c'est le but explicite de la refonte (sauver du temps/tokens plutot que lire de grandes portions de PLATFORM_TASKS.md).

**Outil pour un noeud precis** : `search_memory_facts` (semantique/BFS) ne garantit PAS l'exhaustivite pour auditer un concept precis -- utiliser `tools/knowledge/graphiti/scripts/list_node_facts.py <<< 'NomDuNoeud'` (requete Neo4j directe, liste TOUTES les relations touchant ce noeud, dans les deux sens) quand la completude compte (ex. avant d'ajouter un fait, pour eviter un doublon).

## Quand alimenter Graphiti (le graphe doit suivre l'evolution du projet)

**Apres toute tache non-triviale qui change ce que Graphiti affirme** :
- Nouveau module/concept cree -- ajouter le noeud ET son rattachement au systeme parent (`ERPCRM CONTAINS X` / `SIPV CONTAINS X`) dans la MEME serie d'appels, jamais laisse flottant.
- Nouvelle dependance decouverte ou construite entre deux concepts existants -- ajouter la relation (le "pourquoi", pas juste le nom des deux bouts).
- Un fait existant devient perime (ex. un module note "FAUX FONCTIONNEL" est maintenant reellement cable, ou une architecture documentee a change) -- corriger le fait, ne jamais le laisser perime silencieusement.

**Toujours verifier avant ET apres** (voir `feedback_verify_means_verify` -- Philippe l'exige explicitement pour toute ecriture Graphiti) :
1. Avant : le concept/la relation existe-t-il deja sous un autre nom (`search_nodes` ou `list_node_facts.py`) ?
2. Apres : relire (`list_node_facts.py` sur le noeud concerne) pour confirmer que le fait ecrit est bien la, correctement forme.

**Jamais de dump mecanique** -- un vrai concept avec un vrai "pourquoi", pas une liste de champs FK generee automatiquement. Voir TASK-040.5 pour l'incident qui a impose cette regle, et `docs/platform/graphiti_deep_pass.md` pour la methode complete (audit noeud par noeud, un a la fois, verification double) utilisee pour combler les trous existants -- reutilisable pour tout futur rattrapage.

## Comment ecrire un fait -- `fast_write.py`, pas `add_memory`/`add_triplet` en session interactive

**`add_triplet` (outil MCP) fonctionne et est fiable** -- une conclusion prematuree du 2026-08-25 ("timeout systematique") a ete corrigee le 2026-09-04 : le materiel CPU-seul est juste lent (~7-8 min par appel, le harnais MCP abandonne parfois a 300s cote client alors que ca continue de traiter reellement cote serveur -- verifier l'activite reelle, `ps aux | grep llama-server`, avant de conclure a un echec). Mais pour la construction/maintenance courante du graphe, preferer **`tools/knowledge/graphiti/scripts/fast_write.py`** : meme resultat (noeud + fait + embeddings corrects, cherchable normalement ensuite), mais quelques SECONDES au lieu de 20-25 minutes, parce qu'il contourne l'etape de resolution/dedup par LLM (c'est Claude qui a deja verifie les noms existants avant d'appeler le script, pas besoin de la refaire cote serveur).

Procedure :
1. Verifier par requete directe (`MATCH (n:Entity {group_id:'platform'}) WHERE n.name = '...'`) si le concept existe deja -- jamais deviner un nom.
2. Ecrire le fait : `{"source": "NomExact", "edge_name": "RELATES_TO", "fact": "...(le pourquoi, reference TASK-XXX integree)...", "target": "NomExact", "source_summary": "..." (seulement si source nouvelle), "target_summary": "..." (seulement si target nouvelle)}`.
3. `docker exec -i graphiti-graphiti-mcp-1 /app/mcp/.venv/bin/python3 /app/mcp/scripts/fast_write.py <<< '{...}'` -- "OK" + code 0 si succes.
4. Rattacher tout nouveau concept a son systeme parent (ERPCRM ou SIPV) dans la MEME serie d'appels -- jamais laisse flottant (voir memoire persistante `feedback_graphiti_always_attach_to_hub`). Verifier aussi s'il est partage entre les deux systemes (champ `sipv_*` reel dans le code -- ne jamais deviner, grep le modele).

La file d'attente (`docs/platform/graphiti_queue.jsonl` + cron `graphiti_queue_consumer.py`, verrou `.graphiti_write.lock`) reste utile pour : (a) un gros lot a traiter sans bloquer la session interactive (le cron traite en arriere-plan, une fois par minute, sans qu'aucune surveillance active soit necessaire -- ca tourne tout seul), (b) les push SIPV/DashV16 (`incoming/*.jsonl`, cote push uniquement -- cf. `feedback_sipv_must_stay_autonomous`). Le script `add_one_episode.py` derriere cette file accepte les deux formats (episode generique OU triplet precis, voir son docstring). Pour un travail courant en session, `fast_write.py` direct est plus simple et immediat.

## `group_id` UNIQUE pour tout ("platform"), jamais un par domaine

Erreur commise le 2026-08-24 : `group_id` different par domaine casse la dedup (deux `group_id` = deux graphes disjoints qui ne se relient jamais). ERPCRM et SIPV (et DashV16, Crypto, Musique) sont un seul graphe partage -- `group_id="platform"` pour tout, sans exception.

## Toujours relier au centre -- "Captaine", jamais un projet

**Le centre reel de tout le graphe est l'entite "Captaine"** (Philippe), jamais "ERPCRM" ni aucun projet. Structure validee (2026-09-05/07) : `Captaine -> Simple IP -> ERPCRM & SIPV` (contenance directe), `Captaine -> Crypto -> DashV16` (Crypto est la categorie, DashV16 le vrai projet -- meme patron que Simple IP/ERPCRM), `Captaine -> Musique` (Suno est un outil utilise PAR Musique, pas un sous-projet distinct -- pas le meme patron que Crypto/DashV16). Un projet (DashV16, ERPCRM, SIPV) ne porte JAMAIS de lien de structure/possession direct vers Captaine -- seulement vers son maitre immediat (Simple IP ou Crypto). Un noeud "Claude" existe aussi, relie a Captaine ET directement a ERPCRM/SIPV/DashV16 (attentes de travail, voir memoire persistante -- ces liens-la sont des REGLES, pas de la structure, et peuvent legitimement sauter des niveaux).

**Doublons a surveiller -- deux mecanismes distincts** :
- Deux noms clairement differents pour la meme chose ("Simple IP Platform" vs "Simple IP inc.") : Graphiti ne les fusionne PAS automatiquement -- chercher une variante proche (`search_nodes`) avant de creer du contenu.
- Deux noms DIFFERENTS pour deux choses reellement distinctes mais semantiquement proches (ex. "Users" ERPCRM vs "Utilisateurs_SIPV" -- meme concept "comptes utilisateurs", systemes reellement separes) : ici le risque est INVERSE, `add_triplet`/`fast_write.py` peuvent les fusionner a tort si les noms se ressemblent trop (verifie 2026-09-06 : "Utilisateurs_SIPV" fusionne dans "Users" existant). Choisir un nom qui evite la racine semantique commune ("Acces_Backoffice_SIPV" plutot que "Utilisateurs_SIPV"), et toujours revérifier apres coup (`MATCH (a)-[r]-(b) WHERE a.name='Users'`) que le nouveau fait n'a pas atterri sur le mauvais noeud.

## Provenance obligatoire dans le texte du fait -- deux cas, jamais aucun

Chaque fait doit porter, en texte, SA vraie source -- jamais laisse sans aucune reference :
- **Fait derive d'une tache/decision documentee** (PLATFORM_TASKS.md, une histoire, une erreur) : reference le TASK-XXX/TASK-SXXX pertinent (jamais comme nom de noeud). Pour une erreur significative, referencer l'entree `ERRORS_LESSONS.md` correspondante plutot que de dupliquer le detail technique.
- **Fait trouve en lisant directement le code actuel** (une FK, un champ, un mecanisme -- pas issu d'une entree PLATFORM_TASKS.md) : ajouter `(source : chemin/vers/le/fichier.py)` a la fin du fait -- le fichier EST la vraie provenance ici, plus fiable qu'un numero de tache (le code peut avoir change depuis, le TASK-XXX original pourrait etre trompeur). Cote SIPV, prefixer le chemin absolu du depot distant (`/home/sipv/sipv/backend/app/...`) puisque ce n'est pas le meme depot.

Un fait "ERPCRM/SIPV contient le module X" (niveau conteneur) reference la tache de GENESE du module (`CLAUDE.md` : un TASK-XXX top-level = creation d'un module), pas une tache au hasard parmi celles qui l'ont modifie depuis. Si aucune tache dediee n'existe (ex. infrastructure transversale comme Adresses/Journal, herite de la table Entity partagee depuis TASK-002/003), le dire explicitement plutot que d'inventer un numero.

## Hierarchie en cas de contradiction

Graphiti ne remplace jamais Git ni le code. Si Graphiti dit A et le code dit B pour une question d'etat actuel, le code gagne -- Graphiti garde l'ancienne info comme historique, pas comme etat courant.
