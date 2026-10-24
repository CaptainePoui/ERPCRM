# ERRORS_LESSONS.md

Document canonique — `docs/platform/`, dépôt ERPCRM. Erreurs significatives : ont coûté du temps, risquent de se répéter, révèlent une particularité du système, contredisent une doc existante, ou ont causé un incident. Format : ce qu'on croyait / preuve / cause réelle / correction / leçon (à ne pas refaire). Jamais une erreur supprimée silencieusement — archivée proprement si elle devient obsolète.

**Convention de numérotation (depuis 2026-09-04)** : chaque erreur est identifiée par le **même numéro que la tâche** où elle s'est produite (`TASK-XXX.Y`), jamais un compteur séquentiel indépendant — voir `CLAUDE.md` § Convention PLATFORM_TASKS.md. Si la même tâche produit une nouvelle erreur plus tard, elle s'ajoute **datée** sous le même numéro plutôt que de créer une entrée séparée. But : repérer les patterns récurrents (une situation qui refait échouer, une formulation qui manque de précision), pas trouver un coupable. Toutes les entrées ci-dessous ont été migrées vers cette convention le 2026-09-04 (mapping vérifié contre `PLATFORM_TASKS.md`, pas deviné).

---

## TASK-044 — Répartition d'un paiement différente de ce qui avait été convenu en conversation

**Date** : 2026-10-15 (erreur), 2026-10-21 (vue par Philippe)

**On croyait** : que répartir les deux remboursements de carte « les plus vieilles factures d'abord » sur les 3 factures ScopServ était juste, puisque les totaux concordaient.

**Preuve** : Philippe, devant « 292,66 $ » sur la fiche du retrait : « ça n'a pas d'allure, on l'avait même noté qu'un était 2 factures et l'autre la 3e ». En conversation le 15 octobre : 2 666,09 $ = #36405 + #36687 (sans TVQ).

**Cause réelle** : la règle générique (plus vieilles d'abord) a remplacé la répartition expliquée à Philippe ; le montant global concordait, ce qui a masqué l'écart.

**Correction** : paiements re-répartis comme convenu (voir PLATFORM_TASKS TASK-044) ; l'écran montre maintenant « payés ici, sur une facture de … ».

**Leçon (à ne pas refaire)** : quand une répartition a été décidée ou expliquée en conversation, l'inscrire telle quelle ; une règle automatique ne remplace jamais une répartition déjà convenue avec Philippe. Un total qui concorde ne prouve pas que la répartition est la bonne.

---

## TASK-054 — Six écrans plantés quelques minutes : import oublié, invisible au build

**Date** : 2026-10-21

**On croyait** : que le bouton Retour était branché sur les fiches compagnie, contact, ticket, devis, article et facture fournisseur, puisque `vite build` passait sans erreur.

**Preuve** : test Playwright sur la fiche compagnie : « ReferenceError: useBack is not defined » (page d'erreur de React Router) ; même défaut sur les 6 fiches.

**Cause réelle** : le script d'édition n'ajoutait l'import que si « useBack » était déjà présent dans le fichier ; or l'appel `useBack()` a été inséré à l'étape suivante. Le build Vite ne vérifie pas les noms non définis (pas d'ESLint installé dans le projet).

**Correction** : imports ajoutés aux 6 fichiers ; vérification que chaque fichier qui utilise `useBack`, `EntityLink` ou `InvoiceLinks` les importe ; les 16 écrans touchés ouverts dans le navigateur sans erreur.

**Leçon (à ne pas refaire)** : un build qui passe ne prouve pas qu'un écran s'ouvre ; après une modification touchant plusieurs écrans, ouvrir chacun dans Playwright et relever les erreurs de la console (test « fumée ») avant de conclure. Envisager d'installer ESLint (règle no-undef) pour attraper ce cas au build.

---

## TASK-042.10 — Boutons qui débordent de leur fenêtre (erreur répétée)

**Date** : 2026-10-21

**On croyait** : que la fenêtre de choix « Retirer… » était correcte, après une première correction (boutons qui passent à la ligne).

**Preuve** : Philippe : « la boîte pour retirer le dépôt n'est pas assez large pour tes boutons (tu fais souvent cette erreur) ». La fenêtre avait une largeur fixe (460 px) et des libellés longs (« Retirer et oublier pour « ELAVON MRCH SVC » ») : boutons hors de la boîte, puis empilés.

**Cause réelle** : largeur de fenêtre fixée sans regarder la longueur réelle des boutons ; capture d'écran regardée sans mesurer si chaque bouton était à l'intérieur.

**Correction** : `Dialog.jsx` s'élargit à son contenu (min 460 px, max 92 % de l'écran), boutons sur une ligne ; libellés raccourcis. Vérification mesurée (positions des boutons dans la fenêtre), pas seulement à l'œil.

**Leçon (à ne pas refaire)** : toute fenêtre, carte ou barre de boutons se vérifie en mesurant que chaque bouton est entièrement dans son contenant (Playwright : boundingBox), à 1920 et sur cellulaire ; préférer des libellés courts et une largeur qui suit le contenu plutôt qu'une largeur fixe.

---

## TASK-006.5 — Zéko : erreur 504 au premier vrai essai de Philippe

**Date** : 2026-10-18

**On croyait** : que la conversation avec Zéko était vérifiée, après des essais réussis en local (`localhost:8010`, Playwright sur `localhost:3010`).

**Preuve** : Philippe, par https://portail.simpleip.tel : « je lui ai dit que je faisais un test et il m'a donné une erreur 504 ». Journal nginx : `upstream timed out … while reading response header from upstream` sur `POST /api/v1/zeko/conversations/…/messages`, 60 s après la demande.

**Cause réelle** : sur processeur, le modèle réfléchit parfois plus d'une minute avant son premier mot ; le flux n'envoyait rien avant ce mot. Le chemin réel (Cloudflare → nginx → vite → backend) coupe une réponse muette au bout de 60 s ; les essais en local ne passaient pas par nginx ni par Cloudflare.

**Correction** : le flux envoie tout de suite une ligne de commentaire SSE, puis toutes les 10 s tant que Zéko n'a rien écrit ; nginx : `location /api/v1/zeko/` sans tampon, attente 1800 s (copie de l'ancien fichier : `backups/nginx_portail.simpleip.tel_avant_zeko_20261018`). Vérifié par l'adresse publique : premier octet à 0 s, réponse complète à 38 s.

**Leçon (à ne pas refaire)** : une fonction longue ou en flux se teste par le chemin réel de Philippe (adresse publique, Cloudflare + nginx), pas seulement en local ; toute réponse qui peut rester muette plus de 30 s doit envoyer un signe de vie.


