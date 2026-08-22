# ERRORS_LESSONS.md

Document canonique — `docs/platform/`, dépôt ERPCRM. Erreurs significatives : ont coûté du temps, risquent de se répéter, révèlent une particularité du système, contredisent une doc existante, ou ont causé un incident. Format : ce qu'on croyait / preuve / cause réelle / correction / leçon (à ne pas refaire). Jamais une erreur supprimée silencieusement — archivée proprement si elle devient obsolète.

---

## 1. Tirets doubles dans un commentaire XML cassent tout le dialplan d'un tenant

**On croyait** : qu'un commentaire XML explicatif (`<!-- ... -->`) contenant `--` en plein milieu (ponctuation française normale, ex. "champ ParkingLot) -- pilote...") était inoffensif.

**Preuve** : incident réel 2026-08-20 — un commentaire ajouté dans `_parking_dialplan_entries` (SIPV, `xml_curl.py`) a fait planter le parsing XML COMPLET de FreeSWITCH pour le tenant `t1001` (`Context internal-t1001 not found`, catch-all busy). Un deuxième défaut identique préexistant trouvé au même moment dans `_ringgroup_dialplan_entries`.

**Cause réelle** : la spec XML interdit `--` dans un commentaire ailleurs qu'au tout début/fin. Bug dans la chaîne générée, pas dans le Python — importait sans erreur, aucun test ne l'attrapait.

**Correction** : les deux commentaires fautifs corrigés le soir même.

**Leçon (à ne pas refaire)** : ne jamais écrire `--` dans un commentaire XML du dialplan (virgule/slash à la place). Se méfier des données UTILISATEUR interpolées dans un commentaire (nom de lot, de ring group...) — `xe()` protège le texte normal mais pas spécifiquement les commentaires. Après tout changement touchant la génération du dialplan : valider le XML généré programmatiquement (`ElementTree.parse`), pas juste vérifier que le Python importe.

---

## 2. Un clic sur l'overlay d'un modal ne doit jamais le fermer

**On croyait** : que `<div className="modal-overlay" onClick={onClose}>` était un pattern UX acceptable, standard sur quasi tous les popups ERPCRM.

**Preuve** : frustration forte et récidivante signalée par Philippe (2026-08-19) — un clic accidentel à l'extérieur d'un popup (mal visé, scroll) fermait le modal et faisait perdre toute la saisie en cours.

**Cause réelle** : pattern copié-collé sur quasi tous les popups (nouveau DID, nouvelle extension, cycle backup, template...) sans jamais remettre en question l'UX.

**Correction** : audit complet le même jour (~40 popups, tout le frontend ERPCRM), `onClick={onClose}` retiré de tous les overlays, chaque modal vérifié individuellement pour confirmer un bouton Annuler/Enregistrer explicite.

**Leçon (à ne pas refaire)** : seuls des boutons explicites à l'intérieur du modal (Annuler, Enregistrer, Fermer) peuvent le fermer — jamais un clic sur l'overlay. Vérifier ce pattern sur chaque nouveau modal, ne pas copier l'ancien réflexe même si c'est ce qui existe ailleurs dans le fichier.

---

## 3. Miroir de code SIPV sur le disque ERPCRM — incident d'autonomie

**On croyait** : que garder une copie du code SIPV sur ERPCRM (`/home/simpleip/sipv`) pour pousser vers GitHub était un raccourci pratique, le serveur SIPV n'ayant jamais eu d'accès GitHub configuré.

**Preuve** : découvert le 2026-08-16, miroir périmé (dernier push le 12 août), un `rsync --delete` mal pensé a failli faire perdre `TASKSIPV.md`/`CLAUDE.md`/`frontend/.env` qui n'existaient QUE dans ce miroir — reconstruits à la main depuis l'historique de conversation, évité de justesse.

**Cause réelle** : dépendance croisée créée pour "simplifier" une tâche (push git), sans anticiper que SIPV doit rester déployable/sauvegardable indépendamment.

**Correction** : miroir supprimé (`rm -rf`, après confirmation que GitHub avait tout), accès GitHub direct configuré sur SIPV lui-même (clé de déploiement dédiée).

**Leçon (à ne pas refaire)** : ne jamais créer de copie/miroir/cache du code ou de la config d'un dépôt sur l'autre, même pour "simplifier" une tâche ponctuelle. Si SIPV a besoin d'un accès externe, le configurer DEPUIS SIPV lui-même, même si c'est plus lent. Raison structurelle : SIPV va déménager sur un autre serveur, toute dépendance croisée casse l'indépendance ce jour-là.

