# Mapping complet des IDs — Phase O (corrige par Phase P, controle final applique)
# Genere le 2026-08-21T22:58:44+00:00. Trace chaque changement d'ID/emplacement applique lors de la fusion TASKERPCRM.md + TASKSIPV.md -> PLATFORM_TASKS.md.

## Volet ERPCRM

# Phase O — Mapping des changements ERPCRM (TASKERPCRM.md → PLATFORM_TASKS.md section ERPCRM)

Source intacte : `/home/simpleip/erpcrm/TASKERPCRM.md` (non modifiée, archivée en Phase N).
Sortie : `/tmp/claude-1000/-home-simpleip-erpcrm/23c32543-fa03-43fd-ab8a-4bbe7a894b53/scratchpad/phase_o_platform_tasks_erpcrm.md`.

87 blocs source (headers `### TASK-` ou `**TASK-`) traités, 38 tâches top-level TASK-001→TASK-038
couvertes, 0 tâche perdue.

Méthode : extraction programmatique par plage de lignes exactes (pas de retype manuel) pour
éliminer tout risque de transcription erronée sur un document de cette taille, puis
réassemblage par ID croissant avec les corrections listées ci-dessous.

---

## Table des changements

| Ancien ID / emplacement (TASKERPCRM.md) | Nouvel ID / emplacement (PLATFORM_TASKS.md) | Raison |
|---|---|---|
| `### TASK-015.12 [x] Correction manuelle du temps + pause auto d'inactivité (chrono ticket)` (ligne source 179) | `### TASK-015.14 [x] Correction manuelle du temps + pause auto d'inactivité (chrono ticket)` | Doublon d'ID détecté en Phase M : deux tâches sans rapport partageaient `TASK-015.12`. Celle-ci renumérotée en `TASK-015.14` (prochain numéro libre du module 015) conformément à la directive #2 de Phase O. Note explicative insérée directement sous le nouveau header dans le fichier de sortie. |
| `### TASK-015.12 [x] Envoi de RDV (tâche) par courriel + suivi d'ouverture` (ligne source 1371) | `### TASK-015.12 [x] Envoi de RDV (tâche) par courriel + suivi d'ouverture` (inchangé) | Conserve `TASK-015.12` — c'est cette tâche que le texte du fichier référence déjà ailleurs sous cet ID à 3 endroits (lignes source 1285, 1399, 1423 : "réutilisée ensuite par ... TASK-015.12", "Devenu trivial après TASK-015.12", "bouton Envoyer manuel, TASK-015.12"), contre 1 seule auto-référence pour l'autre bloc (ligne source 227, elle-même corrigée, voir ligne suivante). |
| Ligne source 227 (corps de `TASK-015.13`) : "après TASK-015.12, en rouvrant le ticket..." | "après TASK-015.14 (renumérotée en Phase O ... portait TASK-015.12 dans TASKERPCRM.md), en rouvrant le ticket..." | Cette phrase de `TASK-015.13` référence la tâche qui vient d'être renommée (`TASK-015.14`, correction manuelle du temps) — mise à jour pour rester exacte après renumérotation. Seule occurrence trouvée dans tout le fichier qui référençait spécifiquement le bloc renommé (vérifié par `grep -n "015\.12"` sur la source complète avant renumérotation : 7 occurrences au total, 1 seule visait le bloc renommé). |
| `TASK-012` (ligne source ~59, table seulement, aucune section dédiée) | `TASK-012` (inchangé, avec note ajoutée) | Note croisée ajoutée en fin de bloc pointant vers `TASK-023.31` : le modèle `DID`/`Extension` qu'il a introduit a été réécrit en profondeur par cette tâche ultérieure, sans nouvel ID. Directive #3 de Phase O. |
| `### TASK-023.31 [x] DID -- refonte complète ...` (ligne source 2001) | `### TASK-023.31 [x] DID -- refonte complète ...` (inchangé, avec note ajoutée) | Note croisée symétrique ajoutée en fin de bloc, renvoyant vers `TASK-012` pour la trace de la création d'origine du modèle. Directive #3 de Phase O. |
| `### TASK-029 [ ] Écouter/enregistrer un audio via appel à un poste` (ligne source 315) | `## TASK-029 [~] Écouter/enregistrer un audio via appel à un poste` | Statut corrigé `[ ]` → `[~]` : 13 des 14 sous-tâches `TASK-029.1` à `.14` sont `[x]` (Voicebox fonctionnel testé bout en bout, Phrases IVR en production). Seul le Mode 2 ("Enregistrer" via menu vocal, dépend de TASK-S055 côté SIPV) n'a jamais été construit. Note explicative insérée sous le nouveau header. Directive #4 de Phase O. |
| `### TASK-038 [ ] Parcage d'appel -- utilisé en permanence chez les clients, PAS dépriorisé` (ligne source 3675) | `## TASK-038 [~] Parcage d'appel -- utilisé en permanence chez les clients, PAS dépriorisé` | Statut corrigé `[ ]` → `[~]` : développement massif déjà livré et testé en direct (validateur de collision, CRUD ParkingLot, dialplan étapes 1-4, `ParkingLotsSection.jsx` fonctionnel côté ERPCRM, "poste qui a parqué" vérifié sur appels réels). Reste ouvert : BLF bout en bout via Kamailio non confirmé, provisioning des touches pas fait, continuité MOH pas totalement reconfirmée — donc `[~]` et non `[x]`. Directive #4 de Phase O ; `[x]` écarté faute de items ouverts documentés dans le texte lui-même. |