**2026-10-21 — Test sur un ticket de Philippe (même tâche)** : pour vérifier le bouton « Photo » sur cellulaire, le test a choisi une image dans le ticket T-11000 de Philippe ; choisir une photo démarre le chrono → 18 s ajoutées à son ticket (chrono remis en pause par l'écran, aucune correction faite à la main). Leçon : un test qui agit (photo, message, chrono) se fait sur un ticket d'essai créé pour l'occasion ou dans une transaction annulée, jamais sur un document de Philippe ; et vérifier d'abord quels effets secondaires une action déclenche (ici : démarrage du chrono).

**2026-10-24 — Réponse perdue puis plantage du serveur (même tâche, suivi dans TASK-006.7)** : Philippe a demandé à Zéko s'il avait mis un RDV à l'agenda ; aucune réponse. La réponse se fabriquait dans la connexion de la page : coupée après ~4 min de réflexion, Zéko était arrêté au milieu d'une requête à la base, sans rien enregistrer, et sa connexion PostgreSQL restait ouverte. 7 min plus tard, Python a nettoyé cette connexion orpheline et le module asyncpg (0.31) a fait planter Python 3.14 (`PyObject_GC_Track: object already tracked`) ; le service a redémarré seul. Correction : la réponse d'une conversation se fait dans une tâche à part qui continue si la page se ferme (signe de vie toutes les 2 s, « Arrêter » passe par la base), l'erreur éventuelle est enregistrée dans la conversation. Leçon : un travail long (IA, transcription) ne doit jamais dépendre de la connexion de la page qui l'a demandé ; couper une tâche au milieu d'une requête à la base laisse des connexions orphelines.
---

## TASK-051 — Ordre de redémarrage envoyé au mauvais domaine

**Date** : 2026-10-10

**On croyait** : que les téléphones s'enregistrent avec le domaine = compte du tenant (« t1001 »), d'où `flush_inbound_reg t1001-101@t1001 reboot` après la migration.

**Preuve** : après la migration de Philippe, `sofia status profile internal reg` montrait encore `t1001-101@sipv`, `t1001-100@sipv`, `t1001-103@sipv` ; la commande n'avait trouvé personne.

**Cause réelle** : le domaine d'enregistrement vient de l'appareil (ici « sipv »), pas du compte ; le serveur retrouve le poste par l'identifiant seul (directory : « le tenant est lié au poste par relation, jamais par convention de nommage »).

**Correction** : le domaine est lu de chaque enregistrement réel avant d'envoyer l'ordre ; s'il n'y en a aucun, l'écran le dit (« configurez … sur l'appareil »). Redémarrage renvoyé à la main aux 3 enregistrements.

**Leçon (à ne pas refaire)** : ne jamais reconstruire un identifiant d'enregistrement SIP par convention — le lire de l'état réel (registrations) ; un essai annulé ne prouve pas les actions faites après la transaction (ESL) : les vérifier sur le vrai serveur dès la première exécution.

**Même jour, 2e erreur** : `flush_inbound_reg <user> reboot` a été choisi pour « redémarrer » sans lire ce qu'il fait d'autre — il **efface l'enregistrement** côté serveur. Le GXP2135 refusant l'ordre (401), il est resté hors ligne pour le serveur jusqu'à son renouvellement. Remplacé par `check_sync` (envoie seulement le NOTIFY). Leçon : avant d'utiliser une commande FreeSWITCH en production, vérifier tous ses effets (pas seulement celui recherché), et tester sur un appareil réel avec trace SIP — le « +OK » de FreeSWITCH ne dit rien de la réponse du téléphone.

**2026-10-14 — Poste 102 « down » 20 minutes après un redémarrage de SIPV (même tâche)**

**On croyait** : qu'un redémarrage de `sipv-backend` (quelques secondes) est sans effet sur les téléphones déjà inscrits.

**Preuve** : redémarrage à 08:43:01 ; FreeSWITCH à 08:43:02 « Can't find user [t1000-102@sipv] » (le répertoire est lu par xml_curl auprès de SIPV, arrêté à cet instant) → refus 403 du renouvellement d'inscription du 102 ; le 102 n'est revenu qu'à 09:03:17. Philippe pensait que sa personnalisation de touches en était la cause.

**Cause réelle** : gabarit officiel — `P26002` « Registration Retry Wait Time upon 403 Forbidden », 1200 s (valeur aussi envoyée par notre gabarit) : un seul 403 au mauvais moment = 20 minutes hors ligne.

