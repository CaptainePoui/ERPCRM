# ZÉKO — Cahier des charges fonctionnel et plan de réalisation

> Remis par Philippe le 2026-10-17 (rédigé avec ChatGPT et Gemini). Référence de TASK-006.5. Texte tel que reçu.


Intégration à ERPCRM / SIPV — Document de conception à remettre à Claude Code

Version : 1.0 — 17 octobre 2026
Statut : synthèse complète des décisions fonctionnelles prises avec le propriétaire de Simple IP; les éléments non tranchés sont explicitement signalés.
Règle de départ : ne pas réinventer ERPCRM. Auditer l'existant avant de modifier le code, préserver les fonctions opérationnelles et obtenir une validation avant une refonte risquée.

0. Mandat à Claude Code et méthode de travail

Tu travailles sur ERPCRM et SIPV, la plateforme de gestion et de téléphonie de Simple IP. Le propriétaire est technicien spécialisé en VoIP depuis environ 16 ans et connaît finement le comportement attendu des équipements et des interventions. Il souhaite une application simple, intuitive et adaptée au terrain, et ne veut ni formulaires contraignants ni systèmes parallèles.

L'objectif est de construire Zéko, l'assistant central d'ERPCRM/SIPV. Zéko est à la fois :

un assistant conversationnel pour les interventions techniques et les tickets;

un assistant pour les clients, capable de les guider simplement;

une interface autorisée vers les fonctions de configuration ERPCRM/SIPV;

un moteur de recherche et de capitalisation de la connaissance acquise;