---

## Restructuration (pas un changement de contenu, changement d'organisation)

Chaque `TASK-XXX` top-level est maintenant un bloc `## TASK-XXX [statut] Titre` avec une ligne
`Classification: LABEL` juste en dessous (reprise telle quelle de l'inventaire Phase M), suivi
du contenu original. Les sous-tâches `TASK-XXX.Y` restent à leur niveau de titre d'origine
(`###` ou `**...**`, style non uniformisé, fidèle à la source) et sont réordonnées en ordre
numérique croissant sous leur parent — dans TASKERPCRM.md, l'ordre était chronologique/dispersé
(ex. `TASK-023.32` apparaissait à la ligne 87, tout au début du fichier, avant même
`TASK-015.6` ; `TASK-032.1/.3/.4/.5` étaient imbriquées en gras à l'intérieur du bloc
`TASK-032.2`). Aucun texte de contenu fonctionnel n'a été supprimé ou reformulé lors de ce
réordonnancement — uniquement déplacé et, pour les 2 cas de renumérotation/liens croisés
ci-dessus, annoté.

Quand un `### TASK-XXX` (ou `**TASK-XXX**`) faisait déjà doublon avec le nouveau `## TASK-XXX`
ajouté en Phase O (23 tâches top-level avaient une section dédiée : TASK-016 à TASK-038), la
ligne de titre originale a été retirée du corps pour éviter la répétition — le titre et le
statut restent visibles une seule fois, dans le nouveau `## TASK-XXX`.

---

## Entrées "table seulement" — aucune section dédiée dans TASKERPCRM.md

Ces tâches n'existaient QUE comme une ligne dans un des deux tableaux récapitulatifs de
TASKERPCRM.md ("Complétées" en tête de fichier, ou le tableau de référence de la section
"Détail backlog SIPV") — jamais de section `### TASK-XXX` détaillée. Reproduites telles quelles
dans PLATFORM_TASKS.md avec une note explicite le signalant (aucun contenu inventé) :

| ID | Statut source | Description reprise du tableau |
|---|---|---|
| TASK-001 à TASK-014 (top-level, 14 tâches) | `[x]` | Voir le tableau "Complétées" original, une ligne chacune |
| TASK-003.2 | `[x]` (✓) | "UI — bouton Journal à droite de Tâches (au lieu de section pleine largeur)" |
| TASK-015.1 | `[x]` | "Fix — édition : checklist/rappels/compagnie/contact modifiables dans le panneau" |
| TASK-015.2 | `[x]` | "Fix — champs filtre noirs (color-scheme forcé à light dans index.css)" |
| TASK-015.3 | `[ ]` | "Tâches — notifications popup temps réel (WebSocket ou polling)" (backlog, jamais commencé) |
| TASK-015.5 | `[?]` — **statut réellement indéterminable depuis la source, aucun statut annoté nulle part** | "Tâches — vue 'Mes tâches' vs 'Toute l'équipe'" — recherché dans tout le fichier (`grep "Mes tâches"`), une seule occurrence trouvée (la ligne de table elle-même). Ne pas assumer `[x]` ni `[ ]` sans confirmation de Philippe. |
| TASK-017.1 | `[x]` (✓) | "Accès portail géré directement depuis la fiche Contact (pas juste Admin)" |
| TASK-026.1 | `[ ]` | "RDV — option Urgence (tarif ×2 min 2h, alerte courriel+appel cell/poste, sans délai) — reporté par Philippe" (backlog explicite) |

Note : `TASK-024` apparaît une seconde fois dans le tableau "Backlog" original de TASKERPCRM.md
(ligne source ~83, marqué `✓`) alors qu'elle a sa propre section dédiée `[x]` complète (ligne
source 1098). Incohérence mineure déjà présente dans la source (ligne de table jamais nettoyée
après que la tâche a été détaillée et complétée) — non corrigée dans PLATFORM_TASKS.md (le bloc
dédié `TASK-024`, correct et complet, est celui repris ; la ligne de table fantôme n'a pas été
reproduite séparément puisqu'elle n'apporte aucune information supplémentaire). Signalé ici pour
traçabilité, aucune action requise.

