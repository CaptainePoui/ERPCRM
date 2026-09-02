---
name: graphiti-knowledge
description: Comment et quand interroger ou alimenter Graphiti (memoire relationnelle de la plateforme). A utiliser pour une question "pourquoi/historique/erreurs deja rencontrees", ou apres une decision/erreur importante a conserver.
---

# Utiliser Graphiti

Graphiti (`graphiti-platform`, MCP HTTP `http://localhost:8000/mcp/`) est le graphe de connaissance relationnel et temporel de Simple IP Platform -- pas une copie de Markdown, des relations exploitables (TASK -> Feature -> ERPCRM/SIPV -> Error -> Decision).

## Etat actuel (verifier avant d'utiliser)

Depuis le 2026-08-24, `graphiti-mcp` tourne 100% local (Ollama `gpt-oss:20b` + embeddings + reranker BGE, voir `tools/knowledge/graphiti/.env` -- `OPENAI_API_KEY=ollama` pointe vers Ollama, pas OpenAI). Le service tourne en continu (`docker compose ps` dans ce dossier), mais le traitement des episodes (`add_memory`) est asynchrone, sequentiel par `group_id`, et LENT sur ce materiel (pas de GPU dedie) -- un episode peut prendre plusieurs minutes. Verifier `mcp__graphiti-platform__get_status` avant d'affirmer que le service est down ; un graphe qui n'a pas encore grossi ne veut pas dire qu'il est casse, juste qu'il n'a pas fini de traiter la file.

## Quand interroger Graphiti

- "Pourquoi cette architecture a ete choisie ?"
- "Quelles erreurs deja rencontrees sur X ?"
- "Cette decision a-t-elle ete remplacee par une autre ?"

Ne pas l'utiliser pour "que fait le code aujourd'hui" (reponse : Serena) ni pour "qu'est-ce qu'il reste a faire" (reponse : PLATFORM_TASKS.md).

## Quand alimenter Graphiti

Apres une decision d'architecture importante, une erreur significative documentee dans ERRORS_LESSONS.md, ou une tache plateforme majeure terminee. Utiliser `reference_time` = date reelle de l'evenement, pas la date d'ingestion.