un orchestrateur d'un modèle d'IA local et, si souhaité, de plusieurs IA externes (Gemini d'abord; autres ultérieurement).

Ce document est l'ensemble des exigences, pas une autorisation d'inventer des fonctionnalités. Quand un détail n'est pas décidé, expose une option et demande validation; ne le tranche pas silencieusement.

D'abord, phase d'audit sans modification :

Rechercher et lire le code pertinent : tickets, saisies de temps, chronos, entreprises, contacts, extensions, équipements/provisioning, groupes, privilèges, portail client, catalogue, facturation, notifications, configuration administrateur, agenda/calendriers et APIs SIPV.

Lire la documentation du projet, notamment docs/platform/PLATFORM_TASKS.md, en cherchant TASK-006.5, ainsi que les tâches connexes. La mention existante de Zéko et du ticket conversationnel peut être incomplète : le présent document la complète.

Identifier le framework, les routes, les modèles, la base de données, les services existants et leurs contrats. Ne pas supposer PostgreSQL, pgvector, Redis, une API téléphonique ou une méthode de provisionnement sans vérifier.

Examiner s'il existe déjà un serveur Ollama ou une IA locale, sa localisation et les ressources réelles disponibles. La carte RTX 3060 Ti 8 Go n'est pas encore installée dans le futur serveur. Il faut que la première version soit utilisable sans GPU.

Faire l'inventaire des possibilités réelles de lecture/gestion d'équipements Grandstream, d'intégration calendrier et de notifications.

Proposer ensuite un plan d'implantation progressif, avec fichiers/modules touchés, migrations, risques, tests et conditions de retour arrière. Présenter l'audit avant la première modification structurante.

Principes incontournables :

Une seule source officielle par donnée : entreprises, contacts, extensions, droits, catalogue, équipements, provisioning, tickets, factures, calendriers existants. Zéko appelle les services et contrôles existants; il ne crée pas un deuxième système de permissions ou de tickets.

L'IA n'est pas la source de vérité : la base ERPCRM/SIPV et les opérations vérifiées le sont.

Aucune action sensible sans les autorisations ERPCRM adéquates, quel que soit le modèle IA.

Les tickets et chronos fonctionnent même sans IA ni accès Internet.

Pas d'obligation de créer une fiche de temps pour pouvoir écrire une note ou enregistrer une conversation.

Ne pas casser les tickets ou configurations existants; concevoir leur migration/conservation.

1. Expérience générale de Zéko et placement dans l'interface

1.1 ERPCRM, accès partout

Zéko est accessible depuis toutes les pages d'ERPCRM par une commande persistante dans la barre supérieure, immédiatement à gauche du nom de l'utilisateur connecté (la barre existe déjà).

Un clic ouvre la conversation contextuelle de Zéko, sans obliger à quitter la page. Zéko sait dans quelle entreprise, quel contact, quel équipement ou quel écran autorisé se trouve l'utilisateur et n'a pas besoin qu'on lui répète ce contexte.

Ne pas multiplier inutilement les fenêtres de clavardage, assistants ou zones de notes. C'est toujours le même Zéko, avec la même mémoire et les mêmes permissions.

1.2 Ticket technicien

Lorsqu'un technicien travaille dans un ticket, la zone de texte du ticket est son espace de conversation avec Zéko. Elle remplace les étapes artificielles « note / saisie de temps / enregistrer ».

L'expérience ressemble à une conversation ChatGPT : texte libre, réponses, copier-coller, images/captures, historique conservé, navigation fluide. Aucun découpage administratif ne doit interrompre une intervention.

On peut dicter ou décrire les opérations naturellement (« je suis arrivé », « je commence à installer », « j'ai mis à jour le firmware », « retrouve-moi les postes », « j'ai fini »), puis reprendre plus tard dans le même ticket.

Messages, photos, interactions avec l'IA, événements importants et actions sont horodatés et conservés, avec auteur et provenance.

La conversation technique du technicien est interne; elle n'est pas affichée telle quelle au client.

1.3 Portail client

Hors ticket, Zéko est accessible depuis l'en-tête du portail, à côté du nom du client connecté.

Le client garde la liberté de naviguer et modifier les éléments autorisés par les menus normaux sans passer par l'IA.

Révision importante de la conception initiale : dans le parcours de création d'un ticket client, Zéko peut aussi intervenir comme assistant de prédiagnostic; ne pas interpréter « en-tête seulement » comme une interdiction d'aider lors de l'ouverture d'un ticket.

L'interface et les réponses client sont simples, courtes, pertinentes et non techniques par défaut. Un utilisateur peut demander des explications plus avancées, auquel cas Zéko augmente le niveau technique sans augmenter ses droits.

Après prise en charge par un technicien, le client consulte un compte rendu clair et peut demander des détails à Zéko, mais n'accède pas à la conversation technique privée.

2. Ticket = journal vivant de l'intervention, pas rapport d'avocat

2.1 Déroulement terrain

Scénario représentatif :

Le technicien arrive chez le client, ouvre le ticket et note ce qui a été discuté, y compris les demandes nouvelles. Zéko les rattache au ticket.

Il annonce « on a fait le tour; je vais installer le système et les téléphones ». Le chronomètre continue tandis qu'il travaille sans écrire.

Il peut revenir deux heures plus tard, décrire une salle de conférence, un réseau Wi-Fi, une tentative de sauvegarde, un firmware incompatible, une mise à jour, puis une restauration réussie. Tout est retenu dans l'ordre chronologique.

Il demande « donne-moi la liste des noms et numéros de poste » ou « donne-moi la liste des MAC associées aux postes ». Zéko consulte et restitue les données structurées enregistrées, au lieu de deviner de mémoire.

Il peut demander de l'aide au diagnostic et laisser Zéko consulter des sources internes/externes.

À la fin, Zéko produit un rapport client vulgarisé, avec les travaux réellement réalisés, les problèmes et solutions et les durées pertinentes. Le technicien peut corriger les faits ou classifications simplement en discutant.

2.2 Données d'équipements et photos

Coller une photo d'une étiquette de téléphone, HT801, UCM ou autre appareil directement dans la conversation.

Zéko tente d'extraire modèle, MAC, numéro de série (SN) et autres éléments utiles, puis rattache ces informations au dossier d'équipement existant dans ERPCRM (pas à une copie isolée dans la mémoire de l'IA).

Associer naturellement un appareil à une personne et un poste : « ce téléphone est celui de Nicole, poste 243; elle veut la réception sur sa deuxième touche ».

Conserver les photos originales de manière sécurisée, le résultat de l'extraction, les corrections éventuelles et la liaison à l'équipement et au ticket.

Si l'image est floue ou le numéro ambigu, demander confirmation, surtout avant une modification de configuration.

2.3 Compte rendu destiné au client

Zéko distingue ce qui est utile au client de ce qui est utile au technicien. Le client est souvent comptable, avocat, dentiste, réceptionniste, etc., pas spécialiste SIP.

Exemple : interne « défaut de transport UDP, migration contrôlée vers TLS »; externe « nous avons rétabli les communications avec les téléphones en ajustant leur mode de connexion, désormais plus sécurisé », si les faits le justifient.

Résumé lisible : problème initial, demande additionnelle, intervention, résolution ou prochaine étape, durée/facturation si applicable.

Zéko doit apprendre des corrections du propriétaire pour choisir les bonnes informations et la formulation; pas de sélection manuelle de chaque message à rendre visible.

Ne pas divulguer : secrets, configurations sensibles, conversations internes, informations d'autres entreprises ou de personnes non autorisées.

Le client peut demander à Zéko « donne-moi plus de détails » : répondre dans la limite de ses permissions et en adaptant la technicité.

Question restant à décider : résumé client visible progressivement pendant l'intervention, seulement à la clôture, ou les deux. Ne pas choisir implicitement.

3. Chronomètres, facturation et rappels : spécification critique

Le précédent système de tickets a été jugé contre-intuitif, car il séparait notes, « saisies de temps » et chronomètre; une correction a porté sur la durée d'une saisie plutôt que le temps total déjà accumulé. Cette confusion ne doit pas se reproduire.

3.1 Un chrono par ticket, mais plusieurs tickets simultanément

Le chrono global du ticket est visible, lisible et modifiable directement (notamment si le technicien a travaillé avant d'ouvrir le ticket, ou en cas de perte de connexion).

Les échanges ne créent pas automatiquement des formulaires de saisie de temps à remplir.

Plusieurs tickets du même technicien PEUVENT chronométrer en parallèle. Exemple : une mise à jour de firmware facturable s'exécute chez le client A pendant qu'il dépanne le client B.

Quand l'utilisateur démarre ou ouvre pour travailler un ticket B et qu'un ticket A est déjà actif, afficher une fenêtre explicite :

Un autre ticket est déjà actif : Txxxxx — [Client].
Que voulez-vous faire ?
[Mettre Txxxxx en pause et démarrer le nouveau] [Laisser Txxxxx tourner et démarrer le nouveau] [Annuler]

Si plusieurs chronos sont déjà actifs, indiquer clairement quels chronos le sont et permettre une décision cohérente sans arrêter les autres par surprise.

Si l'utilisateur laisse tourner A, A et B continuent, leurs périodes peuvent se chevaucher et sont conservées séparément, avec trace explicite de ces chevauchements.

Un simple changement d'onglet, une recherche ou la discussion avec Zéko ne doit jamais arrêter un ticket silencieusement.

Quand on revient à un ticket en pause, pouvoir reprendre facilement; si d'autres tournent, respecter le choix de les laisser actifs ou de les pauser. Ne pas inventer une politique « un seul chrono actif ».

Prévoir pause, reprise, ajustement manuel, et examiner la demande historique de remise à zéro / correction, en préservant l'historique d'audit.

3.2 Présence navigateur et future application

Pour l'instant : navigateur sur ordinateur. Le ticket doit rester actif tant que le navigateur assure la présence requise, y compris onglet en arrière-plan et ordinateur en cours de travail.

Si le navigateur se ferme et qu'aucune autre application connectée ne maintient la session de travail, le chrono doit se mettre en pause.

Plus tard, une application téléphone/tablette pourra maintenir le suivi si le navigateur est fermé (écran verrouillé si la plateforme et le mode de fonctionnement le permettent).

Distinguer autorisation d'afficher des notifications et véritable présence/activité : une simple autorisation de notification ne prouve pas que le technicien travaille.

La détection serveur d'une fermeture brutale ou d'une coupure réseau peut prendre du temps : utiliser des présences/heartbeats et consigner les périodes incertaines, sans inventer une heure exacte d'arrêt. Permettre correction ultérieure.

Les chronomètres sont gérés par ERPCRM côté serveur, jamais uniquement par JavaScript affiché dans l'onglet; robustesse à rechargement, panne temporaire, changement d'appareil et indisponibilité de l'IA.

3.3 Correction conversationnelle du temps

Exemple : « Zéko, le navigateur a fermé; j'ai continué 45 minutes. J'ai installé trois téléphones, puis configuré les BLF. »

Zéko reconnaît le ticket et la période visée, propose une correction et l'applique selon les droits du technicien.

Si la ventilation entre installation et configuration n'est pas connue, ne pas inventer « 30/15 » comme un fait. Demander une précision ou utiliser « à répartir », selon les règles validées.

Conserver la valeur avant/après, la justification, qui a corrigé et la date.

L'utilisateur doit pouvoir cliquer le temps total affiché dans l'en-tête du ticket et saisir une bonne durée; ne pas limiter la correction à une ligne de temps ajoutée.

3.4 Classification et articles du catalogue

Zéko comprend le type de travail décrit (installation physique, configuration, tests, dépannage, etc.) et propose la ventilation des périodes.

Associer les périodes aux articles réellement existants du catalogue ERPCRM, en utilisant descriptions et critères d'emploi existants. Ne pas créer de codes d'articles fictifs en production.

Une instruction « associe ce travail à l'article XXXX » corrige le ticket et permet, sur validation, d'enrichir durablement les règles de classification pour les cas similaires. La règle pointe vers l'article officiel du catalogue.

La facturation utilise les règles, prix et autorisations existants; elle ne se déduit pas du seul texte de l'IA. Distinguer temps chronométré, temps catégorisé et temps facturable.

La détection de chevauchements aide à expliquer le temps, sans interdire automatiquement deux durées facturables simultanées lorsque le technicien l'a volontairement permis.

3.5 Rappels de ticket actif

Dans https://portail.simpleip.tel/admin?tab=configuration, onglet Tickets, utiliser l'interface de configuration existante.

Paramètres envisagés :

rappel activé/désactivé;

intervalle en nombre libre de minutes, p. ex. 7, 17, 30, 90 — pas une liste imposée 15/30/45/60;

choix du son, volume;

notification visuelle activée/désactivée;

comportement des rappels en pause (réglable).

Exemple de notification : « Ticket Txxxxx — [Entreprise] — actif depuis X h Y ». Le rappel n'arrête pas le chrono.
Les limites des navigateurs concernant lecture automatique, onglets en arrière-plan et notifications devront être testées et indiquées honnêtement.

Point à valider pendant l'audit UI : conditions précises de démarrage automatique lors de l'ouverture d'un ticket de travail versus simple consultation d'un ticket existant. Des demandes antérieures mentionnaient le démarrage à l'ouverture, sans que cela justifie de déclencher un compteur à chaque consultation non facturable.

4. Parcours client : prédiagnostic pertinent et respect du temps des personnes

4.1 Choisir le mode de travail

Le client peut effectuer les changements autorisés lui-même par les menus, parler à Zéko dans l'en-tête, ou ouvrir un ticket par le parcours habituel.

Pendant la création d'un ticket, Zéko peut recueillir le problème et guider quelques essais appropriés avant transfert au technicien; ce n'est pas une obligation de supporter un interrogatoire IA.

L'utilisateur qui demande « je veux parler à une personne » doit pouvoir sortir immédiatement du parcours automatisé.

Non tranché : faut-il proposer explicitement « assistance Zéko / envoyer le ticket directement » à l'ouverture ou engager une aide légère immédiatement avec possibilité d'ignorer? À présenter au propriétaire avant figer l'interface.

4.2 Questions ancrées dans la vraie configuration, pas du dépannage générique

Zéko commence par consulter ce qu'ERPCRM sait déjà : entreprise, poste attribué, modèle, firmware si connu, provisioning, touches/pages prévues, historique et contraintes réseau.

Exemple GXP2170, boutons disparus :

Éviter la question inutile « Est-ce que vos boutons fonctionnaient avant ? », qui donne au client l'impression que l'installation est peu fiable.

Demander plutôt : « Parlez-vous des boutons de ligne à gauche ou des touches programmées à droite ? »; « Je vois que votre appareil devrait avoir plusieurs pages de touches : ont-elles toutes disparu ? »; « Depuis quand avez-vous remarqué cela ? »; « Y a-t-il eu une panne de courant récente ? ».

Distinguer toujours ce que le provisioning prévoit de ce que l'appareil affiche effectivement. Ne jamais annoncer « je vois sur votre écran que... » si aucune donnée directe ne le démontre.

Si Zéko peut interroger de manière autorisée l'appareil à distance, comparer ce qu'il retourne au provisioning et donner un diagnostic plus précis. Si non, dire clairement ce qui n'a pas été vérifié.

Guide de redémarrage ou de contrôle adapté au modèle et à la langue du téléphone, aux intitulés réels des menus et, si nécessaire, au firmware. Ne pas inventer de menu; exemples cités par le propriétaire : pavé directionnel, bouton central, menu « Restart / Redémarrer », confirmation à l'écran. La deuxième capture partagée illustrait le principe visuel et non le véritable écran de redémarrage.

4.3 Images d'aide

D'abord guider par écrit. Ne pas afficher automatiquement une photo au premier message.

Afficher une photo ou illustration si le client le demande, ne trouve pas le bouton, ou bloque sur une manipulation.

Bibliothèque centralisée d'images par modèle, façade, pavé directionnel, écran, touches, étiquette MAC/SN, ports, etc., que le propriétaire pourra enrichir avec ses propres images.

Ne montrer que des images compatibles avec le vrai modèle et l'étape. Prévoir un moyen de corriger des associations trompeuses.

4.4 IP locale, accès réseau, VLAN et escalade

Zéko cherche l'IP de l'appareil dans ERPCRM ou les sources déjà disponibles avant de demander au client de la chercher.

Sinon, lorsqu'il s'agit bien d'un modèle pour lequel c'est la procédure vérifiée, guider p. ex. « appuyez sur la flèche du haut pour lire l'adresse IP ».

Si un accès navigateur local à l'interface/API du téléphone est pertinent et permis, Zéko peut fournir un lien cliquable prérempli, ou demander au client de copier le résultat : ne jamais lui faire retaper une adresse déjà connue.

Valider faisabilité réelle : même LAN/VLAN, routage, authentification, HTTPS, navigateur, sécurité des endpoints, et restrictions d'accès; ne pas promettre que l'API du téléphone est consultable directement depuis n'importe quel navigateur.

Mémoire entreprise déterminante : si l'on a découvert que les téléphones sont sur un VLAN isolé des ordinateurs, noter cette topologie (avec date/source) au dossier. Ne pas recommencer au prochain ticket une procédure qui exige un accès réseau déjà connu comme impossible.

Dans ce cas, Zéko explique simplement : « Vos téléphones sont sur un réseau séparé de celui de votre ordinateur. Je vais demander à un technicien de contacter [responsable identifié] pour obtenir l'accès nécessaire. »

Si le client a du mal ou qu'une intervention humaine s'impose : « Un instant, je vérifie si votre technicien est disponible pour se connecter à votre ordinateur », puis vérification réelle des disponibilités et prise en charge. Ne pas prétendre qu'un technicien est libre sans preuve.

Si une manipulation simple résout le problème, créer/conserver un ticket documentant symptômes, essais, solution, résolution par le client avec Zéko, puis le fermer selon la procédure ERPCRM. Sinon, transférer le ticket avec tout le contexte au technicien.

4.5 Le client refuse de parler à une machine

Zéko respecte immédiatement cette demande.

Proposer le technicien habituel lié au client (aujourd'hui Philippe, mais architecture extensible à plusieurs techniciens) ou un autre disponible.

Consulter les agendas réels et proposer des plages libres, éventuellement le premier technicien disponible, en tenant compte du type/durée d'intervention et du déplacement si pertinent.

Éviter de dupliquer les calendriers; réutiliser les intégrations existantes ou préparer celle approuvée. Il reste à confirmer si Zéko créera lui-même l'événement Google Agenda, avec quel calendrier et quelles confirmations; la consultation et la proposition de créneaux sont demandées.

Conserver le lien entre demande, ticket, client et rendez-vous.

5. Configuration téléphonique par langage naturel et traçabilité

Zéko n'est pas seulement une IA de tickets. C'est une interface guidée vers les actions ERPCRM/SIPV, pour les utilisateurs autorisés.

5.1 Exemples attendus

Technicien : « Crée un poste chez D'Astou Auto, prends le prochain numéro libre, sans boîte vocale, c'est pour la sonnerie extérieure. »

Technicien : « Finalement utilise le poste 344. » → vérifier existence, collisions/règles d'attribution, dépendances, permissions, puis appliquer via le service officiel.

Client autorisé : « Change le nom du poste 243 de Nicole à Nathalie. »

Autres actions futures par les fonctions existantes : touches BLF, renvois, groupes, files, messages d'accueil, paramètres des postes, etc. Ne pas prétendre qu'une action est implémentée avant d'en exposer une fonction ERPCRM vérifiée.

5.2 Autorisations — système unique

Réutiliser les identités, rôles et droits existants ERPCRM. Aucun « compte Zéko » avec permissions parallèles.

Si le client n'a pas l'autorisation, Zéko refuse et lui indique le gestionnaire de téléphonie inscrit au dossier (« M. Pierre Pouliotte », nom fictif dans l'exemple), si ses droits permettent cette divulgation.

Expliquer des notions techniques avancées n'accorde aucune capacité supplémentaire.

Les fonctions de lecture ET surtout d'écriture refont leurs contrôles côté serveur, en tenant compte du tenant / entreprise; ne pas se fier à la réponse en langage naturel de l'IA.

Pour les actions à risque (p. ex. redirection de tous les appels, suppression d'un poste, interruption de service), proposer une confirmation explicite. Politique détaillée de confirmation par classe d'action à valider : elle n'a pas encore été arbitrée.

Pour les actions entraînant un risque de coupure ou de sécurité, afficher les effets et empêcher les commandes ambiguës.

5.3 Le ticket officiel d'une modification

Une opération autorisée réalisée par Zéko peut créer automatiquement un ticket ERPCRM ou utiliser le ticket pertinent déjà ouvert, sans générer des doublons inutiles.

L'opération est documentée : entreprise, demandeur réel, auteur d'exécution Zéko, poste/objet, état avant/après, date/heure, autorisation vérifiée, résultat, conversation de demande et erreur éventuelle.

Exemple de ticket « Poste 243 : Nicole → Nathalie », visible aux personnes autorisées; le client voit sa version vulgarisée.

Si l'action est réussie, le ticket peut être fermé suivant les règles métier; si elle échoue, garder le résultat réel sans annoncer un succès inventé.

Zéko peut aussi ouvrir un ticket de demande de rappel lorsqu'un client dit « demande à un technicien de nous appeler, nous avons un problème avec nos appels »; créer le ticket, conserver les symptômes et communiquer son vrai numéro.

6. Mémoire permanente : trois états distincts et provenance obligatoire

Les trois états suivants sont une décision explicite, essentielle à la fiabilité de Zéko :

INFORMATION CONFIRMÉE — constat réellement vérifié sur un équipement, par un technicien, ou par un résultat d'intervention documenté. Ne pas appeler « confirmé » une simple réponse d'IA.

INFORMATION HISTORIQUE — information constatée vraie à une date passée mais dont la validité actuelle n'a pas été revérifiée (p. ex. « VLAN 20 en août »). Elle peut être juste ou avoir changé.

HYPOTHÈSE — piste supposée ou proposée, jamais confirmée. Ne pas présenter comme un fait ou comme une solution qui a fonctionné.

Chaque connaissance réutilisable devrait pointer vers une source traçable : entreprise/tenant, éventuels site, appareil, poste, modèle, firmware, réseau/VLAN, ticket, passage de conversation, auteur, date de constat, dernière vérification, résultat, statut ci-dessus. Ne pas multiplier des copies indépendantes des données officielles.

6.1 Apprendre les particularités de chaque entreprise

Ex. téléphones sur VLAN 20 et postes informatiques sur VLAN 10, impossibilité d'atteindre l'interface du téléphone depuis les ordinateurs du client.

Retenir les accès et contraintes sans stocker les mots de passe en clair dans une mémoire conversationnelle.

Reprendre automatiquement ce contexte dans les prochains diagnostics, pour le client ET le technicien, sous des formulations adaptées.

Permettre au technicien de corriger/actualiser une connaissance devenue obsolète; garder l'historique de révision.

6.2 Réutiliser les solutions et les échecs

Indexer symptômes, causes investiguées, procédures, résultats, solutions confirmées et tentatives échouées.

Exemple : « Ce problème ressemble à celui d'Audaci il y a trois mois : à cette occasion, un problème de VLAN avait été identifié. Voulez-vous vérifier ce point? » — uniquement si les données le confirment.

Ne pas transformer automatiquement une hypothèse de Gemini en solution confirmée. Demander l'observation terrain (« oui, c'est réglé »).

Distinguer une cause identique avérée d'une simple similitude de symptômes.

6.3 Historique complet et recherches temporelles

Conserver localement : la conversation intégrale avec technicien/client, les photos et métadonnées, les réponses de Zéko, les recherches et échanges avec Gemini/autres modèles, les décisions, les actions d'ERPCRM, les résultats et les modifications.

Garder les horodatages et la provenance des réponses externes. Les prompts externes conservés doivent être dans leur version expurgée; conserver séparément, dans les mécanismes sécurisés existants si nécessaire, uniquement les références de substitution aux secrets.

Pouvoir demander : « Le 12 novembre 2026, on a parlé de [problème]. Y a-t-il de nouvelles mises à jour depuis ? » Zéko doit retrouver la conversation exacte, comprendre version/modèle/contexte, consulter au besoin la documentation à jour et comparer ce qui a changé.

Construire un index/recherche textuelle et éventuellement sémantique adapté à la base réellement utilisée. Ne pas mettre tout l'historique en entrée du modèle à chaque message. Prévoir recherche par date, entreprise, ticket, modèle, équipement et sujet.

Prévoir des sources/références retrouvables dans la réponse technique, et des règles de confidentialité strictes entre entreprises.

6.4 Former Zéko sans réentraîner constamment un modèle

L'utilisateur peut dire « la prochaine fois, pour ce cas, utilise l'article XXXX »; « ce problème était causé par le VLAN »; « résume cela plus simplement au client ».

Les corrections enrichissent des règles, fiches de connaissance ou préférences centralisées et traçables; elles ne nécessitent pas de modifier les poids d'un modèle LLM.

Zéko n'affirme pas apprendre définitivement une règle avant qu'elle soit effectivement enregistrée et applicable.

7. Architecture d'IA hybride : Zéko maître, modèles interchangeables

7.1 Définition

Zéko est l'assistant et l'orchestrateur local : identité, permissions, contexte, outils ERPCRM/SIPV, mémoire, sécurité, journalisation, sélection du fournisseur et continuité des tickets.

Il dispose d'un modèle IA local, modeste au départ et exécuté sur CPU si possible après audit des ressources, pour les conversations et certaines tâches même lorsque l'API externe n'est pas disponible.

Gemini est le premier assistant externe envisagé (diagnostics complexes, vision, recherche technique) avec clés/quotas/coûts dans les paramètres. Selon l'offre et les conditions de confidentialité, limiter les essais gratuits à des données appropriées; ne pas supposer un quota fixe ou une gratuité pérenne.

Claude API, OpenAI API, autres modèles pourront être branchés ensuite et sélectionnés selon la nature du travail, les performances, la confidentialité, le coût et la disponibilité.

Les abonnements personnels Claude Code/Codex/ChatGPT servent aujourd'hui au développement. Ne pas les transformer silencieusement en backend commercial par SSH pour éviter une API payante : inspecter les mécanismes et conditions d'utilisation officielles et obtenir une validation de solution. Le propriétaire est actuellement seul technicien; les clients n'accèdent ni au code ni aux outils de développement.

Plus tard, installation de NVIDIA RTX 3060 Ti 8 Go sur le futur serveur, puis éventuellement autre GPU ou fournisseurs payants, sans migration de la mémoire ERPCRM.

7.2 Continuité, tâches indépendantes et performance

Si Gemini est hors service, Zéko reste là, éventuellement plus lent et limité sans GPU; tickets, chronos, dossiers, recherche de données structurées et actions déterministes ERPCRM ne doivent pas être bloqués.

Ne pas confondre « fonctionnalité métier disponible » et « qualité de raisonnement du modèle local ». Les diagnostics visuels complexes peuvent être indisponibles ou plus lents localement jusqu'à l'arrivée du GPU.

Éviter des consultations externes inutiles. Prévoir choix explicite/automatique du fournisseur à configurer; la politique automatique versus demande d'autorisation systématique n'a pas encore été tranchée.

Les outils métier restent des fonctions serveurs dont le résultat est vérifié et journalisé; le LLM produit l'intention et l'explication, pas des commandes arbitraires exécutées sur un serveur.

7.3 Confidentialité, expurgation et contrôle des fournisseurs

Avant chaque envoi à un fournisseur externe, une couche locale filtre secrets : mots de passe, clés API, identifiants SIP, tokens, codes d'accès Wi-Fi, informations sensibles dans le texte ET les images/captures/pièces jointes.

Remplacer par des jetons stables par requête, p. ex. [SECRET_01], [IP_PRIVEE_01]; conserver la correspondance localement et de façon sécurisée, pas dans le prompt externe ni dans les journaux ordinaires.

Ne jamais réinsérer mécaniquement un mot de passe dans une réponse au client. Utiliser localement le secret par référence si une opération autorisée en a besoin; contrôler l'identité et le besoin de divulgation.

Les noms de personnes, entreprises, métadonnées d'infrastructure et données métier peuvent eux aussi être confidentiels : minimiser et pseudonymiser selon le besoin, pas uniquement masquer les mots de passe.

Si la couche de filtrage est incapable de garantir qu'une capture sensible est saine, ne pas envoyer l'image externe; proposer diagnostic local ou demander confirmation appropriée.

Cloisonnement multi-tenant strict, gestion sécurisée des clés API et identifiants, journal d'audit, rétention et suppression conformes aux règles ERPCRM et à la politique d'entreprise.

Les clients ne peuvent consulter que leurs données autorisées, même si une recherche sémantique retrouve par erreur un autre tenant.

7.4 Paramètres de l'administration

Dans les paramètres administratifs existants, prévoir les capacités de configuration, sans inventer une application admin parallèle :

IA locale active, adresse/ressources et modèle sélectionné;

fournisseurs externes actifs, modèles, clés et restrictions par rôle/usage;

autorisation/déclenchement d'une consultation externe, limites/coûts si pertinents;

politique de protection et confidentialité;

suivi de santé des fournisseurs et bascule de secours;

paramètres de rappel des tickets (cf. § 3.5);

règles d'apprentissage contrôlées et visibilité/audit.

8. Authentification, identité, rôles et comportement selon l'utilisateur

Dans ERPCRM/portail avec session ouverte : Zéko utilise l'identité déjà authentifiée et les permissions existantes, sans demander une deuxième vérification systématique.

Technicien : peut demander informations techniques et changements qui lui sont autorisés; les traces internes de diagnostic sont réservées au personnel ayant accès.

Client : aide sur son entreprise, ses données de téléphonie et ses modifications autorisées. Par défaut langage simple; « sois plus technique » modifie la présentation pas les droits.

Si refus d'une action, expliquer intelligiblement et nommer le gestionnaire téléphonie pertinent, si connu/autorisable.

Exigence décidée antérieurement pour un usage éventuel hors portail : proposer d'abord une vérification par code courriel ou SMS, au choix du client. Si ces moyens sont indisponibles, employer des questions fondées sur dossier/historique : 3 réponses correctes sur 4 essais maximum (une erreur tolérée). Cette voie hors portail n'est pas à inventer dans la première UI si aucun canal externe n'est encore prêt; préserver toutefois la règle dans l'architecture.

Toute opération d'administration/SIPV est vérifiée côté serveur; Zéko ne doit jamais déduire un droit de l'habileté technique apparente de la personne.

9. Rendez-vous, avis au technicien et assistance humaine

Un client peut demander « un technicien doit nous appeler », demander un rendez-vous, ou refuser de discuter avec la machine.

Zéko peut ouvrir/mettre à jour un ticket officiel et informer le personnel par les mécanismes existants; pas de ticket fictif ni de confirmation « c'est réservé » avant opération réussie.

Repérer le technicien habituel associé à l'entreprise, ou proposer un technicien disponible; aujourd'hui équipe d'une seule personne, architecture extensible.

Consulter l'agenda et les créneaux réels. Si l'intégration le permet et que le client confirme, prévoir une opération de réservation/notification reliée au ticket; type exact d'agenda et politique de création encore à décider.

Réduire au minimum les manipulations clientes : s'il faut une prise en main à distance parce que le navigateur n'accède pas aux équipements, proposer le contact humain et garder le diagnostic déjà réalisé.

Pour les demandes urgentes, ne pas inventer de disponibilité; pouvoir demander un rappel sans rendez-vous réservé si nécessaire.

10. Vérifications spécifiques équipements / Grandstream

Pendant l'audit, vérifier dans les docs officielles et sur les versions réellement déployées :

possibilités de consulter l'état/configuration des touches de GXP2135/GXP2170/autres modèles, avec authentification et versions firmware compatibles;

s'il existe un endpoint ou une page HTTPS permettant de voir l'état réel des boutons/pages; en distinguer provisionnement prévu, configuration signalée par l'appareil, état affiché sur l'écran;

possibilités de récupérer une capture LCD, et nécessité éventuelle d'une manipulation physique;

chemin fiable pour connaître IP locale, firmware, langue, menu et redémarrage;

faisabilité réseau lorsque le client est derrière NAT, VLAN séparé, pare-feu, absence de VPN, et via navigateur avec limitations CORS/authentification;

quels diagnostics de provisionnement peuvent être obtenus directement par ERPCRM/SIPV sans requête sur le téléphone;

autorisations et confirmations nécessaires avant toute action distante (notamment redémarrage).

Ne pas figer de commande/URL Grandstream ou un chemin de menu sur une simple supposition. Les exemples et images de conception servent à définir le résultat souhaité, pas à certifier tous les endpoints ou firmwares.

11. Stockage et modèle conceptuel : extension de l'existant seulement

Ce ne sont pas des noms de tables à créer obligatoirement. Rechercher d'abord les entités existantes et n'ajouter que les éléments absents :

Ticket ERPCRM existant : statut, entreprise, créateur, responsables, résumé client, visibilité.

Événements de conversation : ticket ou contexte hors-ticket, auteur (client, technicien, Zéko, fournisseur externe), horodatage, message, pièces jointes, audience interne/client, provenance.

Périodes de chronométrage : ticket, technicien, début, fin, pause, source d'arrêt, corrections et raison, éventuel chevauchement.

Associations travail / catalogue : période ou durée classée, article ERPCRM officiel, source et correction.

Connaissances : faits dérivés et références à des éléments existants, état confirmé / historique / hypothèse, preuves, dernière vérification, tenant, équipement, source.

Journal des actions IA : acteur réel, rôle, intention, fonction appelée, autorisation serveur, avant/après, succès/échec, ticket lié.

Invocations IA : fournisseur, modèle, statut, coût/jetons si disponibles, versions expurgées des requêtes/réponses, référence au ticket/conversation; ne pas y sauvegarder des secrets.

Médias : photos originales à accès contrôlé, associations existantes équipement/ticket, images de documentation par modèle.

Favoriser les références vers les données d'ERPCRM, la compatibilité historique et la capacité d'expliquer d'où vient chaque réponse. La mémoire « IA » n'est pas une seconde base de clients indépendante.

12. Déploiement progressif proposé à Claude Code

Étape 0 — Audit et proposition, zéro refonte immédiate.
Cartographier l'existant, les problèmes du ticket actuel (y compris la confusion chrono total vs saisie), les fonctions réutilisables, les dépendances, risques et migrations. Rendre les questions réellement bloquantes visibles. Obtenir validation du propriétaire.

Étape 1 — Fondation stable du ticket et des temps, sans dépendre de l'IA.
Conversation libre + photos + historique horodaté; chrono de ticket serveur; popup « pause / laisser tourner / annuler »; chrono corrigible; présence navigateur et mise en pause; rappels configurables en minutes arbitraires; migration des notes/saisies existantes et tests de non-régression.

Étape 2 — Zéko local et interface cohérente.
Point d'entrée global immédiatement à gauche du nom; intégration conversationnelle dans les tickets techniciens; conservation des échanges; contexte ERPCRM; outils de lecture sécurisés; modèle local CPU viable si l'audit confirme; fonctionnement limité mais disponible sans externe.

Étape 3 — Mémoire, connaissance et classification.
Recherche historique par ticket/date/client; les trois états de connaissance; liens sources; photos équipements et extraction selon capacité; catalogue et correction d'associations; comptes rendus vulgarisés; gestion de la confidentialité.

Étape 4 — Gemini et autres fournisseurs optionnels.
Connecteur interchangeable, expurgation locale texte/images, journal complet local, limites/quotas, fallback local. Ne pas rendre Gemini obligatoire. Vérifier coûts, conditions de confidentialité et disponibilité actuelle avant activation réelle.

Étape 5 — Parcours client / prédiagnostic.
Assistant en-tête portail et création de ticket, langage simple/technique à la demande, contexte provisioning, questionnement pertinent, guidage écrit puis images contextuelles, fermeture d'un ticket résolu ou escalade humaine, résumé client distinct.

Étape 6 — Actions ERPCRM/SIPV.
Premières actions éprouvées (par ex. renommer un poste, puis créer un poste si services existants), permissions natives, journal et ticket de changement automatiques; confirmations selon les risques; élargissement graduel et tests de séparation entre entreprises.

Étape 7 — Assistance avancée et mobilité.
Consultation appareils accessible/autorisé, particularités réseau/VLAN, agenda et rendez-vous, assistance à distance; future application mobile/tablette et continuité de chronométrage; plus tard GPU/IA locale visuelle plus performante et autres fournisseurs.

Chaque étape : présenter la portée précise, changements/migrations, résultats de tests (unitaires, intégration, UI), exemples d'usage vérifiés, risques, rollback; demander validation pour passer aux actions qui modifient massivement l'existant.

13. Scénarios de réception : indispensables

Ces scénarios servent à juger le développement, pas seulement une démo avec texte fictif.

Ticket terrain long : ouvrir un ticket, dire « je commence l'installation », ne rien écrire pendant deux heures; le chrono a bien continué, des notes peuvent être ajoutées ensuite sans création obligatoire d'une ligne de temps.

Deux chronos simultanés : mise à jour facturable chez A, ouverture de B; popup propose pause/laisser tourner/annuler. Choisir « laisser tourner » : les deux durées avancent et les chevauchements sont sauvegardés.

Pause explicite : choisir « mettre A en pause » : seul A cesse de courir; B démarre; retour à A permet reprise sans perdre le temps cumulé ni pauser B de manière inattendue.

Fermeture du navigateur : aucun autre client connecté : mise en pause après détection, période d'incertitude signalée si nécessaire. Plus tard, app toujours connectée : continuité possible.

Correction facile : cliquer le temps total du ticket; corriger de 1 min à 20 min. Zéko comprend également « j'ai travaillé 45 minutes pendant la coupure » et enregistre justification et durée corrigée.

Rappel à 17 minutes : paramètre 17, pas seulement 15/30/45/60; son/volume/notification visuelle selon réglages, sans arrêter le chrono.

Photos : coller une étiquette GXP, extraire MAC/SN, corriger une erreur de lecture, associer à « Nicole, poste 243 »; retrouver la liste poste ↔ MAC ensuite.

Mémoire réseau : constater VLAN séparés chez un client, marquer confirmé avec date/source; au ticket suivant ne pas redemander de consulter via navigateur une API inaccessible depuis son LAN utilisateur; expliquer l'escalade au responsable informatique.

Trois états : une hypothèse « SIP ALG possible » ne se transforme pas en solution confirmée. Une configuration prouvée il y a six mois et non revérifiée est présentée comme historique.

Client débutant : « mes boutons ont disparu » → questions fondées sur modèle, pages et provisioning; pas « cela fonctionnait-il avant ? »; explications écrites d'abord; images si difficulté.

Client veut un humain : Zéko arrête le diagnostic automatisé et consulte vraiment les disponibilités existantes, ou crée une demande de rappel; n'invente aucun créneau.

Résolution autonome : redémarrage réussi : ticket réel documenté, solution et cause/hypothèse distinguées, statut fermé si autorisé.

Client plus technique : « explique en termes SIP/TLS » → niveau de détail accru, mêmes permissions et données autorisées.

Changement de poste autorisé : client autorisé demande Nicole → Nathalie sur 243; l'action passe par ERPCRM/SIPV, ticket ou journal ERPCRM lié avec avant/après; autres personnes autorisées retrouvent le changement.

Changement non autorisé : action refusée et gestionnaire téléphonie indiqué; aucune modification, même si l'utilisateur demande « parle-moi comme à un technicien ».

Dépannage assisté : demande de créer un poste avec prochain numéro libre et sans boîte vocale; vérification de disponibilité et paramètres, action uniquement via les fonctions de configuration existantes; ne pas inventer la réussite.

Rapport client : exemple UDP/TLS raconté clairement sans mots techniques inutiles; détails internes et secrets non divulgués; le client peut demander plus d'explication autorisée.

Gemini indisponible : tickets, chronos, recherche ERPCRM, dossier client et aides locales restent utilisables; aucune perte d'historique.

Requête externe expurgée : un mot de passe ou token présent dans le texte ou une capture ne quitte pas le serveur; vérification des journaux et cas d'échec du filtre.

Recherche temporelle : « qu'avait-on conclu le 12 novembre 2026 ? y a-t-il une mise à jour ? » → récupération de l'historique daté, sources pertinentes et distinction changement vérifié/hypothèse.

Conformité multi-tenant : aucune requête de Zéko ou recherche vectorielle ne retourne des secrets/tickets d'une autre entreprise à un client non autorisé.

Résilience : rechargement de page, coupure réseau, navigateur minimisé, arrêt de modèle et reprise du service sans double comptage du chrono ni perte de conversation.

Catalogue : une correction « associe cette intervention à l'article XXXX » modifie l'affectation autorisée et crée une règle mémorisée, sans créer un doublon d'article.

En-tête et ticket : bouton Zéko visible partout, immédiatement à gauche du nom; dans un ticket technicien, la zone de conversation est bien celle du ticket, pas un système indépendant.

14. Questions NON tranchées — ne pas les transformer en règles décidées

Visibilité temporelle du résumé client : progression pendant l'intervention, publication finale, ou les deux?

Triage à l'ouverture d'un ticket client : proposition facultative explicite ou intervention initiale discrète avec sortie immédiate?

Confirmation avant écriture : quelle matrice précise d'actions peut être exécutée immédiatement versus demander confirmation? Le principe « selon les conséquences » est une piste, pas une décision finale.

Choix IA externe : consultation automatique, autorisation à chaque demande, ou politique configurable par type de tâche?

Agenda : création directe de rendez-vous Google et calendriers concernés, confirmation du client, durées de réservation et déplacements.

Démarrage automatique : ouvrir un ticket pour consultation doit-il lancer le compteur ou seulement une prise en charge/travail? Clarifier à partir des usages existants.

Usage d'images côté client : le principe est établi (écrit en premier, image si besoin); affiner les déclencheurs au fil du travail.

Client non connecté : les règles d'identification hors portail sont décidées mais aucun canal public n'est demandé pour la première version. Clarifier avant d'exposer Zéko hors connexion.

Gestion des alertes hors écran verrouillé : distinguer ce qui est garanti en navigateur et ce qui nécessite une application ou des notifications système.

N'interromps pas tout le chantier pour chacune de ces questions : propose des décisions au moment où le module correspondant doit réellement être implémenté.

15. Résultat attendu de la première réponse de Claude Code

Après lecture de ce document, ne pas commencer par réécrire les tickets au hasard. Fournir au propriétaire :

État de l'existant vérifié dans le dépôt : composants, fichiers, routes, modèles, services, pages, API, versions pertinentes.

Éléments déjà réalisés à conserver et écarts exacts par rapport aux exigences ci-dessus, spécialement chronos et autorisations.

Architecture d'intégration concrète à l'existant, distinguant données officielles, conversation, mémoire référencée, chronométrage, connecteurs IA et fonctions métier sécurisées.

Plan de mise en œuvre ordonné par petits lots testables, avec risques, migrations et sauvegarde/retour arrière.

Questions véritablement bloquantes, limitées à l'étape immédiate, posées une à la fois si besoin.

Après validation, implémenter progressivement, tester chaque comportement avec des données non sensibles, et ne jamais supprimer des données de tickets ou modifier des configurations SIPV de production sans autorisation explicite.

Idée maîtresse

Zéko ne remplace pas ERPCRM : il rend ERPCRM beaucoup plus simple à utiliser. Le technicien travaille et parle naturellement; le client est guidé sans jargon; l'historique demeure exploitable; les chronos mesurent réellement le temps; les actions passent par les permissions ERPCRM; les connaissances sont fiables, datées et classées confirmées, historiques ou hypothétiques; l'IA locale reste disponible et peut demander de l'aide à Gemini ou à d'autres fournisseurs sans déplacer la source officielle des données.