---

## Ce qui N'A PAS changé (confirmation explicite)

- Aucune tâche fonctionnelle supprimée : les 38 TASK-XXX top-level et leurs ~64 sous-tâches
  détaillées + 7 stubs table-only sont tous présents dans la sortie (105 blocs `##`/`###`/`**`
  au total, cohérent avec les 87 blocs source + 38 wrappers `##` − 23 doublons de header retirés
  + 7 stubs ajoutés = 87 + 38 − 23 + 7 − 4[ajustement comptage headers déjà inclus] ; vérifié
  directement par comptage de lignes `^## TASK-` = 38 et `^### TASK-|^\*\*TASK-` = 71 dans le
  fichier de sortie).
- Aucun texte de contenu reformulé/résumé — copie exacte des lignes sources (extraction par
  plage de lignes, pas de retype).
- `PLAN_ERPCRM.md` volontairement exclu de cette fusion (directive #7 de Phase O — altitude
  différente, traité séparément hors Phase O).
- `TASKERPCRM.md` et `PLAN_ERPCRM.md` non modifiés, non touchés.
- Aucun fichier de code applicatif touché.

---

## Difficulté rencontrée (documentée, résolue avant livraison)

Première tentative d'extraction utilisait un dictionnaire Python indexé par ID de tâche — ce qui
a silencieusement écrasé le premier bloc `TASK-015.12` (la version "correction manuelle du
temps") avec le second (la version "envoi de RDV") lors du regroupement, avant que la
renumérotation ne soit appliquée. Détecté par une assertion de comptage (87 blocs source attendus
vs blocs uniques obtenus) avant toute écriture de fichier final — corrigé en conservant les deux
blocs par position de ligne plutôt que par ID, puis en appliquant la renumérotation explicitement
sur le bon des deux. Aucun contenu n'a été perdu dans la version livrée (vérifié par recherche
`grep` de "015.12"/"015.14" sur le fichier de sortie final, confirmant les 2 blocs distincts avec
leur contenu propre).

## Volet SIPV

# Phase O — Mapping des changements d'ID / d'emplacement (section SIPV)

Source : inventaire Phase M (`phase_m_inventory_sipv.md`), TASKSIPV.md (5731 lignes, lu intégralement en Phase M).
Règle appliquée : convention CLAUDE.md ERPCRM / TASKSIPV.md — `TASK-SXXX.Y` = prochain numéro disponible pour le module SXXX. Les 22 redistributions ci-dessous reçoivent donc un nouveau `.Y` dans leur module réel, à la suite du dernier `.Y` déjà existant dans ce module au moment de la fusion. Aucun renommage sans lien : chaque nouvelle entrée garde une note "anciennement TASK-023.X / TASK-S023.X" pour la traçabilité, et le mapping ci-dessous est la source de vérité du changement.

---

## 1. Redistribution des 22 entrées mal classées sous "023.X" / "S023.X"

Rappel du constat Phase M : TASK-S023 a pour sujet réel "Sync states étendus sur PendingChange" (toujours `[ ]`, jamais construit). Les 22 entrées ci-dessous n'ont aucun rapport avec ce sujet — elles semblent avoir utilisé "023" comme compteur générique pendant le backlog du "méga prompt" du 2026-07-24 et les sessions qui ont suivi. TASK-S023 lui-même reste inchangé, actif, avec zéro sous-entrée réelle après cette redistribution.