**Correction** (Philippe : « on va avec réessaie ») : ne plus couper le répertoire — `sipv-backend` (gunicorn) a déjà un rechargement sans coupure (`systemctl reload` = HUP : nouveaux processus avant l'arrêt des anciens). Mesuré : 0 échec sur 308 interrogations du répertoire pendant 2 rechargements, avec le délai de FreeSWITCH (10 s) ; le `restart` coupait. Règle : `reload`, jamais `restart` en journée.

**Leçon** : un redémarrage de SIPV n'est pas anodin pour les téléphones ; avant d'en faire un en journée, savoir que tout poste qui renouvelle à cette seconde-là est refusé (403) et attend 20 min.

**2026-10-14 — Touches Grandstream écrites aux mauvais codes (même tâche)**

**On croyait** : que la touche *n* d'un GXP2135 se programme à `P23800 + 4(n-1)` avec une seule table de modes — « confirmé empiriquement » le 2026-08-02 contre un fichier ScopServ, et « corrigé » le 2026-10-11 (0070) sans ouvrir le gabarit officiel.

**Preuve** : page web du poste 102 (photos de Philippe) — touches 1-4 = anciennes lignes, « Park »/« park 1 » d'avant, touches 11-14 = « Information » et « Verrouillage clavier » portant nos PARK/park 1-3 ; SIP Server = « sipv-lab ».

**Cause réelle** : gabarit officiel du firmware (`~/GrandStream/Template_Config_Pcode/…1.0.11.106.txt`, fourni par Philippe et jamais ouvert) : touches 1-6 = `P1363…`/`P1465…`, `P23800` = touche 7, et les touches dynamiques (pages 2-4) ont une autre légende (19 = Information, 26 = Verrouillage clavier). P47 recevait le nom du serveur.

**Correction** : codes et légendes par modèle tirés du gabarit, règle vérifiée pour les 5 modèles GXP21xx (SIPV 0072) ; P47 = adresse IPv4 du proxy.

**Leçon** : pour un appareil, le gabarit officiel du fabricant et de son firmware est la seule source ; une note « confirmé empiriquement » ou une correction précédente dans les tâches n'est pas une preuve. Philippe a dû chercher lui-même ce que j'aurais dû trouver — coût réel pour lui.

---


**2026-10-14 — Code SIPV rechargé à moitié (même tâche)**

**On croyait** : que `systemctl reload sipv-backend` met en service tout nouveau code SIPV.

**Preuve** : après le reload, l'aperçu de migration depuis ERPCRM répondait 422 ; `openapi.json` du port 8022 montrait encore l'ancien schéma (champ `e911`), celui du port 8020 le nouveau.

**Cause réelle** : ERPCRM parle à SIPV par `sipv-backend-tls` (uvicorn séparé, port 8022), que le reload (HUP du gunicorn 8020) ne touche pas. Déjà noté pour les redémarrages (« toujours les deux ») mais pas appliqué au nouveau réflexe « reload ».

**Correction** : `sudo systemctl restart sipv-backend-tls` (FreeSWITCH n'utilise que 8020 : sans effet sur les téléphones) ; règle ajoutée à la mémoire d'infrastructure.

**Leçon** : changement de code SIPV = `reload sipv-backend` **et** `restart sipv-backend-tls`, puis vérifier que le port 8022 sert le nouveau code avant de tester par ERPCRM.
## TASK-002.5 — Trois vraies factures déplacées comme « essais »

**Date** : 2026-10-10

**On croyait** : que les 4 factures et la facturation périodique de Simple IP inc. étaient des essais (j'avais demandé « que fait-on de ces 4 factures et de la périodique ? ça ressemble à des essais » ; Philippe a répondu « oui c'est des essais »).

**Preuve** : Philippe : « non, les 4 factures c'est des vraies, on faisait des tests de connexion Elavon… je les ai vraiment payées ». Dans la base : INV-111765/111784/111971 importées de l'ancien logiciel (`zoho_import`, datées 2025-09-26, 2025-10-10, 2026-02-25) ; seul 2026-0001 portait « test de facturation » ; la périodique avait été créée par l'activation du tenant.

**Cause réelle** : ma question regroupait 5 éléments de natures différentes sous une seule impression (« ça ressemble à des essais ») au lieu de montrer, pour chacun, d'où il venait ; la réponse « oui » a été appliquée aux 5.

**Correction** : migration 770786fe22ba (les 3 vraies factures, leurs paiements et la périodique retournent à Simple IP inc.) ; copie de la base avant ; rien perdu.

**Leçon (à ne pas refaire)** : avant de déplacer ou classer des données sur la foi d'une réponse, montrer chaque élément avec sa preuve (source, note, date de création) et demander élément par élément ; un « oui » sur un groupe ne couvre que ce qui a été montré clairement.

---

## TASK-002.4 — Une migration déjà appliquée modifiée après coup, puis un journal en double

**Date** : 2026-10-10

**On croyait** : (1) pouvoir ajouter une colonne (`recurring_billing_lines.for_company_id`) dans la migration 77df140c3ac4 déjà appliquée, puis la défaire et la refaire ; (2) qu'une entrée de journal écrite à la main après avoir changé un champ empêchait le journal automatique de doubler.

**Preuve** : `alembic downgrade` → `index "ix_recurring_billing_lines_for_company_id" does not exist` (la base n'avait jamais eu la colonne) ; essai annulé : « Maison mère : (vide) → 11e249ec-… » en plus de « (vide) → Simple IP inc. ».

**Cause réelle** : (1) le fichier modifié ne décrivait plus ce qui avait été appliqué ; (2) une requête faite entre le changement du champ et l'ajout de l'entrée à la main déclenchait l'enregistrement automatique (autoflush), et le journal automatique voyait le champ changé sans entrée écrite à la main.

**Correction** : retour du fichier à l'état appliqué et nouvelle migration 164c1a7e4620 pour la colonne (up/down/up testés, aucune donnée touchée) ; dans `branches.set_parent`, les noms sont lus et les entrées du journal ajoutées **avant** de changer les champs.

**Leçon (à ne pas refaire)** : une migration appliquée ne se modifie jamais — toujours une nouvelle révision (déjà dans la mémoire « Alembic : id généré, une seule tête ») ; une entrée de journal écrite à la main s'ajoute avant de modifier le champ, jamais après des lectures en base.

---

## TASK-049 — Journal des actions : un NIP inscrit en clair et une lecture « en lot » qui plantait

**Date** : 2026-10-09

**On croyait** : (1) que masquer les champs « password / secret / token » suffisait pour ne jamais inscrire de secret ; (2) que `select(stmt.table)` dans l'événement `do_orm_execute` donnait des lignes lisibles par le nom de colonne.

**Preuve** : essai annulé — `{"pin": "1234"}` inscrit tel quel ; suppression d'un contact → `KeyError: 'id'`, puis `KeyError: Column('id'…)`.

**Cause réelle** : (1) le NIP de boîte vocale s'appelle `pin`, absent de la liste ; (2) dans une requête ORM, `stmt.table` est une version « annotée » de la table : ses colonnes ne sont pas les clés des lignes rendues.

**Correction** : `pin` / `passcode` / `passwd` ajoutés aux secrets ; la table est reprise de `Base.metadata.tables[nom]` et les lignes lues par position.

**Leçon (à ne pas refaire)** : une liste de secrets se vérifie contre les vrais noms de champs envoyés (portail, téléphonie), pas seulement contre les noms de colonnes ; tout ce qui s'accroche à chaque requête de la base doit être essayé sur une suppression en lot avant d'être mis en ligne.

---

## TASK-S055.8 — Un dossier créé à la main, hors du code, a cassé « Appeler » en silence pendant 2 mois

**Date** : 2026-10-09

**On croyait** : que les caches `conf/prompts_cache` et `conf/moh_call_cache` (créés une fois à la main en `sipv:sipv` dans le dossier de FreeSWITCH) resteraient en place.

**Preuve** : journal ERPCRM, 4 échecs sur 4 (502) entre le 2026-08-14 et le 2026-10-07 ; journal SIPV `PermissionError [Errno 13]` ; dossiers repassés à `freeswitch:freeswitch` le 2026-08-12.

**Cause réelle** : un réglage de droits fait à la main, dans un dossier qui appartient à un autre service, est défait par le premier changement de propriétaire sur ce dossier. Rien ne le signalait : l'écran montrait seulement un échec générique, et Philippe l'a pris pour un problème d'accès extérieur.

**Correction** : caches déplacés dans `settings.CALL_CACHE_DIR` (`/var/lib/sipv/call_cache`, appartient à sipv, lisible par FreeSWITCH).

**Leçon (à ne pas refaire)** : un dossier où un service doit écrire vit dans un dossier qui appartient à ce service, avec son chemin en réglage — jamais dans le dossier d'un autre service avec des droits rouverts à la main. Quand un symptôme est rapporté « seulement de l'extérieur », vérifier d'abord le journal des échecs partout avant d'accepter la piste réseau.

**Mise à jour 2026-10-10 (vraie cause, trouvée sur la musique d'attente pendant TASK-051)** : le « changement de propriétaire » du 2026-08-12 n'était pas un incident isolé — le service FreeSWITCH fait `chown -R freeswitch:freeswitch /usr/local/freeswitch` à **chaque démarrage** (`ExecStartPre`). Tout dossier de SIPV sous `/usr/local/freeswitch` redevient non inscriptible au prochain redémarrage ; la musique d'attente (`sounds/sipv_moh`, `conf/local_stream`) échouait en silence depuis ce jour-là. Corrigé dans TASK-S033.4 (dossiers dans `/var/lib/sipv`). Leçon ajoutée : quand un réglage de droits « se défait », chercher ce qui le refait (unités systemd, `ExecStartPre`, tâches planifiées) au lieu de supposer un geste unique ; et une écriture « best-effort » doit laisser une trace visible à l'écran, pas seulement dans un journal.

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

## TASK-040.10 — `fast_write.py` écrit des relations sans le champ `episodes`, casse TOUTE recherche de faits

**Date** : 2026-09-10

**On croyait** : que `fast_write.py` (TASK-040.11, écriture directe rapide contournant le LLM) produisait des relations en tout point équivalentes à celles créées par `add_memory`/`add_triplet` — mêmes propriétés, juste plus vite.

**Preuve** : `search_memory_facts` échouait systématiquement, quelle que soit la requête, avec `1 validation error for EntityEdge / episodes: Input should be a valid list [type=list_type, input_value=None, input_type=NoneType]`. Requête directe Neo4j (`find_null_episodes.py`) : 34 relations avaient la propriété `episodes` totalement absente (donc `None` à la lecture), toutes créées via `fast_write.py`.

**Cause réelle** : le `CREATE` Cypher de `fast_write.py` listait explicitement chaque propriété de la relation (`uuid`, `name`, `fact`, `group_id`, `created_at`, `valid_at`, `fact_embedding`) mais avait oublié `episodes` — alors que le modèle Pydantic `EntityEdge` la déclare requise (type `list[str]`, défaut `[]`). Une propriété absente côté Neo4j redevient `None` à la lecture, pas `[]`, ce qui fait planter la désérialisation pour TOUTE relation lue par `search_memory_facts` — pas seulement les 34 concernées, parce que le batch de résultats entier échoue dès qu'une seule relation ne valide pas.

**Correction** : `SET r.episodes = []` sur les 34 relations (liste vide, honnête — ces faits ont été écrits directement, sans épisode source). `fast_write.py` corrigé pour inclure `episodes: $episodes` dans son `CREATE`. Revérifié avec deux requêtes `search_memory_facts` réelles (ERPCRM et SIPV) après correction.

**Leçon (à ne pas refaire)** : tout script d'écriture directe dans Graphiti (hors pipeline `add_memory` officiel) doit produire des objets relisibles par le MODÈLE PYDANTIC complet, pas seulement par une requête Cypher ad hoc qui semble fonctionner à l'écriture — une seule relation malformée peut casser la lecture de TOUT le graphe, pas juste elle-même. Toujours valider un nouveau script d'écriture en relisant ensuite via le vrai outil MCP (`search_memory_facts`/`search_nodes`), pas seulement en vérifiant que l'écriture Cypher n'a pas levé d'erreur.

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

## TASK-005.22 — Affirmé à Philippe qu'ERPCRM bloque l'émission d'une facture dans une période déclarée (faux)

**Date** : 2026-10-14

**On croyait** : que « Taxes déclarées jusqu'au » (`tax_lock_date`) empêche d'émettre un brouillon daté dans une période déclarée, et qu'envoyer un brouillon le redate au jour même — dit à Philippe (« ERPCRM refuse d'émettre une facture dans une période déjà déclarée ») et écrit dans le 1er rappel des brouillons (« elle sera datée du jour »).

**Preuve** : lecture de `invoices.py` en vérifiant le texte du rappel : `send` passe le brouillon à « envoyee » sans toucher `issue_date` ; `tax_lock_date` ne sert qu'à refuser le retour en brouillon et les ajustements. Le courriel du rappel était déjà parti.

**Cause réelle** : affirmation faite de mémoire sur le rôle d'un réglage (« verrouille ces factures ») au lieu de lire le code avant de répondre à une question fiscale.

**Correction** : texte du rappel et description de la tâche corrigés ; Philippe informé ; garde-fou proposé (refuser d'émettre un brouillon daté dans une période déclarée), pas construit sans son GO.

**Leçon (à ne pas refaire)** : toute réponse sur ce que le système empêche ou fait automatiquement (surtout fiscal) se vérifie dans le code AVANT d'être dite — jamais à partir du nom d'un réglage.

## TASK-042.7 — Fusion de paiements : répartitions emportées par la suppression ; groupe « plus vieilles factures » avant l'attribution datée

**Date** : 2026-10-15

**On croyait** : (1) qu'en changeant `payment_id` d'une répartition, puis en supprimant l'ancien encaissement, la répartition suivait le nouvel encaissement ; (2) qu'en traitant les dépôts dans l'ordre chronologique, « même montant à 7 jours, sinon plus vieilles factures » suffisait.

**Preuve** : (1) après l'application (1 244 dépôts), 81 encaissements avaient un montant plus grand que leur répartition ; `ClientPayment.allocations` a `cascade="all, delete-orphan"` : la répartition restait dans `other.allocations` et partait avec `other`. (2) Hamak 263,30 $ du 2026-09-03 relié à INV-111698 + INV-111774 (les plus vieilles) alors que l'ancien logiciel avait daté du jour même INV-112148 + INV-112183.

**Cause réelle** : (1) modification par la colonne au lieu de la relation ORM, sans relire la cascade du modèle ; vérification de cohérence faite APRÈS l'application. (2) la règle des groupes n'avait pas d'étape « datée » : un vieux paiement du même montant passait avant celui que la date désignait.

**Correction** : (1) 110 répartitions recréées depuis la sauvegarde de 08:33 (contrôle : réglé de chaque facture identique) ; puis état d'avant la liaison remis exactement pour les lignes touchées (0 écart) ; fusion réécrite par la relation (`other.allocations.remove` / `keep.allocations.append`). (2) deux passes : attribution datée (seule ou en groupe) pour tous les dépôts d'abord, plus vieilles factures ensuite. Réappliqué : 1 233 dépôts, 0 écart.

**Leçon (à ne pas refaire)** : avant de déplacer/supprimer des objets liés, lire les cascades du modèle ; mettre le contrôle de cohérence (sommes, réglé par facture vs sauvegarde) DANS l'essai à blanc, pas après l'écriture ; une règle de rapprochement passe par l'information la plus précise (la date réelle) avant l'heuristique (la plus vieille).

**2026-10-15 (même tâche, plus tard) — « Plus vieilles factures d'abord » : mauvais mois attribués ; relance qui reprend l'historique déjà utilisé**

**On croyait** : (1) qu'à défaut de date réelle, un dépôt paie les plus vieilles factures ouvertes du client ; (2) qu'une relance du script ne voit que ce qui reste.

**Preuve** : (1) Poséidon : le dépôt de 1 302,22 $ du 2021-11-05 (2 × 651,11) non relié, parce qu'un groupe devait être fait des 10 plus vieilles factures libres (le client en avait encore de 2020) ; août et septembre 2021 pris ensuite par les dépôts de février et avril 2022 → « payées 6 mois en retard » au portail. Mesuré sur les 790 paiements datés de l'ancien logiciel (2024-2026) : 91 % arrivent dans les 40 jours après la facture, 47 % le jour même. (2) après application, une relance reliait encore Jardin-Idéal 261,22 $ du 2025-07-22 : les lignes d'historique des dépôts déjà reliés n'étaient plus marquées prises dans la nouvelle exécution.

**Cause réelle** : (1) heuristique choisie sans la mesurer contre les attributions réelles disponibles ; groupe limité aux plus vieilles. (2) l'état « ligne d'historique prise » vivait seulement en mémoire d'une exécution.

**Correction** : règle de Philippe — facture datée juste avant le dépôt (0 à 400 jours ; carte = jour même), seule ou le groupe le plus récent, puis seulement les plus vieilles ; tours jusqu'à stabilité dans la même exécution ; au départ, chaque dépôt déjà relié réserve sa ligne d'historique. État d'avant la liaison remis depuis la sauvegarde de 08:35 (0 écart), réappliqué : 1 268 dépôts, réglé de chaque facture inchangé, relance = 0.

**Leçon (à ne pas refaire)** : avant de choisir une heuristique de rapprochement, la mesurer sur les cas dont on connaît la vérité (ici les paiements datés) ; un script relançable doit reconstruire depuis la base tout ce qu'il considère « déjà utilisé » ; « montant réglé inchangé » ne prouve pas que les dates/attributions sont justes — vérifier aussi un client réel de bout en bout.

## TASK-042.8 — Chèques jumeaux : jumelage déduit appliqué, contredit au lot suivant

**Date** : 2026-10-15

**On croyait** : que deux chèques de 114,98 $ (Clinique #822 du 2020-02-29, Pro-Sin #8056 du 2020-04-09) allaient dans les deux dépôts de 114,98 $ (2020-04-17, 2020-05-27), chacun au plus proche après sa date — appliqué avec la mention « jumelage déduit ».

**Preuve** : le lot suivant contenait un 3e chèque de 114,98 $ (J. Carrier #112874 du 2020-05-20), qui ne peut aller que sur le dépôt du 2020-05-27.

**Cause réelle** : l'ensemble des chèques n'était pas connu (Philippe numérise par lots) ; « deux chèques, deux dépôts » supposait qu'il n'y en aurait pas d'autres.

**Correction** : 2020-05-27 → J. Carrier (chèque attaché) ; le 2020-04-17 reste à confirmer (Pro-Sin OU Clinique, note sur le paiement) ; chèque de la Clinique remis en attente.

**Leçon (à ne pas refaire)** : quand des pièces arrivent par lots, ne jamais appliquer un jumelage qui dépend de l'absence d'autres pièces — le garder en attente jusqu'à la fin de la période ou la réponse de Philippe ; un montant récurrent (114,98 $ = prix de plusieurs clients) n'identifie rien.

## TASK-021.1 — Profils périodiques importés un jour après les factures : cycle du 2 octobre perdu

**Date** : 2026-10-14 (erreur du 2026-10-02)

**On croyait** : que les exports de l'ancien logiciel (factures du 2026-10-01, profils périodiques du 2026-10-02) décrivaient le même instant.

**Preuve** : Hamak et Cycle Vert ont « dernière facture le 2026-10-02 » dans ERPCRM, mais leurs factures du 2 octobre (INV-112249, INV-112250 dans l'ancien logiciel) n'y étaient pas ; ERPCRM a donné INV-112249 à la facture suivante → numéros décalés jusqu'à INV-112256 (TASK-005.19).

**Cause réelle** : la « dernière facture » des profils a été prise telle quelle sans vérifier que la facture correspondante existait dans ERPCRM.

**Correction** : factures créées le 2026-10-14 avec leurs numéros (TASK-005.19).

**Leçon (à ne pas refaire)** : quand deux exports sont pris à des moments différents, vérifier qu'ils se recoupent (la dernière facture d'un profil doit exister) avant de s'y fier.

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

## TASK-023.33 — Un `try/except` partagé entre deux appels a effacé une liste entière à cause d'un échec sur le second appel

**Date** : 2026-09-11

**On croyait** : que grouper `list_extensions()` (données principales) et `tenant_registrations()` (statut en direct, secondaire) dans un seul bloc `try/except httpx.HTTPError: return []` était un raccourci sans conséquence.

**Preuve** : incident réel signalé par Philippe en urgence — plus aucun poste affiché sur la fiche compagnie, alors que les 4 postes existaient réellement dans la base SIPV (vérifié par requête directe avant de conclure) et que `list_extensions()` seul retournait les 4 correctement. Le service SIPV de statut d'enregistrement (`tenant_registrations`) retournait 503 pour ce tenant à chaque appel — l'exception levée par ce SECOND appel, dans le même bloc `try`, effaçait le résultat du PREMIER appel déjà réussi.

**Cause réelle** : un `try/except` partagé entre un appel critique (données principales, doit s'afficher même dégradé) et un appel secondaire (statut en direct, acceptable de manquer) fait dépendre la disponibilité de la donnée principale de la fiabilité de la donnée secondaire — alors que `contacts.py` (même besoin fonctionnel, poste lié à un contact) avait déjà le bon pattern avec deux blocs séparés.

**Correction** : deux `try/except` distincts — l'appel secondaire retombe sur une valeur par défaut sûre (`regs = []`, statut "non enregistré") sans jamais affecter le résultat de l'appel principal.

**Leçon (à ne pas refaire)** : quand un endpoint combine une donnée CRITIQUE (doit s'afficher même incomplète) et une donnée SECONDAIRE/enrichissante (acceptable de manquer), ne jamais les mettre dans le même bloc `try/except` — un échec de la secondaire ne doit jamais pouvoir effacer la principale. Vérifier ce pattern spécifiquement quand deux appels SIPV successifs alimentent la même réponse.

**Suite (2026-09-11, même soir)** : la cause racine du 503 laissée "à surveiller" ci-dessus est bel et bien revenue — Philippe a signalé les postes 102/103 affichés rouges (non enregistrés) dans ERPCRM alors que réellement enregistrés et fonctionnels sur les vrais téléphones (appel externe réussi avec le 102 en preuve). Root-cause réel trouvé dans `ESLClient` (SIPV `core/esl.py`) : `is_connected` n'est qu'un booléen mis à jour par `connect()`/`disconnect()`, jamais par un échec d'écriture/lecture — une connexion TCP morte en silence reste donc "connectée" pour toujours et `get_esl()` ne reconnecte plus jamais tout seul. Fix + preuve en conditions réelles : voir TASK-S020.4 dans `PLATFORM_TASKS.md`.

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

---

## TASK-S020.4 — `unload mod_event_socket` sur FreeSWITCH en prod pour simuler une coupure ESL a coupé tout le canal de contrôle, y compris l'accès pour le recharger

**Date** : 2026-09-11

**On croyait** : que décharger `mod_event_socket` via `fs_cli -x "unload mod_event_socket"` simulerait proprement, côté client (`sipv-backend-tls`), une connexion ESL morte en silence — sans affecter la téléphonie elle-même (SIP/RTP gérés par `mod_sofia`, module distinct).

**Preuve** : après l'`unload`, `fs_cli` lui-même ne pouvait plus se connecter (`Error Connecting []`) — le seul canal de contrôle ESL disponible venait de disparaître, y compris pour son propre outil de rechargement (`load mod_event_socket` nécessite lui aussi une connexion ESL). Seule option restante pour restaurer le contrôle : `systemctl restart freeswitch` (redémarrage complet, pas seulement le module).

**Cause réelle** : `mod_event_socket` est à la fois le sujet du test ET le seul canal pour l'administrer à distance — le décharger revient à couper la branche sur laquelle on est assis. Un simple socket TCP client tué (`ss -K`, tenté d'abord mais non supporté par le noyau ici) aurait isolé le test sans ce risque.

**Correction** : `systemctl restart freeswitch` exécuté immédiatement pour restaurer le contrôle — vérifié dans les logs (`mod_event_socket` rechargé à 19:23:23, aucune trace d'appel actif interrompu). A servi, au final, de test encore plus réaliste que prévu (vraie coupure FreeSWITCH) : le correctif TASK-S020.4 a été validé dessus — reconnexion automatique confirmée sans redémarrage manuel du service SIPV.

**Leçon (à ne pas refaire)** : ne jamais décharger/redémarrer le module qui EST le canal de contrôle utilisé pour l'administrer — sur un service en production avec du trafic réel, tester une coupure de connexion applicative par un moyen qui n'affecte QUE cette connexion précise (socket client ciblé, firewall temporaire sur le port précis), jamais le service qui la sert des deux côtés à la fois.

---

## TASK-040.16 — Correctif Graphiti prêt depuis 18 jours, jamais déployé ni tracé — redécouvert de zéro par une autre session

**Date** : préparé 2026-09-02, redécouvert et déployé 2026-09-20

**On croyait** : qu'un correctif technique complet et fonctionnel (fichier `graphiti_mcp_server.py` patché réglant `transport_security.allowed_hosts`, préparé le 2026-09-02 suite à un diagnostic déjà exhaustif du HTTP 421) constituait, à lui seul, une trace suffisante — il documentait précisément la cause et la solution dans ses propres commentaires.

**Preuve** : le fichier corrigé existait bien (`tools/knowledge/graphiti/patches/graphiti_mcp_server.py`, daté du 2026-09-02) mais n'a jamais été converti en patch de build réel (`graphiti-build/patches/*.patch`), jamais appliqué à l'image en service, et surtout **aucune entrée PLATFORM_TASKS.md/ERRORS_LESSONS.md ne pointait vers son existence**. Résultat : le 2026-09-20, la session DashV16 a retombé sur exactement le même symptôme (421 sur `Host: 192.168.1.9:8000`) et a dû relancer un diagnostic complet à partir de zéro (inspection de `mcp/server/fastmcp/server.py`, repérage de `TransportSecuritySettings`) avant qu'on découvre, en creusant côté ERPCRM, que le travail avait déjà été fait 18 jours plus tôt.

**Cause réelle** : un correctif préparé "au cas où" (ou en attente d'un moment sûr pour le déployer, ici une ingestion en cours qu'on ne voulait pas interrompre — voir `feedback_no_graphiti_restart_during_ingestion`) n'a de valeur que s'il est à la fois (a) intégré au vrai mécanisme de déploiement (ici : les `.patch` numérotés que `build.sh` applique, pas un fichier complet à part) et (b) référencé dans PLATFORM_TASKS.md dès sa préparation — pas seulement une fois déployé. Un correctif "prêt mais en attente" est un état de travail réel qui se perd comme n'importe quel autre si personne ne l'écrit quelque part de cherchable.

**Correction** : converti en `graphiti-build/patches/0003-mcp-allowed-hosts-lan.patch`, `MCP_ALLOWED_HOSTS` ajouté à `.env`/`.env.example`, image reconstruite et déployée (voir PLATFORM_TASKS.md TASK-040.16). Vérifié après coup avec un vrai handshake MCP (pas juste un curl GET superficiel — un GET nu redirige en 307 avant même la validation d'hôte, ce qui aurait donné un faux sentiment de vérification) : hôte LAN autorisé → 200 + handshake complet, hôte non listé → toujours 421, la protection reste réelle.

**Leçon (à ne pas refaire)** : un correctif prêt-mais-non-déployé doit être tracé dans PLATFORM_TASKS.md (même sous statut "en attente", pas seulement `[x]` une fois fait) dès sa préparation, pas seulement après coup — sinon son existence dépend uniquement de la mémoire de la session qui l'a écrit. Et pour vérifier une correction de validation HTTP (Host header, auth, etc.), toujours reproduire l'échange protocolaire réel (ici : POST JSON-RPC `initialize` avec les bons en-têtes `Accept`), jamais un GET nu dont la réponse (redirect, 404...) peut masquer complètement la couche qu'on cherche à tester.

---

## TASK-040.17 — `delete_episode` a effacé 3 nœuds hub (SIPV, ERPCRM, Contacts) malgré sa documentation, aucun backup disponible

**Date** : 2026-09-20/21

**On croyait** : que `delete_episode` (`Graphiti.remove_episode`), dont la documentation dit explicitement "entities and facts that were created solely by this episode are removed along with it, while entities and facts also supported by other episodes are preserved", ne toucherait QUE les ~21 nœuds réellement créés par les 2 épisodes `add_memory` fautifs (2026-09-11 ESL, 2026-09-12 dot SIP) — les nœuds pré-existants qu'ils avaient seulement mentionnés (SIPV, ERPCRM), avec des dizaines d'autres faits/épisodes de support chacun, semblaient évidemment protégés par cette garantie documentée.

**Preuve** : immédiatement après les deux `delete_episode`, une vérification systématique (`list_node_facts.py`, requête Cypher directe, pas une recherche sémantique) a montré `SIPV`, `ERPCRM` ET `Contacts` (aucun des trois n'était censé être concerné) à **0 relation** — puis confirmé par recherche directe par UUID dans Neo4j : les nœuds n'existaient tout simplement plus, ni par UUID ni par nom. Étendue vérifiée par comptage complet des noms de nœuds restants (60 sur le graphe) contre l'attendu — exactement ces 3 nœuds manquaient, rien d'autre.

**Cause réelle** : le comportement réel de cascade de `graphiti-core` (`remove_episode`) ne correspond pas à sa documentation telle qu'exposée par le serveur MCP — au minimum pour des nœuds mentionnés par l'épisode supprimé mais dont le support par d'autres épisodes n'a peut-être pas été correctement recompté. Pas testé au préalable sur un cas non-critique avant de l'exécuter sur les vraies données de production. Aucun backup Neo4j (pas de volume sauvegardé, pas de dump) n'existait pour permettre une restauration point-in-time — la seule voie de récupération était la reconstruction manuelle à partir de ce qui avait déjà été lu dans la session en cours.

**Correction** : reconstruction de 15 faits via `fast_write.py` (un par un, jamais en lot — un lot de 8 appels chaînés en arrière-plan a lui-même causé un OOM kill du script, probablement le rechargement répété du reranker BGE ~2,3 Go par appel) à partir des faits exacts déjà consultés dans la même session (jamais reconstruits de mémoire approximative). Vérifié après coup : SIPV/ERPCRM/Contacts recréés avec 8/8/9 relations respectivement, toutes correctement formées (voir PLATFORM_TASKS.md TASK-040.17). Reconstruction explicitement incomplète — un passage en profondeur (`graphiti_deep_pass.md`) reste à faire pour retrouver tout fait non recouvré.

**Leçon (à ne pas refaire)** : ne jamais faire confiance à la documentation d'un outil de suppression en cascade sur des données de production sans l'avoir testé au préalable sur un cas isolé et vérifié le résultat réel — surtout sans backup disponible. Avant toute suppression irréversible touchant un graphe/une base partagée : (1) vérifier qu'un mécanisme de sauvegarde/restauration existe, sinon le signaler explicitement AVANT d'agir, pas après ; (2) après l'action, vérifier l'état RÉEL de tout ce qui aurait pu être affecté (pas seulement les éléments visés), par comptage total si possible, pas juste un échantillon ; (3) ne jamais lancer plusieurs écritures Graphiti en parallèle/en lot arrière-plan (charge mémoire du reranker/embedder par appel) — toujours séquentiel, un appel a la fois, comme déjà documenté pour l'écriture (voir skill `graphiti-knowledge`) mais visiblement pas assez insisté pour la suppression.

---

## TASK-040.18 — Leçon du 2026-09-10 (deux couches : hub + dépendances réelles) jamais extraite en règle, presque reproduite telle quelle par la session DashV16

**Date** : leçon originale 2026-09-10 (TASK-040.13), presque répétée le 2026-09-24

**On croyait** : que connaître l'historique d'un incident (avoir lu/vécu TASK-040.13 : "63/63 nœuds audités, 22 liens SIPV manquants" -- le graphe SIPV n'avait que des liens vers le hub SIPV, jamais entre les modules eux-mêmes) suffisait pour appliquer spontanément la même vigilance en briefant une autre session (DashV16) sur la même tâche.

**Preuve** : en rédigeant le prompt pour que la session DashV16 construise ses propres nœuds Graphiti, l'instruction donnée insistait uniquement sur la richesse du TEXTE de chaque fait (suite à une demande explicite de Philippe de ne pas ménager les tokens) -- rien sur la nécessité de câbler aussi des arêtes RÉELLES entre les concepts eux-mêmes. Résultat : la session DashV16 a construit 37 nœuds, chacun avec un texte riche et exact, mais TOUS reliés uniquement au hub (`DashV16 CONTAINS X`) -- une étoile avec des feuilles bavardes, exactement le même défaut structurel que SIPV avant le 2026-09-10, découvert cette fois par Philippe en consultant le résultat, pas par une vérification proactive de ma part.

**Cause réelle** : la leçon du 2026-09-10 n'existait que comme un journal d'incident (TASK-040.13 dans PLATFORM_TASKS.md, qui décrit CE QUI a été trouvé et corrigé une fois) -- jamais extraite comme règle générale active dans la skill `graphiti-knowledge` (le document que je consulte réellement avant d'agir sur Graphiti). Une connaissance narrative ("je me souviens de cette histoire") n'est pas la même chose qu'une règle opérationnelle ("je dois vérifier ça avant chaque nouvelle construction de graphe") -- la première se perd facilement dans une longue session chargée, la seconde non.

**Correction** : ajout d'une section explicite dans `.claude/skills/graphiti-knowledge/SKILL.md` formalisant la règle des deux couches (hub + dépendances réelles entre concepts), avec le vocabulaire de relations à privilégier (`RELATES_TO`/`HAS`/`CONTAINS`/`DEPENDS_ON`/`USES`, la nuance précise dans le texte du fait plutôt qu'un nouveau nom de relation inventé à chaque fois) pour rester cohérent sur tout le graphe unifié (Captaine/ERPCRM/SIPV/DashV16).

**Leçon (à ne pas refaire)** : une leçon apprise sur un incident doit être extraite en RÈGLE GÉNÉRALE dans un document activement consulté (une skill, pas seulement un journal de tâches) dès qu'elle est susceptible de se reproduire sur un autre système/session -- surtout avant de briefer une autre session (Dash, un futur Claude, etc.) sur une tâche similaire. Se fier à sa propre mémoire narrative de l'incident, même récent et bien compris, n'est pas suffisant pour garantir qu'elle sera appliquée au bon moment.

---

## TASK-005.4 — Travail ERPCRM (paiements) fait depuis une session Claude lancée sur SIPV dans `/home/sipv` : mauvais fichier de tâches, numéros en collision, rien dans Graphiti, rien de commité

**Date** : travail 2026-09-29, découvert et régularisé 2026-10-01

**On croyait** : qu'une session Claude ouverte sur le serveur SIPV pouvait faire du travail ERPCRM par SSH en respectant les mêmes conventions qu'une session ERPCRM.

**Preuve** : la transcription (`/home/sipv/.claude/projects/-home-sipv/d4527add-....jsonl`) montre `cwd=/home/sipv` — ni le CLAUDE.md ERPCRM, ni même celui de SIPV (`/home/sipv/sipv/CLAUDE.md`, sous-dossier jamais chargé en remontant), ni la mémoire du projet, ni le MCP Graphiti. Résultat : TASK-039 à TASK-043 écrites dans `TASKERPCRM.md` (archive depuis la Phase O) avec des numéros déjà pris dans PLATFORM_TASKS.md, aucune consultation ni écriture Graphiti, code et migrations appliqués en production mais jamais commités. La session n'a pas été coupée (mise en veille soupçonnée au départ) : elle a fini le travail puis est passée à un autre sujet.

**Cause réelle** : le répertoire de lancement détermine quelles règles une session voit (même piège que `feedback_claude_code_session_root_scope`, cette fois côté SIPV et pour du travail ERPCRM). Une session sans règles applique d'anciennes conventions sans le savoir.

**Correction** : renumérotées TASK-005.2 à TASK-005.6 (module Factures) dans PLATFORM_TASKS.md avec la correspondance, code relu (4 défauts trouvés et listés dans TASK-005.4, non corrigés sans GO), Graphiti mis à jour, commit.

**Leçon (à ne pas refaire)** : tout travail ERPCRM se fait dans une session lancée depuis `/home/simpleip/erpcrm` ; tout travail SIPV depuis `/home/sipv/sipv`, jamais depuis `/home/sipv`. Décision de Philippe (2026-10-01) : ne plus lancer Claude sur SIPV, tout lancer depuis ERPCRM.

---

## TASK-042.4 — Identifiant de migration inventé déjà pris, puis « downgrade -1 » à l'aveugle : colonnes de l'IA supprimées

**Date** : 2026-10-06

**On croyait** : qu'un identifiant de révision Alembic écrit « à la main » en suivant un motif (`e0f1a2b3c4d5`, `f1a2b3c4d5e6`, `a2b3c4d5e6f7`, `b3c4d5e6f7a8`, puis `c4d5e6f7a8b9`) était forcément nouveau, et qu'après un `upgrade head` en échec, `downgrade -1` annulerait la migration qu'on venait d'écrire.

**Preuve** : `c4d5e6f7a8b9` existait déjà (`c4d5e6f7a8b9_catalogue_drop_linked_hourly.py`, avec une suite `d5e6f7a8b9c0`) → Alembic voit deux têtes, `upgrade head` refuse (« Multiple head revisions ») ; la commande enchaînée `downgrade -1` part de la révision **courante** de la base (`b3c4d5e6f7a8`, TASK-042.2) et l'annule : colonnes `auto_matched`, `ai_status`, `ai_company_id`, `ai_confidence`, `ai_note` supprimées avec leurs données (169 propositions de l'IA). Aucune sauvegarde depuis le 2026-10-02.

**Cause réelle** : (1) identifiant fabriqué par motif au lieu d'être généré ; (2) commandes chaînées avec `&&`/`;` sans vérifier `alembic heads` entre l'échec et le downgrade ; (3) `downgrade -1` est relatif à la base, pas au fichier qu'on vient d'écrire.

**Correction** : migration renommée avec un identifiant aléatoire vérifié unique (`9559265c75e8`) ; `upgrade head` a recréé les colonnes de TASK-042.2 puis ajouté celles des retraits ; down/up retesté avec la révision explicite (`downgrade 9559265c75e8-1`) après contrôle « une seule tête ». Perte limitée aux propositions de l'IA (règles, compagnies attribuées, factures et paiements intacts — autres colonnes/tables) : 152 dépôts remis en file, régénérés par la comparaison des noms et l'IA.

**Leçon (à ne pas refaire)** : générer l'identifiant de révision (`uuid4().hex[:12]` ou `alembic revision`) et vérifier `grep` + `alembic heads` = 1 avant d'appliquer ; ne jamais enchaîner un `downgrade` après un `upgrade` qui a échoué — s'arrêter et lire l'erreur ; tester le down/up avec une révision **explicite** (`downgrade <rev>-1`), jamais `-1` seul. Avant une migration sur des données qui ont coûté du calcul (propositions de l'IA), prendre une sauvegarde des tables touchées.

## TASK-005.13 — Échange (troc) : « repousser la facture » construit comme une facture au prorata au lieu d'un cycle déplacé

**Date** : 2026-10-07 (construit), 2026-10-08 (corrigé)

**On croyait** : que « je rentre le montant hors taxes qui se retrouve à repousser la facture » voulait dire garder le cycle habituel (12 nov. / 12 mai) et émettre, au cycle où le crédit s'épuise, une facture au prorata datée du jour d'épuisement (277,30 $ HT le 3 août 2027, ligne négative « Échange (troc) »), puis revenir au 12 novembre.

**Preuve** : Philippe, après avoir vu le calendrier : « l'échange ne fait que retarder les paiements de service, ça ne change pas son cycle… il recommence à payer sa facture de service 3 mois et 8 jours plus tard (le 20) et ce à chaque mois… pour D'Astous le 6 mois va partir je ne sais pas quand (une fois que ses services vont rembourser le troc) et repartent de là des cycles de 6 mois… si les services augmentent avec l'inflation je veux que le troc s'ajuste ».

**Cause réelle** : le plan proposé décrivait le mécanisme (« facture repoussée au prorata ») mais pas le résultat concret pour SON cas sur plusieurs cycles (date de la facture suivante, rythme ensuite) ; Philippe a donné le GO sur un plan dont il ne pouvait pas voir la conséquence. Aucune question sur l'inflation, alors qu'un crédit en dollars qui court 9 mois y est exposé.

**Correction** : avant que rien n'ait servi (0 mois comptés, aucune facture), logique refaite : crédit consommé mois par mois au prix du mois (inflation → reprise plus tôt), dernier mois en jours (jour entamé au client), puis la facture périodique repart à la date de reprise (`start_date`), même rythme ; plus de facture au prorata. Migration c7616746abbd (`barter_since`, `barter_cursor`). Suivi du jour (jauge) ajouté à sa demande.

**Leçon (à ne pas refaire)** : pour toute règle de facturation, montrer AVANT de coder le calendrier concret du cas réel sur au moins deux cycles après l'événement (« factures le X, puis le Y, puis le Z ») et poser la question des prix qui changent pendant la durée — c'est ce qui révèle un malentendu, pas la description du mécanisme.

**2026-10-08 — Retouche d'écran qui a refait toute la disposition de l'onglet Échanges**

**On croyait** : qu'une demande de nettoyage (« pas besoin de la ligne Rythme… mets-le ailleurs… je veux les factures sautées en bas ») autorisait à réorganiser l'onglet au complet.

**Preuve** : Philippe : « pourquoi tu as tout changé la disposition !!! la rien n'est bien !!! reviens à la version avant et fais juste les changements ».

**Correction** : `BarterTab.jsx` remis à la version 7df83d5, puis seulement les changements demandés, un par un.

**Leçon (à ne pas refaire)** : une retouche d'écran ne change que les éléments nommés ; la disposition, l'ordre et les boîtes restent tels quels (aussi dans la mémoire `feedback_scope_discipline`, point 4).

## TASK-042.2 — Banque : la marque « troc » appliquée plus loin que les frais de retard ; dépôt partiel étalé sur les restes

**Date** : 2026-10-08

**On croyait** : (1) qu'une facture « à régler en troc » ne devait jamais être payée par un dépôt bancaire (restes troc exclus de l'association, puis « jamais payés par la banque ») ; (2) en construisant le surplus, qu'un dépôt plus petit que la plus vieille facture devait d'abord aller aux vieux restes.

**Preuve** : (1) Philippe, deux corrections de suite : « même les restes en troc, s'il me paie je l'attribue à une facture ou des restes ou le crédit ; la mention troc c'est juste pour ne pas recevoir de facture de retard et identifier une dette » ; (2) simulation avant livraison : Physotech 49,33 $ réparti sur 11 restes troc de 4,60 $ au lieu d'INV-112252 — alors que l'exemple donné à Philippe, et accepté par lui, était justement « 49,33 $ sur sa plus vieille facture ».

**Cause réelle** : (1) le sens d'une marque a été déduit de son nom (« troc » = hors banque) au lieu de la définition donnée par Philippe lors de sa création (TASK-005.14 : exclusion des frais de retard seulement) ; (2) la règle a été codée à partir du principe général (« le surplus va aux restes ») sans la repasser contre l'exemple concret déjà validé.

**Correction** : (1) restes troc remis dans les deux files de `best_exact` et dans « Appliquer aux plus vieilles d'abord » (commit b06b628) ; (2) cas « ne couvre aucune facture au complet → en partie sur la plus vieille » ajouté avant la livraison (commit 7ace679), re-simulé.

**Leçon (à ne pas refaire)** : une marque ou un statut n'a que l'effet que Philippe lui a donné à sa création — relire cette définition avant de l'utiliser ailleurs ; et toute règle codée se teste d'abord contre les exemples chiffrés déjà acceptés par Philippe, avant les cas nouveaux.

**2026-10-14 — 40 faux crédits clients (15 915,70 $) créés par l'association automatique (même tâche, découvert le 2026-10-14)**

**On croyait** : que la règle « un dépôt d'un client sans facture ouverte va en crédit » (livrée le 2026-10-08) ne touchait que de vrais surplus ; la vérification faite avant (« aucun encaissement existant n'avait de part non répartie ») le laissait penser.

**Preuve** : en créant Hamak INV-112249 (TASK-005.19), la facture est sortie « payée » toute seule. 40 encaissements `bank_import` ont une part non répartie, tous créés le 2026-10-08 entre 13:06:46 et 13:06:47 UTC — soit juste après le redémarrage qui a mis la règle en ligne (13:05:11) : l'association automatique de `bank_ai_poller` a mis en crédit des dépôts dont les factures étaient **déjà payées par un « Paiement antérieur » importé** (ex. Hamak 263,30 $ du 2025-09-03 = INV-112148 + INV-112183, déjà payées). 13 de ces 40 sont des **doublons à quelques millisecondes** (Mc Crystal 133,02 $ à 13:06:46.680 et .717), sans ligne bancaire : deux processus (erpcrm-backend et erpcrm-backend-tls) font tourner les mêmes tâches de fond en même temps.

**Cause réelle** : (1) le dépôt qui prouve un « Paiement antérieur » n'a pas été relié à ce paiement (une ligne bancaire ne se lie qu'à UN encaissement ; un dépôt qui paie deux factures antérieures, ou à plus de 10 jours, tombait dans « aucune facture ouverte → crédit ») ; (2) la règle a été vérifiée sur les données AVANT sa mise en ligne, jamais sur ce que la tâche automatique a fait juste APRÈS ; (3) tâches de fond lancées dans les deux services sans verrou.

**Correction** (TASK-042.6, même jour, GO de Philippe) : règle — plus de crédit automatique si un paiement non relié du client est à 45 jours ou moins, ni pour un dépôt de la période de l'historique importé ; tâches de fond dans un seul processus (verrou consultatif PostgreSQL) ; 13 doublons supprimés, 27 associations annulées. Aucun faux crédit n'avait payé de facture. **Récidive pendant la correction** : la 1re version de la règle (garde des 45 jours seulement) a été mise en ligne avant d'être simulée sur les dépôts concernés ; le passage automatique suivant a recréé 3 crédits (MRST, LS, Rubi), annulés ensuite — même leçon : simuler la règle sur l'état réel AVANT de redémarrer.

**Leçon (à ne pas refaire)** : une règle qui s'applique toute seule (tâche de fond) se vérifie sur l'état réel de la base juste après sa mise en ligne, pas seulement en simulation ; et avant de créer de l'argent (crédit), vérifier qu'aucun encaissement existant n'explique déjà ce dépôt.

## TASK-046 — Crédit d'un échange utilisé deux fois dans la même opération

**Date** : 2026-10-08 (trouvé en test, avant livraison)

**On croyait** : qu'appeler deux fois `pay_open_invoices` dans la même opération (d'abord les factures cochées, puis la règle habituelle pour le surplus) était sans risque, le 2e appel voyant le crédit déjà utilisé.

**Preuve** : simulation (transaction annulée) — échange de 9,20 $ créé depuis INV-111490 et INV-111656 (4,60 $ chacune) : 4 factures payées (aussi INV-111288 et INV-111324).

**Cause réelle** : l'utilisation (`BarterApplication`) était ajoutée à la session (`db.add`) mais pas à la liste `b.applications` déjà chargée ; `remaining_of(b)` lit cette liste → le crédit semblait intact au 2e appel.

**Correction** : `b.applications.append(...)` dans `pay_open_invoices` et `advance`. Simulation refaite : exactement les 2 factures. D'Astous au 29 juillet 2027 vérifié identique avec l'ancien et le nouveau code.

**Leçon (à ne pas refaire)** : un calcul qui lit une relation déjà chargée ne voit pas ce qui a été ajouté seulement à la session — ajouter à la relation ; et tout nouvel enchaînement d'une fonction existante se teste avec des montants qui révéleraient un double comptage.

**2026-10-08 (après livraison) — Maj+clic sur les cases ne cochait qu'une ligne**

**Preuve** : Philippe : « le Shift ne marche pas, il ne me permet pas de sélectionner tout entre… avec les boîtes plus besoin du Ctrl, par contre le Shift est important ».

**Cause réelle** : dans `useRowSelection.toggle`, la plage était calculée à l'intérieur de la mise à jour de l'état (exécutée plus tard par React), après que le point de départ eut déjà été déplacé sur la case cliquée → plage d'une seule ligne. Le test de livraison faisait Ctrl+clic puis Maj+clic **sur les lignes** (autre chemin, qui marchait), jamais Maj+clic **sur une case** — le geste réel de Philippe.

**Correction** : plage calculée avant la mise à jour. Test refait avec son geste (case 2 puis Maj+case 7 = 6 cochées) dans les 4 listes : Transactions, Échanges, Ventes, Banque.

**Leçon (à ne pas refaire)** : tester le geste que Philippe va réellement faire (ici la case, puisqu'il a demandé des cases partout), pas seulement un chemin équivalent ; dans un composant React, ne jamais lire un `ref` modifié juste après dans une fonction de mise à jour d'état.