**`group_id` UNIQUE pour tout ("platform"), jamais un par domaine.** Erreur commise le 2026-08-24 : ingerer avec `group_id` different par domaine (`platform`/`erpcrm`/`sipv`) SEMBLE une bonne idee pour filtrer, mais casse le graphe -- dans Graphiti, `group_id` est une frontiere dure : la dedup/fusion d'entites (reconnaitre que "ERPCRM" mentionne dans deux episodes est la meme entite) ne se fait QUE a l'interieur d'un meme `group_id`. Deux `group_id` differents = deux graphes disjoints qui ne se relient jamais, meme meme nom d'entite exact des deux cotes (verifie : entite "ERPCRM" dupliquee en deux noeuds distincts et jamais lies). Comme ERPCRM et SIPV sont un seul produit (Control Plane / Telephony Plane d'une seule plateforme), le graphe doit rester un seul domaine connecte -- utiliser `group_id="platform"` pour tout, sans exception. Filtrer par domaine si besoin se fait via les proprietes de l'entite (ex. `source_file`, contenu de `source_description`), pas via `group_id`.

## Toujours relier au centre -- "Philippe", PAS "ERPCRM"

**Le centre reel de tout le graphe est l'entite "Philippe"** (alias "Captine"/"Captaine"), pas "ERPCRM". Structure voulue par Philippe (v2 du hub, 2026-08-30, corrige la v1) : `Philippe -> Simple IP (son entreprise) -> ERPCRM & SIPV directement` (pas de couche intermediaire "Serveur telephonique"), avec d'autres branches directement sous Philippe pour ses autres projets (Crypto/DASHV16, Musique, futurs projets). "ERPCRM" reste un point de convergence intermediaire utile (beaucoup de contenu s'y relie deja), mais ce n'est qu'une branche -- ne jamais le traiter comme LE centre. Voir `tools/knowledge/graphiti/scripts/seed_philippe_hub.py` pour le texte exact actuellement live (verifie par requete directe le 2026-08-31).

**Doublons d'entites a surveiller** (trouve 2x, 2026-09-01/02) : Graphiti ne fusionne PAS deux noms proches d'une meme chose ("Simple IP Platform" vs "Simple IP inc.", "Module SIPV" vs "SIPV") -- ca cree deux noeuds disjoints avec des faits differents. Avant de conclure qu'une entite a peu de relations ou semble incomplete, chercher une variante de nom proche (`search_nodes` avec plusieurs formulations) avant de creer du nouveau contenu dessus. Scripts de fusion (sans perte, verifies relation par relation) dans `tools/knowledge/graphiti/scripts/merge_*.py` -- s'en inspirer si un nouveau doublon est trouve, ne pas fusionner a la main sans compter les relations avant/apres.

Erreur trouvee le 2026-08-25 (toujours valable techniquement, juste corriger la cible) : une section source qui ne mentionne jamais litteralement l'entite centrale dans son texte (ex. une liste de chemins de fichiers) produit des entites extraites qui ne s'y lient JAMAIS -- meme group_id unifie, meme instance, ca ne suffit pas : Graphiti ne cree un lien MENTIONS que si le mot est vraiment present dans le texte de l'episode. Verifie : 40+ noeuds totalement deconnectes du reste du graphe (0 chemin vers le centre meme sur plusieurs sauts) a deux reprises, corriges par un petit episode `add_memory` de pont plutot qu'une reingestion complete.

**Avant tout `add_memory`**, s'assurer que le texte de l'episode (ou son `episode_body`) mentionne explicitement "Philippe" (ou a defaut "ERPCRM"/"SIPV"/"Simple IP") au moins une fois -- si la source n'en parle pas naturellement (ex. un extrait de code, une liste de fichiers), ajouter une phrase de contexte au debut de `episode_body`. Si un noeud/grappe s'avere deja deconnecte du centre apres coup, corriger avec un petit episode `add_memory` (texte court mentionnant explicitement l'entite existante de la grappe ET "Philippe" ou un noeud deja relie a lui) plutot que de tout reingerer -- bien moins couteux, et **rescanner tout le graphe d'un coup** (BFS depuis "Philippe" en Python/neo4j driver, pas noeud par noeud) avant d'annoncer que c'est repare. **PAS `add_triplet`** : teste le 2026-08-25, timeout/echec systematique sur ce materiel (semble synchrone/bloquant, contrairement a `add_memory` qui revient immediatement et traite en fond) -- verifie : aucun lien cree malgre 300s d'attente.

## Ecrire dans Graphiti : file d'attente, pas `add_memory` direct (depuis 2026-09-02)

**Ne plus appeler `add_memory` (outil MCP) directement pour une tache de routine.** A la place, ajouter une ligne JSON a `docs/platform/graphiti_queue.jsonl` (append-only) :
```json
{"name": "...", "episode_body": "...", "source_description": "project=...; scope=...; source_type=...; date=...", "reference_time": "2026-09-02T12:00:00Z"}
```
Un cron (`tools/knowledge/graphiti/scripts/graphiti_queue_consumer.py`, a la minute) lit les nouvelles lignes et les ingere une a une via `add_episode()` direct (meme mecanisme que `backfill_platform_tasks.py`), avec un verrou (`.graphiti_write.lock`) qui garantit qu'une seule ecriture directe a la fois a lieu sur tout le graphe -- ERPCRM, SIPV et DASHV16 partagent ce meme graphe et doivent tous passer par ce systeme (SIPV/DASHV16 poussent leur propre fichier via scp vers `tools/knowledge/graphiti/incoming/`, cote push, jamais pull depuis ERPCRM -- cf. `feedback_sipv_must_stay_autonomous`).

**Pourquoi ce changement :** deux problemes distincts decouverts le 2026-09-02 en debuggant `backfill_platform_tasks.py` toujours actif apres 45+ minutes sur UN item :
1. La queue MCP normale (`add_memory`) est en memoire -- tout item en attente est perdu si le conteneur `graphiti-mcp` redemarre (deja arrive le 2026-08-27, et a nouveau risque le 2026-09-02 lors d'un `docker compose up -d` pour la connexion DASHV16).
2. Un script qui appelle `add_episode()` directement (pour contourner le probleme 1) n'est PAS serialise contre les autres ecritures directes ni contre `add_memory` -- risque reel de doublons (c'est ce qui a cause "Simple IP Platform"/"Simple IP inc." et "Module SIPV"/"SIPV").
La file d'attente fichier + verrou regle les deux a la fois : durable (survit a un redemarrage de conteneur) et strictement sequentielle (un seul ecrivain a la fois, quel que soit le projet).

`add_memory` reste utilisable pour une recherche/lecture ponctuelle en session interactive quand on a besoin d'un retour immediat et qu'aucun autre script d'ecriture directe ne tourne -- mais par defaut, passer par la file.

## Provenance obligatoire

Chaque episode ingere doit porter : `project`, `scope`, `source_type`, `source_file`, `task_id`/`error_id` si applicable, `date`. Sans provenance, une information Graphiti n'est pas exploitable pour retrouver la preuve source.

## Hierarchie en cas de contradiction

Graphiti ne remplace jamais Git ni le code. Si Graphiti dit A et le code dit B pour une question d'etat actuel, le code gagne -- Graphiti garde l'ancienne info comme historique, pas comme etat courant.