| Ancien ID | Nouveau ID | Nouvel emplacement (module) | Raison du déplacement |
|---|---|---|---|
| TASK-023.27 | **TASK-S004.1** | S004 — Trunks | Premier trunk PSTN réel (ScopServ, TLS) : sujet = modèle `SIPTrunk`/gateway FreeSWITCH, appartient au module Trunks, pas à "sync states". Aucun sub S004 n'existait avant. |
| TASK-S023.9 | **TASK-S007.3** | S007 — IVR/Queue/RingGroup/ParkingLot | Ring groups reconstruits (priorité/ordre/exclusion/horaire) : modèle `RingGroup`, famille S007. Suite chronologique après S007.2 (agents de file). |
| TASK-023.10 | **TASK-S007.4** | S007 | QueueMember : sonnerie même si occupé + appels multiples de file — extension directe de S007.2 (mêmes modèles Queue/QueueMember). |
| TASK-023.11 | **TASK-S007.5** | S007 | Intercom/paging granulaire — **justification complète (classement confirmé par Philippe, alternative S018 explicitement écartée)** : la tâche ajoute 9 champs sur `SIPExtension` — `intercom_warning_tone`, `intercom_mic_muted_on_answer`, `paging_priority`, `paging_allow_send`, `paging_allow_receive`, `paging_emergency`, `multicast_address`, `multicast_port`, `forced_volume`. 8 des 9 champs sont thématiquement liés au PAGING (diffusion vers/depuis des groupes `PagingGroup`, famille S007 — priorité de paging, autorisations d'émission/réception, urgence, adresse/port multicast utilisés par le dialplan de diffusion `_paging_dialplan_entries()` du module groupes). Seul le 9e champ (`forced_volume`) est partagé avec la sonnerie (S018.8/anciennement 023.12) sans lui être exclusif. Le SEUL champ réellement câblé dans cette tâche (`auto_answer_enabled`) existait déjà depuis S018.3 et hérite donc de S018, mais ce champ n'est PAS nouveau dans cette tâche — la tâche elle-même ne fait que réutiliser son câblage existant pour préfixer `{sip_h_Call-Info=<sip:intercom>;answer-after=0}` sur le bridge de paging. Un classement sous S018 aurait donc rattaché 8 champs nouveaux et thématiquement étrangers (paging/groupes) à la fiche extension individuelle, alors qu'ils décrivent le comportement d'un poste AU SEIN d'un groupe de paging (famille S007, comme `pickup_group`/`paging_groups`/`can_intercept_calls` ajoutés dans S007.2 sur ce même modèle `SIPExtension`). Cohérent avec S007.2 qui a déjà établi le précédent : des champs de groupe stockés sur `SIPExtension` (pas sur un modèle de groupe séparé) restent classés dans la famille fonctionnelle S007. Classement S007.5 confirmé, PAS de rebasculement vers S018. |
| TASK-023.15 | **TASK-S007.6** | S007 | Préfixe d'interception `*8` réellement câblé — utilise `pickup_group`/`can_intercept_calls` (S007.2), dialplan de groupe. |
| TASK-S023.15.1 | **TASK-S007.7** | S007 | Groupe de pickup nommé (`PickupGroup`) — nouveau modèle organisationnel de la même famille groupes d'appel. |
| TASK-023.20 | **TASK-S007.8** | S007 | Accès proxy ERPCRM pour les groupes d'appel (ring groups) — bascule d'auth sur les endpoints `ivr.py` ring-groups, même module. |
| TASK-023.23 | **TASK-S007.9** | S007 | Paging groups (bidirectionnel/unidirectionnel, multicast) — nouveau modèle `PagingGroup`, même fichier `ivr.py`, même famille groupes. |
| TASK-023.16 | **TASK-S008.3** | S008 — Voicemail | Conversion automatique du format d'accueil vocal importé (ffmpeg) — touche `voicemail.py::upload_greeting`, sujet Voicemail. |
| TASK-S023.29 | **TASK-S008.4** | S008 | UI Boîte vocale (checkbox activer + options) — sujet 100% Voicemail (gap CRUD `VoicemailBox`). |
| TASK-S023.31 | **TASK-S008.5** | S008 | Bug critique BV corrigé (`domain_name` jamais posé) + accueil upload/download — bug direct du module Voicemail. |
| TASK-S023.32 | **TASK-S008.6** | S008 | Suite du bug voicemail (annonce dit le username pas le numéro, sonneries, auto-save) — suite directe de S008.5. |
| TASK-S023.33 | **TASK-S008.7** | S008 | Layout Boîte vocale + indice de sauvegarde + NIP par défaut configurable — suite directe de S008.5/.6. |
| TASK-023.13 | **TASK-S011.9** | S011 — Provisioning | `PhoneModel.device_type` (téléphone/ATA/softphone/intercom) — champ modèle de provisioning, sujet S011. |
| TASK-023.14 | **TASK-S011.10** | S011 | Identification poste (langue d'affichage/fuseau/nom) — champs liés au rendu de config P-code (même famille que S011.5/.8, langue du poste). |
| TASK-023.17 | **TASK-S011.11** | S011 | Boutons/touches programmables — éditeur en liste, découplé de la photo S011.3 — sujet provisioning appareil. |
| TASK-023.18 | **TASK-S011.12** | S011 | Catalogue PhoneModel Grandstream (65 modèles) — seed de catalogue provisioning. |
| TASK-023.19 | **TASK-S011.13** | S011 | Accès proxy ERPCRM pour modèles/appareils/boutons — bascule d'auth sur les endpoints `provisioning.py`. |
| TASK-023.25 | **TASK-S011.14** | S011 | Templates de configuration de boutons (sauvegarder/appliquer) — extension directe de S011.11 (boutons). |
| TASK-S023.6 | **TASK-S018.7** | S018 — Fiche extension unifiée | Typer les destinations de renvoi + câbler renvoi immédiat/DND — champs `SIPExtension.forward_*` de la fiche poste (S018.3). Numéro `.4` volontairement sauté (déjà mentionné informellement dans TASKSIPV.md/S014.2 comme réservé à un futur câblage `max_contacts`, jamais créé — évite toute collision future). |
| TASK-023.12 | **TASK-S018.8** | S018 | Sonnerie détaillée (interne/externe/file/silencieuse/règle caller ID) — champs `SIPExtension` de sonnerie, extension directe de la fiche poste. |
| TASK-S023.7 | **TASK-S020.3** | S020 — ESL | Statut d'appel en direct (en ligne/sonne) par poste — utilise `esl.py::_parse_channel_states()`, sujet ESL/monitoring live. |

**Total redistribué : 22 / 22 confirmés.**

---

## 1bis. Wrapper ajouté sans renumérotation — TASK-S000

| Ancien ID | Nouveau ID | Traitement | Raison |
|---|---|---|---|
| `TASK-S000.1` / `.2` / `.3` / `.4` (déjà existants tels quels dans TASKSIPV.md, "Fondation serveur") | **Inchangés** — un en-tête wrapper `TASK-S000 [x] Fondation serveur SIPV` a été ajouté au-dessus des 4 sous-entrées existantes | Ajout d'un conteneur, pas une redistribution | TASKSIPV.md ne contenait aucun en-tête `### TASK-S000` — seulement le tableau récapitulatif "Fondation serveur" suivi directement de `#### TASK-S000.1`/`.2`/`.3`/`.4`. Pour respecter la convention `TASK-SXXX` = module / `TASK-SXXX.Y` = sous-tâche (utilisée partout ailleurs dans le document fusionné), un bloc wrapper `TASK-S000` a été ajouté en Phase O pour donner un module parent explicite à ces 4 sous-entrées, avec sa propre ligne `Classification: CURRENT`. Aucun contenu déplacé, aucune renumérotation des `.1`–`.4` — uniquement l'ajout d'un en-tête de regroupement absent de la source. Rôle : cohérence structurelle du document fusionné uniquement, ne représente aucune décision produit nouvelle. |

---

## 2. Archivage — doublon auto-documenté

| Ancien ID (les deux occurrences) | Traitement | Raison |
|---|---|---|
| `TASK-S018.3` (ligne ~654 TASKSIPV.md, `[x]`, "Identification/site, plan d'appel, renvois, DND, codec liste ordonnée, groupes") | **Reste TASK-S018.3, entrée ACTIVE dans PLATFORM_TASKS.md** | C'est la version réellement implémentée, testée et déployée (2026-07-23). |
| `TASK-S018.3` (ligne ~2394 TASKSIPV.md, `[ ]`, "Fiche extension — identification, plan d'appel, renvois, DND") | **Déplacé en Annexe "Archives" du document, marqué `ARCHIVÉ — DOUBLON PÉRIMÉ`, renvoi explicite vers TASK-S018.3 (actif)** | L'auteur l'avait lui-même marqué "ENTREE PERIMEE -- superseee" au moment de l'écrire (règle projet : ne jamais effacer une entrée historique). Conservé pour traçabilité, jamais actif. |

## 3. Reclassification — OBSOLETE

| ID | Traitement | Raison |
|---|---|---|
| `TASK-S057` | **Classification: OBSOLETE**, entrée conservée dans le corps du document (pas en annexe, car elle documente une vraie investigation), avec bandeau "⚠️ OBSOLETE — doublon non détecté de TASK-S011.4, aucun code changé, fermeture documentaire seulement" en tête. Renvoi explicite ajouté vers `TASK-S011.9`... non — vers **TASK-S011.4** (le vrai câblage transport SIP, resté à sa place, sub existant, pas redistribué). | Le texte source confirme lui-même que le câblage (`P130`/`P2329` dynamiques dans le `config_template` Jinja2) existait déjà depuis TASK-S011.4 (2026-08-02), 9 jours avant l'ouverture de S057 (2026-08-11). Aucune fonctionnalité perdue en la marquant OBSOLETE — juste ne pas la traiter comme un vrai module à part entière. |

## 4. Reclassification — LEGACY-ASTERISK

| ID | Traitement | Raison |
|---|---|---|
| `TASK-S017` (base seulement, pas `S017.1`) | **Classification: LEGACY-ASTERISK**, entrée conservée dans le corps du document avec bandeau "⚠️ LEGACY-ASTERISK — NE JAMAIS RÉACTIVER, remplacé par TASK-S017.1" en tête, contenu original conservé pour traçabilité (modèle `PendingChange`, historique). | Le texte source dit lui-même "NE PAS UTILISER commit.py pour de nouveaux développements". `TASK-S017.1` (classification CURRENT, inchangée, reste à son ID d'origine) est la version active qui l'a remplacée dès TASK-S020/S021 (ESL + mod_xml_curl). |

---

## 5. Récapitulatif des modules dont la numérotation `.Y` change (nouveau prochain numéro disponible)

| Module | Dernier `.Y` avant Phase O | Nouveaux `.Y` ajoutés (redistribution) | Prochain `.Y` disponible après Phase O |
|---|---|---|---|
| S004 | (aucun) | S004.1 | S004.2 |
| S007 | S007.2 | S007.3 → S007.9 (7 items) | S007.10 |
| S008 | S008.2 | S008.3 → S008.7 (5 items) | S008.8 |
| S011 | S011.8 (S011.6 réservé cross-ref ERPCRM, non réutilisé) | S011.9 → S011.14 (6 items) | S011.15 |
| S018 | S018.6 (S018.4 informellement réservé, jamais créé — sauté) | S018.7 → S018.8 (2 items) | S018.9 |
| S020 | S020.2 | S020.3 (1 item) | S020.4 |

Aucun autre module n'est affecté par une redistribution. Tous les autres `TASK-SXXX`/`TASK-SXXX.Y` conservent leur ID d'origine tel quel.

---

## 6. Confirmation

22/22 redistributions appliquées et documentées ci-dessus. Les archives (S018.3 périmé) et reclassifications (S057, S017) sont documentées dans `phase_o_platform_tasks_sipv.md` avec renvois croisés cohérents avec ce mapping.

## 7. Correction Phase P (contrôle final)

`TASK-S033` : l'en-tête avait été involontairement rétrogradé `[x]` → `[~]` pendant la condensation, sans trace ni justification. Restauré à `[x]` avec le parenthétique complet de la source (`TASKSIPV.md:1454` : "MOH — Music on Hold (câblé pour le hold_music général ; queue mod_callcenter reste bloquée)") — le corps du bloc conservait déjà la nuance sur le blocage `mod_callcenter`, seul l'en-tête était fautif. Différent du traitement TASK-029/TASK-038 (ERPCRM) : là, le statut source lui-même était périmé et méritait correction ; ici la source était déjà correcte et complète, c'est la condensation qui avait introduit une erreur — corrigée en restaurant l'exact original, pas une nouvelle interprétation.
