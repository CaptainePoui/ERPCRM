# ERRORS_LESSONS.md

Document canonique — `docs/platform/`, dépôt ERPCRM. Erreurs significatives : ont coûté du temps, risquent de se répéter, révèlent une particularité du système, contredisent une doc existante, ou ont causé un incident. Format : ce qu'on croyait / preuve / cause réelle / correction / leçon (à ne pas refaire). Jamais une erreur supprimée silencieusement — archivée proprement si elle devient obsolète.

**Convention de numérotation (depuis 2026-09-04)** : chaque erreur est identifiée par le **même numéro que la tâche** où elle s'est produite (`TASK-XXX.Y`), jamais un compteur séquentiel indépendant — voir `CLAUDE.md` § Convention PLATFORM_TASKS.md. Si la même tâche produit une nouvelle erreur plus tard, elle s'ajoute **datée** sous le même numéro plutôt que de créer une entrée séparée. But : repérer les patterns récurrents (une situation qui refait échouer, une formulation qui manque de précision), pas trouver un coupable. Toutes les entrées ci-dessous ont été migrées vers cette convention le 2026-09-04 (mapping vérifié contre `PLATFORM_TASKS.md`, pas deviné).

---

## TASK-S061 — Tirets doubles dans un commentaire XML cassent tout le dialplan d'un tenant

**Date** : 2026-08-20 (3e récidive du même piège que TASK-S050/TASK-S058)

**On croyait** : qu'un commentaire XML explicatif (`<!-- ... -->`) contenant `--` en plein milieu (ponctuation française normale, ex. "champ ParkingLot) -- pilote...") était inoffensif.

**Preuve** : incident réel — un commentaire ajouté dans `_parking_dialplan_entries` (SIPV, `xml_curl.py`) a fait planter le parsing XML COMPLET de FreeSWITCH pour le tenant `t1001` (`Context internal-t1001 not found`, catch-all busy). Un deuxième défaut identique préexistant trouvé au même moment dans `_ringgroup_dialplan_entries`. Troisième occurrence du même piège (déjà rencontré sur TASK-S050 et TASK-S058).

**Cause réelle** : la spec XML interdit `--` dans un commentaire ailleurs qu'au tout début/fin. Bug dans la chaîne générée, pas dans le Python — importait sans erreur, aucun test ne l'attrapait.

**Correction** : les deux commentaires fautifs corrigés le soir même.

**Leçon (à ne pas refaire)** : ne jamais écrire `--` dans un commentaire XML du dialplan (virgule/slash à la place). Se méfier des données UTILISATEUR interpolées dans un commentaire (nom de lot, de ring group...) — `xe()` protège le texte normal mais pas spécifiquement les commentaires. Après tout changement touchant la génération du dialplan : valider le XML généré programmatiquement (`ElementTree.parse`), pas juste vérifier que le Python importe. Risque systémique pas entièrement audité au moment de l'écriture : tout nom saisi par un utilisateur interpolé dans un commentaire XML reste vulnérable.

---

## TASK-036 — Un clic sur l'overlay d'un modal ne doit jamais le fermer

**Date** : 2026-08-19

**On croyait** : que `<div className="modal-overlay" onClick={onClose}>` était un pattern UX acceptable, standard sur quasi tous les popups ERPCRM.

**Preuve** : frustration forte et récidivante signalée par Philippe — un clic accidentel à l'extérieur d'un popup (mal visé, scroll) fermait le modal et faisait perdre toute la saisie en cours.

**Cause réelle** : pattern copié-collé sur quasi tous les popups (nouveau DID, nouvelle extension, cycle backup, template...) sans jamais remettre en question l'UX.

**Correction** : audit complet le même jour (~40 popups, tout le frontend ERPCRM), `onClick={onClose}` retiré de tous les overlays, chaque modal vérifié individuellement pour confirmer un bouton Annuler/Enregistrer explicite.

**Leçon (à ne pas refaire)** : seuls des boutons explicites à l'intérieur du modal (Annuler, Enregistrer, Fermer) peuvent le fermer — jamais un clic sur l'overlay. Vérifier ce pattern sur chaque nouveau modal, ne pas copier l'ancien réflexe même si c'est ce qui existe ailleurs dans le fichier.

---

## TASK-035 — Miroir de code SIPV sur le disque ERPCRM — incident d'autonomie

**Date** : 2026-08-16

**On croyait** : que garder une copie du code SIPV sur ERPCRM (`/home/simpleip/sipv`) pour pousser vers GitHub était un raccourci pratique, le serveur SIPV n'ayant jamais eu d'accès GitHub configuré.

**Preuve** : miroir périmé (dernier push le 12 août), un `rsync --delete` mal pensé a failli faire perdre `TASKSIPV.md`/`CLAUDE.md`/`frontend/.env` qui n'existaient QUE dans ce miroir — reconstruits à la main depuis l'historique de conversation, évité de justesse.

**Cause réelle** : dépendance croisée créée pour "simplifier" une tâche (push git), sans anticiper que SIPV doit rester déployable/sauvegardable indépendamment.

**Correction** : miroir supprimé (`rm -rf`, après confirmation que GitHub avait tout), accès GitHub direct configuré sur SIPV lui-même (clé de déploiement dédiée).

**Leçon (à ne pas refaire)** : ne jamais créer de copie/miroir/cache du code ou de la config d'un dépôt sur l'autre, même pour "simplifier" une tâche ponctuelle. Si SIPV a besoin d'un accès externe, le configurer DEPUIS SIPV lui-même, même si c'est plus lent. Raison structurelle : SIPV va déménager sur un autre serveur, toute dépendance croisée casse l'indépendance ce jour-là.

---

## TASK-015.13 — SQL manuel non demandé sur données de production, même pour "améliorer"

**Date** : 2026-08-14

**On croyait** : qu'exécuter un `UPDATE` manuel supplémentaire après une migration Alembic déjà correcte (defaults sûrs) pour "reprendre" les tickets déjà ouverts était une amélioration utile.

**Preuve** : la commande a remis le ticket exact en cours de correction dans le même état cassé (~19h de dérive) que le bug rapporté initialement. Repéré et corrigé avant que Philippe ne le voie, mais aurait pu rester invisible.

**Cause réelle** : action non demandée sur des données réelles de production, motivée par une bonne intention mais sans GO explicite.

**Correction** : ticket remis dans l'état correct produit par la migration seule.

**Leçon (à ne pas refaire)** : une migration avec des defaults sûrs est déjà la bonne fin d'état. Aucun UPDATE/DELETE manuel supplémentaire sur les tables de prod sans demande explicite et séparée — même intention d'amélioration. Si un ajustement semble utile, le proposer en texte et attendre confirmation. Seules les requêtes SELECT en lecture sont tolérées automatiquement.

---

## TASK-S061 (2) — Composant partagé testé en isolation ≠ composant réellement intégré

**Date** : 2026-08-19

**On croyait** : qu'un validateur central (`app/core/numbering.py`, SIPV) avec 7 tests unitaires tous verts constituait une étape "livrée".

**Preuve** : (item 1 Parcage) — `check_internal_number_available` n'était en réalité appelée nulle part dans `extensions.py`/`ivr.py`. Des doublons de numéro restaient créables par API malgré un validateur "complet". Philippe a repéré l'absence de branchement avant même que ce soit vérifié.

**Cause réelle** : tests unitaires du composant confondus avec preuve d'intégration réelle dans les chemins d'appel visés.

**Correction** : branchement effectué dans les vrais endpoints CRUD concernés.

**Leçon (à ne pas refaire)** : pour tout mécanisme partagé/central destiné à plusieurs endpoints, grep les points d'appel prévus pour confirmer l'intégration APRÈS coup, écrire au moins un test par vrai chemin HTTP/CRUD (pas seulement des tests unitaires du composant), et ne déclarer "terminé" qu'après ces deux vérifications.

---

## TASK-S054 — `get_current_user` au lieu de `get_current_user_or_service` sur un endpoint SIPV appelé en proxy par ERPCRM

**Date** : voir preuve (première occurrence)

**On croyait** : qu'un nouvel endpoint SIPV (`update_server`) pouvait réutiliser `get_current_user` (JWT SIPV strict) comme la majorité du code existant.

**Preuve** : l'endpoint répond 401 à CHAQUE appel réel depuis ERPCRM (qui n'a pas de compte SIPV, appelle via `X-Api-Key`) — invisible en relecture de code superficielle, ne se voit qu'au premier vrai test bout en bout. Même bug répété ensuite sur TASK-S033 (`list_all_moh`).

**Cause réelle** : ERPCRM n'a pas de compte SIPV, donc l'erreur ne se manifeste jamais en test JWT admin direct sur SIPV — seulement en appel réel proxy.