---

## 4. SQL manuel non demandé sur données de production, même pour "améliorer"

**On croyait** : qu'exécuter un `UPDATE` manuel supplémentaire après une migration Alembic déjà correcte (defaults sûrs) pour "reprendre" les tickets déjà ouverts était une amélioration utile.

**Preuve** : 2026-08-14 (TASK-015.13) — la commande a remis le ticket exact en cours de correction dans le même état cassé (~19h de dérive) que le bug rapporté initialement. Repéré et corrigé avant que Philippe ne le voie, mais aurait pu rester invisible.

**Cause réelle** : action non demandée sur des données réelles de production, motivée par une bonne intention mais sans GO explicite.

**Correction** : ticket remis dans l'état correct produit par la migration seule.

**Leçon (à ne pas refaire)** : une migration avec des defaults sûrs est déjà la bonne fin d'état. Aucun UPDATE/DELETE manuel supplémentaire sur les tables de prod sans demande explicite et séparée — même intention d'amélioration. Si un ajustement semble utile, le proposer en texte et attendre confirmation. Seules les requêtes SELECT en lecture sont tolérées automatiquement.

---

## 5. Composant partagé testé en isolation ≠ composant réellement intégré

**On croyait** : qu'un validateur central (`app/core/numbering.py`, SIPV) avec 7 tests unitaires tous verts constituait une étape "livrée".

**Preuve** : 2026-08-19 (TASK-S061, item 1 Parcage) — `check_internal_number_available` n'était en réalité appelée nulle part dans `extensions.py`/`ivr.py`. Des doublons de numéro restaient créables par API malgré un validateur "complet". Philippe a repéré l'absence de branchement avant même que ce soit vérifié.

**Cause réelle** : tests unitaires du composant confondus avec preuve d'intégration réelle dans les chemins d'appel visés.

**Correction** : branchement effectué dans les vrais endpoints CRUD concernés.

**Leçon (à ne pas refaire)** : pour tout mécanisme partagé/central destiné à plusieurs endpoints, grep les points d'appel prévus pour confirmer l'intégration APRÈS coup, écrire au moins un test par vrai chemin HTTP/CRUD (pas seulement des tests unitaires du composant), et ne déclarer "terminé" qu'après ces deux vérifications.

---

## 6. `get_current_user` au lieu de `get_current_user_or_service` sur un endpoint SIPV appelé en proxy par ERPCRM

**On croyait** : qu'un nouvel endpoint SIPV pouvait réutiliser `get_current_user` (JWT SIPV strict) comme la majorité du code existant.

**Preuve** : bug rencontré DEUX fois sur le même type d'erreur — `update_server` (TASK-S054) puis `list_all_moh` (TASK-S033), écrits avec `get_current_user` par oubli pendant que tous les autres endpoints du même fichier utilisaient déjà `get_current_user_or_service`. L'endpoint répond 401 à CHAQUE appel réel depuis ERPCRM (qui n'a pas de compte SIPV, appelle via `X-Api-Key`) — invisible en relecture de code superficielle, ne se voit qu'au premier vrai test bout en bout.

**Cause réelle** : ERPCRM n'a pas de compte SIPV, donc l'erreur ne se manifeste jamais en test JWT admin direct sur SIPV — seulement en appel réel proxy.

**Correction** : dépendance corrigée sur les deux endpoints, redéploiement + redémarrage des deux services (`sipv-backend` ET `sipv-backend-tls` — piège additionnel, le premier redémarrage n'avait ciblé que `sipv-backend`).

**Leçon (à ne pas refaire)** : tout endpoint `api/v1/endpoints/*.py` (SIPV) consommé par ERPCRM doit être vérifié individuellement (pas juste l'import en haut de fichier). Toujours tester le VRAI chemin ERPCRM→SIPV avec le `X-Api-Key` réel avant de clore une tâche. Après un fix déployé côté SIPV, toujours redémarrer les deux services (`sipv-backend` + `sipv-backend-tls`), jamais un seul.

---

## 7. ID de tâche dupliqué — `TASK-015.12` utilisé pour deux fonctionnalités sans rapport

**On croyait** : que chaque ID `TASK-XXX.Y` dans `TASKERPCRM.md` était unique (convention du projet, `CLAUDE.md`).

**Preuve** : audit Phase M (2026-08-21) — `TASK-015.12` désignait deux entrées distinctes dans `TASKERPCRM.md` : "Correction manuelle du temps chrono ticket" (ligne 179) et "Envoi de RDV par courriel" (ligne 1371). Le texte lui-même référençait déjà 015.12 pour le RDV à 3 autres endroits, contre 1 seul pour l'autre — signe que la collision datait d'un ajout ultérieur non vérifié.

**Cause réelle** : numérotation manuelle sur un document de ~4000 lignes accumulé sur plusieurs mois, sans vérification d'unicité au moment de l'ajout.

**Correction** : "Correction manuelle du temps chrono ticket" renumérotée `TASK-015.14` en Phase O, mapping documenté dans `PHASE_O_ID_MAPPING.md`. "Envoi de RDV par courriel" garde `015.12`.

**Leçon (à ne pas refaire)** : avant d'assigner un nouvel ID `TASK-XXX.Y`, vérifier par grep qu'il n'est pas déjà utilisé ailleurs dans le document, pas seulement dans la section qu'on est en train d'éditer.

---

## 8. Compteur générique réutilisé — 22 sous-tâches SIPV mal rattachées à `TASK-S023`

**On croyait** : que toutes les sous-entrées numérotées `023.X`/`S023.X` dans `TASKSIPV.md` appartenaient au sujet de `TASK-S023` (synchronisation d'états `PendingChange`).

**Preuve** : audit Phase M (2026-08-21) — 22 sous-entrées sous ce numéro n'avaient RIEN à voir avec la synchronisation `PendingChange` (jamais construite). Elles couvraient des sujets sans rapport entre eux (ring groups, voicemail, provisioning, renvois...), appartenant en réalité à `S004`/`S007`/`S008`/`S011`/`S018`/`S020`. Origine identifiée : un compteur séquentiel générique réutilisé pendant le backlog du "méga prompt" du 2026-07-24, sans rattachement réel au module `S023`.

**Cause réelle** : numérotation à la volée pendant une session de backlog intensive, sans vérifier la pertinence thématique du parent choisi.

**Correction** : les 22 entrées redistribuées vers leurs vraies familles en Phase O, mapping complet ancien ID → nouvel ID documenté dans `PHASE_O_ID_MAPPING.md`, `TASK-S023` lui-même laissé intact (`[ ]`, sans sous-entrées, son vrai sujet n'a jamais été construit).

**Leçon (à ne pas refaire)** : quand un nouveau sous-numéro est nécessaire en urgence pendant une session dense, vérifier qu'il est rattaché à un parent thématiquement cohérent — un compteur générique "pratique sur le coup" crée une dette de traçabilité qui ne se découvre qu'à l'audit, des semaines plus tard.

---

## 9. Statut de tâche régressé silencieusement pendant une condensation de contenu

**On croyait** (Phase O, condensation SIPV) : que réduire la prose répétitive d'un bloc de tâche (ex. `TASK-S033`, ~550 lignes → condensé) pouvait se faire sans risque tant que le contenu technique était préservé.

**Preuve** : contrôle final Phase P (2026-08-22) — l'en-tête `TASK-S033` (MOH) avait été involontairement rétrogradé `[x]` → `[~]` pendant la condensation, sans aucune trace dans le mapping ni note justificative, contrairement au traitement documenté de `TASK-029`/`TASK-038` (ERPCRM). Une comparaison automatisée des 55 statuts SIPV top-level a confirmé que c'était le SEUL cas de divergence non tracée.

**Cause réelle** : en résumant un bloc long contenant un avertissement nuancé ("câblé pour le hold_music général ; queue mod_callcenter reste bloquée"), l'agent a interprété la nuance comme justifiant une rétrogradation du statut d'en-tête, sans que ce soit une décision délibérée ni documentée — la source elle-même marquait déjà `[x]` avec la nuance dans le titre.

**Correction** : statut restauré à `[x]` avec le parenthétique complet de la source, documenté dans `PHASE_O_ID_MAPPING.md` section 7.

**Leçon (à ne pas refaire)** : toute condensation de contenu doit préserver le statut d'en-tête EXACT de la source, même si le corps du texte contient une nuance — une nuance dans le texte n'autorise jamais une réinterprétation silencieuse du statut. Après toute condensation à grande échelle, comparer automatiquement TOUS les statuts d'en-tête source vs résultat (pas un échantillon), c'est le contrôle le moins coûteux et le plus fiable pour ce type de régression.