**Correction** : dépendance corrigée, redéploiement + redémarrage des deux services (`sipv-backend` ET `sipv-backend-tls` — piège additionnel, le premier redémarrage n'avait ciblé que `sipv-backend`).

**Leçon (à ne pas refaire)** : tout endpoint `api/v1/endpoints/*.py` (SIPV) consommé par ERPCRM doit être vérifié individuellement (pas juste l'import en haut de fichier). Toujours tester le VRAI chemin ERPCRM→SIPV avec le `X-Api-Key` réel avant de clore une tâche. Après un fix déployé côté SIPV, toujours redémarrer les deux services, jamais un seul.

---

## TASK-S033 — `get_current_user` au lieu de `get_current_user_or_service` (récidive du même bug que TASK-S054)

**Date** : voir preuve

**On croyait** : même erreur que TASK-S054, sur un endpoint différent (`list_all_moh`) du même fichier — écrit avec `get_current_user` par oubli pendant que tous les autres endpoints du même fichier utilisaient déjà `get_current_user_or_service`.

**Preuve** : 401 à chaque appel réel depuis ERPCRM, exactement comme TASK-S054, sur le MÊME fichier, après que le premier cas ait déjà été corrigé ailleurs.

**Cause réelle** : la correction de TASK-S054 n'avait pas été généralisée à tout le fichier — chaque nouvel endpoint du même fichier reste vulnérable individuellement.

**Correction** : dépendance corrigée sur cet endpoint aussi, mêmes deux services redémarrés.

**Leçon (à ne pas refaire)** : quand un bug de dépendance d'auth est trouvé sur un endpoint, auditer TOUS les autres endpoints du même fichier immédiatement, pas seulement celui rapporté — ce bug a une tendance prouvée à se répéter fichier par fichier.

---

## TASK-S033 (2) — Statut de tâche régressé silencieusement pendant une condensation de contenu

**Date** : 2026-08-22 (contrôle final Phase P, incident situé pendant la condensation Phase O)

**On croyait** : que réduire la prose répétitive d'un bloc de tâche (`TASK-S033`, ~550 lignes → condensé) pouvait se faire sans risque tant que le contenu technique était préservé.

**Preuve** : l'en-tête `TASK-S033` (MOH) avait été involontairement rétrogradé `[x]` → `[~]` pendant la condensation, sans aucune trace dans le mapping ni note justificative, contrairement au traitement documenté de `TASK-029`/`TASK-038` (ERPCRM). Une comparaison automatisée des 55 statuts SIPV top-level a confirmé que c'était le SEUL cas de divergence non tracée.

**Cause réelle** : en résumant un bloc long contenant un avertissement nuancé ("câblé pour le hold_music général ; queue mod_callcenter reste bloquée"), l'agent a interprété la nuance comme justifiant une rétrogradation du statut d'en-tête, sans que ce soit une décision délibérée ni documentée — la source elle-même marquait déjà `[x]` avec la nuance dans le titre.

**Correction** : statut restauré à `[x]` avec le parenthétique complet de la source, documenté dans `PHASE_O_ID_MAPPING.md` section 7.

**Leçon (à ne pas refaire)** : toute condensation de contenu doit préserver le statut d'en-tête EXACT de la source, même si le corps du texte contient une nuance — une nuance dans le texte n'autorise jamais une réinterprétation silencieuse du statut. Après toute condensation à grande échelle, comparer automatiquement TOUS les statuts d'en-tête source vs résultat (pas un échantillon), c'est le contrôle le moins coûteux et le plus fiable pour ce type de régression.

---

## TASK-015.15 — State React local qui survit un changement de route (composant non démonté)

**Date** : 2026-08-27

**On croyait** : que retirer les tâches du rendu des vues calendrier (Mois/Semaine/Jour) suffisait à ce qu'elles n'apparaissent plus JAMAIS sur `/agenda`, et que le calendrier ne pouvait jamais apparaître sur `/tasks` — les deux routes rendent le même composant `Tasks.jsx` mais avec un prop `defaultView` différent (`'list'` vs `'month'`), et le rendu du calendrier était conditionné sur `view === 'month'`.

**Preuve** : Philippe a signalé un calendrier visible SOUS la liste de tâches sur `/tasks`, et l'agenda qui semblait vide dans l'autre sens.

**Cause réelle** : `/tasks` et `/agenda` sont deux `<Route>` sœurs qui rendent toutes les deux `<Tasks defaultView=X/>` — React Router ne démonte PAS forcément ce composant en changeant de route entre elles (même type de composant à la même position dans l'arbre), il se contente de mettre à jour les props. Le state local `const [view, setView] = useState(defaultView)` ne s'initialise qu'une seule fois au premier montage — si le composant n'est jamais démonté, `view` garde la valeur d'une visite précédente (ex. `'month'` d'un passage sur `/agenda`) même après avoir navigué vers `/tasks`, où le prop `defaultView` vaut pourtant `'list'`.

**Correction** : deux garde-fous, pas juste un patch du symptôme — (1) `useEffect(() => setView(defaultView), [defaultView])` pour réinitialiser explicitement le state à chaque changement du prop ; (2) verrou `isAgenda &&` ajouté directement sur le rendu des 3 vues calendrier, indépendant du state `view`, pour qu'aucun bug futur similaire ne puisse refaire apparaître le calendrier hors de l'agenda.

**Leçon (à ne pas refaire)** : un `useState(prop)` n'est PAS garanti de se réinitialiser quand le `prop` change si le composant peut être réutilisé entre plusieurs routes sœurs qui rendent le même type de composant — piège classique de React Router, pas spécifique à ce projet. Réflexe à avoir : soit dériver l'état directement du prop à chaque rendu (pas de state local dupliqué), soit ajouter explicitement un `useEffect` de resynchronisation, chaque fois qu'un composant partagé entre plusieurs routes a un state initialisé depuis un prop.

---

## TASK-000.1 — ID de tâche dupliqué — `TASK-015.12` utilisé pour deux fonctionnalités sans rapport

**Date** : 2026-08-21 (audit Phase M)

**On croyait** : que chaque ID `TASK-XXX.Y` dans `TASKERPCRM.md` était unique (convention du projet, `CLAUDE.md`).

**Preuve** : `TASK-015.12` désignait deux entrées distinctes dans `TASKERPCRM.md` : "Correction manuelle du temps chrono ticket" (ligne 179) et "Envoi de RDV par courriel" (ligne 1371). Le texte lui-même référençait déjà 015.12 pour le RDV à 3 autres endroits, contre 1 seul pour l'autre — signe que la collision datait d'un ajout ultérieur non vérifié.

**Cause réelle** : numérotation manuelle sur un document de ~4000 lignes accumulé sur plusieurs mois, sans vérification d'unicité au moment de l'ajout.

**Correction** : "Correction manuelle du temps chrono ticket" renumérotée `TASK-015.14` en Phase O, mapping documenté dans `PHASE_O_ID_MAPPING.md`. "Envoi de RDV par courriel" garde `015.12`.

**Leçon (à ne pas refaire)** : avant d'assigner un nouvel ID `TASK-XXX.Y`, vérifier par grep qu'il n'est pas déjà utilisé ailleurs dans le document, pas seulement dans la section qu'on est en train d'éditer.

---

## TASK-000.2 — Compteur générique réutilisé — 22 sous-tâches SIPV mal rattachées à `TASK-S023`

**Date** : 2026-08-21 (audit Phase M)

**On croyait** : que toutes les sous-entrées numérotées `023.X`/`S023.X` dans `TASKSIPV.md` appartenaient au sujet de `TASK-S023` (synchronisation d'états `PendingChange`).

**Preuve** : 22 sous-entrées sous ce numéro n'avaient RIEN à voir avec la synchronisation `PendingChange` (jamais construite). Elles couvraient des sujets sans rapport entre eux (ring groups, voicemail, provisioning, renvois...), appartenant en réalité à `S004`/`S007`/`S008`/`S011`/`S018`/`S020`. Origine identifiée : un compteur séquentiel générique réutilisé pendant le backlog du "méga prompt" du 2026-07-24, sans rattachement réel au module `S023`.

**Cause réelle** : numérotation à la volée pendant une session de backlog intensive, sans vérifier la pertinence thématique du parent choisi.

**Correction** : les 22 entrées redistribuées vers leurs vraies familles en Phase O, mapping complet ancien ID → nouvel ID documenté dans `PHASE_O_ID_MAPPING.md`, `TASK-S023` lui-même laissé intact (`[ ]`, sans sous-entrées, son vrai sujet n'a jamais été construit).

**Leçon (à ne pas refaire)** : quand un nouveau sous-numéro est nécessaire en urgence pendant une session dense, vérifier qu'il est rattaché à un parent thématiquement cohérent — un compteur générique "pratique sur le coup" crée une dette de traçabilité qui ne se découvre qu'à l'audit, des semaines plus tard.

---

## TASK-040.1 — Timeout LLM Graphiti (Ollama local) encore trop court après une première correction

**Date** : 2026-09-02/03

**On croyait** (2026-08-24, patch `graphiti-build/patches/0002-long-timeout-no-retry-ollama-client.patch`) : que porter le timeout du client OpenAI (Ollama local) de 600s à 3600s (1h) était largement suffisant pour absorber la lenteur du CPU seul.

**Preuve** : `graphiti-backfill.service` (systemd, `docker exec` direct hors queue MCP, voir `scripts/backfill_platform_tasks.py`) coincé en boucle d'échec (`openai.APITimeoutError`) pendant 7h+ le 2026-09-02. Historique complet des logs `journalctl` depuis le 28 août : items réels prenant régulièrement 1h à 2h, jusqu'à 3h53min pour TASK-026 (qui a fini par réussir). Les embeddings (`nomic-embed-text`) répondent en secondes — seul le chat completion d'extraction (`gpt-oss:20b`) est concerné.

**Cause réelle** : `gpt-oss:20b` tourne à ~4,4 tokens/seconde en CPU pur (aucun GPU sur ce serveur) — confirmé dans les logs Ollama (`slot print_timing`, `tg = 4.40 t/s`). Le pipeline complet d'un épisode (extraction des nœuds + résolution + extraction des relations, plusieurs appels LLM séquentiels) dépasse largement 3600s pour un item `PLATFORM_TASKS.md` dense, même si le travail progresse réellement — le timeout coupait un traitement valide, pas un vrai blocage.

**Correction** : timeout remonté à 86400s (24h) — appliqué dans le patch source ET à chaud dans le conteneur en cours (`docker exec sed -i` sur `/app/mcp/src/services/factories.py`, fichier baké dans l'image donc survit à un `restart` mais pas à un `recreate`/rebuild sans réappliquer le patch). Marge volontairement très large : aucun item n'a jamais dépassé 4h dans tout l'historique du backfill.

**Leçon (à ne pas refaire)** : sur du LLM 100% local CPU-seul, ne jamais calibrer un timeout sur une estimation — mesurer la durée réelle des items les plus lents avant de fixer une valeur, et préférer un plafond très généreux (le timeout ne sert qu'à détecter un vrai blocage — process mort/deadlock — jamais à limiter un traitement qui avance juste lentement). Priorité utilisateur explicite pour cet outillage : robustesse/patience > vitesse, "on a le temps". Ne pas suggérer de changer de modèle d'extraction (`gpt-oss:20b`) — déjà testé et choisi délibérément par l'utilisateur, sujet fermé.

---

## TASK-040.3 — `systemctl stop` sur `graphiti-backfill.service` ne tue pas le vrai processus (récidive 2x)

**Date** : 2026-09-03, récidive 2026-09-04

**On croyait** : qu'un `systemctl stop graphiti-backfill.service` arrêtait réellement le traitement en cours, comme n'importe quel service systemd `Type=oneshot`.

**Preuve** : récidivé deux fois. Après `systemctl stop`, `systemctl status` affiche bien `inactive (dead)`, mais `docker top graphiti-graphiti-mcp-1` continue de montrer le vrai process `python3 backfill_platform_tasks.py` actif à l'intérieur du conteneur, parfois plusieurs heures plus tard, continuant à consommer le seul créneau d'inférence Ollama et à produire des résultats (dont une alerte Slack d'échec bien après l'arrêt supposé).

**Cause réelle** : `run-graphiti-backfill.sh` lance le script via `docker exec` sans proxy de signal. `systemctl stop` envoie SIGTERM à l'enveloppe `docker exec` (le process suivi par systemd), mais Docker ne propage pas systématiquement ce signal au process réellement exécuté à l'intérieur du conteneur — l'enveloppe meurt, le vrai travail continue, orphelin, invisible de systemd et de `journalctl`.

**Correction** : après tout `systemctl stop` de ce service, vérifier avec `docker top graphiti-graphiti-mcp-1` qu'aucun process `backfill_platform_tasks.py` ne persiste ; si oui, le tuer directement avec `sudo kill -9 <PID>` (le PID affiché par `docker top` est valide côté hôte).

**Leçon (à ne pas refaire)** : ne jamais faire confiance à `systemctl status` seul pour confirmer qu'un service basé sur `docker exec` est réellement arrêté — toujours vérifier avec `docker top` sur le conteneur cible. Vaut pour tout service systemd qui invoque `docker exec` sans `--sig-proxy` équivalent.

---

## TASK-040.4 — Tuer un processus avec `kill -9` peut geler silencieusement une requête concurrente d'un AUTRE processus sur le même Ollama

**Date** : 2026-09-04

**On croyait** : que tuer un processus fantôme (`kill -9`) était une opération isolée, sans effet sur d'autres processus utilisant le même service Ollama en parallèle.

**Preuve** : un épisode `add_memory` soumis par la session Claude Code a fait un premier appel LLM réussi (01h48), puis n'a plus jamais progressé ni échoué (aucune erreur loggée, `py-spy` confirmant le processus totalement au repos, aucune trace créée dans Neo4j après 8h). Coïncidence temporelle exacte : un `kill -9` a été appliqué à ~02h24 sur le processus fantôme du backfill (TASK-040.3), qui avait probablement une connexion ouverte vers Ollama au même moment que l'épisode en cours.

**Cause réelle** : `kill -9` ne permet aucune fermeture propre de connexion réseau (pas de FIN TCP). Deux processus indépendants partageant le même Ollama à un seul créneau d'inférence (`-np 1`) sont vulnérables à ce qu'une terminaison brutale de l'un corrompe l'état de la requête en cours de l'autre — la requête ne plante jamais (donc aucune erreur), elle attend indéfiniment une réponse qui ne viendra plus (timeout à 24h, donc invisible pendant très longtemps).

**Correction** : le conteneur `graphiti-mcp` a dû être redémarré au complet pour repartir sur des connexions réseau propres ; l'épisode perdu a été resoumis après coup, seul.

**Leçon (à ne pas refaire)** : ne jamais lancer un nouveau traitement Graphiti (backfill, `add_memory`, test) sans avoir d'abord confirmé qu'AUCUN autre processus ne tourne déjà (voir procédure de vérification TASK-040.3). Si un `kill -9` est nécessaire pendant qu'un autre traitement Graphiti est actif, considérer ce dernier comme potentiellement compromis et le vérifier/relancer après coup plutôt que de simplement attendre.

---

## TASK-040.5 — Le backfill mécanique de `PLATFORM_TASKS.md` a produit un graphe de mauvaise qualité — 77% du contenu à refaire

**Date** : 2026-09-04

**On croyait** : qu'ingérer chaque entrée de `PLATFORM_TASKS.md`/`ERRORS_LESSONS.md` telle quelle dans Graphiti, une tâche à la fois, via extraction automatique par le LLM local, construisait progressivement "les neurones du projet" de Philippe.

**Preuve** : audit du graphe — 77 des 100 épisodes du graphe entier (77%) provenaient de ce backfill mécanique. 59 des 371 nœuds étaient nommés par numéro de tâche ("TASK-021") plutôt que par leur vrai nom fonctionnel, avec des résumés vides ou quasi vides (0 à ~110 caractères, souvent une simple reformulation du titre). Recherche de "facturation"/"billing"/"recurring"/"prorata" : zéro résultat, alors que la fonctionnalité existe et est documentée en détail dans `PLATFORM_TASKS.md`.

**Cause réelle** : Graphiti était traité comme un système de sauvegarde/index de documentation (ingérer chaque fichier au complet pour "ne rien perdre"), pas comme une représentation de Philippe (ses règles, valeurs, décisions, erreurs) et de ses projets (le sens des concepts, pas le détail technique de chaque tâche). De plus, nommer l'épisode `"TASK-021 [ERPCRM] [x] ..."` amenait le LLM d'extraction à traiter l'identifiant de tâche lui-même comme une entité, au lieu d'un simple repère de provenance. Analyse complémentaire (voir TASK-040.9) : les prompts d'extraction de Graphiti lui-même (`extract_text`/`extract_message`) sont calibrés pour de la mémoire personnelle/conversationnelle générique (exemples intégrés : "Dr. Amara Osei a présenté son étude", "Alex a marqué le dernier panier"), pas pour un usage technique/business précis — décalage structurel, pas seulement un problème de nommage d'épisode.

**Correction** : reconstruction complète décidée (`clear_graph`) plutôt qu'un rafistolage nœud par nœud. Nouvelle méthode : les nœuds portent le vrai nom du concept (Facturation, Ticket, Tâches...), avec un résumé rédigé par Claude (pas une extraction brute) expliquant les relations causales entre concepts (pas juste "lié à"), et les numéros TASK-XXX comme simples références de provenance pour aller chercher le détail technique au besoin — jamais comme nom de nœud.

**Leçon (à ne pas refaire)** : avant de construire un pipeline d'ingestion en masse d'un fichier de documentation dans Graphiti, valider sur UN item que le résultat correspond vraiment à l'usage voulu (ici : navigation légère vers le bon endroit, pas copie exhaustive) — ne jamais lancer un backfill de 100+ items sur une hypothèse non vérifiée. Le nom de l'épisode source ne doit jamais être un identifiant technique (TASK-XXX) si on ne veut pas que ce identifiant devienne lui-même une entité du graphe.

---

## TASK-040.6 — Reset partiel au lieu de complet, faute d'avoir modélisé l'outillage Graphiti lui-même comme un concept à 3 couches

**Date** : 2026-09-04

**On croyait** : qu'exécuter "on repart à zéro" voulait dire redémarrer la pièce pertinente au problème du moment (le conteneur pour un bug réseau, le service pour un process fantôme) — une action à la fois, au fil des incidents.

**Preuve** : plusieurs redémarrages isolés effectués séparément dans la même conversation (service backfill seul, conteneur `graphiti-mcp` seul), sans jamais réinitialiser les trois couches ensemble (service / backend / données Neo4j que le frontend ERPCRM affiche) — Philippe a dû le signaler explicitement : "pourquoi tu redémarres les systèmes de Graphiti juste un à la fois... si je te demande on recommence à zéro, pourquoi tu ne redémarres pas les 3".

**Cause réelle** : l'outillage Graphiti lui-même (service systemd + conteneur backend + données Neo4j affichées par le frontend) n'a jamais été modélisé comme un concept unique à plusieurs couches liées, ni dans la documentation ni dans une mémoire de travail structurée — seulement retenu au cas par cas selon le problème immédiat, ce qui fait perdre la vue d'ensemble dès qu'une action touche le système au complet plutôt qu'un incident isolé.

**Correction** : les trois couches redémarrées ensemble, en une seule action coordonnée, une fois le problème signalé.

**Leçon (à ne pas refaire)** : quand une demande porte sur le système au complet ("on repart à zéro", "reset tout"), énumérer explicitement toutes les couches connues du système avant d'agir, pas juste celle liée au dernier incident traité. C'est un exemple concret et auto-référentiel de la leçon TASK-040.5 : si l'outillage Graphiti avait lui-même été un concept dans Graphiti (avec ses 3 couches liées et expliquées), une simple consultation du graphe aurait suffi à voir l'ensemble avant d'agir, au lieu de compter sur la mémoire de la session en cours.

---

## TASK-040.7 — Premier test d'insertion post-reset trop gros malgré une demande explicite de test minimal

**Date** : 2026-09-04

**On croyait** : qu'un épisode "Captaine" regroupant 8 entités (Captaine, Simple IP, ERPCRM, SIPV, Crypto, DashV16, Musique, Suno) en une seule fois correspondait à la demande de "petit morceau pour refaire un test d'insertion".

**Preuve** : Philippe avait dit explicitement "on va prendre un petit morceau pour refaire un test d'insertion... Ticket était trop gros pour un test... en premier on va créer Captaine... le créer, pas le faire avec tout son stock" — instruction claire de créer UNE seule entité (Captaine) d'abord, isolément, avant d'ajouter le reste. L'épisode soumis contenait quand même les 8 entités d'un coup, la même erreur d'échelle que le test "Ticket" précédent (voir TASK-040.5), tuée en cours de route (`kill`) sur demande de Philippe avant d'écrire quoi que ce soit.

**Cause réelle** : l'instruction contenait la liste complète des entités à terme (Simple IP, ERPCRM, SIPV, Crypto, Musique) dans le même message que la demande de test minimal — cette liste a été lue comme "le contenu du test" plutôt que comme "la feuille de route des prochaines étapes, après le test minimal réussi".

**Correction** : conteneur `graphiti-mcp` redémarré pour interrompre le traitement en cours (vérifié : 0 nœud écrit, rien à annuler). Prochain essai : "Captaine" seul, rien d'autre, puis ajout d'une entité à la fois seulement après confirmation que chaque étape précédente a réussi.

**Leçon (à ne pas refaire)** : quand une instruction énumère une liste d'éléments À VENIR tout en demandant explicitement de commencer petit/un seul élément, ne jamais interpréter la liste complète comme le contenu du premier envoi — isoler strictement le premier élément demandé, confirmer, puis avancer un élément à la fois.

---

## TASK-040.8 — Redémarrer le conteneur `graphiti-mcp` casse la connexion MCP de la session Claude Code en cours

**Date** : 2026-09-02, récidives 2026-09-03/04

**On croyait** : qu'un `docker compose restart graphiti-mcp` (ou `up -d`) serait transparent pour une session Claude Code déjà connectée au serveur MCP `graphiti-platform`, comme un simple délai de reconnexion.

**Preuve** : après un restart du conteneur (pour appliquer un correctif), tous les appels `mcp__graphiti-platform__*` ont échoué avec `ECONNRESET` (« The socket connection was closed unexpectedly »), et le menu `/mcp` affichait le serveur comme `✘ failed` sans tentative de reconnexion automatique, malgré que `curl http://localhost:8000/mcp/` répondait normalement côté serveur. Récidivé à chaque redémarrage du conteneur dans les jours suivants (comportement systématique, pas un incident isolé).

**Cause réelle** : le client MCP de la session garde une connexion HTTP ouverte ; un restart du conteneur ferme cette connexion brutalement. Le menu `/mcp` proposait aussi une option trompeuse « Authenticate » (message « not authenticated », `SDK auth failed: Dynamic Client Registration rejected (HTTP 404)`) alors que ce serveur local n'a aucune authentification OAuth — un faux positif du client MCP qui teste l'auth par défaut.

**Correction** : reconnexion manuelle via `/mcp` → sélectionner `graphiti-platform` → **Reconnect** (pas Authenticate). Fonctionne immédiatement si le serveur est réellement sain côté conteneur.

**Leçon (à ne pas refaire)** : avant tout `docker compose restart`/`up -d`/recreate d'un conteneur exposant un serveur MCP utilisé par la session en cours, prévenir que la connexion va tomber et qu'un `/mcp` → Reconnect manuel sera nécessaire après. Ne jamais choisir « Authenticate » sur un serveur MCP local sans OAuth malgré un message d'erreur qui y ressemble — toujours essayer Reconnect en premier.

---

## TASK-040.9 — `add_triplet` jugé cassé après seulement 5 minutes d'attente — conclusion prématurée, pas un vrai bug

**Date** : 2026-08-25 (première conclusion), corrigée le 2026-09-04

**On croyait** : que `add_triplet` était systématiquement défaillant sur ce matériel (timeout/échec à chaque essai), contrairement à `add_memory` qui revient immédiatement et traite en fond.

**Preuve** : plusieurs tentatives `add_triplet` déclarées "échouées" après que l'outil interne de la session Claude Code ait abandonné à 300s (5 min) d'attente sans réponse — jamais vérifié directement si un traitement réel était en cours côté serveur au-delà de ce délai. Retest le 2026-09-04 avec surveillance directe du CPU (`llama-server` à plus de 1000% CPU, calcul réel en cours) : la relation demandée a fini par être créée avec succès dans Neo4j après ~7-8 minutes — plus rapide que `add_memory` pour un fait simple, puisque `add_triplet` saute le gros prompt générique d'extraction de texte.

**Cause réelle** : `add_triplet` n'est pas cassé — il est simplement soumis à la même lenteur CPU que tout le reste de l'outillage (voir TASK-040.1), mais l'impatience de l'outil de session (300s) a systématiquement empêché de le vérifier correctement. La même faute de jugement ("pas de résultat après X minutes = cassé") que celle documentée dans TASK-040.5/040.6/040.7.

**Correction** : `add_triplet` reclassé comme fiable et même plus rapide que `add_memory` pour un fait unique et précis — c'est l'outil aligné avec l'objectif de Philippe (poser un fait exact sans extraction/interprétation par un LLM générique). À privilégier pour la reconstruction du graphe, en surveillant l'activité réelle (CPU/Ollama) plutôt que le verdict de l'outil de session en cas de délai dépassé.

**Leçon (à ne pas refaire)** : ne jamais conclure qu'un outil Graphiti est cassé sur la seule base d'un abandon côté client (300s) sur ce matériel CPU-seul — toujours vérifier l'activité réelle (CPU, logs Ollama, Neo4j) avant de rejeter un outil ou une méthode. Cette même erreur de jugement s'est répétée au moins 4 fois dans cette même session avant d'être corrigée.

---

## TASK-004.2 — Contrainte CHECK en base non reflétée dans le modèle SQLAlchemy bloque une nouvelle valeur d'enum

**Date** : voir TASK-004.1/TASK-004.2

**On croyait** : que `catalogue_items.type` n'était contraint que par la logique applicative (`models/catalogue.py`), sans contrainte DB séparée à mettre à jour.

**Preuve** : impossible de cocher "Connaissance" dans l'écran de classement en masse — `IntegrityError: CheckViolationError ... catalogue_items_type_check`. Un CHECK constraint (`type IN ('service','materiel')`) existait en base, posé hors du modèle SQLAlchemy à un moment non tracé dans l'historique Alembic.

**Cause réelle** : contrainte DB invisible dans `models/catalogue.py`, donc jamais repérée avant que la 3e valeur ("connaissance") soit introduite.

**Correction** : migration `drop_constraint` + `create_check_constraint` avec les 3 valeurs.

**Leçon (à ne pas refaire)** : une contrainte DB peut exister sans trace dans le modèle SQLAlchemy actuel — avant d'ajouter une nouvelle valeur à un champ de type enum/catégorie, vérifier les contraintes réelles en base (`\d+ table` psql), pas seulement le code Python.

---

## TASK-015.9 — Deux bugs dans le même correctif : nom de variable non défini + valeur négative non bornée

**Date** : voir TASK-015.9

**On croyait** : que `create_invoice_from_ticket` et le calcul de `work_mins` géraient déjà tous les cas normaux.

**Preuve** : `HOURLY_RATE` (nom non défini, faute de frappe pour `hourly_rate`) dans `create_invoice_from_ticket` — plantage. Séparément, `work_mins` pouvait devenir négatif si seul un crédit "Donner du temps" existait sur le ticket.

**Cause réelle** : faute de frappe non attrapée avant test réel ; absence de borne inférieure explicite sur un calcul qui suppose implicitement au moins une entrée positive.

**Correction** : `HOURLY_RATE` → `hourly_rate` ; `work_mins` passé dans `max(0, ...)`.

**Leçon (à ne pas refaire)** : tester le chemin réel (pas juste relire le code) attrape des fautes de frappe de nom de variable qu'aucun linter statique ne couvre en Python dynamique ; tout calcul dérivé d'une somme de crédits/débits doit être explicitement borné si une valeur négative n'a pas de sens métier.

---

## TASK-016 — `down_revision` Alembic pointant vers une révision inexistante

**Date** : voir TASK-016

**On croyait** : que le `down_revision` généré pointait vers la tête réelle de la chaîne de migrations.

**Preuve** : `alembic heads` retournait une erreur "multiple heads" — `down_revision` de la nouvelle migration pointait vers `f7a8b9c0d1e2`, une révision inexistante.

**Cause réelle** : la tête Alembic avait changé (autre migration ajoutée entre-temps) sans régénérer la révision avec la bonne référence.

**Correction** : `down_revision` corrigé à `b7a0691596a0` (vraie tête au moment de la migration).

**Leçon (à ne pas refaire)** : lancer `alembic heads` juste avant de générer une nouvelle migration pour confirmer la tête réelle, surtout si du temps s'est écoulé ou qu'un autre travail a pu ajouter une migration entre-temps.

---

## TASK-021 — `db.get()` avec `options=[...]` ne déclenche pas l'eager loading attendu en async (MissingGreenlet)

**Date** : voir TASK-021

**On croyait** : que `db.get(Invoice, id, options=[selectinload(...)])` chargeait les relations demandées, comme un vrai `select().options(...)`.

**Preuve** : `generate-invoice` plantait avec `MissingGreenlet` en accédant à une relation censée être eager-loadée.

**Cause réelle** : `AsyncSession.get()` n'applique pas les `options` d'eager loading de la même façon qu'un `select()` — accès différé à une relation hors du contexte async déclenche `MissingGreenlet`.

**Correction** : remplacé par un vrai `select(Invoice).options(selectinload(...))`.

**Leçon (à ne pas refaire)** : ne jamais utiliser `db.get(..., options=[...])` pour un eager loading fiable en SQLAlchemy async — toujours `select().options(selectinload(...))` explicite. Même famille de bug que TASK-S007.3 (ring groups, SIPV) — motif récurrent du eager-loading manquant en async, des deux côtés du projet.

---

## TASK-023.19 — Pydantic ignore silencieusement un champ non déclaré dans le schéma de mise à jour

**Date** : voir TASK-023.19

**On croyait** : qu'un `PUT` retournant 200 OK sur `PhoneUpdatePayload` avait bien appliqué tous les champs envoyés, y compris `is_active`.

**Preuve** : désactiver un appareil de test semblait réussir (200 OK) mais ne changeait rien réellement — `is_active` n'était pas déclaré dans `PhoneUpdatePayload`, donc silencieusement ignoré.

**Cause réelle** : schéma de mise à jour incomplet par rapport aux champs réellement éditables du modèle.

**Correction** : `is_active` ajouté à `PhoneUpdatePayload`, retesté et confirmé appliqué.

**Leçon (à ne pas refaire)** : un 200 OK sur un PUT/PATCH ne prouve PAS qu'un champ a été appliqué — Pydantic ignore silencieusement tout champ du payload non déclaré dans le schéma. Toujours revérifier la valeur après écriture (`GET` de contrôle) pour tout nouveau champ éditable.

---

## TASK-023.30 — Import oublié dans un second fichier réutilisant la même fonction

**Date** : voir TASK-023.30

**On croyait** : qu'importer `ensure_primary_site` dans `companies.py` suffisait, la fonction étant appelée paresseusement depuis "les endpoints de liste" en général.

**Preuve** : `NameError` (500) sur les endpoints 911/succursale de `contacts.py` — l'import n'y avait pas été répété. Séparément, `is_primary` manquait dans `_site_dict()` de `contacts.py`, cassant silencieusement la détection de la succursale primaire.

**Cause réelle** : une fonction partagée appelée depuis plusieurs fichiers doit être importée dans CHAQUE fichier qui l'utilise — oubli sur le second.

**Correction** : import ajouté dans `contacts.py`, `is_primary` ajouté à `_site_dict()`.

**Leçon (à ne pas refaire)** : quand une fonction/helper est appelée depuis plusieurs endpoints répartis sur plusieurs fichiers, grep tous les fichiers concernés pour confirmer l'import ET la présence des mêmes champs de sérialisation dupliqués entre fichiers, pas seulement le premier fichier modifié.

---

## TASK-023.31 — Plusieurs bugs de glisser-déposer natif HTML non fonctionnels au premier essai

**Date** : voir TASK-023.31

**On croyait** : qu'implémenter `onDragStart`/`onDrop` suffisait à obtenir un glisser-déposer natif fonctionnel.

**Preuve** : le glisser-déposer de fusion des DID ne fonctionnait pas au premier essai malgré un `PUT` qui réussissait en arrière-plan : `e.dataTransfer.setData(...)` manquant au `onDragStart` ; dépôt sur un DID sans `destination_type` n'avait rien à copier ; script d'import initial n'avait pas toujours rempli `destination`, empêchant la fusion visuelle même si le PUT réussissait.

**Cause réelle** : l'API HTML5 Drag and Drop exige `dataTransfer.setData()` même si son contenu n'est pas utilisé applicativement — sans cet appel le navigateur ne considère jamais la session comme un vrai glisser. Les deux autres bugs venaient de données d'import incomplètes.

**Correction** : `dataTransfer.setData()` ajouté ; `onDropOnRow` détermine un `destination_type` par défaut et rétro-remplit le DID cible ; valeurs de destination réécrites en base après diagnostic `psql`.

**Leçon (à ne pas refaire)** : le glisser-déposer HTML5 natif ne fonctionne jamais sans un appel à `dataTransfer.setData()` au `dragstart`, même si aucune lecture ultérieure de cette donnée n'est prévue — vérifier ce point en premier si un `onDrop` ne se déclenche jamais malgré un `draggable` correctement posé.

---

## TASK-024 — Paramètre FastAPI multipart déclaré comme query au lieu de `Form(...)`

**Date** : voir TASK-024

**On croyait** : qu'un paramètre simple (`caption: str | None = None`) suffisait pour recevoir un champ texte envoyé avec un upload multipart.

**Preuve** : l'upload avec légende revenait toujours `null` en base.

**Cause réelle** : FastAPI traite un paramètre non annoté `Form(...)` comme un paramètre de query par défaut, jamais rempli par un champ multipart/form-data.

**Correction** : `caption: str | None = Form(None)`.

**Leçon (à ne pas refaire)** : tout champ texte accompagnant un upload de fichier doit être explicitement déclaré `Form(...)` côté FastAPI — un paramètre simple traité comme query ne lève aucune erreur, juste une valeur toujours vide.

---

## TASK-026.2 — Ajouter un scope OAuth au code ne suffit pas si le refresh token existant ne le porte pas

**Date** : voir TASK-026.2

**On croyait** : qu'ajouter `calendar.readonly` à la liste des scopes déclarés dans le code suffisait à ce que les appels API en bénéficient immédiatement.

**Preuve** : `invalid_scope` au refresh du token juste après avoir ajouté le scope au code.

**Cause réelle** : un refresh token OAuth est émis avec un ensemble de scopes figé au moment du consentement initial ; ajouter un scope côté code ne met pas à jour rétroactivement les tokens déjà émis.

**Correction** : révoquer l'accès depuis `myaccount.google.com/permissions` puis reconnecter à neuf, ce qui force un nouveau refresh token avec les scopes actuels.

**Leçon (à ne pas refaire)** : après tout ajout de scope OAuth à une intégration déjà connectée, prévoir une reconnexion complète (révocation + nouveau consentement) — un redémarrage/redéploiement ne propage jamais un nouveau scope à un token déjà émis.

---

## TASK-026.3 — Deux bugs visuels dans le rendu CSS Grid de l'agenda

**Date** : voir TASK-026.3

**On croyait** : que le `gap` CSS entre colonnes d'une grille et un espacement/arrondi uniforme par segment donnaient un rendu correct pour des bandes d'événements multi-jours.

**Preuve** : le `gap` CSS faussait le calcul en % des largeurs de colonnes (colonnes plus étroites que 1/7 exact). Séparément, des segments consécutifs du même événement multi-jours affichaient chacun leur propre espacement/coin arrondi, créant une coupure visuelle trompeuse à la jonction ("c'est mélangeant").

**Cause réelle** : le `gap` CSS s'ajoute en plus des largeurs en %, faussant tout calcul basé sur une fraction simple ; l'espacement par défaut de chaque segment ne tenait pas compte de la continuité logique avec le segment adjacent du même événement.

**Correction** : `gap` retiré entièrement, remplacé par des bordures individuelles par cellule. `joinLeft`/`joinRight` détectent si un segment adjacent du même `event.id` touche ce segment et suppriment l'espacement/arrondi de ce côté.

**Leçon (à ne pas refaire)** : pour un calcul de largeur en % dans une grille CSS, `gap` doit être exclu ou compensé explicitement — jamais supposé neutre. Pour des segments représentant un même objet logique continu, l'espacement/arrondi doit dépendre des voisins directs, pas être appliqué uniformément.

---

## TASK-028.2 — Schéma de liste incomplet + feedback UX manquant sur un upload

**Date** : voir TASK-028.2

**On croyait** : que le schéma `CompanyListItem` (`GET /v1/companies`) portait les mêmes champs que `CompanyOut` (fiche individuelle).

**Preuve** : le menu déroulant "Compagnie" du formulaire d'upload MOH était TOUJOURS vide — `CompanyListItem` n'incluait pas `sipv_enabled`/`sipv_tenant_id`. Séparément, l'`<input type="file">` n'était jamais réinitialisé après un upload réussi et aucun message de succès/erreur n'était affiché.

**Cause réelle** : deux schémas Pydantic distincts pour la même entité (liste vs fiche) avaient dérivé. L'UI ne distinguait jamais "rien ne s'est passé" de "ça a réussi silencieusement".

**Correction** : `sipv_enabled`/`sipv_tenant_id` ajoutés à `CompanyListItem`. `key` incrémentée sur l'input file pour forcer un reset visuel, message de succès/erreur explicite ajouté.

**Leçon (à ne pas refaire)** : quand une entité a un schéma "liste" et un schéma "fiche" séparés, vérifier qu'ils portent les mêmes champs pertinents pour tout filtre frontend. Un upload de fichier doit toujours donner un retour visuel explicite, jamais silencieux même en cas de succès.

---

## TASK-028.3 — 413 nginx invisible dans les logs applicatifs

**Date** : voir TASK-028.3

**On croyait** : qu'un échec d'upload MOH se manifesterait dans les logs `erpcrm-backend` comme n'importe quelle autre erreur.

**Preuve** : "Échec de l'envoi" pour un vrai fichier audio, RIEN dans les logs `erpcrm-backend` pendant l'essai en direct.

**Cause réelle** : le reverse proxy public nginx n'avait aucun `client_max_body_size` explicite — défaut 1 Mo, nginx rejetait la requête (413) avant même qu'elle atteigne le backend.

**Correction** : `client_max_body_size 50m;` ajouté au bloc `server`, `nginx -t` puis `systemctl reload nginx`.

**Leçon (à ne pas refaire)** : une absence TOTALE de log applicatif pendant un échec réseau pointe vers une couche AVANT l'application (reverse proxy) — vérifier les limites de taille de tous les proxies intermédiaires avant de chercher un bug applicatif sur un échec d'upload volumineux.

---

## TASK-028.4 — Bug de layout CSS + bug de permission filesystem découverts pendant les tests

**Date** : voir TASK-028.4

**On croyait** : qu'un `marginLeft: auto` dynamique n'affecterait pas la sélection. Séparément, que le process `sipv` pouvait écrire directement dans `/usr/local/freeswitch/conf/moh_call_cache/` comme dans le dossier MOH équivalent.

**Preuve** : l'audio/téléchargement se décalait visuellement à la sélection. Séparément : `PermissionError` sur `/usr/local/freeswitch/conf/moh_call_cache/` lors de la lecture directe d'un fichier MOH par appel.

**Cause réelle** : `marginLeft: auto` dépend de l'espace disponible restant, qui change avec la sélection. Le dossier MOH équivalent (`local_stream/`) ne fonctionnait que parce qu'il existait déjà ; `conf/` appartient à `freeswitch:freeswitch` (750), seul le propriétaire peut y créer de nouvelles entrées.

**Correction** : ligne passée en CSS Grid (colonnes fixes). `moh_call_cache/` créé manuellement (`chown sipv:sipv`, `755`), fichier copié là avant lecture.

**Leçon (à ne pas refaire)** : éviter `marginLeft: auto` dans une ligne dont le contenu peut changer dynamiquement — préférer une grille à colonnes fixes. Un dossier qui "fonctionne" pour une fonctionnalité existante ne prouve pas que le process a le droit de CRÉER un nouveau sous-dossier ailleurs — vérifier les permissions réelles avant de le supposer.

---

## TASK-029.3 — Crash SIGILL au démarrage, bibliothèque exigeant un jeu d'instructions CPU non disponible

**Date** : voir TASK-029.3

**On croyait** : que le conteneur Voicebox crash-loopait pour une raison applicative classique (config, dépendance manquante).

**Preuve** : crash-loop en boucle (exit SIGILL) au démarrage.

**Cause réelle** : `pedalboard` (traitement audio) exige AVX2, jeu d'instructions CPU absent sur ce serveur.

**Correction** : contournement/version compatible appliqué (voir TASK-029.3).

**Leçon (à ne pas refaire)** : un SIGILL au démarrage d'un conteneur pointe vers une instruction CPU non supportée par le matériel hôte — vérifier les jeux d'instructions requis (AVX2, AVX-512...) par les dépendances natives (audio/ML) AVANT de déployer sur un nouveau serveur ou une VM à CPU restreint.

---

## TASK-029.4 — Deux bugs bloquants trouvés au premier test de génération bout en bout

**Date** : voir TASK-029.4

**On croyait** : qu'un profil de voix preset n'avait besoin d'aucun paramètre supplémentaire dans la requête `/generate`, et que Docker donnerait les bonnes permissions aux volumes pour l'utilisateur non-root du conteneur.

**Preuve** : requête sans `engine` explicite rejetée (400, défaut Voicebox = "qwen", incompatible). Séparément, `PermissionError` sur le volume Hugging Face ET sur le bind-mount de sortie — Docker crée volumes/bind-mounts en `root:root` par défaut.

**Cause réelle** : un profil preset n'était pas suffisant seul pour déterminer le moteur côté API. Docker ne connaît pas l'UID applicatif du conteneur au moment de créer un volume/bind-mount.

**Correction** : `voicebox_client.generate()` envoie `engine: PRESET_ENGINE` explicitement. `chown -R 999:999` appliqué sur le volume nommé et le bind-mount hôte.

**Leçon (à ne pas refaire)** : ne jamais supposer qu'un paramètre "déjà impliqué" par un profil/preset est inféré côté API — l'envoyer explicitement. Pour tout conteneur en utilisateur non-root avec volumes/bind-mounts, prévoir le `chown` manuel vers l'UID du conteneur — non persistant, à refaire si les volumes sont recréés.

---

## TASK-029.7 — Deux bugs distincts remontés en testant Kokoro/Siwis en conditions réelles

**Date** : voir TASK-029.7/029.8

**On croyait** : que créer un élément `Audio` et appeler `.play()` après un `await` réseau fonctionnait comme un appel JS classique. Séparément, que le process `sipv` pouvait créer un sous-dossier dans `/usr/local/freeswitch/conf/` comme il l'avait fait implicitement pour MOH.

**Preuve** : "play() can only be initiated by a user gesture" sur les boutons de lecture audio. Séparément : `PermissionError` sur `/usr/local/freeswitch/conf/prompts_cache`, 502 sur `POST /prompts/{id}/call` — `conf/` appartient à `freeswitch:freeswitch` (755).

**Cause réelle** : restriction navigateur standard sur l'autoplay hors geste utilisateur direct ; hypothèse fausse sur les permissions du dossier `conf/`.

**Correction** : première tentative — débloquer l'élément Audio dans le handler de clic avant l'attente réseau ; **insuffisante** (voir TASK-029.8, remplacée par un pattern 2-clics). Dossier `prompts_cache` créé manuellement (`chown sipv:sipv`, `755`), même pattern que `local_stream/`.

**Leçon (à ne pas refaire)** : le déblocage précoce d'un élément `Audio` dans un geste utilisateur n'est pas fiable sur tous les navigateurs — seul un `.play()` strictement synchrone avec le clic est garanti (voir TASK-029.8). Pour toute création de sous-dossier attendue dans `/usr/local/freeswitch/conf/`, créer manuellement à l'avance plutôt que supposer que `sipv` peut le faire lui-même au runtime.

---

## TASK-029.8 — Fix précédent insuffisant + syntaxe `originate` FreeSWITCH invalide

**Date** : voir TASK-029.8

**On croyait** : que débloquer l'élément Audio dans le geste utilisateur (TASK-029.7) réglait le problème d'autoplay. Séparément, que `"originate {vars}endpoint '&app(args)'"` avec apostrophes littérales était une syntaxe ESL valide.

**Preuve** : le fix TASK-029.7 confirmé déployé mais "play() can only be initiated by a user gesture" persistait. Séparément : `Parse Error!` côté FreeSWITCH → `DESTINATION_OUT_OF_ORDER`, le poste ne sonnait jamais malgré un 200 OK côté API.

**Cause réelle** : le déblocage précoce de l'élément Audio n'est pas fiable sur tous les navigateurs. Les apostrophes dans `originate_app()` sont une syntaxe shell, sans effet sur le parseur ESL brut qui les traite comme des caractères littéraux invalides.

**Correction** : pattern 2-clics strict (1er clic génère seulement, 2e clic joue de façon strictement synchrone). Apostrophes retirées de la commande `originate`.

**Leçon (à ne pas refaire)** : pour un autoplay audio garanti sur tous les navigateurs, le seul pattern fiable est un `.play()` strictement synchrone avec le clic, sans aucun `await` avant. Une commande ESL brute ne doit jamais contenir de quoting shell — le parseur ESL ne l'interprète pas comme un shell.

---

## TASK-029.9 — Régression : bouton "Tester cette voix" lié par erreur au champ Texte

**Date** : voir TASK-029.9

**On croyait** : qu'ajouter une vérification "texte requis" pour "Créer la phrase" n'affecterait pas le bouton "Tester cette voix" indépendant.

**Preuve** : "Tester cette voix" désactivé si le champ Texte était vide, et jouait son contenu au lieu d'une phrase de présentation fixe.

**Cause réelle** : la vérification ajoutée pour un bouton a été appliquée par erreur à un état/une condition partagée entre les deux boutons.

**Correction** : "Tester cette voix" joue toujours une phrase fixe, jamais liée au champ Texte.

**Leçon (à ne pas refaire)** : avant d'ajouter une condition sur un champ partagé entre deux actions UI distinctes, vérifier qu'elle ne s'applique qu'à celle qui la nécessite réellement.

---

## TASK-032 — Filtre CDR par poste ratait tous les appels sortants (préfixe tenant sur `src` seulement)

**Date** : voir TASK-032

**On croyait** : que le filtre `extension` de `list_cdr` fonctionnait symétriquement pour les appels entrants et sortants.

**Preuve** : poste 103 retournait 0 résultat pour les appels sortants alors que 17 appels existaient réellement en DB.

**Cause réelle** : `CDR.src` est stocké avec le préfixe tenant (`t1001-103`), contrairement à `dst` — le filtre comparait au numéro nu, ne matchant donc jamais `src`.

**Correction** : filtre corrigé côté SIPV pour tenir compte du préfixe tenant sur `src` (voir TASK-S055.5, affecte aussi le portail Mon poste).

**Leçon (à ne pas refaire)** : quand deux colonnes symétriques en apparence (`src`/`dst`) stockent des formats différents, tout filtre générique doit être testé séparément dans les deux sens avec des données réelles, pas supposé symétrique par construction.

---

## TASK-035 (2) — Scope OAuth Dropbox manquant + boucle infinie de tentatives d'échec

**Date** : 2026-08-14/15

**On croyait** : qu'un `raise_for_status()` générique suffisait à diagnostiquer un échec d'upload Dropbox, et qu'un premier passage dans App Console avait bien appliqué le scope `files.content.write`.

**Preuve** : les 3 copies (daily/weekly/monthly) échouaient avec `400 Bad Request` sur `upload_session/start`, mais l'UI affichait "Backup envoyé (3 copies)". Le scope manquant persistait même après un premier passage dans App Console — les cases avaient été cochées mais Submit n'avait pas été cliqué la première fois. 2692 lignes d'échecs accumulées en `backup_run_logs` avant le fix.

**Cause réelle** : app Dropbox créée sans le scope `files.content.write` (pas un problème de taille/chunking). Un token déjà émis ne regagne pas rétroactivement un scope ajouté après coup. `backup_runner.py` ne remontait pas le vrai statut succès/échec par copie, donc l'UI mentait sur le résultat.

**Correction** : `_check_dropbox()` ajouté pour capturer le corps de la réponse d'erreur + `X-Dropbox-Request-Id`. Scope explicitement inclus dans l'URL d'autorisation. `backup_runner.py`/`Admin.jsx` retournent et affichent le vrai statut par copie. Table `backup_run_logs` vidée sur demande explicite après confirmation.

**Leçon (à ne pas refaire)** : ne jamais se fier à `raise_for_status()` seul pour diagnostiquer un échec d'API tierce — capturer le corps de la réponse d'erreur complet. Une UI ne doit jamais afficher un succès générique sans vérifier le statut réel de CHAQUE sous-opération. Un scope OAuth ajouté côté provider ne se propage jamais à un token déjà émis — toujours reconnecter entièrement pour vérifier.

---

## TASK-038 — Trois bugs trouvés en marge pendant le développement du Parcage

**Date** : 2026-08-19/20

**On croyait** : qu'un déplacement de code antérieur avait laissé `E911AddressesSection`/`CdrSection` correctement exportés ; que `uuid_getvar` renvoyait une chaîne vide pour une variable non définie ; que masquer un champ tant qu'un mode n'était pas actif n'empêchait pas de choisir cette valeur.

**Preuve** : `E911AddressesSection`/`CdrSection` cassés après un déplacement de code précédent (jamais exportés). `uuid_getvar` renvoie littéralement `"_undef_"` pour une variable non définie — le fallback dans `moh_hold_tracker.py` ne traitait pas ce cas, bloquant la reprise MOH du parcage. La première version de l'UI "Poste dédié" cachait le sélecteur de poste tant que le mode n'était pas "fixed", rendant impossible de choisir un poste pour justement activer ce mode.

**Cause réelle** : export oublié lors d'un déplacement de fichier antérieur ; hypothèse fausse sur la valeur de retour de `uuid_getvar` pour une variable absente ; dépendance circulaire dans la logique d'affichage conditionnel.

**Correction** : exports réparés. Fallback traite désormais `"_undef_"` comme absence de valeur. Les deux champs partent ensemble en une seule requête dès qu'un poste est choisi, indépendamment du mode.

**Leçon (à ne pas refaire)** : après tout déplacement de composant entre fichiers, vérifier explicitement les exports/imports. Les commandes ESL FreeSWITCH peuvent renvoyer des sentinelles textuelles (`"_undef_"`) plutôt que vide/erreur — vérifier la vraie valeur de retour en testant. Un champ conditionnellement masqué ne doit jamais être la seule façon d'activer la condition qui le révèle.

---

## TASK-S004.1 — Deux bugs trouvés en connectant le premier trunk PSTN réel

**Date** : voir TASK-S004.1

**On croyait** : qu'un contexte sofia nommé `"public"` était sans risque, et qu'un digest correct suffisait à s'enregistrer auprès du fournisseur PSTN sans TLS.

**Preuve** : collision avec le fichier statique vanilla `dialplan/public.xml` (même piège déjà rencontré sur `internal`, TASK-S036). Séparément : 403 Forbidden en UDP simple malgré digest correct.

**Cause réelle** : FreeSWITCH exige une correspondance exacte de contexte — un nom générique (`public`) entre en collision avec un fichier dialplan statique du même nom. Le fournisseur exigeait une connexion TLS.

**Correction** : profil renommé `sipv-external`, `_dialplan_public()` corrigée. TLS activé sur le profil `external` (port 5081, certs `internal` réutilisés), gateway reconfiguré `register-transport="tls"`.

**Leçon (à ne pas refaire)** : ne jamais nommer un contexte sofia custom avec un nom générique qui pourrait matcher un fichier dialplan statique existant (`public`, `default`...). Un 403 malgré un digest correct peut signaler une exigence de transport (TLS), pas seulement un problème d'identifiants.

---

## TASK-S007.3 — `MissingGreenlet` sur les ring groups reconstruits (eager-load manquant)

**Date** : voir TASK-S007.3

**On croyait** : que l'accès aux relations de `RingGroup` dans `_ringgroup_dialplan_entries()` était déjà couvert par le chargement existant.

**Preuve** : `MissingGreenlet` trouvé en testant la génération dialplan des ring groups reconstruits.

**Cause réelle** : eager-load manquant sur une relation accédée hors du contexte async valide — même famille de bug que TASK-021 (ERPCRM, `generate-invoice`).

**Correction** : eager loading ajouté (`selectinload` sur la relation manquante).

**Leçon (à ne pas refaire)** : `MissingGreenlet` est un motif récurrent des deux côtés (ERPCRM et SIPV) chaque fois qu'une relation SQLAlchemy async est accédée sans eager loading explicite — voir aussi TASK-021.

---

## TASK-S011.2 — `sofia_contact` exige `user@domain`, pas juste `user`

**Date** : voir TASK-S011.2

**On croyait** : qu'interroger `sofia_contact` avec juste le nom d'utilisateur suffisait à obtenir le statut d'enregistrement d'un poste.

**Preuve** : `GET /esl/registration/{username}` répondait toujours "Unregistered", même pour un poste réellement enregistré.

**Cause réelle** : `sofia_contact` exige le format `user@domain`, pas juste `user`.

**Correction** : format corrigé. `registered_count` ajouté aux endpoints de registration, ce qui a nécessité de changer `_parse_registrations()` (`esl.py`) qui écrasait silencieusement les enregistrements multiples pour un même username — devenu une liste par username.

**Leçon (à ne pas refaire)** : vérifier le format exact exigé par une commande ESL FreeSWITCH avant de l'utiliser — un résultat "vide" systématique est plus souvent un problème de format de requête qu'une vraie absence d'enregistrement. Une structure `dict` simple pour un cas "plusieurs par clé" écrase silencieusement les entrées précédentes.

---

## TASK-S011.4 — Mot de passe SIP chiffré exposé en clair dans le premier jet du template de provisioning

**Date** : 2026-08-02

**On croyait** : que le champ mot de passe chiffré (Fernet) pouvait être interpolé directement dans le template Jinja2 de provisioning.

**Preuve** : trouvé en testant le premier `config_template` GXP2135 réel — le mot de passe SIP apparaissait en clair dans le fichier de configuration généré.

**Cause réelle** : le template recevait la valeur chiffrée brute au lieu de la valeur déchiffrée.

**Correction** : déchiffrement effectué côté contexte (Python) avant rendu du template.

**Leçon (à ne pas refaire)** : tout champ chiffré en base destiné à un rendu de template doit être déchiffré explicitement AVANT d'entrer dans le contexte du moteur de template — vérifier le contenu du fichier généré, pas seulement que le rendu n'a pas planté.

---

## TASK-S039 — Deux bugs de routage FreeSWITCH→client au cutover Kamailio

**Date** : 2026-07-23

**On croyait** : que `loose_route()` pouvait rester gaté derrière `has_totag()` sans conséquence, et que `fs_path` (généré par FreeSWITCH) suivait le format d'un header `Route` SIP standard.

**Preuve** : 2 bugs de routage FreeSWITCH→client trouvés en testant le cutover live.

**Cause réelle** : `loose_route()` gaté à tort derrière `has_totag()` ; `fs_path` traité comme une route proxy générique au lieu d'un header `Route` standard.

**Correction** : conditions de routage corrigées dans la config Kamailio.

**Leçon (à ne pas refaire)** : lors de l'intégration d'un SBC devant un PBX existant, ne jamais supposer qu'un champ produit par le PBX suit un format standard sans le vérifier explicitement — tester le cutover live avec de vrais flux avant de considérer la config figée.

---

## TASK-S050 — Premier cas documenté du piège `--` dans un commentaire XML du dialplan

**Date** : 2026-08-07 (récidivé ensuite sur TASK-S058 et TASK-S061)

**On croyait** : qu'un commentaire XML explicatif contenant `--` (ponctuation française normale) était inoffensif.

**Preuve** : commentaire XML `--` rencontré et corrigé la même nuit que la mise en place de l'ACL entrante sur le profil `external` — premier cas documenté de ce piège, avant récidive sur TASK-S058 puis TASK-S061 (2026-08-20).

**Cause réelle** : la spécification XML interdit `--` dans un commentaire ailleurs qu'au tout début/fin — invisible à l'import Python.

**Correction** : commentaire fautif corrigé le soir même.

**Leçon (à ne pas refaire)** : voir TASK-S061 pour la leçon complète (3e récidive) — ce piège aurait dû être traité comme systémique dès cette première occurrence plutôt que corrigé au cas par cas à chaque récidive.

---

## TASK-S051 — `no_answer_destination` jamais lu dans le cas "groupe ouvert" + bug de reconstruction du username lors du fix

**Date** : voir TASK-S051

**On croyait** : que `RingGroup.no_answer_destination` (existant depuis S007.3) était déjà lu par le dialplan dans tous les cas de figure.

**Preuve** : le champ n'était en réalité JAMAIS lu dans le cas "groupe ouvert avec membres actifs" — seul le cas "fermé par horaire" l'utilisait (même famille de bug que S047/S048). En corrigeant, un second bug trouvé en testant : la reconstruction du username préfixé manquait pour le type "extension".

**Cause réelle** : fonctionnalité partiellement câblée dès l'origine (un seul des deux chemins dialplan branché), jamais détecté faute de test du chemin "ouvert" avec échec de réponse.

**Correction** : `RingGroupFailoverStep` (liste ordonnée illimitée) remplace le champ simple (conservé en base pour compat lecture, marqué LEGACY). Reconstruction du username préfixé ajoutée.

**Leçon (à ne pas refaire)** : un champ de modèle existant depuis une tâche antérieure ne garantit pas qu'il est câblé dans TOUS les chemins dialplan pertinents — vérifier explicitement chaque branche avant de considérer un champ pleinement fonctionnel. Voir aussi S047/S048 pour la même classe de bug.

---

## TASK-015.15 (2) — Import manquant trouvé par lint, sans lien avec la tâche en cours

**Date** : 2026-08-27

**On croyait** : rien de spécifique — bug pré-existant découvert par hasard (lint) pendant un travail sans rapport direct.

**Preuve** : `frontend/src/pages/telephony/TelephonyTab.jsx` utilisait `QuickNewContact` sans jamais l'importer — plantage garanti si ce chemin s'exécutait.

**Cause réelle** : import oublié lors d'un ajout antérieur du composant, jamais exercé en test.

**Correction** : import ajouté.

**Leçon (à ne pas refaire)** : un bug pré-existant découvert incidemment (lint, grep) pendant un travail sans rapport doit être corrigé immédiatement dès qu'il est vu, même hors scope — coût de correction minimal une fois trouvé, coût de le laisser traîner bien plus élevé.

---

## TASK-015.15 (3) — Redémarrage partiel après un retrait de champ (modèle vs schéma)

**Date** : 2026-08-27

**On croyait** : qu'un seul redémarrage backend suffisait après le retrait de `google_calendar_event_id`/`google_calendar_id` du modèle `Task`.

**Preuve** : `AttributeError` sur CHAQUE appel `GET /v1/tasks` (page Tâches vide + Agenda vide) — le backend avait été redémarré après le retrait des champs du modèle `Task` MAIS PAS après le retrait des mêmes champs du schéma `TaskOut`.

**Cause réelle** : deux fichiers modifiés pour le même changement logique, un seul redémarrage déclenché entre les deux au lieu d'un seul redémarrage après TOUTES les modifications liées.

**Correction** : 2e redémarrage.

**Leçon (à ne pas refaire)** : quand un changement de champ touche plusieurs fichiers liés (modèle ET schéma Pydantic), ne redémarrer qu'UNE SEULE FOIS après avoir terminé TOUTES les modifications liées — un redémarrage intermédiaire laisse une fenêtre d'incohérence.
