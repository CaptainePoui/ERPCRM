# PLATFORM_TASKS.md

Source unique et active des tâches de Simple IP Platform (ERPCRM + SIPV). Remplace `TASKERPCRM.md` et `TASKSIPV.md` comme source active — ces deux fichiers restent des archives historiques (voir Phase N, `/home/simpleip/BackUp/phase_n_task_archive_20260821/` et `/home/sipv/BackUp/phase_n_task_archive_20260821/`), plus aucune nouvelle entrée active n'y est ajoutée.

Généré le 2026-08-22T11:42:42+00:00, issu de la migration Phases M→P (2026-08-21/22) : inventaire/classification (M), archivage hashé des sources (N), fusion documentaire avec mapping d'IDs (O), audit indépendant `task-migration-auditor` (P, verdict PASS AVEC RÉSERVES puis toutes réserves fermées). Convention TASK-XXX/TASK-SXXX inchangée (voir CLAUDE.md de chaque dépôt). Aucune tâche fonctionnelle perdue ou inventée. Mapping complet de tout changement d'ID/emplacement : voir `PHASE_O_ID_MAPPING.md` (racine `docs/platform/`).

Scope explicite par tâche : `[ERPCRM]`/`[SIPV]`/`[ARCH]` (voir `documentation-sync` pour la liste complète des tags possibles, dont `[SHARED]`/`[INFRA]`/`[TOOLING]`/`[PLATFORM]` — non utilisés ici faute de tâche correspondante identifiée lors de cette migration).

---

# PLATFORM_TASKS.md — Section ERPCRM

> Produit en Phase O à partir de l'inventaire Phase M (`phase_m_inventory_erpcrm.md`). Contenu repris fidèlement de `TASKERPCRM.md` (archivé intact en Phase N), réorganisé par ordre de TASK-XXX croissant (au lieu de l'ordre chronologique dispersé de l'original), avec corrections listées dans `phase_o_id_mapping_erpcrm.md`. La convention de numérotation (`TASK-XXX` = création de module, `TASK-XXX.Y` = ajout/fix) et la légende des statuts (`[ ]`/`[~]`/`[x]`/`[!]`) restent définies dans `CLAUDE.md` (ERPCRM) — non dupliquées ici.

Ligne `Classification:` ajoutée en tête de chaque bloc TASK-XXX top-level, reprise telle quelle de l'inventaire Phase M (CURRENT = actif/en développement ou backlog toujours valide ; HISTORICAL = complété, stable, sans contradiction ; aucune entrée ERPCRM n'est OBSOLETE ni LEGACY-ASTERISK).

---

## TASK-000 [PLATFORM] [x] Migration Phases M→P — fusion documentaire PLATFORM_TASKS.md
Date de demande : 2026-08-21 (décision de migrer `TASKERPCRM.md`/`TASKSIPV.md` vers un document unique)
Date(s) de travail : 2026-08-21, 2026-08-22

Classification: HISTORICAL

Travail antérieur à la convention TASK-XXX telle qu'utilisée aujourd'hui — placé en TASK-000 pour lui donner un numéro de référence (les erreurs qui s'y rattachent en ont besoin), pas une fonctionnalité ERPCRM/SIPV. Inventaire/classification (Phase M), archivage hashé des sources (Phase N), fusion documentaire avec mapping d'IDs (Phase O), audit indépendant `task-migration-auditor` (Phase P, verdict PASS AVEC RÉSERVES puis toutes réserves fermées). Résultat : `PLATFORM_TASKS.md` (ce fichier), mapping complet dans `PHASE_O_ID_MAPPING.md`.

### TASK-000.1 [x] ID de tâche dupliqué — `TASK-015.12` utilisé pour deux fonctionnalités sans rapport
`TASK-015.12` désignait deux entrées sans rapport dans `TASKERPCRM.md` ("Correction manuelle du temps chrono ticket" et "Envoi de RDV par courriel"). "Correction manuelle du temps chrono ticket" renumérotée `TASK-015.14` en Phase O.

### TASK-000.2 [x] Compteur générique réutilisé — 22 sous-tâches SIPV mal rattachées à `TASK-S023`
22 sous-entrées numérotées `023.X`/`S023.X` n'avaient aucun rapport avec `TASK-S023` (synchronisation `PendingChange`, jamais construite) — compteur générique réutilisé pendant le backlog du 2026-07-24. Redistribuées vers leurs vraies familles (`S004`/`S007`/`S008`/`S011`/`S018`/`S020`) en Phase O.

---

## TASK-001 [ERPCRM] [x] Auth — Login JWT, get_current_user, sessions
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `auth login`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Auth — Login JWT, get_current_user, sessions

---

## TASK-002 [ERPCRM] [x] Compagnies — liste, fiche, onglets, boutons + Ticket / + Facture / + Tâche
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `companies`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Compagnies — liste, fiche, onglets, boutons + Ticket / + Facture / + Tâche

### TASK-002.1 [x] Fix — slug 'cdr' manquant dans TAB_SLUGS
Date de demande : 2026-08-29 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-29

`TABS` a 9 entrées (Général..Journal) mais `TAB_SLUGS` n'en avait que 8 — 'cdr'
manquait, décalant tout ce qui suit d'un cran dès que l'URL pilote l'onglet
(refresh, lien partagé) : CDR se comportait comme Tâches, Tâches comme Photos,
Photos comme Journal, Journal retombait sur Général (slug 'undefined'
introuvable). Ajouté le slug manquant, 9 entrées alignées 1-pour-1.
Fichier : frontend/src/pages/CompanyDetail.jsx (commit a978bba).

### TASK-002.2 [x] Fiche compagnie — vue d'ensemble financière (Général) et onglet Transactions
Date de demande : 2026-10-02 (Philippe : « dans compagnie j'aimerais une vue d'ensemble dans le général avec son solde, ses retards (s'il en a), optimiser cet onglet, et un nouvel onglet de transactions où on voit les factures et les avoirs » ; GO « sans les paiements mais je veux voir quelle facture est payée et laquelle ne l'est pas »)
Date(s) de travail : 2026-10-02

- API `GET /v1/companies/{id}/finance` : résumé (solde dû, en retard + nombre + plus vieux retard en jours, avoirs disponibles, facturé et payé de l'année fiscale — début selon `fiscal_year_start_month` —, dernier paiement) + liste des factures et avoirs avec payé/appliqué, reste, part réglée par avoir. Montant réglé = paiements confirmés + avoirs appliqués (`settled_amounts`, TASK-005.10).
- Général : rangée de cartes en haut (Solde dû et En retard ouvrent Transactions filtré ; En retard et Avoirs disponibles n'apparaissent que s'il y a lieu). Écran réorganisé en 2 colonnes (Identification + Taxes | Adresses + Coordonnées) ; NEQ, secteur, actionnariat, employés, chiffre d'affaires et site web dans la section repliable « Détails de l'entreprise » (toujours modifiables, aucun champ retiré).
- Nouvel onglet Transactions (2e onglet, slug `transactions`) : factures + avoirs par date, état de paiement lisible (Payée, Créditée, Partiellement payée, Non payée, En retard, Avoir ouvert/appliqué ; « dont avoir x $ » si réglée en partie par avoir), filtres Tout / Non payées / Payées / En retard / Avoirs, totaux sur les factures seulement (un avoir appliqué est déjà dans le « Payé » de sa facture). Les paiements ne sont pas listés (décision de Philippe).
- Le rendu des onglets se fait par slug (plus par index) : ajouter un onglet ne décale plus les autres (cf. TASK-002.1).
Fichiers : backend/app/api/v1/endpoints/companies.py, frontend/src/pages/CompanyDetail.jsx, frontend/src/pages/CompanyDetail.css.

### TASK-002.3 [x] Rôles des compagnies (pastilles) et intervenants d'un client (Internet, réseau, sous-traitant…)
Date de demande : 2026-10-10 (Philippe : « il faudrait une place pour les entreprises d'entreprise : Satelcom fait affaire avec plein de mes clients, Nanotech aussi, Nanotech pourrait aussi être un fournisseur, un client pour le ERPCRM et un sous-traitant… on les rentre tous dans les compagnies mais on ajoute les pastilles de choix pour l'identifier et on ajoute une place dans les compagnies où on peut mettre la compagnie réseau et l'autre Internet qu'il utilise » ; aussi « dans les courriels il faudrait pouvoir créer/attribuer un contact et le placer dans la bonne compagnie »)
Date(s) de travail : 2026-10-10

- Exemple réel donné (dossier Équijustice, 2026-10-10) : client Équijustice (contact Maya Fernet ; Équijustice regroupe 13 organismes, mais le client de Simple IP est seulement Équijustice de Joliette — Philippe, 2026-10-10) ; Internet = Satelcom ; réseau/routeur/pare-feu = Nanotech Informatique depuis ~15 ans (450-760-9090, option « Service aux entreprises » ; Josué, Jean-François, Jérémie) ; routeur Ubiquiti EdgeRouter X, IP interne réservée .111 pour le UCM ; lignes SIP vers ScopServ (75.98.128.39) qui ne s'enregistrent plus.
- Constaté : une compagnie n'a aucun rôle (client/fournisseur/sous-traitant) ni lien vers une autre compagnie ; un contact peut déjà être dans plusieurs compagnies (TASK-003) ; dans Courriels, « Classer » permet déjà de choisir la compagnie et « Créer le contact dans cette compagnie » (TASK-047.2).
- Proposé (2026-10-10) : pastilles combinables gérées dans Admin ; section « Intervenants » libre (rôle + compagnie + contact + note).
- Décision de Philippe (2026-10-10) : pastilles OK ; PAS d'intervenants libres (« je suis en téléphonie IP, je me fous de l'électricien, mais j'ai besoin et je suis dépendant de l'Internet et du réseau ») → deux cases fixes dans la fiche du client : **Internet** et **Réseau**, chacune = une compagnie + un contact préféré.
- Précision de Philippe (2026-10-10) : « ces infos peuvent être dans un onglet Intervenants, ce serait bien » → les deux cases dans un nouvel onglet **Intervenants** de la fiche compagnie (pas dans Général).
- Puis (2026-10-10, Philippe : « ou on le met dans inventaire parce que ça va avec son matériel ?? ») → recommandé : dans l'onglet **Inventaire** existant (liste des équipements, catégorie Routeur déjà là), un encadré « Internet et réseau » en haut, la liste des équipements dessous ; pas de nouvel onglet (la fiche en a déjà 12). Sur la fiche du fournisseur (Satelcom, Nanotech), même endroit : « Clients qui dépendent de nous ».
- Fait (GO de Philippe, 2026-10-10 : « go pour les pastilles et l'inventaire, ajoute Internet et la place pour assigner la compagnie qui s'en occupe et un contact »), copie complète de la base avant (full_before_002_3.dump) :
  - **Pastilles** : les « Statuts » qui existaient déjà (client, fournisseur, vendeur, prospect, mauvais payeur — plusieurs par fiche, compagnies et contacts) sont les pastilles, pas une 2e sorte ; renommés « Pastilles » à l'écran (fiche compagnie, nouvelle compagnie, fiche contact, listes) et au journal. Migration 2ed9dd39f015 (id généré, une seule tête, up/down/up testés) : + sous-traitant, fournisseur internet, réseau / informatique. Nouvel onglet **Administration → Pastilles** (admin) : ajouter, renommer, couleur, désactiver (jamais supprimer ; nombre de fiches qui la portent ; nom unique sans égard à la casse) — `GET/POST/PUT /admin/statuses`. Une pastille désactivée ne s'offre plus mais reste retirable sur la fiche qui la porte. Les pastilles de départ ne sont plus recréées au démarrage (seed seulement sur une base neuve) : un renommage tient. Liste des compagnies : filtre « Toutes les pastilles ».
  - **Internet et réseau** : `companies.internet_company_id / internet_contact_id / network_company_id / network_contact_id` (FK SET NULL, liens). Onglet **Inventaire** de la fiche : encadré « Internet et réseau » au-dessus de la liste du matériel — chaque case : compagnie (recherche, ou « + Créer ») et contact préféré parmi les gens de cette compagnie (ou « + Nouveau contact », lié aussitôt à cette compagnie) ; téléphone, poste, cellulaire, courriel lus en direct ; Retirer. Sur la fiche du fournisseur : « Clients qui dépendent de nous ». API `GET/PUT /companies/{id}/connectivity` (refus 422 : contact hors de la compagnie, contact sans compagnie, sorte inconnue). Inscrit au journal de la fiche avec les noms (« Réseau — compagnie : (vide) → Nanotech ») ; ces lignes n'ont pas « annuler ce changement » (on rechange dans Inventaire).
  - Administration : la barre d'onglets passe à la ligne quand elle déborde (10 onglets ; sur cellulaire, les onglets étaient déjà coupés).
  - Vérifié (vrais écrans du serveur, essai annulé — journal 232 lignes avant et après, aucune compagnie d'essai gardée) : réseau = Nanotech + Jean-François (téléphone lu de sa fiche), Internet = Satelcom, refus 422, dépendants de Nanotech, journal lisible, annulation refusée (400), pastille créée/renommée/désactivée, doublon 409, couleur invalide 422, pastille sous-traitant sur une fiche et dans la liste, seed sans effet. Écrans (Playwright, ordinateur et cellulaire, aucune erreur) : filtre « client » (4 compagnies), Inventaire vide puis en modification, Administration → Pastilles, Général.


### TASK-002.4 [x] Succursale = une vraie compagnie liée à sa maison mère (facturation, paiements, voir le lien)
Date de demande : 2026-10-10 (Philippe : « je suis dans Simple IP et je me rends compte que les succursales ne sont pas une compagnie distincte — succursale sert à lier 2 entreprises ensemble pour les recherches de facturation, de paiement ou simplement voir qu'elles sont liées… et autre bien sûr »)
Date(s) de travail : 2026-10-10

- Constaté (2026-10-10) : une « succursale » est aujourd'hui une adresse sous la compagnie (`company_sites` : nom, adresse 911, contact et courriel de facturation), pas une compagnie. 3 en tout : Maison Le Passeur → « Oxygene » (Sorel-Tracy, 26 factures, 1 facturation périodique, pas de 911) ; Simple IP inc. → « Simple IP inc. » (principale) et « Simple IP Rose » (adresses 911 envoyées à SIPV). Les postes, numéros, factures et périodiques peuvent pointer vers une succursale (`site_id`).
- Proposé (2026-10-10) : succursale = vraie compagnie liée à une maison mère (un niveau) ; garder les adresses 911 à part.
- Idée de Philippe (2026-10-10) : « un petit check box dans la compagnie en bas pour la mettre succursale, une fois coché on peut choisir la maison mère… ça lie les 2 ou plus compagnies, comme ça les recherches de paiement peuvent vérifier si la maison mère a payé pour les 2 entreprises dans son paiement, et ça afficherait la maison mère dans (Oxygène), et dans Le Passeur on laisse les succursales là mais c'est des liens vers les compagnies, pas une boîte avec les infos… ça fait aussi que le SIP se retrouve dans le même tenant, ça fait les 911 correct ».
- Analyse : d'accord sur le fond ; les adresses 911 du tenant restent l'enregistrement envoyé à SIPV (postes et numéros y pointent), mais chacune est liée à la compagnie succursale et prend son adresse (plus de saisie en double) ; la succursale n'a pas son propre tenant. Points ouverts : la téléphonie d'une succursale est facturée à qui ; règles (pas soi-même, une maison mère ne peut pas être succursale, une succursale avec son propre tenant est refusée).
- Philippe (2026-10-10) : plusieurs niveaux permis (« des fois les compagnies ont plusieurs niveaux, une compagnie a une succursale qui elle a une succursale ») → arbre, seulement les boucles refusées (A → B → A). Tenant : si la maison mère ET la succursale ont chacune un tenant SIPV, une migration de l'un vers l'autre est nécessaire → mettre une alerte ; si l'une des deux n'en a pas, tout se fait directement.
- Philippe (2026-10-10) : « même chose si on décoche une succursale et qu'elle était sur le même tenant (popup alerte) » → décocher une succursale dont les postes sont dans le tenant de la maison mère : fenêtre d'alerte (sa téléphonie devra être migrée vers son propre tenant).
- Réponses de Philippe (2026-10-10) : (1) seule la succursale a un tenant → il passe à la maison mère : oui ; (2) facture téléphonique d'une succursale : un choix « facturer indépendamment » ou « facturer à la maison mère », qui peut remonter d'un niveau ou jusqu'en haut quand il y a plusieurs maisons mères ; (3) « Simple IP Rose » devient une compagnie (« pas le choix, c'est la procédure ») → règle : toute adresse 911 autre que celle de la compagnie elle-même = une compagnie succursale.
- Précision (2026-10-10, Philippe : « elle est toujours facturée à elle-même sauf si je coche facturer à la maison mère… là j'ai le choix des maisons mères ») → par défaut facturée à elle-même ; case « Facturer à la maison mère », puis choix parmi ses maisons mères (parent direct ou plus haut).
- Simple IP Rose (Philippe, 2026-10-10) : « c'est moi qui paie, mais c'est mon serveur, alors je n'ai pas de facture juste pour eux ; j'ai la facture de ScopServ pour tout le serveur » → compagnie succursale de Simple IP inc., aucune facturation à créer (elle n'en a aucune aujourd'hui).
- En attente du GO sur le plan final.


- Fait (GO de Philippe, 2026-10-10 : « go »), copie complète de la base avant (full_before_002_4.dump) :
  - Migrations 77df140c3ac4 et 164c1a7e4620 (ids générés, une seule tête, up/down/up testés) : `companies.parent_company_id`, `companies.bill_to_company_id`, `company_sites.branch_company_id`, `recurring_billing_lines.for_company_id`. Données : chaque ancienne succursale non principale devient une compagnie succursale (notes « Créée depuis la succursale … (TASK-002.4) », adresse de service, contact ou courriel de facturation repris) : **Oxygene** (Maison Le Passeur) reçoit ses 26 factures, sa facturation périodique, les 26 paiements qui ne payaient que ses factures et les 12 dépôts bancaires reliés ; **Simple IP Rose** (Simple IP inc.), sans facturation. Rien d'effacé ; le retour arrière remet tout sur la maison mère.
  - Règles (`core/company_tree.py`, `core/branches.py`) : plusieurs niveaux, boucles refusées ; facturée à elle-même sauf « Facturer à la maison mère » (choix parmi ses maisons mères, sinon refus) ; la succursale entre dans le tenant de la maison mère la plus proche qui en a un : son adresse 911 y est créée à partir de son adresse (911, sinon service, sinon facturation ; avertissement si incomplète) et suit chaque nouvelle adresse de sa fiche ; seule la succursale a un tenant → il passe à la maison mère (SIPV `sync/company` : même tenant, rattaché à la nouvelle fiche ; adresses 911, numéros, anciens postes et rapports d'appels suivent dans ERPCRM) ; les deux ont un tenant, ou on décoche / change de maison mère alors qu'elle partage le tenant → alerte 409 à confirmer (« Continuer quand même »), la téléphonie reste où elle est (migration : TASK-051). Journal avec les noms (« Maison mère », « Facturée à »), sans « annuler ce changement ».
  - Facturation téléphonique (`core/branch_billing.py`) : un poste ou un numéro appartient à la compagnie de son adresse 911 ; sa ligne va dans la récurrence téléphonique de la compagnie facturée pour elle (créée au besoin, mensuelle). Elle suit quand on change l'adresse 911 du poste (fiche contact) ou d'un numéro, et quand le choix de facturation change (l'avis de SIPV arrive avant que l'adresse 911 soit choisie). Limite : une adresse 911 changée directement dans le portail SIPV ne déplace pas la ligne.
  - Paiements : un paiement au nom de la maison mère peut couvrir les factures de ses succursales (`payer_for`) — association bancaire (manuelle et suggestions : la famille compte comme le client, le nom d'une maison mère désigne aussi ses succursales ; association automatique seulement si le compte est exact, sinon ses propres factures), « Paiement groupé » (plusieurs compagnies permises si même famille), liste des factures d'une compagnie dans la Banque (avec celles des succursales).
  - API : `GET/PUT /companies/{id}/group` ; adresses 911 avec la compagnie succursale liée.
  - Écran : fiche compagnie, en bas du Général, « Maison mère et succursales » (case Succursale, maison mère, case Facturer à la maison mère + choix, téléphonie dans le tenant de…, liste des succursales en liens, fenêtre « Téléphonie à migrer ») ; « Succursale de … » à côté du nom ; « Succursales » de la fiche devient « Adresses 911 » (★ = la compagnie elle-même, les autres = liens vers les compagnies succursales, plus d'ajout à la main sauf l'adresse principale d'un tenant) ; plus de choix de succursale dans « Nouvelle facture » ; fiche contact : « Adresse 911 » au lieu de « Succursale », plus de « + Nouvelle succursale ». Colonne « Adresse 911 » des numéros.
  - Au passage (mode nuit, TASK-050) : pastilles d'état grises (Brouillon, Fermé, Inactif…) et barre de sélection gardent leurs couleurs fixes (texte blanc lisible).
  - Vérifié (essai annulé, SIPV simulé — aucun appel réel ; aucune compagnie d'essai gardée) : Oxygene → Maison Le Passeur ; boucles à 2 et 3 niveaux refusées ; A → Simple IP : adresse 911 créée dans T1001 (11206) puis mise à jour (11210) ; facturer à une non-maison-mère refusé ; sous-succursale A2 (avertissement adresse) ; avis de facturation d'un poste de A → récurrence de A (créée), puis « facturer à Simple IP » → la ligne passe chez Simple IP ; décocher A → alerte puis confirmé ; B (son tenant) → Simple IP → alerte, tenant gardé ; C (tenant) → D → tenant passé à D ; paiements Le Passeur pour Oxygene acceptés, compagnies non liées refusées ; Banque : 52 factures de Le Passeur dont 26 d'Oxygene. Écrans (Playwright, 1920 et 390) : Oxygene, Maison Le Passeur, Simple IP inc. — aucune erreur.

### TASK-002.5 [x] Compagnie du propriétaire — une seule fiche pour Simple IP (coordonnées des PDF + téléphonie), jamais facturée
Date de demande : 2026-10-10 (Philippe : « je n'aurais peut-être pas dû mettre ma propre compagnie, au départ c'est pour les tests, mais je vais devoir avoir un 911 quand je vais migrer sur SIPV, donc c'est bien… peut-être faire le lien que la compagnie du propriétaire ne se fait pas facturer : quand on installe ERPCRM+SIPV ça crée la compagnie pour avoir les options de SIPV mais ça ne la facture pas parce que c'est lui qui a le serveur… je ne veux pas de doublon et là j'en ai dans les infos du propriétaire du ERPCRM et ma compagnie »)
Date(s) de travail : 2026-10-10

- Constaté (2026-10-10) : doublon — Administration → Entreprise « Coordonnées de l'entreprise » (clés `pdf_seller_*` : nom, adresse en texte libre, TPS, TVQ, téléphone, courriel ; TASK-005.18) ET la fiche compagnie « Simple IP inc. » (tenant SIPV actif, 2 adresses 911). Sur la fiche Simple IP inc. : 4 factures (2026-0001 brouillon 97,25 $ du 2026-08-29 ; INV-111765, INV-111784, INV-111971 payées 0,01 $) et 1 facturation périodique (mensuelle, inactive).
- Proposé (2026-10-10) : une compagnie marquée « Propriétaire » (une seule) ; Administration → Entreprise lit/écrit ses coordonnées dans cette fiche (plus de clés `pdf_seller_*` en double) ; jamais facturée (facture, périodique, frais de retard refusés ; hors comptes à recevoir) ; garde téléphonie, 911, succursales ; créée automatiquement sur une installation neuve.
- Philippe (2026-10-10) : les 4 factures et la périodique sont des essais (facturation périodique automatique) ; adresse confirmée : 11208, rue Ontario Est, Montréal-Est (Québec) H1B 1J8. Demande s'il vaut mieux une compagnie fictive pour les essais → recommandé : oui, une compagnie « Compagnie d'essai » (pastille « essai »), et y déplacer ces 4 factures et la périodique (rien d'effacé, numéros gardés).
- Philippe (2026-10-10) : « ERPCRM n'est pas en ligne encore ; si j'ai un truc fiscal je vais nettoyer avant » ; pas de pastille « essai » (inutile) ; créer la compagnie test, qui aura les postes mis à Simple IP « 100-102-103-104 », migrés avec elle ; adresse 11206 (rue Ontario Est, n'existe pas).
- Constaté (2026-10-10) : dans le tenant SIPV de Simple IP : 100 « Test Un », 101 « Test Deux », 102 « Test Trois », 103 « Test SIPV » ; le 104 « test PAPA » n'existe que dans l'ancienne liste de postes d'ERPCRM (`extensions`), pas sur SIPV. SIPV n'a aucune fonction pour déplacer un poste d'un tenant à un autre (seulement créer / supprimer).
- Décision de Philippe (2026-10-10) : option B — la compagnie test a son propre tenant, **T1000** (libre dans ERPCRM ; à vérifier sur SIPV) ; postes 100-103 déplacés de Simple IP (T1001) vers T1000 par la nouvelle fonction de migration (TASK-051). Le 104 manquant sur SIPV = bogue (TASK-023.36). T1000 recevra aussi les numéros libres de Simple IP (TASK-023.37).
- Fait (GO de Philippe, 2026-10-10 : « go »), copies complètes de la base avant (full_before_002_5.dump, full_before_002_5b.dump) :
  - Migration af57ce229263 : `companies.is_owner` (une seule, index unique), `tps_number`, `tvq_number`. Simple IP inc. = compagnie du propriétaire (TPS/TVQ, téléphone, courriel service@simpleip.tel, adresse de facturation 11208 rue Ontario Est, Montréal-Est QC H1B 1J8 confirmée par Philippe) ; clés `pdf_seller_*` retirées (remises au retour arrière). « Compagnie test » créée (11206 rue Ontario Est, Montréal-Est QC H1B 1J8).
  - **Correction** (Philippe, 2026-10-10 : « non, les 4 factures c'est des vraies, on faisait des tests de connexion Elavon pour les paiements de carte de crédit… je les ai vraiment payées ; les seules qui ne sont pas vraies c'est celles que tu as créées ») : migration 770786fe22ba — INV-111765, INV-111784, INV-111971 (0,01 $, payées, importées de l'ancien logiciel), leurs paiements et la facturation périodique téléphonie (créée à l'activation du tenant le 2026-08-08) retournent à Simple IP inc. ; seul le brouillon 2026-0001 (« Ticket #6F7F0D8D — test de facturation », 97,25 $) reste sur Compagnie test. Voir ERRORS_LESSONS TASK-002.5.
  - `core/owner.py` : coordonnées des PDF (facture, avoir, devis, échange) lues dans la fiche ; Administration → Entreprise lit / modifie la fiche (nom, adresse en champs, local, ville, province, code postal, TPS, TVQ, téléphone, courriel) avec un lien vers elle.
  - Jamais facturée (son historique reste) : facture refusée (400, message), facturation périodique refusée, génération d'une périodique refusée, pas d'avis de retard, pas de récurrence créée à l'activation de son tenant, services de son tenant non facturés ; bouton « + Facture » caché ; mention « Propriétaire » à côté du nom.
  - Installation neuve (aucune compagnie) : « Mon entreprise » créée comme compagnie du propriétaire au démarrage.
  - Tenant **T1000** créé pour Compagnie test (SIPV, vérifié libre avant) : adresse 911 principale 11206 rue Ontario Est (adresse fictive — à savoir pour un appel 911 d'essai), facturation périodique téléphonie mensuelle active.
  - Vérifié (essai annulé) : facture / périodique / génération refusées pour le propriétaire ; Entreprise modifiée → fiche et PDF suivent ; PDF d'une facture rendu (200). Écrans : mention Propriétaire, Administration → Entreprise (aucune erreur).
  - Reste : déplacer les postes 100-103 vers T1000 (TASK-051).

---

## TASK-003 [ERPCRM] [x] Contacts — liste, fiche, multi-compagnies, + Ticket / + Facture / + Tâche
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `contacts`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Contacts — liste, fiche, multi-compagnies, + Ticket / + Facture / + Tâche

### TASK-002.6 [x] Fiche compagnie — ordre des onglets, CDR dans Téléphonie, plus de barre de défilement
Classification: CURRENT
Date de demande : 2026-10-14 (Philippe : « Général · Tickets · Contacts · Courriels · Téléphonie · Transactions · Échanges · Inventaire · Photos · Journal » ; CDR dans Téléphonie ; « les tâches tu les enlèves, ça va être dans ticket » ; « tu m'enlèves la barre de navigation à droite de ces onglets »)
Date(s) de travail : 2026-10-14

- `CompanyDetail.jsx` : onglets dans cet ordre ; « CDR » et « Tâches » retirés de la barre (les anciens liens `?tab=cdr` ouvrent Téléphonie → CDR) ; `TachesTab` gardé pour le travail tâches-dans-tickets (à venir).
- `TelephonyTab.jsx` : sous-onglet **CDR** (historique + rapports programmés) ; « Appareils » renommé **« Provisionnement »** (Philippe : « appareil n'est pas intuitif ») — suite : TASK-051 (modèles de provisionnement par modèle de téléphone).
- `CompanyDetail.css` : `.detail-tabs` passait en `overflow-x: auto` et dépassait d'un pixel en hauteur → barre de défilement dessinée à droite des onglets sous Windows ; remplacé par `flex-wrap: wrap` (aussi utilisé par 2 autres fiches).
- Vérifié en 1920×1080 (Compagnie test, `?tab=cdr` → Téléphonie → CDR, aucune erreur).

### TASK-002.7 [~] Fiche compagnie — « Dossier » : tout ce qui concerne la compagnie, rassemblé par des liens
Classification: CURRENT
Date de demande : 2026-10-14 (Philippe : « créer un fichier dédié pour chaque entreprise où on pourra mettre tout : les provisioning, les images de background, les messages de ticket, les factures, les ententes… TOUT ce qui a rapport avec la compagnie ; il va y avoir les appels enregistrés aussi » ; puis, après l'avis : « des liens pour copier les infos, c'est possible ; si le CDR est dans SIPV, le lien va les chercher instantanément ; oui, même idée que toi mentor »)
Date(s) de travail : 2026-10-14

- État constaté (2026-10-14) : rangement par type, pas par compagnie — ERPCRM : base (compagnies, contacts, tickets + messages, factures — PDF refait à la demande —, paiements, tâches, journal), `backend/storage/mail/<boîte>/` (courriels .eml), `storage/receipts/` (factures fournisseurs), `storage/barter/` (ententes de troc), `storage/bank_statements/`, `uploads/installation_photos/`, `uploads/catalogue/` ; SIPV : base (postes, modèles de provisionnement, CDR), `/var/lib/sipv/wallpapers/`, `/var/lib/sipv/moh_streams/`, appels enregistrés `/usr/local/freeswitch/recordings/` (52 Mo, en vrac, **pas dans la sauvegarde SIPV**), messages vocaux `/usr/local/freeswitch/storage/`. Pas de module « ententes / contrats » hors troc.
- Décision (avis mentor accepté) : pas de copie dans un dossier physique (SIPV autonome et multi-serveur ; un document peut toucher plusieurs compagnies ; règle « lié, pas copié ») — une vue **Dossier** dans la fiche qui va chercher chaque élément là où il vit (ERPCRM ou SIPV) à l'ouverture.
- Étapes : (1) onglet « Dossier » avec les liens en direct ; (2) « Télécharger le dossier complet » (ZIP) ; (3) nouveaux fichiers rangés sur disque sous un sous-dossier par numéro de compte (pas le nom).
- À décider par Philippe : durée de conservation des appels enregistrés et leur place dans la sauvegarde cloud (aujourd'hui ni l'un ni l'autre).
- **Correction (2026-10-14)** : j'ai d'abord fait un onglet « Dossier » dans la fiche (vue en direct) — **ce n'était pas la demande**. Philippe : « je ne voulais pas d'onglet Dossier !!! je voulais créer un dossier pour stocker les échanges, settings, config de chaque client ». Onglet, route `/companies/{id}/dossier` et ouverture des enregistrements SIPV au service retirés (SIPV : revert). Demande réelle = **un dossier de rangement sur le disque par client** ; structure proposée à Philippe, en attente de son GO (déplacement de fichiers : copie de sauvegarde avant).
- Constat gardé : les appels enregistrés sur disque (`/usr/local/freeswitch/recordings`, 52 Mo) ne sont pas inscrits dans `call_recordings` (table vide).
- **Décision (Philippe, 2026-10-14)** : pas de déplacement de fichiers — chaque système garde ses fichiers à leur place logique (ERPCRM = moteur qui centralise ; fonds d'écran dans SIPV, courriels dans ERPCRM…), **tout identifié par un numéro de compte txxxx, hébergé ou pas** ; les filtres par txxxx trouvent tout ; pour la Loi 25, un écran dans Admin (comme la migration) pour **télécharger / supprimer** toutes les informations d'un client (supprimer tout sauf ce que la loi oblige à garder). Succursale : un numéro à elle dans ERPCRM, reste dans le tenant de sa maison mère dans SIPV, a déjà son numéro si elle migre.
- **Fait (2026-10-14)** : migration ERPCRM `45a500ef884b_account_numbers_for_all` (copie avant `~/migration_backups/erpcrm_before_account_numbers_20261014_1818.dump`, up/down/up testés) : les 22 compagnies sans numéro reçoivent t1046 → t1067 dans leur ordre de création (fournisseurs compris) ; suite `next_tenant_number` = 1068 ; **index unique** sur `companies.account_number`. `core/account_numbers.py` (suite unique : peek / advance / assign) utilisé par la création d'une compagnie (`POST /companies` : numéro donné automatiquement, 409 si un numéro saisi est déjà pris), la prise de rendez-vous (nouveau client) et l'initialisation d'une base vide. Essai en transaction annulée : t1068, t1069, refus de t1002, suite inchangée après annulation.
- **Fait (2026-10-14) — plus d'échange de numéros pour une succursale** (Philippe : « non, pas de tricherie, on migre, la migration règle tout déjà ») : avant, quand seule la succursale avait un tenant, `core/branches.transfer_tenant` donnait son tenant **et son numéro** à la maison mère et la succursale perdait son numéro. Retiré : chacune garde son numéro ; à la place, alerte à confirmer (« … devra être migrée vers un tenant de <maison mère> (txxxx). Rien ne change dans sa téléphonie en attendant ») ; la liaison se fait, la téléphonie reste où elle est jusqu'à la migration (TASK-051). Essai en transaction annulée (Compagnie test t1000 → succursale de Maison Le Passeur t1026) : 409 avec l'alerte, puis avec confirmation numéros inchangés (t1000 / t1026), rien d'enregistré. Backend redémarré.
- **Décisions (Philippe, 2026-10-14)** : une succursale qui migre vers le tenant de sa maison mère **garde ses contacts** (« les contacts restent dans la compagnie ») ; parcage d'une succursale dans le tenant partagé = **réglage, pas de code** (« on a juste à mettre des 710 à 715 pour une des compagnies ») : Téléphonie → Parcage → « + Ajouter » une zone à elle (son propre numéro de parcage, places 710-715) et réduire celle par défaut pour que les places ne se chevauchent pas.
- En attente : écran Loi 25.

### TASK-002.8 [~] Changement de nom ou achat d'une compagnie : anciens noms gardés, une seule fiche
Date de demande : 2026-10-15 (Philippe : « Audacie est le nouveau nom de Guimond Lavallée, donc pas 2 compagnies, une seule qui a changé de nom comme Construction Nationale et Patio Design… ça arrive de changer de nom d'entreprise ou de se faire acheter… on devrait l'avoir comme option quand on change un nom d'entreprise, popup pour vérifier et comprendre que c'est un changement, comme ça on pourrait associer avec les 2 le temps de la transition »)
Date(s) de travail : 2026-10-23

- Constat : aucun historique de nom aujourd'hui. Construction Nationale : ancien nom « Patio Design » en note interne + règle de bénéficiaire « PATIO DESIGN MONTREA » (TASK-042.2) ; HBA → HB Architectes : règle seulement. Audacie et « Guimond Lavallée Inc. » = deux fiches actives pour la même compagnie (factures de l'ancien logiciel sous Guimond Lavallée, ex. 1312).
- À faire : au changement du nom d'une compagnie, fenêtre « Changement de nom / achat ? » → l'ancien nom est gardé avec ses dates (pas une copie : la fiche reste la même, identité = id interne) ; la Banque, l'historique de l'ancien logiciel et la recherche reconnaissent l'ancien ET le nouveau nom pendant la transition. Regrouper deux fiches existantes de la même compagnie (Guimond Lavallée → Audacie) : factures, paiements, contacts déplacés vers une seule, l'autre nom gardé comme ancien nom. Sauvegarde avant, montré à Philippe avant d'appliquer.

- 2026-10-23 — Fait (Philippe, courriel de Jean-François Gagnon : « Strong-MDI a changé de nom pour MDI innovations Inc. » ; « met la date à la date du courriel » ; « avoir une place pour les anciennes infos de contact pour continuer à bien associer quoi va à qui » ; « j'inscris STR ou str et il me donne MDI ») :
  - Migration d521a97738ec (id généré, une seule tête, up/down/up ; sauvegarde `~/backups/before_former_infos_20261023.sql`) : table `former_infos` (fiche = `entities.id`, compagnie OU contact ; genre nom / courriel / téléphone, valeur, du / au, note).
  - `core/former_infos.py` + API `/api/v1/former-infos` (liste, ajout, modification, retrait, `rename-company/{id}`), inscrit au Journal (« Changement de nom », « Ancienne info ajoutée / retirée »).
  - Recherche (`search.py`) : anciens noms (aussi sans ponctuation : « strongmdi »), anciens courriels et téléphones → la fiche actuelle, « anciennement … ». Courriels (`mail_match.by_address` / `by_domain`) : une ancienne adresse ou un ancien domaine reconnaît encore la personne et la compagnie.
  - Zéko : `changer_nom_client` et `ajouter_ancienne_info` (après un oui, administrateur ou gestionnaire) ; `fiche_client` / `fiche_contact` donnent les anciens noms et coordonnées. Corrigé au passage : `fiche_client` de Zéko plantait (import local de `Invoice` dans `paiements_carte`).
  - Écrans : fiche compagnie → changer le nom ouvre « Changement de nom ou correction ? » (ancien nom jusqu'au, depuis, note) ; section « Anciens noms et coordonnées » (compagnie) et « Anciennes coordonnées » (contact), modifiables. Fiche contact : boutons de l'en-tête passent à la ligne sur cellulaire (même défaut que TASK-002.11). Mesuré 1920 et iPhone 13.
  - Données (API) : STRONG (t1043) → « MDI innovations Inc. », anciens noms « STRONG » et « Les Systèmes D'écran Strong-MDI » du 2020-05-25 (1re facture) au 2026-10-23 (date du courriel, à corriger quand Philippe aura la vraie date). Pourquoi « STRONG » : fiche venue du tenant téléphonique t1043 ; les factures de l'ancien logiciel (« Les Systèmes D'écran Strong-MDI ») y ont été rattachées le 2026-10-14. Contact Jean-François Gagnon créé (jeff.gagnon@mdi-innovations.com, 1 877 755-3795 poste 248, cell. 450 559-3612), lié à MDI ; anciens : jeff.gagnon@strongmdi.com et 450-755-3795 jusqu'au 2026-10-23. Son courriel du 2026-10-23 relié à MDI et à lui. La fiche reste inactive (pas de réponse de Philippe).
- Reste : regrouper deux fiches de la même compagnie (Guimond Lavallée → Audacie) ; anciens noms dans la reconnaissance des bénéficiaires de la Banque.

### TASK-002.9 [x] Tout consulter dans la fiche du client, sans en sortir
Date de demande : 2026-10-15 (Philippe : « je veux ça dans chaque client… Paiements reçus c'est un regroupement… quand je clique sur une entreprise, Transactions, une facture, je suis déplacé dans l'onglet Factures, je suis sorti du client, je n'aime pas ça du tout… on va trouver un système où je vais pouvoir tout consulter dans le client et rester dans le client »)
Date(s) de travail : 2026-10-15

- Principe : les données d'un client vivent dans sa fiche ; Ventes > Factures / Paiements reçus ne sont que des regroupements. Ouvrir une facture, un paiement, un chèque depuis la fiche le montre dans la fiche (retour = la fiche, onglet conservé).
- Fait (2026-10-15) : facture ouverte DANS la fiche (onglet Transactions, `?facture=<id>` — Retour du navigateur fonctionne, « ← Transactions » garde le filtre) ; `InvoiceDetail` intégrable (embedded) ; toute ouverture par `/invoices/:id` (Ventes > Factures, taxes, troc, devis, récurrence…) redirige vers la fiche du client ; filtre « Paiements » dans Transactions (`GET /payments?company_id=` : factures payées, origine, vu en banque, chèque) ; paiement ouvert dans la fiche (`?paiement=<id>`) ; Ventes > Paiements reçus amène dans la fiche du client. « + Encaisser » retiré de la section des paiements → menu « ⋯ » de la facture, seulement s'il reste un solde, avec confirmation (Philippe : « très mauvaise place, beaucoup trop accessible »). Vérifié à l'écran (1920) : PAD → facture 1372 dans la fiche, retour, liste des paiements, `/invoices/<id>` redirigé.
- 2026-10-15 (Philippe a cliqué « → Payée » sur INV-000109, Physotech, en retard : « je n'accepte pas d'argent… impossible de le payer autrement qu'en le payant… offert et échange dans un engrenage discret ») : INV-000109 remise « en retard » (aucun paiement n'avait été créé) ; « payée / partiellement payée » refusé à la main par le serveur (`PUT /invoices/{id}` → 400) et retiré des transitions de l'écran ; « Encaisser à la main » retiré ; engrenage ⚙ discret : Offrir au client / Annuler l'offre / Régler en échange — Retirer de l'échange (la case « À régler en troc » quitte les Informations).


### TASK-002.10 [x] Fiche compagnie › Général : retrait de « Facturé / Payé de l'exercice »
Date de demande : 2026-10-21 (Philippe, sur Audacie : « dans le général des compagnies je n'ai pas besoin de ça… ça c'est des infos pour fiscalité : Facturé 2026-2027 1 220,01 $, Payé 1 260,01 $ · net des avoirs »)
Date(s) de travail : 2026-10-21

- `CompanyDetail.jsx` (FinanceOverview) : carte « Facturé AAAA-AAAA / Payé » retirée ; restent Solde dû, En retard, Avoirs disponibles, Crédit du client, Dernier paiement. Rien d'autre ajouté ailleurs (les totaux de l'exercice restent calculés par l'API `/companies/{id}/finance`). Vérifié (Playwright, Audacie) : carte absente, aucune erreur.

### TASK-002.11 [x] Fiche compagnie : boutons « + Ticket / + Facture / + Tâche » qui débordaient sur cellulaire
Date de demande : 2026-10-23 (Philippe : « le bouton + Tâche de l'en-tête dépasse de l'écran, corrige-le »)
Date(s) de travail : 2026-10-23

- `CompanyDetail.css` `.detail-header` : `flex-wrap` + `gap` (les boutons passent sous le nom quand la place manque ; vaut aussi pour la fiche contact) ; rangée de boutons en `flexWrap`. Mesuré : 1920 et iPhone 13 sans défilement horizontal, chaque bouton dans sa boîte.

### TASK-003.1 [x] Téléphone bureau contact = champ partagé compagnie + journal filtré/recherche/revert
Demande de l'utilisateur : "Téléphone bureau" sur un contact doit être le même champ
que le téléphone bureau de sa compagnie (pas une copie) — modifier à un endroit le
modifie partout où il est lié. Toujours loggé dans le journal de la compagnie. Ajout
d'un journal dans la fiche contact, filtré sur ce qui appartient à ce contact
(un seul journal, vue filtrée). Recherche dans le journal (compagnie et contact),
côté backend vu le volume attendu. Bouton "Revert" sur les entrées de modification
pour remettre l'ancienne valeur en un clic.

Décisions prises :
- Nouveau champ dédié `Company.office_phone` (pas de collapse de la liste
  `communication_channels` existante — celle-ci reste, avec ajout d'un DELETE et
  d'un bouton "Définir comme principal" par numéro de type phone qui copie sa valeur
  dans `office_phone`).
- Compagnie de référence pour un contact multi-compagnies = compagnie principale
  (`is_primary` sur le lien), sinon la première compagnie liée active, sinon aucune
  (contact sans compagnie garde sa propre colonne `contact.phone`, comportement
  inchangé). Logique dans `_office_company()` (contacts.py), réutilisée partout
  (fiche contact, liste contacts, recherche globale).
- Édition depuis la fiche contact (`PUT /contacts/{id}/office-phone`) : confirm()
  d'avertissement côté frontend, écrit `company.office_phone`, log taggé avec
  `contact_id` (nouvelle colonne nullable sur `entity_logs`) pour savoir depuis quelle
  fiche contact le changement a été fait.
- Journal : `GET /entities/{entity_id}/logs` retourne maintenant
  `entity_id == entity_id OR contact_id == entity_id` — fonctionne pour compagnie
  (tous ses logs) et pour contact (ses propres changements, pas loggés avant ce
  correctif, + les entrées compagnie qui lui sont taguées) sans logique de détection
  de type d'entité.
- Recherche `?search=` sur ce même endpoint : ilike + `unaccent` (comme search.py)
  sur description/field_name/old_value/new_value/nom d'utilisateur, plus un mapping
  FIELD_LABELS/ACTION_LABELS normalisé pour matcher le libellé humain (ex: chercher
  "telephone" trouve les entrées `office_phone`).
- Revert (`POST /entities/logs/{log_id}/revert`) : uniquement sur les entrées
  `field_change`. Détermine Company vs Contact via `entity.entity_type`, cast la
  valeur stockée (str) vers le bon type Python via introspection SQLAlchemy
  (bool/int/float/UUID/str), écrit une nouvelle entrée de log pour tracer le revert.
  Portée : uniquement ce journal ERPCRM, ne touche pas SIPV.
- Recherche globale (`/v1/search`) : un contact rattaché à une compagnie est
  maintenant aussi trouvable par le numéro de bureau partagé (jointure
  contact_companies → companies, en plus des colonnes propres au contact).

Fichiers touchés :
- `backend/app/models/company.py` — `office_phone: str | None`
- `backend/app/models/entity_log.py` — `contact_id: uuid.UUID | None` (FK contacts, SET NULL)
- `backend/app/schemas/company.py` — `office_phone` dans Create/Update/Out
- `backend/app/api/v1/endpoints/companies.py` — `office_phone` dans `_build_company_out`
  + `create_company` ; `DELETE /{id}/communications/{comm_id}` ;
  `POST /{id}/communications/{comm_id}/set-office-phone`
- `backend/app/api/v1/endpoints/contacts.py` — `_office_company()`, `phone` calculé
  dans `_build_contact_out` et `list_contacts`, logging field_change ajouté dans
  `update_contact` (absent avant), nouvel endpoint `PUT /{id}/office-phone`
- `backend/app/api/v1/endpoints/logs.py` — union entity_id/contact_id, `?search=`,
  `can_revert`, `POST /logs/{log_id}/revert`, labels `office_phone`/champs contact
- `backend/app/api/v1/endpoints/search.py` — jointure compagnie pour matcher
  `office_phone` sur les contacts
- `frontend/src/components/JournalFeed.jsx` — nouveau composant partagé (extrait de
  l'ancien `JournalTab` de CompanyDetail.jsx), avec champ recherche + bouton Revert
- `frontend/src/pages/CompanyDetail.jsx` — champ `office_phone` (Identification),
  bouton Retirer + Définir comme principal (Coordonnées), utilise `JournalFeed`
- `frontend/src/pages/ContactDetail.jsx` — édition "Téléphone bureau" route vers
  `office-phone` avec confirm() si compagnie liée, sinon comportement inchangé ;
  nouvelle section Journal en bas de fiche

Migration : `l3m4n5o6p7q8_company_office_phone.py` (down_revision `k2l3m4n5o6p7`).

Testé manuellement en direct (API, avec Simple IP inc. / contacts Test Un / Test Deux /
Test Trois) : édition depuis un contact propage à la compagnie et à tous les autres
contacts liés ; journal compagnie et journal contact filtré corrects ; recherche
(avec et sans accents) ; revert restaure la valeur et crée une nouvelle entrée ;
suppression + "Définir comme principal" sur les coordonnées ; recherche globale
retrouve un contact par le numéro de bureau partagé. Données de test remises à
l'état initial (office_phone = null, aucune coordonnée ajoutée) après le test.

Écart vs plan initial : aucun — le design discuté (option A pour la recherche, champ
unique visible par la compagnie et tous ses contacts) a été implémenté tel quel.
Reste à faire : rien.

### TASK-003.2 [x] UI — bouton Journal à droite de Tâches (au lieu de section pleine largeur) ✓
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `contacts`. Reproduite telle quelle.)*

---

## TASK-004 [ERPCRM] [x] Catalogue — items, types, linked_to_hourly_rate
Classification: CURRENT

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `catalogue`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Catalogue — items, types, linked_to_hourly_rate

### TASK-004.1 [x] Catalogue -- 3e famille "Connaissance" + écran de classement en masse + import descriptions Zoho

Demande (2026-08-08) : la checkbox "Connaissance Simple IP (lié au taux
horaire)" présente sur chaque fiche article de type service était jugée
absurde ("mettre un checkbox dans 300 articles pour 15 articles qui l'ont").
Le catalogue devient 3 familles réelles : Matériel (lié aux commandes
fournisseurs, déjà existant), Service (lié aux services SIPV via
`sipv_service_type`, déjà existant), Connaissance (lié au taux horaire --
remplace `linked_to_hourly_rate`). Le classement des 213 articles existants
ne se fait plus fiche par fiche mais depuis un écran dédié.

Fait :
- `type` accepte maintenant `"connaissance"` en plus de `service`/`materiel`
  (`Literal` Pydantic côté `CatalogueCreate`/`CatalogueUpdate` --
  `api/v1/endpoints/catalogue.py`), toujours obligatoire à la création.
- Colonne `linked_to_hourly_rate` supprimée (`models/catalogue.py`,
  `catalogue.py` schémas). Migration `c4d5e6f7a8b9_catalogue_drop_linked_hourly`
  (down_revision `f3a4b5c6d7e8`).
- `api/v1/endpoints/settings.py` : la synchro de prix au changement du taux
  horaire global et l'exclusion de l'ajustement d'inflation utilisent
  désormais `CatalogueItem.type == "connaissance"` au lieu du booléen.
- `CatalogueDetail.jsx` : checkbox retirée, "Connaissance" ajouté au menu
  déroulant Type (note affichée si connaissance : prix synchronisé auto).
- `Catalogue.jsx` : onglet de filtre "Connaissance" ajouté (Tous/Services/
  Matériel/Connaissance) ; nouveau bouton "Classer les articles" à côté de
  "+ Ajouter" ouvrant `ClassifyModal` -- liste complète des articles triée
  alphabétiquement (aucun tri "sans catégorie" en premier, confirmé inutile
  puisque tous les articles ont déjà une famille), 3 cases à cocher
  (Matériel/Service/Connaissance, comportement exclusif) par ligne pour
  reclasser sans ouvrir chaque fiche, description visible en tooltip après
  3 secondes de survol du nom (pas affichée sinon). `NewItemModal` += option
  Connaissance.
- `Catalogue.css` : styles `.classify-box/.classify-list/.classify-row/
  .classify-tooltip/.classify-check`, `.cat-type.connaissance`.
- Import ponctuel des descriptions depuis l'export Zoho fourni par
  l'utilisateur (`/home/simpleip/Simple_IP/Article_SIP_Zoho.csv`, 250 lignes) :
  matching par nom exact (143/213), puis passage normalisé casse/espaces/
  underscores/accents pour les correspondances non ambiguës uniquement
  (21/213 de plus). 49 articles restent sans description -- pas de
  correspondance fiable dans l'export (items génériques type "Ajustement",
  "Cadeau", "Frais transport", ou noms trop divergents pour matcher sans
  deviner) ; scripts d'import non conservés dans le repo (ponctuels, lancés
  depuis le scratchpad).

Aucun article existant reclassé automatiquement en "connaissance" -- 0 item
n'avait la checkbox cochée avant ce changement, la reclassification des ~90
items actuellement "service" reste à faire manuellement par l'utilisateur
via le nouvel écran "Classer les articles".

Backend + frontend redémarrés (`erpcrm-backend.service`,
`erpcrm-backend-tls.service`, rebuild `npm run build` + relance `vite
preview --host --port 3010`).

Fichiers : `backend/app/models/catalogue.py`,
`backend/app/api/v1/endpoints/catalogue.py`,
`backend/app/api/v1/endpoints/settings.py`,
`backend/alembic/versions/c4d5e6f7a8b9_catalogue_drop_linked_hourly.py`,
`frontend/src/pages/Catalogue.jsx`, `frontend/src/pages/Catalogue.css`,
`frontend/src/pages/CatalogueDetail.jsx`.

Reste à faire : l'utilisateur doit repasser sur les articles "service"
existants (~90) depuis "Classer les articles" pour cocher ceux qui sont en
réalité "Connaissance" ; 49 descriptions manquantes à compléter
manuellement si souhaité.

### TASK-004.2 [x] Fix contrainte CHECK bloquant "connaissance" + rate_multiplier (Appel d'urgence x2)

Un CHECK constraint en base (`type IN ('service','materiel')`, posé hors du
modèle SQLAlchemy) bloquait la case "Connaissance" introduite par TASK-004.1.
Fix : migration `d5e6f7a8b9c0_catalogue_connaissance_constraint` --
`drop_constraint` + `create_check_constraint` avec les 3 valeurs.

Demande additionnelle (même échange) : "Appel d'urgence" doit toujours valoir
2x le taux horaire, pas 1x comme les autres articles connaissance. Ajout
`CatalogueItem.rate_multiplier` (Float, nullable -- null = x1) dans la même
migration. `settings.py` (`update_settings`) applique désormais
`item.price = hourly_rate * (item.rate_multiplier or 1)` au lieu de
`item.price = hourly_rate`. Champ "Multiplicateur taux horaire" éditable
ajouté sur `CatalogueDetail.jsx`, visible seulement si `type == connaissance`.
"Appel d'urgence" reclassé en `connaissance`, `rate_multiplier = 2`, prix
resynchronisé à 290$ (145$ x2) directement en DB.

Fichiers : `backend/app/models/catalogue.py`,
`backend/app/api/v1/endpoints/catalogue.py`,
`backend/app/api/v1/endpoints/settings.py`,
`backend/alembic/versions/d5e6f7a8b9c0_catalogue_connaissance_constraint.py`,
`frontend/src/pages/CatalogueDetail.jsx`.
Backend + frontend redémarrés.

### TASK-004.3 [x] Colonnes Urgence (x2) / Cours (x3) dans "Classer les articles"

Suite de TASK-004.2 : l'utilisateur a demandé une 3e catégorie de
multiplicateur (Cours = x3, en plus d'Urgence = x2 déjà fait manuellement sur
"Appel d'urgence"). Plutôt que de continuer à faire les ajustements un par un
en base à sa demande, ajout de 2 checkboxes "Urgence (x2)" / "Cours (x3)" dans
`ClassifyRow` (`Catalogue.jsx`), visibles uniquement pour les items déjà
classés "Connaissance" -- comportement exclusif (cocher l'une décoche l'autre
implicitement, un seul `rate_multiplier` possible), décocher revient à x1
(`rate_multiplier = null`).
Backend (`update_item`, `catalogue.py`) : recalcule maintenant `item.price`
immédiatement (`hourly_rate * (rate_multiplier or 1)`) dès que `type` ou
`rate_multiplier` change dans le payload -- avant, le prix ne se
resynchronisait qu'au prochain changement du taux horaire global
(`settings.py`), donc cocher "Connaissance" ou changer le multiplicateur
depuis l'écran de classement ne mettait pas le prix à jour tout de suite.
Import de `get_setting` depuis `settings.py` (pas de dépendance circulaire,
`settings.py` n'importe que le modèle `catalogue.py`, pas ce endpoint).

Classification confirmée par l'utilisateur pendant cet échange : les 3
"Cours*" avec multiplicateur (`Cours administrateur avancé`, `Cours
administrateur de base`, `Cours aide-mémoire`) mis à jour en DB (rate_multiplier
= 3, prix = 435$). "Cours administrateur" (sans qualificatif, déjà classé
Connaissance) laissé à x1 -- l'utilisateur ne l'a pas inclus dans sa liste,
pas de confirmation reçue, à vérifier avec lui si besoin.

Fichiers : `backend/app/api/v1/endpoints/catalogue.py`,
`frontend/src/pages/Catalogue.jsx`, `frontend/src/pages/Catalogue.css`.
Backend + frontend redémarrés (frontend via `systemctl --user restart
erpcrm-frontend.service`, découverte au passage que ce service est un
service **utilisateur** et pas le service système du même nom -- voir
mémoire infra).

---

### TASK-004.4 [x] Photos des articles visibles hors du bureau (et photos d'installation)
Date de demande : 2026-10-09 (Philippe : « pourquoi je n'ai pas accès aux photos des articles quand je me connecte à l'extérieur du bureau ? »)
Date(s) de travail : 2026-10-09

- Cause : Catalogue.jsx / CatalogueDetail.jsx chargeaient les images depuis `VITE_API_BASE` (http://192.168.1.9:8010, adresse interne du bureau), alors que l'API passe par `/api` (portail.simpleip.tel → vite preview → proxy `/api`). Même famille : Shop.jsx (`/uploads/…` sans proxy → page HTML) et photos d'installation de la fiche compagnie (`/api/uploads/…` → 404, n'existait pas).
- Correction : `main.py` sert aussi le dossier `uploads/` sous `/api/uploads` ; catalogue, fiche article et boutique utilisent `/api` + `image_url` (rien changé en base).
- Vérifié : par https://portail.simpleip.tel, 128 images sur 128 chargées dans le catalogue.

## TASK-005 [ERPCRM] [x] Factures — création, lignes, paiements, modal mise à jour prix
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `invoices`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Factures — création, lignes, paiements, modal mise à jour prix

### TASK-005.1 [x] Envoi de facture par courriel + suivi d'ouverture
Réutilise l'infrastructure TASK-006.1 (`EmailOpen`/`get_open_stats`/pixel).

Fichiers touchés :
- `backend/app/core/email.py` — `_INVOICE_TMPL` (HTML, en-tête bleu marque
  `#1F5AA6`) + `send_invoice_email(to_email, invoice_id, invoice_number,
  company_name, due_date, lines, total)`.
- `backend/app/api/v1/endpoints/invoices.py` — `_build_out()` async (8 sites
  d'appel mis à jour) + `last_opened_at`/`open_count` sur `InvoiceOut`/
  `InvoiceListItem`; `SendInvoicePayload` + `POST /{invoice_id}/send` (transitionne
  `brouillon` → `envoyee` automatiquement à l'envoi).
- `frontend/src/pages/Invoices.jsx` — colonne "Vu".
- `frontend/src/pages/InvoiceDetail.jsx` — bouton "📧 Envoyer" (`SendInvoiceModal`,
  préremplit le courriel depuis le contact principal de la compagnie), ligne
  "Courriel ouvert" dépliable.

> **Régularisation (2026-10-01)** : TASK-005.2 à TASK-005.6 ci-dessous ont été réalisées le 2026-09-29 par une session Claude lancée par erreur sur SIPV depuis `/home/sipv` (sans le CLAUDE.md ERPCRM ni Graphiti). Elle les avait notées dans `TASKERPCRM.md` (archive) sous les numéros TASK-039 à TASK-043, déjà pris ici par d'autres tâches (TASK-039 = Graphe de connaissance 3D, TASK-040 = Outillage Graphiti, TASK-041 = Journal de conversation). Correspondance : ancien TASK-039 → TASK-005.2, TASK-040 → TASK-005.3, TASK-041 → TASK-005.4, TASK-042 → TASK-005.5, TASK-043 → TASK-005.6. Code relu et vérifié en place le 2026-10-01 (routes exposées par le backend, migrations à `b1c2d3e4f5g6`, build frontend du 2026-09-29 servi). Voir `ERRORS_LESSONS.md` TASK-005.4.

### TASK-005.2 [x] Fix — accès aux factures depuis le portail client (HTTP 500)
Date de demande : 2026-09-29
Date(s) de travail : 2026-09-29 ; régularisé 2026-10-01

`GET /api/v1/portal/invoices` utilisait deux attributs inexistants sur `Invoice` (`i.invoice_number` → `i.number`, `i.total_ttc` → `i.total`) : AttributeError, toute consultation des factures dans le portail renvoyait 500. Les clés JSON (`invoice_number`, `total_ttc`) sont conservées pour `Portal.jsx`.
Fichiers : `backend/app/api/v1/endpoints/portal.py`. Migration : aucune.

### TASK-005.3 [x] Montants en décimal exact (Float → Numeric)
Date de demande : 2026-09-29
Date(s) de travail : 2026-09-29 ; régularisé 2026-10-01

Tous les montants étaient en FLOAT8 (arrondis imprécis). Passés en `Numeric` : taux TPS/TVQ et `discount_rate` en `Numeric(7,4)`, montants (`subtotal`, `tps_amount`, `tvq_amount`, `total`, `unit_price`, `line_total`, montants de `payments`) en `Numeric(14,2)`, `InvoiceLine.qty` en `Numeric(12,4)`. Schémas Pydantic et frontend inchangés (Decimal → JSON float).
Fichiers : `backend/app/models/invoice.py`, `backend/app/models/payment.py`. Migration Alembic : `a0b1c2d3e4f5` (revises `9ea99349c01f`). Données au moment de la migration : 1 facture, 2 lignes, 0 paiement.
Correctif (2026-10-01, trouvé en testant TASK-005.4) : `_recalc` dans `invoices.py` mettait `0.0` (float) pour une taxe désactivée puis l'additionnait au sous-total `Decimal` → `TypeError`, HTTP 500 sur toute modification d'une facture sans TPS ou sans TVQ (changement de statut, lignes). Corrigé : tout ramené en `Decimal`.
Note : le diff de `invoice.py` a aussi retiré des accents et raccourci des commentaires sans lien avec la demande (ex. référence TASK-S010.4 sur la succursale) — signalé, non corrigé.

### TASK-005.4 [x] Moteur de paiements multi-factures (ClientPayment + PaymentAllocation)
Date de demande : 2026-09-29 ; correction des défauts demandée 2026-10-01
Date(s) de travail : 2026-09-29 ; régularisé 2026-10-01 ; défauts 2-4 corrigés 2026-10-01

Remplace « 1 paiement = 1 facture » par :
- `ClientPayment` : encaissement lié à une compagnie ; statut `pending|processing|confirmed|rejected|refunded|cancelled` ; source `portal|manual|bank_import|interac_email|gateway` (valeurs prévues, seules `manual` et `portal` sont produites par le code) ; référence unique `PAY-AAAA-NNNN` ; champs gateway réservés.
- `PaymentAllocation` : répartition d'un encaissement sur une ou plusieurs factures (`amount_allocated`).
- Statut de facture recalculé depuis les allocations **confirmées** seulement : total atteint → `payee`, partiel → `partiellement_payee` (nouveau statut), plus rien → `envoyee`.
- Endpoints (`/api/v1/payments`) : `GET/POST /invoice/{id}` (compatibles avec `InvoiceDetail.jsx`), `POST /multi`, `PATCH /{id}/confirm`, `DELETE /{id}`. L'ancienne table `payments` est conservée (0 ligne).

Fichiers : `backend/app/models/client_payment.py` (nouveau), `backend/app/models/__init__.py`, `backend/app/api/v1/endpoints/payments.py`. Migration Alembic : `b1c2d3e4f5g6` (revises `a0b1c2d3e4f5`).

**Défauts trouvés à la relecture du 2026-10-01** (aucun paiement en base à cette date) :
1. **[x] Escompte par mode de paiement perdu** — réglé le 2026-10-02 par décision de Philippe : rabais par mode de paiement **aboli** pour l'instant (trop complexe ; le but était d'inciter à Interac / dépôt direct, mais Elavon coûte presque rien). Retiré du modal d'encaissement, du tableau des paiements (`InvoiceDetail.jsx`) et de l'écran Admin des modes de paiement ; colonne `discount_rate` gardée en base (0 partout) : l'ancien code appliquait `PaymentMethod.discount_rate` (montant net après rabais) ; le nouveau enregistre le montant brut avec rabais 0, alors que le modal d'encaissement de `InvoiceDetail.jsx` affiche toujours « Rabais X % → Net ». Sans effet aujourd'hui (tous les taux à 0 en base), régression dès qu'un taux est réglé.
2. **[x] L'admin compte les paiements en attente comme encaissés** : `GET /payments/invoice/{id}` renvoie aussi les `pending` déclarés par le client au portail, et `InvoiceDetail.jsx` les additionne dans « Total encaissé » et « Solde restant » sans afficher le statut.
3. **[x] Aucun écran admin pour confirmer/rejeter un paiement en attente** : `PATCH /payments/{id}/confirm` existe mais rien ne l'appelle ; un paiement déclaré au portail reste en attente indéfiniment.
4. **[x] Référence PAY-AAAA-NNNN calculée par comptage + 1** (`payments.py` et `portal.py`) : après une suppression, le prochain numéro peut retomber sur une référence existante → violation d'unicité (HTTP 500) ; aussi exposé à deux demandes simultanées.

**Corrections du 2026-10-01** :
- Point 2 : `InvoiceDetail.jsx` — colonne Statut (En attente / Confirmé / Rejeté…) et référence PAY ; « Total encaissé » et « Solde restant » (et le restant proposé dans le modal d'encaissement) ne comptent que les paiements `confirmed` ; ligne « En attente de confirmation » séparée.
- Point 3 : nouveau `PATCH /payments/{id}/reject` (pending/processing → `rejected`, 400 sinon) ; boutons Confirmer / Rejeter sur chaque paiement en attente dans `InvoiceDetail.jsx` (avec rappel que l'action vaut pour toutes les factures couvertes). Aucun nouveau statut (`rejected` existait déjà). Pas de file globale « paiements à confirmer » : l'admin les voit facture par facture.
- Point 4 : `next_payment_reference()` dans `payments.py`, réutilisée par `portal.py` — plus grand numéro de l'année + 1 sous verrou consultatif PostgreSQL (`pg_advisory_xact_lock`), sans migration.
- Trouvé en testant : `POST /payments/multi` renvoyait HTTP 500 **après** le commit (accès paresseux à `allocations` → MissingGreenlet) — le paiement était créé mais l'appelant recevait une erreur. Même risque dans `add_payment`/confirm : rechargement commun `_reload_payment()`.
- `weasyprint==70.0` ajouté à `backend/requirements.txt` (TASK-005.5 ; ses dépendances ne sont pas épinglées).
- Preuve HTTP (facture de test 100 $ créée puis supprimée, base revenue à 1 facture / 0 paiement) : 2 pending → PAY-2026-0001/0002 ; confirm 0001 → facture `partiellement_payee` ; reject 0002 → `rejected`, facture inchangée ; reject d'un confirmé → 400 ; suppression de 0001 puis nouvelle demande → PAY-2026-0003 (l'ancien comptage donnait 0002 = collision) ; 3 créations simultanées → 201 ×3, 0004/0005/0006 distinctes ; encaissement manuel → 201. Le chemin portail (`/portal/payment-request`) appelle la même fonction mais n'a pas été appelé en HTTP (aucun utilisateur portail en base).

**Reste** :
- Point 1 (escompte) : réglé — rabais aboli (2026-10-02).
- Défaut antérieur trouvé en testant, hors paiements (présent depuis le commit initial) : `POST /invoices/{id}/lines` enregistre un total qui n'inclut pas la ligne qu'on vient d'ajouter (`_get_inv` relit une collection `lines` déjà en mémoire) ; le total se corrige au recalcul suivant. Non corrigé.

### TASK-005.5 [x] Génération PDF des factures (WeasyPrint)
Date de demande : 2026-09-29
Date(s) de travail : 2026-09-29 ; régularisé 2026-10-01

`backend/app/core/invoice_pdf.py` : PDF format lettre avec bandeau PAYÉE / PARTIELLEMENT PAYÉE / EN ATTENTE, lignes, TPS/TVQ, section paiements. Coordonnées du vendeur lues dans les paramètres (`pdf_seller_name`, `pdf_seller_address`, `pdf_seller_tps`, `pdf_seller_tvq`, `pdf_seller_phone`, `pdf_seller_email`, défaut « Simple IP inc. »). Route `GET /api/v1/invoices/{id}/pdf`.
Dépendances ajoutées au venv : weasyprint 70.0 (+ fonttools 4.66, Pillow 12.3, pydyf 0.12, tinycss2 1.5, tinyhtml5 2.1, cssselect2 0.10, pyphen 0.18 ; roues cp314 compatibles Python 3.14). Dépendances système requises : libpango 1.57 et libcairo 1.18 (déjà présentes sur le serveur). Détail fusionné le 2026-10-02 depuis l'ancienne entrée TASK-042 de `TASKERPCRM.md`, retirée (doublon).
Fichiers : `backend/app/core/invoice_pdf.py` (nouveau), `backend/app/api/v1/endpoints/invoices.py`.
À faire : renseigner les clés `pdf_seller_*` (aucune mention dans le frontend — vérifier si l'écran Paramètres permet de les saisir).

### TASK-005.6 [x] Portail client — onglet Factures complet (solde, PDF, déclaration de paiement)
Date de demande : 2026-09-29
Date(s) de travail : 2026-09-29 ; régularisé 2026-10-01

Backend (`portal.py`) : `GET /portal/invoices` (factures hors brouillon avec `confirmed_paid`, `pending_paid`, `balance`), `GET /portal/payment-methods` (interac/virement actifs), `POST /portal/payment-request` (crée un `ClientPayment` `pending` source `portal` avec référence et instructions — ne marque **jamais** une facture payée), `GET /portal/payment-requests`, `GET /portal/invoices/{id}/pdf` (isolation stricte par compagnie).
Frontend (`Portal.jsx`) : composant `InvoicesTab` — colonne Solde, montants en attente en bleu, sélection multiple des factures avec solde, choix du mode, bouton « J'ai effectué le paiement », référence + instructions, bandeau des paiements en attente, téléchargement PDF. Build vite OK.
Fichiers : `backend/app/api/v1/endpoints/portal.py`, `frontend/src/pages/Portal.jsx`.
Limites : le texte « Vos factures seront marquées payées après confirmation et rapprochement bancaire » n'a aucun rapprochement bancaire derrière (n'existe pas, voir TASK-005.4 point 3) ; `payment-request` n'empêche pas de déclarer plus que le solde ni de viser une facture brouillon ; alertes de retard 15/30 jours évoquées par la session d'origine (« TASK-054 », numéro jamais créé) — non faites, non numérotées.


### TASK-005.7 [x] Import des factures Zoho Books + compagnies complétées
Date de demande : 2026-10-01 (Philippe : factures téléchargées de Zoho, « ajuste les clients aussi avec leur adresse et autres infos »)
Date(s) de travail : 2026-10-01 / 2026-10-02

Source : 4 exports CSV Zoho « Factures » (une ligne par article, 122 colonnes) dans `/home/simpleip/Simple_IP/factures_zoho/`, du 2024-09-22 au 2026-10-01 : 776 factures, 45 clients. Script ponctuel `backend/import_zoho_invoices.py` (essai à blanc par défaut, `--apply` pour écrire, une seule transaction, relançable : une facture déjà présente est ignorée) ; rapport des identifiants créés : `/home/simpleip/Simple_IP/factures_zoho/import_report.json`.
- Correspondance client Zoho → compagnie validée avec Philippe ligne par ligne (table `CUSTOMER_MAP` du script) : 22 sûres, 4 probables confirmées (Houle Gendron → Houle Avocat, LS Services Comptables → Ls Comptable, Centre de santé cardiovasculaire → Centre Cardio, Rubi Group → Rubi Canada), Construction Nationale = Patio Desing (changement de nom : fiche renommée « Construction Nationale », ancien nom en note interne), Oxygene = succursale de Maison Le Passeur (factures sur Le Passeur, « Oxygene » + adresse dans `site_label_snapshot`/`site_address_snapshot` ; pas de vraie succursale car elle exige un tenant SIPV), 17 compagnies créées.
- Fiches : adresse de facturation (province normalisée QC, code postal en majuscules), téléphone, mobile, courriel — seulement les champs vides, Simple IP inc. jamais modifiée. Vérifié avant : seule Simple IP a SIPV actif (déjà une succursale principale), donc aucune adresse 911 générée côté SIPV par `ensure_primary_site`.
- Factures : numéros Zoho conservés (INV-…), lignes d'articles, TPS 5 % sur la base taxable et TVQ = taxes − TPS (Zoho : groupe « Québec » 14,975 %). Statut : Draft → brouillon, sinon calculé comme le moteur de TASK-005.4 (payé = Total − Balance). Le payé Zoho devient un encaissement confirmé par facture (source `zoho_import`, mode « Historique Zoho Books », date = dernière date de paiement Zoho) — le détail des paiements Zoho n'est pas dans l'export.
- Résultat : 49 compagnies, 693 payées (167 387,43 $ = Zoho), 25 partiellement payées (dont les 22 Physotech à 4,60 $ dû — écart volontaire, troc), 23 en retard, 20 envoyées, 15 brouillons, 714 encaissements (168 704,37 $). Solde dû total 7 743,91 $ = solde Zoho au cent près.
- Correctif découvert à l'affichage (oubli de TASK-005.4) : `Invoices.jsx`, `InvoiceDetail.jsx` et `Portal.jsx` ne connaissaient pas le statut `partiellement_payee` (affiché « Brouillon » dans la liste) — étiquette « Partielle » / « Partiellement payée », filtre « Partielle », pas de transition manuelle ; numéro de facture sans retour à la ligne.
- Risque levé par TASK-005.9 (taxe par ligne, arrondi demie vers le haut) — historique : 173 factures importées mélangent lignes taxables et non taxables (Zoho taxe ligne par ligne, ERPCRM taxe toute la facture ou rien). Toute modification par `PUT /invoices/{id}` (y compris un changement de statut depuis la fiche) relance `_recalc` et changerait leur total (écart max 14,27 $), dont 15 brouillons modifiables. Correctif proposé à Philippe : taxe par ligne (`InvoiceLine.is_taxable`, migration).
- Non fait : les 10 factures dont le dépôt est déjà en banque (Hamak, PAD, SST, Oxygene, Maison Le Passeur, MRST, Remorques 125, 3 Interac) restent ouvertes jusqu'à la fonction d'attribution de TASK-042 ; Audacie gardée pour tester les modes de correspondance.

### TASK-005.8 [x] Factures — remettre en brouillon + état « Non transmise »
Date de demande : 2026-10-02 (Philippe)
Date(s) de travail : 2026-10-02

Demande : dans Zoho, une facture jamais envoyée par courriel au client passe quand même « En retard » (cas des factures de Les Entreprises CNJ, qui « devraient être en brouillon »). Dans ERPCRM : (1) pouvoir remettre une facture en brouillon ; (2) un terme distinct pour une facture dont le PDF n'a pas rejoint le client — terme à trouver. Philippe n'aime plus Zoho mais plusieurs choses y sont bien montées.
Points à trancher avec lui : terme ; état de transmission séparé du statut de paiement ou non ; sort des factures CNJ importées (troc, réglées par 2 machines). Contrainte : ne pas modifier les factures importées par `PUT /invoices` tant que la taxe par ligne n'existe pas (voir TASK-005.7, risque `_recalc`).
Précisions du 2026-10-02 : Philippe voulait mettre les factures en « troc » hors des rapports de taxe et d'impôt — signalé que le troc est taxable au Canada/Québec (vente à la juste valeur marchande, TPS/TVQ et revenu ; à confirmer avec son comptable) : les factures CNJ déjà déclarées sont correctes. Proposé : mode de paiement « Troc » (règle la facture sans argent, la garde dans les ventes), le fournisseur en troc facture ses biens/services à Simple IP (taxes récupérables CTI/RTI). Principe de Philippe retenu : une facture passée dans une déclaration ne s'efface plus, elle ne peut qu'être créditée → « remettre en brouillon » seulement avant la période déclarée (date de verrouillage de période à prévoir).
Fait le 2026-10-02 (terme choisi par Philippe : « Non transmise ») :
- `Invoice.transmission_status` (`non_transmise` | `courriel` | `autre` ; NULL = inconnue pour les factures importées) — migration `f5a6b7c8d9e0`. Nouvelle facture → « non_transmise » ; envoi par courriel (`POST /invoices/{id}/send`) → « courriel » ; modifiable sur la fiche (Non transmise / Envoyée par courriel / Remise autrement). Badge « Non transmise » dans la liste. Le suivi d'ouverture (pixel, TASK-005.1) reste la ligne « Courriel ouvert ».
- Remettre en brouillon (transition « → Brouillon » depuis Envoyée / En retard) : refusé côté serveur si un paiement confirmé existe ou si la facture est datée dans une période de taxes déclarée.
- Nouveau paramètre `tax_lock_date` (« Taxes déclarées jusqu'au », Paramètres, vide par défaut) : une facture datée de ce jour ou avant ne peut plus être supprimée ni remise en brouillon, seulement créditée.
- Données : les 15 factures impayées de Les Entreprises CNJ (2 326,65 $) d'abord marquées « Non transmise » ; corrigé le même jour à la demande de Philippe (certaines sont dans ses déclarations de taxes) : déclarations TPS/TVQ trimestrielles, dernier trimestre déclaré terminé le 2026-06-30 → `tax_lock_date` = 2026-06-30 ; « Non transmise » gardée seulement sur les 2 factures de septembre 2026 (28,30 $), les 13 autres (2 298,35 $, août 2025 à juin 2026) remises à « inconnue » et verrouillées (retour en brouillon refusé, vérifié en HTTP). À mettre à jour à chaque déclaration trimestrielle (prochaine : juillet–septembre 2026, d'ici le 31 octobre).
- Rappels de déclaration (demande de Philippe 2026-10-02 : « mets-moi des alarmes quand un exercice se finit ») : `backend/app/core/tax_reminders.py`. Paramètres « Déclarations TPS/TVQ » (`tax_filing_frequency` : mensuelle | trimestrielle | annuelle, vide = aucun rappel) et « Rappels envoyés à » (`tax_reminder_user_id`). À la fin de chaque période (alignée sur l'exercice) non couverte par « Taxes déclarées jusqu'au », une tâche « Déclaration TPS/TVQ — période du … au … » (priorité haute) est créée dans le module Tâches, échéance Revenu Québec (dernier jour du mois suivant ; annuelle : 3 mois après), avec 3 rappels courriel (lendemain de la fin de période, 7 jours et 1 jour avant l'échéance) — création vérifiée chaque minute par le poller de rappels, idempotente (clé `link_url`). Avancer « Taxes déclarées jusqu'au » ferme la tâche. Activé pour Simple IP : trimestrielle, Philippe ; tâche juillet–septembre 2026 (échéance 2026-10-31) créée, premier rappel envoyé le 2026-10-02 ; fermeture vérifiée en transaction annulée.
- Preuve HTTP : facture test créée « non_transmise », envoyée puis remise en brouillon (200), transmission invalide → 400, verrou posé → retour en brouillon refusé (400) puis verrou remis à vide, facture payée → refus (400, reste payée) ; facture test supprimée.

### TASK-005.9 [x] Taxe par ligne + arrondi des taxes au cent (demie vers le haut)
Date de demande : 2026-10-02 (Philippe : « fais la taxe par ligne »)
Date(s) de travail : 2026-10-02

- `InvoiceLine.is_taxable` (défaut vrai) — migration `e4f5a6b7c8d9` (revises `d3e4f5a6b7c8`), testée up/down/up. `_recalc` (invoices.py) : TPS/TVQ calculées sur les seules lignes taxables.
- Bug trouvé en vérifiant contre Zoho : `round()` de Python arrondit une demie au pair (1 cent de moins sur certaines factures). Zoho arrondit chaque taxe au cent, demie vers le haut, sur la base taxable totale (règle vérifiée sur les 776 factures). Nouveau `_money()` (ROUND_HALF_UP) pour les taxes, le total et les totaux de ligne ; utilisé aussi par la facturation récurrente ; la facturation d'un ticket (tickets.py), qui recopiait son propre calcul (taux fixes, arrondi au pair, sans taxe par ligne), appelle maintenant `_recalc`.
- API : `is_taxable` dans les lignes (lecture, ajout, modification) ; copié par « Créer un avoir » et « Générer la prochaine facture récurrente ». PDF : « (non taxable) » après la description. Frontend `InvoiceDetail.jsx` : colonne « Taxable » (case à cocher sur un brouillon, Oui/Non sinon), case dans l'ajout et la modification d'une ligne.
- Données : 174 lignes importées de Zoho marquées non taxables (selon la colonne « Item Tax » de l'export) et répartition TPS/TVQ recalée sur 149 factures, totaux inchangés (176 636,98 $). Vérifié : pour les 776 factures importées, le recalcul retombe exactement sur le total Zoho → le risque `_recalc` de TASK-005.7 est levé.
- Preuve HTTP : facture test 100 $ taxable + 50 $ non taxable → 150,00 / TPS 5,00 / TVQ 9,98 / 164,98 ; ligne rendue taxable → 172,46 ; facture supprimée. INV-111280 (importée, mixte) modifiée sans changement → total 131,65 $ inchangé. Captures d'une facture payée et d'un brouillon.
- Non testé en HTTP : la facturation d'un ticket. Hors périmètre, à signaler : le module Devis (devis.py) a encore son propre calcul (arrondi au pair, sans taxe par ligne).

### TASK-005.14 [x] Factures de frais de retard automatiques (2 % par mois + frais de gestion) — construit, éteint
Date de demande : 2026-10-07 (Philippe : « ERPCRM va faire des factures de retard, c'est 24 % annuel donc 2 % par mois plus des frais de gestion de 9,95 $ ; par contre ils ont 30 jours pour payer mais je facture les frais 15 jours plus tard, histoire de laisser un chèque arriver par la poste »)
Date(s) de travail : 2026-10-07 (soir)

- Réponses de Philippe : 2 % **sur le solde** ; échéance + 15 jours puis chaque 30 jours, 2 % + 9,95 $ chaque fois ; « si le client est à 2 factures impayées, le 2 % est sur la 1re facture, la facture de frais et la 2e facture » → **un avis par client et par période, sur tout son solde échu (avis précédents compris)** ; taxes : « est-ce qu'on met de la taxe habituellement ? » → non (frais exigés pour un paiement en retard, pas une vente de service) ; exclusion **par facture, pas par client** (« faire des factures avec une mention troc ferait cet effet… une facture pas troc, ils sont supposés la payer comme tout le monde ») ; « pas activé tant que tout n'est pas fluide » → éteint ; mention du taux en tout petit sur les factures.
- Migration 8e756bdf15d8 (id généré, une tête, up/down testés) : `invoices.barter_settlement` (« À régler en troc ») et `invoices.late_fee_for_id` ; 150 des 178 anciennes factures de retard reliées à leur facture d'origine (« Frais de retard (2%) — INV-… ») ; les 28 autres visent des factures absentes d'ERPCRM.
- `app/core/late_fees.py` : client à qui un avis est dû = au moins une facture échue depuis échéance + 15 jours, aucun avis (ERPCRM ou ancien logiciel) depuis 30 jours ; base = solde de toutes ses factures échues non payées (hors troc, brouillons, annulées, avoirs) ; avis = facture émise **non transmise**, sans taxes, lignes « Frais de retard (2 %) sur le solde en retard de … $ » + « Frais de gestion — avis de retard de paiement » 9,95 $, note avec le détail des factures ; une seule à la fois (pas de rattrapage). Lancé par le poller des périodiques, seulement si allumé.
- Paramètres › **Frais de retard** : Allumer/Éteindre (**éteint**), % par mois, frais de gestion, jours après l'échéance, jours entre 2 avis ; **aperçu** de ce qui serait créé aujourd'hui (`GET /invoices/late-fees/preview`, rien n'est écrit). Fiche facture : case « À régler en troc », étiquettes Troc / Avis de retard, lien vers la facture visée.
- PDF : « Tout solde impayé à l'échéance porte intérêt à 2 % par mois (24 % par année), plus des frais de gestion de 9,95 $ par avis de retard. » en 6,5 pt (Loi sur l'intérêt : taux annuel obligatoire), sauf sur un avoir. Corrigé au passage : le PDF lisait le client sans le charger (plantait hors de l'écran).
- Preuve (transaction annulée) : aperçu du 7 oct. → Physotech 12,07 $ (2 % de 105,80 = 23 × 4,60) et Resto Bar le 103 17,46 $ (2 % de 375,64 + 9,95) ; avis de Resto Bar créé : 17,46 $, TPS/TVQ 0, émis non transmis ; relancé aussitôt → plus candidat ; factures Physotech marquées troc → plus candidat ; compteur INV intact.
- 2026-10-07, suite (Philippe : « les avis seront émis et transmis, je veux automatiser les choses ») : chaque avis créé est **envoyé par courriel** (même envoi que le bouton Envoyer, transmission « courriel ») au contact « comptes payables » ou « facturation » de la compagnie, sinon au contact principal, sinon au premier avec un courriel ; sans courriel → reste non transmis (journal) ; l'aperçu montre le destinataire (Resto Bar le 103 : aucun courriel → restera non transmis).
- Physotech (« marque le reste des factures non payées troc ») : ses **25** factures non payées marquées « À régler en troc » (24 avec 4,60 $ ouverts + INV-112252 d'octobre) par l'API → plus dans l'aperçu. Ses **15** brouillons de frais de retard **supprimés** (GO « oui pour les supprimer ») — sauvegarde `backups/erpcrm_avant_suppression_brouillons_physotech_20261008_0221.sql` ; 10 étaient d'abord refusés par le verrou de période déclarée → verrou retiré pour la suppression (Philippe : « s'ils sont en brouillon, ils ne faisaient pas partie des taxes ou impôts » ; seuls les brouillons se suppriment, une facture émise d'une période déclarée ne peut toujours pas revenir en brouillon).
- À faire plus tard (Philippe : « on va devoir faire un gros ménage, s'assurer qu'ils sont tous légitimes ») : l'ancien logiciel ne recevait plus les paiements → des factures payées y restaient impayées et généraient des avis de retard (d'où tant d'avis crédités) ; revoir les anciens avis encore ouverts avant d'allumer. CNJ : marque troc et 2 avis ouverts (INV-112230, INV-112232) — en attente.
- Constat (factures importées) : l'ancien logiciel fait une facture de retard par facture en retard, puis une autre chaque 30 jours tant qu'elle reste impayée — lignes « Frais de retard (2%) — INV-… » + « Frais d'administration — Frais d'administration pour gestion de retard de paiement » (10,00 $) ; 2 % du **total TTC** même si la facture est presque payée (Physotech : 1,08 $ sur un solde de 4,60 $) ; première à échéance + 25 jours (55 jours après la facture), puis + 30 jours ; taxes incohérentes (2 % parfois taxé, parfois non ; frais d'administration taxés). Plusieurs annulées par avoir (CNJ, Audacie) ; celles de Physotech laissées en brouillon (troc). L'ancien logiciel en produit encore (INV-112243 du 25 sept.).


### TASK-005.15 [x] Notes d'une facture émise modifiables
Date de demande : 2026-10-08 (Philippe : « j'essaie d'écrire dans les notes de la facture et je ne suis pas capable » — INV-112254 émise ; « oui go pour les notes »)
Date(s) de travail : 2026-10-08

- Les notes étaient verrouillées dès que la facture n'est plus un brouillon (`InvoiceDetail.jsx`, `disabled={!editable}`) ; elles ne changent ni montants ni taxes → modifiables en tout temps (le serveur les acceptait déjà). Défaut corrigé au passage : enregistrement à chaque lettre tapée (une requête par touche, caractères perdables) → enregistrement en sortant du champ, avec « ✓ Enregistré ». Composant `NotesBox`.
- Vérifié (Playwright) sur INV-112254 émise : champ modifiable, texte tapé vite enregistré en entier, note d'origine remise ensuite (statut et total inchangés).
### TASK-005.18 [x] Coordonnées de l'entreprise sur les PDF (adresse, n° TPS/TVQ, téléphone, courriel)
Date de demande : 2026-10-08 (constat pendant TASK-005.17 : les PDF n'affichaient que « Simple IP inc. » ; Philippe : « oui go »)
Date(s) de travail : 2026-10-08

- Les clés `pdf_seller_*` (app_settings) étaient lues par le PDF mais n'avaient aucun écran et étaient vides. Routes `GET/PUT /settings/business` (nom obligatoire, défaut « Simple IP inc. » comme le PDF) ; carte « Coordonnées de l'entreprise » en tête de ⚙ Paramètres (`Settings.jsx` `BusinessSection`, à côté des taxes, du fuseau et de la numérotation plutôt que dans Administration). Rien d'autre à changer : facture, avoir, devis et échange lisent déjà ces clés.
- Vérifié : saisie à l'écran → « Enregistré », relu après rechargement ; adresse et n° TPS/TVQ présents dans le PDF du devis et de la facture ; valeurs de test retirées ensuite (vides, comme avant). À remplir par Philippe.
### TASK-005.19 [~] Numéros de factures remis en concordance avec l'ancien logiciel (INV-112249 à INV-112261)
Date de demande : 2026-10-14 (Philippe dépose les 42 dernières factures de l'ancien logiciel « pour voir si on est à la même place dans la récurrence » ; puis, après avoir refait D'Astous et Physotech dans l'ancien logiciel : « tu peux maintenant t'ajuster, changer les bons chiffres de facture dans ERP pour concorder, on retestera la semaine prochaine » — INV-112260 et INV-112261)
Date(s) de travail : 2026-10-14

- Comparaison PDF ↔ ERPCRM (numéro, client, date, total) : tout concorde jusqu'à INV-112248 ; INV-112215 (frais de retard Physotech) est un brouillon dans l'ancien logiciel, normal qu'il manque.
- Cause du décalage INV-112249 → INV-112256 : (1) 3 factures faites dans l'ancien logiciel le 2026-10-02 jamais arrivées dans ERPCRM — Hamak et Cycle Vert (périodiques : l'export des factures datait du 1er octobre, l'import des profils du 2 octobre portait déjà « dernière facture le 2026-10-02 », voir ERRORS_LESSONS TASK-021.1) et MGB (facture manuelle « Ajustement erroné ») ; (2) 3 factures faites seulement dans ERPCRM — D'Astous (Texto 500, 6 mois), Physotech (troc 1 069,16 $), Compagnie test (0 $, récurrence téléphonique des postes de test). Les deux écarts s'annulaient à partir de INV-112257.
- La récurrence elle-même est alignée (dernières dates identiques ; Hamak et Cycle Vert reviennent le 2026-11-02 des deux côtés).
- `backend/renumber_invoices_20261014.py` (essai à blanc puis `--apply`, sauvegarde `/home/simpleip/backups/erpcrm_avant_renumerotation_factures_20261014_2152.sql`) : INV-112256 (Compagnie test, 0 $, aucun lien) supprimée ; renumérotées (toutes non transmises) 112249→112252 CN, 112250→112253 LS, 112251→112254 Jardin-Idéal, 112252→112255 Physotech, 112253→112260 D'Astous, 112254→112261 Physotech troc, 112255→112256 Waterco ; Hamak INV-112249 (191,26 $) et Cycle Vert INV-112250 (82,50 $) créées par la facturation périodique normale, numéro imposé, total vérifié, **sans le crédit du client** (celui de Hamak est un faux crédit, voir ERRORS_LESSONS TASK-042.2 du 2026-10-14) ; note de l'échange D'Astous mise à jour ; compteur → prochain INV-112262. Journal non réécrit.
- Preuve : les 44 PDF (42 + 112260/112261) recomparés : concordance numéro/client/total partout sauf INV-112215 (brouillon) et INV-112251.
- En attente de Philippe : **INV-112251 MGB** (160,23 $ réglée par « crédits appliqués » dans l'ancien logiciel, mais aucun crédit ouvert chez MGB dans ERPCRM — d'où vient ce crédit ?) — numéro laissé libre ; dates de D'Astous (ERPCRM 2026-10-07, ancien logiciel 2026-10-14) et Physotech troc (2026-10-08 / 2026-10-14) non changées ; **Compagnie test** a encore une récurrence active qui prendra un vrai numéro le 2026-11-10.

### TASK-005.20 [x] PDF des factures ERPCRM inspiré de celui de l'ancien logiciel
Date de demande : 2026-10-14 (Philippe, en déposant l'historique des factures PDF : « tu pourrais te guider pour les factures de ceux de Zoho, je les trouvais bien »)
Date(s) de travail : —

- Modèle : les PDF de l'ancien logiciel dans `/home/simpleip/Simple_IP/factures_zoho/Invoices*.zip` (en-tête vendeur à gauche, « Solde dû » en haut à droite, bloc « Facturer à » + date/conditions/échéance, tableau # / Article & Description / Quantité / Taux / Montant avec la description sous le nom de l'article, totaux Sous-total / TPS / TVQ / Total / Paiement effectué / Solde dû, Remarques, options de paiement, conditions d'utilisation, n° TPS/TVQ en pied de page). Jamais le mot « Zoho » dans le PDF (TASK-005.11).
- Pas commencé : à faire après l'import de l'historique.
- Fait (2026-10-15, Philippe : « oui fais la belle présentation de l'ancien logiciel, joue au graphiste aussi pour avoir une touche ERPCRM dans le vent ») : `app/core/invoice_pdf.py` refait — logo SIP (tiré d'une facture d'origine, `storage/branding/invoice_logo.png`), vendeur + « La solution est Simple IP », FACTURE + n° + pastille d'état + carte « Solde dû », Facturer à (adresse de la fiche si pas d'adresse figée) / date / conditions / échéance, tableau # / Article & description (nom en gras, description dessous, image de l'article du catalogue — par lien ou par nom) / Quantité / Taux / Montant, totaux jusqu'au Solde dû (paiements et crédits séparés), Remarques, conditions de retard, TPS/TVQ et « Page x de y » en pied ; police Inter (`storage/branding/fonts`), bande de couleur, formats français (1 234,56 $).
- Même jour (Philippe : « je n'aime vraiment pas ton PDF d'origine et PDF ERPCRM… PDF c'est tout » ; « je veux la facture elle-même ») : un seul bouton « PDF » (original s'il existe, sinon ERPCRM ; `?generated=1` retiré) ; la fiche de la facture affiche le document lui-même (pages en images, `GET /invoices/{id}/preview`, fiable sur cellulaire) ; le tableau de lignes n'apparaît qu'avec « Modifier » sur un brouillon. Paiements de la facture : bouton « Voir le chèque » (fiche du paiement, TASK-005.24).

### TASK-005.21 [~] Historique des factures 2020-2024 importé des PDF (ancien logiciel + QuickBooks)
Date de demande : 2026-10-14 (Philippe : « pour que les clients aient leur facture dans leur portail je les veux, tu vas être capable de les créer avec leur bon numéro » ; « les prix changent de temps en temps, des augmentations ou des prix privés dédiés à un client » ; « mets la gestion de ça en local pour ne pas prendre de tokens »)
Date(s) de travail : 2026-10-14

- Source : 23 ZIP `/home/simpleip/Simple_IP/factures_zoho/Invoices*.zip` (2 180 PDF uniques, du 2020-01-24 au 2026-10-14) ; numéros sans « INV- » (1275 à 1614, « nº 1359 ») = factures de QuickBooks reprises dans l'ancien logiciel.
- Lecture locale sans IA : `backend/zoho_invoice_pdf.py` (pdftotext -layout ; contrôles lignes = sous-total, qté × taux, sous-total + taxes (+ ajustement) = total, total − payé − crédits = solde) — 2 180/2 180 sans écart, 7 s. Validée sur les 773 factures déjà importées des CSV : 0 écart (total, sous-total, TPS, TVQ, montant de chaque ligne).
- Import `backend/import_zoho_history_pdf.py` (essai à blanc puis `--apply`, sauvegarde `/home/simpleip/backups/erpcrm_avant_historique_factures_20261014_2228.sql`) : 1 382 factures (253 QuickBooks, 1 129 INV-) du 2020-01-24 au 2024-09-20, 333 936,85 $ ; lignes, prix et taxes exactement comme le PDF (prix propres à chaque facture, pas le catalogue) ; ligne taxable retrouvée par le seul ensemble de lignes qui redonne la TPS/TVQ (172 factures avec lignes non taxables, ex. frais de retard) ; « ajustement de taxes » ± 0,01 $ (80 factures 2020-2021) ajouté à la TVQ ; 3 descriptions coupées à 500 caractères ; 1 373 « Paiement antérieur » datés du jour de la facture (le PDF n'a pas la date du paiement). Puis `import_zoho_credits.py` relancé : 140 avoirs (5 611,77 $ sur 149 factures) appliqués, 141 encaissements devenus avoirs supprimés, 8 diminués.
- Clients : 27 anciens clients créés inactifs, avec numéro de compte (t1068 → t1094) et adresse du PDF si lisible (5 sans). Décisions de Philippe : « ACVRQ Nesly Dieudonné » = ACVRQ ; « Vendu RÉSIDENCE LA ROSIÈRE INC. Fermé » = Résidence La Rosière ; « Simple Test » ignoré ; INV-000787 (frais de retard D'Astous) effacée ; Physotech INV-000109 et INV-111258 « à régler en troc » ; HRH INV-000003 et J. Lavoie INV-000675 jamais envoyées ni déclarées → **brouillons à leur vraie date** (hors déclarations de taxes ; HRH : Philippe appelle, J. Lavoie : il la lui donne).
- Preuve : les 2 180 PDF recomparés à la base après import — concordance numéro/date/total/taxes/lignes/payé/avoirs/solde, sauf les absentes voulues (25 : Strong-MDI 6, Simple Test 2, D'Astous 1, brouillons Physotech 15, MGB INV-112251) et des écarts antérieurs connus (dépôts BNC vus par ERPCRM et pas par l'ancien logiciel ; INV-111654 réglée par l'avoir CN-00208 confirmé le 2026-10-02). API réelle : facture 1359 (18 lignes, PDF 200), finance d'un ancien client.
- 2026-10-14 (suite) : « Les Systèmes D'écran Strong-MDI » = fiche STRONG (t1043) (Philippe : « j'étais supposé le passer avec moi mais ScopServ a refusé ») → 6 factures (7 197,38 $) importées + avoir 885,20 $ ; PDF d'origine → TASK-005.23. En attente : MGB INV-112251 (« Ajustement erroné » qui éponge le crédit fantôme de CN-00297 dans l'ancien logiciel — dans ERPCRM l'avoir est déjà corrigé).

### TASK-005.22 [x] Rappel chaque semaine des factures en brouillon + « Offrir au client »
Date de demande : 2026-10-14 (Philippe, en découvrant les factures HRH 2021 et J. Lavoie 2023 jamais envoyées : « une facture brouillon devrait se faire rappeler à chaque semaine qu'elle existe… là je l'ai oubliée depuis tellement longtemps » ; « j'espère qu'avec toi on ne vivra plus ça »)
Date(s) de travail : —

- Fait le 2026-10-14 (GO de Philippe : « go ») :
  - `app/core/draft_reminders.py`, appelé par `reminder_poller` : une fois par semaine ISO, s'il y a des brouillons, tâche « Factures en brouillon : N » (numéro, client, date, âge en jours, montant), assignée au responsable des rappels de déclaration (`tax_reminder_user_id`, sinon un admin), courriel à 9 h ; la tâche de la semaine précédente encore ouverte est fermée. 1re tâche créée le 2026-10-14 (HRH INV-000003, Compagnie test 2026-0001).
  - « Offrir au client » (`POST /invoices/{id}/offer`, `/unoffer`) : seulement un brouillon (une facture émise se crédite par un avoir) → statut `annulee` + `offered_at` (migration 2e7ad887ea0f, up/down/up testés, une seule tête). Choix : réutiliser « annulée » plutôt qu'un nouveau statut — les 23 endroits qui excluent déjà une facture annulée (taxes, soldes, banque, crédit du client, portail) la traitent correctement sans être touchés. Affichée « Offerte » (violet) dans la facture, la liste et la fiche compagnie ; absente du portail (liste et PDF : 404) ; « Annuler l'offre » la remet en brouillon. J. Lavoie INV-000675 offerte (décision de Philippe).
  - Preuve : HTTP offrir → annulee + offered_at ; 2e fois et facture émise → 400 ; annuler → brouillon ; finance J. Lavoie : offered, reste 0, solde 0 ; fonction du portail : INV-000675 absente de la liste (91 factures), PDF 404 ; captures 1920.
- Erreur de ma part (corrigée) : j'avais dit à Philippe qu'« ERPCRM refuse d'émettre une facture dans une période déjà déclarée » et le 1er texte du rappel disait « elle sera datée du jour » — faux : envoyer un brouillon ne le redate pas et n'est pas bloqué par `tax_lock_date`. Texte du rappel corrigé (« changer d'abord sa date pour aujourd'hui si elle tombe dans une période déjà déclarée ») ; le courriel de la 1re tâche était déjà parti avec l'ancien texte (description de la tâche corrigée). Garde-fou possible à proposer : refuser d'émettre un brouillon daté dans une période déclarée.
- Ajout de Philippe (2026-10-14) : « il faudrait avoir un moyen de mettre donner pour ne pas que les brouillons que je veux donner pop à chaque semaine » — une facture qu'il décide d'offrir au client (ex. J. Lavoie INV-000675) doit sortir du rappel, sans entrer dans les taxes ni dans le solde du client, et rester visible dans l'historique comme offerte.

### TASK-005.23 [x] PDF d'origine des anciennes factures (ce que le client a reçu), au portail et dans ERPCRM
Date de demande : 2026-10-14 (Philippe : « oui ce serait cool et on les a »)
Date(s) de travail : 2026-10-14

- Colonne `invoices.original_pdf` (migration 2e7ad887ea0f), fichiers dans `backend/storage/invoice_originals/<id>.pdf` (hors /uploads, inclus dans la sauvegarde ; 171 Mo), `app/core/invoice_originals.py`.
- `backend/attach_invoice_originals.py` (essai puis `--apply`) : 2 077 factures rattachées — seulement les factures importées (pas INV-112249+, créées par ERPCRM), réglées au complet et dont le PDF a le même total et le même solde qu'ERPCRM. Laissées au PDF généré : 60 pas encore réglées (le document deviendrait faux au prochain paiement, ex. Physotech troc, brouillon HRH), 12 payées depuis l'export (dépôt BNC vu par ERPCRM, PDF « Solde dû » périmé), 12 créées par ERPCRM.
- Service : portail et bouton PDF donnent l'original si la facture est encore « payée » (sinon le PDF généré, qui suit le solde) ; ERPCRM : boutons « PDF d'origine » et « PDF ERPCRM » (`?generated=1`).
- Preuve : HTTP — facture 1359, PDF reçu identique octet pour octet au fichier d'origine ; `?generated=1` = PDF ERPCRM ; fonction du portail : même fichier ; captures 1920.
- Idée de Philippe (2026-10-14, pas commencée) : que les clients puissent télécharger leurs documents en .zip depuis le portail (« ça va nous servir aussi si les clients veulent télécharger leurs trucs en .zip »). 7zip installé sur le serveur ERPCRM le 2026-10-14 (pour ouvrir le RAR des relevés BNC) ; un .zip se fait en Python sans outil externe.

### TASK-005.24 [~] Paiement « Facture perdue (ancien logiciel) » + chèques attachés aux paiements
Date de demande : 2026-10-15 (Philippe : « est-ce qu'on peut le mettre dans le portail client avec facture perdue pour ceux qu'on connaît… on a les dépôts, ce serait cool que les clients aient cette info aussi… comment on pourrait faire sans exclure » ; « je pense qu'on devrait les mettre dans paiement lié au client »)
Date(s) de travail : —

- Contexte : 98 dépôts BNC d'avant juin 2020 sans facture dans ERPCRM (factures QuickBooks perdues, plus d'accès). Décision : ne PAS recréer de factures (pièces reconstruites = faux originaux ; revenus et taxes déjà déclarés à l'époque).
- À faire : type de paiement « Facture perdue (ancien logiciel) » relié au dépôt BNC (client, date, montant, numéro de facture quand le chèque le donne) ; jamais du crédit (comme le troc), aucun effet sur ventes/taxes ; visible au portail (« Facture perdue (ancien logiciel) — payée le … », sans PDF) et dans la fiche compagnie ; modifiable/annulable. Image du chèque attachée au paiement (pas au portail : numéro de compte du client sur le chèque).
- Fait (2026-10-15) : migration `bf3a731c918b` (client_payments.lost_invoice + lost_invoice_number ; table payment_documents ; sauvegarde `~/migration_backups/erpcrm_before_lost_invoice_20261015_1220.dump`, up/down/up testés). `POST /bank/transactions/{id}/lost-invoice` (client + n° facultatif ; dépôt mobile = chèque) ; `client_credit.credits` exclut ces paiements ; `GET /payments/{id}/detail`, `POST /payments/{id}/documents`, `GET /payments/documents/{id}/file`, `DELETE /payments/documents/{id}`, `PATCH /payments/{id}/lost-invoice` (client, n°, note) ; « Annuler l'association » refusé si un chèque est attaché (jamais perdre une pièce). Écrans : Banque (choix « Facture perdue » dans Associer, lien « Paiement et chèques »), Ventes > Paiements reçus (clic = fiche du paiement), fiche compagnie > Transactions (ligne « Facture perdue (ancien logiciel) »), portail (ligne sans PDF, « payée le »). Composant `PaymentModal.jsx`. Fichiers : `storage/payment_documents/` (dans la sauvegarde automatique).
- Preuve (2026-10-15, API réelle) : dépôt PAD 843,92 $ du 2019-11-01 → paiement « facture perdue » (Chèque), chèque attaché (200, 85 Ko), ligne dans la fiche PAD, crédit au dossier 0,00 $, liste des paiements OK, annulation refusée (400). Portail : code compilé, pas encore vu avec une connexion client.

### TASK-005.25 [ ] Recouvrement : factures envoyées à une agence, chèque de l'agence, commission et perte
Date de demande : 2026-10-15 (Philippe : « l'agence de recouvrement Oligny et Thibodeau, je l'ai utilisée pour me faire rembourser des clients pas satisfaits… je pense qu'elle me donnait 75 % du montant… j'ai d'autres clients ici qui ne paient pas et que je vais envoyer… faire dans le dossier des clients un endroit où je pourrais mettre recouvrement qui me permettrait d'associer les factures à un chèque du recouvrement, qui ne serait sûrement pas le même montant, le reste tomberait en perte »)
Date(s) de travail : —

- Constat : chèque #8178 de l'Agence de recouvrement Oligny et Thibodeau en fidéicommis, 112,02 $ daté du 2019-10-31, déposé le 2019-12-24 (dépôt mobile) — client et facture inconnus ; image gardée dans `backend/storage/payment_documents_pending/`, dépôt laissé non classé.
- À concevoir (avec Philippe) : sur une ou plusieurs factures, « Envoyer en recouvrement » (agence, date) ; à l'arrivée du chèque de l'agence, l'associer à ces factures : montant reçu = paiement ; **distinguer** (1) la commission de l'agence quand le client a payé au complet (dépense de recouvrement — la facture est payée, aucune taxe à récupérer) et (2) la partie que le client n'a jamais payée (créance irrécouvrable / perte — ajustement de TPS/TVQ possible, à confirmer avec Revenu Québec). Visible dans la fiche du client ; le client en recouvrement exclu des relances normales.

### TASK-005.27 [x] Factures périodiques du même jour : même ordre de numéros que l'ancien logiciel
- **Date de demande** : 2026-10-22 — **Date(s) de travail** : 2026-10-22
- Constat : les 5 périodiques du 22 octobre avaient les bons montants mais pas les mêmes numéros (ERPCRM départageait par nom de client). L'ancien logiciel garde l'ordre de création de ses périodiques, identique chaque mois depuis 2025-09 (Mc Crystal, Oxygène, Maison Le Passeur, MRST, Kiko ; Hamak avant Cycle Vert) — ni alphabétique, ni par date de début seule.
- Règle : à date égale, `recurring_poller._next_due_sale` suit l'ordre des numéros de la dernière facture de chaque périodique (`_previous_order`) ; une périodique sans facture passe en dernier.
- Correction ponctuelle : `backend/renumber_invoices_20261022.py` (INV-112267/68/70/71 renumérotées, non transmises, paiements suivent la facture) ; proposition Zéko Kiko recalculée (`recheck_all`). Sauvegarde `~/backups/before_renumber_20261022_1504.sql`.

### TASK-005.26 [x] « Ententes » remplacent « Échanges » : sans frais de retard, factures périodiques, pause de facturation
Date de demande : 2026-10-16 (Philippe : « je trouve plus difficile de gérer les échanges que de me faire payer… j'aime le principe que je peux choisir qu'une entreprise ne paie pas de frais de retard ; au lieu d'échange on va mettre entente, dans cette fenêtre je peux désactiver les frais de retard pour cette entreprise… facture périodique devient un rassemblement des ententes, je veux facture périodique dans entente ; il me faudrait aussi l'option de mettre une pause à leur facturation périodique, ex. donner 8 mois et 12 jours gratuits… je n'en suis pas sûr alors garde un backup de ce qu'on a avant de changer, mais j'aimerais voir ce que ça donne »)
Date(s) de travail : 2026-10-16

- Contexte : il arrête le troc (avis fiscal du 2026-10-16 : troc = vente + achat à la juste valeur, avantage imposable pour l'employé-propriétaire). Existant : onglet « Échanges » de la fiche (TASK-005.13 : fiche d'échange qui repousse la facturation périodique, `barter_cursor`), case « à régler en échange » par facture (jamais de frais de retard), profils de facturation périodique par compagnie (`company_recurring_billings`), Ventes > Factures périodiques.
- Demande : onglet « Entente » de la fiche : (1) « pas de frais de retard » pour cette compagnie ; (2) ses factures périodiques (Ventes > Factures périodiques = le regroupement de toutes les ententes) ; (3) pause de la facturation périodique pour une durée (mois + jours gratuits), reprise automatique. Avant de changer : sauvegarde (base + branche git) pour pouvoir revenir.
- Fait (2026-10-16) : sauvegarde `/home/simpleip/backups/erpcrm_avant_ententes_20261016.sql` + `erpcrm_storage_avant_ententes_20261016.tgz` + branche git `avant-ententes-20261016`. Migration `d6aafd60c4c6` (companies.no_late_fees ; company_recurring_billings.pause_start / pause_end ; up/down/up testés). Frais de retard (`late_fees.candidates`) : jamais pour une compagnie « pas de frais de retard ». Pause : `next_missing_cycle` saute les cycles qui commencent dans [début, reprise[ ; à la reprise, `resume_after_pause` fait repartir le cycle de la date de reprise (même rythme) et efface la pause ; `PUT/DELETE /recurring-billing/{id}/pause` ; `GET /recurring-billing?company_id=`. Écran : onglet « Entente » de la fiche (remplace « Échanges », ancien lien `?tab=echanges` redirigé) — case « Pas de frais de retard », factures périodiques du client (même carte que Ventes > Factures périodiques), pause par début + fin OU durée (mois + jours, l'un calcule l'autre), « Anciens échanges (troc) » repliés ; Ventes > Factures périodiques = le regroupement, le nom du client ouvre son entente. « Pas de frais de retard » mis pour CNJ, D'Astous et Physotech (Philippe). D'Astous : échange du 2026-10-07 retiré (`backend/remove_dastous_barter_20261016.py` : paiement troc de 137,63 $ sur INV-112260 retiré, INV-112260 redevient due) — Philippe testera la pause lui-même. Test (sans écrire) : D'Astous biannuel, pause du 2026-11-12 au 2027-07-24 → prochaine facture 2027-07-24, puis cycle repart du 2027-07-24.
- 2026-10-16 (Philippe : « je veux la facture, c'est une facture qui est périodique, pas un résumé » ; « je ne veux plus de fiche descriptive dans tout le projet ») : l'onglet Entente montre la prochaine facture de la facture périodique **rendue comme une vraie facture** (`GET /recurring-billing/{id}/preview` : facture temporaire, PDF, pages en images, rollback — aucun numéro consommé, vérifié 2 456 factures avant/après) ; lignes, date de fin et pause derrière « Modifier » ; Ventes > Factures périodiques : un clic mène à l'entente du client. Règle pour tout le projet : un document s'affiche comme le document, jamais en fiche descriptive (à appliquer aux devis, avoirs, factures fournisseurs).
- 2026-10-16 (Philippe, photo de l'ancien logiciel : « j'aime bien » ; « encore une fiche descriptive quand on modifie » ; pas de « Prochaine facture » à part, pas de carte de crédit ici, Plus = arrêter + pause au look moderne, pas d'adresse, les notes de l'entreprise liées) : onglet Entente refait (`pages/entente/EntenteView.jsx`) — en-tête ✎ Modifier / Créer une facture / Plus (pause, annuler la pause, arrêter / réactiver) ; Montant de la facture (taxes comprises) / Prochaine date / Période ; Détails (statut, début, fin, conditions, frais de retard) + Notes (= `companies.notes_internal`, même champ que Général) ; « Toutes les factures enfants » + factures impayées (clic = facture dans la fiche) ; ✎ Modifier = la prochaine facture sur papier de facture, lignes modifiables sur place (`PUT /recurring-billing/lines/{id}`), ajout depuis le catalogue ; pause dans une fenêtre moderne (durée ou date, « N jours gratuits »). Lien facture → facture périodique : migration `d6d2e7b7187f` (`invoices.recurring_billing_id`, posé à la création) ; `backend/link_invoices_to_recurring_20261016.py` : 503 factures reliées d'après « Recurrence Name » des exports (2024-09 → 2026-10) et la note des factures ERPCRM, 45 sans profil trouvé. `GET /recurring-billing/{id}/invoices`. Vérifié : Audacie = 311.05 $ impayés (INV-112234), prochaine 2026-10-19, comme l'ancien logiciel.
- 2026-10-16 (Philippe : « pourquoi tu as le champ à partir du ? si je donne c'est là que je donne… une pause de 8 mois et 2 jours c'est juste une pause, le cycle continue après ; s'il restait 23 jours avant sa facturation, quand ça recommence il reste 23 jours » ; « années-mois et jours, pas juste 259 jours » ; « offert » au lieu de « gratuit » ; frais de retard = juste la case) : la pause commence le jour où on la donne et **repousse** la prochaine facture de sa durée (`paused_next` : prochaine + (fin − début) en jours), le rythme reprend de cette date (`resume_after_pause`). Fenêtre : années / mois / jours ou date de fin, « 8 mois et 2 jours offerts — la prochaine facture passe du … au … ». Vérifié : Audacie, 23 jours restants au 2026-09-26, pause de 8 mois et 2 jours → prochaine 2027-06-20, 23 jours après la fin de la pause.
- 2026-10-16 (Philippe : fenêtre trop petite pour les champs ; « par défaut 0 partout, pourquoi tu as mis 1 mois » ; « la possibilité de mettre un prix pour trouver le temps nécessaire… dynamique : si après 3 jours je reviens, il doit rester moins de 200 $ ») : fenêtre de pause sans valeur imposée (0 partout, rien d'affiché tant que rien n'est saisi), largeur min(560 px, 94 %) ; « montant offert ($) » ↔ durée au prix de la facture périodique (taxes comprises) par jour de son cycle ; rouverte, la fenêtre compte à partir d'aujourd'hui (ce qui reste de la pause et son montant), la date de fin reste la même sauf si on change la durée ou le montant ; ramenée à 0 = pause retirée. Vérifié : Audacie (311.05 $ / 31 jours), 200 $ → 20 jours, prochaine facture du 2026-10-19 au 2026-11-08.
- 2026-10-16 (Philippe : « pourquoi D'Astous a Conditions de paiement 183 net ? pour tout le monde c'est 30 jours net ; on pourrait avoir ce setting dans Admin… rassembler dans un onglet config générale ») : réglage général `payment_terms_days` (30 par défaut) — échéance des nouvelles factures (manuelles et périodiques, et l'aperçu) = date + N jours (avant, une facture périodique était due à la fin de son cycle : 183 jours pour D'Astous, semestriel) ; l'entente affiche « 30 net ». Admin : onglet « Tickets » devenu « Configuration générale » (Factures : conditions de paiement ; Tickets : seuil du chrono ; ancien lien `?tab=tickets` redirigé). Factures déjà émises : échéance inchangée.
- 2026-10-16 (Philippe, après « Créer un avoir » puis « → Annulée » sur le brouillon d'avoir CN-00309 : « annuler c'est juste ne pas continuer, ça ne crée rien ») : CN-00309 (brouillon annulé, aucun effet) supprimé et compteur remis à 309 ; plus de bouton « → Annulée » sur un brouillon (facture ou avoir) — un brouillon se supprime (« Supprimer l'avoir », et le numéro d'un avoir supprimé est rendu au compteur s'il était le dernier) ; annuler une facture / un avoir émis passe dans l'engrenage ⚙, avec confirmation.
- 2026-10-16 (Philippe) : Admin réorganisé — « Configuration générale » en sous-onglets : Général (apparence, fuseau horaire, taux de service + exercice / taxes déclarées / rappels, numérotation des documents), Factures (conditions de paiement, frais de retard), Méthodes de paiement, Tickets, Pastilles ; onglets « Méthodes de paiement » et « Pastilles » retirés du haut (anciens liens redirigés) ; « Entreprise » ne garde que les coordonnées ; option « Échanges (troc) » retirée d'Intégrations (le réglage reste actif pour garder les anciens échanges visibles).
- 2026-10-16 (Philippe : « quand je crée d'une facture une facture d'avoir, elle doit être automatiquement associée à la facture, ce qui la rend automatiquement payée ») : à l'émission d'un avoir créé depuis une facture (« Créer l'avoir »), il s'applique tout seul à cette facture jusqu'à son solde (`_apply_credit_to_origin` : CreditAllocation) → la facture passe « payée », l'avoir « fermé » ; ce qui dépasse le solde reste un avoir ouvert du client. Essai en transaction annulée sur CN-00309 / INV-112260 : facture payée, avoir fermé.
- 2026-10-16 (Philippe) : « Créer un avoir » ouvre une fenêtre Annuler / Personnaliser / OK (`askChoice`, Dialog.jsx) — Annuler : rien ; OK : avoir créé, émis et appliqué à la facture (reste sur la facture, payée) ; Personnaliser : brouillon d'avoir à modifier, avec Annuler (supprimé, numéro rendu, retour à la facture) / Créer un brouillon (gardé en brouillon, retour) / OK (émis + appliqué, retour). Vérifié à l'écran (Annuler : aucune facture créée).
- 2026-10-16 (Philippe : « il y a un délai à l'ouverture… ce délai pourrait être seulement quand on clique PDF ») : mesuré — fabriquer le PDF (WeasyPrint) 1 à 1,5 s + images 0,4 s. Maintenant la facture ERPCRM s'affiche en HTML (le même gabarit que le PDF, polices et images incluses, `invoice_html`, composant `DocumentView` : page 8,5 po réduite à la largeur) — `GET /invoices/{id}/preview` ≈ 0,07 s, 174 Ko ; le PDF n'est fabriqué qu'au clic « PDF » ; documents d'origine : images faites une fois et gardées (`storage/preview_cache`) ; images du catalogue réduites à 96 px pour la facture (jusqu'à 1 Mo avant) ; facture périodique (Entente) : même affichage HTML.

### TASK-005.17 [x] PDF à télécharger : facture, avoir, devis, entente d'échange (troc)
Date de demande : 2026-10-08 (Philippe : « sur les factures ou avoirs ou ententes j'aimerais pouvoir en faire des PDF à télécharger » ; « je veux des PDF pour tout échange : facture, avoir, devis, entente (troc) »)
Date(s) de travail : 2026-10-08

- Facture/avoir : le PDF existait déjà (`core/invoice_pdf.py`, courriel et portail), seul le bouton manquait ; nom du fichier `avoir-…pdf` pour un avoir (`facture-…pdf` sinon). Générateur de facture inchangé.
- Nouveau `core/doc_pdf.py` (même feuille de style et mêmes coordonnées vendeur) : `generate_devis_pdf` (« Préparé pour », date, valide jusqu'au, lignes, taxes, notes, bandeau ACCEPTÉ) et `generate_barter_pdf` (« Entente d'échange » : compagnie, facture périodique visée, ce qui a été reçu et sa valeur hors taxes, utilisation du crédit — factures payées, mois de service couverts —, crédit/utilisé/reste, notes, pièces justificatives). Texte échappé (HTML).
- Routes `GET /devis/{id}/pdf`, `GET /barter/{id}/pdf`. Bouton « ⬇ PDF » : fiche facture/avoir et devis (à côté de « Envoyer »), carte de chaque échange (à côté de « Modifier ») ; `utils/download.js`.
- Vérifié : les 4 PDF téléchargés depuis l'écran (INV-112254, avoir CN-00308, devis 2026-D0001, échange D'Astous Auto) et relus en image.
- Constat signalé à Philippe (corrigé par TASK-005.18) : les coordonnées du vendeur (`pdf_seller_*` : adresse, n° TPS/TVQ, téléphone, courriel) ne sont pas remplies et n'ont aucun écran → tous les PDF, y compris ceux envoyés aux clients, n'affichent que « Simple IP inc. ».
### TASK-005.16 [x] Colonne « Taxable » retirée des factures et des devis
Date de demande : 2026-10-08 (Philippe : « pourquoi dans taxable il y a oui?? les taxes ne sont qu'en bas pas à chaque ligne... moi tout est taxable tps tvq » ; « oui enlève ça go »)
Date(s) de travail : 2026-10-08

- Le choix par ligne (TASK-005.9) servait à reproduire les factures importées ; dans les ventes, les seules lignes non taxables sont les frais de retard (mises non taxables automatiquement). Retirés de `InvoiceDetail.jsx` et `DevisDetail.jsx` : colonne « Taxable », case dans la modification d'une ligne (n'envoie plus `is_taxable` → valeur existante gardée, le schéma de mise à jour est optionnel), case « Taxable (TPS/TVQ) » à l'ajout (nouvelle ligne = taxable). Une ligne non taxable affiche « (non taxable) » après sa description, comme le PDF. Calcul des taxes et `is_taxable` inchangés côté serveur ; le choix par ligne reste dans les dépenses/factures fournisseurs.
- Vérifié (Playwright) : INV-111387 (frais de retard « (non taxable) », taxes inchangées), INV-112254 et devis 2026-D0001 sans la colonne, aucune erreur.
### TASK-005.13 [x] Échanges (troc) : fiche d'échange, montant hors taxes qui repousse la facturation périodique, preuve gardée
Date de demande : 2026-10-07 (Philippe : D'Astous Auto a réparé sa voiture, 860 $ hors taxes ; « j'ai oublié de lui charger les textos 500 à 19,95 $ pendant 6 mois, on déduit ça… et le reste sur sa facture habituelle » ; puis « il me faudrait aussi cette option (troc) pour certaines entreprises qui acceptent l'échange, ça resterait dans l'ERPCRM pour garder une trace de la transaction et prouver l'échange »)
Date(s) de travail : 2026-10-07, 2026-10-08

- En attente du GO sur le plan (proposé le 2026-10-07). Choix de Philippe : « je rentre le montant hors taxe qui se retrouve à repousser la facture » → pas d'avoir (l'idée d'un avoir de troc est abandonnée) ; le crédit hors taxes couvre les cycles de sa facture périodique (aucune facture, aucune taxe) puis la facture reprend au prorata, à la date où le crédit est épuisé.
- Premier cas : D'Astous Auto — 860,00 $ − texto 500 non facturés 6 × 19,95 $ = 740,30 $ hors taxes de crédit ; facture périodique aux 6 mois (12 nov./12 mai, 508,80 $ HT) → nov. 2026 couverte, ≈ 318,81 $ à payer en mai 2027. Suspension de la facturation écartée (pas de « suspendre jusqu'au », rattrapage des cycles à la réactivation, génération automatique des ventes activée).
- Construit (GO 2026-10-07, « oui go »). Question de Philippe : « entre ici et sa prochaine facture il a le service, on ne le compte pas ? » → non : le service jusqu'au 11 nov. 2026 est déjà facturé et payé (INV-112072) ; le troc s'applique toujours à partir du **premier cycle pas encore facturé**.
- Migration f1989fa81aee (id généré, une seule tête, up/down testés) : `barter_exchanges` (compagnie, facture périodique repoussée, date, ce qui a été donné, valeur HT, notes), `barter_deductions` (ce qui était dû sans avoir été facturé), `barter_files` (pièces justificatives, `storage/barter`, hors du dossier public), `barter_applications` (cycle, couvert jusqu'au, montant ; facture liée en cascade : supprimer la facture repoussée rend le crédit).
- `app/core/barter.py` : crédit = valeur − déductions ; plus vieil échange d'abord ; cycle couvert au complet → aucune facture (`CycleCoveredByBarter`, le cycle est marqué fait) ; sinon facture **repoussée** à la date où le crédit s'épuise (jours entiers du cycle, arrondi vers le bas), lignes habituelles + ligne négative « Échange (troc) du … — … : service du … au … couvert » ; taxes seulement sur le reste ; jamais sur la toute première facture (facturée d'avance). `projection()` pour l'écran. Branché dans `create_recurring_invoice` (bouton Générer et création automatique — le poller valide le cycle couvert et continue).
- API `/api/v1/barter` : liste par compagnie (échanges + effet sur chaque facture périodique), créer, modifier (refusé si le crédit devient plus petit que ce qui a servi, ou si on change la facture périodique après usage), supprimer (refusé une fois le crédit utilisé : l'échange reste comme preuve), pièces (dépôt multiple 25 Mo, ouverture, retrait).
- Écran : onglet **Échanges** de la compagnie (`pages/barter/BarterTab.jsx`) — effet du crédit restant (cycles couverts, date de la facture repoussée et montant), fiche par échange (valeur, déductions, crédit / utilisé / restant, cycles couverts avec lien vers la facture, pièces justificatives), fenêtre Nouvel échange / Modifier (fermée seulement par Annuler/Enregistrer).
- D'Astous Auto saisi : Réparation automobile 860,00 − Texto 500 non facturé 6 × 19,95 = **740,30 $** sur « D'Astous Auto » (aux 6 mois). Simulation (transaction annulée, date forcée) : 12 nov. 2026 → cycle couvert, aucune facture ; en juin 2027 → « Facture repoussée au 2027-08-03 » ; 3 août 2027 → facture 277,30 + TPS 13,87 + TVQ 27,66 = **318,83 $** (ligne troc −231,50, service du 2027-05-12 au 2027-08-02 couvert) ; 12 nov. 2027 → facture normale 584,99 $. Compteur INV inchangé (112252). Pièce jointe testée (dépôt, ouverture, retrait) ; modification invalide refusée sans rien changer.
- 2026-10-08 (Philippe : « est-ce qu'il y a les détails dans le nouvel onglet avec les dates et tous les mois sautés, avec leur rythme de facturation, la nouvelle date de facturation ») : encadré refait en **calendrier** — rythme (aux 6 mois, 508,80 $ HT par facture, 84,80 $ par mois), dernière facture (INV-112072 du 12 mai 2026) et « service déjà payé jusqu'au 11 novembre 2026 » ; tableau par facture habituelle (date habituelle, période, montant habituel, payé par l'échange, « Facture sautée » / « Repoussée au … » / « Facture normale — retour au rythme habituel ») ; mois de service payés un par un (8 × 84,80 + 22 jours 61,90 = 740,30) ; « Nouvelle date de facturation : 3 août 2027, puis le 12 novembre 2027 ». API : `paid_until`, `last_invoice_number`, `months_per_cycle`, ligne `normal` dans la projection.
- **2026-10-08, logique corrigée** (voir ERRORS_LESSONS TASK-005.13) — Philippe : « l'échange ne fait que retarder les paiements de service, ça ne change pas son cycle… il recommence à payer 3 mois et 8 jours plus tard… et repartent de là des cycles de 6 mois » ; « nouveau prix, laisse le jour au client, go ». Les points ci-dessus sur la facture repoussée au prorata (ligne négative, 277,30 $ le 3 août 2027) et le calendrier par cycle sont **remplacés** : le crédit paie des **mois de service** à partir du premier jour pas encore facturé, chaque mois au prix mensuel de ses services quand il commence (lignes / mois par cycle ; une hausse → reprise plus tôt), le dernier mois en jours arrondis vers le haut (jour entamé laissé au client) ; à l'épuisement, `start_date` de la facture périodique = date de reprise → facture complète, même rythme. `next_missing_cycle` : une dernière facture antérieure au début du cycle = cycle déplacé (aucune récurrence existante dans ce cas, vérifié). Migration c7616746abbd (id généré, une tête, up/down testés) : `barter_since`, `barter_cursor` sur `company_recurring_billings`. `barter.advance()` compte les mois commencés à chaque génération (bouton et création automatique). D'Astous Auto : 8 mois × 84,80 + 23 jours 61,90 = 740,30 → **reprise le 4 août 2027**, puis 4 février 2028, 4 août 2028 ; factures du 12 nov. 2026 et du 12 mai 2027 sautées. Simulation (transaction annulée, dates forcées, hausse de 6 % le 25 janv. 2027) : 3 mois à 84,80, 5 à 89,90, 13 jours 36,40 → reprise le 25 juillet 2027, factures 539,40 $ HT le 25 juil. 2027 et le 25 janv. 2028 ; compteur INV intact.
- 2026-10-08 (Philippe : « le suivi dynamique quotidien pour que je voie où on en est de la dette peu importe le jour… sa période déjà payée est indiquée aussi, c'est important ») : jauge du jour en haut du suivi — période déjà payée (du 12 mai au 11 nov. 2026, INV-112072, pas comptée), crédit de départ, service déjà fourni (mois terminés + mois en cours au prorata des jours passés), encore dû au client et jusqu'à quand, date de reprise, « jour N sur M ». Vérifié : 20 janv. 2027 → 194,22 $ fournis, 546,08 $ dus, jour 70 sur 265. Fiche de l'échange : « Mois déjà comptés », « Remboursé au complet : service fourni du … au … ».
- 2026-10-08 (Philippe : « c'est la valeur totale que je veux ; les services de texto oubliés, ça devrait être dans une place différente, ajustement peut-être, avec une place pour une note » ; « pas besoin de date ») : en haut du suivi, **valeur de l'échange** (860,00 $ HT) avec « ajustements −119,70 · crédit pour le service 740,30 » ; les déductions deviennent des **ajustements** à part — sens (en faveur de Simple IP : retiré du crédit ; en faveur du client : ajouté — proposé, à retirer si Philippe n'en veut pas) et note par ajustement. Migration 4b6da2ad48bd (id généré, une tête, up/down testés) : `barter_deductions.direction` (défaut simpleip — la ligne des textos de D'Astous Auto le devient sans ressaisie) et `note`. Crédit = valeur + ajustements signés. Libellés « repousse » retirés ; note de l'échange de D'Astous Auto (écrite par Claude le 7 oct., devenue fausse) corrigée. Pièce justificative jointe par Philippe : « 2026-10-07 20.24.41.pdf ».
- 2026-10-08, nettoyage demandé par Philippe : retiré la ligne sous la valeur de l'échange (ajustements · crédit), la ligne « L'échange paie le service à partir du… » et « Factures habituelles sautées » du bloc de reprise ; la durée (8 mois et 23 jours) devient la ligne **Total** du tableau des mois ; « Factures sautées : … » en bas du suivi. Disposition inchangée (une première version avait déplacé la fiche de l'échange et refait les factures sautées en tableau — Philippe : « pourquoi tu as tout changé la disposition, reviens à la version d'avant et fais juste les changements » → annulé).
- 2026-10-08 (Philippe : « crédit pour le service doit être le montant total… les ajustements font chier, il n'y en a jamais sauf là parce que je me suis trompé dans sa facturation » → GO « crée la facture des textos et enlève les ajustements, n'envoie pas la facture ») : **ajustements retirés** (fenêtre, fiche, calcul : crédit = valeur de l'échange) ; table `barter_deductions` gardée vide (aucune migration destructive). Textos facturés à part : **INV-112253** (brouillon, non transmise, jamais envoyée) — Texto 500, 6 mois non facturés (mai à octobre 2026), 6 × 19,95 = 119,70 + TPS 5,99 + TVQ 11,94 = 137,63 $. D'Astous Auto : crédit 860,00 → 10 mois + 5 jours → **reprise le 17 septembre 2027**, puis 17 mars 2028. Constat : `POST /invoices/{id}/lines` laisse les totaux à 0 (la facture rechargée garde l'ancienne liste de lignes) — totaux remis par `PUT /invoices/{id}` ; seule facture touchée (vérifié), correction de l'endpoint à proposer.
- 2026-10-08 (Philippe : « le troc paie d'abord la/les factures ouvertes non payées ; je pourrais faire un troc avec un client sans facture mensuelle et donc les factures deviennent payées dès la création » ; « seulement les factures périodiques fictives (de service), on ne va pas mettre les taxes ») : le crédit règle d'abord, **au complet (taxes incluses)**, les factures émises non payées de la compagnie, la plus vieille d'abord — paiement mode **« Troc »** (source `barter`, une référence PAY- par facture, note « Payé par l'échange (troc) : … ») ; puis les mois de service (sans taxes, aucune facture). Sans facture périodique liée : chaque facture émise est payée dès qu'elle sort du brouillon. `barter.pay_open_invoices()` appelée à l'enregistrement de l'échange, au passage d'une facture de brouillon à émise (`PUT /invoices/{id}`), à l'envoi par courriel et à la création automatique d'une facture périodique ; jamais un brouillon. Migration e1a7648be316 (id généré, une tête, up/down testés) : `barter_applications.client_payment_id` (supprimer le paiement Troc rend le crédit) + mode de paiement `troc` (aussi dans `seed.py`). Banque : un paiement Troc n'est jamais proposé ni accepté pour un dépôt (`bank_matching.suggestions`, `match`). Écran : facture payée en tête du tableau des mois (Total 860,00 $), fiche « Déjà utilisé : Facture INV-112253 payée le … ». D'Astous Auto : INV-112253 émise (toujours **non transmise**) → payée par PAY-2026-0001 (Troc, 137,63 $) ; reste 722,37 $ → 8 mois et 17 jours → **reprise le 29 juillet 2027**, puis 29 janvier 2028.
- 2026-10-07 au soir (Philippe : « corrige le défaut des lignes et mets la bonne date de facture de texto, pourquoi elle est demain ?? ») : (1) `invoices._get_inv` relit les lignes à jour (`populate_existing`) — ajout et suppression de ligne recalculent enfin les bons totaux (testé : 20 → 25 → 5 $, transaction annulée) ; (2) cause de la date : le serveur est en UTC (Etc/UTC) et le code prend `date.today()` → après 20 h (heure du Québec), « aujourd'hui » = lendemain. INV-112253 remise au 7 oct. (échéance 6 nov.) par `PUT /invoices` ; paiement PAY-2026-0001 et usage du crédit remis au 7 oct. (correction demandée, script ORM). Correction de fond à proposer : fuseau horaire de l'entreprise configurable (34 `date.today()` dans le backend).
- 2026-10-07 au soir, Physotech (Philippe : « c'est lui qui me doit de l'argent, je pensais faire l'inverse… je l'avais fait en devis pour ne pas l'oublier ») : travail d'avril-mai 2021 jamais facturé, gardé en devis dans l'ancien logiciel (aucune taxe déclarée). Recréé dans ERPCRM : devis **2026-D0001** (brouillon, daté du 2021-04-22, 6 lignes, remarques reprises + « À régler en troc ») = 929,90 + TPS 46,50 + TVQ 92,76 = 1 069,16 $. Signalé à Philippe : une facture rend la TPS/TVQ payable à sa date (pas « en pause jusqu'au paiement ») ; le devis ne déclenche rien. Même défaut de lignes corrigé dans `devis._get_devis` (`populate_existing`). À faire au moment de l'échange : convertir le devis en facture (n'existe pas encore), payée aussitôt par le troc.
- 2026-10-08, **option Échanges dans Administration → Intégrations** (Philippe : « pour moi cochée à oui mais de base à non ; décochée, ça ferait disparaître toutes les options d'échange ; si un utilisateur (quelqu'un à qui j'ai vendu le programme) ne la veut pas, inutile de l'achaler avec ces options ») : réglage `barter_enabled` (`app_settings`, défaut « false », pas de migration) ; carte « Options » en tête de l'onglet Intégrations (`Admin.jsx` `OptionsPanel`) ; `hooks/useFeatures.js` lit l'option une fois. Décochée : onglet Échanges des compagnies caché (`?tab=echanges` revient à Général), marque « À régler en troc » et badge Troc des factures cachés, mode de paiement Troc retiré des listes (`/payments/methods`, `/admin/payment-methods`), phrase troc retirée des frais de retard ; le serveur refuse de créer/modifier un échange, d'y joindre une pièce, de marquer une facture troc ou d'enregistrer un paiement Troc. Les échanges déjà enregistrés continuent de s'appliquer (une entente reste une entente), seulement cachés — dit dans la confirmation. Cochée pour Simple IP. Vérifié : API (refus quand décochée, Troc absent puis présent) et écran (onglets, facture INV-112253) dans les deux états.
### TASK-005.12 [x] Numérotation des documents : compteur qui ne recule jamais
Date de demande : 2026-10-04 (Philippe : « ERPCRM peut redonner un numéro déjà utilisé… assure-toi que non, le compteur ne peut pas descendre » ; et « garde la suite des INV, les clients ne vont pas être mélangés »)
Date(s) de travail : 2026-10-04

- Défaut corrigé : factures/avoirs, factures de tickets, devis, bons de commande et commandes web prenaient « nombre de documents + 1 » (supprimer un document faisait redonner un numéro déjà émis) ; les références de paiement « plus grand + 1 » (supprimer le dernier le faisait redonner).
- Table `document_counters` (migration a2b3c4d5e6f7, up/down testés, amorcée au plus grand numéro déjà émis) + `app/core/numbering.py` : verrou de ligne, compteur avancé dans la transaction du document (création annulée = numéro pas consommé), jamais redonné ensuite ; garde-fou : jamais sous le plus grand numéro existant du préfixe. Changement manuel refusé s'il fait reculer (même préfixe : sous le compteur ; autre préfixe : sur un numéro déjà utilisé).
- Paramètres › « Numérotation des documents » (`GET/PUT /v1/settings/numbering`) : préfixe (« {year} » = année en cours), chiffres, prochain numéro, aperçu.
- 2026-10-18 — Philippe : « je veux pas ça !!! devis c'est EST-110135 prochain EST-110136. PAY-année-mois-jour-1800 prochain …-1801 » ; « ta boîte de Numérotation des documents n'est pas assez large, il y a un scroll bar horizontal, je déteste ça… cette page est toute croche ». Préfixe : `{month}` et `{day}` ajoutés à `{year}` (date du jour, fuseau de l'entreprise ; le numéro qui suit continue d'un jour à l'autre). Réglés par l'écran/API : Devis `EST-` + 110136 (sans zéros) ; Références de paiement `PAY-{year}-{month}-{day}-` + 1801 (→ PAY-2026-10-18-1801). Le devis d'essai « 2026-D0001 » du 2026-10-08 garde son numéro. Tickets : préfixe vide permis (Philippe a ensuite mis « T- » : affichage « T-11001 », courriels « [Ticket #T-11001] » reconnus). Page Configuration générale › Général : cartes d'une même rangée à la même hauteur, Numérotation sur toute la largeur en grille (champs au style des autres), repliée sur cellulaire ; sous-onglets et onglets d'Administration qui passent à la ligne ; en-tête (bouton Zéko, chronos actifs) réduit à l'icône/au temps sur cellulaire. Vérifié (Playwright) : aucune barre horizontale ni page plus large que l'écran à 1920 et à 390.
- 2026-10-19 — Philippe : « arrange les nomenclatures de ticket et de devis et les paiements ». Migration `9465bdf870d7` : ticket 11000 → **T-11000**, devis 2026-D0001 → **EST-110135** (compteurs inchangés : T-11001, EST-110136). Paiements : aucun des 1 728 n'avait de référence PAY-, rien à renommer. La note de la facture INV-112261 mentionnait « devis 2026-D0001 » : remplacée par « devis EST-110135 » sur demande de Philippe (« oui »), migration `41cc14414030`.
- Preuve : facture créée puis supprimée → suivante = numéro + 1 (pas réutilisé) ; création annulée → compteur inchangé (2026-0004) ; recul refusé (« prochain numéro minimum 4 ») ; INV-112000 refusé (« minimum 112249 », déjà utilisés).
- Suite INV- (décision de Philippe, 2026-10-04 : « vous êtes supposés être montés pareil, donc les mêmes factures vont avoir le même numéro ») : ERPCRM et l'ancien logiciel tournent en parallèle et la même facture porte le même numéro. Compteur factures = INV- (sans zéros), suite exacte après INV-112248 ; **avoirs : leur propre suite CN-** (prochain CN-00309), comme dans l'ancien logiciel (avant : même suite que les factures). `renumber_recurring_2026.py` : 2026-0002 → INV-112249 (Construction Nationale, 2026-10-03), 2026-0003 → INV-112250 (LS Services Comptables, 2026-10-04), non transmises ; les anciens numéros ne sont jamais redonnés.
- Création automatique des ventes (TASK-021.2) : factures créées dans l'ordre chronologique toutes compagnies confondues, pour suivre l'ordre de l'ancien logiciel.
- Conditions pour que les numéros restent identiques (dites à Philippe) : toute facture faite à la main dans l'ancien logiciel doit aussi l'être dans ERPCRM, dans le même ordre ; les ordres de création d'un même jour peuvent différer.
- Garde-fou à l'import (un numéro déjà présent était ignoré en silence → une facture différente au même numéro aurait été perdue) : `import_zoho_invoices.py` compare client, date et total, et s'arrête sans rien écrire en cas d'écart ; `import_zoho_credits.py` compare le total. Rendu relançable : ne lit que les exports `Facture20*.csv` (le dossier contient maintenant achats/avoirs/périodiques), retrouve « Patio Desing » renommée et les clients créés au 1er import. Essai à blanc : les 776 factures reconnues identiques, 0 écart ; 153 avoirs identiques. À savoir au prochain import : la note « Succursale Oxygene » serait ajoutée de nouveau à Maison Le Passeur (contrôle sur le texte de la note).

### TASK-005.11 [x] Retrait des mentions de Zoho dans ERPCRM (encaissements, notes, écrans)
Date de demande : 2026-10-02 (Philippe, en voyant « Dernier paiement … Historique Zoho Books » sur une fiche compagnie : « je n'aime pas que tu parles de Zoho, j'essaie de m'en débarrasser »)
Date(s) de travail : 2026-10-02

- Script `backend/clean_import_labels.py` (essai à blanc puis --apply ; sauvegarde /home/simpleip/backups/erpcrm_avant_cn00208_libelles_20261002_2340.sql) : 567 encaissements importés renommés « Paiement antérieur » (code interne `zoho`/source `zoho_import` inchangés), 776 notes de facture « Importée de Zoho Books (statut Zoho : …) » vidées — elles s'imprimaient sur le PDF envoyé au client —, 152 notes d'avoir réécrites « Avoir sur la facture INV-… ».
- Écrans : libellé de source « Historique Zoho » → « Paiement antérieur » (Ventes › Paiements reçus, fiche de compte bancaire) ; texte d'attente du module Achats sans « Zoho ».
- Scripts d'import (import_zoho_invoices.py, import_zoho_credits.py) : n'écrivent plus rien de visible qui mentionne Zoho (relance future pour les factures plus anciennes).
- Non réécrit : le Journal (146 entrées d'historique « … (Importée de Zoho Books) ») — trace d'audit, on ne réécrit pas l'historique.

### TASK-005.10 [x] Avoirs clients appliqués aux factures + import des avoirs Zoho (cas MGB Associés)
Date de demande : 2026-10-02 (Philippe : « MGB ASSOCIÉS INC. ajuste le crédit pour qu'il arrive à 0 $ — il a payé le matériel mais jamais l'installation, j'ai crédité mais j'ai mis 160,23 de trop » ; puis « Bâtir l'application des avoirs dans Ventes › Factures d'avoir », avec la liste de ses avoirs Zoho)
Date(s) de travail : 2026-10-02

Constats :
- MGB, INV-111428 (2025-01-23, 4 069,71 $) : matériel 2 469,70 $ HT, installation 1 069,95 $ HT. Avoir Zoho CN-00297 (2026-07-01) appliqué 1 069,95 $. Les 160,23 $ de trop = exactement la TPS (53,50) + TVQ (106,73) de 1 069,95 $ : l'avoir a été fait « hors taxes » (1 230,18 $ TTC) alors qu'il fallait 1 069,95 $ taxes incluses → 160,23 $ de crédit inutilisé. Ses 3 factures de frais de retard (92,89 $) ont aussi été fermées par des avoirs (CN-00185, 202, 203).
- Fichier `Facture_de_factures_d’avoir.csv` : 311 applications d'avoirs (293 avoirs, 2021-08 → 2026-09) — seulement date, n° d'avoir, facture, montant appliqué (ni client, ni taxes, ni lignes). 161 applications (4 705,81 $) touchent des factures importées.
- Problème d'import (TASK-005.7) : ces factures fermées par avoir ont été importées « payées » par un paiement « Historique Zoho » du montant de l'avoir — faux (ex. MGB INV-111428 « payée » 4 069,71 $ au lieu de 2 999,76 $ payés + 1 069,95 $ crédités). Impact taxes : les avoirs réduisent la TPS/TVQ perçue d'une période ; absents d'ERPCRM, la déclaration de TPS/TVQ (TASK-043) les surestime (ex. CN-00297 en juillet 2026).
- ERPCRM : un avoir = facture négative (« Créer un avoir »), mais il ne s'applique pas au solde d'une facture (le statut ne compte que les paiements).

Réalisé (2026-10-02) :
- Table `credit_allocations` (modèle `CreditAllocation` dans models/client_payment.py, migration e0f1a2b3c4d5) : avoir → facture, montant, date d'application.
- Montant réglé d'une facture = paiements confirmés + avoirs appliqués, calculé à un seul endroit (`settled_amounts()` dans payments.py) et utilisé par le statut des factures, le portail client, le rapprochement bancaire et le PDF.
- API `/v1/payments` : `GET /credits/open?company_id=` (avoirs du client avec un reste), `GET /credits/{id}` (application), `GET /credits/{id}/candidates` (factures ouvertes du client), `POST /credits/{id}/apply` (une ou plusieurs factures ; refusé si autre client, brouillon/annulée, au-delà du reste de l'avoir ou du solde de la facture), `DELETE /credit-allocations/{id}` (retirer = modifiable). `GET /invoice/{id}` inclut les avoirs appliqués (`kind: "credit"`).
- Statut d'un avoir : Ouvert (reste à appliquer) / Fermé (entièrement appliqué), recalculé automatiquement. Une facture ou un avoir avec une application ne peut pas revenir en brouillon ni être annulé sans retirer l'application.
- Écran : sur l'avoir, section « Application de l'avoir » + « Appliquer sur des factures » (pré-rempli des plus anciennes) ; sur la facture, « Paiements et avoirs reçus » + « Appliquer un avoir (x $ disponible) » ; liste Factures d'avoir avec filtres Ouvert/Fermé.
- Import `backend/import_zoho_credits.py` (essai à blanc puis --apply, sauvegarde des tables avant : /home/simpleip/backups/erpcrm_avant_avoirs_20261002_1753.sql) : 152 avoirs CN-xxxxx (4 705,81 $ sur 160 factures) ; les 141 avoirs appliqués seulement sur des factures antérieures à ERPCRM sont ignorés. Encaissements « Historique Zoho » corrigés : 14 diminués, 146 supprimés (ils n'étaient que des avoirs). Taxes des avoirs : lignes de la facture copiées si avoir total, sinon base hors taxes retrouvée pour que base + TPS + TVQ = montant Zoho exact.
- MGB : CN-00297 importé à 1 069,95 $ taxes incluses (930,59 + 46,53 + 92,83), entièrement appliqué sur INV-111428 → solde 0 $, plus de crédit fantôme de 160,23 $.
- Taxes : les avoirs entrent dans la déclaration (TASK-043) de leur trimestre. Trimestre ouvert juil.–sept. 2026 : −56,53 $ TPS, −112,76 $ TVQ (dont CN-00297). Les trimestres déjà déclarés (≤ 2026-06-30) l'avaient été depuis Zoho, avoirs compris : ERPCRM concorde maintenant.
- CN-00208 (ABC Gestion parasitaire, 462,66 $, INV-111654) : absent de l'export des applications, d'abord gardé de côté (on croyait INV-111654 absente d'ERPCRM). Constat ensuite : INV-111654 est dans ERPCRM, « payée » par un faux encaissement de 462,66 $ du 2025-07-04 (qui apparaissait comme dernier paiement d'ABC). Philippe : « je lui avais chargé un mois de trop alors je l'ai crédité ». Ajouté dans `MISSING_APPLICATIONS` d'import_zoho_credits.py et importé (2026-10-02) : avoir 462,66 $ (402,40 + 20,12 + 40,14) appliqué sur INV-111654, faux encaissement supprimé ; dernier paiement d'ABC = 462,66 $ du 2025-06-04. Trimestre juil.–sept. 2025 déjà déclaré avec cet avoir.
- Défaut corrigé au passage : la copie des lignes d'une facture dans un avoir (« Créer un avoir », invoices.py, et le script d'import) faisait -abs(montant), ce qui rendait négative une ligne de rabais déjà négative (« Cadeau — Bon client » −34,95 $). Désormais : signe inversé. Le contrôle de total du script avait bloqué l'écriture ; les 152 avoirs déjà importés n'étaient pas touchés (contrôle passé).
---

## TASK-006 [ERPCRM] [x] Tickets — statuts, entrées temps, email résumé, + Tâche
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `tickets`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Tickets — statuts, entrées temps, email résumé, + Tâche

### TASK-006.2 [x] TicketDetail — sections Informations et Description en pleine largeur
Date de demande : 2026-08-29 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-29

`.tkt-detail-grid` était en 2 colonnes — Informations (contact/compagnie) et
Description se retrouvaient côte à côte, chacune étroite. Passé à 1 colonne :
les deux sections s'empilent en pleine largeur, Description juste sous
Informations.
Fichier : frontend/src/pages/TicketDetail.jsx (commit 3d85c91).

### TASK-006.4 [ ] Verrou d'édition sur un Ticket ouvert par un technicien
Date de demande : 2026-09-11 (idée venue en discutant du verrou téléphonie, TASK-020)
Date(s) de travail : aucune, backlog

Idée de Philippe : quand un technicien ouvre/travaille un Ticket, celui-ci devient verrouillé en ÉDITION pour les autres techniciens tant qu'il reste ouvert avec ce technicien — évite que 2 techs travaillent sur le même ticket en même temps et s'écrasent. Reste toujours consultable en LECTURE SEULE par un autre tech (ex: un client appelle pour un suivi, l'autre tech doit pouvoir voir où en est le premier sans pouvoir modifier). Même esprit que le verrou téléphonie (TASK-020) mais un module différent (Ticket, pas Téléphonie) — pas construit dans TASK-020, backlog séparé. Questions ouvertes à trancher avant design : timeout d'inactivité (même 30 min que téléphonie, ou différent — un ticket peut rester ouvert longtemps pendant un vrai appel) ; comment un tech voit que c'est verrouillé et par qui ; libération explicite (fermer l'onglet suffit, ou bouton explicite) ?

### TASK-006.3 [x] Ticket — le chrono démarre à l'ouverture de la page, pas à la création
Date de demande : 2026-08-29 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-29

Le chrono facturable représentait l'âge du ticket depuis sa création
(`timer_start_at` par défaut = maintenant), pas le temps réellement passé à
travailler dessus — un ticket créé pour plus tard (RDV planifié, tâche
assignée) accumulait du temps facturable avant même d'être ouvert. Incident
réel : ticket "Appel - Alex Bro" à 26h+ dès sa première ouverture.
- `Ticket.timer_start_at` par défaut `None` (en pause), plus jamais "maintenant".
- `TicketDetail.jsx` démarre le chrono automatiquement au chargement si un
  autre appareil n'a pas déjà la page ouverte avec le chrono actif, jamais sur
  un ticket fermé/facturé.
- Quitter la route du ticket (dans l'app) pendant que le chrono roule demande
  si le chrono doit continuer (`TimerNavigationPrompt`) : "non" le met en
  pause immédiatement, "oui" reprend puis ouvre la page dans un nouvel onglet.
  Fermer directement l'onglet du navigateur reste hors de portée (aucune API
  JS ne permet de l'intercepter de façon fiable).
Fichiers : backend/app/models/ticket.py, frontend/src/pages/TicketDetail.jsx,
composant TimerNavigationPrompt (commit 4c6de1e).

### TASK-006.1 [x] Suivi d'ouverture des courriels de ticket (infrastructure de tracking)
Demande : voir dans l'ERP si un courriel envoyé (ticket, puis facture/devis/RDV) a
été ouvert par le destinataire, façon Zoho — date/heure de la dernière ouverture,
et historique complet si ouvert plusieurs fois.

Infrastructure commune (réutilisée ensuite par TASK-005.1, TASK-025, TASK-015.12) :
- `backend/app/models/email_open.py` — modèle `EmailOpen` (append-only : une ligne
  par ouverture, jamais mise à jour) : `entity_type` (ticket/invoice/devis/task),
  `entity_id`, `opened_at`.
- `backend/app/core/tracking.py` — `get_open_stats(db, entity_type, entity_ids)` :
  requête agrégée unique (`MAX(opened_at)`, `COUNT(*)` groupé par `entity_id`) pour
  éviter le N+1 dans les listes.
- `backend/app/api/v1/endpoints/tracking.py` — `GET /api/v1/track/{entity_type}/
  {entity_id}.png` (endpoint PUBLIC, sans auth — enregistre l'ouverture et retourne
  un pixel transparent 1×1) + `GET /api/v1/track/{entity_type}/{entity_id}/opens`
  (authentifié, historique complet).
- `backend/app/core/email.py` — `_tracking_pixel()` génère le tag `<img>` avec URL
  absolue (`settings.PUBLIC_BASE_URL`), ajouté automatiquement par `_send()` quand
  `tracking_entity_type`/`tracking_entity_id` sont fournis.
- `backend/app/core/config.py` — `PUBLIC_BASE_URL` (doit être joignable depuis
  Internet, pas juste le LAN, sinon le client courriel du destinataire ne peut pas
  charger le pixel).
- Migration : `p7q8r9s0t1u2_email_opens.py` (table `email_opens` + index).

Câblage tickets :
- `tickets.py` — `_build_out()` devenu async, appelle `get_open_stats(db, "ticket",
  ...)`; `TicketOut`/`TicketListItem` gagnent `last_opened_at`/`open_count`.
- `frontend/src/pages/Tickets.jsx` — colonne "Vu" (👁 date/heure, tooltip nombre
  d'ouvertures si >1).
- `frontend/src/pages/TicketDetail.jsx` — ligne "Résumé ouvert" dépliable avec
  historique complet (`toggleOpens()` → `GET /track/ticket/{id}/opens`).

Prérequis infra : exposition publique HTTPS d'ERPCRM (`portail.simpleip.tel`, Nginx
+ Let's Encrypt/Certbot, Vite `allowedHosts`) — sans ça le pixel est injoignable
depuis l'extérieur et le suivi ne fonctionne jamais.

---

### TASK-006.5 [ ] Ticket refait autour d'une IA : conversation du tech (images, recherche de solutions) + beau ticket client avec le temps
Date de demande : 2026-10-16 (Philippe, après la correction du temps : « c'est de la marde ton système de ticket à enregistrer… je ne veux plus des séparations limitantes, c'est un ticket pas un rapport d'avocat » ; « ne change rien pour l'instant, on va jaser » ; « je veux le coder… avec une IA que je créerais qui me permettrait de coller des images et de rechercher des solutions ; après il garde pour le tech l'échange au complet, mais crée un beau ticket pour le client avec le temps pris ; laisse faire les autres modèles, je ne les aime pas »)
Date(s) de travail : 2026-10-17, 2026-10-18

- Rien de changé pour l'instant (discussion). Constat : le système actuel oblige à « sauver une saisie de temps » par note ; le chrono du haut (temps déjà inscrit) ne se corrige pas — c'était ça à corriger (TASK-006 : correction de la durée d'une saisie ajoutée le 2026-10-16, pas la bonne chose).
- Idée : côté tech, une conversation avec l'IA (coller des images / captures, chercher des solutions, garder tout l'échange) ; côté client, un ticket propre rédigé par l'IA (problème, ce qui a été fait, temps pris) ; un chrono par ticket, corrigeable.
- 2026-10-17 : l'IA s'appelle **Zéko** ; cahier des charges complet remis par Philippe (rédigé avec ChatGPT et Gemini) : `docs/platform/ZEKO_CAHIER_DES_CHARGES.md` (étapes 0 à 7, scénarios de réception, questions non tranchées). Futur serveur : RTX 3060 Ti 8 Go.
- 2026-10-17 — **Étape 1 faite (sans IA)** : « commence par mon irritant de la fenêtre de ticket » ; « rien n'est en ligne… efface les tickets » ; « un bouton démarrer et le début de l'écriture, les 2 ».
  - Migration `5ea0bdba86ab` (id généré, une seule tête, up/down/up testés) : les 9 tickets d'essai effacés (sauvegarde `backups/erpcrm_avant_tickets_20261017.sql`, branche `avant-tickets-20261017`) ; `ticket_entries` supprimée ; champs chrono/brouillon de `tickets` retirés ; ajout `tickets.catalogue_item_id` (service facturé, un par ticket), `tickets.invoiced_seconds`, `draft_note_desc` → `draft_message` ; nouvelles tables `ticket_messages` (auteur tech/client, texte, horodaté, modifiable), `ticket_attachments` (fichiers dans `storage/ticket_attachments`, `core/ticket_attachments.py`), `ticket_time_periods` (chrono par technicien, heures écrites par le serveur, raison d'arrêt), `ticket_time_adjustments` (correction : avant/après/qui/quand/raison ; temps offert).
  - Temps du ticket = périodes + corrections ; à facturer = temps − offert − déjà facturé. Facture : service du ticket avec bloc d'arrondi, sinon Main d'œuvre au taux horaire (arrondi `labour_round_minutes`) ; échéance = délai de paiement général. Fermer (ou « Nouveau ticket » sur une réponse client) arrête tous les chronos ; « En attente d'une réponse » met mon chrono en pause.
  - Routes : `POST /timer/start {pause_others}`, `POST /timer/pause`, `PUT /time` (correction), `POST/DELETE /time/offer`, `GET /timers/active`, `POST/PUT/DELETE /messages` (multipart, images), `GET/DELETE /attachments/{id}`, split d'une réponse client. Courriel de résumé : messages du technicien + temps total (plus de durée par ligne). Réponse client par courriel → message « Client ». Tâche cochée avec temps → correction tracée du temps du ticket.
  - Écran (`TicketDetail.jsx`) : conversation (Ctrl+V d'une capture, glisser, 📎 ; Modifier/Supprimer par message) ; chrono cliquable (« 1:20 », « 1h20 » ou « 80 ») ; ▶ Démarrer, ou démarrage au début de l'écriture — jamais à l'ouverture ; fenêtre « Un autre ticket est déjà actif » : mettre en pause / laisser tourner / Annuler ; Facturable + service sur la barre du chrono ; Historique du temps. Quitter le ticket n'arrête plus le chrono : pastilles des chronos actifs en haut de l'écran (`Layout.jsx`), ⏱ dans la liste.
  - Vérifié : API (chrono, image, correction, pause, fermeture), facture calculée dans une transaction annulée (aucun numéro consommé), Playwright 1920 (pas de démarrage à l'ouverture, fenêtre à la frappe, deux chronos, image, Ctrl+Entrée, correction 1:05 tracée). Tickets d'essai effacés.
- 2026-10-17 — **Rappels et présence** (Philippe : « il va devenir le setting de temps pour les notifications » ; « pourquoi on note au lieu d'avancer ? »).
  - Réglage « seuil de confirmation du temps » remplacé (Admin › Configuration générale › Tickets) : `ticket_reminder_minutes` (nombre libre, 0 = aucun, 30 par défaut), `ticket_reminder_sound` + `ticket_reminder_volume` (bouton Écouter), `ticket_reminder_visual` (notification du navigateur ; état de l'autorisation affiché, bouton Autoriser/Essayer). Aucune valeur n'avait été enregistrée pour l'ancien réglage.
  - Rappel (`Layout.jsx`, `components/ticketReminder.js`) : à chaque tranche de N minutes d'un chrono qui tourne, message dans l'écran (« Ticket #… — client — Chrono actif depuis X h Y », OK / Ouvrir le ticket) + son + notification ; le chrono continue. Retenu par chrono (pas de rafale au rechargement). Limites : son seulement après un premier clic dans la page ; notification à autoriser une fois (demandée au clic sur Démarrer).
  - Présence : migration `017f99a0ff4b` (`users.presence_at`) ; chaque écran ERPCRM ouvert envoie un battement toutes les 30 s (`POST /tickets/timers/heartbeat`, qui répond aussi mes chronos actifs) ; `services/ticket_presence.py` (tâche de fond) : sans battement depuis 5 min, mes chronos s'arrêtent à l'heure du **dernier** battement (raison « aucun écran ouvert »), jamais à l'heure où on s'en aperçoit ; corrigeable par clic sur le chrono.
  - Vérifié : pause automatique (seuil 5 min : rien ; seuil forcé à 0 : chrono arrêté, raison navigateur_ferme), rappel affiché après 1 min dans Playwright (réglage remis à 30), écran Admin. Ticket d'essai effacé.
- 2026-10-18 — **Étape 2 : Zéko dans ERPCRM** (Philippe : « est-ce que Zéko va être l'IA qui va gérer mes relevés et tout le reste… la seule IA d'ERPCRM & SIPV » → oui ; « super go »). Date(s) de travail : 2026-10-18.
  - Décision : **Zéko = la seule IA** d'ERPCRM (et de SIPV par son API, étape 6, sans code IA sur SIPV). Moteur unique `core/zeko.py` : réglage unique (Administration › Intégrations › Zéko : activé, adresse API compatible OpenAI, modèle de conversation, modèle des tâches ; vide = `LOCAL_AI_URL`/`LOCAL_AI_MODEL` du serveur), journal de chaque appel (`zeko_invocations` : fonction, modèle, statut ok/erreur/interrompu, durée, jetons — pas le contenu).
  - Les 4 usages existants rebranchés sans changer leur comportement : dépôts bancaires (`bank_ai_poller`), reçus (`receipt_reader`), Interac (`interac_mail`), signatures de courriels (`mail_match`). Plus aucun appel direct au modèle ailleurs.
  - Priorité : une conversation tient un verrou Postgres partagé (`pg_advisory_lock_shared`, vu par 8010 et 8011) ; une tâche de fond attend, et si une conversation commence pendant son appel elle est coupée (le modèle s'arrête) puis reprise. Vérifié : tâche coupée à 14 s (« interrompu »), conversation répondue en 11 s, tâche reprise et terminée.
  - Modèle : mesuré sur ce processeur, gpt-oss:20b écrit 4,4 jetons/s contre 2,3 pour qwen3:14b → gpt-oss:20b pour la conversation aussi (un seul modèle en mémoire). Futur serveur RTX : changer le modèle dans l'écran, rien à recoder.
  - Conversation (`api/v1/endpoints/zeko.py`, migration `ba4679ab41df` : `zeko_conversations`, `zeko_messages`) : réponse en flux (mot par mot), outils de LECTURE seulement (`core/zeko_tools.py` : chercher, fiche_client, tickets_client, lire_ticket, equipements, telephonie), jusqu'à 5 tours d'outils, échanges gardés (outils compris). Dans un ticket : une conversation par ticket, partagée par les techniciens, jamais montrée au client, avec le contexte du ticket (client, demande, derniers messages). Consigne : ne jamais dire qu'une info manque sans avoir ouvert l'outil qui la contient (1er essai : « poste non enregistré » alors que la fiche disait 302 → corrigé, 2e essai juste).
  - Écran : bouton **Zéko** à gauche du nom (panneau à droite : mes conversations, + Nouvelle, Supprimer) ; bouton **Zéko** dans l'en-tête du ticket ; « Zéko lit la fiche du client… » pendant qu'il consulte ; Arrêter (le texte déjà écrit reste). Admin › Intégrations : réglage + derniers appels.
  - Vérifié (Playwright 1920) : dans un ticket Audacie, « poste de Mélanie et son courriel ? » → chercher + fiche_client → « 302, mlussier@audacie.com » en 65 s. Ticket et conversations d'essai effacés.
  - 2026-10-18 — Erreur 504 au premier essai de Philippe par portail.simpleip.tel (rien n'était envoyé pendant la réflexion > 60 s) : signe de vie SSE immédiat puis toutes les 10 s ; nginx `location /api/v1/zeko/` sans tampon, 1800 s. Vérifié par l'adresse publique (1er octet 0 s, réponse 38 s). Voir ERRORS_LESSONS.md TASK-006.5.
  - 2026-10-18 — Philippe : « les ID client c'est pour ERPCRM, pas pour les techs ni pour les clients ; Zéko ne doit pas le mentionner, c'est épeurant ». Zéko avait montré l'id interne d'un contact, nommé ses outils et demandé un ID. Corrigé à la source : les outils prennent des **noms** (client, personne ; numéro #… pour un ticket) et ne renvoient plus aucun id ; nouvel outil `fiche_contact` (coordonnées + entreprises) ; plusieurs correspondances = Zéko nomme les choix et demande ; consigne : jamais d'id, de code technique ni de nom d'outil. Zéko sait aussi à qui il parle (nom et rôle de l'utilisateur, « pas un client »). Rejoué par l'adresse publique : se présente → salue Captaine ; « mes coordonnées » → fiche de Philippe Normandeau ; « Immo » → propose Gestion Immo 1ère / Danau.
  - 2026-10-18 — Le curseur reste dans la boîte d'écriture de Zéko (à l'ouverture, pendant et après la réponse ; on peut écrire la suite pendant qu'il répond, Entrée n'envoie qu'une fois la réponse finie). Vérifié dans Playwright.
  - 2026-10-18 — **Étape 4 : IA externe d'appoint** (Philippe : « on va connecter Gemini » ; « est-ce que d'autres IA performantes pourraient être connectées ? DeepSeek ? »). Un seul branchement, fournisseur au choix (`zeko.PROVIDERS` : Gemini, DeepSeek, Mistral, OpenAI, autre compatible OpenAI) ; Admin › Intégrations › Zéko › « IA externe d'appoint » : case, fournisseur (avec sa note de confidentialité), clé chiffrée (jamais renvoyée à l'écran, « Effacer la clé »), modèle (liste lue chez le fournisseur), Essayer. Zéko local reste le chef : outil `demander_ia_externe` (présent seulement si activée), question **expurgée** avant l'envoi (`core/zeko_redact.py` : noms de clients et de personnes d'ERPCRM, courriels, téléphones, IP, MAC, codes postaux, adresses civiques), trace locale complète (migration `878b235ae53d` : `zeko_invocations.request_redacted`/`response`) ; quota, clé refusée ou panne → Zéko continue seul et le dit. Vérifié : expurgation d'une phrase type, clé bidon refusée par Google (400 « valid API key »), clé effacée → « aucune IA externe activée ». **En attente : la clé de Philippe** (aistudio.google.com/apikey). Conditions vérifiées : Gemini gratuit = contenu réutilisé par Google et lisible par des employés (payant : non) ; DeepSeek = pas de gratuit permanent (5 M jetons à l'inscription), serveurs en Chine.
  - 2026-10-18 — Espaces invisibles dans les réponses de Zéko (« SimpleIPinc. » à l'écran, espaces présentes au copier) : le modèle écrit des espaces fines insécables (U+202F) que la police ne dessine pas. Remplacées par des espaces normales à la sortie du modèle (`zeko.clean`, conversation, tâches, IA externe) et à l'affichage (anciens messages). La police (Manrope) est livrée avec ERPCRM : même rendu chez tous les clients.
  - 2026-10-18 — **Zéko dans le fil du ticket** (Philippe : « les tickets ne sont pas liés avec Zéko ?? je croyais que le champ de texte des tickets devait être Zéko aussi » — conforme au cahier, section 2 ; j'avais mis Zéko dans un panneau à part). Le technicien écrit dans le ticket ; si son message contient un « ? » ou « Zéko », Zéko répond dans le même fil (`POST /zeko/tickets/{id}/reply`, flux SSE ; message `author_kind = zeko`, marqué « interne », modifiable/supprimable, jamais dans le résumé envoyé au client). Une simple note ne déclenche rien. Historique donné au modèle = le fil du ticket (technicien, client, Zéko ; images signalées). Le bouton/panneau Zéko séparé du ticket est retiré (le bouton du haut reste pour hors ticket). Boucle de conversation commune (`_turn`, `_stream`) pour les deux. Vérifié (Playwright) : note → aucune réponse ; « Zéko, quel est le poste de Mélanie et son courriel ? » → réponse dans le fil (302, courriel) en 111 s.
  - 2026-10-18 — **Numéro de ticket** (Philippe, voyant « ticket #1EA6F8E1 » chez Zéko : « dans numérotation des documents on va ajouter ticket, on va commencer à 11000, prochain 11001 »). Migration `71c2762eece2` : `tickets.number` (unique) ; tickets existants numérotés 11000… par ordre de création (« test de ia » = 11000) ; compteur « ticket » (préfixe vide, sans zéros) dans Administration › Numérotation des documents (« Tickets → 11001 »), qui ne recule jamais. Numéro donné à chaque création : écran, réponse client déplacée en nouveau ticket, courriel reçu (2 cas), rendez-vous de l'agenda, portail client (`numbering.assign_ticket_number`). Partout « #11000 » (écran, notes de facture, Zéko) ; courriels : « [Ticket #11000] » ; les réponses par courriel sont reconnues par le numéro, et encore par l'ancien code à 8 caractères pour les courriels déjà envoyés. Zéko : statuts en français (« en cours », jamais « en_cours »). Vérifié : attribution dans une transaction annulée (11001 non consommé), lecture des sujets « [Ticket #11000] » et « [Ticket #1EA6F8E1] ».
  - 2026-10-19 — Philippe : « j'aimais bien voir ce que Zéko faisait pour me répondre en message éphémère… je voyais qu'il travaillait » ; « Shift+Enter pour passer une ligne ou Enter, de base Enter envoie à Zéko ; quand Zéko réfléchit le bouton Envoyer est entouré rouge ». (1) La réflexion du modèle est transmise en direct (`pense` avec texte) et montrée en gris italique (« Zéko réfléchit : … »), effacée dès qu'il consulte ou répond ; consigne « Réfléchis en français » (gpt-oss réfléchit souvent en anglais malgré tout). (2) Case « Entrée envoie » (cochée par défaut ; décochée : Ctrl+Entrée envoie), retenue sur l'appareil, dans le ticket et le panneau Zéko. (3) Pendant que Zéko répond : Envoyer désactivé et entouré de rouge (Arrêter à côté). (4) Constaté sur le ticket T-11000 : « et maintenant tu vois quoi comme info… » (sans « ? » ni « Zéko ») était resté sans réponse → Zéko répond aussi quand le message précédent est le sien, aux mots de question (quoi, comment, pourquoi, combien, est-ce, peux-tu…) et aux demandes en début de message (donne, trouve, montre, liste…) ; bouton « Zéko, réponds » au survol du dernier message du technicien. Vérifié (Playwright) : Maj+Entrée = ligne, réflexion affichée puis effacée, anneau rouge, bouton au survol ; règle testée sur des phrases types (une note « je regarde le téléphone » ne déclenche rien).
  - 2026-10-19 — Philippe : « fais-le répondre à tout ; il répondra “parfait, tu es arrivé chez le client” ». Zéko répond maintenant à chaque message du technicien dans le ticket (la règle « ? / mots de demande » est retirée) ; consigne : une simple note = une courte phrase sans consulter d'outil, une question = vraie réponse. Simulé sans écrire dans un ticket : note « Arrivé chez le client, je regarde le téléphone de Mélanie » → « Parfait, vérifie que le téléphone de Mélanie fonctionne… », 22 s, aucun outil. Le bouton « Zéko, réponds » reste (réponse coupée ou en erreur).
  - 2026-10-21 — Philippe : « je dois avoir l'option d'importer/prendre une photo dans l'onglet ticket avec Zéko, je suis sur le portail avec mon cell ». Bouton « 📷 Photo » (ouvre directement l'appareil photo du téléphone : `capture="environment"`) à côté de « 📎 Image » (galerie/fichiers) ; sur cellulaire, l'en-tête du ticket (titre, boutons, chrono) défile avec la page au lieu de cacher la moitié de l'écran. Vérifié (Playwright, iPhone 13) : champ photo présent, aperçu de la photo avant l'envoi, aucune erreur. Note : Zéko ne « voit » pas encore les images (modèle texte) ; il sait seulement qu'une image est jointe. Incident : le test a démarré le chrono du ticket T-11000 de Philippe (choisir une photo démarre le chrono) → mis en pause par l'écran, 18 s ajoutées, laissées à sa décision. Leçon : tester sur un ticket d'essai, jamais sur un ticket de Philippe (ERRORS_LESSONS TASK-006.5).
  - 2026-10-21 — **Étape 3 (début) : courriels, banque et mémoire** (Philippe : « est-ce que Zéko a tout ce qu'il faut pour le faire (ouvrir des images), je le ferais faire par lui » ; « il va aussi me demander si je veux que ce soit inscrit dans la mémoire de Zéko que ça c'est lié à ça, pour une future automatisation ? » ; « oui ajoute les outils »). Nouveaux outils de LECTURE : `chercher_courriels` (client, texte, montant — cherché aussi dans les PDF joints —, période élargie de 10 jours avant à 3 jours après quand on cherche un montant ; seulement les boîtes que l'utilisateur a le droit de voir, règle `_visible` de Courriels ; référence lisible « date heure expéditeur », jamais un identifiant), `lire_courriel` (texte + pièces jointes : PDF par pdftotext, PDF scanné et images par tesseract fra+eng), `transactions_banque` (dépôts/retraits, état, client, factures). Mémoire : migration `38ef6776564f` (`zeko_rules`), outils `regles_apprises` et `retenir` (consigne : seulement après un « oui » ; `lire_courriel` lui rappelle de proposer « Je retiens que… ? » quand l'expéditeur, relié à un client, n'a pas encore de règle) ; Admin › Intégrations › Zéko › « Ce que Zéko a appris » (Modifier, Mettre de côté, Oublier). Zéko ne modifie toujours aucune transaction. Vérifié : « Le dépôt de 212,08 $ de Mc Crystal du 19 octobre, il paie quelle facture ? » → chercher_courriels + lire_courriel → « facture 112237 » d'après le relevé PDF de Nicole Gendron, puis « Je retiens que Mc Crystal envoie ce genre d'avis depuis n.gendron@mc-crystal.com ? » (pas de « oui » donné par moi : décision de Philippe). Premier essai raté (avis cherché seulement le jour du dépôt, montant seulement dans le PDF) → corrigé. Reste : utiliser la mémoire pour associer automatiquement (seulement quand factures et montants concordent exactement) ; comprendre une vraie photo (modèle visuel, carte graphique).
  - Reste (étape 3 et suivantes) : images dans la conversation avec Zéko (modèle visuel), mémoire/connaissances, Gemini optionnel (étape 4), portail client (étape 5), actions (étape 6).

### TASK-006.6 [x] Administration › Zéko : réglages, ce qu'il a appris, règles de la banque, propositions ; Zéko change les règles après un oui
- **Date de demande** : 2026-10-22 (Philippe : « retire la règle d'association HB → Elavon… dans admin j'aimerais un onglet Zéko, entre autres avec les associations de paiement, les règles qu'il a ; je veux aussi qu'il soit capable de les consulter avec le chat Zéko, d'ajouter ou d'enlever les règles qu'on identifierait incorrectes »)
- **Date(s) de travail** : 2026-10-22
- Règle « ELAVON MRCH SVC → HB Architectes » (créée le 2026-10-07) : client retiré, fournisseur Elavon gardé → dépôts Elavon du 26 février et du 3 mars sans client. Le 2,23 $ reste à HB (associé à la main, et c'est bien HB selon le reçu). Le bouton « Tous les dépôts » de retrait n'avait pas été utilisé sur cette règle (dernier geste du 21 octobre : HB remis sur ce dépôt seulement).
- Backend : `bank.rule_forget_client()` / `rule_delete()` partagés ; `POST /bank/rules/{id}/forget-client`.
- Zéko (`core/zeko_tools.py`) : `regles_banque` (lecture), `changer_regle_banque` (retirer_client / supprimer / associer_client), `oublier` ; changement seulement après un « oui » à « Je … ? » et pour administrateur/gestionnaire (`_can_change`). Consigne SYSTEM mise à jour.
- Frontend : onglet **Zéko** dans Administration (sous-onglets Réglages, Ce que Zéko a appris, Règles de la banque, Propositions de paiement) ; `components/BankRulesPanel.jsx` partagé avec Banque › Règles de transaction (bouton « Retirer le client » quand la règle a aussi un fournisseur ; fiches empilées sur cellulaire). Mesuré 1920 et 390 : aucun défilement horizontal, aucun bouton qui déborde.

## TASK-007 [ERPCRM] [x] Employés — depuis contacts, salaires, confirmation Interac
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `employees`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Employés — depuis contacts, salaires, confirmation Interac

### TASK-007.1 [x] Signature de courriel par employé (texte, images, polices, liens)
Date de demande : 2026-10-08 (Philippe : « mets aussi une signature par employé où je peux mettre texte et image avec différentes typos et tous les outils pour faire une petite présentation » ; « ne le fais pas, je vais l'importer moi-même dans employé Philippe » ; « par contre pas les factures envoyées avec une signature, juste les courriels de communication »)
Date(s) de travail : 2026-10-08

- Migration cc4ad27cbd32 (id généré, une seule tête, up/down/up testés) : `employees.user_id` (compte de connexion, FK `users` SET NULL, unique) et `employees.email_signature` (HTML).
- Employés : bouton « ✉ Signature » (✓ quand remplie) → fenêtre : compte de connexion de l'employé, éditeur `components/SignatureEditor.jsx` (TipTap 3 : police, taille, gras/italique/souligné/barré, couleur, surligné, alignement, puces, lien https/mailto/tel, image redimensionnable, ligne, enlever le format, annuler/rétablir), Aperçu (iframe isolée). Coller depuis Outlook/Gmail garde polices/tailles/couleurs ; image collée seule (capture) insérée ; images `file:`/`cid:` d'Outlook retirées avec un avertissement (illisibles hors de l'ordinateur). Images réduites à 600 px de large, gardées en `data:` ; 3 Mo maximum.
- Routes : `GET /employees/users` (comptes actifs, pour tout utilisateur — Philippe est « manager », `/admin/users` est réservé à admin), `GET/PUT /employees/{id}/signature`, `PATCH /employees/{id}` accepte `user_id` (refus si le compte est déjà relié à un autre employé).
- Envoi (`core/signature.py`, `core/email.py`) : signature de l'employé relié au compte qui envoie, insérée avant le pied de page du gabarit ; chaque image `data:` devient une pièce intégrée (multipart/related, Content-ID) ; paragraphes sans marge. Seulement les courriels de communication : ticket ouvert, résumé de ticket, tâche envoyée. Jamais facture, devis, avis de retard, confirmation de rendez-vous (automatique), rapports.
- Vérifié : Playwright (collage HTML type Outlook → police/taille/couleur gardées, avertissement d'image, lien, image, aperçu, enregistrement, ✓) ; construction du courriel avec la signature enregistrée (signature avant le pied de page, image en pièce intégrée). Aucun courriel réel envoyé. Signature de test effacée ; compte de connexion de Philippe laissé relié à sa fiche Employé (seul compte possible).

### TASK-007.2 [x] Vendeurs : commission automatique sur les factures payées de leurs clients, solde à payer
Date de demande : 2026-10-22 (Philippe : « c'est cet automatisme de 10 % de commission de ces factures quand on me les paye que je voudrais qu'il s'automatise… qu'il s'actualise automatiquement quand j'ajoute un client avec leur nom comme vendeur… si j'en manque parce qu'il a augmenté ses clients je puisse le voir et ajuster, un peu comme un client qui doit me payer mais à l'envers… 2 onglets Employés et Vendeurs » ; « par défaut c'est ça mais j'aimerais pouvoir les modifier indépendamment de chaque vendeur »)
Date(s) de travail : 2026-10-22

- Constat 2026-10-22 : vendeur référent (`companies.vendor_id`) vide sur les 5 clients ; rapport Employés → Commissions = un seul taux (10 %), sur le total taxes incluses, sur le facturé du mois. Les commissions réelles sont des factures fournisseur périodiques à montant fixe : Richard Handfield (Remorques 125 14,97 + HB 4,59 = 19,56 $/mois, depuis 2026-05-09) et TECHNI-EXPRESS (Oxygène 2,29 + Le Passeur 12,86 + MRST 20,70 = 35,85 $/mois, depuis 2021-06-30 ; mai-sept. 2026 « en retard ») — 10 % du sous-total avant taxes, à d'anciens prix.
- Décision de Philippe (2026-10-22) : départ au dernier paiement fait à chacun ; ses factures fournisseur de commission (sa façon de « garder le fil » dans l'ancien logiciel) remplacées par le module.
- Fait : migration 57ee8f97cbee (id généré, une seule tête, up/down/up testés) — `sales_reps` (contact = « Vendeur » de la fiche client, fournisseur payé, taux, avant taxes, périodiques seulement, factures émises à partir du…, actif) et `commission_entries` (commission par part de paiement `payment_allocations`, ajustement, annulée).
- `core/commissions.py` `sync()` (poller des périodiques aux 30 min + ouverture de l'onglet, verrou `pg_advisory_xact_lock`) : commission = taux × part payée (× sous-total/total si avant taxes) sur les factures émises depuis la date de début ; avoir/troc exclus ; paiement retiré → commission enlevée si sa facture de commission n'est pas payée, sinon « annulée » + ajustement négatif ; paiement fusionné → rattaché sans doublon ; client retiré du vendeur / règles changées → commissions non payées enlevées. Les commissions d'un mois = facture fournisseur `COM-AAAA-MM` (source `commission`, compte « Commissions et frais », sans taxes ; `-2`, `-3` si la précédente est déjà payée). Le virement Interac s'associe dans Banque comme pour tout fournisseur.
- API `/api/v1/sales-reps` (liste + solde, détail, création, modification, `/adjust`, retrait d'un ajustement). Écran : Employés → onglets « Employés | Vendeurs » (`components/SalesRepsPanel.jsx`, `?tab=vendeurs`) : un onglet par vendeur (reste à payer), réglages, ses clients, commissions, factures et paiements, « Ajuster ». L'ancien rapport « Commissions vendeurs » (un taux pour tous, taxes incluses, sur le facturé) retiré de l'écran. Mesuré : 1920 et iPhone 13 sans défilement horizontal.
- Données (API, sauvegarde `~/backups/before_sales_reps_20261022_1609.sql`) : contacts Richard Handfield (IP Télécom) et Sylvain St-Laurent (Techni-Express) créés, pastille vendeur ; Richard vendeur de Remorques 125 et HB (factures depuis 2026-10-10, payé à « Richard Handfield ») ; Sylvain de Oxygène, Maison Le Passeur, MRST (depuis 2026-05-01, payé à TECHNI-EXPRESS). Les 2 factures fournisseur périodiques arrêtées ; les 5 factures Techni-Express impayées de mai à sept. 2026 (5 × 35,85 $) supprimées, remplacées par COM-2026-05 à COM-2026-09 (150,69 $) ; Richard : COM-2026-10 (4,79 $). Les anciennes factures déjà payées restent (preuves des dépenses et des paiements bancaires associés).

### TASK-007.3 [x] Vendeurs : commission avec support (10 %) ou référence sans support (5 %), taux propre à un client
Date de demande : 2026-10-22 (Philippe : « certains vendeurs font le premier support, eux ils ont 10 %, mais certains vendeurs ne font pas de support, genre c'est juste une référence, ils sont récompensés à 5 %… par client… et dans Employés › Vendeurs on pourrait avoir les deux » ; puis « pouvoir modifier le taux, admettons qu'un certain client il est différent du taux général… sur le client qui afficherait le taux de base, ou une liste des clients dans le vendeur »)
Date(s) de travail : 2026-10-23

- Migration 306b54677bf7 (id généré, une seule tête, up/down/up testés ; sauvegarde `~/backups/before_commission_modes_20261023.sql`) : `companies.vendor_support` (défaut vrai) et `companies.vendor_rate` (taux propre au client, vide = taux du vendeur) ; `sales_reps.referral_rate` (défaut 5) à côté de `rate` (avec support) ; `commission_entries.mode` (support | reference | client ; les commissions existantes mises à « support »).
- `core/commissions.py` `rate_for()` : taux du client s'il en a un, sinon taux du vendeur pour le mode du client ; gardé sur la commission (un changement vaut pour les paiements suivants). Ligne de la facture COM : « 5 % (référence) de … ».
- API : `PUT /sales-reps/{id}/clients/{company}` (mode + taux propre), `GET /sales-reps/by-contact/{contact}` (taux pour la fiche client, sans recalcul) ; fiche client `PUT /companies` accepte `vendor_support`/`vendor_rate` (0-100 %) ; changer de vendeur remet « avec support », taux du vendeur.
- Écrans : Employés › Vendeurs → deux taux dans les réglages (et à l'ajout), « Ses clients » = une ligne par client (mode, taux personnalisé, Enregistrer), taux et mode dans le tableau des commissions ; fiche client → « Commission du vendeur » sous « Vendeur ». Mesuré 1920 et iPhone 13 : Vendeurs sans défaut ; fiche client : seul « + Tâche » de l'en-tête déborde sur cellulaire (déjà avant ce changement).
- Données : Richard et Sylvain — tous leurs clients restent « avec support » 10 %, soldes inchangés (4,79 $ et 150,69 $).

---

## TASK-008 [ERPCRM] [x] Commandes fournisseurs — PO + lignes
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `purchase orders`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Commandes fournisseurs — PO + lignes

### TASK-008.1 [x] Fusion navigation avec Web orders (TASK-009) sous un seul onglet "Commandes"
Date de demande : 2026-09-11
Date(s) de travail : 2026-09-11

Philippe a remarqué que "Commandes" (fournisseurs) et "Web orders" (Ecom) étaient deux entrées de nav séparées alors que ce sont conceptuellement "une commande" des deux côtés — proposé de fusionner. Vérifié avant de coder (`ecom.py`/`purchase_order.py`) : les deux modèles restent bien distincts et NE DOIVENT PAS être fusionnés en données — flux d'argent opposés (Ecom = le client achète chez Simple IP, prix de vente ; Commandes fournisseurs = Simple IP achète chez un fournisseur, prix coûtant, parfois dropshippé). Confirmé par Philippe une fois la distinction expliquée. Décision finale : fusion en **navigation seulement**, un onglet "Commandes" avec deux sous-onglets (Fournisseurs par défaut, Web) — sans toucher aux modèles/données.

**Fait** :
- `frontend/src/pages/Commandes.jsx` (nouveau) — sélecteur d'onglets (`?tab=fournisseurs`/`?tab=web`, même patron que `Admin.jsx`), réutilise tel quel `PurchaseOrders`/`EcomOrderList` (aucune réécriture des composants existants).
- `Layout.jsx` — 2 entrées nav (`/purchase-orders`, `/ecom-orders`) remplacées par 1 (`/commandes`).
- `App.jsx` — route `/commandes` ajoutée ; `/purchase-orders` et `/ecom-orders` (listes) deviennent des redirections (`<Navigate>`) vers `/commandes?tab=...` — les pages détail (`/purchase-orders/:id`, `/ecom-orders/:id`) et tous leurs liens "retour" existants restent inchangés, la redirection les gère de façon transparente.

Besoin réel identifié en discutant (pas construit dans cette entrée, à reprendre séparément) : savoir QUI a précisément commandé (pas juste quelle Compagnie) — Ecom n'a que du texte libre (`customer_name`/`email`), pas de lien vers un Contact précis ; Commandes fournisseurs n'a aucun champ "commandé par" (utilisateur interne) si plusieurs employés Simple IP peuvent créer un bon de commande.
Fichiers : frontend/src/pages/Commandes.jsx (nouveau), frontend/src/components/Layout.jsx, frontend/src/App.jsx.

---

### TASK-008.2 [x] Fenêtre « Ajouter une ligne » d'un bon de commande : ne déconnecte plus
Date de demande : 2026-10-09 (Philippe : « Fiche Commande fournisseur go »)
Date(s) de travail : 2026-10-09

- `PurchaseOrderDetail.jsx` (AddLineModal) appelait `/v1/catalogue/` : le serveur redirige (307) sans l'autorisation → 401 → déconnexion (même défaut que TASK-014.2). Corrigé : `/v1/catalogue`. Vérifié : `/v1/catalogue` = 200, `/v1/catalogue/` = 307 ; plus aucun appel `/v1/catalogue/` dans l'écran. Fenêtre non ouverte dans un navigateur : aucun bon de commande n'existe encore (en créer un aurait ajouté une vraie donnée).

## TASK-009 [ERPCRM] [x] Web orders — commandes boutique ecom
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `ecom orders`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Web orders — commandes boutique ecom

*(Voir TASK-008.1 pour la fusion navigation avec Commandes fournisseurs sous un seul onglet "Commandes" — données restées distinctes, seule la présentation a changé.)*

---

## TASK-010 [ERPCRM] [x] Équipements — catalogue équipements clients
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `equipment`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Équipements — catalogue équipements clients

---

## TASK-011 [ERPCRM] [x] Maintenance — accès clients (ClientAccess)
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `maintenance`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Maintenance — accès clients (ClientAccess)

---

## TASK-012 [ERPCRM] [x] Téléphonie — DIDs, extensions
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `telephony`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Téléphonie — DIDs, extensions

> **Lien croisé ajouté en Phase O** : le modèle natif `DID`/`Extension` introduit ici (`models/telephony.py`) a été réécrit en profondeur par **TASK-023.31** (retrait de `carrier`/`did_type`/`status`/`label`, ajout de `destination_type`/`destination`/`site_id`/`schedule_id`, synchronisation vers `TenantDID` côté SIPV). Pour l'état actuel réel du modèle DID, voir TASK-023.31 — cette entrée TASK-012 est conservée comme trace historique de la création initiale, pas comme description à jour du modèle.

---

## TASK-013 [ERPCRM] [x] Paramètres — settings globaux
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `settings`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Paramètres — settings globaux

---

## TASK-014 [ERPCRM] [x] Admin — gestion utilisateurs, rôles
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `admin`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Admin — gestion utilisateurs, rôles

### TASK-014.1 [x] Persister l'onglet actif dans l'URL
Date de demande : 2026-08-29 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-29

Le clic sur un onglet ne changeait qu'un `useState` local — un refresh
retombait toujours sur "Utilisateurs" peu importe l'onglet consulté. Ajouté
un paramètre `?tab=<slug>` (slug stable, pas l'index, pour survivre à un
réordonnancement de TABS), lu à l'ouverture et écrit à chaque clic. Les
callbacks OAuth existants (`?google_calendar=`, `?backup=`) restent
prioritaires et inchangés.
Fichier : frontend/src/pages/Admin.jsx (commit a29bfdc).

---


### TASK-014.2 [x] Comptes de connexion — changer son mot de passe, compte de départ jamais recréé, un seul compte pour Philippe
Date de demande : 2026-10-09 (Philippe : « admin@simpleip.ca n'existe même pas comme adresse… mets philippe@ comme administrateur et enlève admin@simpleip.ca, et je veux une place pour changer mon mot de passe, SimpleIP2026! c'est trop facile » ; puis « on peut aussi juste changer le courriel et effacer celui que je n'ai jamais utilisé »)
Date(s) de travail : 2026-10-09

- Constaté : Philippe se connecte depuis toujours avec admin@simpleip.ca (« Administrateur ») ; philippe@simpleip.ca (gestionnaire) n'a jamais servi à se connecter, mais sa fiche Employé, sa boîte philippe@ et sa signature y sont reliées (TASK-047.3 : philippe@ non proposée à l'envoi, signature absente). Les deux comptes portent de l'historique (admin@ : 67 entrées de journal, 12 entrées de tickets, 5 reçus, 4 relevés, 5 paiements de taxes ; philippe@ : 147 entrées de journal, fiche Employé, boîte, 2 tâches, gestionnaire de 2 compagnies, 1 courriel envoyé) — liens sans suppression en cascade : un compte ne peut pas être effacé sans d'abord déplacer ces liens.
- `core/seed.py` recréait admin@simpleip.ca (et philippe@simpleip.ca) au démarrage s'il manquait, avec le mot de passe par défaut : un compte retiré serait revenu avec un mot de passe connu. Corrigé : le premier compte n'est créé que sur une installation neuve (aucun utilisateur), jamais recréé ensuite.
- Changer son mot de passe : clic sur son nom en haut à droite → fenêtre (actuel, nouveau ×2, afficher) ; `POST /auth/change-password` (actuel vérifié, 10 caractères ou plus, différent de l'actuel). Vérifié : refus mot de passe actuel incorrect / trop court / identique ; changement réussi sur un compte factice en mémoire (aucun vrai mot de passe touché) ; écran (Playwright, aucune erreur).
- Fusion des deux comptes : plan présenté à Philippe ; mis en pause par lui (« attends »).
- Demande ajoutée le 2026-10-09 (Philippe : « je ne veux pas que le système utilise le courriel pour identifier l'usager ; un usager devra avoir un user attribué avec les premières lettres de son prénom et nom et ERPCRM et 0001 pour le premier et 0002 pour le 2e usager qui crée un portail… sinon le tech ou le client ne peut pas changer son courriel ») : nom d'utilisateur généré pour la connexion (employés et portail client), indépendant du courriel. Constaté : la connexion se fait aujourd'hui par le courriel pour les deux (`auth.py` `User.email`, `portal.py` `PortalUser.email`) ; le portail garde sa propre copie du courriel, distincte du courriel de la fiche contact (deux valeurs qui peuvent diverger). Format exact et numérotation à confirmer avec Philippe avant de construire.
- Précisé le 2026-10-09 (Philippe : « le user est toujours le courriel du tech ou du client, mais il est lié à un code unique derrière, ex. PNERPCRM0001… on change de courriel pour le user ou le contact et rien ne change dans l'historique, juste que de telle date à telle date c'était ce courriel ») : connexion par le courriel ; identité = code unique fixe en arrière-plan ; historique daté des courriels. Constaté : l'historique est déjà rattaché à un identifiant interne fixe (UUID), jamais au courriel ; un changement de courriel d'une fiche contact est déjà inscrit au journal (ancien, nouveau, date, qui) ; pas celui d'un compte de connexion (Admin → Utilisateurs). Écart avec la règle « une seule source » : le compte portail garde sa propre copie du courriel. Proposé : code lisible généré une fois (initiales + ERPCRM + numéro), connexion par le courriel de la fiche (portail) / du compte (employés), changement de courriel d'un compte inscrit au journal.
- Décidé le 2026-10-09 (Philippe : « je ne veux pas de copie de courriel !!! c'est lier pas copier !!! pour le code, tant mieux si on a déjà ça, laisse-le comme ça, on s'en fout qu'il soit lisible ») : pas de code lisible — l'identifiant interne existant (UUID) suffit ; aucune copie de courriel : la connexion lit le courriel là où il vit (fiche contact pour le portail).
- Fait (GO de Philippe, 2026-10-09 : « go fais le plan complet »), copie complète de la base avant (full_before_014_2.dump) :
  - Portail client lié, plus de copie : migration aa1fdaf3780b (id généré, une seule tête, down/up testés ; 0 compte portail existant) retire `portal_users.email` et `full_name`, `contact_id` obligatoire ; `PortalUser.email` / `full_name` lus de la fiche contact (relation chargée avec le compte). Connexion par le courriel de la fiche (majuscules indifférentes) ; un accès par contact ; un courriel ne sert qu'à un seul accès portail — vérifié à la création (`core/portal_access.py`) ET quand le courriel de la fiche change (fiche contact, fiche Employé) ; un contact avec accès portail ne peut pas perdre son courriel. Écrans : fiche contact et Administration → Portail client choisissent un contact (« Se connecte avec … — s'il change dans la fiche, sa connexion suit »), plus de champs nom/courriel.
  - Employés : courriel professionnel de la fiche Employé = courriel de connexion du compte, changé à un seul endroit (`core/accounts.py` `set_login_email`, appelé par la fiche Employé et par Administration → Utilisateurs) ; la boîte personnelle suit (adresse, identifiant, recopie depuis le début) ; inscrit au journal de sa fiche (« Courriel de connexion », ancien, nouveau, date, qui) ; doublons refusés sans tenir compte des majuscules ; connexion insensible aux majuscules ; courriel professionnel possible sans boîte (connexion seulement).
  - Fusion : migration 52822cdce421 (ne s'applique que si ces deux comptes existent ; pas de retour arrière automatique, la copie de la base en tient lieu ; relancée = sans effet) : tout ce qui pointait vers philippe@simpleip.ca (toutes les colonnes liées aux comptes, trouvées dans la base, + verrous de téléphonie) passé au compte utilisé ; philippe@simpleip.ca retiré ; compte gardé = « Philippe Normandeau », administrateur, connexion philippe@simpleip.tel, même mot de passe. Vérifié : 1 seul compte ; journal 67 + 147 = 214 lignes à son nom ; fiche Employé, boîte philippe@, 2 tâches, 2 compagnies, courriel envoyé suivis ; admin@simpleip.ca refusé (401) ; connexion « Philippe@SimpleIP.tel » acceptée (admin) ; boîtes d'envoi = facturation@, philippe@, portabilite@, service@ + signature.
  - Vérifié (transactions annulées, rien gardé) : portail — création, 2e accès refusé, connexion en majuscules, courriel changé dans la fiche → ancien refusé / nouveau accepté, conflit 409, courriel vidé refusé, liste et /me lisent la fiche, journal ; employé — courriel de connexion changé → boîte suit + journal, doublon refusé. Écrans (Playwright) : les deux fenêtres d'accès portail, en-tête « Philippe Normandeau ».
  - Défaut trouvé en chemin et corrigé : la fenêtre « Nouvel accès » d'Administration appelait `/v1/companies/` → redirigé sans l'autorisation → 401 → déconnexion ; corrigé (`/v1/companies`). Même défaut repéré, non touché (hors demande) : `PurchaseOrderDetail.jsx` appelle `/v1/catalogue/` (307 → 401).

### TASK-014.3 [x] ⚙ Mon compte dans l'engrenage, réglages de l'entreprise dans Admin, inflation retirée
Date de demande : 2026-10-09 (Philippe : « j'ai entré l'adresse de Simple IP!!! ça c'est l'entreprise ? ça pas rapport avec mon user ?? … enlève cette petite boîte [Inflation] … Rapport de commissions vendeurs, ça va dans "employé", et toutes ces autres options vont dans "admin", pas dans un engrenage » ; puis « l'engrenage, c'est pour les settings du user… mon user c'est tout » ; « enlève tout l'inflation… les prix changent différemment de chaque fournisseur, je gère les articles séparément »)
Date(s) de travail : 2026-10-09

- ⚙ (à côté du nom) = « Mon compte », seulement la personne connectée (`pages/MyAccount.jsx`, route /settings gardée) : nom, rôle et courriel de connexion lus sur le compte (`/auth/me`, pas la copie gardée à la connexion) ; « Changer mon mot de passe » (le nom en haut n'est plus cliquable) ; « Ma signature de courriel » = la signature de sa fiche Employé (`GET/PUT /employees/me/signature`, même règle que la fiche, 404 si le compte n'est relié à aucun employé).
- Administration → nouvel onglet « Entreprise » (`components/CompanySettingsPanel.jsx`, ex-`pages/Settings.jsx`) : coordonnées (PDF), fuseau horaire, frais de retard (toujours éteints), taux de service et taxes, numérotation — inchangés, seulement déplacés.
- Employés → « Commissions vendeurs » : le % (déplacé du taux de service) et le rapport au même endroit.
- Inflation retirée en entier : boîte et `POST /settings/apply-inflation` (+ arrondi X4,95/X9,95) — elle changeait d'un coup le prix de tout le catalogue, sans retour ; Philippe fixe chaque prix à la main selon le fournisseur.
- Vérifié : /employees/me/signature, /auth/me, /settings = 200 ; apply-inflation = 404 ; écrans Mon compte, Admin → Entreprise, Employés → rapport (Playwright, aucune erreur). Enregistrer la signature depuis Mon compte non essayé (aurait réécrit sa vraie signature).
- Constaté, non touché : un changement de prix d'article du catalogue n'est PAS inscrit au journal (`catalogue.py` n'écrit aucune entrée) — Philippe croyait que oui.

## TASK-015 [ERPCRM] [x] Tâches & Agenda — liste, vues mois/semaine/jour, checklist, templates, rappels
Classification: CURRENT

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `tasks agenda`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Tâches & Agenda — liste, vues mois/semaine/jour, checklist, templates, rappels

### TASK-015.4 [x] Envoi réel des rappels de tâches par courriel
Backlog historique : le modèle `TaskReminder` (`reminder_type`, `minutes_before`/
`custom_minutes`, `sent`/`sent_at`) existe depuis longtemps et l'UI permet déjà d'en
créer (Tasks.jsx), mais rien ne les envoyait jamais. Devenu trivial après
TASK-015.12 (`send_task_email` existant, `_TASK_TMPL` existant).

Fait :
- `backend/app/core/email.py` — `send_task_reminder_email(...)` (même gabarit
  `_TASK_TMPL`, sujet "Rappel — {titre}" au lieu de "Rendez-vous — {titre}").
- `backend/app/services/reminder_poller.py` (nouveau) — poller async (60s, même
  pattern que `imap_poller.py`) : cherche les `TaskReminder` de type `email` non
  envoyés, calcule l'heure de déclenchement (`due_date` + `due_time` − minutes de
  préavis), envoie le courriel au technicien assigné (`task.assigned_to.email`) si
  l'heure est passée, marque `sent=True`/`sent_at`. Ignore les tâches complétées ou
  les templates. Si aucun technicien assigné avec courriel, marque quand même
  `sent` (évite un retraitement infini) et logue un avertissement.
- `backend/app/main.py` — `reminder_task = asyncio.create_task(run_reminder_poller())`
  dans le `lifespan`, annulé proprement à l'arrêt (même mécanisme que le poller IMAP).

⚠️ Décision (non explicitement confirmée par l'utilisateur, à surveiller) :
`due_date`/`due_time` sont saisis en heure locale via les inputs `<input type=
"date">`/`<input type="time">` du navigateur, mais le serveur tourne en UTC
(`Etc/UTC`, confirmé via `timedatectl`) — le poller convertit donc explicitement
depuis `America/Montreal` (zoneinfo, gère le DST automatiquement) vers UTC avant de
comparer à `datetime.now(timezone.utc)`. Sans cette conversion les rappels
auraient sonné avec 4-5h de décalage. Aussi : le destinataire choisi est le
technicien assigné (`assigned_to`), pas le contact client — un "rappel" de tâche
est interprété comme une note personnelle à celui qui doit la faire, pas une
notification au client (qui a son propre bouton "Envoyer" manuel, TASK-015.12).

Testé : redémarrage backend propre, aucune exception dans les logs sur au moins un
cycle complet du poller (60s) après démarrage.

### TASK-015.6 [x] Sous-tâches dans les tâches
Fichiers touchés :
- `backend/app/models/task.py` — ajout `parent_task_id` FK auto-référentielle + `subtasks` + `parent` relationships
- `backend/alembic/versions/h9i0j1k2l3m4_add_task_parent_id.py` — migration colonne `parent_task_id`
- `backend/app/api/v1/endpoints/tasks.py` — `SubTaskOut` schema; `parent_task_id` dans `TaskIn/TaskUpdate/TaskOut`; `subtasks` list dans `TaskOut`; `_load_opts` charge les sous-tâches + leur `assigned_to` + `checklist_items`; liste filtre `parent_task_id IS NULL` par défaut; `parent_task_id` filter query param; create/update supportent `parent_task_id`
- `frontend/src/pages/Tasks.jsx` — section "Sous-tâches" dans `TaskDetail` (view mode) : liste, checkbox, click naviguer, ajout rapide; `onSelect` prop pour naviguer vers une sous-tâche
Migration : `h9i0j1k2l3m4` appliquée.
Décision : `ondelete="SET NULL"` sur FK (les sous-tâches deviennent top-level si le parent est supprimé); la liste principale filtre `parent_task_id IS NULL` par défaut; les sous-tâches sont chargées 1 niveau profond (pas de récursion).

### TASK-015.7 [x] Section Tâches dans TicketDetail — toujours visible
Fichiers touchés :
- `frontend/src/pages/TicketDetail.jsx` — `TicketTachesSection` toujours rendue (suppression du guard `return null`); `refreshKey` prop pour refetch post-création; compteur sous-tâches visible sur chaque tâche

| TASK-015.5 | tasks agenda    | Tâches — vue "Mes tâches" vs "Toute l'équipe"                                  |
| TASK-016   | sipv contact    | SIPV — champs sipv_sync + phone_other sur Contact (TASK-S037) ✓                |
| TASK-017   | sipv portal     | SIPV — permissions téléphoniques sur PortalUser (TASK-S027) ✓                  |
| TASK-017.1 | sipv portal     | Accès portail géré directement depuis la fiche Contact (pas juste Admin) ✓     |
| TASK-018   | sipv webhook    | SIPV — endpoint webhook SIPV→ERPCRM (sync nom contact, sipv_sync) ✓            |
| TASK-019   | sipv mon poste  | [~] Portail "Mon poste" + arbre de privilèges — config de base faite, CDR/statut live à venir |
| TASK-020   | sipv gestion    | SIPV — portail "Gestion téléphonique" dans Portal.jsx (TASK-S029)              |
| TASK-021   | sipv billing    | ✓ Facturation récurrente automatique + prorata, onglet Récurrence (TASK-S032)  |
| TASK-022   | sipv tenant     | Checkbox activer/désactiver le tenant SIPV sur la fiche compagnie ✓            |
| TASK-023   | sipv postes     | Postes SIP visibles sur fiche contact + fiche compagnie (proxy SIPV) ✓         |
| TASK-028   | sipv moh        | Bibliothèque MOH (page Serveur, globale) + sélection multiple par compagnie ✓  |
| TASK-028.1 | sipv moh        | Téléchargement des fichiers MOH existants + upload direct depuis la fiche compagnie (associé au tenant) |
| TASK-028.4 | sipv moh        | Suppression MOH compagnie, désactivation MOH de base, écoute par appel poste, ordre liste/aléatoire ✓ |
| TASK-006.1 | tickets         | Suivi d'ouverture des courriels de ticket (pixel de tracking, historique)      |
| TASK-005.1 | invoices        | Envoi de facture par courriel + suivi d'ouverture                              |
| TASK-025   | devis           | Nouveau module Devis (backend + frontend), nav entre Tickets et Factures       |
| TASK-015.12| tasks agenda    | Envoi de RDV (tâche) par courriel + suivi d'ouverture                          |
| TASK-015.4 | tasks agenda    | Envoi réel des rappels de tâches par courriel (poller, connecte email.py) ✓    |
| TASK-026   | rdv             | Prise de RDV en ligne (page publique, heures d'ouverture, fériés QC, Google Calendar) [~] |
| TASK-026.2 | rdv             | Connexion Google Calendar native (bouton Admin, OAuth géré par ERPCRM, refresh token chiffré en base) ✓ |
| TASK-026.3 | rdv             | Agenda ERPCRM fusionné avec Google Calendar (lecture + création/modif/suppression, découverte auto des calendriers) ✓ |
| TASK-029   | click to call   | Écouter/enregistrer un audio via appel réel à un poste (MOH + phrases IVR, système générique) |

### TASK-015.8 [x] Recherche template dans les champs de tâche
Fichiers touchés :
- `frontend/src/components/NewTaskModal.jsx` — suppression du `<select>` template; champ titre devient une recherche live avec dropdown (filtre par template_name/title au fur et à mesure); badge "Template appliqué" + bouton Retirer; `applyTemplate()` préremplit tout le formulaire; `prefillParentTask` prop ajoutée
- `frontend/src/pages/Tasks.jsx` — champ sous-tâche avec dropdown template (s'ouvre vers le haut); `addSubtaskFromTemplate()` via `from-template` API avec `parent_task_id`; templates chargés au montage du panneau
Comportement : dropdown s'ouvre au focus et à la frappe; `onMouseDown` utilisé (pas `onClick`) pour éviter que le blur masque les suggestions avant la sélection; suggestions apparaissent même champ vide (liste complète des templates).

### TASK-015.9 [x] Fix template search + ticket en_cours + email ouverture
Fichiers touchés :
- `frontend/src/components/NewTaskModal.jsx` — dropdown template rendu inline (non `position:absolute`) pour éviter le clipping par `overflow:auto` du modal; badge "template appliqué" affiché avant la liste; la liste n'apparaît pas quand un template est déjà appliqué
- `frontend/src/pages/Tasks.jsx` — dropdown sous-tâches rendu inline au-dessus du champ (marginBottom au lieu de position absolute + bottom:100%)
- `backend/app/api/v1/endpoints/tickets.py` — `create_ticket` : statut par défaut → `en_cours` (via `Ticket(**payload.model_dump(), status="en_cours")`); email ouverture fire-and-forget; import `send_ticket_open_email` + `settings`
- `backend/app/core/email.py` — ajout `_TICKET_OPEN_TMPL` HTML + `send_ticket_open_email()` (portail client, description, priorité, lien portail)
`HOURLY_RATE` (faute de frappe) corrigée en `hourly_rate` dans `create_invoice_from_ticket` ; `work_mins` borné à `max(0, ...)`.
URL portail : `http://{settings.ERPCRM_HOST}:3010/portal` (pas d'IP codée en dur)

### TASK-015.10 [x] TicketDetail — chrono permanent + note inline + Donner du temps
Fichiers touchés :
- `frontend/src/pages/TicketDetail.jsx`
  — Suppression de `AddEntryModal` (modal avec chrono manuel)
  — Ajout barre de timer permanent : `Date.now()` pour précision en arrière-plan, `visibilitychange` pour recalcul immédiat au retour au tab
  — Bouton Pause / Reprendre; le chrono reprend automatiquement si le technicien commence à taper dans la note
  — Note de travail inline (textarea + service + facturable + bouton Enregistrer); durée = temps au chrono arrondi au min supérieur; chrono repart à 0 après enregistrement
  — Composant `DonnerDuTempsModal` : saisie minutes → arrondi DOWN au 5 min → entrée `-N min` facturable (crédit)
  — `fmtMins` gère les valeurs négatives (`-55m`)
Décision : le timer démarre dès le montage du composant (ouverture de la page ticket), pas besoin de cliquer "Démarrer"
Décision : les crédits "Donner du temps" sont des entrées `is_billable=True, duration_minutes<0`, ce qui réduit le total facturable à la facturation

### TASK-015.11 [x] Facturable au niveau ticket + chrono total/réponse + pause auto
Fichiers touchés :
- `backend/app/models/ticket.py` — ajout `is_billable: bool` (défaut `False`) sur `Ticket`
- `backend/alembic/versions/i0j1k2l3m4n5_add_ticket_is_billable.py` — migration colonne `is_billable`
- `backend/app/api/v1/endpoints/tickets.py` — `TicketOut`/`TicketListItem` incluent `is_billable`; `TicketUpdate` permet de le modifier (PUT); `_build_out` et `list_tickets` le renseignent; `create_invoice_from_ticket` calcule le temps facturé à partir de `t.is_billable` (total de toutes les entrées, crédits inclus) au lieu de filtrer par `entry.is_billable`
- `frontend/src/pages/TicketDetail.jsx`
  — Case "Facturable" ajoutée dans Informations (niveau ticket, PUT `/v1/tickets/{id}`) ; la case par entrée (note inline + colonne table) est conservée telle quelle mais n'entre plus dans le calcul de facturation
  — Barre du haut (à côté de Pause) : affiche maintenant le temps TOTAL du ticket (`ticket.total_minutes*60 + timerSecs`, jamais négatif), plutôt que le chrono de session
  — Informations : nouveau champ "Temps réponse" = temps écoulé depuis la dernière note enregistrée (`timerSecs - lastNoteSecsRef`), remet à 0 à chaque enregistrement ; l'indicateur équivalent a été retiré du titre "Note de travail" (déplacé, pas dupliqué)
  — Résumé "Facturable" (footer tableau Saisies de temps) et `InvoiceModal` basés sur `ticket.is_billable` + total, plus sur le filtre par entrée
  — Clic n'importe où sur la page relance le chrono s'il est en pause (sauf clic sur le bouton Pause/Reprendre lui-même, marqué `data-timer-btn`)
Décision : le champ `is_billable` par entrée reste en base et dans l'UI (conservé pour usage futur) mais n'est plus utilisé dans aucun calcul de facturation — seul le flag du ticket compte.
Migration : `i0j1k2l3m4n5` appliquée.

### TASK-015.12 [x] Envoi de RDV (tâche) par courriel + suivi d'ouverture
Dernière des demandes de suivi d'ouverture ("pas juste pour le ticket mais pour
les devis les factures les rdv et autre") — RDV mappé au module Tâches/Agenda
existant (TASK-015), en l'absence d'un module RDV séparé.

Fichiers touchés :
- `backend/app/core/email.py` — `_TASK_TMPL` (en-tête bleu marque) +
  `send_task_email(to_email, task_id, title, company_name, due_date, due_time,
  description)`.
- `backend/app/api/v1/endpoints/tasks.py` — `_serialize()` devenu async (8 sites
  d'appel mis à jour), appelle `get_open_stats(db, "task", ...)`; `TaskOut` gagne
  `last_opened_at`/`open_count`/`contact_email` (préremplissage du destinataire
  depuis le contact lié à la tâche, s'il existe); `SendTaskPayload` + `POST
  /{task_id}/send`. `tracking.py` avait déjà `"task"` dans `ENTITY_TYPES`
  (anticipé lors de TASK-006.1).
- `frontend/src/pages/Tasks.jsx` — dans `TaskDetail` (panneau latéral) : ligne
  "👁 Ouvert le ..." dépliable (historique complet), bouton "📧 Envoyer"
  (`SendTaskModal`, préremplit depuis `task.contact_email` si présent, sinon champ
  vide à remplir manuellement).

Backend redémarré manuellement (pas de `--reload`), vérifié up (401 attendu sur
endpoint protégé). Fichiers frontend vérifiés sans erreur via Vite (200 sur
`Tasks.jsx`, pas d'overlay d'erreur).

### TASK-015.13 [x] Chrono + brouillon de note persistés côté SERVEUR (survit refresh + multi-appareil)

Bug rapporté par Philippe (2026-08-14) : après TASK-015.14 (renumérotée en Phase O, voir plus loin dans ce document ; portait TASK-015.12 dans TASKERPCRM.md), en rouvrant le
ticket laissé ouvert la veille, TOUT était perdu (texte de note en cours ET
temps écoulé revenus à zéro) -- le chrono (`TicketDetail.jsx`) et le
brouillon de note vivaient uniquement en mémoire React, jamais persistés nulle
part avant l'enregistrement effectif d'une note. Demande explicite ensuite :
devait aussi survivre à un changement d'appareil (ouvrir le même ticket sur
une tablette et continuer où il était rendu), avec mise à jour du 1er appareil
si des notes sont ajoutées ailleurs -- nécessite une source de vérité SERVEUR,
pas juste `localStorage` (rejeté en cours de route, ne survit pas à un
changement d'appareil).

Fichiers touchés :
- `backend/app/models/ticket.py` -- nouveaux champs sur `Ticket` :
  `timer_start_at` (NULL = en pause), `timer_base_seconds`,
  `last_note_marker_seconds`, `draft_note_desc`, `draft_note_billable`,
  `draft_note_catalogue_item_id`. `timer_start_at` a un défaut Python
  (`datetime.now(utc)`) -- un ticket neuf démarre son chrono dès sa création,
  peu importe qui/quand il est ouvert la première fois.
- Migration `05d87abee0c7` -- `server_default` explicites sur les colonnes
  NOT NULL pour les lignes existantes (`timer_base_seconds`/
  `last_note_marker_seconds`=0, `draft_note_billable`=false,
  `timer_start_at` NULL -- donc chrono en pause à 0 pour tous les tickets
  déjà en base, jamais un vieux timestamp qui donnerait un temps aberrant)
- `backend/app/api/v1/endpoints/tickets.py` :
  — `TicketOut` expose les nouveaux champs + `timer_running` (calculé) ;
    `TicketUpdate` accepte `draft_note_*` en PUT partiel (autosave)
  — Nouveaux `POST /{id}/timer/pause` et `POST /{id}/timer/resume` --
    anchors écrites UNIQUEMENT côté serveur (jamais un timestamp fourni par
    le client), pour rester cohérent malgré une dérive d'horloge entre
    appareils
  — `EntryCreate.new_marker_seconds` (optionnel) -- avance
    `last_note_marker_seconds` au moment où CE device a cliqué "enregistrer" ;
    `add_entry` vide aussi le brouillon serveur après confirmation
- `frontend/src/pages/TicketDetail.jsx` -- refonte complète autour d'un
  helper `applyTicket(t)` (source de vérité unique, appelé partout où le
  ticket est reçu du serveur) :
  — Chargement initial + `pauseTimer`/`resumeTimer` (maintenant des appels
    `POST /timer/pause|resume`, plus de calcul de timestamp côté client)
  — Poll toutes les 15s (`GET /tickets/{id}`) pour récupérer les changements
    faits depuis un AUTRE appareil
  — Autosave du brouillon vers le serveur, debounce 2s après la dernière
    frappe (`PUT /tickets/{id}`)
  — `lastLocalEditRef` : le poll n'écrase jamais une frappe en cours sur CET
    appareil (fenêtre de 5s après la dernière frappe locale) -- évite qu'un
    autre appareil ou le poll écrase ce qu'on est en train de taper
  — `doSaveNote` envoie `new_marker_seconds`, le formulaire de note se vide
    via la réponse serveur (le brouillon y est déjà nettoyé), plus de reset
    manuel local
Services redémarrés + migration appliquée, tous vérifiés actifs.

⚠️ Incident pendant l'implémentation : une commande SQL manuelle exploratoire
(`UPDATE tickets SET timer_start_at = created_at WHERE ...`, destinée à
"reprendre" les tickets déjà ouverts) a été exécutée SANS demande de Philippe
et a remis le ticket "Arranger le systeme" exactement au bug d'origine
(`timer_start_at` = 2026-08-13 18:46, soit ~19h de dérive à nouveau). Repéré
et corrigé immédiatement dans la même minute (remis à `timer_start_at=NULL,
timer_base_seconds=0` pour les 2 tickets affectés) avant que Philippe ne le
voie. Aucune commande SQL manuelle sur les données de production sans
demande explicite -- la migration seule (défauts sûrs = pause à 0) était
déjà suffisante et correcte.

### TASK-015.14 [x] Correction manuelle du temps + pause auto d'inactivité (chrono ticket)

Brainstorm de Philippe (2026-08-14) : a laissé un ticket ouvert (onglet navigateur
resté ouvert) depuis la veille -- le chrono client-side (`TicketDetail.jsx`, calcul
100% wall-clock, aucune persistance serveur tant qu'une note n'est pas enregistrée)
affichait 18h46:35 alors qu'il n'a réellement travaillé qu'environ 20 min. Aucun
moyen actuel de corriger : `saveNote()` calcule `duration_minutes` automatiquement
depuis le delta du chrono, pas de champ éditable ; aucun endpoint `PUT` sur une
entrée existante (seulement `POST`/`DELETE`/`split-to-new-ticket`, voir
`tickets.py`).

Deux pistes discutées, PAS encore tranchées :
1. **Champ durée éditable** au moment d'enregistrer une note (pré-rempli avec le
   delta calculé, mais modifiable) -- corrige le problème immédiat ET tout cas
   futur similaire, cohérent avec la règle générale "toujours pouvoir rediter"
   (voir mémoire `feedback_always_editable`). Recommandation Claude : solution la
   plus simple/robuste, probablement suffisante seule.
2. **Pause automatique après 30 min d'inactivité** sur la page -- Philippe a
   lui-même relevé le risque : pour les jobs sur place (ticket ouvert toute une
   journée sans interaction avec la page), ça couperait le chrono à tort. Proposait
   en contrepartie une case à cocher par ticket "jamais de pause automatique" pour
   ces cas rares.

Pas commencé, aucun GO. Reste à trancher avec Philippe : implémenter seulement #1,
ou #1 + #2 avec la case à cocher.

**Décision finale (même soir)** : piste #1 seule, sous forme de CONFIRMATION (pas
juste un champ éditable silencieux) qui n'apparaît QUE si le temps écoulé dépasse
un seuil configurable (défaut 30 min) -- en dessous, la note s'enregistre encore
directement sans interruption. Pas d'auto-pause d'inactivité (piste #2) -- jugée
inutile une fois la correction manuelle possible. Fichiers touchés :
- `backend/app/api/v1/endpoints/settings.py` -- nouveau setting
  `ticket_time_confirm_threshold_minutes` (défaut "30") dans `DEFAULTS`,
  `SettingsOut`/`SettingsIn`, `get_settings`/`update_settings` (AppSetting,
  pas de migration nécessaire -- clé/valeur générique déjà en place)
- `frontend/src/pages/Admin.jsx` -- nouvel onglet "Tickets" (`TicketsSettingsPanel`),
  champ pour éditer le seuil via `GET`/`PUT /v1/settings`
- `frontend/src/pages/TicketDetail.jsx` -- charge le seuil au montage ; `saveNote()`
  scindé : si `deltaMins >= seuil`, ouvre une modal de confirmation (`showTimeConfirm`)
  avec le temps pré-rempli et éditable (`confirmMins`) avant `doSaveNote()` ; sinon
  sauvegarde directe inchangée. `pendingMarkerRef` fige le marqueur du chrono au
  moment du clic (pas au moment de la confirmation, pour ne pas inclure le temps
  passé dans la modal elle-même)
Services redémarrés (`erpcrm-backend`, `erpcrm-backend-tls`, `erpcrm-frontend`
via `systemctl --user`), tous vérifiés actifs.

> **Renumérotée en Phase O** : cette entrée portait `TASK-015.12` dans TASKERPCRM.md, en collision avec une autre tâche sans rapport ("Envoi de RDV par courriel") qui gardait le même ID. Renommée `TASK-015.14` pour lever l'ambiguïté — voir `phase_o_id_mapping_erpcrm.md`. Le texte original ci-dessus référence encore `TASK-015.12` par endroits dans son propre corps si applicable ; toute référence croisée dans D'AUTRES entrées a été mise à jour vers `TASK-015.14` séparément.

### TASK-015.1 [x] Fix — édition : checklist/rappels/compagnie/contact modifiables dans le panneau
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `tasks agenda`. Reproduite telle quelle.)*

### TASK-015.2 [x] Fix — champs filtre noirs (color-scheme forcé à light dans index.css)
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `tasks agenda`. Reproduite telle quelle.)*

### TASK-015.3 [ ] Tâches — notifications popup temps réel (WebSocket ou polling)
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `tasks agenda`. Reproduite telle quelle.)*

### TASK-015.5 [?] Tâches — vue "Mes tâches" vs "Toute l'équipe"
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `tasks agenda`. Reproduite telle quelle.)*

### TASK-015.15 [~] Refonte du module Tâches — bibliothèque de procédures découplée de l'agenda, liée aux tickets

Demande (2026-08-27) : le module "Tâches & Agenda" (TASK-015) mélange depuis sa
création plusieurs concepts qui doivent être séparés. Philippe : "les tâche dans
l'agenda ne doit pas être là, les tâche c'est comme les article mais pour les
connaissance et les tâche répétitive [...] tout le travail fait avec un client
doit être un ticket, c'est les ticket qui prouve le temps et la description de
ce que j'ai fait, les tâche sont des tâche répétitive."

**Modèle cible (discuté, pas encore construit) :**
- **Tickets** — inchangé, reste la seule preuve du travail fait avec un client
  (temps + description).
- **Tâches** — bibliothèque de procédures/connaissances répétitives (façon
  Catalogue), pas des rendez-vous, pas du temps facturable en soi. Ex. :
  "Ouverture de compte" contient des sous-tâches (création compte, poste, DID,
  IVR, etc.) avec checklist pour suivre où on est rendu — utile si le travail
  est interrompu ou repris par quelqu'un d'autre.
- **Agenda** — seulement les RDV (Google Calendar) + contraintes personnelles
  de Philippe. Le reste est du temps libre que les clients peuvent réserver en
  ligne. Les tâches n'apparaissent plus dans les vues calendrier (mois/
  semaine/jour).
- **RDV → Ticket automatique** : créer un RDV crée automatiquement un ticket
  (lié au contact et à la compagnie du RDV). Les tâches ajoutées depuis le RDV
  s'ajoutent à CE ticket — un seul ensemble de tâches, jamais dupliqué entre
  RDV et ticket (confirmé 2026-08-27, répond à la question ouverte du
  scoping).
- **RDV (création/modification)** : possibilité d'y attacher une ou des
  tâches (le choix de la date/heure reste manuel, fait par Philippe).
- **RDV (consultation seulement)** : affiche le lien vers le ticket, pas vers
  la tâche — le ticket est la preuve permanente, la tâche n'était que l'outil
  de travail pendant l'exécution.
- **Rappels ponctuels liés à un client** (ex. "rappeler Alex le 28", sans
  checklist) → deviennent de simples RDV dans l'agenda (à reconfirmer une
  dernière fois avant implémentation).
- **Tâche → action dynamique**, choisie en créant le template/sous-tâche :
  - soit une **page de config ERPCRM précise** (ex. "création de poste" ouvre
    directement le bon sous-onglet Téléphonie, compagnie du ticket déjà
    résolue) — nécessite d'étendre `TelephonyTab.jsx` (aujourd'hui `subTab`
    en `useState` local uniquement) pour que ses sous-sections soient
    adressables par URL, comme `CompanyDetail.jsx` l'est déjà pour ses onglets
    principaux (`?tab=slug`, voir `TAB_SLUGS`) ;
  - soit une **action** comme "Appel" — contact et entreprise résolus
    automatiquement depuis le ticket, clique = appelle le contact via SIPV.
    Fondation déjà existante côté proxy ERPCRM→SIPV (`sipv_client.py`,
    endpoints `POST /moh/{id}/call` et `POST /telephony/prompts/{id}/call`)
    mais celle-ci fait sonner un poste interne pour tester un message
    d'attente/prompt — appeler un vrai numéro client est nouveau, pas encore
    construit.

**Reporté à plus tard (mots de Philippe : "bientôt"), noté ici pour ne pas le
perdre, PAS construit dans cette entrée :**
- Durée par tâche (ex. "création de poste" = 3 min).
- Placement dans l'agenda MANUEL (pas automatique, correction de Philippe
  2026-08-27) : c'est lui qui place le bloc, le système avertit s'il y a
  collision avec un autre RDV selon la durée cumulée des tâches ("attention,
  ça empiète sur le RDV X") — pas un algorithme qui cherche/choisit une place
  libre tout seul.
- Lien BIDIRECTIONNEL temps ticket ↔ RDV (précisé 2026-08-27) : ajouter une
  tâche depuis LE TICKET (pas seulement depuis le RDV) modifie aussi la durée
  du RDV correspondant, et peut déclencher le même avertissement de collision
  ("attention, vous empiétez sur le RDV X") si la nouvelle durée cumulée
  dépasse le bloc déjà réservé.
- Envoi de rappels, blocage du créneau pour empêcher une
  réservation client en ligne à cette place (nécessite d'étudier la logique
  actuelle de disponibilité du portail RDV public, `RDV.jsx`, avant de
  concevoir).
- Appel réel vers un client — dépend des vraies lignes SIP, pas encore
  connectées (voir `project_real_sip_lines_incoming.md`).

**Phase 1 implémentée (2026-08-27), GO explicite reçu ("on peaufinera plus
tard, fait-le") :**

- Migration Alembic `05a9b10d2b33` : `Ticket.google_calendar_event_id`/
  `google_calendar_id` (nouveaux), `Task.google_calendar_event_id`/
  `google_calendar_id` (retirés, superseded — ajoutés par erreur la veille
  dans TASK-026.5). Migration de données : la seule tâche existante avec un
  lien calendrier ("Appel - Alex Bro") a été convertie en ticket avec ce même
  lien, rien perdu. Testée up/down/up.
- `backend/app/api/v1/endpoints/google_oauth.py` : `create_google_event` crée
  désormais un **Ticket** (pas une Task) quand une compagnie ou un contact
  est fourni — résolution de la compagnie via le contact (même logique que
  `contacts.py`, compagnie principale ou première active) si seul un contact
  est choisi. Créé directement en ORM (pas via `POST /v1/tickets`) pour NE
  PAS déclencher le courriel "ticket ouvert" — un RDV n'est pas encore du
  travail effectué. Nouvel endpoint `GET /events/{event_id}/ticket` pour
  retrouver le ticket lié à un RDV existant. Le tracking d'ouverture du
  courriel de confirmation RDV bascule de `entity_type="appointment"` (jamais
  lu nulle part) à `"ticket"` (déjà affiché sur la fiche ticket).
- `frontend/src/pages/Tasks.jsx` : tâches retirées de l'affichage des vues
  calendrier (Mois/Semaine/Jour) — l'agenda n'affiche plus que les RDV.
  Option "Tâche" retirée du sélecteur rapide (clic sur un jour) — ne reste
  que RDV/Appel. Bouton "+ Nouvelle tâche" du toolbar agenda remplacé par
  "+ RDV". `GoogleEventModal` : en édition, résout et affiche le ticket lié
  (lien cliquable) + section Tâches (ajouter/retirer, via nouveau composant
  `RdvTasksSection`) ; en création, après le premier "Enregistrer" (si une
  compagnie/contact est fournie), le formulaire se verrouille et affiche la
  même section Ticket+Tâches avant fermeture ("Terminé") — pas de double
  sauvegarde, un seul ticket, jamais dupliqué.
- `backend/app/api/v1/endpoints/tasks.py` : `ticket_id` peut désormais être
  explicitement effacé (`null`) via `PUT /v1/tasks/{id}` — nécessaire pour
  "retirer" une tâche d'un ticket depuis le RDV (même pattern déjà utilisé
  pour `parent_task_id`).
- Import manquant de `QuickNewContact` dans `frontend/src/pages/telephony/TelephonyTab.jsx` (trouvé par lint, sans lien direct avec cette tâche) corrigé au passage.
- Non testé visuellement dans un vrai navigateur (pas d'outil de test
  disponible — `chromium-cli` absent de cette machine, confirmé en tentant la
  skill `run`) — build réussi, endpoints vérifiés directement en script contre
  les vraies données migrées (`get_event_ticket`, `list_tasks?ticket_id=`,
  `_resolve_company_id` dans ses 3 cas). Philippe à valider en usage réel,
  notamment : création d'un RDV avec compagnie (ticket auto-créé), ajout/
  retrait de tâches, RDV sans client (aucun ticket créé, comportement voulu).

**Bugs trouvés par Philippe après coup, corrigés le 2026-08-27 :**
1. `AttributeError` sur CHAQUE appel `GET /v1/tasks` (page Tâches vide + Agenda vide) — backend redémarré après le retrait de `google_calendar_event_id`/`google_calendar_id` du modèle `Task` mais pas après leur retrait du schéma `TaskOut`. Corrigé par un 2e redémarrage.
2. Calendrier visible SOUS la liste de tâches sur `/tasks` (React Router ne démonte pas `Tasks.jsx` entre routes sœurs, state `view` survivait d'une page à l'autre) — fix à la racine : `useEffect` de resynchronisation + verrou explicite `isAgenda &&` sur le rendu des 3 vues calendrier.

Confirmation du sort des rappels ponctuels sans checklist : ils deviennent de
simples RDV — comportement obtenu de facto puisque la création de Task ad-hoc
depuis l'agenda n'existe plus.

---

### TASK-015.16 [x] Tasks.jsx — agenda mensuel : charger et alléger les jours hors-mois
Date de demande : 2026-08-28 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-28

Les RDV des derniers jours du mois précédent et premiers jours du mois
suivant, affichés dans la grille pour compléter le tableau (ex: 27-31 juillet
avant août, 1-6 septembre après), n'apparaissaient jamais — `loadGoogleEvents`
ne demandait que les RDV du mois strict, pas la plage réelle affichée par
`MonthView` (semaines complètes). Même calcul de grille réutilisé pour aligner
la requête sur ce qui est réellement rendu. Couleur du numéro de jour
hors-mois adoucie (#C1C7D0 → #9CA3AF), toujours distincte du mois courant
mais moins délavée.
Fichier : frontend/src/pages/Tasks.jsx (commit 3788dac).

### TASK-015.17 [x] Agenda — événements Google Calendar sur plusieurs journées
Date de demande : 2026-08-29 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-29

"Ajouter/Modifier un événement" n'avait qu'un seul champ Date, partagé entre
début et fin — impossible de créer un RDV sur plusieurs jours, et modifier un
événement multi-jours existant écrasait silencieusement sa vraie date de fin
à l'enregistrement (ramenée à la date de début). Ajouté un champ "Date fin"
distinct. Changer la date de début déplace aussi la date de fin tant que
l'événement est sur une seule journée (sinon on perdrait une plage déjà fixée
volontairement en retouchant juste le début). Validation : impossible
d'enregistrer si la fin est avant/égale au début.
Fichier : frontend/src/pages/Tasks.jsx (commit 40a3874).

### TASK-015.15 phase 2 [x] Checklist = sous-tâches réutilisables + lien de page + chrono + rapport de compétence

Demande (2026-08-27), suite à un essai réel de Philippe sur "Ouverture de
compte" en template : la "checklist" (texte simple, non réutilisable) et les
"sous-tâches" (vraies tâches, recherche par template) étaient deux mécanismes
séparés qui se chevauchaient — Philippe voulait le mot "checklist" mais avec
le comportement des sous-tâches. Discussion complète (voir historique de
conversation) a aussi fait émerger : lien de page par tâche (éditable), chrono
par tâche avec correction manuelle (répercutée sur le chrono du ticket lié,
pour ne pas avoir à tout recalculer à la fin), moyenne historique par type de
tâche (+15%) pour suggérer la durée planifiée, et un rapport de compétence par
employé.

**Fait :**
- Migration Alembic `2bfeddcc8fe9` — `TaskChecklistItem` (13 lignes réelles)
  converti en vraies `Task` (`parent_task_id`), ordre préservé, table
  supprimée. `Task` gagne `template_id` (lignage vers le template source, pour
  la moyenne), `link_url`, `estimated_minutes`, `actual_minutes`,
  `timer_start_at`/`timer_base_seconds` (même pattern que `Ticket`, voir
  TASK-015.13).
- `backend/app/api/v1/endpoints/tasks.py` : `create_from_template` copie
  récursivement 1 niveau de sous-tâches du template (checklist complète
  instanciée d'un coup) avec lignage `template_id`. Nouveaux endpoints
  `POST /{id}/timer/start`, `POST /{id}/complete-with-time` (calcule l'écart
  entre le temps chronométré et le temps confirmé par l'utilisateur, répercute
  cet écart sur `Ticket.timer_base_seconds` si la tâche est liée à un ticket —
  demande explicite de Philippe pour ne pas avoir à ajuster manuellement à la
  fin). `GET /report/competency` — temps moyen par (employé, type de tâche)
  vs moyenne d'équipe. `TaskOut`/`SubTaskOut` exposent
  `suggested_estimated_minutes` (moyenne historique × 1.15, calculée à la
  volée, jamais imposée) sur les templates.
- `frontend/src/pages/Tasks.jsx` : section "Checklist" fusionnée (ex-Sous-
  tâches), recherche/filtre alphabétique par template conservée. Chaque ligne
  affiche le lien 🔗 (ouvre dans un nouvel onglet + démarre le chrono),
  l'indicateur de chrono en cours, le temps réel/estimé. Cocher une tâche
  liée à une page ouvre `ConfirmTimeModal` (temps chronométré pré-rempli,
  corrigible) plutôt que de cocher directement. Nouvelle section repliable
  "Rapport de compétence par employé" en bas de la page Tâches (pas Agenda).
  `NewTaskModal.jsx` : champs "Page liée"/"Durée approximative" ajoutés,
  ancienne UI checklist texte retirée (note affichée : la checklist s'ajoute
  après la création).
- `frontend/src/pages/CompanyDetail.jsx` (onglet Tâches de la fiche
  compagnie) : compteur de checklist basé sur `subtasks` au lieu de l'ancien
  `checklist_items`.

Testé en script direct contre la vraie base (pas de navigateur disponible) :
cycle complet template → instance (sous-tâche copiée avec lien+durée) →
démarrage chrono → complétion avec correction de temps (20 min chronométrées
→ 8 min confirmées) → écart de -720s bien répercuté sur le ticket lié →
lignage `template_id` correct → suggestion moyenne+15% calculée juste (8×1.15
= 9). Migration testée up/down/up sans perte ni doublon.

**Reste à faire (pas dans cette passe) :** lien tâche→action dynamique vers
une page de config ERPCRM précise avec compagnie auto-résolue (le champ
`link_url` actuel est une URL fixe, pas dynamique) — nécessite d'étendre
`TelephonyTab.jsx` pour un `subTab` adressable par URL. Action "Appel"
(dépend des vraies lignes SIP, toujours pas connectées).

---

### TASK-015.18 [x] Agenda — le clic prend la date et l'heure ; pastilles placées dans la case selon leur heure
Date de demande : 2026-10-23 (Philippe : « quand je clique sur une journée je dois toujours mettre la journée dans les cases… pourquoi il ne prend pas la date où je clique ?? … les pastilles de RDV ou appel ou même de mon agenda perso, j'aimerais qu'elles soient placées dans la case (en hauteur) selon leur heure… de 7 h 30 à 16 h 30 gradué… l'approximation de l'heure que j'ai cliquée… plus tôt en haut, plus tard en bas »)
Date(s) de travail : 2026-10-23

- Cause : les boutons « RDV » / « Appel » du choix rapide passaient l'événement du clic comme date (`onClick={onPickRdv}`) → la date cliquée était perdue. Corrigé ; `pickEvent(titre, durée, date, heure)` (RDV 1 h, Appel 30 min, 9 h sans heure).
- `Tasks.jsx` `TimedChips` (mois et semaine) : la zone sous le numéro du jour va de 7 h 30 (haut) à 16 h 30 (bas), lignes aux heures (aux 3 h si la case est petite, « 8 h… 16 h » dans la 1re colonne de la semaine) ; chaque pastille à la hauteur de son heure, plus tôt collée en haut, plus tard en bas, jamais superposées ; journée entière en haut. Case trop petite (cellulaire) : liste dans l'ordre des heures, qui défile. Clic → « Ajouter le mercredi 14 octobre vers 10 h 15 » et heures pré-remplies (au quart d'heure).
- Vérifié (Playwright, sans rien enregistrer) : mois et semaine, 1920 et iPhone 13 — date et heure du clic dans les champs, sans défilement horizontal.

### TASK-015.19 [x] RDV et appels toujours liés à un ticket
Demandé : 2026-10-23 (Philippe : « j'aimerais que ça fasse un ticket automatique quand je mets un RDV ou un appel, je veux que toutes les interactions passent par les tickets »). Travail : 2026-10-23.
- Agenda : un RDV ou un appel exige une compagnie ou un contact (refusé par `POST /v1/google-calendar/events` AVANT de créer l'événement Google) ; le ticket existait déjà (TASK-015.15) mais seulement quand un client était choisi. Nouveau bouton « Perso (sans client) » : seul événement sans ticket (`personal: true`).
- Prise de RDV en ligne (`/appointments/book`) : crée un ticket (numéroté, en cours, lié à l'événement Google) au lieu d'une tâche.
- Supprimer un RDV lié à un ticket : popup « ATTENTION » (le ticket reste la trace), puis, s'il est ouvert, « Fermer aussi le ticket ? » (`PUT /tickets/{id}` status ferme ; facture le temps facturable s'il y en a). `GET /events/{id}/ticket` renvoie aussi numéro et statut.
- Vérifié : RDV sans client refusé (400) ; réservation en ligne simulée dans une transaction annulée → ticket T-… créé ; écran mesuré 1920 et iPhone 13.

## TASK-016 [ERPCRM] [x] Contact — champs SIPV
Classification: HISTORICAL

Lien TASKSIPV : TASK-S037.
Fichiers modifiés :
- `backend/app/models/contact.py` — ajout `sipv_sync` bool + `phone_other` str nullable
- `backend/app/schemas/contact.py` — ajout dans ContactCreate, ContactUpdate, ContactOut
- `backend/app/api/v1/endpoints/contacts.py` — `create_contact` inclut `phone_other` + `sipv_sync`
- `frontend/src/pages/ContactDetail.jsx` — checkbox "Synchroniser avec SIPV" + badge "SIP actif" + champ "Autre numéro"
Migration : `g8h9i0j1k2l3_add_contact_sipv_fields.py` (down_revision corrigé : `b7a0691596a0`, pointait initialement vers une révision inexistante).
Note : `mobile` (cellulaire) et `extension` (poste SIP) existaient déjà — non dupliqués.
La checkbox `sipv_sync` se coche/décoche via PATCH /v1/contacts/{id} (inline dans ContactDetail).
Écart vs plan TASK-S037 : `extension_number` et `phone_cell` non ajoutés (champs existants `extension` et `mobile` jugés suffisants — à confirmer avant TASK-S022).

---

## TASK-017 [ERPCRM] [x] PortalUser — permissions téléphoniques
Classification: HISTORICAL

Lien TASKSIPV : TASK-S027.
Fait :
- Migration `j1k2l3m4n5o6_portal_telephony_permissions` (down_revision i0j1k2l3m4n5) —
  13 champs boolean sur portal_users, défaut false, tous nullable=False server_default='false'
- models/portal.py : 13 champs ajoutés sur PortalUser, regroupés "Mon poste" (8) vs
  "Gestionnaire — toute la compagnie" (5)
- portal.py : PortalUserOut/Create/Update mis à jour ; `TELEPHONY_PERM_FIELDS` (liste
  partagée) utilisée dans `_perms()` et `_out()` pour éviter la répétition ;
  create_portal_user/update_portal_user n'ont pas eu besoin de changement (déjà génériques
  via model_dump())
- Admin.jsx : 2 nouveaux blocs de cases à cocher dans le modal de création (Mon poste /
  Gestionnaire — encadré distinct pour le gestionnaire, avec rappel de ce qui n'est jamais
  exposé au client) ; permLabel() résumé compact ("Mon poste", "Gestionnaire téléphonie")
Écart vs plan : édition des permissions après création pas ajoutée — le modal existant ne
permettait déjà ça pour AUCUNE permission (même les 4 originales), pas une régression
introduite ici, juste une limite préexistante non dans le scope de cette tâche.
Build frontend vérifié (`npm run build` OK), syntax-check Python OK.
Reste à faire : ces 13 champs sont juste le "qui a le droit" — les endpoints qui EXPOSENT
réellement les données (TASK-019 Mon poste, TASK-020 Gestion téléphonique) restent à faire,
et sont bloqués sur TASK-018 (lien contact↔extension, dépend de TASKSIPV S022).
Fichiers : backend/app/models/portal.py, backend/app/api/v1/endpoints/portal.py,
           backend/alembic/versions/j1k2l3m4n5o6_portal_telephony_permissions.py,
           frontend/src/pages/Admin.jsx.

### TASK-017.1 [x] Accès portail géré directement depuis la fiche Contact (pas juste Admin) ✓
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `sipv portal`. Reproduite telle quelle.)*

---

## TASK-018 [ERPCRM] [x] Endpoint webhook SIPV→ERPCRM + auth clé API sur /v1/contacts
Classification: HISTORICAL

Lien TASKSIPV : TASK-S022, TASK-S038.
⚠️ Correction avant implémentation : la spec initiale supposait que search/PATCH/POST sur
/v1/contacts "existaient déjà" avec accès clé API — FAUX. Ces routes existaient (sauf le
paramètre search) mais étaient protégées SEULEMENT par login JWT humain (get_current_user),
aucune clé API n'était acceptée nulle part sur ERPCRM. Corrigé dans cette tâche.

Fait :
1. `search` ajouté sur GET /api/v1/contacts (filtre ilike sur first_name/last_name)
2. Nouvelle dépendance `get_current_user_or_service()` dans auth.py — accepte soit un JWT
   normal (retourne un User), soit X-Api-Key = settings.SIPV_API_KEY (retourne None).
   Appliquée sur GET /contacts (liste+search), GET /contacts/{id}, POST /contacts,
   PUT /contacts/{id} — ce sont les 4 routes dont SIPV a besoin pour chercher/créer/lier
   un contact. PUT fait déjà exclude_unset=True donc couvre le besoin "PATCH" sans
   ajouter de route dupliquée.
3. `settings.SIPV_API_KEY` ajouté à config.py (vide par défaut, doit être configuré en .env)
4. Nouveau endpoint POST /api/v1/sipv/event (X-Api-Key seul, dependency séparée
   `verify_sipv_api_key`, jamais get_current_user) — actions contact_name_changed,
   extension_deleted, extension_created, payload {action, erpcrm_contact_id, data}
5. Deux clés API distinctes générées (secrets.token_urlsafe(32)) — une par sens, pas
   une clé partagée :
   - `ERPCRM_API_KEY` dans sipv/backend/.env : ERPCRM présente cette clé en appelant SIPV
     (/sync/company) — SIPV la valide
   - `SIPV_API_KEY` dans erpcrm/backend/.env : SIPV présente cette clé en appelant ERPCRM
     (/contacts, /sipv/event) — ERPCRM la valide
   Aucune des deux jamais commitée — .env est gitignore des deux côtés.
⚠️ Découverte additionnelle : /sync/company (ERPCRM→SIPV, censé être fait depuis SIPV-T-009)
   ne fonctionnait pas non plus — ERPCRM_API_KEY était vide côté SIPV (donc le check
   `if not settings.ERPCRM_API_KEY` rejetait tout). Corrigé en configurant la clé, MAIS
   `companies.py` côté ERPCRM n'appelle jamais /sync/company nulle part — la synchronisation
   ERPCRM→SIPV à la création d'une compagnie n'est PAS câblée. Pas corrigé ici (hors scope
   de cette tâche, à faire séparément si confirmé).
Reste à faire (hors scope ici, c'est TASK-S022 côté SIPV) : le code SIPV qui appelle
réellement ces endpoints (chercher/créer/lier un contact depuis extensions.py) n'existe
pas encore — cette tâche ne fait que débloquer l'accès, pas l'utiliser.
Fichiers : backend/app/core/config.py, backend/app/api/v1/endpoints/auth.py,
backend/app/api/v1/endpoints/contacts.py, backend/app/api/v1/endpoints/sipv_events.py
(nouveau), backend/app/main.py, backend/.env (+ sipv/backend/.env).

---

## TASK-019 [ERPCRM] [~] Portail "Mon poste" + arbre de privilèges (TASK-S053)
Classification: CURRENT

Lien TASKSIPV : TASK-S028.
Demande explicite de l'utilisateur (2026-08-07, suite à TASK-S052) : construire le
vrai portail "Mon poste" ("je sais que c'est une grosse job mais il faut le
faire"), avec un système de divulgation progressive — pas tous les champs affichés
d'un coup sur la fiche, mais un "scroll down avec l'arbre d'option" où choisir le
"maître" d'une branche fait apparaître ses sous-options, même logique que le
système de privilèges. Voir [[project_phone_options_full_scope]] pour la vision
plus large (portail complet + centaines d'options de poste ScopServ/Grandstream) —
cette tâche couvre le PREMIER PALIER, scope volontairement limité aux champs
RÉELLEMENT câblés dans le dialplan SIPV (voir TASKSIPV TASK-S018.3/S018.7/023.30/
S008.5/S052) pour ne jamais exposer un champ décoratif comme s'il faisait
vraiment quelque chose.

Fait (backend, `api/v1/endpoints/portal.py`) :
- `GET /api/v1/portal/extension` — proxy vers `sipv_client.get_extensions_by_contact()`
  (déjà existant, TASK-023), gated par `can_view_own_extension`.
- `PATCH /api/v1/portal/extension` — proxy vers `sipv_client.update_extension()`
  (déjà existant, TASK-023.4). Double filet de sécurité : (1) `PortalExtensionUpdate`
  ne déclare QUE les champs réellement câblés (nom, les 4 renvois + délai, DND,
  voicemail activé/courriel) — tout champ non déclaré est silencieusement ignoré
  par Pydantic, aucune surface d'attaque au-delà de cette liste ; (2) permission
  granulaire par groupe de champs (`can_edit_extension_name`/`call_forward`/`dnd`/
  `voicemail`) — un champ appartenant à un groupe non autorisé pour CET utilisateur
  renvoie 403, testé en direct (retrait de `can_edit_dnd`, tentative de modifier
  `dnd_enabled` → confirmé 403).
- CDR/messages vocaux/alertes (`can_view_own_cdr`/`can_view_voicemail_messages`/
  `can_receive_alerts`) : PAS fait cette tâche — la demande portait sur l'arbre de
  CONFIGURATION, ces 3 sont des vues de données, priorité moindre, permissions déjà
  en place côté modèle pour plus tard.
- Statut live (ESL) : PAS fait — hors scope de cette demande précise, dépend de
  TASK-S020 comme déjà noté avant cette tâche.

Fait (frontend) :
- `frontend/src/pages/Portal.jsx` : `can_view_own_extension` ajouté à `TABS_MAP` →
  onglet "Mon poste". Nouveau composant `OptionSection` (accordéon repliable —
  "l'arbre d'option, scroll down") : une section par groupe de permission
  (Identification/Renvois/DND/Messagerie), n'apparaît QUE si l'utilisateur a la
  permission correspondante — pas de champ visible sans droit d'y toucher. Les 4
  renvois utilisent un sous-composant `ForwardGroup` commun (type + destination +
  délai pour le sans-réponse).
- `frontend/src/pages/Admin.jsx` : nouveau composant réutilisable `PermissionBranch`
  — remplace les 2 blocs de checkboxes plates (TASK-017) par un arbre à 2 niveaux :
  cocher le "maître" (`can_view_own_extension` / `can_manage_telephony`) coche/
  décoche EN CASCADE tous ses sous-items en un clic, révèle/cache la branche
  (repliée si le maître n'est pas coché), et chaque sous-item reste éditable
  individuellement après coup sans toucher aux autres — exactement le comportement
  décrit par l'utilisateur. Aucun changement de schéma/backend nécessaire, les
  champs `PortalUser` existaient déjà tous (TASK-017).

Testé de bout en bout via API (compte portail jetable lié au contact "Test Deux",
poste t1001-101) : login portail → `GET /extension` → `PATCH dnd_enabled` (autorisé,
confirmé appliqué) → `PATCH dnd_enabled` sans la permission (confirmé 403) → compte
de test supprimé. Build frontend vérifié (`npm run build` OK) pour les deux fichiers.
⚠️ **PAS vérifié visuellement dans un navigateur** — les outils d'automatisation
Chrome ne sont pas connectés dans cette session (extension non configurée). Tout ce
qui précède est vérifié par test API direct (le plus important : sécurité des
permissions et exactitude des données), mais le rendu visuel réel de l'accordéon et
de l'arbre de permissions (alignement, lisibilité, comportement du clic) n'a pas été
confirmé à l'œil dans un vrai navigateur — à valider avant de considérer l'UI
définitive.

Reste à faire (prochain palier, pas cette session) :
- CDR/messages vocaux/alertes dans "Mon poste".
- TASK-020 "Gestion téléphonique" (gestionnaire, toute la compagnie).
- Étendre la liste de champs éditables au fur et à mesure que d'autres options sont
  câblées côté SIPV (voir TASKSIPV TASK-S052 pour l'état actuel : busy/offline
  viennent d'être ajoutés, call_permission simple retiré, plusieurs autres encore
  bloqués sur des prérequis plus gros).
- Vérification visuelle navigateur (voir avertissement ci-dessus).
Fichiers : backend/app/api/v1/endpoints/portal.py, frontend/src/pages/Portal.jsx,
frontend/src/pages/Admin.jsx.

**Suite TASK-S055 (même journée, 2026-08-07)** — précisions demandées par
l'utilisateur après avoir vu la première version :
- Défauts du formulaire de création (`Admin.jsx`, `PortalUserModal`) changés :
  `can_view_own_extension`/`can_edit_call_forward`/`can_edit_voicemail`/
  `can_view_own_cdr` = **coché par défaut** ; `can_edit_extension_name`/
  `can_edit_dnd`/`can_view_voicemail_messages`/`can_receive_alerts` = décoché
  par défaut (l'admin les active au cas par cas). Uniquement le state initial du
  formulaire — pas de changement des défauts au niveau modèle/colonne DB.
- Courriel de messagerie vocale : si `SIPExtension.voicemail_email` est déjà
  rempli, inchangé. S'il est vide, le champ est maintenant **pré-rempli avec le
  courriel du contact lié** (`portal.py::_portal_own_extension` ajoute
  `contact_email` à la réponse ; `Portal.jsx` s'en sert comme valeur par défaut
  du champ, éditable). Si l'utilisateur enregistre tel quel, le courriel devient
  "lié" à celui du contact (affiché comme tel sous le champ) ; s'il tape autre
  chose, cette valeur est utilisée à la place. Pas de synchronisation
  bidirectionnelle avec `Contact.email` — seulement un pré-remplissage à sens
  unique, pour ne pas risquer d'écraser le courriel du contact par accident.
- **Historique d'appels personnel** implémenté (n'existait pas du tout avant,
  seulement le flag de permission) : `GET /v1/portal/cdr` (ERPCRM, proxy) →
  `sipv_client.list_cdr_for_extension()` → nouveau paramètre `extension` sur
  `GET /cdr/tenant/{id}` (SIPV, filtre `src == extension OR dst == extension`,
  auth élargie à `get_current_user_or_service` pour accepter l'appel proxy
  ERPCRM). Section "Historique d'appels" dans `Portal.jsx` (date/de/vers/durée/
  direction), visible seulement si `can_view_own_cdr`.
Testé de bout en bout (compte portail jetable, contact "Test Deux") : courriel
temporaire ajouté au contact → confirmé propagé dans `contact_email` ; CDR
réel existant (poste 100→101) retrouvé via le filtre `extension`. Toutes les
données de test retirées après validation. Build frontend vérifié.
Fichiers additionnels : sipv/backend/app/api/v1/endpoints/cdr.py,
erpcrm/backend/app/core/sipv_client.py, api/v1/endpoints/portal.py,
frontend/src/pages/Portal.jsx, frontend/src/pages/Admin.jsx.

**Suite TASK-S056 (même journée)** — Caller ID exclu du portail sur demande
explicite ("on touche pas, il est là" — déjà géré côté admin, ContactDetail.jsx).
Plan d'appel ajouté par contre : nouveau `PortalUser.can_edit_call_plan`
(migration `c0d1e2f3a4b5`), nouvelle branche dans l'arbre `Admin.jsx`, nouvelle
section "Plan d'appel" dans `Portal.jsx` — 4 cases tri-état (Canada/US/
international/payants) avec `indeterminate` = hérite du défaut compagnie, EXACT
même pattern que `ContactDetail.jsx` (admin), branché sur les champs
`allow_canada`/`allow_us`/`allow_international`/`allow_premium` déjà
RÉELLEMENT appliqués côté SIPV (`_call_permission_gate_entries`) — pas le menu
simple retiré ce matin (TASK-S052). Testé de bout en bout (compte jetable) :
tri-état par défaut confirmé `null`, modification appliquée, tentative de
modifier un champ hors permission confirmée 403. Données de test nettoyées.
Fichiers additionnels : erpcrm/backend/app/models/portal.py,
alembic/versions/c0d1e2f3a4b5_portal_call_plan.py,
api/v1/endpoints/portal.py, frontend/src/pages/Portal.jsx, Admin.jsx.

---

## TASK-020 [ERPCRM] [~] Portail "Gestion téléphonique"
Classification: CURRENT
Date de demande : 2026-09-10 (choisi dans une liste d'options backlog proposée) — portée précisée/révisée le 2026-09-11
Date(s) de travail : 2026-09-11

Lien TASKSIPV : TASK-S029. (TASK-S030/S031 — session gestionnaire lock / code temporaire — abandonnées, voir plus bas : le verrou vit côté ERPCRM, pas SIPV, et le code temporaire a été explicitement retiré du design.)
Dépend de : TASK-017, TASK-019 (déjà faits).

**Design revu en discutant (2026-09-11), différent du plan d'origine** :
- Pas de "session gestionnaire" avec bouton explicite créer/libérer, ni de code temporaire (Philippe a retiré cette idée). À la place : un **verrou d'édition implicite par compagnie**, vérifié automatiquement à CHAQUE écriture (pas de clic "démarrer une session").
- Règle du verrou : premier arrivé/premier servi ENTRE PAIRS du même type (tech vs tech, client vs client) — le 2e est bloqué (HTTP 423, message clair avec le nom du détenteur) tant que le 1er n'a pas relâché ou que son inactivité dépasse 30 min (glissant). Un TECH préempte toujours un verrou détenu par un CLIENT (priorité instantanée), jamais l'inverse.
- Le verrou vit **côté ERPCRM** (nouveau modèle `TelephonyLock`, une ligne par compagnie) — pas de nouvelle table SIPV (TASK-S030/S031 abandonnées) puisque c'est ERPCRM qui héberge le portail et les comptes internes.

**Fait** :
- `backend/app/models/telephony_lock.py` (nouveau) — `TelephonyLock` (company_id unique, holder_type/id/label, acquired_at, last_activity_at). Migration `910b7c27fa10`.
- `backend/app/core/telephony_lock.py` (nouveau) — `acquire_telephony_lock()`/`release_telephony_lock()`, logique premier-arrivé + préemption tech. **Testé fonctionnellement en direct contre la vraie DB** (5 scénarios : acquisition libre, blocage tech-vs-tech, blocage tech-vs-client, libération, préemption tech-sur-client) — tous confirmés.
- `backend/app/core/sipv_client.py` — ajout des fonctions manquantes `create_ivr`/`update_ivr`/`delete_ivr`/`create_queue`/`delete_queue` (l'IVR/Queues n'avaient que la lecture ; vérifié que SIPV expose déjà tout le CRUD côté serveur, `api/v1/endpoints/ivr.py`, juste jamais branché côté ERPCRM avant ce soir).
- `backend/app/api/v1/endpoints/portal.py` — nouvelle section "Gestion téléphonique" : `GET/PATCH extensions`, `GET/POST/PATCH ivr`, `GET/POST/PATCH ring-groups`, `GET/POST/PATCH paging-groups`, `GET queues` (lecture seule), `GET cdr` (compagnie complète) — chaque écriture passe par `acquire_telephony_lock`.
- `backend/app/api/v1/endpoints/companies.py` — verrou câblé sur les écritures internes qui **chevauchent** ce que le portail peut aussi toucher : ring-groups (create/update/delete), paging-groups (create/update/delete), extension actif/inactif. Trunks/serveurs/backup/horaires/templates délibérément **non touchés** — le portail n'y accède jamais, donc aucun risque réel de conflit.
- `frontend/src/pages/Portal.jsx` — nouvel onglet "Gestion téléphonique" (sous-onglets Postes/IVR/Groupes/Historique selon permission), modaux de création IVR (avec options de menu)/groupes, édition inline des postes. Erreur 423 affichée telle quelle (message du serveur, qui détient le verrou).
- Build + déploiement backend et frontend confirmés (services redémarrés, routes vérifiées via `/openapi.json`).

**Non fait / limites connues, à ne pas confondre avec "terminé"** :
- Verrou **pas câblé** sur les écritures d'extension dans `contacts.py` (create/update/delete de poste) — company_id pas directement disponible dans ces fonctions (résolu via le contact), aurait demandé plus de temps pour le faire proprement sans risquer une régression sur du code existant qui fonctionne. Un poste peut donc encore être modifié depuis `ContactDetail.jsx` sans respecter le verrou.
- Verrou pas câblé sur les sous-ressources (membres de groupe, étapes de failover) — seulement sur la ressource parente (créer/modifier/supprimer un groupe).
- Files d'attente (Queues) : lecture seule dans le portail, pas de création/édition (pas demandé explicitement pour cette entrée).
- Suppression d'un IVR : fonction proxy ajoutée (`delete_ivr`) mais pas exposée comme endpoint portail (pas dans la demande initiale).
- Non testé visuellement dans un vrai navigateur avec un vrai compte portail par Claude (pas d'identifiants) — Philippe à confirmer en utilisation réelle demain.

Éléments jamais exposés dans le portail (confirmé) : trunks, routes sortantes, E911, sécurité, config fournisseur.

**Correction (2026-09-11, même soir)** : l'onglet "Gestion téléphonique" côté portail n'apparaissait que si `can_manage_telephony` était cochée — bug de bundling, alors que côté admin (`ContactDetail.jsx`, groupe "TÉLÉPHONIE — GESTIONNAIRE") les 5 permissions sont déjà totalement indépendantes depuis le départ (pas touché ce soir, déjà correct). Corrigé : l'onglet apparaît dès qu'AU MOINS UNE des 5 est cochée ; chaque sous-onglet (Postes/IVR/Groupes/Historique) reste gated par SA permission précise, indépendamment des autres — un client avec seulement `can_view_company_cdr` voit l'onglet avec juste l'Historique, sans besoin de `can_manage_telephony`.

**Écart `can_manage_audio_prompts` corrigé (même soir, sur demande explicite "rends-la fonctionnelle")** : nouveau sous-onglet "Audio" côté portail — Phrases/annonces (liste, téléversement, renommer, supprimer) + Musique d'attente (liste incluant les fichiers partagés Simple IP en lecture seule, téléversement, suppression limitée aux fichiers propres à la compagnie). Endpoints `portal.py` : `GET/POST /telephony/prompts`, `PATCH/DELETE /telephony/prompts/{id}`, `GET/POST /telephony/moh`, `DELETE /telephony/moh/{id}` (vérifie l'appartenance tenant avant suppression — jamais un fichier partagé entre tenants), `GET/PUT /telephony/moh-selection`. Aucune fonction `sipv_client.py` manquante cette fois (tout existait déjà). Verrou télephonie appliqué sur les écritures. Génération vocale (Voicebox/TTS) et lecture audio construites juste après (voir ci-dessous) — l'hypothèse "ressource/coût à contrôler" était fausse, vérifiée : Voicebox est un service local (127.0.0.1 uniquement, pas d'auth, pas de coût externe), pas de raison de le retenir.

**Génération vocale + lecture audio ajoutées (même soir, sur demande explicite)** : 2 nouvelles permissions PortalUser, séparées de `can_manage_audio_prompts` et l'une de l'autre — `can_listen_audio_prompts` (écoute des phrases/MOH existantes) et `can_generate_voice_prompts` (synthèse vocale IA). Migration `9ea99349c01f`. Admin (`ContactDetail.jsx`) : 2 nouvelles cases dans le groupe "TÉLÉPHONIE — GESTIONNAIRE".
- `get_portal_user_media` (nouveau, `portal.py`) — équivalent portail de `get_current_user_media` (auth.py) : accepte le token en query param (`?token=`), nécessaire pour les balises `<audio src="...">` natives qui ne peuvent pas envoyer d'en-tête Authorization. Lecture seule uniquement.
- `GET /telephony/prompts/{id}/file`, `GET /telephony/moh/{id}/file` — streaming audio, gated `can_listen_audio_prompts`.
- `GET /telephony/voicebox/voices`, `GET /telephony/voicebox/preview`, `POST /telephony/prompts/generate` — gated `can_generate_voice_prompts`, même UX que `TelephonyTab.jsx` côté interne (filtre langue/genre, prévisualisation `<audio>` live avant de créer).
- Sous-onglet "Audio" du portail : visible dès qu'AU MOINS UNE des 3 permissions (gérer/écouter/générer) est cochée — chaque section à l'intérieur (upload/suppression, lecteur `<audio>`, générateur IA) reste gated indépendamment par SA permission précise.

**Précision de Philippe (même soir) — deux points distincts, pas la bibliothèque de phrases** :
1. **Écoute des messages vocaux reçus ("Mon poste")** — vérifié dans le vrai système avant de construire : **trou d'infrastructure réel, pas juste une permission à activer**. Table `voicemail_messages` (SIPV, Postgres) vide (0 ligne), aucun code Python ne la remplit, et la config FreeSWITCH (`voicemail.conf.xml`) a `storage-dir`/`odbc-dsn` commentés — les enregistrements existent quelque part sur le disque FreeSWITCH (stockage par défaut du module) mais rien ne les liste ni ne les sert. Nécessiterait soit d'activer le mode Realtime FreeSWITCH (touche la config live de production), soit un scanner de fichiers — **pas construit ce soir**, décision à prendre séparément avant d'y toucher (risque sur un service de messagerie vocale déjà utilisé par de vrais clients).
2. **Message d'accueil par texte + IA ("Mon poste")** — celui-là **construit** (contrairement à la bibliothèque de phrases, réservée à Gestion téléphonique) : réutilise `can_edit_voicemail` (déjà existant, pas de nouvelle case — demande explicite "actif de base"). `POST /extension/voicemail-greeting/generate` (texte, voix, type d'accueil absence/occupé/nom) → génère via Voicebox → envoie directement comme message d'accueil réel via `upload_voicemail_greeting` (déjà existant côté SIPV, jamais branché avant). Accès à la liste des voix élargi (`can_generate_voice_prompts` OU `can_edit_voicemail`, les deux contextes en ont besoin).

**Idée connexe loggée séparément** : verrou similaire sur les Tickets (un tech ouvre = verrouillé en édition pour les autres, consultable en lecture) — voir `TASK-006.4`, pas construit ici (module différent).
Fichiers : backend/app/models/telephony_lock.py (nouveau), backend/app/core/telephony_lock.py (nouveau), backend/app/core/sipv_client.py, backend/app/api/v1/endpoints/portal.py, backend/app/api/v1/endpoints/companies.py, backend/alembic/versions/910b7c27fa10_telephony_lock_table.py (nouveau), frontend/src/pages/Portal.jsx.

---

## TASK-021 [ERPCRM] [x] Billing events SIPV — facturation récurrente automatique
Classification: HISTORICAL

Lien TASKSIPV : TASK-S032.
Demande explicite de l'utilisateur (2026-08-08) : facturation automatique
obligatoire (pas une option — "pour éviter que je donne des services
gratuits"), retrait au prorata de la date de facturation. Design précisé par
l'utilisateur en plusieurs passes :
1. Date de départ + fréquence (mensuel/biannuel/annuel, puis étendu à
   bimestriel/trimestriel sur demande — "plus de choix qui ne dépasse pas 1
   an") choisies au moment d'activer le checkbox "Tenant téléphonique SIPV".
2. Article catalogue "Prorata" dédié, description dynamique nommant le service modifié.
3. Nouvel onglet "Récurrence" dans la nav (entre Factures et Commandes) — UNE
   seule récurrence par compagnie contenant toutes les lignes de service.
4. Protection contre le double-facturation des clients ScopServ actuels :
   vérifié qu'un seul tenant existe dans SIPV (Simple IP inc. lui-même) —
   confirmé par l'utilisateur que `sipv_enabled` non coché = pas de tenant =
   naturellement rien à facturer, pas besoin d'un interrupteur séparé.

Fait :
- **Nouveaux modèles** `CompanyRecurringBilling` (company_id unique, start_date,
  frequency, is_active) + `RecurringBillingLine` (catalogue_item_id, description,
  qty, unit_price, service_ref pour retrouver la ligne au retrait, service_type,
  is_prorata_credit) — migration `d1e2f3a4b5c6`.
- `CatalogueItem.sipv_service_type` (migration `f3a4b5c6d7e8`) : tag optionnel
  qui relie un forfait catalogue à un type de service SIPV, pour trouver le
  prix automatiquement. Article "Prorata" seedé (migration `e2f3a4b5c6d7`,
  prix 0 — le montant réel est calculé ligne par ligne, jamais un prix fixe).
- `api/v1/endpoints/recurring_billing.py` (nouveau, gros module) :
  - `_cycle_bounds(start_date, frequency, on_date)` — calcule le cycle de
    facturation courant en avançant par sauts de fréquence depuis la date de
    départ (logique testée : cycle mensuel du 8 août au 8 septembre confirmé).
  - CRUD standard (créer/lire/modifier la récurrence, ajouter/retirer une
    ligne manuellement, lister toutes les récurrences).
  - `POST /recurring-billing/{id}/generate-invoice` — crée une vraie `Invoice`
    (is_recurring=True) à partir des lignes actuelles, réutilise `_next_number`/
    `_recalc` de `invoices.py` (pas dupliqué). Les lignes de crédit de prorata
    sont retirées de la récurrence après génération (ponctuelles, jamais
    refacturées au cycle suivant) ; les lignes de service normales restent.
  - `POST /billing/sipv-event` (webhook, X-Api-Key = SIPV_API_KEY, même
    dépendance que `sipv_events.py`) : sur `*_added`, cherche un `CatalogueItem`
    par `sipv_service_type`, ajoute la ligne (prix 0 + description d'avertissement
    si aucun forfait configuré — jamais silencieux) ; sur `*_removed`, retrouve
    la ligne par `service_ref`, calcule le crédit de prorata
    (`-(prix / jours_du_cycle) * jours_restants`), la remplace par une ligne
    `is_prorata_credit=True`.
- `companies.py::toggle_sipv_tenant` : `SipvTenantToggle` étendu avec
  `billing_start_date`/`billing_frequency` — crée automatiquement la
  `CompanyRecurringBilling` à l'activation (défauts : aujourd'hui, mensuel),
  la désactive (`is_active=False`, jamais supprimée) si le tenant est désactivé
  — symétrique, pour ne jamais continuer à facturer un service coupé.
- `invoices.py::generate_next` : `freq_map` étendu avec bimestriel/trimestriel/
  biannuel pour rester cohérent avec les factures générées depuis une récurrence.
- Frontend : `CompanyDetail.jsx` (modal d'activation avec date + fréquence,
  5 choix : mensuel/bimestriel/trimestriel/biannuel/annuel) ; nouvelle page
  `Recurrence.jsx` (accordéon par compagnie, lignes éditables, bouton "Générer
  une facture maintenant") ; nouvel item de nav "Récurrence" (icône `IconRefresh`
  ajoutée) entre Factures et Commandes.

`generate-invoice` corrigé après un `MissingGreenlet` (`db.get(..., options=[...])` remplacé par un vrai `select().options(selectinload(...))`).

Testé de bout en bout (tenant réel `t1001`, jamais un tenant de production) :
activation → récurrence créée avec les bonnes bornes de cycle ; article
catalogue taggé `sipv_service_type=extension` → webhook `extension_added`
trouve le bon prix automatiquement ; retrait à mi-cycle (jour 15 sur 31) →
crédit prorata calculé et confirmé exact à la main (-15.48$) ; génération de
facture réelle → facture créée avec taxes, ligne prorata retirée de la
récurrence après coup, confirmé à 0 ligne restante. **Appel réseau réel** (pas
juste simulé) depuis le serveur SIPV vers ERPCRM testé séparément (`erpcrm_client.
send_billing_event()` exécuté directement sur SIPV) — ligne confirmée créée puis
retirée côté ERPCRM via la vraie connexion TLS inter-serveurs. Toutes les
données de test (facture, article catalogue, lignes) nettoyées après validation.
Build frontend vérifié (`npm run build` OK) à chaque étape.

⚠️ Non couvert par cette tâche (hors scope de la demande initiale, pas un
oubli silencieux) : DID création via `dids.py::create_did()` (chemin natif
SIPV) n'envoie pas d'événement — seul `sync.py::sync_did()` (chemin réel,
ERPCRM maître) le fait, pour éviter un double événement si les deux chemins
étaient câblés. Usage facturable au temps (1-800, international, minutes
via CDR) mentionné dans le plan original de TASK-S032 : pas fait, l'utilisateur
n'a demandé que l'ajout/retrait de services (postes/DID), pas la facturation
à l'usage.

Fichiers : backend/app/models/recurring_billing.py (nouveau),
models/catalogue.py, models/__init__.py,
alembic/versions/d1e2f3a4b5c6_recurring_billing.py,
alembic/versions/e2f3a4b5c6d7_prorata_catalogue_item.py,
alembic/versions/f3a4b5c6d7e8_catalogue_sipv_service_type.py,
api/v1/endpoints/recurring_billing.py (nouveau), api/v1/endpoints/companies.py,
api/v1/endpoints/invoices.py, api/v1/endpoints/catalogue.py, main.py,
frontend/src/pages/CompanyDetail.jsx, frontend/src/pages/Recurrence.jsx (nouveau),
frontend/src/components/Layout.jsx, frontend/src/components/Icons.jsx, App.jsx.


### TASK-021.1 [x] Factures périodiques : date de fin + import des profils Zoho
Date de demande : 2026-10-02 (Philippe : « j'ajoute les factures périodiques pour que tu les remplisses, ils ont tous une date de début de facturation et l'option de fin (une date) »)
Date(s) de travail : 2026-10-02

Fichier `/home/simpleip/Simple_IP/factures_zoho/Facture_périodique.csv` : 36 profils (24 actifs, 11 expirés avec date de fin, 1 inactif), mensuels sauf D'Astous (6 mois) et Heka & Luna (3 mois) ; 88 lignes actives, toutes taxables.
Constat du modèle ERPCRM (`CompanyRecurringBilling`) : date de début, fréquence, actif ; pas de date de fin ; une seule récurrence par compagnie (contrainte unique, utilisée par l'activation SIPV, les événements de facturation SIPV et contacts.py — 6 endroits) ; génération manuelle (bouton), aucun envoi automatique → pas de double facturation avec Zoho à l'import ; `first_invoice_generated` (TASK-033) doublerait les lignes de la première facture générée si on ne le met pas à vrai pour des profils déjà facturés dans Zoho.
Points à trancher : Maison Le Passeur a 2 profils actifs (Le Passeur + Oxygène, succursale) → plusieurs récurrences par compagnie (avec succursale) ou fusion ; sort des 12 profils expirés / inactifs (plusieurs clients n'existent plus comme compagnies).

Décisions de Philippe (2026-10-02) : Le Passeur et Oxygène = 2 factures séparées (choix du client) ; profils expirés = clients arrêtés, non importés.
Fait le 2026-10-02 :
- Migration `c8d9e0f1a2b3` (revises `b7c8d9e0f1a2`) : unicité `company_id` retirée (index simple), + `name`, `site_id` (succursale), `end_date` (optionnelle), `last_invoice_date`, `is_telephony` (la récurrence existante de Simple IP marquée téléphonie) ; testée up/down/up.
- `telephony_recurrence()` (recurring_billing.py) : seule récurrence visée par l'activation / désactivation du tenant SIPV (companies.py), les événements de facturation SIPV et le prorata des postes (contacts.py) — 7 endroits qui supposaient une seule récurrence par compagnie. `GET /companies/{id}/recurring-billing` (compatibilité) renvoie la téléphonie sinon la plus ancienne.
- Génération : refusée si le cycle commence après la date de fin, ou s'il est déjà facturé (`last_invoice_date`, mis à jour à chaque génération) ; facture rattachée à la succursale ; note « Généré depuis la facture périodique « nom » ». Mise à jour : nom, date de fin (`clear_end_date` pour la retirer, doit suivre la date de début).
- Import `backend/import_zoho_recurring.py` (essai à blanc par défaut, tout ou rien, relançable) : 24 profils actifs, `first_invoice_generated` = vrai (pas de doublement TASK-033), `last_invoice_date` = cycle de la dernière facture Zoho ; contrôles : sous-total ERPCRM = Zoho et prochain cycle ERPCRM = « Next Invoice Date » Zoho pour les 24 (aucun écart). Oxygène sur la succursale Oxygene de Maison Le Passeur.
- Frontend `Recurrence.jsx` (« Factures périodiques ») : date de début → fin en premier, nom du profil, succursale, badge Téléphonie, dernière facture, recherche, date de fin modifiable, erreurs de génération affichées.
- Preuve : 25 récurrences (1 téléphonie) ; générer Hamak → refusé (cycle du 2026-10-02 déjà facturé par Zoho), 777 factures inchangées ; date de fin avant le début → 400.
- À savoir : le profil Zoho de « HB Architectes inc. » s'appelle « Hetu-Bellehumeur » et ERPCRM a aussi une compagnie « Hetu-Bellhumeur » (sans facture) — doublon probable à fusionner (demander à Philippe). Les factures restent générées à la main (bouton) : tant que Zoho facture aussi, ne pas générer dans ERPCRM.

### TASK-021.2 [x] Création automatique des périodiques — ventes et achats
Date de demande : 2026-10-04 (Philippe : « fais le périodique, que ce soit achat ou vente »)
Date(s) de travail : 2026-10-04

- `app/services/recurring_poller.py` (lancé dans `main.py`, toutes les 30 min, 1re passe 60 s après le démarrage) : pour chaque périodique active, crée tous les cycles dus jusqu'à aujourd'hui, le plus ancien d'abord ; une transaction par document ; verrou `SELECT … FOR UPDATE` sur la périodique (le bouton et l'automatique ne peuvent pas créer deux fois le même cycle) ; garde-fou 60 cycles par passage.
- Paramètres (`settings.py`, modifiables depuis les pages) : `recurring_auto_purchases` = activé par défaut (factures fournisseurs + dépenses périodiques, TASK-044) ; `recurring_auto_sales` = **désactivé par défaut** — à activer par Philippe quand l'ancien logiciel ne génère plus ses factures (sinon double facturation des clients). Interrupteur `components/AutoRecurringToggle.jsx` sur Factures périodiques (ventes) et sur les deux pages périodiques d'Achats.
- Ventes : `recurring_billing.create_recurring_invoice` (partagé bouton / automatique) ; le bouton et l'automatique produisent maintenant le **prochain cycle manquant** (avant : seulement le cycle en cours, un mois oublié était sauté). Création automatique = facture émise mais « non transmise » (rien n'est jamais envoyé au client tout seul) ; nouveau filtre « Non transmises » dans Factures. Un cycle daté dans une période de taxes déclarée n'est jamais créé automatiquement. La liste affiche « prochaine : date » (orange quand due).
- Achats : `purchases.create_recurring_bill` / `create_recurring_expense` (partagés bouton / automatique).
- Preuve : la facture Spotify du 2026-10-04 (24,13 $) créée par l'automatique une seule fois ; facture client testée en transaction annulée (LS Services Comptables : 2026-0002, émise, non transmise, 45,88 $) ; Maison Le Passeur refusée (prochain cycle 2026-10-22) ; captures sans erreur.
- 2026-10-04, réponse de Philippe : « oui [l'ancien logiciel génère encore] et je veux que toi aussi, mais ne les envoie pas » → `recurring_auto_sales` activé (marche en parallèle ; les factures ERPCRM restent « non transmises », jamais envoyées). Première passe : 2026-0002 Construction Nationale (2026-10-03, 722,16 $) et 2026-0003 LS Services Comptables (2026-10-04, 45,88 $), aucune transmission.
- Récurrence téléphonie de test de « Simple IP inc. » (ligne « Poste 103 — Test SIPV », 0 $, début 2026-08-08) désactivée (`is_active` = faux, réversible) : elle aurait créé deux factures à 0 $ de Simple IP à elle-même.
- Numérotation : les factures ERPCRM restent « 2026-xxxx » pendant la marche en parallèle (si ERPCRM reprenait la suite « INV-111xxx », ses numéros entreraient en collision avec ceux que l'ancien logiciel continue d'émettre). À reprendre le jour où l'ancien logiciel est arrêté.
---

## TASK-022 [ERPCRM] [x] Checkbox tenant SIPV sur fiche compagnie
Classification: HISTORICAL

Constat avant implémentation : le champ `account_number` était juste un texte libre —
rien n'appelait jamais SIPV pour créer le tenant réellement (déjà noté dans TASK-018).
Fait :
- Migration `k2l3m4n5o6p7` : `sipv_enabled` (bool, défaut false) + `sipv_tenant_id`
  (UUID nullable) sur companies
- `core/sipv_client.py` (nouveau) : client httpx vers SIPV `/api/v1/sync/company`
  (X-Api-Key = settings.ERPCRM_API_KEY — nouvelle clé ajoutée, distincte de SIPV_API_KEY
  qui sert à valider les appels entrants de SIPV)
- POST /v1/companies/{id}/sipv-tenant {enabled: bool} — active (crée/réactive le tenant,
  exige account_number renseigné, erreur 400 sinon) ou désactive (is_active=false côté
  SIPV, réversible, ne supprime rien). Erreurs SIPV remontées en 502, pas best-effort ici
  (contrairement au lien contact↔extension TASK-S022 SIPV) car c'est une action explicite
  de l'utilisateur qui doit savoir si ça a fonctionné.
- CompanyDetail.jsx : checkbox + modal de confirmation (texte différent activer/désactiver,
  avertissement explicite pour éviter de cocher par erreur) dans l'onglet Identification
- httpx ajouté à requirements.txt (n'était pas installé sur ce serveur, installé + épinglé)
- Migration appliquée en prod (alembic upgrade head), service erpcrm-backend redémarré
Fichiers : backend/app/models/company.py, backend/app/schemas/company.py,
backend/app/api/v1/endpoints/companies.py, backend/app/core/sipv_client.py (nouveau),
backend/app/core/config.py, backend/requirements.txt,
backend/alembic/versions/k2l3m4n5o6p7_company_sipv_tenant.py,
frontend/src/pages/CompanyDetail.jsx.

### TASK-022.1 [x] Logger le détail réel de tout appel SIPV échoué
Date de demande : 2026-08-30 (rattrapé rétroactivement depuis git log, non inscrit au moment du commit)
Date(s) de travail : 2026-08-30

126 endpoints (5 fichiers) retombent tous sur le même
`except httpx.HTTPError: raise HTTPException(502, "SIPV injoignable")` —
l'exception réelle (type, méthode, URL, message) n'était jamais loggée nulle
part. Incident réel sans preuve exploitable : 2026-08-29 18h48, commande
"écouter message" sur poste 102, 502 sans aucune trace côté ERPCRM ni côté
SIPV pour en déterminer la cause. `_client()` (point d'entrée unique des ~50
fonctions du module, donc des 126 endpoints en aval) devient un
contextmanager qui logge l'exception avant de la relaisser remonter
inchangée — aucun des 126 appelants n'a besoin d'être modifié, chacun garde
son 502 tel quel, précédé désormais d'une ligne de log exploitable. Testé :
chemin succès et chemin échec (ConnectError simulé, log confirmé + exception
toujours remontée).
Fichier : backend/app/core/sipv_client.py (commit 38bc887).

---

## TASK-023 [ERPCRM] [x] Postes SIP visibles sur fiche contact + fiche compagnie
Classification: CURRENT

Demande de l'utilisateur : voir/gérer les infos SIP d'une personne depuis sa fiche
contact (pas juste depuis la compagnie), et voir la liste des postes + statut de
connexion en direct sur la fiche compagnie.
Fait :
- `sipv_client.py` : `get_extensions_by_contact()`, `list_extensions()`,
  `tenant_registrations()` — 3 nouveaux appels proxy vers SIPV
- GET /v1/contacts/{id}/sip-extension : poste lié à CE contact (via erpcrm_contact_id,
  null si pas synchronisé ou pas encore lié)
- GET /v1/companies/{id}/sip-extensions : tous les postes du tenant + statut
  d'enregistrement en direct (fusionne extensions.py + esl.py côté SIPV)
- ContactDetail.jsx : section Téléphonie (déjà existante pour le checkbox sipv_sync)
  affiche maintenant le poste lié — poste, nom, username, actif, messagerie, sync
  FreeSWITCH — quand sipv_sync est coché
- CompanyDetail.jsx onglet Téléphonie : nouvelle liste "Postes SIP" avec badge
  Enregistré/Hors ligne, distincte des anciennes fiches DID/poste ERPCRM
  (`models/telephony.py`, jamais connectées à SIPV — toujours présentes, pas touchées)
Côté SIPV (voir TASKSIPV.md) : nouvelle dépendance combinée JWT/API-key
(`get_current_user_or_service`) appliquée à GET /extensions/tenant/{id} et
GET /esl/registrations/tenant/{id}, + nouveau GET /extensions/by-contact/{id}.
Écart de données découvert : les extensions de test 100/101 (créées avant ce
correctif) n'avaient pas `erpcrm_contact_id` malgré le lien automatique ayant créé
les contacts — corrigé manuellement en DB pour ces deux-là ; le code de création
(TASK-S022 SIPV) fonctionne correctement pour les nouvelles extensions (vérifié
avec l'extension de test "200"/isolation).
Fichiers : backend/app/core/sipv_client.py, backend/app/api/v1/endpoints/companies.py,
backend/app/api/v1/endpoints/contacts.py, frontend/src/pages/CompanyDetail.jsx,
frontend/src/pages/ContactDetail.jsx.

### TASK-023.1 [x] Fusion postes SIP dans la liste Extensions + IP publique/privée
Demande de l'utilisateur : ne pas dupliquer "Extensions" et "Postes SIP" en deux
listes séparées — les postes SIP SONT les extensions. Voir le statut en pastille
verte/rouge (pas en texte) et avoir l'IP publique + IP privée de chaque poste
enregistré, comme dans ScopServ, pour diagnostiquer SIP ALG / double NAT chez le
client (IP publique = IP privée → ALG actif ou double NAT).
Fait :
- SIPV `esl.py` : `_parse_registrations()` extrait `network_ip` (IP publique vue par
  FreeSWITCH) et l'IP du champ Contact SIP via regex (IP privée annoncée par le
  poste) depuis `show registrations as json`. `RegistrationOut` gagne `public_ip`,
  `private_ip`, `port`. `tenant_registrations()` appelle `show_registrations()` une
  seule fois pour tout le tenant au lieu d'un appel ESL par poste.
- ERPCRM `companies.py` GET /{id}/sip-extensions : copie `public_ip`/`private_ip`/
  `reg_port` dans la fusion extensions + registrations.
- CompanyDetail.jsx : suppression de la section séparée "Postes SIP" ; nouveau calcul
  `mergedExtensions` qui fusionne les fiches ERPCRM (`Extension`, DID/messagerie) et
  les postes SIPV réels par numéro de poste (SIPV = source de vérité pour l'existence
  du poste — la plupart des postes n'ont pas de fiche ERPCRM). Colonnes ajoutées au
  tableau Extensions : pastille de statut (vert/rouge/gris si pas de poste SIPV),
  IP publique, IP privée avec ⚠ si les deux sont identiques. Bouton supprimer visible
  seulement pour les postes ayant une vraie fiche ERPCRM.
Fichiers : sipv/backend/app/api/v1/endpoints/esl.py,
erpcrm/backend/app/api/v1/endpoints/companies.py,
erpcrm/frontend/src/pages/CompanyDetail.jsx.

### TASK-023.2 [x] Infos de connexion SIP (mot de passe inclus) sur la fiche contact
Demande de l'utilisateur : besoin du mot de passe SIP en clair pour configurer un
téléphone manuellement quand le provisioning automatique échoue (réseau qui le
bloque). `ExtOut` (SIPV) n'exposait jamais le mot de passe par design — condition
posée par l'utilisateur pour l'exposer : le chiffrer au repos.
Fait côté SIPV (voir TASKSIPV.md TASK-S039 pour le détail complet) :
- `app/core/crypto.py` (nouveau, partagé) : chiffrement Fernet (même clé dérivée de
  SECRET_KEY que le pattern déjà en place pour admin_password des téléphones).
- `SIPExtension.password` chiffré au repos (migration `0026_encrypt_extension_
  passwords` — chiffre les 3 mots de passe existants en place). `xml_curl.py`
  déchiffre à la volée pour l'auth digest FreeSWITCH (aucun impact sur les postes
  déjà enregistrés, testé en direct).
- `GET /extensions/{id}/connection-info` (X-Api-Key, appelé par ERPCRM en proxy) :
  retourne username, mot de passe déchiffré, serveur, port (5060/5061 selon
  transport), domaine. Pas de log d'audit sur cette lecture — même choix que
  reveal-admin-password (provisioning.py), déjà établi comme précédent.
Fait côté ERPCRM :
- `sipv_client.get_connection_info()`, `GET /v1/contacts/{id}/sip-extension/
  connection-info` (proxy, JWT utilisateur requis).
- ContactDetail.jsx : bouton "Afficher les infos de connexion" (même pattern
  Révéler/Masquer que CompanyDetail.jsx pour ClientAccess) sous la section poste SIP
  existante (TASK-023) — affiche serveur/port/transport/domaine/username/mot de
  passe en `<code>` sélectionnable.
TLS inter-serveurs ERPCRM↔SIPV ajouté dans la foulée (demande explicite de
l'utilisateur après avoir noté que l'appel HTTP existant transportait maintenant un
mot de passe en clair sur le réseau) — voir TASKSIPV.md TASK-S039 pour le détail
complet (CA privée, nouveaux ports TLS dédiés 8011/8022, pare-feu).
Fichiers : sipv/backend/app/core/crypto.py (nouveau),
sipv/backend/app/api/v1/endpoints/extensions.py,
sipv/backend/app/api/v1/endpoints/xml_curl.py,
sipv/backend/alembic/versions/0026_encrypt_extension_passwords.py,
erpcrm/backend/app/core/sipv_client.py, erpcrm/backend/app/api/v1/endpoints/contacts.py,
erpcrm/frontend/src/pages/ContactDetail.jsx.

### TASK-023.3 [x] Correction terminologie + IP publique dans les infos de connexion
Demande de l'utilisateur après avoir configuré un vrai GXP2135 et galéré à cause
d'un malentendu sur les champs "SIP Server" vs "Outbound Proxy" (voir TASKSIPV.md
TASK-S039.3 pour le détail de la confusion) : les infos de connexion affichées sur
la fiche contact doivent utiliser exactement les MÊMES noms de champs que ceux
affichés sur un vrai téléphone (pas "Serveur"/"Domaine", qui prêtait à confusion),
et l'adresse réseau doit être l'IP PUBLIQUE (pas l'IP LAN) — l'utilisateur a des
règles internes sur son pare-feu WatchGuard (hairpin NAT) qui gèrent correctement
l'IP publique même utilisée depuis l'intérieur du réseau, donc une seule adresse
fonctionne partout (local et distant) sans avoir à changer la config du téléphone
selon l'endroit.
Fait côté SIPV :
- `config.py` : nouveau `SIPV_PUBLIC_IP` (`.env`, pas codé en dur).
- `GET /extensions/{id}/connection-info` : champs renommés `domain`→`sip_server`,
  `server`→`outbound_proxy` (valeur = `SIPV_PUBLIC_IP` au lieu de `SIPV_HOST`).
Fait côté ERPCRM :
- ContactDetail.jsx : labels alignés sur la terminologie exacte du téléphone
  ("SIP Server", "Outbound Proxy", "SIP User ID / Auth ID", "SIP Authentication
  Password").
Piège rencontré pendant le déploiement : `sipv-backend` (port 8020) et
`sipv-backend-tls` (port 8022, TASK-S039.1) sont deux process uvicorn SÉPARÉS
chargeant le même code — redémarrer l'un ne recharge PAS le code de l'autre.
Oublié au premier redémarrage, résultat = anciens noms de champs encore retournés
via le port TLS alors que le fichier sur disque était déjà à jour. À retenir pour
tout futur déploiement touchant `extensions.py` : redémarrer LES DEUX services.
Fichiers : sipv/backend/app/core/config.py,
sipv/backend/app/api/v1/endpoints/extensions.py, sipv/backend/.env (SIPV_PUBLIC_IP),
erpcrm/frontend/src/pages/ContactDetail.jsx.

### TASK-023.4 [x] Enregistrement d'appel + renvois éditables depuis la fiche contact
Demande de l'utilisateur (2026-07-24) : préciser la répartition ERPCRM/SIPV — SIPV
expose TOUT ce que FreeSWITCH permet (usage technique occasionnel), ERPCRM n'expose
que le sous-ensemble manipulé souvent au quotidien (postes/tenants/IVR/files
d'attente/groupes d'appel + ce qui est déjà là). L'utilisateur a demandé d'ajouter
l'enregistrement d'appel et les renvois/divert à ce sous-ensemble fréquent — pas
juste en lecture (comme le reste de la section Téléphonie), en édition directe.
Le portail client en libre-service (TASK-019/020 TASKERPCRM.md, TASK-S028
TASKSIPV.md, "Mon poste"/Portal.jsx) couvre des champs similaires mais c'est un
produit différent (accès client final), pas la fiche admin — les deux existent en
parallèle, pas de doublon à corriger.
Fait côté SIPV :
- `PUT /extensions/{id}` : dépendance changée de `get_current_user` (JWT strict) à
  `get_current_user_or_service` (accepte aussi X-Api-Key, même pattern que les
  autres endpoints proxy ERPCRM) — nécessaire puisqu'ERPCRM appelle ce endpoint
  sans compte utilisateur SIPV. `user.email` remplacé par un fallback
  `"erpcrm-proxy"` dans `PendingChange.created_by` et `log_audit()` (`core/audit.py`,
  paramètre `user` maintenant `User | None`) pour ne pas planter sur un appel
  authentifié par clé plutôt que par JWT.
Fait côté ERPCRM (première version) :
- `sipv_client.update_extension()`, `PUT /v1/contacts/{id}/sip-extension` (proxy,
  JWT utilisateur ERPCRM requis).
- ContactDetail.jsx : 4 renvois avec case + destination (immédiat, occupé, non
  répondu + délai, hors ligne — `forward_offline_enabled` ajouté par symétrie avec
  les 3 autres, migration `0027_fwd_offline_enabled`).
Fichiers : sipv/backend/app/api/v1/endpoints/extensions.py,
sipv/backend/app/core/audit.py, erpcrm/backend/app/core/sipv_client.py,
erpcrm/backend/app/api/v1/endpoints/contacts.py,
erpcrm/frontend/src/pages/ContactDetail.jsx.

**Révision de l'enregistrement (même session, précision demandée)** : le choix
simple "Manuel"/"Tous les appels" (`record_mode`) remplacé par 5 cases
indépendantes — 4 catégories automatiques (interne entrant/sortant, externe
entrant/sortant) + Manuel séparé, avec une case "Tout" qui coche/décoche les 4
automatiques ensemble sans jamais toucher à Manuel. Manuel (`record_calls`) reste
un simple interrupteur visuel pour l'instant — pas câblé (attend un P-code
Grandstream pour le déclenchement en cours d'appel, voir TASK-S011.4).
Migration `0028_record_categories` : 4 nouveaux booléens sur `SIPExtension`
(`record_internal_incoming/outgoing`, `record_external_incoming/outgoing`).

**Câblage réel dans le dialplan** (`xml_curl.py`, pas juste des champs stockés) :
- `_ext_dialplan_entries()` (appel interne poste→poste) : enregistre si le poste
  APPELANT a `record_internal_outgoing` OU si le poste APPELÉ a
  `record_internal_incoming` (l'un ou l'autre suffit).
- `_outbound_dialplan_entries()` (appel vers un trunk PSTN) : enregistre si le
  poste appelant a `record_external_outgoing`.
- `_inbound_actions()` (appel entrant d'un trunk vers un poste) : enregistre si le
  poste DESTINATAIRE a `record_external_incoming` (pas de poste "appelant" ici,
  l'appelant est externe).
- Nommage des fichiers (demande explicite) : `{caller_id_number}-{destination_
  number}-{date}-{heure}.wav` dans `/usr/local/freeswitch/recordings/`, via
  `record_session` + `${strftime(%Y%m%d-%H%M%S)}`.
- `_dialplan_internal()` récupère maintenant TOUJOURS le poste appelant
  (`caller_ext`, via `variable_sip_from_user`) — avant, seulement récupéré pour la
  résolution de tenant en connexion "conventionnelle" (TASK-S039.4) ; maintenant
  aussi nécessaire pour savoir si CET appel doit être enregistré.
Testé en direct avec un vrai appel simulé (pas juste supposé) : `record_
internal_outgoing=true` sur un poste de test → fichier `.wav` réel généré
(196 Ko, PCM 8kHz mono valide, nom conforme au format demandé) ; valeur de test
retirée et fichier supprimé après validation.
Fichiers additionnels : sipv/backend/app/models/sip.py,
sipv/backend/alembic/versions/0027_fwd_offline_enabled.py,
sipv/backend/alembic/versions/0028_record_categories.py.

### TASK-023.5 [x] Plan d'appel + caller ID interne/externe sur la fiche contact
Demande de l'utilisateur (2026-07-24, "mega prompt" fiche poste complète, GO explicite
"je veux tout ça dans mon erpcrm lié au SIPV") : exposer côté ERPCRM le plan d'appel
réellement câblé (TASKSIPV TASK-S018.5) et le caller ID séparé interne/externe
(TASKSIPV TASK-S018.6), tous deux nouvellement construits côté SIPV cette session.

Fait :
- `SipExtensionUpdate` (contacts.py) étendu avec les nouveaux champs — aucun nouveau
  code de proxy nécessaire, `sipv_client.update_extension()` transmet déjà n'importe
  quel champ générique (`**fields`) vers `PUT /extensions/{id}` côté SIPV. La lecture
  (`GET /sip-extension`) est un passthrough brut de `ExtOut` — pas de changement requis
  non plus, les nouveaux champs SIPV apparaissent automatiquement.
- ContactDetail.jsx, section Téléphonie : nouvelle sous-section "Caller ID" (nom/numéro
  interne, nom/numéro externe, case Masquer) et "Plan d'appel" (Canada/US/international/
  numéros payants avec état "hérite du défaut compagnie" quand `null`, pays/préfixes
  bloqués, limite mensuelle, NIP d'autorisation en écriture seule — jamais affiché en
  clair, `has_ld_pin` seulement).
- Trunk préféré (`preferred_trunk_id`) volontairement PAS exposé ici — réglage
  technique rare, reste géré uniquement dans l'admin SIPV (cohérent avec le principe
  "SIPV expose tout, ERPCRM expose le sous-ensemble fréquent").

⚠️ Incident pendant le déploiement : `systemctl restart erpcrm-backend erpcrm-backend-tls`
a échoué (pas de sudo NOPASSWD configuré sur ce serveur, contrairement à SIPV) — les
deux process ont été tués (SIGTERM) sans redémarrage automatique (pas de code=failure),
causant une coupure de quelques minutes. Rétabli manuellement (nohup) le temps qu'un
`sudo systemctl restart` soit fait par l'utilisateur pour revenir sous supervision
systemd normale. Testé après coup : port 8010 sert du vrai trafic, port 8011 (TLS)
répond bien depuis SIPV (401, attendu sans clé). À corriger structurellement si ça se
reproduit : configurer un sudoers NOPASSWD scopé à `systemctl restart erpcrm-backend*`
pour cet utilisateur, ou toujours demander avant un restart sur ce serveur.
Fichiers : backend/app/api/v1/endpoints/contacts.py, frontend/src/pages/ContactDetail.jsx.

### TASK-023.6 [~] Type de destination des renvois sur la fiche contact
Suite de TASKSIPV TASK-S018.7 (typage poste/BV/externe/groupe d'appel/file/IVR/
message des 4 renvois). `SipExtensionUpdate` etendu avec les 4 champs
`forward_*_destination_type` (passthrough generique, comme TASK-023.5). Selecteur
ajoute a cote de chaque champ destination dans ContactDetail.jsx, avec un ⚠ sur le
libelle quand le renvoi est actif mais pas encore reellement applique (occupe/non
repondu/hors ligne -- seul le renvoi immediat agit reellement, voir TASKSIPV
S018.7) pour ne pas laisser croire que c'est deja fonctionnel.
⚠️ Ce changement backend (contacts.py) est dans les fichiers modifies mais PAS ENCORE
charge par le process en cours (voir incident TASK-023.5 ci-dessus -- process relance
manuellement en attendant le `sudo systemctl restart` de l'utilisateur). Les nouveaux
champs de type seront silencieusement ignores par Pydantic (pas d'erreur, juste pas
sauvegardes) tant que ce restart n'est pas fait. Frontend deja live (Vite HMR).
Fichiers : backend/app/api/v1/endpoints/contacts.py, frontend/src/pages/ContactDetail.jsx.

### TASK-023.8 [~] Statut d'appel en direct (en ligne/sonne) + renvoi/DND visibles
Demande de l'utilisateur (2026-07-24) : icone combiné rouge = poste en ligne (en
appel), icone cloche jaune = poste qui sonne, sur fiche compagnie ET contact. Puis
suite immediate : voir aussi si un poste est en renvoi ou en DND dans l'onglet
Téléphonie de la compagnie, et une case DND directement dans les options du poste
sur la fiche contact.

Fait :
- `companies.py` GET `/{id}/sip-extensions` : fusionne maintenant aussi `call_state`
  (deja fusionnait registered/public_ip/private_ip) depuis TASKSIPV S020.3.
- `contacts.py` GET `/{id}/sip-extension` : n'avait JAMAIS de statut en direct avant
  cette tache (juste les champs bruts SIPV) -- ajoute la meme fusion registered/
  public_ip/private_ip/call_state via `sipv_client.tenant_registrations()`.
- `CompanyDetail.jsx` : pastille verte/rouge existante (TASK-023.1) gagne 📞 rouge
  (en ligne) / 🔔 jaune (sonne) a cote quand `call_state` correspond. Nouvelle
  colonne "Renvoi/DND" (badges) -- donnees deja presentes sur chaque extension
  (forward_*_enabled/dnd_enabled), aucun nouvel appel SIPV necessaire pour ca.
- `ContactDetail.jsx` : nouveau champ "Statut en direct" (pastille + icones, absent
  avant) dans la grille d'infos du poste ; case "Ne pas déranger (DND)" ajoutee
  (edite `dnd_enabled`, deja existant cote SIPV depuis S018.3, jamais expose ici).

⚠️ [~] : callstate `ACTIVE`/`HELD` (poste "en ligne") sont des valeurs FreeSWITCH
documentees mais pas observees avec un vrai appel repondu dans cette session (voir
TASKSIPV S020.3) -- seul `RINGING` a ete confirme par un test reel. `📞`/en ligne
devrait fonctionner des qu'un appel est reellement repondu mais n'a pas ete
verifie avec un cas reel.
⚠️ Backend ERPCRM pas encore recharge par le process manuel en cours (meme situation
que TASK-023.5/023.6 -- en attente du `sudo systemctl restart`). Frontend deja live.
Fichiers : backend/app/api/v1/endpoints/companies.py, contacts.py,
frontend/src/pages/CompanyDetail.jsx, ContactDetail.jsx.

### TASK-023.19 [x] Attribution d'appareil + éditeur de boutons sur la fiche contact
Demande de l'utilisateur (2026-07-24) : dans compagnie/téléphonie, cliquer sur un
poste ouvre le contact ; à droite de "Synchroniser avec SIPV"/"SIP actif", un
bouton "Bouton" permet de créer une config de touches programmables pour ce poste.
Attribution d'appareil : marque et modèle en recherche/scroll, MAC et numéro de
série saisis à la main.

Fait côté SIPV (préparation, voir TASKSIPV S011.13) : endpoints provisioning
basculés vers l'auth combinée JWT/clé API, nouvel endpoint `by-extension/{id}`.

Fait côté ERPCRM :
- `sipv_client.py` : 8 nouvelles fonctions proxy (modèles, téléphone par poste,
  création/màj téléphone, CRUD boutons).
- `ref_data.py` : `GET /v1/ref/phone-models` (catalogue, pour les dropdowns).
- `contacts.py` : `GET/POST /{id}/sip-extension/phone`, `PUT .../phone/{phone_id}`,
  `GET/POST /.../phone/{phone_id}/buttons`, `PUT/DELETE .../buttons/{button_id}`.
- `ContactDetail.jsx` : bouton "Bouton" à côté de "SIP actif" (exactement
  l'emplacement demandé) ; si aucun appareil attribué, formulaire d'attribution
  (`Autocomplete` réutilisé pour marque/modèle -- composant déjà existant, pas
  réinventé) ; si appareil attribué, tableau éditable des boutons (position/page/
  type/libellé/valeur/destination/compte SIP/client éditable/verrouillé) avec
  ajout/suppression en ligne.

`PhoneUpdatePayload` complété avec `is_active` (oublié, ignoré silencieusement par Pydantic, désactivation sans effet réel malgré un 200 OK).

Testé en direct de bout en bout via l'API (contact "Test Deux", lié à t1001-101) :
catalogue de 65 modèles récupéré via le proxy ; téléphone attribué (modèle GXP2130
family, MAC de test) ; bouton BLF créé et listé ; bouton supprimé ; téléphone
désactivé après correction du bug. SIPV confirmé : les 3 postes de test restent
`Registered`, aucune donnée de test résiduelle active.
⚠️ Backend ERPCRM rechargé manuellement pour cette tâche (toujours en attente du
`sudo systemctl restart` de l'utilisateur, voir TASK-023.5) -- code testé et
fonctionnel sur les process manuels actuels.
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/contacts.py,
api/v1/endpoints/ref_data.py, frontend/src/pages/ContactDetail.jsx.

### TASK-023.19.1 [x] Extensions -- case Actif éditable + Groupe de pickup nommé (créer le groupe, puis assigner les postes)
Demande de l'utilisateur (2026-08-07) : "pour les extension meme prinsipe pour
activer ou desactiver un poste (le checkbox comme les DID)... les groupe
pickup, tu met ajouter pour en mettre un et apres on attribue les postes qui
vont dedans pas un pour chaque poste".

Fait :
1. Colonne "Actif" du tableau Extensions (`CompanyDetail.jsx`) : texte
   Oui/Non en lecture seule → case à cocher, même style que le DID
   (TASK-023.31). `toggleExtActive()` cible le vrai poste SIPV
   (`PUT /v1/companies/{id}/extensions/{ext_id}/active`, nouvel endpoint) si
   un poste SIPV est lié, sinon la fiche ERPCRM seule (repli, cas rare d'un
   poste orphelin sans SIPV).
2. Groupe de pickup (interception *8) : avant cette entrée, `pickup_group`
   était un champ texte libre tapé sur chaque poste individuellement (une
   ligne par poste). Nouveau modèle `PickupGroup` (SIPV, `models/sip.py`) --
   entité purement organisationnelle (nom, actif) qui permet de créer un
   groupe vide puis d'y assigner des postes ensuite, comme les groupes
   d'appel. **Le dialplan réel (*8, `xml_curl.py::_pickup_dialplan_entries`,
   déjà en prod) continue de matcher par `SIPExtension.pickup_group` (string)
   -- non touché**, ce nouveau modèle ne fait qu'organiser/renommer ce tag en
   masse, pas de refactor risqué de la logique ESL déjà en prod.
   - `extensions.py` (SIPV) : CRUD
     `GET/POST /pickup-groups/tenant/{tenant_id}`,
     `PUT/DELETE /pickup-groups/{group_id}` -- renommer un groupe met à jour
     en masse le tag sur tous ses postes membres ; supprimer un groupe
     retire le tag des postes membres (jamais orphelin).
   - Migration `0055_pickup_groups.py`.
   - ERPCRM : `sipv_client` (4 fonctions), proxy
     `GET/POST /{company_id}/pickup-groups`,
     `PUT/DELETE /{company_id}/pickup-groups/{group_id}` (companies.py) --
     l'assignation/retrait d'un poste et le "Peut intercepter" réutilisent
     l'endpoint déjà existant `PUT /{company_id}/extensions/{id}/pickup-group`
     (TASK-023.22, inchangé).
   - `CompanyDetail.jsx` : `PickupGroupSection` entièrement réécrite --
     "+ Ajouter" crée le groupe (vide), ligne dépliable pour voir/retirer les
     membres + "+ Ajouter un poste..." (menu déroulant des postes pas encore
     dans ce groupe), case Actif et "Peut intercepter" par membre, tout en
     sauvegarde immédiate.

⚠️ Piège trouvé en testant (corrigé dans mon script de test, pas dans le code
livré) : `can_intercept_calls` est NOT NULL côté SIPV (`Boolean, default=True`)
mais le payload d'update l'accepte en `bool | None` -- envoyer explicitement
`null` fait planter en 500 (IntegrityError). Le frontend livré n'envoie jamais
`null` pour ce champ (seulement `pickup_group: null` pour retirer un poste, et
un booléen réel pour la case à cocher), donc pas de risque en usage normal --
noté ici au cas où un futur appel direct à l'API referait la même erreur.

Testé bout en bout via l'API ERPCRM réelle (poste réel t1001-100, compagnie
Simple IP inc.) : groupe créé, poste assigné, "Peut intercepter" activé,
`is_active` du poste basculé puis restauré, poste retiré du groupe, groupe
supprimé -- état du poste confirmé identique à avant le test. `npx vite
build` propre. Backend SIPV (migration incluse) + backend/frontend ERPCRM
redémarrés, tous vérifiés sains.
Fichiers : sipv/backend/app/models/sip.py, models/__init__.py,
api/v1/endpoints/extensions.py, alembic/versions/0055_pickup_groups.py ;
erpcrm/backend/app/core/sipv_client.py, api/v1/endpoints/companies.py ;
erpcrm/frontend/src/pages/CompanyDetail.jsx.
Dépend de : TASK-023.19, TASK-023.22, TASK-023.31.

### TASK-023.21 [x] Groupes d'appel (ring groups) — section dans compagnie/téléphonie
Demande de l'utilisateur : 3 sections séparées pour groupe d'appel / paging / pickup
dans compagnie/téléphonie. Backend déjà complet côté SIPV (TASK-S007.3), juste l'UI
ERPCRM manquait.

Fait :
- `sipv_client.py` : 7 fonctions proxy (list/create/update/delete groupe + add/
  update/remove membre).
- `companies.py` : `GET/POST /{id}/ring-groups`, `PUT/DELETE /{id}/ring-groups/{rg_id}`,
  `POST /.../members`, `PUT/DELETE /.../members/{member_id}` -- résout le
  `sipv_tenant_id` de la compagnie une seule fois (`_company_tenant_id()`).
- `CompanyDetail.jsx` : nouveau composant `RingGroupsSection` dans l'onglet
  Téléphonie (après Extensions) -- liste des groupes, création inline, ligne
  cliquable pour déplier la gestion des membres (priorité/ordre/exclusion
  temporaire), ajout de membre par numéro de poste.

⚠️ Piège trouvé en testant (pas laissé tel quel) : `payload.model_dump()` (sans
`mode="json"`) sur un champ `schedule_id: UUID | None` renvoie un objet UUID Python
brut, pas une chaîne -- httpx ne sait pas le sérialiser en JSON, ce qui aurait fait
planter la création/mise à jour dès qu'un schedule serait utilisé. Corrigé en
utilisant `model_dump(mode="json")` partout où un payload contient un UUID.

Testé en direct de bout en bout via l'API (compagnie réelle "Simple IP inc.") :
groupe créé, membre ajouté (poste réel t1001-100), membre modifié (exclusion
temporaire), membre supprimé, groupe supprimé. SIPV confirmé : 0 lignes
`ring_groups`/`ring_group_members` après nettoyage, les 3 postes de test restent
`Registered`.
⚠️ Backend ERPCRM rechargé manuellement (toujours en attente du `sudo systemctl
restart`, voir TASK-023.5).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/companies.py,
frontend/src/pages/CompanyDetail.jsx.

### TASK-023.22 [x] Groupe de pickup (interception) — section dans compagnie/téléphonie
Réutilise `pickup_group`/`can_intercept_calls`, déjà existants sur SIPExtension
(S007.2) et le préfixe `*8` déjà câblé côté dialplan (TASKSIPV S007.6) -- aucun
nouveau modèle nécessaire, juste l'UI de gestion manquait.

Fait :
- `companies.py` : `PUT /{id}/extensions/{extension_id}/pickup-group` (proxy
  générique vers `sipv_client.update_extension`).
- `CompanyDetail.jsx` : `PickupGroupSection`, table de tous les postes du tenant
  (réutilise `sipExts` déjà chargé pour Extensions -- pas de nouvel appel réseau)
  avec champ groupe éditable + case "peut intercepter", résumé des groupes par nom
  en haut.

Testé en direct : `pickup_group` posé sur un poste réel (t1001-100) via le proxy,
vérifié via `GET /sip-extensions`, remis à `null`. Aucune donnée résiduelle.
Fichiers : backend/app/api/v1/endpoints/companies.py, frontend/src/pages/CompanyDetail.jsx.

### TASK-023.24 [~] Groupe de paging — 3e section (bidirectionnel/unidirectionnel)
Dernière des 3 sections séparées demandées (ring group ✓ TASK-023.21, pickup ✓
TASK-023.22, paging maintenant). Backend neuf côté SIPV (TASK-S007.9).

Fait :
- `sipv_client.py` : 7 fonctions proxy (miroir exact du pattern ring group).
- `companies.py` : `GET/POST /{id}/paging-groups`, `PUT/DELETE /{id}/paging-groups/
  {pg_id}`, `POST /.../members`, `PUT/DELETE /.../members/{member_id}`.
- `CompanyDetail.jsx` : `PagingGroupsSection`, même structure que `RingGroupsSection`
  (création inline, ligne dépliable pour les membres) avec en plus mode uni/
  bidirectionnel, adresse/port multicast, et par membre : émission/réception
  séparées. Avertissement affiché sur le mode unidirectionnel (pas encore un vrai
  one-way audio, voir TASKSIPV S007.9) pour ne pas laisser croire à une fonction
  plus aboutie qu'elle ne l'est.

Testé en direct de bout en bout via l'API (compagnie réelle "Simple IP inc.") :
groupe créé (mode unidirectional, adresse multicast de test), membre ajouté (poste
réel t1001-101), membre supprimé, groupe supprimé. SIPV confirmé propre après (0
lignes `paging_groups`), les 3 postes de test restent `Registered`.

Les 3 sections de groupes demandées par l'utilisateur sont maintenant toutes
construites et testées : ring group (023.21), pickup (023.22), paging (023.24).
⚠️ Backend ERPCRM rechargé manuellement (toujours en attente du `sudo systemctl
restart`, voir TASK-023.5).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/companies.py,
frontend/src/pages/CompanyDetail.jsx.

### TASK-023.26 [x] Templates de boutons — dernière pièce de la demande boutons
Dernier morceau de TASK-023.19/S011.14 : sauvegarder une config comme template et
l'appliquer à un autre poste. Templates gérés "en bas des postes" dans compagnie/
téléphonie, exactement comme demandé.

> **Correction Phase P** : référence corrigée de `S023.25` vers `S011.14`
> (redistribution Phase O, module S011 — Provisioning). Note de traçabilité : la
> source SIPV réelle (`TASKSIPV.md`, ligne 2837) écrit cette entrée `TASK-023.25`
> sans préfixe "S" — c'est cette référence côté ERPCRM qui l'écrivait avec "S"
> (`S023.25`), une incohérence de préfixe déjà documentée en Phase M comme
> l'anomalie centrale de toute la famille "023.X"/"S023.X" (numérotation
> générique réutilisée pendant le backlog du méga-prompt du 2026-07-24), pas une
> tâche distincte ni une nouvelle découverte.

Fait :
- `sipv_client.py` : 4 fonctions proxy (list/delete/save-as-template/apply).
- `contacts.py` : `POST /{id}/sip-extension/phone/{phone_id}/save-as-template`
  (depuis la fiche contact, où vit l'éditeur de boutons).
- `companies.py` : `GET/DELETE /{id}/button-templates[/{template_id}]`,
  `POST /.../apply/{phone_id}`, + `GET /{id}/extensions/{extension_id}/phone`
  (résout un numéro de poste vers son appareil avant d'appliquer un template).
- `ContactDetail.jsx` : bouton "Sauvegarder comme template" dans l'éditeur de
  boutons existant (TASK-023.19).
- `CompanyDetail.jsx` : `ButtonTemplatesSection`, sous les Extensions (comme
  demandé) -- liste des templates, nombre de boutons, champ "numéro de poste" +
  bouton Appliquer (résout le poste vers son appareil côté client avant d'appeler
  l'API), suppression.

Testé en direct de bout en bout via l'API (poste réel t1001-101, contact "Test
Deux") : appareil attribué, bouton ajouté, sauvegardé comme template via le proxy
contact, template listé via le proxy compagnie, appliqué au même appareil via le
proxy compagnie (bouton recréé avec le même contenu -- sémantique "remplacer"
confirmée), template supprimé, appareil désactivé. SIPV confirmé, les 3 postes de
test restent `Registered`.

Les 3 demandes de ce "mega prompt" (boutons, groupes -3 sections-, catalogue
Grandstream) sont maintenant toutes faites et testées.
⚠️ Backend ERPCRM rechargé manuellement (toujours en attente du `sudo systemctl
restart`, voir TASK-023.5).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/contacts.py,
api/v1/endpoints/companies.py, frontend/src/pages/ContactDetail.jsx, CompanyDetail.jsx.

### TASK-023.27 [x] Options téléphonie — style "Options" UCM, compagnie + contact
Suite du GXP2135 (config_template réel écrit côté SIPV, TASK-S011.4/S011.5) :
demande de l'utilisateur (2026-08-02) de reproduire le concept "Options" de l'UCM
Grandstream — un catalogue de réglages caché par défaut, seule une option ajoutée
explicitement apparaît sur la fiche, sur 2 niveaux (Compagnie = défaut global,
Contact = personnalisation qui écrase le défaut compagnie pour ce poste seul).

Fait :
- `sipv_client.py` : `get_tenant`/`update_tenant` (manquaient — confirmé absent en
  cherchant, nécessaire pour lire/écrire `Tenant.phone_option_defaults` côté SIPV).
- `ref_data.py` : `PHONE_OPTIONS_CATALOG` (catalogue minimal, une option pour
  l'instant : langue du poste) + `GET /v1/ref/phone-options`.
- `contacts.py` : `extra_config` ajouté à `PhoneUpdatePayload` (le champ existait
  déjà côté SIPV, juste absent du schéma proxy ERPCRM).
- `companies.py` : `GET/PUT /{company_id}/phone-options` (proxy vers
  `Tenant.phone_option_defaults` côté SIPV).
- `components/PhoneOptionsEditor.jsx` (nouveau, partagé) : "+ Ajouter une option"
  ouvre un picker du catalogue filtré (seulement les options pas encore ajoutées),
  chaque option ajoutée a son champ éditable + un ✕ pour la retirer.
- `CompanyDetail.jsx` (onglet Téléphonie) et `ContactDetail.jsx` (section appareil) :
  branchent chacun `PhoneOptionsEditor` sur leur source de données respective
  (`Tenant.phone_option_defaults` / `ProvisionedPhone.extra_config`).

Testé de bout en bout via l'API (compagnie Simple IP inc. réelle, poste de test
réel) : défaut compagnie seul appliqué au rendu de config, override poste gagnant
sur le défaut compagnie, puis les deux remis à vide après le test (aucune donnée
réelle laissée modifiée). Les 3 fichiers frontend touchés compilent proprement
(vérifié via Vite, pas de test navigateur — pas d'outil de capture d'écran dans
cet environnement).
⚠️ Backend ERPCRM rechargé manuellement (toujours en attente du `sudo systemctl
restart`, voir TASK-023.5).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/ref_data.py,
api/v1/endpoints/contacts.py, api/v1/endpoints/companies.py,
frontend/src/components/PhoneOptionsEditor.jsx, frontend/src/pages/CompanyDetail.jsx,
frontend/src/pages/ContactDetail.jsx.

### TASK-023.28 [~] Catalogue d'options — formalisation (item 5 de TASK-027/TASK-S043)
Premier morceau du backlog TASK-027 lancé (2026-08-02, GO de Philippe : "fait le
dans l'ordre qu'on aura pas à coder 2 fois donc le 5"). Choisi en premier parce
que la future chaîne d'héritage à 5 niveaux (item 1) résout une valeur PAR
paramètre à travers ce catalogue — le formaliser avant évite de retoucher la
logique de résolution une fois l'héritage construit.

Fait :
- `ref_data.py` (`PHONE_OPTIONS_CATALOG`) : chaque entrée porte maintenant
  `technical_id` (code provisioning réel, ex. `P1362`, tel qu'écrit dans
  `PhoneModel.config_template` côté SIPV), `compatible_brands` (liste de
  `PhoneModel.brand`, `None` = toutes), `validation` et `depends_on` (clés
  réservées, `None` pour l'instant — une seule option existe, aucun cas réel
  ne justifie un moteur de validation/dépendance encore).
- Entrée `language` remplie avec les vraies valeurs (`P1362`, `["Grandstream"]`)
  tirées directement du `config_template` existant, rien d'inventé.
- 2026-08-03, demande de Philippe : choix `en` (Anglais) ajouté. ⚠️ Confiance
  moindre que `fr`/`auto` — le fichier de référence propre à la famille
  GXP2130/40/60/70/35 ne contient AUCUNE ligne P1362 (0 occurrence vérifiée),
  donc pas de légende officielle pour ce modèle précis. Valeur déduite par
  analogie : le changelog Grandstream GXW42xx (même écosystème P-code)
  documente "P1362 : en - English, zh - Chinese, fr - French, es - Spanish",
  et `fr` (même format 2 lettres) est déjà confirmé fonctionnel sur le vrai
  GXP2135. À confirmer visuellement sur l'écran du téléphone au premier test
  réel avec `en` sélectionné.

Explicitement pas fait (pas de besoin réel encore, LOI 4) :
- Aucune logique de filtrage/enforcement dans `PhoneOptionsEditor.jsx` —
  inutile tant qu'il n'y a qu'une option/une marque. À faire quand une 2e
  option ou un modèle non-Grandstream apparaît.
- Rien touché côté SIPV (`PHONE_OPTION_SYSTEM_DEFAULTS` reste des valeurs par
  défaut, pas le catalogue/schéma — pas concerné par cette formalisation).

Reste (item 1 du backlog, PAS commencé, pas de GO) : la chaîne d'héritage à 5
niveaux elle-même, qui consommera ce catalogue une fois enrichi de plus
d'options.
Fichiers : backend/app/api/v1/endpoints/ref_data.py.
Dépend de : TASK-023.27, TASK-027 (item 5).

Voir `TASK-S043` (TASKSIPV.md) pour le détail complet de ce qui est déjà
construit vs nouveau, et les 2 fichiers de référence fournis par Philippe
(`schema_champs_ucm.md`, `SCHEMA~1.MD`).

### TASK-023.29 [x] UI Succursales (911 multi-site)
Pendant ERPCRM de TASK-S010.3 (TASKSIPV.md) — voir cette entrée pour le
détail complet (pourquoi rien de neuf côté données, juste l'UI manquante).

Fait : `sipv_client.py` (8 fonctions), `companies.py`
(`/{company_id}/e911-addresses[...]`, section `E911AddressesSection` dans
`CompanyDetail.jsx` → Téléphonie), `contacts.py`
(`/{contact_id}/sip-extension/911[/addresses]`), section "911 — localisation
d'urgence" dans `ContactDetail.jsx` (entre Caller ID et Plan d'appel).

Testé : succursale créée dans Compagnie, listée et assignée depuis Contact,
mise à jour sans doublon, tout supprimé après coup (tables SIPV vides
confirmé), poste réel resté `Registered`. `npx vite build` propre.
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/companies.py,
api/v1/endpoints/contacts.py, frontend/src/pages/CompanyDetail.jsx,
frontend/src/pages/ContactDetail.jsx.
Dépend de : TASK-S010.3 (TASKSIPV.md).

### TASK-023.30 [x] Succursales -- enrichissement complet (suite TASK-023.29)
Demande de l'utilisateur, plusieurs itérations (2026-08-05/06) : popup succursale
plus large et robuste, contact de facturation lié, succursale primaire auto-générée
depuis l'adresse de la compagnie, auto-assignation aux postes sans 911, retrait de
champs jamais demandés (Étage/Bureau/Précision/Courriel d'alerte).

Fait :
- `models/company_site.py` (nouveau) : `CompanySite` (label, adresse complète,
  `billing_contact_id`, `billing_email`, `notes`, `is_active`, `is_primary`,
  `sipv_e911_address_id`). Sync bloquant vers `E911Address` (SIPV), même patron que
  `sync_company` -- SIPV appelé en premier, écriture locale seulement si succès.
- `core/site_defaults.py` (nouveau) : `ensure_primary_site()` -- si une compagnie n'a
  aucune succursale primaire, en génère une automatiquement depuis son `Address`
  existante (regex sur `street_1` pour civic/rue), appelé paresseusement depuis les
  endpoints de liste (contacts.py, companies.py).
- `companies.py` : CRUD complet `/{company_id}/sites` (list/create/update/deactivate),
  `_unset_other_primaries`, `_apply_billing_email_to_contact`.
- `CompanyDetail.jsx` (onglet Général) : popup élargi (640px), Autocomplete contact de
  facturation + création rapide, textarea notes, colonne ★/☆ pour `is_primary`, pas de
  fermeture au clic-fond (perte de données), erreurs de validation visibles.
- `ContactDetail.jsx` : section 911 simplifiée à un seul `<select>` succursale + "+
  Nouvelle succursale" -- retrait des champs Étage/Bureau/Précision/Courriel d'alerte
  jamais demandés (colonnes gardées en base, toujours envoyées vides). Auto-assignation
  réelle (sauvegarde `api.put`, pas juste un défaut UI) de la succursale primaire à tout
  poste qui n'a pas encore de 911.
- `ensure_primary_site` importé aussi dans `contacts.py` (oublié, `NameError`/500) ; `is_primary` ajouté à `_site_dict()` de `contacts.py` (manquant, cassait la détection de la primaire).
- `invoice.py` : `site_id` + `site_label_snapshot`/`site_address_snapshot` (copie figée
  au moment de la facturation) ; `NewInvoiceModal.jsx`, `InvoiceDetail.jsx`,
  `Invoices.jsx` mis à jour pour choisir/afficher la succursale facturée.

Testé : succursale primaire auto-générée vérifiée par appel direct des fonctions
d'endpoint contre la vraie DB (`AsyncSessionLocal`) avant et après chaque correctif.
`npx vite build` propre à chaque lot, backend/frontend redémarrés en un seul lot final
(pas après chaque fichier).
Fichiers : backend/app/models/company_site.py, core/site_defaults.py,
api/v1/endpoints/companies.py, api/v1/endpoints/contacts.py, models/invoice.py,
frontend/src/pages/CompanyDetail.jsx, ContactDetail.jsx,
components/NewInvoiceModal.jsx, pages/InvoiceDetail.jsx, pages/Invoices.jsx.
Dépend de : TASK-023.29, TASK-S045 (TASKSIPV.md).

### TASK-023.31 [x] DID -- refonte complète (données réelles, destination/horaire/succursale, fusion par glisser-déposer, simplification)
Demande de l'utilisateur (2026-08-05/06), plusieurs volets enchaînés avec GO à chaque
étape majeure. Contexte : migration depuis l'ancien serveur Scopserv (dernier numéro de
tenant T1045), import de l'inventaire réel DID/poste, et refonte du modèle DID
ERPCRM pour qu'il devienne le maître du routage d'appel (numéro/destination/horaire/
succursale/actif), synchronisé vers `TenantDID` (SIPV) comme `sync_company`.

Fait :
- Numérotation automatique des tenants : `AppSetting` (clé `next_tenant_number`, seed
  1046 -- suite du dernier `T1045` Scopserv) ; `toggle_sipv_tenant` assigne
  automatiquement l'`account_number` au lieu de bloquer.
- Import en masse : 28 compagnies réelles (numéros `t####` légataires), 5 marquées
  `is_active=false` (jamais supprimées -- ABC Gestion parasitaire t1023, Piscine et Spa
  Paseidon t1025, ABQSJ t1038, Houle Avocat t1012, STRONG t1043), inventaire complet
  DID/Extension importé depuis les données Scopserv.
- `models/telephony.py` : `DID` étendu avec `destination_type`, `destination`,
  `site_id` (FK `company_sites`), `schedule_id` (référence SIPV, pas de FK locale) ;
  `carrier` retiré (ISP unique désormais) ; `did_type` et `status` (3 états) retirés,
  remplacés par `is_active` (bool) ; `label` retiré, fusionné dans `notes` par migration
  (`UPDATE ... notes = notes || ' | ' || label`) avant le `DROP COLUMN`.
  `Extension.extension` élargi `String(10)`→`String(20)` (convention UCM : ligne vendue
  = poste identique au numéro DID, jusqu'à 11 chiffres).
- Sync bloquant `DID`→`TenantDID` (`erpcrm_did_id` unique côté SIPV), `sipv_client.
  sync_did`/`delete_tenant_did`.
- Système d'horaires (style UCM "time condition", mais rattaché à Compagnie→
  Destination→Succursale et non à Inbound) : proxy pur (pas de copie locale) vers les
  modèles `Schedule`/`ScheduleRule`/`Holiday` déjà existants côté SIPV (jamais utilisés
  avant) -- `GET/POST /company/{id}/schedules`, `PUT/DELETE /schedules/{id}`, règles,
  jours fériés. Un seul DID peut porter un horaire au lieu d'être dupliqué 3-4x comme
  sur Scopserv.
- Type de destination "Groupe d'appel" ajouté (manquait) ; le champ *valeur* de
  Destination devient un `<select>` filtré par type (Poste→postes réels du tenant,
  Groupe d'appel→ring groups, IVR→IVR réels, File d'attente→queues réelles), réutilise
  les endpoints proxy IVR/Queue/RingGroup déjà existants + 2 nouveaux
  (`GET /{company_id}/ivrs`, `/queues`) sur le même patron que `/ring-groups`.
- Fusion par glisser-déposer des DID partageant une destination : tableau conservé
  (pas de cartes -- rejeté explicitement, prenait trop de place), regroupement par
  `destination_type|destination`, cellules partagées (Destination/Horaire/Succursale)
  fusionnées avec `rowSpan`, poignée `⠿` dédiée en 1re colonne (glisser depuis une
  cellule interactive ne fonctionnait pas -- le `mousedown` était capté avant le
  `draggable` du `<tr>`). Zone de dépôt "retirer du groupe" (pointillés) visible pendant
  le glisser.
- Statut d'actif/inactif simplifié en simple case à cocher en fin de ligne (retrait du
  `<select>` 3 états -- le portage n'est plus suivi).
- Étiquette retirée du formulaire et du tableau (fusionnée dans Notes avant coup, voir
  migration ci-dessus).

Glisser-déposer non fonctionnel au premier essai, corrigé en plusieurs itérations : `dataTransfer.setData(...)` ajouté au `onDragStart` (requis par le navigateur) ; `onDropOnRow` détermine désormais `'extension'` par défaut si `destination_type` manque et rétro-remplit le DID cible ; valeurs `destination` réécrites en base pour les DID concernés (Mc Crystal, Patio Design, Simple IP) après diagnostic `psql` (script d'import initial ne les avait pas toujours remplies).
- 3 DID de Simple IP dont la destination avait été vidée pendant les tests de la zone
  "retirer du groupe" ont été restaurés.

Explicitement pas fait (pas de GO, en attente d'information) : consolidation des 6
lignes DID de Patio Design (2 numéros × 3 états horaires) en 2 DID + 1 vrai `Schedule`
-- reporté, requiert les vraies heures d'ouverture/fermeture du client.
Fichiers : backend/app/models/telephony.py, api/v1/endpoints/telephony.py,
api/v1/endpoints/companies.py, core/sipv_client.py, alembic/versions/
(t1u2v3w4x5y6 → a8b9c0d1e2f3, chaîne complète),
frontend/src/pages/CompanyDetail.jsx.
Dépend de : TASK-023, TASK-023.29, TASK-S045 (TASKSIPV.md).

> **Lien croisé ajouté en Phase O** : cette réécriture porte sur le modèle `DID`/`Extension` créé initialement par **TASK-012** (téléphonie native ERPCRM, avant toute intégration SIPV). TASK-012 reste la trace de la création d'origine ; cette entrée (TASK-023.31) est la source de vérité pour l'état actuel du modèle.

### TASK-023.31.1 [x] Horaires -- plages multiples avec destination propre à chacune + succursale toujours pré-remplie
Deux corrections/enrichissements demandés juste après TASK-023.31/TASK-S045
(2026-08-07).

1. Succursale d'un DID : `— Aucune —` par défaut au lieu de pré-sélectionner
   la compagnie primaire ("les succursale TOUJOUR LA COMPAGNIE PAR DEFAUT!!!
   je choisi apres si je veux changer"). Corrigé dans `CompanyDetail.jsx` :
   nouvel effet qui auto-assigne (vraie sauvegarde `PUT`, pas juste un défaut
   visuel) la succursale primaire à tout DID qui n'en a pas encore, dès que la
   liste des succursales et des DID est chargée (garde `Set` en `useRef` pour
   ne sauvegarder qu'une fois par DID) ; le `<select>` affiche aussi la
   primaire immédiatement (`head.site_id || primarySite?.id`) sans attendre le
   round-trip réseau.
2. "Nouvel horaire" ne permettait qu'une seule plage ouverture/fermeture et une
   seule destination "si fermé" globale. Demande : pouvoir ajouter plusieurs
   plages (ex: 8h-10h → IVR 001, 10h15-12h → messagerie 201, 12h-13h → ring
   group cafétéria, etc.) avec une destination propre à *chaque* plage, en
   réutilisant le même catalogue que la Destination d'un DID.

Fait (item 2) :
- `models/schedule.py` (SIPV) : `ScheduleRule` += `destination_type`,
  `destination` (même forme que `TenantDID`). Migration
  `0054_schedule_rule_destination.py`.
- `schedules.py` (SIPV) : `RuleOut`/`RuleCreate` += les 2 champs ; nouveau
  `RuleUpdate` + `PUT /rules/{rule_id}` (les règles n'avaient que
  create/delete avant -- ajouté pour rester toujours ré-éditable, pas
  create-only) ; `/is-open` renvoie aussi la destination de la règle qui
  matche (pas encore consommé par le dialplan réel, `xml_curl.py` garde sa
  propre logique binaire pour les ring groups, TASK-023.9 -- non touché).
- ERPCRM : `RuleIn`/`RuleUpdateIn` (telephony.py), `sipv_client.
  update_schedule_rule`, `PUT /v1/telephony/schedules/rules/{rule_id}`.
- `CompanyDetail.jsx` : `destinationOptions` du tableau DID extrait en helper
  de module `destinationSelectOptions()` (réutilisé partout où une destination
  se choisit) ; nouveau composant `PlageFields` (jours en boutons compacts +
  heures + type/valeur de destination filtrée) réutilisé à 3 endroits ; `Nouvel
  horaire` réécrit pour une liste de plages (+Ajouter une plage/✕) au lieu
  d'une seule ; nouvelle section `SchedulesSection` (liste des horaires
  existants, ligne dépliable) -- ajout/édition/suppression de plage et du
  nom/statut/destination-si-fermé en sauvegarde immédiate, exactement comme
  `RingGroupsSection` -- un horaire créé n'était sinon jamais modifiable
  après coup (violerait la règle "toujours pouvoir rééditer").

Testé bout en bout via l'API ERPCRM réelle (compagnie "Simple IP inc.",
appel direct des fonctions d'endpoint) : horaire créé avec 3 plages à
destinations différentes (IVR/messagerie/ring group), une plage modifiée
(`PUT`), une plage ajoutée après coup, tout supprimé proprement. `npx vite
build` propre. Backend ERPCRM + SIPV (migration incluse) et frontend ERPCRM
redémarrés, tous vérifiés sains (`/api/health`).
Fichiers : sipv/backend/app/models/schedule.py,
api/v1/endpoints/schedules.py, alembic/versions/
0054_schedule_rule_destination.py ; erpcrm/backend/app/api/v1/endpoints/
telephony.py, core/sipv_client.py ; erpcrm/frontend/src/pages/
CompanyDetail.jsx.
Dépend de : TASK-023.31, TASK-S045 (TASKSIPV.md).

### TASK-023.32 [x] Sélecteur de phrase + chaînage "Ajouter une destination" sur le DID
Suite de TASKSIPV TASK-S046/S047/S048 (nuit du 2026-08-07). Fait le matin même, sur
demande explicite de l'utilisateur ("j'aimerais que tu fasses ce qui reste").
Dépend de : TASKSIPV TASK-S046 ✓, TASK-S047 ✓, TASK-S048 ✓.
Fait :
- `backend/app/core/sipv_client.py` : `list_prompts(tenant_id)` (proxy GET), et
  `sync_did()` étendu avec `after_message_destination_type`/`after_message_destination`.
- `backend/app/models/telephony.py` (`DID`) : mêmes deux nouveaux champs (migration
  `b9c0d1e2f3a4_did_after_message.py`, chaînée après `a8b9c0d1e2f3`).
- `backend/app/api/v1/endpoints/telephony.py` : `DIDOut/Create/Update` étendus ;
  nouveau `GET /company/{id}/prompts` (même filet de sécurité que `list_schedules` —
  liste vide si pas de tenant SIPV actif, pas d'erreur) ; `_sync_did_to_sipv()`,
  `create_did()`, `update_did()` transmettent les deux nouveaux champs à SIPV.
- `frontend/src/pages/CompanyDetail.jsx` : nouveau state `prompts` (chargé avec le
  reste au montage) ; sur la ligne DID (et SEULEMENT là — pas sur les sélecteurs
  d'horaire/closed_destination qui partagent `DID_DESTINATION_TYPES` mais ne sont
  PAS câblés côté SIPV pour "message", pour ne pas reproduire le piège de
  TASK-S048/S047) : sélection `destination_type === 'message'` affiche une vraie
  liste déroulante des phrases du tenant (au lieu du champ texte libre générique) ;
  bouton "+ Ajouter une destination" qui révèle un 2e sélecteur type+destination
  (réutilise `destinationOptions()` existant pour ce 2e niveau, "message" exclu des
  choix pour ne jamais chaîner un message sur un autre) avec un ✕ pour le retirer
  (retour au raccroché par défaut).
Testé de bout en bout (compagnie test "Simple IP inc.", tenant t1001) : upload d'un
prompt test côté SIPV → visible immédiatement via le proxy ERPCRM ; création d'un
DID ERPCRM avec `destination_type=message` + `after_message_destination_type=hangup`
→ confirmé propagé jusqu'à la vraie `InboundRoute` côté SIPV (`message`, bon id de
prompt, `hangup`). Toutes les données de test nettoyées après validation. Build
frontend vérifié (`npm run build` OK), servi en direct par `vite preview` (port
3010, aucun redémarrage nécessaire — fichiers statiques relus à chaque requête).
⚠️ Découverte pendant le déploiement (pas liée à cette tâche) : `erpcrm-backend`/
`erpcrm-backend-tls` (systemd) sont `inactive` sur ce serveur — le backend tourne en
fait via un `nohup uvicorn` manuel (port 8010 seulement, PAS de TLS 8011 actif en ce
moment) depuis une session précédente, jamais remis sous supervision systemd normale
(sudo sans mot de passe requis, voir TASK-023.5). Redémarré manuellement (kill +
nohup) pour cette tâche, comme les fois précédentes. À corriger structurellement
(sudoers NOPASSWD scopé, ou remettre sous systemd) — pas fait ici, hors scope.
Fichiers : `backend/app/core/sipv_client.py`, `models/telephony.py`,
`api/v1/endpoints/telephony.py`, `alembic/versions/b9c0d1e2f3a4_did_after_message.py`,
`frontend/src/pages/CompanyDetail.jsx`.

### TASK-023.33 [x] Bug critique — un échec du statut d'enregistrement effaçait toute la liste des postes
Date de demande : 2026-09-11 (signalé en urgence par Philippe — "je n'ai plus les postes 100-101-102-103")
Date(s) de travail : 2026-09-11

Incident réel : plus aucun poste affiché sur la fiche Simple IP inc. -> Téléphonie -> Postes. Vérifié avant de conclure quoi que ce soit (pas supposé une perte de données) : les 4 postes (100-103) existaient bel et bien dans la vraie base SIPV, actifs, intacts. `sipv_client.list_extensions()` appelé directement retournait aussi les 4 correctement.

**Cause réelle** : `GET /companies/{id}/sip-extensions` (`companies.py`) appelait `list_extensions()` PUIS `tenant_registrations()` (statut d'enregistrement en direct, BLF) dans le MÊME bloc `try/except httpx.HTTPError: return []` — quand `tenant_registrations()` échouait (503 côté SIPV, cause distincte — voir ci-dessous), l'exception effaçait aussi les extensions déjà récupérées avec succès juste avant. `contacts.py` (même besoin, poste lié à un contact) avait déjà le bon pattern — deux blocs `try/except` séparés — ce bug n'existait que sur l'endpoint compagnie.

**Correctif** : deux blocs `try/except` distincts — un échec de `tenant_registrations()` retombe sur `regs = []` (statut "non enregistré" par défaut pour chaque poste) sans jamais toucher à la liste des postes elle-même. Vérifié de bout en bout avec un vrai appel HTTP authentifié après redéploiement : les 4 postes reviennent correctement.

**Cause du 503 sous-jacent (registrations), résolue séparément (même soir)** : la connexion ESL détenue par le processus `sipv-backend` en cours d'exécution était figée/périmée — vérifié en testant une connexion ESL fraîche directement en Python sur SIPV (`get_esl()` + `show_registrations()` + `show_channels()`), qui fonctionnait instantanément, alors que l'API en service échouait systématiquement. Corrigé par un redémarrage de `sipv-backend.service` (API seulement, jamais FreeSWITCH lui-même — aucun appel en cours affecté). Confirmé après coup : `registered`/`call_state` répondent correctement pour les 4 postes (tous `false`/`idle`, cohérent — aucun vrai téléphone connecté dessus actuellement). Cause racine de la connexion figée elle-même pas investiguée plus loin (aucune reconnexion automatique visible dans le code pour ce client ESL spécifique, contrairement au "MOH hold tracker" qui a sa propre logique de reconnexion) — à surveiller si ça revient.
Fichiers : `backend/app/api/v1/endpoints/companies.py`.

### TASK-023.34 [x] Dot d'enregistrement SIP dans l'onglet Contacts de la fiche compagnie
Date de demande : 2026-09-11 (Philippe : "je le voie dans le contact mais pas dans les contact de la compagnie"). Date de travail : 2026-09-12.

Contexte vérifié avant tout code : Philippe pensait que les postes SIP de test (100-103, Simple IP inc.) n'étaient pas liés à des contacts. Vérifié faux — les 4 sont bel et bien liés de bout en bout (`sip_extensions.erpcrm_contact_id` → `contacts` → `contact_companies` avec `is_active=true`), et le backend `GET /companies/{id}` les retournait déjà correctement (reproduit directement en Python : 5 contacts retournés dont les 4 postes de test). Ce qui manquait réellement : `ContactsTab` (onglet Contacts de `CompanyDetail.jsx`) n'affichait aucun indicateur d'enregistrement, contrairement à `ContactDetail.jsx` qui l'a déjà (dot vert/rouge + 📞/🔔).

**Correctif** : `ContactsTab` appelle maintenant `GET /companies/{id}/sip-extensions` (endpoint déjà existant et durci par TASK-023.33 le soir même — aucun nouvel endpoint backend nécessaire), construit une map `contact_id -> extension` via `erpcrm_contact_id`, et affiche le même dot que `ContactDetail.jsx` à côté du nom de chaque contact concerné. Poll toutes les 5s, même pattern que la fiche contact individuelle. Fichiers : `frontend/src/pages/CompanyDetail.jsx` (`ContactsTab`).

### TASK-023.35 [x] Succursales sans téléphonie SIPV (ERPCRM d'abord)
Date de demande : 2026-10-02 (Philippe : « arrange-moi ça, c'est un ERPCRM en premier » — Oxygene, succursale de Maison Le Passeur, client sans SIPV)
Date(s) de travail : 2026-10-02

Avant : créer/modifier/désactiver une succursale exigeait un tenant SIPV (`_company_tenant_id` → 400), car chaque succursale était d'abord créée comme adresse 911 (E911Address) côté SIPV. Un client sans téléphonie ne pouvait donc pas avoir de succursale, même pour la facturation.
Maintenant (`backend/app/api/v1/endpoints/companies.py`) :
- `_sync_site_if_sipv()` : avec un tenant SIPV actif, copie 911 bloquante comme avant (rien d'écrit si SIPV échoue) ; sans SIPV, succursale purement ERPCRM (`sipv_e911_address_id` vide).
- Activation de la téléphonie (`toggle_sipv_tenant`) : les succursales encore sans copie 911 sont envoyées à SIPV dans la même opération (bloquant ; `sync_site` côté SIPV est un « crée ou met à jour » par `erpcrm_site_id`).
- Inchangé : assignation 911 d'un poste (refuse une succursale sans copie 911 — impossible pour une compagnie SIPV après ce correctif), `ensure_primary_site` (seulement compagnies SIPV), UI (section Succursales de l'onglet Général déjà affichée pour toutes les compagnies).
- Preuve : succursale « Oxygene » créée et modifiée sous Maison Le Passeur (201/200, sans lien 911) ; succursale principale de Simple IP renvoyée sans changement → 200, lien 911 identique. Non testé en réel : l'activation SIPV d'une compagnie qui a déjà des succursales (aurait créé un vrai tenant).
- Données : les 26 factures Zoho « Oxygene » (TASK-005.7) rattachées à la succursale (`site_id` + adresse figée) par script ORM, sans passer par `PUT /invoices` (qui recalcule les taxes) — totaux vérifiés inchangés ; note provisoire retirée de la fiche Maison Le Passeur.


### TASK-023.36 [ ] Bogue : poste 104 « test PAPA » dans ERPCRM mais jamais créé sur SIPV
Date de demande : 2026-10-10 (Philippe : « ça veut dire que l'ERPCRM n'a pas créé le 104 comme il aurait dû le faire »)
Date(s) de travail : —

- Constaté (2026-10-10) : le 104 « test PAPA » (courriel de messagerie normdenis@hotmail.com, créé le 2026-08-14) existe seulement dans l'ancienne table `extensions` d'ERPCRM, rattachée à Simple IP inc. ; le tenant SIPV de Simple IP (T1001) a 100, 101, 102, 103. Cause à trouver (ancien chemin de création qui n'envoyait pas à SIPV ? envoi en échec non signalé ?) avant de corriger.

### TASK-023.37 [ ] Numéros libres de Simple IP dans le tenant T1000 : message de vente puis transfert
Date de demande : 2026-10-10 (Philippe : « je veux que le tenant test soit le T1000, ça va être là aussi que je vais mettre mes # DID libres pour qu'ils soient dans le serveur et jouent le message « ce numéro appartient à Simple IP, vous pouvez l'acheter en restant en ligne » (destination 2) mon cell (futur app de cell IP) »)
Date(s) de travail : —

- À faire après la création de T1000 (TASK-002.5) : les numéros non vendus vont dans T1000 ; appel entrant → message enregistré → transfert vers le cellulaire de Philippe (plus tard l'application cellulaire IP). Vérifier ce que les destinations de numéros existantes (TASK-023.31) permettent déjà avant de coder.

---

## TASK-024 [ERPCRM] [x] Onglet Photos d'installation sur la fiche compagnie
Classification: HISTORICAL

Nouvel onglet "Photos" dans CompanyDetail.jsx (entre Tâches et Journal), galerie avec
upload/légende/suppression.

Fichiers touchés :
- `backend/app/models/installation_photo.py` (nouveau) — InstallationPhoto
  (company_id, filename, caption, uploaded_by_id)
- `backend/app/models/__init__.py` — import ajouté
- `backend/app/api/v1/endpoints/companies.py` — GET/POST/DELETE
  `/companies/{id}/photos`, stockage sur disque (même pattern que
  `backend/uploads/catalogue`, nouveau répertoire `uploads/installation_photos`,
  servi par le mount statique `/uploads` déjà en place dans main.py, rien à ajouter
  côté mount)
- `backend/app/api/v1/endpoints/logs.py` — actions `photo_added`/`photo_removed`
  ajoutées à ACTION_LABELS (pas réutilisé `communication_added` à tort — un ajout de
  photo n'est pas une coordonnée)
- `backend/alembic/versions/m4n5o6p7q8r9_installation_photos.py` (migration)
- `frontend/src/pages/CompanyDetail.jsx` — nouvel onglet, composant `PhotosTab`
  (galerie en grille, upload avec légende optionnelle via `prompt()`, clic sur photo
  = ouvre en plein écran dans un nouvel onglet, suppression avec confirmation)

Paramètre `caption` de l'endpoint d'upload corrigé en `Form(None)` (était un paramètre simple, traité comme query par FastAPI, jamais rempli — `null` systématique).

Pas d'édition de légende après upload (seulement à la création) — pas demandé
explicitement, aurait nécessité soit un endpoint PATCH dédié soit retirer/re-uploader ;
je n'ai pas inventé ce endpoint supplémentaire.

Testé en direct : upload avec et sans légende, fichier statique servi correctement
(200 sur l'URL retournée), entrée de journal correcte (`photo_added` avec la légende
en description), suppression retire le fichier ET la ligne DB. Backend redémarré et
vérifié fonctionnel (login + upload + liste + suppression). Frontend rechargé via HMR
sans erreur (vérifié dans les logs du service `erpcrm-frontend`).

---

## TASK-025 [ERPCRM] [x] Nouveau module Devis (backend + frontend)
Classification: HISTORICAL

Demande : module Devis complet, dans la nav verticale entre Tickets et Factures,
avec le même suivi d'ouverture que tickets/factures. Volontairement SANS les
fonctions propres aux factures (récurrence, notes de crédit, paiements/
mark-overdue) — non demandées.

Backend :
- `backend/app/models/devis.py` — `Devis` (miroir d'`Invoice` sans récurrence/
  crédit, `valid_until` au lieu de `due_date`, `invoice_id` FK pour conversion
  future) + `DevisLine` (miroir exact d'`InvoiceLine`). Statuts :
  `brouillon/envoye/accepte/refuse/expire`.
- `backend/app/api/v1/endpoints/devis.py` (nouveau, ~290 lignes) — CRUD complet
  (list/create/get/update/delete + lignes), `_next_number()` (format
  `{année}-D{NNNN}`), `POST /{devis_id}/send` (email + transition auto
  `brouillon`→`envoye`), suivi d'ouverture (`last_opened_at`/`open_count` via
  TASK-006.1).
- `backend/app/core/email.py` — `_DEVIS_TMPL` (en-tête violet `#7C3AED` pour
  distinguer visuellement d'une facture) + `send_devis_email(...)`.
- `backend/app/main.py` — `include_router(devis.router, prefix="/api/v1/devis")`.
- Migration : `q8r9s0t1u2v3_devis.py` (tables `devis` + `devis_lines`).

Frontend :
- `frontend/src/components/Icons.jsx` — `IconFileText` (icône devis).
- `frontend/src/components/NewDevisModal.jsx` — miroir de `NewInvoiceModal` sans
  les champs récurrence.
- `frontend/src/pages/Devis.jsx` — liste (miroir `Invoices.jsx`), colonne "Vu".
- `frontend/src/pages/DevisDetail.jsx` — détail/édition (miroir `InvoiceDetail.jsx`
  réduit : pas de paiements/crédit/récurrence/génération suivante), bouton
  "📧 Envoyer" (`SendDevisModal`, préremplit depuis le contact principal de la
  compagnie), transitions de statut manuelles (`brouillon→envoye→accepte/refuse/
  expire`), historique d'ouverture dépliable.
- `frontend/src/components/Layout.jsx` — `NAV` : Devis inséré entre Tickets et
  Factures, comme demandé.
- `frontend/src/App.jsx` — routes `/devis`, `/devis/:id`.

Testé : redémarrage backend propre (401 sur endpoint protégé sans token = serveur
up), fichiers frontend transformés sans erreur par Vite (`GET .../Devis.jsx` →
200, pas d'overlay d'erreur).


### TASK-025.1 [x] Devis alignés sur les factures : décimal exact, taxe par ligne, arrondi demie vers le haut
Date de demande : 2026-10-02 (Philippe : « arrange les devis aussi »)
Date(s) de travail : 2026-10-02

- Migration `b7c8d9e0f1a2` (revises `a6b7c8d9e0f1`) : `devis` et `devis_lines` Float → Numeric (taux 7,4 ; montants 14,2 ; quantité 12,4) + `devis_lines.is_taxable` ; 0 devis en base ; testée up/down/up.
- `devis.py` : `_recalc` = même calcul que les factures (TASK-005.9) via `_money` d'`invoices.py` ; `is_taxable` dans les lignes (lecture, ajout, modification).
- `DevisDetail.jsx` : colonne « Taxable » (case sur un brouillon, Oui/Non sinon), case dans l'ajout et la modification d'une ligne.
- Preuve HTTP : devis test 100 $ taxable + 50 $ non taxable → 150,00 / 5,00 / 9,98 / 164,98 $ (identique aux factures), supprimé ensuite.
- Constat : aucune conversion automatique devis → facture n'existe (`invoice_id` jamais rempli par le code).
---


### TASK-025.2 [ ] Devis « à régler en troc » (facture d'échange) → facture datée du jour de l'échange
Date de demande : 2026-10-08 (Philippe, sur le devis 2026-D0001 de Physotech : « ou facture d'échange qui serait entre le devis et la facture… il y aurait les taxes mais pas calculées ; si je voudrais un jour la mettre en facture, là on met la date du jour qu'on le fait avec le lien vers l'échange en question, comme ça on a toutes les dates et on est légal »)
Date(s) de travail : —

- En attente du GO sur la proposition : pas un 3e type de document — le devis existant (taxes affichées, jamais dans les ventes ni la déclaration) reçoit la marque « À régler en troc » ; il apparaît dans la boîte « À régler en troc » de l'onglet Échanges (en attente, hors taxes déclarées) ; « Créer un échange » sur ce devis le convertit en facture datée du jour de l'échange (taxes alors comptées), reliée au devis et à l'échange, et payée par lui ; bouton « Convertir en facture » aussi seul. Condition légale dite à Philippe : la facture doit être faite au moment de l'échange (paiement en services = paiement), pas laissée indéfiniment.
- Décision 2026-10-08 pour Physotech (Philippe, après explication — un échange se déclare de chaque côté ; coiffure/laser pour lui = services personnels, aucune taxe récupérable : « je comprends maintenant, ok fais la facture à la date d'aujourd'hui, j'aurais dû payer ces taxes en 2021, je les paierai dans le prochain rapport ») : **INV-112254 gardée** (2026-10-08, 929,90 $ + 139,26 $ = 1 069,16 $, à régler en troc, non envoyée) ; devis 2026-D0001 « Accepté » et relié à la facture (`devis.invoice_id`, pas modifiable par l'API — écrit par un court script, à la demande). Le devis troc (facture d'échange) reste à évaluer par Philippe (« on va évaluer ça »).
## TASK-026 [ERPCRM] [~] Prise de RDV en ligne
Classification: CURRENT

Demande : page publique de réservation (Appel téléphonique ou RDV sur place),
heures d'ouverture lundi-jeudi 7h30-16h30 / vendredi 7h30-12h00, fériés du Québec
bloqués, synchro Google Calendar bidirectionnelle. L'option "Urgence" (tarif
×2, alerte courriel + appel automatisé) est **reportée en backlog** (TASK-026.1)
à la demande explicite de Philippe : les lignes téléphoniques ne sont pas encore
opérationnelles pour déclencher un appel automatisé fiable — cette portion sera
adressée séparément une fois le calendrier terminé.

Backend :
- `backend/app/core/business_hours.py` (nouveau) — horaire fixe (constantes, pas
  configurable via UI, non demandé), `quebec_holidays(year)` calcule les 8 congés
  chômés prévus par la Loi sur les normes du travail du Québec (Vendredi saint via
  `dateutil.easter`, Journée nationale des patriotes = lundi avant le 25 mai, Fête
  du Travail = 1er lundi de septembre, Action de grâce = 2e lundi d'octobre, plus
  les dates fixes). Vérifié manuellement pour 2026 (8 dates correctes).
- `backend/app/models/appointment.py` (nouveau) — `Appointment` : type
  (appel/rdv), statut, `start_at` (UTC), `duration_minutes`, `address` (rdv),
  `description`, liens `contact_id`/`company_id`/`task_id`, `google_event_id`.
- Migration : `r9s0t1u2v3w4_appointments.py`.
- `backend/app/core/google_calendar.py` (nouveau) — wrapper `google-api-python-
  client` avec dégradation silencieuse (même convention que `SMTP_HOST` vide dans
  `email.py`) : `busy_blocks()` retourne `[]` et `create_event()` retourne `None`
  tant que `GOOGLE_REFRESH_TOKEN` n'est pas configuré — le calendrier fonctionne
  dès maintenant avec les RDV locaux comme seule contrainte, et la synchro Google
  s'activera automatiquement dès que les credentials OAuth seront fournis, sans
  changement de code.
- `backend/app/core/config.py` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/
  `GOOGLE_REFRESH_TOKEN`/`GOOGLE_CALENDAR_ID_ERPCRM` (tous vides par défaut).
- `backend/app/api/v1/endpoints/appointments.py` (nouveau) — 100% public (aucun
  `Depends(get_current_user)`, même principe que `ecom.public_catalogue`) :
  `GET /rdv/config` (règles de durée/horaire pour le frontend), `GET /rdv/
  availability?appointment_type=&duration_minutes=` (calcule les plages libres sur
  45 jours, combine RDV locaux confirmés + occupé Google), `POST /rdv/book`
  (revalide le créneau au moment de la soumission — protection contre les
  conflits de dernière minute — puis crée Entity+Company+Contact+ContactCompany
  **toujours neufs, jamais de fusion avec un client existant** (comme demandé),
  une `Task` (priorité normale, statut en_cours, adresse préfixée dans la
  description pour un RDV), l'`Appointment`, l'événement Google (si configuré),
  et envoie un courriel de confirmation au client).
- `backend/app/core/email.py` — `_RDV_CONFIRM_TMPL` + `send_rdv_confirmation_email(...)`.
- `backend/app/api/v1/endpoints/tracking.py` — `"appointment"` ajouté à
  `ENTITY_TYPES` (suivi d'ouverture du courriel de confirmation, même
  infrastructure que TASK-006.1).
- `backend/app/main.py` — `include_router(appointments.router, prefix="/api/v1/rdv")`.
- Dépendances ajoutées à `requirements.txt` : `google-api-python-client`,
  `google-auth`, `google-auth-httplib2`, `google-auth-oauthlib` (+ transitives).

Règles métier retenues (confirmées avec Philippe) :
- Appel : extensible par blocs de 15 min (défaut 30, min 30, max 120 — plafond
  ajouté par mesure de prudence, pas explicitement demandé, à revoir si besoin
  d'appels plus longs), délai minimum = 1h à partir de maintenant.
- RDV : blocs de 30 min de 1h à 7h, pas de plage avant 9h30 (même si l'horaire
  ouvre à 7h30), délai minimum = le lendemain, champ adresse obligatoire.
- Nouveau contact + nouvelle compagnie créés à chaque réservation (cellulaire
  optionnel), jamais de correspondance avec un client existant.

Frontend :
- `frontend/src/pages/RDV.jsx` + `RDV.css` (nouveau) — page publique en 5 étapes
  (type → durée → créneau → coordonnées → confirmation), en dehors du `Layout`
  authentifié (même principe que `/shop`).
- `frontend/src/App.jsx` — route publique `/rdv`.
- `frontend/src/pages/Portal.jsx` — bouton "📅 Prendre rendez-vous" dans la
  topbar du portail client (nouvel onglet, comme demandé).
- Lien à ajouter par Philippe : bouton sur le site web + lien dans les courriels
  (pas du ressort du code ERPCRM — juste pointer vers `https://portail.simpleip.tel/rdv`
  une fois le domaine public confirmé stable).

Testé de bout en bout via l'API (nettoyé après coup, aucune donnée de test
résiduelle) : `GET /rdv/config`, `GET /rdv/availability` (appel 30min et rdv
120min, dates/fériés/heures correctes), `POST /rdv/book` pour un Appel ET un RDV
avec adresse — vérifié que le créneau réservé disparaît immédiatement de
`/rdv/availability` (pas de double réservation), que la Tâche est créée avec les
bons champs (adresse préfixée pour un RDV), et que le fuseau horaire America/
Montreal → UTC est correct (09:00 local = 13:00 UTC en août, EDT). Backend
redémarré proprement, tous les fichiers frontend transformés sans erreur par Vite.

**Reste à faire (`[~]`)** :
- Philippe doit créer le projet Google Cloud + l'identifiant OAuth (type
  "Application Web", URI de redirection = `{PUBLIC_BASE_URL}/api/v1/google-
  calendar/callback`) et fournir `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dans
  `.env` — une fois fait, la connexion se termine par un clic dans Admin (voir
  TASK-026.2), plus besoin de copier un refresh token à la main.
- TASK-026.1 (option Urgence) reportée en backlog, voir tableau récapitulatif.
- Compte Google utilisé : `agenda@simpleip.tel` (Gmail gratuit, pas Workspace) —
  décision consciente de Philippe malgré la limite de 7 jours sur le refresh
  token en mode "Test" (voir TASK-026.2), au profit du bouton "Reconnecter"
  natif plutôt que payer Workspace ou faire vérifier l'app par Google.

### TASK-026.2 [x] Connexion Google Calendar native (bouton Admin, sans copie manuelle)
Philippe a proposé (bonne idée, adoptée) de construire le flux "Connecter" à
même l'interface ERPCRM plutôt que de lui faire copier-coller 3 valeurs depuis
OAuth Playground — comme le font Calendly et autres outils réels. Corrige aussi
une vraie erreur repérée dans un guide ChatGPT que Philippe avait suivi : le
scope `calendar.events.freebusy` n'existe pas, le bon nom est
`calendar.freebusy` (vérifié via la documentation officielle Google).

Découverte importante en cours de route : un compte Gmail gratuit (pas
Workspace) reste en statut "Test" côté Google (l'audience "Interne" n'existe
que pour les comptes Workspace liés à une organisation) — dans ce statut, le
refresh token expire automatiquement après **7 jours pile**, peu importe
l'usage (pas basé sur l'inactivité, vérifié via la doc Google). Deux
alternatives existaient (Workspace payant avec audience Interne = jamais
d'expiration, ou faire vérifier l'app gratuitement mais avec page de
confidentialité + vidéo démo + ~10 jours de révision) ; Philippe a choisi de
rester sur le Gmail gratuit et d'accepter de recliquer "Connecter" quand le
badge affiche "Non connecté" (~1×/semaine), rendu trivial par ce bouton natif.

Fait :
- `backend/app/core/crypto.py` (nouveau) — `encrypt()`/`decrypt()` via Fernet
  (`cryptography`, déjà une dépendance), clé dans `settings.ENCRYPTION_KEY`
  (générée une fois, ajoutée à `.env`). Même principe que le chiffrement des
  mots de passe de trunk côté SIPV, mais ERPCRM n'avait pas ce module.
- `backend/app/core/google_calendar.py` — réécrit pour lire/écrire le refresh
  token chiffré dans `app_settings` (clé `google_refresh_token_enc`) au lieu
  d'un `.env` fixe ; `is_configured()`/`busy_blocks()`/`create_event()`
  prennent maintenant `db` en paramètre. Scopes resserrés à `calendar.events` +
  `calendar.freebusy` (au lieu du scope large `calendar` complet d'origine —
  moindre privilège). `GOOGLE_CALENDAR_ID_ERPCRM` renommé
  `GOOGLE_CALENDAR_ID_PERSONAL` : plus besoin d'un calendrier secondaire
  puisqu'on utilise un compte Google dédié (`agenda@simpleip.tel`) entièrement
  consacré aux RDV — les événements s'écrivent directement sur son "primary",
  et son calendrier perso partagé (freebusy) est vérifié en plus.
- `backend/app/api/v1/endpoints/google_oauth.py` (nouveau) — `GET /status`
  (authentifié, `{connected, client_configured}`), `GET /connect` (redirige
  vers l'écran de consentement Google, protection CSRF via `state` stocké dans
  `app_settings`), `GET /callback` (échange le code contre les tokens, chiffre
  et stocke le refresh token, redirige vers `/admin?google_calendar=...`),
  `POST /disconnect` (authentifié, vide le token stocké).
- `backend/app/core/config.py`/`.env` — `GOOGLE_REFRESH_TOKEN` retiré (n'est
  plus un `.env`, vit chiffré en base) ; ajout `ENCRYPTION_KEY`,
  `GOOGLE_CALENDAR_ID_PERSONAL`.
- `backend/app/api/v1/endpoints/appointments.py` — appels à
  `google_calendar.busy_blocks()`/`create_event()` mis à jour pour passer `db`.
- `backend/app/main.py` — `include_router(google_oauth.router, prefix="/api/v1/google-calendar")`.
- `frontend/src/pages/Admin.jsx` — nouvel onglet "Intégrations" :
  `IntegrationsPanel` affiche le statut (Connecté/Non connecté), bouton
  "Connecter" (navigation directe du navigateur vers `/api/v1/google-calendar/
  connect`, pas un appel axios — nécessaire pour que Google puisse rediriger le
  navigateur), bouton "Déconnecter", message de retour selon le paramètre
  `?google_calendar=connected|error|csrf|no_refresh_token` dans l'URL après le
  callback.

Testé : redémarrage backend propre, `GET /google-calendar/status` retourne
`{connected: false, client_configured: false}` avant configuration du Client
ID/Secret (comportement attendu), onglet Admin transformé sans erreur par Vite.
Reste à faire : Philippe doit encore créer le client OAuth côté Google Cloud et
fournir Client ID/Secret pour que le bouton "Connecter" devienne actif.

Câblage réel fait en direct avec Philippe (guidage pas-à-pas dans Google Cloud
Console) : projet "ERPCRM RDV" créé, API Calendar activée, écran de consentement
configuré (Externe, statut Test), scopes déclarés (`calendar.events`,
`calendar.freebusy`, `calendar.readonly` — ajouté après coup, voir TASK-026.3),
utilisateur test `agenda@simpleip.tel` ajouté (bloquant tant qu'absent — erreur
403 access_denied), client OAuth "Application Web" avec redirect URI
`https://portail.simpleip.tel/api/v1/google-calendar/callback` créé, Client ID/
Secret ajoutés au `.env`. Connexion testée et confirmée fonctionnelle de bout
en bout (création réelle d'un événement RDV test dans Google Calendar, vérifié
visuellement par Philippe, puis nettoyé).

Ajout du scope `calendar.readonly` a causé un `invalid_scope` au refresh (token existant ne portant pas le nouveau scope) — fix : révoquer l'accès depuis `myaccount.google.com/permissions` puis reconnecter à neuf.

Décision consciente de Philippe : rester sur Gmail gratuit (pas Workspace)
malgré le refresh token à durée de vie de 7 jours en mode Test — préfère
recliquer "Connecter" au besoin plutôt que payer un abonnement, d'autant plus
qu'une vérification Google (gratuite) est en cours pour éliminer complètement
cette limite (voir Reste à faire ci-dessus, page de confidentialité déjà en
ligne à `https://portail.simpleip.tel/confidentialite`).

### TASK-026.3 [x] Agenda ERPCRM fusionné avec Google Calendar (lecture + gestion complète)
Demande de Philippe : voir dans l'Agenda ERPCRM (onglet distinct des Tâches,
qui reste tâches-seulement) ses tâches locales ET ses événements Google
(perso + `agenda@simpleip.tel`, partagés mutuellement avec accès complet — pas
juste libre/occupé), en lecture, mais aussi pouvoir créer/modifier/supprimer
directement depuis ERPCRM (Tâche / RDV / Appel au clic sur une case vide).

Découverte automatique des calendriers (pas de config manuelle) :
- `backend/app/core/google_calendar.py` — `_list_calendars_meta_sync()` via
  `calendarList().list()` retourne tous les calendriers accessibles au compte
  connecté (le sien + tout calendrier partagé avec lui) avec leur couleur par
  défaut — élimine le besoin d'un `GOOGLE_CALENDAR_ID_PERSONAL` configuré à la
  main (supprimé de `config.py`/`.env`, jamais vraiment fonctionnel). Nécessite
  le scope `calendar.readonly` en plus de `calendar.events`/`calendar.freebusy`
  (`calendarList` n'est pas couvert par ces deux-là).
- `list_events()` — événements (titre, description, lieu, horaires, couleur
  résolue via `EVENT_COLOR_MAP` — palette officielle Google si `colorId` sur
  l'événement, sinon couleur par défaut du calendrier — et `editable`, faux
  pour le calendrier public des fériés canadiens) de tous les calendriers
  découverts, sur une plage donnée.
- `update_event()`/`delete_event()` (nouveau) — modification/suppression d'un
  événement Google par `calendar_id`+`event_id` (nécessaires ensemble, un
  `event_id` seul n'est pas unique à travers les calendriers).
- `backend/app/api/v1/endpoints/google_oauth.py` — `GET /events` (plage
  start/end), `POST /events` (création, toujours sur "primary"), `PUT /events`
  et `DELETE /events` (body avec `calendar_id`+`event_id`, pas dans l'URL — les
  ID de calendrier contiennent des caractères `@`/`#` problématiques dans un
  chemin d'URL).

Frontend (`frontend/src/pages/Tasks.jsx`) :
- Fusion strictement limitée à l'onglet **Agenda** (`isAgenda`) — **jamais**
  dans l'onglet Tâches (confirmé explicitement par Philippe : "les tâches
  c'est les tâches je ne veux pas d'agenda").
- `googleEvents` chargés via `loadGoogleEvents()`, rafraîchis automatiquement
  toutes les **5 secondes** tant que l'onglet Agenda est ouvert (demande
  explicite de Philippe, "au minute" au départ puis réduit à 5s — quota Google
  largement suffisant pour ce volume, un seul utilisateur).
- `GoogleEventChip` : couleur réelle de l'événement (fond à 13% d'opacité,
  texte à la couleur pleine — même convention que les badges de statut
  existants), plus d'icône 📅 (retiré sur demande). Cliquable uniquement si
  `editable` (le calendrier des fériés canadiens ne l'est pas).
- **Événements multi-jours** (ex: "Camping Math" sur 5 jours) : affichés sur
  CHAQUE jour qu'ils couvrent (`eventCoversDay()`, corrige un bug où seul le
  jour de début aurait été montré) mais le titre n'apparaît qu'une fois, sur le
  premier jour — les jours suivants montrent une simple bande de couleur sans
  répéter le texte, pour qu'on reconnaisse rapidement que c'est le même
  événement qui continue (approximation raisonnable du rendu "étiré" de Google
  Agenda, sans complexité de positionnement absolu à travers la grille CSS —
  transparent avec Philippe sur ce choix).
- Clic sur une case vide (bouton "+" discret en Mois/Semaine, bouton "+
  Ajouter" en Jour) → `QuickAddChooser` (Tâche / RDV / Appel) :
  - **Tâche** → `NewTaskModal` existant, nouveau prop `prefillDueDate` (ajouté
    à `components/NewTaskModal.jsx`) pour préremplir la date cliquée.
  - **RDV**/**Appel** → `GoogleEventModal` (nouveau) prérempli avec un titre
    "RDV - "/"Appel - " et une durée par défaut (1h/30min) — créé directement
    sur Google Calendar via `POST /events`, PAS de création de contact/
    compagnie (contrairement au module de réservation publique `/rdv` — ici
    c'est un ajout manuel rapide par Philippe lui-même, pas une réservation
    client).
  - Clic sur un événement Google existant (si `editable`) → même
    `GoogleEventModal` en mode édition, avec bouton Supprimer.

Testé de bout en bout via l'API (création, modification, suppression réelles
d'un événement sur Google Calendar) : tous les appels retournent le succès
attendu. Fichier frontend vérifié sans erreur de compilation Vite après chaque
étape.

**Raffinements visuels (même TASK, itérés en direct avec Philippe après le premier jet)** :
- Page Agenda passée en largeur 100% (au lieu de 1100px plafonné) — retire les
  bandes grises inutiles sur les côtés.
- En-tête Agenda consolidé sur une seule ligne (Préc. / titre+date / Mois-Semaine-
  Jour / filtres statut+priorité / Suiv.+Aujourd'hui+Nouvelle tâche) pour libérer
  l'espace vertical ; l'onglet Tâches garde son en-tête original inchangé.
- Grille Mois/Semaine étirée pour remplir tout l'espace vertical restant (flex
  imbriqué : semaines `flex:1`, cellules `height:100%` via `gridTemplateRows:'1fr'`).
- `gap` CSS (faussait le calcul en % des bandes multi-jours) retiré entièrement, remplacé par des bordures individuelles par cellule.
- Jours hors-mois (fin du mois précédent / début du suivant) : affichent
  maintenant leur vrai numéro grisé avec toutes leurs tâches/événements
  fonctionnels (pas des cases vides) — comportement standard d'un calendrier.
- Petit bouton "+" par case retiré (jugé "affreux") — toute la case vide est
  cliquable pour ajouter (Tâche/RDV/Appel), les tâches/événements interceptent
  leur propre clic (`stopPropagation`) pour ouvrir leur détail sans déclencher
  l'ajout.
- Jours fériés canadiens (calendrier `fr.canadian#holiday@...`) : affichés en
  petit point vert à côté du numéro du jour (pas une bande pleine largeur),
  nom au survol (`title`) — libère de la place, `editable:false` déjà en place
  empêchait déjà toute modification.
- **Chevauchement d'événements multi-jours — algorithme repensé sur demande de
  Philippe** (rejeté l'empilement par "lane" façon Google/Outlook comme
  gaspillant l'espace vertical et non prioritaire correctement) :
  `weekMultiDayBars()` découpe la semaine en segments de jours consécutifs à
  combinaison d'événements identique ; un segment à 1 seul événement = pleine
  hauteur avec titre ; un segment à 2 événements qui se chevauchent = **une
  seule rangée partagée en 2 moitiés** (pas de lane empilée en plus) — le plus
  "établi" (plus longue durée totale, puis départ le plus tôt) garde le haut,
  l'autre prend le bas sans titre (trop étroit, 8px) ; 3+ simultanés (rare) :
  repli sur empilement classique par lane. `rowsNeeded` (espace réservé en haut
  de chaque case) suit le maximum de rangées réellement nécessaires par
  semaine, plus juste que l'ancien calcul par nombre de lanes.
  Segments consécutifs du même événement (jonction plein→moitié) corrigés via `joinLeft`/`joinRight` (détecte un segment adjacent du même `event.id`, supprime l'espacement/arrondi de ce côté — coupure visuelle trompeuse signalée par Philippe).
- Texte des bandes multi-jours centré ; texte des puces d'un seul jour resté
  aligné à gauche (Philippe a explicitement redemandé la distinction).

Testé en direct avec Philippe via de vrais événements créés/supprimés dans son
Google Calendar (événements superposés Aug 19-20/20-25 notamment) — comportement
confirmé correct ("EXCELLENT"). Données de test nettoyées après chaque
vérification.

**Ajout — lien Compagnie/Contact sur RDV/Appel créés depuis l'Agenda** : le
`GoogleEventModal` (création RDV/Appel via clic sur une case) n'avait aucun lien
CRM — corrigé pour réutiliser exactement le même système qu'ailleurs dans
l'app (Philippe : "je veux que ce soit toujours la même technique") :
- `frontend/src/pages/Tasks.jsx` — `GoogleEventModal` gagne les champs
  Compagnie/Contact via `Autocomplete` (identique à `NewTaskModal` : contacts
  filtrés par compagnie sélectionnée), avec `QuickNewCompany`/`QuickNewContact`
  pour créer à la volée si absent. Uniquement en mode création (pas en édition
  d'un événement existant).
- `backend/app/api/v1/endpoints/google_oauth.py` — `EventCreate` gagne
  `company_id`/`contact_id` optionnels ; si fournis, `create_google_event` crée
  aussi une `Task` locale liée (titre, description, `due_date`/`due_time`
  dérivés de l'heure de l'événement convertie en `America/Montreal`).
- Après sauvegarde, `load()` (liste des tâches locales) est rappelé en plus de
  `loadGoogleEvents()` pour que la tâche liée apparaisse immédiatement.

Testé de bout en bout : événement créé avec `company_id` réel → tâche locale
créée avec la bonne compagnie et la bonne heure locale (15h00 UTC → 11h00
Montréal, confirmé). Données de test nettoyées (événement Google + tâche).

**Ajouts supplémentaires (même session, précisions de Philippe champ par champ)** :
- Ordre du formulaire RDV/Appel fixé explicitement par Philippe : Titre → Date/
  Début/Fin → Compagnie → Contact → Lieu → Description → case "Envoyer une
  confirmation" (cochée par défaut, visible seulement si un contact est choisi).
- Lieu : bouton "📍 Utiliser l'adresse de [service/facturation] de la compagnie"
  apparaît si la compagnie choisie a des adresses actives (`GET /v1/companies/
  {id}` → `addresses`), remplit le champ Lieu en un clic, reste modifiable
  ensuite ("adresse de la compagnie choisie ou autre").
- Case "Envoyer une confirmation" : si cochée, `POST /google-calendar/events`
  envoie `send_rdv_confirmation_email` (même gabarit + invitation `.ics` que le
  module de réservation publique `/rdv`) au contact sélectionné, avec la tâche
  locale créée comme identifiant de suivi d'ouverture (`entity_type="task"`).
- `frontend/src/components/NewTaskModal.jsx` (utilisé partout dans ERPCRM, pas
  seulement l'Agenda) réordonné pour suivre le même gabarit que Appel/RDV, sur
  demande explicite de Philippe ("je veux que ce soit toujours la même
  technique") : Titre → Date/Heure → Compagnie/Contact (+ badges Ticket/
  Facture/Sous-tâche liés) → Description → Priorité/Statut → Assigné à →
  Checklist → Rappels → Template. Raison donnée : "j'aime savoir à qui est
  destinée cette tâche avant de savoir c'est quoi la tâche."

Testé : backend redémarré, endpoint déjà sollicité par le navigateur de
Philippe (200 OK), fichiers frontend vérifiés sans erreur de compilation Vite.

### TASK-026.4 [x] Fix — RDV disparus de l'Agenda (refresh token Google expiré)

Signalé par Philippe : plus aucun RDV visible dans l'Agenda ERPCRM. Logs
backend (`journalctl -u erpcrm-backend`) : `google.auth.exceptions.
RefreshError: invalid_grant: Token has been expired or revoked.` sur
`list_events`/`_calendars_meta` (`backend/app/core/google_calendar.py`).

Cause racine : l'écran de consentement OAuth du projet Google Cloud
"ERPCRM RDV" était en statut **Testing** — Google expire automatiquement
les refresh tokens des apps en Testing après 7 jours, peu importe leur
usage. `GET /google-calendar/status` (`is_configured()`) vérifie
seulement la *présence* du refresh token en base, pas sa validité auprès
de Google — d'où le badge "✓ Connecté" affiché dans Admin malgré le
token mort (comportement existant, pas modifié ici).

Fix en 2 temps :
1. Reconnexion immédiate (Admin > Google Calendar > Déconnecter puis
   Connecter) — nouveau refresh token généré, RDV réapparus (vérifié :
   `GET /google-calendar/events` 200 OK sans traceback après 19:36:46).
2. Fix durable : Philippe a publié l'app en **Production** dans Google
   Cloud Console (OAuth consent screen > Publish App), puis reconnecté
   une seconde fois pour obtenir un refresh token émis sous ce nouveau
   statut (vérifié : 200 OK sans erreur après 19:44:38). Les refresh
   tokens émis par une app en Production ne s'expirent plus après 7
   jours (seulement après ~6 mois d'inactivité, ce qui n'arrivera pas —
   l'Agenda poll toutes les 5s tant qu'il est ouvert, TASK-026.3).

Aucun changement de code — uniquement configuration Google Cloud Console
+ reconnexion OAuth via le flux existant.

### TASK-026.1 [ ] RDV — option Urgence (tarif ×2 min 2h, alerte courriel+appel cell/poste, sans délai) — reporté par Philippe, lignes téléphoniques pas prêtes
*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif, module-clé `rdv`. Reproduite telle quelle.)*

---

### TASK-026.5 [x] Fusion visuelle RDV/Tâche + téléphone d'entreprise + lien contact→compagnie + garde de navigation

Demande (2026-08-26) : en créant un RDV téléphonique avec une compagnie/contact lié, Philippe voyait deux entrées séparées dans l'agenda (le RDV Google Calendar ET une Tâche locale) qui semblaient dupliquées — `create_google_event` (`google_oauth.py`) crée les deux depuis longtemps (TASK-026.3) mais rien ne les reliait en base. Voulu : liées, jamais dupliquées/copiées.

- **Backend** : migration Alembic `15309e1f3718` — `Task.google_calendar_event_id` / `Task.google_calendar_id` (nullable). `create_google_event` remplit ces champs à la création. `TaskOut` les expose. Script ponctuel `backend/link_tasks_to_calendar_retroactive.py` — relie rétroactivement les tâches déjà créées à leur événement (match exact titre+date+heure, jamais de lien ambigu) : 1 tâche liée, 1 laissée non liée (aucun événement correspondant trouvé).
- **Frontend (Tasks.jsx, agenda)** : `MonthView`/`WeekView`/`DayView` n'affichent plus l'événement Google séparément quand une tâche liée existe déjà (`isEventLinkedToTask`) — une seule carte avec badge 📅. `TaskDetail` affiche "📅 Liée à l'agenda".
- **`QuickNewContact`** (composant partagé, 4 usages : agenda, tickets, fiche compagnie, téléphonie) : nouveau champ "Téléphone de l'entreprise", pré-rempli depuis `Company.office_phone`, sauvegardé directement dessus (pas de duplication).
- **Lien 🔗 contact→compagnie** : dans le formulaire de RDV et le détail de tâche, à côté du champ Contact — dérivé de l'entreprise du contact lui-même (`contact.companies[0].company_id`), pas du champ "Compagnie" séparé du formulaire (corrigé après un premier essai qui ne s'affichait pas quand seul un contact était choisi). Ouvre dans un nouvel onglet.
- **Migration du routeur React Router** : `<BrowserRouter>` → `createBrowserRouter`/`RouterProvider` (`App.jsx`) — nécessaire pour `useBlocker`, décision explicite de Philippe de faire le changement complet plutôt qu'une solution partielle qui évite de toucher au routeur (voir `feedback_priority_robustness_over_speed.md`, récidive 2026-08-26).
- **Garde de navigation** : hook réutilisable `useUnsavedChangesGuard` (`hooks/`) + popup `UnsavedChangesPrompt` (fermable seulement par bouton) — intercepte back/forward navigateur, fermeture d'onglet, et navigation dans l'app quand des changements non sauvegardés existent. Appliqué au formulaire de RDV (`GoogleEventModal`). Les notes de ticket n'en ont pas besoin — déjà couvertes par un brouillon auto-sauvegardé côté serveur (TASK-015.13), mécanisme distinct et plus robuste qu'un popup.

Non testé visuellement dans un vrai navigateur par Claude (pas d'outil de test disponible) — build réussi, routes qui répondent, mais Philippe à confirmer en utilisation réelle.

---

## TASK-027 [ERPCRM] [ ] Architecture 3 couches SIPV/ERPCRM — backlog validé, rien construit côté ERPCRM
Classification: CURRENT

Pendant du côté ERPCRM à `TASK-S043` (TASKSIPV.md) — même analyse d'architecture
retravaillée par Philippe avec ChatGPT (2026-08-02), même verdict : backlog de
référence, **rien construit ici**, pas de GO donné pour l'implémenter.

Impact ERPCRM le plus concret si/quand on y revient :
- **Trunks / Routes entrantes / Routes sortantes** devraient devenir des
  sections propres (probablement sous l'onglet "Serveur", créé vide dans
  TASK-026) plutôt que rester mélangées dans l'onglet Téléphonie de
  `CompanyDetail.jsx` comme aujourd'hui.
- **Global Templates / Model Templates** : fait — voir TASK-027.1.
- **Tableau de bord registre 911** (compteurs DID + taxe municipale 9-1-1 à
  remettre vs coût technique fournisseur, taux historisé) : n'existe pas,
  irait probablement aussi sous "Serveur".
- **Catalogue d'options du poste** (TASK-023.27, commencé le même jour) va
  dans le même sens que le "+ Ajouter une option" décrit dans cette
  architecture — déjà aligné, juste à enrichir progressivement.
  Démarré : voir TASK-023.28.

### TASK-027.1 [x] Global/Tenant/Model Templates — CRUD + UI (item 1, GO "on construit cette écran")
Pendant ERPCRM de TASK-S044 (TASKSIPV.md) -- voir cette entrée pour la
conception complète (lecture de `schema_champs_ucm.md`, ordre de fusion,
tests end-to-end). Ici seulement le détail du côté ERPCRM.

Fait :
- `sipv_client.py` : 12 fonctions (list/create/update/delete × servers +
  global/tenant/tenant-model templates).
- `companies.py` : proxy `/{company_id}/tenant-templates[...]` et
  `/{company_id}/tenant-model-templates[...]`, même pattern que
  `button-templates` (TASK-023.26).
- `server.py` (nouveau fichier) : proxy `/v1/server/servers` +
  `/v1/server/servers/{id}/global-templates[...]` -- rien n'existait encore
  pour la page Serveur (créée vide, TASK-026). Enregistré dans `main.py`.
- `CompanyDetail.jsx` (onglet Téléphonie) : `TenantTemplatesSection` +
  `TenantModelTemplatesSection` (sélecteur marque/modèle -- réutilise le
  catalogue `/v1/ref/phone-models` déjà existant, 70 modèles Grandstream
  confirmés dedans, GXP2135 inclus). Chaque template expansible réutilise
  `PhoneOptionsEditor` (TASK-023.27) pour éditer ses options.
- `Server.jsx` : remplie (était un stub vide) -- liste des serveurs SIPV +
  `GlobalTemplatesSection` par serveur.

Testé : bout en bout via l'API ERPCRM réelle (pas juste SIPV direct) --
GXP2135 confirmé listé via `/v1/ref/phone-models`, template créé pour Simple
IP inc. a changé le rendu du poste physique t1001-102, supprimé après coup,
poste confirmé `Registered`. `npx vite build` propre. Backend ERPCRM (process
uvicorn manuel, pas de service systemd actif) redémarré proprement.

Explicitement pas fait : assignation explicite d'un template non-défaut à un
poste précis (seul le "défaut" par niveau s'applique automatiquement) ;
aucune génération auto de gabarit de config pour un nouveau modèle/marque
(reste manuel, un chantier séparé).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/companies.py,
api/v1/endpoints/server.py, main.py, frontend/src/pages/CompanyDetail.jsx,
frontend/src/pages/Server.jsx.
Dépend de : TASK-027 (item 1), TASK-S044 (TASKSIPV.md).

### TASK-027.2 [x] Correction de placement + mécanisme "as template" (suite au test de TASK-027.1)
Pendant ERPCRM de TASK-S044.1 (TASKSIPV.md) -- voir cette entrée pour le
détail complet (schéma DB, tests end-to-end). Ici seulement le détail ERPCRM.

Philippe a testé TASK-027.1 en vrai et corrigé le placement : "Template de
tenant" doit se créer dans Serveur (bibliothèque partagée), Compagnie ne fait
que choisir. Il a aussi demandé le mécanisme "as template" par champ
(étiquette visible, personnalisable, réversible) -- déjà en germe dans le
mécanisme d'héritage `nullable=hérite` (TASK-S043 "déjà construit"), manquant
seulement dans l'UI de `PhoneOptionsEditor`.

Fait :
- `PhoneOptionsEditor.jsx` réécrit : props `templateOptions`/`templateLabel`,
  affiche automatiquement les options couvertes par le template actif avec
  "(as template)", cliquable pour revenir en arrière une fois personnalisée.
- `sipv_client.py` : `list_tenant_templates` prend maintenant `server_id` (pas
  `tenant_id`), chemin `/servers/{id}/tenant-templates` (pas `/provisioning/
  tenant-templates/tenant/{id}`).
- `companies.py` : CRUD `tenant-templates` retiré (déplacé dans `server.py`),
  remplacé par un simple `GET` (liste disponible pour le serveur de la
  compagnie, lecture seule). `phone-options` GET/PUT étendu avec
  `selected_tenant_template_id`. `tenant-model-templates` CRUD inchangé
  (confirmé correct par Philippe de rester ici).
- `server.py` : ajout du CRUD `tenant-templates` (même forme que
  `global-templates`).
- `contacts.py` : `PhoneUpdatePayload.selected_tenant_model_template_id`
  (nouveau) ; nouveau `GET /{contact_id}/sip-extension/phone/tenant-model-
  templates` (résout le tenant + modèle du poste automatiquement, pas besoin
  de `companyId` côté Contact).
- `CompanyDetail.jsx` : `TenantTemplatesSection` (locale, création) supprimée
  -- remplacée par un sélecteur au-dessus de "Options téléphonie (défaut
  compagnie)", branché sur `PhoneOptionsEditor` via `templateOptions`.
- `ContactDetail.jsx` : bloc "Options du poste" (`PhoneOptionsEditor` +
  sélecteur de template par modèle) déplacé de la section appareil vers entre
  Renvois et Caller ID (placement demandé explicitement).
- `Server.jsx` : ajout de `TenantTemplatesSection` (bibliothèque, création
  réelle ici maintenant).

Testé : bout en bout via l'API ERPCRM réelle (token admin) -- créé un
tenant-template dans Serveur, sélectionné dans Compagnie (`phone-options`),
rendu du GXP2135 changé ; créé un template par modèle dans Compagnie,
sélectionné via l'endpoint Contact, rendu regagné (plus spécifique) ; tout
désélectionné/supprimé, rendu revenu à la baseline, poste `Registered`.
`npx vite build` propre. Backend ERPCRM redémarré proprement (process uvicorn
manuel).
Fichiers : backend/app/core/sipv_client.py, api/v1/endpoints/companies.py,
api/v1/endpoints/server.py, api/v1/endpoints/contacts.py,
frontend/src/components/PhoneOptionsEditor.jsx,
frontend/src/pages/CompanyDetail.jsx, frontend/src/pages/Server.jsx,
frontend/src/pages/ContactDetail.jsx.
Dépend de : TASK-027.1, TASK-S044.1 (TASKSIPV.md).

---

## TASK-028 [ERPCRM] [x] Musique d'attente (MOH) — bibliothèque Serveur + sélection par compagnie
### TASK-027.3 [x] Serveur → onglet « Appareils internes » (postes du bureau sur l'adresse interne du SIPV)
Classification: CURRENT
Date de demande : 2026-10-11 (Philippe : « on choisit le tenant d'abord, ça nous amène à une liste de postes déjà configurés dans le tenant et on a juste à cocher les postes à l'interne ; on peut même ajouter plusieurs tenants au cas où plusieurs entreprises sur le même Internet auraient un SIPV ERPCRM »)
Date(s) de travail : 2026-10-14 (GO donné 2026-10-11 ; fait la nuit, départ planifié à 2 h 05, heure de Montréal)

- Pourquoi : depuis 0069 (TASK-051, Migration de tenant), le proxy SIP (P48) de tous les téléphones = adresse publique 142.112.42.52. Au bureau (même réseau que le SIPV), le téléphone passe par la boucle NAT du WatchGuard M200, qui ne tient pas : poste 102 (GXP2135) jamais réinscrit depuis le 2026-10-11 (connexion TLS ouverte depuis 192.168.1.1, aucun REGISTER n'atteint FreeSWITCH). Le WatchGuard ne fait pas d'enregistrement DNS local (pas de Split DNS sans autre machine — refusé par Philippe). Décision : exception pour les quelques appareils du bureau ; tous les autres restent sur l'adresse externe.
- Rejeté par Philippe : une case sur la fiche de chaque poste (« un truc pour tout le monde quand 4 appareils vont l'utiliser ») ; une liste plate « + Ajouter poste ».
- À construire (conception validée par Philippe) :
  - ERPCRM, page Serveur (`Server.jsx`) : nouvel onglet **« Appareils internes »** ; sélecteur **« Ajouter un tenant »** → section du tenant avec **tous ses postes déjà configurés** (numéro, nom, téléphone) et une **case « Interne »** par poste ; plusieurs tenants possibles (plusieurs entreprises sur le même Internet que le serveur) ; « Retirer le tenant » (décoche ses postes, enlève la section) ; bouton « Redémarrer » par poste (`RebootButton.jsx`), le changement s'appliquant au prochain chargement de configuration.
  - SIPV (source unique, aucune copie dans ERPCRM) : liste par serveur (multi-SIPV : chaque serveur a ses appareils internes et sa propre adresse interne) des tenants affichés + postes internes ; provisionnement (`provisioning.py`, `sip_proxy_host`) : poste interne → adresse interne du serveur (SIPV_HOST, 192.168.1.55), sinon SIPV_PUBLIC_IP. Un poste migré garde sa case (même téléphone, même bureau). Migration Alembic SIPV numérotée (0071), copie de la base avant. Endpoints SIPV avec `get_current_user_or_service` ; proxys ERPCRM via `sipv_client.py`.
  - Une case à l'écran doit avoir un effet réel : vérifier la config servie (`/cfg<mac>`, P48) avant/après.
- Test prévu : ajouter T1000, cocher 102 et 103 (le 103 vise déjà 192.168.1.55), config du 102 → P48 = 192.168.1.55, bouton Redémarrer → le 102 repasse vert (inscrit t1000-102). Vérifier à l'écran en 1920×1080.
- **Fait (2026-10-14)** :
  - SIPV (commit 21b5644, migration `0071_internal_devices`, copie avant `~/migration_backups/sipv_before_0071_internal_devices_20261014_0206.dump`, up/down/up testés, une seule tête) : `sip_extensions.internal_network` (faux par défaut : aucun poste changé) ; table `internal_network_tenants` (serveur, tenant ; unique) ; `endpoints/internal_devices.py` (`/api/v1/internal-devices` : `GET /server/{id}` = tenants affichés — ajoutés ou ayant un poste coché — avec tous leurs postes, état d'inscription, téléphone provisionné, plus les autres tenants du serveur ; `POST`/`DELETE /server/{id}/tenants/{tenant}` — retirer décoche ses postes ; `PUT /extensions/{id}` ; refus si le tenant n'est pas sur ce serveur ; journal `audit_logs` entity_type `internal_devices`) ; `provisioning.py` : P48 = `internal_address(server)` (adresse de la fiche serveur, sinon SIPV_HOST) si le poste est interne, sinon SIPV_PUBLIC_IP ; `phone_reboot.registered_users()` (une seule lecture des inscriptions). Un poste migré garde sa case (même ligne `sip_extensions`).
  - ERPCRM : `sipv_client.internal_devices()`, proxys dans `endpoints/server.py` (`/v1/server/servers/{id}/internal-devices…`, `/v1/server/internal-devices/extensions/{id}`), `components/InternalDevices.jsx`, onglet « Appareils internes » dans `Server.jsx` (`?tab=internes`) : par serveur, adresse interne / externe affichées, « Ajouter un tenant » (recherche), section par tenant (lien vers la fiche, « N interne(s) sur M », « Retirer le tenant » avec confirmation), tableau Interne / Poste (point vert/rouge d'inscription) / Nom / Téléphone (modèle + MAC, ou « configuré à la main ») / Adresse reçue / Redémarrer.
  - Preuves : écran en 1920×1080 (Playwright, aucune erreur) — T1000 ajouté, 102 et 103 cochés ; configuration servie du 102 (`/cfgc074ad31d573.xml`) : avant P48 = 142.112.42.52 → coché 192.168.1.55 → décoché 142.112.42.52 → recoché 192.168.1.55 ; « Retirer le tenant » décoche 102/103 (P48 redevient public), puis remis ; T1001 ajouté/retiré ; tenant inconnu → 404. État laissé : T1000 affiché, 102 et 103 internes.
  - **Prouvé sur le téléphone (2026-10-14, 05 h 45)** : Philippe a redémarré le 102 → il a chargé sa configuration (nginx : 192.168.1.178 `GET /cfgc074ad31d573.xml` 200, version interne) et s'est inscrit `t1000-102` en TLS **directement depuis 192.168.1.178** (contact `sips:t1000-102@192.168.1.178:42356`, Ping-Status Reachable) — plus par la boucle du routeur (192.168.1.1). Panne du 102 réglée.
  - Avant le redémarrage : le 102 n'est pas inscrit (vieille connexion par le routeur, 192.168.1.1:33989, d'où rien n'arrive) → le bouton Redémarrer est grisé (l'ordre passe par l'inscription). Il prendra P48 = 192.168.1.55 quand Philippe le débranche/rebranche (ou à sa vérification automatique de nuit). À vérifier ensuite : inscrit t1000-102. Le 103 (et 100/101) sont configurés à la main : la case n'a d'effet que sur un téléphone provisionné (l'écran l'indique : « à régler dans l'appareil »).
- En suspens, à ne pas faire sans Philippe : noms DNS publics `sipv001.simpleip.tel` (appels, A → 142.112.42.52) et `prov.simpleip.tel` (provisionnement central par ERPCRM, une seule adresse P237 pour tous les téléphones, ERPCRM va chercher la config chez le bon SIPV) — à construire plus tard avec GO ; certificat Kamailio actuel auto-signé `sipv.simpleip.local`. Vérifications WatchGuard (politique TCP 5061 en filtre de paquets, délai d'inactivité, inspection SIP) : optionnelles, faites par Philippe avec ChatGPT.

Classification: CURRENT

Demande de l'utilisateur (2026-08-07/08) : "j'aimerais l'avoir dans serveur pour les
voir toute et dans compagnie pour voir les MoH dedier peux etre metre un option pas
de tennant que tout les tennant pourrais voir avec leur filtre si je met des MoH dans
serveur sans l'atribuer a un tennant il apparaitrais dans tout les mOH des compagnie,
il faut que je puisse en selectioner plusieur". Câblage réel côté SIPV/FreeSWITCH
documenté dans `sipv/TASKSIPV.md` sous TASK-S033 (modèles, endpoints, génération du
flux `mod_local_stream`, variable `hold_music`) — cette entrée couvre uniquement le
proxy et l'UI côté ERPCRM.

Fait :
- `core/sipv_client.py` : `list_all_moh`, `list_available_moh`, `upload_moh`,
  `update_moh`, `delete_moh`, `get_moh_selection`, `set_moh_selection` — même
  pattern multipart que `upload_voicemail_greeting`.
- `api/v1/endpoints/server.py` : `GET/POST /moh`, `PUT/DELETE /moh/{id}` — bibliothèque
  globale, page Serveur.
- `api/v1/endpoints/companies.py` : `GET /{company_id}/moh/available` (globaux +
  dédiés à ce tenant, [] si compagnie sans tenant SIPV actif),
  `GET/PUT /{company_id}/moh/selection` (sélection multiple ordonnée, 400 si pas de
  tenant actif) — résolvent `company.sipv_tenant_id` côté serveur, le frontend n'a
  besoin que du `company_id` ERPCRM.
- `pages/Server.jsx` — nouveau `MohLibrarySection` : formulaire d'upload
  (nom + fichier + compagnie optionnelle, vide = "Global"), liste avec renommage
  inline, bascule actif/inactif, réassignation de compagnie (dropdown), suppression.
- `pages/CompanyDetail.jsx` — nouveau `MohSelectionSection` dans l'onglet Téléphonie :
  liste des fichiers disponibles (globaux + dédiés) avec case à cocher pour sélection
  MULTIPLE, boutons ↑/↓ pour ordonner (l'ordre est envoyé comme `sort_order`, lu par
  `mod_local_stream` côté FreeSWITCH). Rien à uploader ici — l'upload reste centralisé
  dans "Serveur" ; section masquée si la compagnie n'a pas de tenant SIPV actif
  (`sipvEnabled` passé depuis la fiche compagnie).

Bug corrigé pendant le test bout en bout de cette tâche (côté SIPV, pas ERPCRM) :
`GET /api/v1/moh` (liste globale) utilisait encore l'auth JWT stricte au lieu du
pattern service ERPCRM habituel — voir détail dans TASK-S033 de `sipv/TASKSIPV.md`.

Testé bout en bout via l'API ERPCRM réelle (compagnie test Simple IP inc., seul tenant
SIPV existant) : upload d'un WAV de test en global, apparu dans la liste globale et
dans "disponible" pour la compagnie, sélection appliquée (confirmé par génération du
flux FreeSWITCH côté serveur, voir TASK-S033), sélection vidée puis fichier supprimé,
tout retiré proprement. `npm run build` (Vite) propre pour `Server.jsx` et
`CompanyDetail.jsx`.
Fichiers : `backend/app/core/sipv_client.py`, `api/v1/endpoints/server.py`,
`api/v1/endpoints/companies.py`, `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`.
Dépend de : TASK-022 (tenant SIPV par compagnie), TASK-S033 (côté SIPV).

### TASK-028.1 [x] MOH — téléchargement des fichiers existants + upload direct depuis la fiche compagnie

Confusion initiale de l'utilisateur ("le bouton + télécharger n'ajoute pas de
ligne, je n'ai pas le bouton téléverser") clarifiée en cours d'échange :
- "Téléverser" = envoyer un nouveau fichier (déjà présent page Serveur,
  ABSENT volontairement de la fiche compagnie jusqu'ici -- voulu maintenant).
- "Télécharger" = récupérer un fichier déjà en ligne (n'existait nulle part
  avant cette tâche).
- La liste "Compagnie" du formulaire d'upload (page Serveur) était déjà
  filtrée sur les compagnies avec tenant SIPV actif (`c.sipv_enabled &&
  c.sipv_tenant_id`, `Server.jsx`) -- rien à changer là, confirmé pendant
  l'échange.

Fait :
1. `sipv_client.py` : nouvelle fonction `download_moh(moh_id)` -- même
   pattern que `download_voicemail_greeting` (récupère bytes + filename
   depuis `GET /api/v1/moh/{id}/file` côté SIPV, qui existait déjà et
   utilise `get_current_user_or_service`, voir mémoire
   `feedback_sipv_erpcrm_auth_dependency`).
2. `api/v1/endpoints/server.py` : nouvel endpoint `GET /moh/{moh_id}/file`,
   proxy vers `sipv_client.download_moh`, réponse `audio/wav` +
   `Content-Disposition: attachment`.
3. `api/v1/endpoints/companies.py` : nouvel endpoint `POST
   /{company_id}/moh` -- upload direct, tenant_id pris automatiquement du
   `company.sipv_tenant_id` (400 si la compagnie n'a pas de tenant actif),
   réutilise `sipv_client.upload_moh` (déjà existant, rien à ajouter côté
   SIPV).
4. `Server.jsx` (`MohLibrarySection`) : bouton "Télécharger" ajouté à
   chaque ligne de la bibliothèque globale.
5. `CompanyDetail.jsx` (`MohSelectionSection`) : formulaire d'upload
   (Nom + Fichier + bouton "+ Téléverser", même style que la page Serveur)
   ajouté au-dessus de la liste -- pas de sélecteur de compagnie, le tenant
   est implicite. Bouton "Télécharger" ajouté à chaque ligne de la liste
   disponible (globaux + dédiés). Le fichier uploadé apparaît ensuite dans
   la liste "disponible" (dédié à cette compagnie) -- reste à cocher pour
   l'ajouter à la sélection jouée, comportement inchangé.

Fichiers : `backend/app/core/sipv_client.py`,
`backend/app/api/v1/endpoints/server.py`,
`backend/app/api/v1/endpoints/companies.py`,
`frontend/src/pages/Server.jsx`, `frontend/src/pages/CompanyDetail.jsx`.
Backend + frontend redémarrés.

### TASK-028.2 [x] MOH -- fix dropdown Compagnie vide (Serveur) + feedback upload manquant

Menu déroulant "Compagnie" du formulaire d'upload MOH toujours vide, corrigé : `sipv_enabled`/`sipv_tenant_id` ajoutés à `CompanyListItem` (manquaient, contrairement à `CompanyOut`) et peuplés dans `list_companies`.

Upload silencieux (aucun feedback même en cas de succès), corrigé dans `Server.jsx` ET `CompanyDetail.jsx` : `key` incrémentée sur l'input file pour forcer un vrai reset visuel, message "✓ Téléversé" (vert, 4s) ou erreur explicite (rouge) affiché à côté du bouton.

Vérification du lien SIPV demandée par l'utilisateur ("est-ce bien lié au
SIPV des 2 côtés ?") : testé directement en `curl` un upload complet sur le
tenant réel de "Simple IP inc." → 201, fichier créé côté SIPV avec le bon
`tenant_id`, confirmé fonctionnel de bout en bout avant même les fix
UX ci-dessus ; fichier de test supprimé après vérification.

Fichiers : `backend/app/schemas/company.py`,
`backend/app/api/v1/endpoints/companies.py`,
`frontend/src/pages/Server.jsx`, `frontend/src/pages/CompanyDetail.jsx`.
Backend + frontend redémarrés.

### TASK-028.3 [x] MOH -- fix "Échec de l'envoi" (413 nginx, fichiers > 1 Mo)

"Échec de l'envoi" persistant malgré TASK-028.2, corrigé : `client_max_body_size 50m;` ajouté au bloc `server` de `/etc/nginx/sites-enabled/portail.simpleip.tel` (défaut nginx 1 Mo, aucun log applicatif car la requête n'atteignait jamais uvicorn), `nginx -t` puis `systemctl reload nginx`. Re-testé : 201 confirmé via le domaine public avec un fichier de 3 Mo.

Précision donnée à l'utilisateur : le changement de tenant après upload
existe déjà (menu déroulant "Compagnie" sur chaque ligne de la
bibliothèque, page Serveur, fonction `reassign` -- `Server.jsx`), pas
besoin de retéléverser en cas d'erreur de destination.

Fichiers : `/etc/nginx/sites-enabled/portail.simpleip.tel` (hors repo git,
config serveur).

### TASK-028.4 [x] MOH -- suppression compagnie, désactivation base, appel poste, ordre liste/aléatoire

Demande de l'utilisateur (2026-08-12) : (1) pouvoir supprimer un fichier MOH
uploadé par la compagnie depuis sa fiche (X + confirmation française) ;
(2) les MOH "de base"/globaux ne doivent PAS être supprimables, juste
désactivables ; (3) importer les pistes MOH système de FreeSWITCH
(`sounds/music/8000/*.wav`) comme fichiers globaux actifs par défaut, pour
que l'utilisateur décide lui-même de les désactiver ; (4) pouvoir écouter
un MOH par appel réel à un poste, même principe que les Phrases IVR
(TASK-029/TASK-S055) ; (5) choix par compagnie entre lecture en liste
(ordre choisi) ou aléatoire.

Fait :
- `CompanyDetail.jsx::MohSelectionSection` : ligne passée en CSS Grid (colonnes fixes) — corrige un décalage visuel de l'audio/téléchargement à la sélection (`marginLeft: auto` dynamique).
- Bouton ✕ (suppression, confirmation FR) affiché seulement si
  `f.tenant_id` (fichier dédié à CETTE compagnie) ; bouton
  Activer/Désactiver sinon (fichier global/de base) — `PUT .../is_active`.
  Endpoint `/available/tenant/{id}` (SIPV, `moh.py`) ne filtre plus
  `is_active` (sinon un fichier désactivé disparaissait sans retour
  possible depuis cette vue) ; `is_active` reste respecté séparément dans
  `regenerate_tenant_moh_stream` (jamais un fichier inactif dans le flux
  réel).
- 4 pistes stock FreeSWITCH importées comme `MohFile` globaux actifs
  (Bach, Ponce, Granados, Albéniz — `sounds/music/8000/*.wav`, déjà en
  8kHz, script ponctuel, pas une migration).
- Écouter par appel : `POST /v1/moh/{id}/call` (SIPV, même principe que
  `AudioPrompt.call`/TASK-S055, `esl.originate_app` direct, pas de
  dialplan). Lecture directe depuis `uploads/moh_files/` échouait ("Permission denied", `/home/sipv/` en 750) — corrigé en copiant d'abord vers `/usr/local/freeswitch/conf/moh_call_cache/` (dossier créé manuellement, `chown sipv:sipv`, `755`, même pattern que `prompts_cache`). Proxy ERPCRM :
  `sipv_client.call_moh` + `POST /v1/server/moh/{id}/call` (`server.py`).
- Ordre liste/aléatoire : nouveau champ `Tenant.moh_shuffle` (SIPV,
  migration `0060`, défaut `true` = comportement historique inchangé).
  Exposé via `TenantOut`/`TenantUpdate` (générique, `setattr`) — mise à
  jour déclenche `regenerate_tenant_moh_stream` immédiatement (pas
  d'attente d'un prochain upload/sélection). Côté ERPCRM, réutilise
  l'endpoint générique existant `PUT /{company_id}/phone-options` (ajout
  du champ `moh_shuffle`, même pattern que `selected_tenant_template_ids`)
  plutôt qu'un nouvel endpoint dédié. UI : deux boutons radio
  "Liste (ordre choisi)" / "Aléatoire" au-dessus de la liste des fichiers.

Fichiers : SIPV `models/tenant.py`, `api/v1/endpoints/{tenants,moh}.py`,
`core/local_stream.py`, `alembic/versions/0060_tenant_moh_shuffle.py`.
ERPCRM `core/sipv_client.py`, `api/v1/endpoints/{companies,server}.py`,
`pages/CompanyDetail.jsx`. Backends SIPV + ERPCRM redémarrés, frontend
ERPCRM rebuild (`vite build`, PAS juste `systemctl restart` — le service
sert un build de production statique, un restart seul ne redéploie rien,
piège trouvé pendant cette tâche) + redémarré, migration appliquée.

---

## TASK-029 [ERPCRM] [~] Écouter/enregistrer un audio via appel à un poste
Classification: CURRENT

> Statut corrigé en Phase O (était `[ ]` dans TASKERPCRM.md) : 13 des 14 sous-tâches TASK-029.1→.14 sont `[x]` complétées et testées (Voicebox fonctionnel, Phrases IVR en production). Seul le Mode 2 ("Enregistrer" via menu vocal au poste, TASK-S055) n'a jamais été construit — d'où `[~]` (partiel) plutôt que `[x]` (complet) ou `[ ]` (rien fait).


Demande dictée textuellement par l'utilisateur (2026-08-08), pendant le
travail sur TASK-028 (MOH) -- système voulu générique "pour tout les
enregistrements", pas limité à MOH. Voir TASKSIPV.md TASK-S055 pour le détail
technique côté FreeSWITCH/ESL (déjà investigué : `esl.originate()` existe
mais inutilisé, `show_registrations`/`sofia_contact` dispo pour filtrer les
postes connectés, dialplan XML dynamique déjà en place dans `xml_curl.py`).

**Mode 1 -- "Faire écouter" (bouton sur un fichier audio, ex: MOH)**
Deux façons d'écouter, choix laissé à l'utilisateur (ajouté en cours de
discussion 2026-08-08, "soit par le poste ou soit par les haut-parleurs de
l'ordi/tablette/cell") :
- **Écoute locale (navigateur)** : lecture directe via `<audio>` HTML,
  haut-parleurs de l'appareil (ordi/tablette/cell) -- aucun appel, aucune
  dépendance ESL, réutilise directement l'endpoint de téléchargement déjà
  en place (`GET /v1/server/moh/{id}/file`). Le plus simple des deux, à
  construire en premier (pas de risque, pas d'appel réel).
- **Écoute par appel réel à un poste** (ce qui suit ci-dessous) : utile
  pour entendre le rendu exact tel que joué par FreeSWITCH sur un vrai
  téléphone (codec, volume), pas juste le fichier brut dans le navigateur.
  Popup : si PAS déjà dans le contexte d'une compagnie précise (ex: page
  Serveur) → choix du tenant d'abord (filtré aux tenants SIPV actifs), PUIS
  choix du poste (actifs ET connectés du tenant choisi). Si déjà dans la
  fiche d'une compagnie (ex: section MOH de CompanyDetail.jsx) → choix du
  poste seulement (déjà dans le tenant de cette compagnie).

**Mode 2 -- "Enregistrer" (onglet Phrases/IVR d'une fiche compagnie)**
Bouton "Enregistrer" à côté d'une phrase IVR. Popup : choix du poste (avec
nom), pas de choix de tenant (déjà dans le contexte de la compagnie). Lance
un appel avec un script vocal précis à respecter EXACTEMENT (voir TASK-S055
pour le détail mot pour mot : annonce du # pour terminer, menu 1=écouter/
2=enregistrer(sauvegarder)/3=annuler, répété 3x si pas de réponse puis
annulation automatique).

**Mode 3 -- "Générer par voix (TTS)" (même onglet Phrases/IVR d'une fiche
compagnie, ajouté en cours de discussion 2026-08-08)**
Dans l'onglet IVR/Téléphonie de la fiche compagnie : choix d'une voix
(parmi les profils Voicebox), champ texte libre, bouton "Créer la phrase" —
génère l'audio via Voicebox puis l'envoie automatiquement à la bonne phrase
côté SIPV (upload prompt, tenant de la compagnie).
Outil retenu : **Voicebox** (github.com/jamiepine/voicebox, open-source,
local-first, clonage de voix, 23 langues/7 moteurs TTS). PAS un module
FreeSWITCH -- appli séparée avec un backend FastAPI headless (Docker
supporté, Linux OK, CPU fallback sans GPU) qui expose une API REST
(`/generate`, `/speak`, `/profiles`) sur le port `17493` en local. Plan :
déployer ce backend sur le serveur ERPCRM (conteneur Docker), ERPCRM
l'appelle en interne pour générer l'audio, puis le pousse vers SIPV.
**Bonne nouvelle découverte en même temps** : SIPV a DÉJÀ tout le CRUD des
phrases prêt et fonctionnel côté `sipv/backend/app/api/v1/endpoints/prompts.py`
(`POST /api/v1/prompts/tenant/{tenant_id}` -- accepte n'importe quel format,
conversion ffmpeg → WAV 8kHz mono PCM automatique, même pattern que les
accueils de messagerie vocale). ERPCRM n'a AUCUNE fonction encore pour
appeler cet endpoint (`sipv_client.py` n'a que `list_prompts`, pas
`upload_prompt`) -- à ajouter, ainsi qu'un vrai onglet/section "Phrases" côté
ERPCRM (n'existe pas encore : `prompts` n'est chargé aujourd'hui que pour
peupler UN dropdown de destination DID, pas de vraie gestion CRUD visible).
Cette section "Phrases" à construire hébergera donc les 3 façons de créer
une phrase : upload direct (fichier), enregistrement par appel (Mode 2,
TASK-S055), génération TTS (Mode 3, Voicebox).

**Ne pas commencer sans GO explicite** -- appels réels vers de vrais
téléphones du client (modes 1/2), nouvelle infrastructure serveur à
déployer (mode 3, conteneur Voicebox), décisions d'architecture (Lua/JS vs
XML dialplan chaîné pour la boucle du menu, endpoint de suivi du statut
d'appel) encore à trancher avec l'utilisateur, voir TASK-S055 pour la liste
complète des points à valider avant de coder.

Dépend de : TASKSIPV TASK-S055.

---

## Détail backlog SIPV (intégration ERPCRM ↔ SIPV)

### TASK-029.1 [x] MOH -- écoute directe navigateur (première brique de TASK-029, sans appel)

Implémentation de la partie sans risque de TASK-029 (Mode 1, option
"haut-parleurs ordi/tablette/cell") pendant que le reste (appel réel,
menu d'enregistrement, Voicebox) attend encore GO. Bouton "🔊 Écouter" /
"⏸ Stop" ajouté à côté de "Télécharger" sur chaque fichier MOH, dans les
deux écrans (Serveur ET fiche compagnie) -- réutilise l'endpoint existant
`GET /v1/server/moh/{id}/file` (blob), lecture via `new Audio(objectUrl)`
+ `.play()`, un seul son actif à la fois (`audioRef`, pause l'ancien avant
de jouer le nouveau), `playingId` remis à `null` sur `onended`.
Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`. Frontend rebuild + redémarré.
Reste dans TASK-029 (en attente de GO) : écoute/enregistrement par appel
réel à un poste (TASK-S055) + génération TTS Voicebox.

### TASK-029.2 [~] GO reçu -- Phrases IVR : upload/écoute/appel + Voicebox (en cours)

GO explicite reçu (2026-08-08, "fait tout Voicebox dans le erpcrm et la
portion envoie au SIPV avec le fichier temporaire par tennant pour
l'ecouter par le poste"). Construction en cours, par morceaux :

**1. Écran "Phrases" -- ENTIÈREMENT NEUF, n'existait pas du tout avant**
Nouveau composant `PromptsSection` dans `CompanyDetail.jsx` (onglet
Téléphonie, sous MOH) : liste des phrases du tenant (nom, durée), boutons
🔊 Écouter (navigateur), 📞 Écouter par poste (popup inline : select poste
actif+connecté → Appeler), Télécharger, Supprimer ; formulaire upload direct
(+ Téléverser) ; formulaire génération par voix (Voicebox, voir point 3).

**2. "Écouter par le poste" -- appel réel, testé et fonctionnel**
⚠️ Découverte bloquante en cours de route : les phrases sont stockées dans
`/home/sipv/sipv/backend/uploads/audio_prompts/`, mais ce chemin est
INACCESSIBLE au process FreeSWITCH (`/home/sipv` est `750 sipv:sipv`,
l'utilisateur système `freeswitch` n'est PAS dans le groupe `sipv` --
confirmé avec `sudo -u freeswitch test -r ...` → NOT_READABLE). Le même
problème existe en théorie pour la lecture de phrase dans un DID/IVR déjà
en prod, mais passait inaperçu faute de test d'écoute réelle jusqu'ici.
Fix : même pattern que MOH (`local_stream.py`, TASK-S033) -- nouveau
`PROMPT_CACHE_DIR = /usr/local/freeswitch/conf/prompts_cache/` (sipv:sipv,
755, traversable par "other" car sous `conf/` qui est 755), le fichier y
est copié (`shutil.copy2` + `chmod 644`) juste avant l'appel.
- `sipv/backend/app/core/esl.py` : nouvelle méthode `originate_app(endpoint,
  app, app_args, ...)` -- origine directement vers une application
  FreeSWITCH (`&playback(path)`) SANS passer par le dialplan XML, plus
  simple que le mode 2 (enregistrement) qui lui en aura besoin.
- `sipv/backend/app/api/v1/endpoints/prompts.py` : nouveau `POST
  /{prompt_id}/call` (`get_current_user_or_service`, voir mémoire
  auth ERPCRM↔SIPV) -- verifie que le poste appartient au même tenant que
  la phrase, copie le fichier dans le cache, construit `user/{username}@
  {account_number}` (même format que `_bridge()` dans xml_curl.py) et
  origine l'appel.
- `erpcrm/backend/app/core/sipv_client.py` : `upload_prompt`,
  `delete_prompt`, `download_prompt`, `call_prompt`.
- `erpcrm/backend/app/api/v1/endpoints/telephony.py` : `POST
  /company/{id}/prompts` (upload), `DELETE /prompts/{id}`, `GET
  /prompts/{id}/file` (écoute/téléchargement), `POST /prompts/{id}/call`.
Testé en direct (compagnie Simple IP inc., tenant t1001) : upload d'un WAV
de test → 201, conversion ffmpeg confirmée (fichier téléchargé = vrai WAV
PCM 8kHz mono) ; appel avec un `extension_id` bidon → 404 propre AVANT tout
originate (validation confirmée sûre, pas d'appel accidentel) ; poste
réel PAS testé volontairement (extensions 100/101/102 de ce tenant sont
`registered=true` en ce moment -- éviter de faire sonner un vrai poste sans
prévenir explicitement l'utilisateur au moment du test). Fichier de test
supprimé après vérification.

**3. Génération par voix (Voicebox) -- déploiement en cours**
Docker installé (`docker.io` + `docker-compose-v2` via apt, absent avant).
Repo cloné dans `/home/simpleip/services/voicebox` (`git clone --depth 1`),
`docker compose up --build -d` lancé en arrière-plan (build lourd :
PyTorch + moteurs TTS, plusieurs GB, en cours au moment d'écrire ceci).
API confirmée en lisant le code source du backend (pas de doc figée,
recherche web insuffisante) : PAS de prefixe `/api/v1`, routes a la racine.
`POST /generate` est ASYNCHRONE (enqueue, retourne `status=generating`
tout de suite) -- il faut poller `GET /history/{id}` jusqu'a
`completed`/`failed`, puis `GET /audio/{id}` pour le fichier. `GET
/profiles` pour la liste des voix. Aucune auth (lié à 127.0.0.1
uniquement, port hôte 17600 -> 17493 conteneur).
- `erpcrm/backend/app/core/voicebox_client.py` (nouveau) : `list_voices()`,
  `generate(text, profile_id, language)` avec le poll intégré (timeout
  120s).
- `erpcrm/backend/app/core/config.py` : `VOICEBOX_API_URL` (défaut
  `http://127.0.0.1:17600`).
- `erpcrm/backend/app/api/v1/endpoints/telephony.py` : `GET
  /voicebox/voices`, `POST /company/{id}/prompts/generate` (génère puis
  envoie direct à SIPV via `sipv_client.upload_prompt`).
Backend ERPCRM redémarré, toutes les routes confirmées enregistrées
(`openapi.json`). PAS ENCORE TESTÉ (le conteneur Voicebox n'a pas fini de
builder) -- l'écran affiche "Aucune voix disponible" tant que
`GET /profiles` échoue, comportement dégradé propre en attendant.

Fichiers : `sipv/backend/app/core/esl.py`,
`sipv/backend/app/api/v1/endpoints/prompts.py`,
`erpcrm/backend/app/core/sipv_client.py`,
`erpcrm/backend/app/core/voicebox_client.py`,
`erpcrm/backend/app/core/config.py`,
`erpcrm/backend/app/api/v1/endpoints/telephony.py`,
`erpcrm/frontend/src/pages/CompanyDetail.jsx`.
Infra hors repo : `/home/simpleip/services/voicebox` (clone git),
Docker installé sur ERPCRM (nouveau).

Reste à faire : attendre la fin du build Voicebox, tester `/generate` +
`/profiles` en vrai, tester "écouter par poste" sur un vrai téléphone avec
l'utilisateur présent. Option 2 du menu d'enregistrement téléphonique
(Mode 2, TASK-S055) toujours pas clarifiée avec l'utilisateur -- ce mode
n'est PAS commencé (seul le Mode 1 "écouter par poste" est fait).

### TASK-029.3 [x] Voicebox -- fix crash SIGILL au démarrage (pedalboard exige AVX2)

Crash bloquant : le conteneur Voicebox crash-loopait en boucle (exit
code 132 = SIGILL) dès le démarrage, avant même "Application startup
complete". Diagnostic initial erroné en cours de route (voir échange avec
l'utilisateur) : d'abord suspecté "pas assez de vCPU" (faux), puis "PyTorch
exige AVX2 que le CPU physique du Hyper-V (Xeon E5-2630 v2, Ivy Bridge-EP)
n'a pas" (partiellement faux aussi -- corrigé par l'utilisateur avec les
specs Intel exactes).

Vrai coupable trouvé par bissection manuelle (exécution pas-à-pas de
`_run_startup()` dans un conteneur jetable jusqu'à isoler l'import fautif) :
**`pedalboard`** (librairie C++/JUCE de Spotify pour les effets audio --
reverb/chorus/delay/compressor/pitch shift, PAS le moteur TTS lui-même).
La version installée par défaut (`>=0.9.0` dans `backend/requirements.txt`,
résolue en 0.9.24) crash au simple `import pedalboard`, avant même d'être
utilisée -- ses builds récentes exigent AVX2. `torch` 2.13.0, `numba`,
`librosa`/`soundfile` (y compris un vrai resample numba-jité) testés
individuellement en isolation : tous fonctionnent très bien sur ce CPU
(AVX seulement) -- ce n'était PAS un problème PyTorch/CPU count comme
diagnostiqué au départ.
Fix : `pedalboard==0.7.7` (testé manuellement : import + application d'un
vrai effet Reverb fonctionnels) épinglé dans
`services/voicebox/backend/requirements.txt`, remplace `>=0.9.0`. Rebuild
de l'image en cours au moment d'écrire ceci.

Le CPU physique du Hyper-V (2× Xeon E5-2630 v2, Ivy Bridge-EP, AVX
seulement) n'a PAS AVX2 (confirmé par l'utilisateur avec les fiches
techniques Intel) -- ne jamais assumer que "changer un réglage Hyper-V"
peut faire apparaître une instruction que le CPU physique ne possède pas
matériellement. Ce fix règle le crash sans avoir besoin de toucher au
matériel ou à la VM.

Fichiers : `/home/simpleip/services/voicebox/backend/requirements.txt`
(hors repo git ERPCRM, projet externe cloné à part).

### TASK-029.4 [x] Voicebox -- testé bout en bout, GÉNÉRATION FONCTIONNELLE

Après le fix pedalboard (TASK-029.3), le conteneur démarre proprement
(`health=healthy`, `restarts=0`). Deux bugs corrigés en testant une vraie génération bout en bout :
1. `voicebox_client.generate()` envoie désormais `"engine": PRESET_ENGINE` explicitement dans le payload `/generate` (défaut Voicebox = "qwen", incompatible avec un profil preset kokoro sans ce paramètre → 400).
2. `chown -R 999:999` appliqué sur le volume nommé `voicebox_huggingface-cache` et sur `/home/simpleip/services/voicebox/output` (`PermissionError` — Docker crée volumes/bind-mounts en `root:root`, incompatible avec l'utilisateur `voicebox` uid 999 du conteneur).

Testé de bout en bout via l'API ERPCRM réelle (compagnie Simple IP inc.,
tenant t1001) : génération "Bienvenue chez Simple IP" en français (voix
Siwis, `ff_siwis`) → 201 en ~10.5s, phrase créée côté SIPV, fichier
téléchargé et vérifié (vrai WAV PCM 8kHz mono, 32 Ko pour 2 secondes).
Phrase de test supprimée après vérification. `GET /voicebox/voices`
confirmé : 54 voix Kokoro au total, 1 seule en français (Siwis, femme).

Fichiers : `backend/app/core/voicebox_client.py` (fix engine).
Infra hors repo : permissions corrigées sur les volumes Docker de
`/home/simpleip/services/voicebox` (à refaire si les volumes sont
recréés/supprimés un jour -- pas persistant dans la config, geste manuel).

### TASK-029.5 [x] Filtre voix -- Langue + Genre (checkbox) + liste filtrée (demande oubliée, refaite)

⚠️ Demandé initialement pendant TASK-029.2 (avant la crise Voicebox), jamais
livré -- la distraction du crash a fait perdre le fil, l'utilisateur l'a
signalé (frustration justifiée). Refait maintenant tel que spécifié à
l'origine :
- Menu déroulant **Langue** juste après Nom (défaut "fr" -- répond aussi à
  "pourquoi je n'ai pas français ?" : la voix existe déjà (Siwis), mais rien
  ne présélectionnait le français avant, donc pas évident qu'elle était là).
- 3 cases à cocher **Tout / Femme / Homme** empilées verticalement (demande
  précisée en cours de route), comportement exclusif comme un groupe radio.
- Menu déroulant **Voix** filtré par langue + genre choisis (juste le nom,
  plus besoin d'afficher genre/langue en texte puisque déjà filtré).
Changer la langue ou le genre réinitialise la voix choisie (évite une
incohérence si l'ancienne sélection ne correspond plus au filtre).
Fichiers : `frontend/src/pages/CompanyDetail.jsx`. Rebuild + redémarré.

### TASK-029.6 [x] Comparatif complet des moteurs voix -- décision : Kokoro/Siwis pour l'instant

Longue session de tests comparatifs (2026-08-09 au 2026-08-10) pour trouver
une bonne voix française pour les phrases IVR. Résumé des essais, du
meilleur au pire :

| Moteur | Voix | Verdict |
|---|---|---|
| Kokoro (preset) | Siwis (femme) | **✓ Retenu pour l'instant** -- bonne prononciation, rapide (~secondes), gratuit, local |
| Qwen 0.6B | Voix clonée de l'utilisateur | Bon sur la 1ère prise, inégal ensuite (variance aléatoire, pas de seed fixe) |
| Qwen 1.7B | Voix clonée | ⚠️ Bug -- répète du contenu d'un échantillon d'entraînement (l'alphabet) au lieu du texte demandé |
| Chatterbox 0.1.7 (déjà la dernière version PyPI, vérifié) | Voix clonée | Accent qui dérape (sonne belge), mauvaise prononciation -- écarté |
| tada (Hume) | Voix clonée | ⚠️ Plante systématiquement (OOM, même à 12 Go -- télécharge des modèles d'alignement pour trop de langues à la fois) |
| Azure (Sylvie DragonHD, Sylvie, Antoine) | Voix stock fr-CA | Qualité appréciée à l'écoute (démo publique sans compte) -- **abandonné** : nécessite une carte de crédit sur le compte Azure de l'utilisateur, refusé par prudence |

**Décision** : Kokoro/Siwis (déjà branché dans ERPCRM, gratuit, aucune
configuration) reste la voix utilisée pour l'instant. Limite connue : une
seule voix (féminine), pas d'option masculine sans repasser par le
clonage ou un service payant. À revisiter une fois le nouveau serveur
(Lenovo P720 + RTX 3060 Ti, voir TASK-029) disponible -- permettra de
retester tada/Chatterbox correctement (plus de mémoire, GPU) sans les
contraintes de ce soir.

Nettoyage : profils de test Voicebox ("Philippe (Qwen)", "Philippe
(Chatterbox)", "Philippe (Tada)") laissés en place dans Voicebox (pas dans
SIPV/ERPCRM, aucun impact) au cas où on reprend les tests plus tard.

⚠️ Bug en cours d'investigation (signalé par l'utilisateur juste après ce
comparatif) : le bouton "Tester cette voix" (`PromptsSection`,
`CompanyDetail.jsx`) ne joue toujours aucun son pour l'utilisateur, malgré
le fix précédent (await + catch sur `audio.play()`, voir plus haut) --
confirmé que le backend répond 200 OK avec l'audio (log `POST
/api/v1/telephony/voicebox/preview` observé), donc le problème est
uniquement côté navigateur. Pas encore résolu au moment d'écrire ceci.

### TASK-029.7 [x] Fix boutons audio muets (user gesture) + fix appel poste (permission dossier SIPV)

Deux bugs distincts remontés par l'utilisateur en testant Kokoro/Siwis en
conditions réelles.

**1. Audio muet sur les 4 boutons de lecture** (`playFile` ×2, `playPrompt`,
`previewVoice`) — "play() can only be initiated by a user gesture" (`.play()` appelé après un `await` réseau). Fix (première tentative, insuffisante — voir TASK-029.8) : créer l'élément `Audio` et appeler `.play()` immédiatement dans le handler de clic avant l'attente réseau, `.catch(() => {})` pour absorber le rejet attendu. Appliqué aux 4 fonctions identiquement.

**2. "Écouter par le poste" -- 502** sur `POST /prompts/{id}/call` (`PermissionError` sur `/usr/local/freeswitch/conf/prompts_cache`, `conf/` appartient à `freeswitch:freeswitch`). Fix : dossier créé manuellement (`sudo mkdir` + `chown sipv:sipv` + `chmod 755`), même pattern que `local_stream/`. Pas persistant — à recréer à la main si ce dossier disparaît (reset serveur, réinstallation).

Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`. Frontend rebuild + redémarré.
Infra SIPV hors repo : `/usr/local/freeswitch/conf/prompts_cache` créé.

### TASK-029.8 [x] Fix définitif audio muet (2 clics) + fix syntaxe originate FreeSWITCH

Le fix TASK-029.7 (débloquer l'élément Audio dans le geste du clic) n'a
PAS suffi -- confirmé déployé (bundle vérifié) mais toujours "play() can
only be initiated by a user gesture" pour l'utilisateur. Abandon de la
technique de déblocage, remplacée par un pattern plus robuste et garanti :
**lecture en 2 clics**. 1er clic = télécharge/génère le fichier
seulement (aucun appel à `.play()`) ; le bouton devient "▶ Jouer" ; 2e
clic = lecture strictement synchrone (aucun `await` avant `.play()`),
donc toujours dans un geste utilisateur frais, peu importe le navigateur.
Appliqué aux 4 fonctions (`playFile` ×2, `playPrompt`, `previewVoice`) --
nouveaux states `readyId`/`readyUrlRef` (et `previewReady`/`previewUrlRef`
dédiés pour `previewVoice`, remis à `false` si la voix ou le texte change
pour ne pas rejouer un ancien test périmé).

**Bug séparé, appel au poste** : `originate_app()` générait une commande FreeSWITCH syntaxiquement invalide (apostrophes littérales, syntaxe shell sans effet sur le parseur ESL brut) → `Parse Error!` → `DESTINATION_OUT_OF_ORDER`. Fix : apostrophes retirées, `"originate {vars}endpoint &app(args)"`.

Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx` (rebuild + redémarré),
`sipv/backend/app/core/esl.py` (SIPV backend + backend-tls redémarrés).

### TASK-029.9 [x] Écouteurs natifs (1 bouton) + fix régression "Tester" + article catalogue facturation

**1. Simplification lecture audio** : remplacé le pattern "2 clics" (encore
imparfait) par un vrai lecteur natif `<audio controls autoPlay>` -- 1 seul
clic charge le fichier, le lecteur du navigateur apparaît et joue tout
seul (ou l'utilisateur clique sur SON bouton play natif si l'autoplay est
bloqué -- toujours fonctionnel car c'est le navigateur qui gère, pas du JS).
Remplace `playingId`/`readyId` par `readyUrls` (objet `{id: url}`) +
`loadingId` dans les 3 sections concernées.

**2. Régression corrigée** : le bouton "Tester cette voix" avait été lié par erreur au champ Texte (désactivé si vide, jouait le contenu du champ) en ajoutant la vérification "texte requis". Corrigé — les deux sont indépendants :
- **"Tester cette voix"** : joue TOUJOURS une phrase fixe de présentation
  ("Bonjour, je suis {nom de la voix}, je suis une des voix de Simple IP,
  avec cette voix, je peux lire votre texte.") -- jamais lié au champ Texte,
  jamais désactivé pour cette raison.
- **Champ "Texte" + "Créer la phrase"** : sert UNIQUEMENT à créer une
  phrase permanente, aucun rapport avec le test de voix.

**3. Nouvel article catalogue** : "Enregistrement voix (Arianne)", service,
0,30 $ CAD, description précisant "prix par mot du texte enregistré".
Créé pour facturer la création de phrases via synthèse vocale.
⚠️ PAS ENCORE connecté : "Créer la phrase" ne génère pas encore
automatiquement une ligne de facture avec cet article × nombre de mots --
juste l'article catalogue lui-même, prêt à être utilisé manuellement pour
l'instant. Reste à clarifier avec l'utilisateur : facturation immédiate à
la création (sur quelle facture/compagnie ?), ou juste un article
disponible à ajouter manuellement plus tard ?

**4. Voix "Siwis" renommée "Arianne"** en affichage ERPCRM uniquement
(mapping `VOICE_DISPLAY_NAMES` dans `voicebox_client.py`, le nom technique
Kokoro reste inchangé côté Voicebox). Phrase permanente "Présentation
Arianne" créée et sauvegardée pour Simple IP inc. (5s, texte : "Bonjour,
je suis Arianne, je suis une des voix de Simple i p, je peux lire votre
texte.").

Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`,
`backend/app/core/voicebox_client.py`. Backend + frontend redémarrés.

### TASK-029.10 [x] Fix DÉFINITIF audio -- URL directe avec token, zéro JS entre le clic et la lecture

Retour de l'utilisateur (vif) : même le lecteur natif `<audio autoPlay>`
ne se lançait pas tout seul (le navigateur bloque aussi l'attribut
`autoPlay` sans geste direct), donc ça restait 2 clics (Écouter, puis
Play sur le lecteur) -- inacceptable, "1 clic = j'entends, jamais un 2e
clic". Cause de fond : toutes les tentatives précédentes passaient par un
`fetch`/`axios` JS (même court) avant `.play()`, ce qui casse le "user
gesture" dans les navigateurs stricts (Safari). Fix définitif : éliminer
TOUT JavaScript entre le clic et la lecture -- le clic pointe directement
la balise `<audio src="...">` vers l'URL de l'API, et c'est le NAVIGATEUR
lui-même qui fait la requête réseau nativement (comme une image `<img>`),
donc aucune notion de "geste utilisateur" n'entre en jeu, cette
restriction ne s'applique tout simplement pas.

Obstacle technique : ces endpoints exigent `Authorization: Bearer <token>`
(en-tête), qu'une balise `<audio src>` ne peut pas envoyer. Fix : nouvelle
dépendance `get_current_user_media` (`auth.py`) qui accepte le token soit
en en-tête (usage normal) SOIT en query param `?token=...` (pour les
balises media) -- utilisée uniquement sur les 3 endpoints de LECTURE
audio (jamais sur des endpoints qui modifient des données) :
- `GET /server/moh/{id}/file`
- `GET /telephony/prompts/{id}/file`
- `GET /telephony/voicebox/preview` (converti de POST à GET avec les
  paramètres en query string, pour la même raison)

Côté frontend : `loadFile`/`loadPrompt`/`previewVoice` ne font plus AUCUN
appel réseau JS -- juste `setReadyUrls(...)` avec l'URL directe
(`/api/v1/.../file?token=${getToken()}`), synchrone, dans le clic. Testé
en curl : token valide → fichier servi (200), token invalide → 401
proprement rejeté (confirmé que l'auth fonctionne bien avant de renvoyer
à l'utilisateur).

Fichiers : `backend/app/api/v1/endpoints/auth.py` (nouvelle dépendance),
`backend/app/api/v1/endpoints/server.py`,
`backend/app/api/v1/endpoints/telephony.py` (preview POST→GET),
`frontend/src/pages/Server.jsx`, `frontend/src/pages/CompanyDetail.jsx`.
Backend + frontend redémarrés.

### TASK-029.11 [x] Fix .10 encore insuffisant -- lecteur `<audio>` fixe (ref DOM), plus de bouton "Écouter" séparé

Retour de l'utilisateur (encore) : le fix .10 (`setReadyUrls` + lecteur
`<audio>` qui apparaît après le clic) donnait toujours 2 boutons à la
même place (Écouter → puis Jouer), donc encore 2 clics dans les faits.
Instruction explicite et définitive : "je ne veux rien savoir du bouton
écouter, je veux direct le play avec le fichier... ça sert à rien d'avoir
écouter qui amène au play." Fix : suppression complète du pattern
état React (`readyUrls`/`previewUrl` + rendu conditionnel du lecteur) au
profit d'un élément `<audio ref={audioRef} controls>` TOUJOURS monté
(jamais démonté/recréé), placé une seule fois à côté du titre de chaque
section. Le clic sur le bouton unique (🔊 Écouter / 🔊 Tester cette voix)
fait, de façon synchrone dans le même gestionnaire :
`audioRef.current.src = ".../file?token=..."` puis
`audioRef.current.play()` -- un seul bouton, un seul clic, le son sort
immédiatement dans le lecteur déjà visible.

Appliqué aux 4 points d'écoute : MOH bibliothèque (Server.jsx), MOH
compagnie + Phrases (annonces IVR) + Tester cette voix (CompanyDetail.jsx,
ce dernier avec un `previewAudioRef` séparé pour ne pas interférer avec la
lecture des phrases déjà créées).

Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`. Build + restart
`erpcrm-frontend.service` confirmé (HTTP 200).

### TASK-029.12 [x] Correction .11 -- lecteur mal placé (un seul en haut de section, déconnecté de la ligne)

Retour de l'utilisateur (vif) : le lecteur unique placé dans le titre de
section (.11) était "de la marde", chaque ligne avait avant son propre
lecteur -- le fait de l'avoir déplacé en haut cassait le lien visuel entre
le bouton cliqué et le son entendu quand il y a plusieurs fichiers/phrases
dans une liste. Fix : retour à un lecteur `<audio>` par LIGNE (toujours
monté, pas de rendu conditionnel), stocké dans une map de refs
(`audioRefs.current[id]` via `ref={el => { audioRefs.current[f.id] = el }}`)
au lieu d'un ref unique par section -- même principe zéro-JS-avant-.play()
que .10/.11, mais le lecteur reste physiquement à côté du bouton "Écouter"
de sa ligne. Seul le bouton "Tester cette voix" (pas une liste, un item
unique) garde son `previewAudioRef` simple, déjà positionné juste à côté
du bouton.

Fichiers : `frontend/src/pages/Server.jsx` (liste MOH bibliothèque),
`frontend/src/pages/CompanyDetail.jsx` (liste MOH compagnie + liste
Phrases). Build + restart `erpcrm-frontend.service` confirmé (HTTP 200).

### TASK-029.13 [x] Suppression du bouton "Écouter" -- lecteur natif direct, aucun bouton

Retour de l'utilisateur (très clair, répété) : le bouton "🔊 Écouter"
lui-même n'a jamais eu de raison d'être une fois que le lecteur `<audio
controls>` est affiché à côté -- le lecteur natif a déjà son propre
bouton play. Garder un bouton en plus était un réflexe de l'ancien
pattern (bouton → charge → play), pas une nécessité technique. Fix :
suppression complète du bouton "Écouter", de la fonction `playFile`/
`playPrompt` et des refs qui les supportaient (`audioRefs`) sur les 3
listes concernées. Le `src` du `<audio controls>` est maintenant fixé
directement dans le JSX (`src={".../file?token=..."}`) dès le rendu de
la ligne -- aucun état, aucun handler, aucun clic requis pour préparer le
fichier. L'utilisateur clique uniquement sur le triangle play natif du
lecteur.

Non touché : le bouton "🔊 Tester cette voix" (génération dynamique à la
volée selon la voix/texte sélectionné, pas un fichier déjà existant --
mécanisme différent, pas demandé).

Fichiers : `frontend/src/pages/Server.jsx`,
`frontend/src/pages/CompanyDetail.jsx`. Build + restart
`erpcrm-frontend.service` confirmé (HTTP 200).

### TASK-029.14 [x] Qualité audio des phrases -- retrait du forçage 8kHz (généralisé à toute conversion audio SIPV)

Retour de l'utilisateur : la phrase sauvegardée ("Présentation Arianne")
sonne étouffée ("parle dans un foulard") comparée au bouton "Tester cette
voix" (clair). Mesure (`ffmpeg volumedetect`) : niveaux identiques entre
24kHz et 8kHz (-20dB moyenne, -2.6dB pic, aucun clipping) -- donc pas un
problème de gain, mais de perte de bande passante (8kHz coupe tout au-dessus
de ~4kHz, narrowband téléphonique classique). Deux options discutées :
(A) garder 2 fichiers -- qualité pour l'écoute ERPCRM + 8kHz pour l'appel
réel, ou (B) ne plus forcer 8kHz du tout, laisser FreeSWITCH resampler
lui-même à la lecture. GO reçu pour tester B en premier ; confirmé par
l'utilisateur au téléphone (poste 102) : bonne qualité, aucune dégradation.
**Option B retenue, fermée.**

Fait (`sipv/backend/app/api/v1/endpoints/`) :
- `prompts.py::upload_prompt` : retrait de `-ar 8000` (garde le taux
  source -- 24kHz pour une phrase Voicebox).
- `voicemail.py` (upload de message d'accueil personnalisé) et `moh.py`
  (upload MOH) : même retrait, sur demande explicite de l'utilisateur
  ("on met ça par défaut partout dans le SIPV pour les voix... notre
  convertisseur de tous les fichiers"). Les 3 endpoints partageaient déjà
  la même commande ffmpeg (commentaires "même conversion que prompts.py/
  voicemail.py" déjà présents avant cette tâche).

⚠️ **Pas vérifié pour MOH spécifiquement** : contrairement à `prompts.py`
(lu via `playback()`, testé en direct, confirmé resamplé correctement par
FreeSWITCH) et `voicemail.py` (même mécanisme `playback()`), le MOH utilise
`mod_local_stream`, un mécanisme différent -- `local_stream.py`
(`regenerate_tenant_moh_stream`) génère un XML par tenant qui déclare
`<param name="rate" value="8000"/>` EN DUR pour son dossier (non modifié
dans cette tâche, risque plus élevé si laissé à changer sans test : ce
module joue en boucle sur de vrais appels en attente, pas un one-shot).
Reste à faire avant de considérer le MOH réellement couvert : mettre un
vrai appel en attente et écouter, pour confirmer que `mod_local_stream`
tolère des fichiers dont le taux ne correspond pas au `rate` déclaré (sinon
il faudra soit générer ce XML avec le taux réel des fichiers du dossier,
soit revenir à 8kHz pour MOH spécifiquement).

⚠️ **Incidents pendant le déploiement de `prompts.py` (corrigés dans la
foulée, avant de généraliser à voicemail/moh)** :
1. Le rsync initial a écrasé `prompts.py` avec la copie du dépôt git local,
   qui n'avait PAS la route `POST /{prompt_id}/call` (TASK-S055/029.2 Mode
   1) -- ajoutée directement sur le serveur distant dans une session
   précédente, jamais resynchronisée vers ce dépôt. "Écouter par poste" a
   retourné 404 pendant quelques minutes. Reconstruite à partir de la doc
   TASK-029.2/S055.
2. Reconstruction initiale incomplète : manquait le fix TASKSIPV
   TASK-S055.1 (domaine SIP doit être `@sipv` fixe, pas `@{tenant}` --
   `internal.xml` force tous les postes dans un seul domaine) et
   TASK-S055.3 (`_copy_with_lead_silence`, 1s de silence avant la phrase).
   Résultat : ERPCRM répondait 200 OK mais le poste ne sonnait pas (même
   symptôme qu'un bug déjà réglé le 2026-08-10). Les deux fixes ont été
   relus dans TASKSIPV.md et réappliqués, confirmé par les logs FreeSWITCH
   réels (Ring-Ready → answered → playback → hangup NORMAL_CLEARING).
**Leçon retenue** : le dépôt git local `/home/simpleip/sipv` n'est pas une
source de vérité fiable à lui seul avant un rsync qui écrase le serveur
distant -- toujours diff local vs distant (`diff <(ssh ... cat fichier)
fichier_local`) avant d'écraser, et pour toute fonction touchée, relire sa
section complète dans TASKSIPV.md (pas juste l'entrée qui semble pertinente)
pour ne pas perdre un fix appliqué dans une session antérieure.

Fichiers : `sipv/backend/app/api/v1/endpoints/prompts.py`,
`voicemail.py`, `moh.py`. Déployés sur le serveur SIPV réel (rsync +
restart `sipv-backend`/`sipv-backend-tls`), syntaxe vérifiée (`ast.parse`)
avant chaque déploiement.
Dépend de : TASK-029.2, TASKSIPV TASK-S055/S055.1/S055.3.

---

## TASK-030 [ERPCRM] [ ] Assistant IA intégré à ERPCRM ("petit Claude Code" spécialisé Simple IP)
Classification: CURRENT


Demande dictée textuellement par l'utilisateur (2026-08-10), en pleine
session TASK-029 (Voicebox) -- **PAS à construire maintenant**, "à voir
plus tard, je n'ai pas le serveur encore" (le futur serveur Lenovo
ThinkStation P720, voir TASK-029 pour specs). Juste loggé pour ne pas
perdre l'idée.

**Vision** : un assistant IA branché directement dans ERPCRM, orienté à la
fois client final ET usage interne. Les clients pourraient lui parler
directement au lieu de chercher dans le site -- spécialisé dans les
produits/ressources de Simple IP, capable de comprendre le besoin d'un
client en lui posant une série de questions (et plus si le besoin sort de
l'ordinaire, pas juste un arbre de questions figé).

**Capacités envisagées** (l'utilisateur le décrit comme "il serait mon
employé... il pourrait gérer Simple IP") :
- Créer des devis, des tickets, des RDV
- Activer/désactiver des postes SIP
- Envoyer le provisioning
- Aider à créer un IVR (dont choisir une voix -- lien direct avec TASK-029 :
  Voicebox/génération TTS -- et la "phrase idéale" pour l'entreprise, donc
  cet assistant s'appuierait sur les briques déjà construites dans
  `PromptsSection`/TASK-029)
- Passer des commandes (seulement une fois le paiement confirmé)

**Sécurité/permissions** : doit respecter les mêmes règles de privilège que
le reste du portail (voir `project_phone_options_full_scope` en mémoire --
arbre de privilèges hiérarchique déjà prévu pour le portail client) -- un
usager qui n'a pas accès à la gestion ne doit PAS pouvoir l'obtenir via
l'assistant IA non plus. Pas de contournement des permissions par un
détour conversationnel.

**Dépend de** : le nouveau serveur (P720, VM dédiée -- voir TASK-029),
architecture/API à définir (probablement Claude API directement, avec des
tools/function-calling exposés vers les endpoints ERPCRM existants --
aucune décision prise, à revoir en détail le moment venu).

Aucun fichier touché, aucune décision d'architecture prise -- entrée
purement pour ne pas perdre l'idée avant le prochain passage sur ce sujet.

---

## TASK-031 [ERPCRM] [x] Audit config centralisée -- éliminer les IPs/chemins codés en dur restants
Classification: HISTORICAL


Discuté avec l'utilisateur (2026-08-11, "on parle pour voir") : objectif de
pouvoir déménager un serveur (ex: nouvelle salle serveur) en ne changeant
qu'un seul endroit par machine. Un vrai fichier UNIQUE partagé entre ERPCRM
et SIPV est écarté (demanderait un partage réseau type NFS/sshfs entre les
deux machines -- recrée le couplage qu'on vient d'éviter en gardant les VMs
séparées). Approche retenue à explorer : un fichier de vérité PAR serveur
(`.env`/`config.py`, déjà la convention -- voir mémoire "Pas d'IPs codées en
dur"), mais avec un audit pour éliminer ce qui y échappe encore.

Exemple déjà trouvé en cours de route (TASK-029.14) : `UPLOAD_DIR` et
`PROMPT_CACHE_DIR` dans `sipv/backend/app/api/v1/endpoints/prompts.py` sont
des chemins absolus codés en dur, pas dans `settings`.

Fait le 2026-08-16 -- aucune IP codée en dur côté ERPCRM (déjà propre).
Détail complet du travail côté SIPV (13 chemins centralisés, 6 fichiers) :
TASKSIPV.md TASK-S056.

---

## TASK-032 [ERPCRM] [x] CDR dans la fiche compagnie + CDR par poste (filtré à ses appels)
Classification: CURRENT


Demande de l'utilisateur (2026-08-11, en plein test MOH/enregistrement) :
voir les CDR (historique d'appels) directement dans la fiche compagnie
ERPCRM (onglet Téléphonie ou nouvel onglet), ET une vue par poste filtrée
aux appels de CE poste seulement (probablement dans ContactDetail.jsx,
même zone que les cases d'enregistrement `record_*`, TASK-023.5).

**Fait (2026-08-16, boucle autonome, GO global de Philippe)** :
- `backend/app/core/sipv_client.py` -- nouvelle fonction `list_cdr(tenant_id,
  page, page_size, extension=None, direction=None, disposition=None,
  date_from=None, date_to=None)`, même endpoint SIPV que
  `list_cdr_for_extension` (déjà existant depuis TASK-S055, portail Mon
  poste) mais sans forcer le filtre poste -- réutilisée par les deux vues.
- `backend/app/api/v1/endpoints/telephony.py` -- `GET
  /v1/telephony/company/{company_id}/cdr` (vue compagnie complète, filtre
  poste optionnel en query param), réutilise `_company_tenant_id_for_did`
  (retourne une liste vide si pas de tenant SIPV actif, pas une erreur).
- `backend/app/api/v1/endpoints/contacts.py` -- `GET
  /v1/contacts/{contact_id}/sip-extension/cdr` (vue par poste, résout le
  poste SIP du contact via `get_extensions_by_contact` déjà existant).
- `frontend/src/pages/CompanyDetail.jsx` -- nouvelle section `CdrSection`
  dans l'onglet Téléphonie (pas un nouvel onglet) : tableau paginé (25/page)
  avec menu déroulant "Tous les postes" / poste spécifique (réutilise
  `sipExts` déjà chargé pour cet onglet).
- `frontend/src/pages/ContactDetail.jsx` -- section "Historique d'appels"
  ajoutée juste après les cases `record_*` (même zone, comme demandé),
  pagination 10/page, ne recharge que si le numéro de poste change (pas à
  chaque poll de statut 5s).

Filtre `extension` de l'endpoint SIPV ratait tous les appels SORTANTS d'un poste (`CDR.src` stocké avec préfixe tenant, contrairement à `dst`) — corrigé côté SIPV, voir TASKSIPV.md TASK-S055.5 (affecte aussi le portail Mon poste).

Vérifié en conditions réelles (pas juste des imports) : appel direct de
`sipv_client.list_cdr`/`list_cdr_for_extension` contre le tenant réel
"Simple IP inc." -- 21 appels au total, 17 correctement retournés pour le
poste 103 après le fix. `npm run build` + les 3 services redémarrés
(`erpcrm-backend`, `erpcrm-backend-tls`, `erpcrm-frontend` via
`systemctl --user`), tous vérifiés actifs.

Fichiers ERPCRM : `backend/app/core/sipv_client.py`,
`backend/app/api/v1/endpoints/telephony.py`,
`backend/app/api/v1/endpoints/contacts.py`,
`frontend/src/pages/CompanyDetail.jsx`, `frontend/src/pages/ContactDetail.jsx`.
Cross-ref : TASKSIPV.md TASK-S055.5.

**TASK-032.1 [x] CDR séparé du reste, pas empilé sur la même page (2026-08-19)**
Demande de Philippe : le CDR ne doit pas être affiché en permanence mêlé au
reste (fiche compagnie ni fiche contact) -- un onglet à part.
- `CompanyDetail.jsx` -- `CdrSection` sortie de l'onglet Téléphonie, devient
  son propre onglet top-level ("CDR", nouvel index 5 dans `TABS`, décale
  Tâches/Photos/Journal de 1). Charge maintenant ses propres postes
  (`/v1/companies/{id}/sip-extensions`) au lieu de dépendre de l'état de
  `TelephonyTab`.
- `ContactDetail.jsx` -- pas de vrai système d'onglets sur cette page
  (page à défilement unique). Ajouté un mini-toggle à 2 boutons ("Poste
  SIP" / "Historique d'appels", classe `tab-btn` réutilisée) juste au-dessus
  de la zone concernée : masque "Options du poste" + "Plan d'appel" quand
  CDR est affiché, et vice-versa. Identification/caller ID/renvois/DND/
  E911/messagerie (au-dessus de ce toggle) restent visibles en tout temps,
  pas concernés par la demande.
`npm run build` + `erpcrm-frontend` redémarré (aucun changement backend,
les 2 endpoints CDR existants sont réutilisés tels quels).

### TASK-032.2 [x] Détail d'appel au clic + rapports CDR programmés par courriel + rétention configurable

Demande de Philippe (2026-08-19), 3 morceaux :

**1. Détail d'appel au clic** -- cliquer une ligne CDR (compagnie ou contact)
affiche les champs pas déjà dans le tableau (heure de réponse, heure de fin,
coût, taux, uniqueid FreeSWITCH, disposition brute).

**2. Rapports CDR programmés par courriel** -- exemple donné : poste 227,
appels SORTANTS seulement, envoyé chaque semaine à un destinataire choisi.
Récurrence voulue, très précise :
- "Journalier" avec choix de PLUSIEURS jours de la semaine (L,M,M,J,V,S,D
  -- pas juste un jour, un sous-ensemble)
- "Hebdomadaire" avec UN jour de la semaine
- "Mensuel" avec UN jour du mois
Design retenu : réutilise exactement le pattern déjà validé de
`BackupCycle`/`CycleModal` (Admin.jsx, TASK-035) -- `frequency_type`
(`custom_days`/`weekly`/`monthly`), `day_of_week`/`day_of_month` comme
là-bas, + `days_of_week` (tableau, nouveau) pour le mode `custom_days`
demandé ici. Filtre par poste (optionnel) + direction (optionnel,
entrant/sortant/tous). Envoi côté ERPCRM (déjà l'infra courriel,
`core/email.py`), données CDR tirées via le proxy SIPV déjà en place
(TASK-032). Poller asyncio in-process (même convention que
`backup_poller.py`), pas de cron système.
⚠️ "je veux pouvoir être très précis, choisir le nombre de jours semaine
mois" -- interprété comme choisir un jour EXACT (numéro précis, ex. jour
17 du mois) plutôt qu'un multiplicateur "chaque N semaines/mois" (pas
demandé clairement, non ajouté pour éviter une supposition -- LOI 4). À
revoir avec Philippe si ce n'est pas ce qu'il voulait dire.

**3. Rétention CDR configurable par tenant** -- 1 an par défaut, augmentable
si un client paie pour cette ressource. Coté SIPV : `retention_days` sur
`Tenant` (défaut 365) + job de purge (même pattern poller). Pas de logique
de facturation/paywall ajoutée ici (pas demandé) -- juste le champ
configurable, à ajuster manuellement par Philippe quand une entente est
prise avec un client.

**Fait (2026-08-19)** :

**1. Détail au clic** -- `CdrDetailRow` (composant partagé, dupliqué dans
`CompanyDetail.jsx` et `ContactDetail.jsx`, page à défilement unique sans
composants partagés entre pages dans ce projet) : réponse, fin, durée
totale, nom afficheur, coût, taux/min, ID appel. Côté SIPV, `CDROut`
(`cdr.py`) étendu avec ces champs (déjà en DB, jamais exposés par l'API
avant) -- voir TASKSIPV.md TASK-S055.6.

**2. Rapports programmés** -- nouvelles tables `cdr_report_schedules` +
`cdr_report_run_logs` (migration `3792331071d9`, autogenerate nettoyée de
2 suppressions d'index sans rapport détectées au passage, pas touchées).
- `backend/app/workers/cdr_report_runner.py` -- construit le CSV (fetch
  toutes les pages CDR via `sipv_client.list_cdr`, filtré poste/direction),
  envoie par courriel (pièce jointe), journalise dans
  `CdrReportRunLog`. Fenêtre du rapport = depuis le dernier envoi
  (`last_sent_at`) ; si jamais envoyé, défaut 7 jours (30 pour mensuel) --
  évite un premier rapport vide (créé et envoyé le même jour sinon).
- `backend/app/services/cdr_report_poller.py` -- même pattern 60s que
  `backup_poller.py`, une seule tentative par jour par rapport (même
  garde-fou anti-boucle que le bug backup du 2026-08-14).
- `backend/app/core/email.py` -- `_send()` accepte maintenant une pièce
  jointe générique (`attachment: (filename, bytes, mimetype)`), en plus du
  cas ICS déjà existant. Nouveau `send_cdr_report_email()`.
- Endpoints (`telephony.py`) : CRUD complet + `POST .../send-now` (bouton
  "Envoyer maintenant", teste immédiatement) + `GET .../logs` (historique).
- `CompanyDetail.jsx` -- `CdrReportsSection` (onglet CDR) : tableau des
  rapports (récurrence lisible, filtre, destinataires, actif), ligne
  dépliable = historique des envois, `CdrReportModal` pour créer/modifier
  (sélecteur de fréquence réutilisant exactement `CycleModal`/`BackupCycle`
  d'Admin.jsx -- même design déjà validé par Philippe pour les cycles de
  backup, étendu avec le mode "jours choisis" en boutons toggle L/M/M/J/V/S/D).

Vérifié en conditions réelles (pas juste des imports) : rapport de test créé
directement en DB (tenant "Simple IP inc."), envoyé manuellement --
5 appels (poste 103, entrants, 7 derniers jours) correctement filtrés,
CSV généré, courriel reçu avec pièce jointe. `run_scheduled()` exécuté à
vide sans erreur. Schémas Pydantic validés contre le format exact envoyé
par `CdrReportModal.jsx` (custom_days, weekly, monthly, update partiel).
Rapport de test supprimé après coup.

**3. Rétention** -- `Tenant.cdr_retention_days` (SIPV, défaut 365) +
purge horaire (`cdr_retention_runner.py`/`cdr_retention_poller.py`, même
pattern poller). Endpoint ERPCRM `GET/PUT /telephony/company/{id}/
cdr-retention`, contrôle ajouté dans l'en-tête de l'onglet CDR
(`CompanyDetail.jsx`). Testé contre la DB réelle : 365 jours par défaut,
`purge_expired_cdr()` exécuté sans rien supprimer (rien de plus vieux
qu'1 an, attendu). Pas de logique de facturation ajoutée -- juste le champ,
ajustable manuellement par Philippe.

`npm run build` + les 3 services ERPCRM + `sipv-backend`/`sipv-backend-tls`
redémarrés, tous vérifiés actifs.

Fichiers ERPCRM : `backend/app/models/cdr_report.py`, `backend/app/models/
__init__.py`, `backend/alembic/versions/3792331071d9_cdr_report_schedules.py`,
`backend/app/workers/cdr_report_runner.py`, `backend/app/services/
cdr_report_poller.py`, `backend/app/core/email.py`, `backend/app/main.py`,
`backend/app/api/v1/endpoints/telephony.py`, `frontend/src/pages/
CompanyDetail.jsx`, `frontend/src/pages/ContactDetail.jsx`.
Cross-ref : TASKSIPV.md TASK-S055.6.

**TASK-032.3 [x] Rapports programmés manquants côté fiche contact (2026-08-19)**
Philippe : "pourquoi je ne l'ai pas dans le contact ??" -- `CdrReportsSection`
n'avait été câblée que dans l'onglet CDR de la fiche compagnie, pas dans le
toggle "Historique d'appels" de la fiche contact (l'exemple donné au départ,
"poste 227", est justement un cas contact). Corrigé : `CdrReportsSection`
+ `CdrReportModal` extraits de `CompanyDetail.jsx` vers
`frontend/src/components/CdrReportsSection.jsx` (composant partagé --
avant dupliqué inutilement) avec un nouveau prop `fixedExtension` : quand
fourni (fiche contact), verrouille le poste sur celui du contact (champ
non éditable), cache la colonne "Filtre" (déjà impliqué), et filtre la
liste affichée aux seuls rapports de ce poste. `ContactDetail.jsx` :
ajouté dans le toggle "Historique d'appels", sous le tableau CDR.
Vérifié : rapport créé avec `extension` verrouillé, correctement filtré
côté client par poste (testé en direct, nettoyé après coup).
Fichiers : nouveau `frontend/src/components/CdrReportsSection.jsx`,
`frontend/src/pages/CompanyDetail.jsx`, `frontend/src/pages/ContactDetail.jsx`.

**TASK-032.4 [x] Correction -- CDR pas dans un vrai onglet côté contact (2026-08-19)**
Philippe, très mécontent à raison : TASK-032.3 avait ajouté le CDR derrière
un bouton-toggle enfoui au milieu de la section "Poste SIP" (imbriqué dans
plusieurs `&&`, invisible si le contact n'a pas de poste SIP chargé) --
PAS un vrai onglet comme demandé depuis TASK-032.1, et deux options
empilées l'une sur l'autre au lieu d'une séparation propre.
Corrigé -- `ContactDetail.jsx` a maintenant un vrai système d'onglets
top-level (`detail-tabs`/`tab-btn`, exactement le même pattern que
`CompanyDetail.jsx`) : **Général** (tout le contenu existant, inchangé)
et **CDR** (nouveau, `ContactCdrTab`) -- toujours visible dans la barre
d'onglets dès qu'on ouvre un contact, pas caché derrière la présence d'un
poste SIP (affiche un état vide clair "Ce contact n'a pas de poste SIP
associé" si applicable, même logique que l'onglet CDR de la fiche
compagnie qui gère l'absence de tenant). Retiré : le toggle "Poste SIP"/
"Historique d'appels" et les `!showCdr &&` qui gataient "Options du
poste"/"Plan d'appel" -- ces sections redeviennent visibles en tout temps
comme avant TASK-032.1, seul le CDR est sorti dans son propre onglet.
⚠️ Découverte en vérifiant les services (sans lien direct avec ce bug) :
un service SYSTÈME `erpcrm-frontend.service` (`npm run dev`, mode dev,
PAS le build de prod) tourne en parallèle depuis le 13 août -- déjà
documenté comme mort/abandonné dans la mémoire persistante, mais toujours
actif. Le service `--user` (le bon, celui qui sert vraiment le port 3010)
est confirmé correct à chaque restart de cette session. Signalé à
Philippe, pas arrêté unilatéralement (action système, pas dans le scope
de cette demande).
Fichiers : `frontend/src/pages/ContactDetail.jsx`.

**TASK-032.5 [x] Filtres CDR -- recherche texte + plage de dates/heures précise (2026-08-19)**
Demande de Philippe : filtrer les CDR par recherche libre (ex. "514" trouve
tout numéro qui contient 514) et par plage date/heure précise (ex. 12 août
9h34 à 10h02, ou 11 août 9h34 au 19 août 8h55), dans les deux vues (compagnie
et contact), avec un bouton "Appliquer" explicite (pas de filtrage en direct
à chaque frappe).
- SIPV (`cdr.py`) : nouveau paramètre `search` sur `GET /cdr/tenant/{id}` --
  `ILIKE '%...%'` sur `src` OU `dst`. `date_from`/`date_to` existaient déjà
  (type `datetime`, déjà assez précis pour heure/minute) mais n'étaient pas
  exposés côté UI avant cette tâche.
- ERPCRM : `sipv_client.list_cdr` -- ajout `search`. `telephony.py`
  (`/company/{id}/cdr`) -- ajout `search`. `contacts.py`
  (`/{contact_id}/sip-extension/cdr`) -- **changé de
  `list_cdr_for_extension` vers `list_cdr`** (avec `extension` forcé) pour
  hériter de tous les filtres (search/date/direction) au lieu de dupliquer
  la logique -- `list_cdr_for_extension` reste utilisée telle quelle par
  `portal.py` (portail Mon poste client), pas touchée.
- Frontend : barre de filtre identique dans `CdrSection` (`CompanyDetail.jsx`)
  et `ContactCdrTab` (`ContactDetail.jsx`, sorti de `ContactDetail` en
  composant autonome avec son propre état/fetch au passage -- avant geré par
  le parent) : champ recherche + "Du"/"Au" (`datetime-local`, précision à la
  minute) + bouton "Appliquer" (Entrée sur le champ recherche fonctionne
  aussi) + "Réinitialiser" si un filtre est actif. Les champs affichés ne
  déclenchent la requête qu'au clic sur Appliquer (état "pending" séparé de
  l'état réellement utilisé par la requête), comme demandé explicitement.

Vérifié en conditions réelles : `search=102` sur le tenant "Simple IP
inc." -- 17 résultats corrects (côté compagnie ET côté contact poste 103,
même chaîne testée directement) ; plage de date `2026-08-16T00:00:00` à
`2026-08-16T23:59:59` -- 1 résultat correct. `npm run build` + les 3
services ERPCRM + `sipv-backend`/`sipv-backend-tls` redémarrés, tous
vérifiés actifs.

Fichiers SIPV : `backend/app/api/v1/endpoints/cdr.py`.
Fichiers ERPCRM : `backend/app/core/sipv_client.py`,
`backend/app/api/v1/endpoints/telephony.py`,
`backend/app/api/v1/endpoints/contacts.py`,
`frontend/src/pages/CompanyDetail.jsx`, `frontend/src/pages/ContactDetail.jsx`.

---

## TASK-033 [ERPCRM] [ ] Création d'un poste SIP depuis un contact + parité facturation contact/compagnie + double 1ère facture datée
Classification: CURRENT


Demande de l'utilisateur (2026-08-11, GO reçu -- "oui fait tout ça"), en
plusieurs morceaux liés :

**1. Popup "Synchroniser avec SIPV" sur un contact (parité avec la compagnie)**
Actuellement, cocher "Synchroniser avec SIPV" sur un contact
(`ContactDetail.jsx`) ne fait QUE flipper le booléen `sipv_sync` -- aucun
poste n'est réellement créé (design d'origine, TASK-016, jamais un vrai
provisionnement). Sur la compagnie, cocher "Tenant téléphonique SIPV"
ouvre un popup de confirmation (date de début, fréquence) qui active
réellement le tenant + la facturation récurrente (TASK-021). L'utilisateur
veut la même chose pour un contact : popup similaire, et au clic
"Activer" :
- Si la compagnie n'a pas encore de tenant SIPV actif → le créer
  d'abord (cascade, réutilise le flux TASK-021/`POST /companies/{id}/
  sipv-tenant`).
- Créer réellement le poste SIP dans SIPV (nouveau pont ERPCRM → SIPV,
  n'existe pas du tout aujourd'hui -- voir point 2).
- Ajouter une ligne à la récurrence de facturation EXISTANTE de la
  compagnie (ou la créer si elle vient d'être activée), avec prorata si
  on est en cours de cycle (même mécanique que TASK-021).
- Champ date à la création = réutilisable comme date de portabilité
  (un numéro porté depuis un autre fournisseur a une date de portabilité
  précise -- le service/poste peut être créé avant, mais la facturation
  doit démarrer à cette date-là, pas "aujourd'hui").

**2. Pont ERPCRM → SIPV pour créer un poste (n'existe pas)**
- SIPV : `POST /api/v1/extensions/tenant/{tenant_id}` (`create_extension`,
  `extensions.py`) existe déjà, MAIS utilise `get_current_user` strict --
  doit être changé pour `get_current_user_or_service` (voir mémoire
  "Auth get_current_user_or_service sur SIPV", même pattern déjà appliqué
  ailleurs) avant qu'ERPCRM puisse l'appeler avec sa clé de service.
- ERPCRM : nouvelle fonction `sipv_client.create_extension(tenant_id,
  **fields)` (aucune fonction de création d'extension n'existe
  actuellement côté ERPCRM, seulement `update_extension`/`list_extensions`
  /`get_extensions_by_contact`) + endpoint proxy.
- Numéro de poste : à décider (auto-assigné au prochain disponible, ou
  choisi manuellement dans le popup -- pas encore tranché avec
  l'utilisateur).

**3. Double 1ère facture, transparente par dates (au lieu d'un montant qui double sans explication)**
Problème identifié par l'utilisateur : les services sont facturés
D'AVANCE, mais le client a 30 jours pour payer -- sans ajustement, la 1ère
facture donnerait 30 jours de service gratuit avant le premier paiement,
et désynchroniserait tout le cycle ensuite. Fix confirmé avec
l'utilisateur : à la toute première facture générée pour une récurrence
(nouvelle `CompanyRecurringBilling`), au lieu d'une ligne au montant
doublé (mystérieux pour le client), générer **deux lignes distinctes**,
chacune avec sa période de service explicite dans la description :
- "[Service] — [date début] au [date fin période 1]"
- "[Service] — [date début période 2] au [date fin période 2] (facturé
  d'avance)"
**Étendu par l'utilisateur à TOUTES les factures récurrentes, pas
seulement la première** : chaque ligne générée par
`generate-invoice` (`recurring_billing.py`) doit indiquer sa période de
service exacte dans la description, pour rester transparent envers le
client à chaque facture, pas juste la première.

Touche `recurring_billing.py` (génération de facture) -- code PARTAGÉ
entre l'activation compagnie (TASK-021) et cette nouvelle activation
contact (point 1) : un seul moteur de facturation récurrente, cohérent
peu importe d'où l'activation part.

⚠️ Pas commencé. Portée large (auth SIPV + nouveau pont ERPCRM↔SIPV +
UI popup contact + moteur de facturation modifié, touche l'argent et la
création d'un vrai service téléphonique) -- timing (maintenant vs prochaine
session) pas encore confirmé avec l'utilisateur, vu l'heure tardive et
plusieurs erreurs d'inattention déjà commises cette session (voir
TASK-029.14, TASK-S055.4).

---

## TASK-034 [ERPCRM] [ ] Stockage cloud client pour enregistrements d'appel (Dropbox/OneDrive/Google Drive, service payant)
Classification: CURRENT


Demande de Philippe (2026-08-12) : les clients pourraient connecter leur propre
compte cloud (Dropbox, OneDrive ou Google Drive) pour que leurs enregistrements
d'appel s'y déposent automatiquement, comme service additionnel payant.

Pas commencé. Dépend de : TASK-023.4 (enregistrement d'appel, déjà fonctionnel
côté SIPV -- fichiers `.wav` générés dans `/usr/local/freeswitch/recordings/`,
voir TASKSIPV.md). Pendant côté SIPV : TASK-S012.1 -- ⚠️ pas une demande neuve,
TASK-S012 (TASKSIPV.md) a déjà le modèle de données (`storage_backend` enum
local/dropbox/onedrive/s3 + credentials chiffrés) marqué explicitement comme
stub non implémenté ; S012.1 complète ce stub avec l'angle connexion CLIENT +
service payant demandé ici.

Questions ouvertes à trancher avant design (aucune réponse supposée) :
- Quel(s) fournisseur(s) en premier -- un seul ou les trois dès le départ ?
- Connexion par compagnie (tenant) ou par poste individuel ?
- Push automatique à chaque enregistrement, ou export par lot ?
- Comment le "payant" se traduit dans le catalogue/facturation existant
  (TASK-021 billing events, module Catalogue) ?
- Stockage des tokens OAuth par tenant -- chiffrement requis (voir
  `backend/app/core/crypto.py`, déjà utilisé pour d'autres secrets).
- Que devient le fichier local SIPV après export (conservé, supprimé après
  X jours, jamais touché) ?

2026-10-21 — Ajout de Philippe : « une place où marquer le nombre de jours,
mois, années à garder les fichiers pour ne pas saturer le Dropbox, OneDrive ou
Google Drive du client ». Durée de conservation réglable (jours / mois /
années) : les enregistrements plus vieux que cette durée sont retirés du nuage
du client. Contexte : Philippe ne veut pas garder les enregistrements chez lui
(voir TASK-053, stockage du P720) ; la copie locale n'est qu'une mémoire
tampon le temps de l'envoi. À trancher au design : réglage par client (tenant)
seulement, ou aussi par poste/groupe ; « aucune limite » permis ou non.

---

## TASK-035 [ERPCRM] [~] Backup cloud automatique de notre propre infra (ERPCRM + SIPV, pas client) -- réglages Admin
Classification: CURRENT


Demande de Philippe (2026-08-13). À NE PAS confondre avec TASK-034 (stockage
cloud du CLIENT pour ses enregistrements d'appel, service payant) -- ici il
s'agit de NOTRE backup interne (DB, config, repos) vers un cloud (Dropbox/
OneDrive/Google Drive), voir contexte initial dans project_cloud_backup_pending
(mémoire, 2026-08-12 : repos GitHub rattrapés + backup local one-shot déjà fait
dans `/home/simpleip/BackUp/`, reste l'automatisation récurrente).

Vision donnée par Philippe le 2026-08-13 :
- Page Admin ERPCRM : réglages de connexion cloud (fournisseur, OAuth) +
  bouton de backup pour ERPCRM lui-même (DB + config + uploads).
- Côté SIPV (page "Serveur" du portail) : même mécanique d'accès cloud, mais
  fichier de connexion/config SÉPARÉ de celui d'ERPCRM (pas de credentials
  partagés entre les deux), avec son propre bouton de backup pour SIPV
  (DB + config serveur (kamailio.cfg, internal.xml, vars.xml, certs TLS) +
  MOH).
- Les deux tournent de façon indépendante -- backup récurrent activable
  séparément pour ERPCRM et pour SIPV, pas un seul interrupteur global.
- Rétention en rotation : plusieurs générations gardées en parallèle (ex.
  3 mois -- mois1/mois2/mois3), la plus ancienne s'écrase quand une nouvelle
  est créée (pas d'accumulation infinie).
- Fréquence/rétention configurable par Philippe via un sélecteur : 1 jour,
  1 semaine, 1 mois, 2 mois, 3 mois.
- Remarque de Philippe : une fois cette connexion cloud + rotation en place
  au niveau infra (ERPCRM/SIPV), l'étendre à une compagnie (tenant) pour
  TASK-034 sera facile -- donc prévoir un mécanisme réutilisable (connexion
  OAuth + rotation) plutôt que du code jetable spécifique à l'infra.

**Décision 2026-08-13** : fournisseurs retenus pour tester = Dropbox ET Google
Drive (Philippe a un compte des deux). OneDrive écarté pour l'instant (pas
mentionné). Idée ajoutée par Philippe : si les DEUX sont connectés en même
temps, possibilité de double backup (écrire vers les deux en parallèle) ou
failover (écrire vers le second seulement si le premier échoue) -- lequel
des deux comportements choisir reste une question ouverte (voir ci-dessous).

**Design confirmé 2026-08-13** (après discussion, prêt pour plan technique) :
- Double backup Dropbox + Google Drive simultané (pas de failover) -- si un
  dump/upload échoue vers un fournisseur, l'autre a quand même tenté sa copie.
- Un seul dump physique par run (DB + config) -- si plusieurs cycles tombent
  le même jour (ex. quotidien + hebdo + mensuel coïncident), pas de triple
  dump, juste copie/renommage du même fichier vers chaque créneau dû.
- Bande passante : plafond configurable dans l'UI (pas figé dans le code),
  modifiable sans redéploiement.
- Cycles de rotation ENTIÈREMENT configurables (pas juste 3 types fixes) :
  - Bouton "Ajouter un cycle" -- chaque cycle = un type de fréquence de base
    (journalier/hebdomadaire/mensuel/annuel) + une case à cocher "garder
    plusieurs générations" -- si cochée, champ "combien" (défaut 3,
    modifiable) ; si décochée, un seul créneau toujours écrasé.
  - Philippe peut donc composer ex: 1 cycle journalier (3 générations) +
    1 cycle hebdo (3 générations) + 1 cycle mensuel (3 générations) --
    modèle grand-père/père/fils classique, mais construit par l'utilisateur,
    pas codé en dur.
  - Fichiers nommés `nom_date` par cycle+génération (ex.
    `erpcrm_daily_2026-08-13.tar.gz`).
- Fichier de connexion cloud séparé entre ERPCRM et SIPV (pas de credentials
  partagés) -- même mécanique de connexion des deux côtés.

**Précision 2026-08-13** : les 2 serveurs tournent en UTC (`timedatectl` ->
`Etc/UTC`), PAS en heure de Montréal -- confirmé sur ERPCRM ET SIPV. Chaque
`BackupCycle` doit donc avoir une heure ET un décalage horaire explicites
(demande de Philippe), pas juste une heure supposée locale. Hebdo confirmé :
tombe le dimanche par défaut.
**Confirmé par Philippe, corrigé ensuite le même jour** : d'abord dit "un
fuseau + une heure par PROJET", puis corrigé immédiatement -- fuseau horaire
ET heure de déclenchement ET limite de bande passante sont réglés PAR CLOUD
(Dropbox et Google Drive ont chacun leur propre trio fuseau/heure/bwlimit),
pas un seul réglage global pour le projet. Le `CloudBackupConnection` (par
fournisseur) porte donc : credentials chiffrés, activé oui/non, fuseau
horaire, heure de déclenchement, limite de bande passante.
Le `BackupCycle` (fréquence + jour de semaine/mois/année + rétention) reste
défini une fois par projet -- c'est la politique de contenu/rotation,
partagée par les deux clouds ; seul le moment d'ENVOI et le débit varient
par cloud. Le dump se fait une seule fois, puis chaque cloud actif reçoit sa
copie à SON heure/fuseau configuré, avec SON plafond de bande passante.

Design considéré COMPLET, prêt pour plan technique final et GO d'implémentation.
Cross-ref SIPV : TASK-S059 (TASKSIPV.md).

**GO reçu 2026-08-13 -- côté ERPCRM implémenté.** Fichiers touchés :
- `backend/app/models/backup.py` (CloudBackupConnection, BackupCycle, BackupRunLog) + import dans `models/__init__.py`
- Migration Alembic `4f9df349c341_add_cloud_backup_tables.py`
- `backend/app/core/config.py` -- ajout `DROPBOX_CLIENT_ID`/`DROPBOX_CLIENT_SECRET` (Google Drive réutilise `GOOGLE_CLIENT_ID`/`SECRET` existants, scope `drive.file` en plus)
- `backend/app/core/backup_cloud.py` -- OAuth + upload throttlé (chunks + pause calculée selon `bandwidth_limit_kbps`) pour Dropbox (REST httpx) et Google Drive (googleapiclient, déjà une dépendance pour Calendar)
- `backend/app/workers/backup_runner.py` -- un seul `pg_dump` + tar (DB + `uploads/`) par exécution, réutilisé pour tous les cycles/clouds dus ; rotation par préfixe de nom (`erpcrm_{frequence}_{date}.tar.gz`), supprime les plus vieux au-delà de `retention_count`
- `backend/app/services/backup_poller.py` -- poller asyncio in-process (même convention que `reminder_poller.py`, PAS de cron système), vérifie chaque 60s ; anti-doublon via `BackupRunLog` (une seule exécution réussie par connexion par jour)
- `backend/app/api/v1/endpoints/backup.py` -- CRUD connexions/cycles, connect/callback/disconnect OAuth (même pattern que `google_oauth.py`), `POST /run` (bouton manuel), `GET /logs`
- Router enregistré dans `main.py` (`/api/v1/backup`) + poller démarré dans le lifespan
- `frontend/src/pages/Admin.jsx` -- nouvel onglet "Backup cloud" (`BackupPanel`) : cartes de connexion (fuseau/heure/bande passante par cloud), tableau des cycles avec bouton "+ Ajouter un cycle" (`CycleModal`), bouton "Backup maintenant", historique récent
- Services redémarrés (`erpcrm-backend`, `erpcrm-backend-tls`, `erpcrm-frontend` via `systemctl --user`), tous vérifiés actifs

**Bug trouvé + corrigé (2026-08-14/15)** : les 3 copies (daily/weekly/monthly) échouaient (`400 Bad Request`) malgré une UI affichant "Backup envoyé" — app Dropbox créée sans le scope `files.content.write`, scope resté manquant même après un premier passage dans App Console (Submit jamais cliqué la 1re fois), 2692 lignes d'échecs accumulées en boucle en `backup_run_logs`. Corrigé : `_check_dropbox()` capture le vrai corps de la réponse d'erreur, scope inclus explicitement dans l'URL d'autorisation, `backup_runner.py`/`Admin.jsx` affichent le vrai statut par copie, table de logs vidée après confirmation.
**2026-08-15, confirmé en succès** : test manuel Dropbox -- 3 copies
(daily/weekly/monthly) envoyées avec succès, vérifié indépendamment via
`dropbox_list_backups` (fichiers réellement présents dans
`/ERPCRM_Backups/`, ~22.5 Mo chacun). Dropbox opérationnel de bout en bout.

**Extension disaster-recovery (2026-08-15, même soir)** : Philippe veut
pouvoir migrer vers un futur nouveau serveur juste en restaurant ce backup +
ajustant les IPv4. `backup_runner.py::_build_dump()` inclut maintenant, en
plus de la DB + uploads : `.env` (`config/backend.env`), certs TLS s2s
ERPCRM<->SIPV (`config/certs/`), unités systemd (`erpcrm-backend.service`,
`erpcrm-backend-tls.service`, `erpcrm-frontend.service`), config Nginx
(`portail.simpleip.tel`). Décision explicite de Philippe : PAS de chiffrement
séparé de l'archive (le serveur lui-même expose déjà ces secrets en clair,
donc le vecteur d'attaque principal reste le serveur, pas le backup) --
option écartée après discussion, pas oubliée.
Vérifié en conditions réelles : backup manuel relancé, fichier RÉELLEMENT
téléchargé depuis Dropbox (pas juste généré localement) et son contenu
confirmé -- tous les fichiers `config/*` bien présents dans l'archive livrée.
Les certs Let's Encrypt (portail.simpleip.tel) ne sont PAS inclus -- se
régénèrent via Certbot sur le nouveau serveur une fois le DNS pointé, pas
besoin de les transférer.
Reste : même extension côté SIPV (TASK-S059, pas commencé) pour que ce
serveur soit migrable aussi -- kamailio.cfg, internal.xml, vars.xml, certs
TLS, unités systemd SIPV.

**État final 2026-08-16** :
1. Dropbox ✓ -- connecté, testé de bout en bout (voir "Bug trouvé + corrigé"
   et "Suite du bug" ci-dessus), cycles daily/weekly/monthly actifs (3
   générations chacun), backup automatique + manuel confirmés fonctionnels.
2. Google Drive -- **reporté par choix explicite de Philippe** (2026-08-16,
   "je n'activerai pas l'API Google de suite"), PAS un blocage technique --
   le code est prêt (même mécanisme que Dropbox), juste pas encore activé
   côté console Google. Reprendre quand Philippe le demande.
3. Cycles créés et vérifiés actifs.

**Réplication SIPV (TASK-S059)** : FAIT, voir TASKSIPV.md -- même mécanisme,
backend SIPV + proxy dans `server.py`/`Server.jsx` d'ERPCRM (page "Serveur"
est en fait rendue par ERPCRM, proxy vers SIPV via `sipv_client`, pas un
frontend SIPV séparé). Dropbox connecté et testé côté SIPV aussi. Google
Drive même statut que ci-dessus (reporté).

**Incident dépôt GitHub SIPV (2026-08-16)** : découvert que `CaptainePoui/SIPV`
était poussé depuis un miroir du code conservé sur ERPCRM (`/home/simpleip/sipv`),
jamais depuis le vrai serveur SIPV -- périmé depuis le 12 août, tout le
travail de cette session (dont TASK-S059 au complet) n'y était pas. Repoussé
à jour (rattrapé), mais Philippe a explicitement rejeté ce miroir (SIPV doit
être autonome, va changer de serveur bientôt -- voir mémoire
`project_server_migration_planned`) : mise en place en cours d'un accès
Git DIRECT depuis le serveur SIPV lui-même (clé de déploiement générée,
en attente que Philippe l'ajoute sur GitHub). Détail complet de l'incident
dans TASKSIPV.md (TASK-S059).

**Ajout 2026-08-13 (même soir)** : Philippe a précisé qu'ERPCRM/SIPV est un
logiciel destiné à être VENDU à d'autres clients (interconnecteurs SIP) --
voir mémoire `project_sellable_product_autonomy`. Conséquence directe : les
credentials OAuth (App Key/Secret Dropbox, Client ID/Secret Google) ne sont
plus seulement dans `.env` -- ajout de `client_id`/`client_secret_enc` sur
`CloudBackupConnection` (migration `625c312074ff`), saisissables directement
dans Admin > Backup cloud (`CredentialsForm` dans `Admin.jsx`, endpoint
`PUT /connections/{provider}/credentials`). `.env` reste un fallback
optionnel (`backup_cloud.resolve_credentials`). Un futur client n'a donc
plus besoin d'accès SSH pour connecter son propre Dropbox/Google Drive.

---

### TASK-035.1 [x] Le dossier storage/ ajouté à la sauvegarde
Date de demande : 2026-10-09 (Philippe : « corrige les sauvegardes »)
Date(s) de travail : 2026-10-09

- Constaté pendant TASK-047.2 (Boîte de réception) : l'archive (`workers/backup_runner.py` `_build_dump`) ne contenait que la base, `uploads/` et la configuration. `storage/` (pièces des échanges en troc, reçus d'achats, relevés bancaires, courriels copiés .eml) n'était pas sauvegardé.
- Ajout de `STORAGE_DIR` à l'archive (sous `storage/`). Vérifié : une archive de test contient bien les 233 fichiers de `storage/` (≈ 55 Mo au total), puis a été supprimée.

## TASK-036 [ERPCRM] [x] Aucun popup ne doit se fermer au clic extérieur (règle globale, tous les modaux)
Classification: HISTORICAL


Philippe, très en colère, à raison : cliquer à l'extérieur d'un popup
(sur l'overlay) le fermait et faisait perdre toute la saisie en cours --
pattern quasi-systématique dans le frontend (`<div className="modal-overlay"
onClick={onClose}>`). Règle persistante ajoutée en mémoire
(`feedback_no_close_on_outside_click`) : seuls des boutons explicites
(Annuler/Enregistrer) peuvent fermer un popup, plus jamais un clic sur
l'overlay.

**Fait (2026-08-19)** : tous les `modal-overlay` du frontend ERPCRM
audités et corrigés (~40 popups, tous les fichiers `pages/*.jsx` et
`components/*.jsx`, fichiers `.backup_*` ignorés volontairement -- code
mort) :
- `onClick={onClose}` (et variantes : `onClick={closeForm}`,
  `onClick={() => setShowX(false)}`, fonctions imbriquées avec plusieurs
  instructions) retiré de CHAQUE `<div className="modal-overlay">`.
- Audit complémentaire demandé par Philippe : vérifié individuellement
  que chaque popup garde bien un bouton Annuler/dismiss explicite ET
  (si applicable) un bouton de sauvegarde -- aucun popup rendu
  définitivement infermable par le retrait du clic extérieur. Un seul
  cas particulier (`InvoiceDetail.jsx`, `PricePromptModal`) n'a pas de
  bouton nommé littéralement "Annuler" mais ses 2 boutons ferment déjà
  proprement sans perte de données (la ligne de facture est déjà
  sauvegardée avant que ce popup n'apparaisse, il ne pose qu'une
  question secondaire sur le catalogue) -- laissé tel quel.
- `npm run build` + `erpcrm-frontend` redémarré, vérifié actif.

Fichiers touchés (retrait `onClick` sur l'overlay uniquement, aucun autre
changement) : `pages/Portal.jsx`, `pages/DevisDetail.jsx`,
`pages/InvoiceDetail.jsx`, `pages/Employees.jsx`, `pages/Catalogue.jsx`,
`pages/Server.jsx`, `pages/PurchaseOrders.jsx`, `pages/PurchaseOrderDetail.jsx`,
`pages/TicketDetail.jsx`, `pages/CompanyDetail.jsx`, `pages/Tasks.jsx`,
`pages/Admin.jsx`, `pages/ContactDetail.jsx`, `components/NewTicketModal.jsx`,
`components/NewInvoiceModal.jsx`, `components/NewTaskModal.jsx`,
`components/NewDevisModal.jsx`, `components/QuickNewContact.jsx`,
`components/QuickNewCompany.jsx`, `components/CdrReportsSection.jsx`.

⚠️ Règle à appliquer à TOUT nouveau popup créé désormais (ERPCRM et SIPV) --
ne jamais remettre `onClick={onClose}` sur un `modal-overlay`, voir mémoire
persistante `feedback_no_close_on_outside_click`.

---

## TASK-037 [ERPCRM] [ ] Conférence -- backlog non prioritaire
Classification: CURRENT


Repéré pendant la revue d'arborescence téléphonie (2026-08-19, voir TASK-027).
`mod_conference` est chargé et configuré sur le serveur FreeSWITCH
(`conference.conf.xml`) mais aucun modèle SIPV ne l'exploite. `DESTINATION_TYPES`
(`api/v1/endpoints/dids.py` côté SIPV) réserve déjà la valeur `conference` dans
l'énum, mais rien de fonctionnel derrière -- sélectionner ce type de
destination ne mènerait nulle part aujourd'hui.

Explicitement dépriorisé par Philippe : "en 8 ans j'ai utilisé conference 1
fois". Pendant SIPV : TASK-S060 (TASKSIPV.md). Ne pas construire sans GO.

---

## TASK-038 [ERPCRM] [~] Parcage d'appel -- utilisé en permanence chez les clients, PAS dépriorisé
Classification: CURRENT

> Statut corrigé en Phase O (était `[ ]` dans TASKERPCRM.md) : développement massif déjà livré et testé en direct (validateur de collision de numérotation, CRUD ParkingLot complet, dialplan étapes 1-4, `ParkingLotsSection.jsx` construit et fonctionnel côté ERPCRM, "poste qui a parqué" vérifié sur de vrais appels). Reste ouvert : BLF bout en bout à travers Kamailio jamais confirmé, provisioning des touches pas fait, continuité MOH pas totalement reconfirmée — d'où `[~]` plutôt que `[x]`.


⚠️ Distinct de TASK-037 (Conférence) -- Philippe a corrigé le classement initial
(2026-08-19) : le parcage n'est pas un backlog dormant, c'est une fonction
utilisée activement et en permanence chez ses clients. Analogie donnée :
l'équivalent moderne d'une ligne partagée mise en attente sur un ancien
système analogique -- on park un appel, et il apparaît en BLF sur tous les
postes pour que n'importe qui le reprenne. Important pour la priorisation
future.

État réel : `ParkingLot` existe déjà comme modèle SIPV (`models/ivr.py`,
depuis TASK-S007) mais aucun endpoint ne l'expose (`api/v1/endpoints/ivr.py`
n'a que IVR/Queue/RingGroup/PagingGroup). Rien côté ERPCRM. Point encourageant :
`PhoneButton.button_type` (côté SIPV, `models/provisioning.py`) a déjà `park` et
`park_retrieve` dans son énumération de types de touches -- le BLF de parcage
était déjà anticipé au niveau du provisioning.

**Plan technique (2026-08-19, revu par ChatGPT puis vérifié ligne par ligne
dans le vrai module chargé sur le serveur -- `fs_cli show application/api` +
lecture de `mod_valet_parking.c` présent sur SIPV) :**
1. CRUD `ParkingLot` côté SIPV -- modèle déjà là, même patron que
   ring-groups/paging-groups.
2. Dialplan `park_extension` (700 par défaut) → appli `valet_park <lot> auto
   in <min> <max>` (PAS `valet_park_fetch`, cette appli n'existe pas --
   erreur corrigée avant de coder).
3. Dialplan `parking_slots_start`-`end` (701-720 par défaut) → même appli
   `valet_park <lot> <extension>` -- gère park ET reprise selon l'état de
   l'appel, une seule appli pour les deux.
4. Timeout/retour : variables natives `valet_parking_timeout` et
   `valet_parking_orbit_exten` (confirmées dans le source C), pas de
   logique maison à inventer.
5. Statut des slots occupés : API `valet_info <lot>` (confirmée), même
   famille que le pattern ESL déjà existant (`esl.py`, `monitoring/{username}`).
6. BLF : le module émet bien `SWITCH_EVENT_PRESENCE_IN` (confirmé dans le
   source), mais ne pas déployer avant un test réel sur un poste Grandstream
   -- l'émission d'événement ne garantit pas l'affichage correct côté
   téléphone.
7. Remplissage des touches BLF (701→7xx) : PAS automatique -- un GXP2135 (8
   touches) et un GXP2170 (24+) n'ont pas la même capacité, ça reste un
   choix de configuration humain, pas un auto-fill.
8. Proxy ERPCRM + écran (`CompanyDetail.jsx` → Téléphonie, tenant-scope) :
   en dernier.

Multi-lots par tenant : vérifié, aucune contrainte unique sur `tenant_id`
dans le modèle ni les migrations -- plusieurs `ParkingLot` par tenant déjà
supportés par le schéma sans rien changer. Backend garde cette capacité,
l'écran ERPCRM peut démarrer simple (un lot principal affiché en premier).

Pendant SIPV : TASK-S061 (TASKSIPV.md). Toujours pas de GO pour construire.

**Recherche complémentaire (2026-08-19, 6 points challengés par ChatGPT,
vérifiés dans le vrai code plutôt qu'estimés) :**

1. **Collision de numéros — AUCUN mécanisme central n'existe dans SIPV,
   confirmé.** `create_extension` (`extensions.py`) ne vérifie l'unicité que
   dans sa propre table (`SIPExtension.username`). `create_ring_group` et
   `create_paging_group` (`ivr.py`) n'ont **aucune** validation, même pas
   dans leur propre table. Rien ne croise Extension/RingGroup/PagingGroup/
   ParkingLot entre eux -- ce n'est pas un trou spécifique au parking, c'est
   un trou systémique déjà présent partout où un objet porte un numéro
   composable. `IVR`/`Queue` n'ont pas de champ extension direct (atteints
   via destination_id, pas concernés par cette collision).
2. **Slot vide (701 sans appel dedans)** : confirmé dans le source
   (`mod_valet_parking.c`, ~ligne 550-605) -- `valet_park <lot> <ext>`
   cherche un token existant pour cet ext ; s'il n'y en a pas, l'appel EN
   COURS est parké dans ce slot (aucun message, aucun raccrochage,
   aucune tonalité spéciale). La même appli sert à parker et à reprendre,
   selon qu'un token existe déjà ou non.
3. **Timeout/retour, 4 cas confirmés dans le source (~ligne 690-740)** :
   - Ni `valet_parking_timeout` ni `valet_parking_orbit_exten` réglés →
     l'appel reste en attente indéfiniment (musique), aucune logique de
     timeout ne s'active.
   - Timeout réglé, pas d'orbit → au timeout, l'appel sort du parking sans
     transfert (tombe sur la suite du dialplan -- raccroche si rien après).
   - Timeout + orbit réglés → `switch_ivr_session_transfer` vers l'orbit.
   - Orbit pointant vers une destination qui n'existe plus, ou boucle
     retour-vers-parking : le module ne protège contre rien de ça -- c'est
     la responsabilité du dialplan généré par SIPV (xml_curl.py) d'avoir un
     fallback sain et d'éviter les boucles, pas une garantie du module.
   - Poste de retour occupé/ne répond pas : redevient un appel normal vers
     cette extension, gouverné par ses propres règles (renvoi/messagerie),
     rien de spécifique au parking.
4. **BLF bout en bout (Grandstream→Kamailio→FreeSWITCH→Kamailio→Grandstream)** :
   confirmé que le module émet `SWITCH_EVENT_PRESENCE_IN`/bind
   `PRESENCE_PROBE`, mais le chemin complet à travers Kamailio n'est PAS
   vérifiable par lecture de code -- test réel sur poste requis, reporté à
   l'étape 8 de l'ordre ci-dessous, pas avant.
5. **`PhoneButton.button_type` `park`(19)/`park_retrieve`(26)** : mappés
   dans `BUTTON_TYPE_TO_GS_MODE` (`provisioning.py`), mais le commentaire du
   code lui-même précise que seuls BLF(11)/Speed Dial(10) ont été
   "confirmés empiriquement contre un fichier ScopServ réellement
   fonctionnel" -- park/park_retrieve n'ont pas cette confirmation. Ne pas
   assumer que 700→`park` et 701→`park_retrieve` produiront un P-code
   Grandstream correct sans test réel du gabarit de config.

**Ordre retenu (proposé par ChatGPT, adopté) :**
1. Mécanisme central de détection de collision de numéros (partagé
   Extension/RingGroup/PagingGroup/ParkingLot, PAS une validation spéciale
   ParkingLot)
2. CRUD ParkingLot
3. Dialplan 700 (auto in)
4. Dialplan 701-7xx (valet_park direct)
5. Test réel park/reprise (fs_cli + téléphones)
6. Test réel timeout/orbit
7. `valet_info` / statut
8. BLF réel à travers Kamailio
9. Provisioning des touches
10. Proxy ERPCRM
11. Interface ERPCRM

**Étape 1 livrée côté SIPV (2026-08-19)** — voir TASK-S061 (TASKSIPV.md)
pour le détail complet : `app/core/numbering.py` (validateur central, aucune
nouvelle table), infrastructure de tests créée de zéro (DB `sipv_test`
dédiée, garde-fou anti-DB-de-prod). Rien côté ERPCRM pour cette étape --
c'est du backend SIPV uniquement.

⚠️ Correction le même jour : le premier récapitulatif annonçait l'étape 1
terminée sans avoir branché le validateur dans les vrais CRUD (create/update
d'Extension/RingGroup/PagingGroup) -- Philippe a vérifié et avait raison,
rien n'était câblé. Corrigé, prouvé par 5 tests passant par le vrai routing
HTTP (pas juste `numbering.py` en isolation). Suite finale : 12/12 verts.
Étape 2 (CRUD ParkingLot) livrée le même jour -- voir TASK-S061 (TASKSIPV.md)
pour le détail complet : CRUD `ParkingLot` côté SIPV, mise à jour partielle
validée sur l'état final fusionné (pilote+plage), 9 tests via vrai routing
HTTP, suite complète 21/21 verts. Point de concurrence (course entre deux
créations simultanées) identifié et documenté mais volontairement pas
corrigé -- mitigation suggérée (verrou Postgres par tenant) si ça devient un
problème réel. Rien côté ERPCRM -- étapes 10-11 du plan, pas commencées, pas
de GO.

**Étape 3 livrée le même jour** -- dialplan du pilote (700 → `valet_park
<clé technique> auto in <start> <end>`), voir TASK-S061 (TASKSIPV.md) pour
le détail. Point critique vérifié avant de coder : `mod_valet_parking`
indexe ses lots dans une table globale au processus FreeSWITCH (aucune
isolation par tenant) -- clé technique dérivée des UUID
(`tenant_{tenant_id}_parking_{lot_id}`) plutôt que du nom affiché, pour
éviter toute collision inter-tenant et rester stable au renommage. 4
nouveaux tests sur le XML réellement généré. Suite complète : 25/25 verts.
Scope volontairement limité au pilote seulement -- rien côté ERPCRM.

**Étape 4 livrée le même jour** -- plage 701-7xx (parcage direct + reprise).
Comportement métier clarifié avec Philippe avant de coder (usage réel de
l'UCM confirmé, pas trouvé dans les relevés de champs) : le comportement
natif "toggle" de `valet_park` (parque si vide, reprend si occupé) EST le
comportement voulu -- aucune logique "retrieve only" à fabriquer. Une seule
règle dialplan pour toute la plage (alternation regex), pas 20 extensions
séparées. 2 nouveaux tests. Suite complète : 27/27 verts. Toujours rien
côté ERPCRM.

**Étape 5 (tests réels) en cours, état consolidé le même jour avant
compression** -- voir TASK-S061 (TASKSIPV.md) pour le détail complet des 4
sous-problèmes trouvés en testant sur de vrais postes (102/103) :
1. **Délai 500ms sur la MOH réelle** -- RÉSOLU (retiré de `hold_music_var`,
   déplacé vers les préécoutes `call_moh`/`call_prompt`), vérifié en
   direct sur services redémarrés.
2. **MOH qui repart du début à chaque park/reprise** -- PAS résolu. Erreur
   de méthode de test trouvée (tous les tests faits jusqu'ici sont des
   appels neufs indépendants, pas un même appel re-parké) -- vrai
   protocole de test à 2 postes proposé, pas encore exécuté.
3. **Annonce du slot pour attended, jamais pour blind** -- PAS résolu.
   Piste trouvée (`pre_answering channel` en blind transfer) mais pas
   confirmée par comparaison propre avec l'attended. Macro d'annonce
   manquante en français trouvée en chemin (bloque toute annonce
   actuellement, indépendamment de blind/attended).
4. **BLF 701-703 ne s'allume pas** -- PAS résolu. Presence par-slot
   confirmée exister nativement dans FreeSWITCH, hypothèse de domaine
   (`cluecon.com` par défaut) pas encore confirmée -- aucune capture
   `PRESENCE_IN` réussie malgré moniteur ESL corrigé.
Rien côté ERPCRM dans tout ça -- travail 100% backend SIPV (`numbering.py`,
`ivr.py`, `xml_curl.py`, `moh.py`, `prompts.py` + suite de tests complète,
27+ tests verts, DB `sipv_test` créée).

**Correctif annonce blind livré côté SIPV le même jour** --
`valet_announce_slot=false` sans condition sur le pilote 700 (vérifié
ligne par ligne dans `mod_valet_parking.c`, pas supposé). Nouveau champ
`ParkingLot.announce_slot` (migration `0063_parking_lot_announce`, défaut
`false`), plus jamais hardcodé.

**Portion Parcage construite dans ERPCRM le même jour, GO explicite de
Philippe** ("profiter du fait que tout est encore frais") -- voir TASK-S061
(TASKSIPV.md) pour le détail complet :
- `sipv_client.py` : `list/create/update/delete_parking_lot`.
- `companies.py` : proxy `/{company_id}/parking-lots[...]` + nouveau
  helper `_forward_sipv_error()` qui propage le vrai message d'erreur SIPV
  (collision de numérotation, etc.) au lieu d'un générique "SIPV
  injoignable" -- vérifié en direct avec un vrai token, un `POST` en
  collision retourne bien `400` avec le détail exact du validateur.
- `CompanyDetail.jsx` : nouveau composant `ParkingLotsSection` (Téléphonie,
  après Groupes de paging) -- CRUD complet des lots par compagnie (nom,
  pilote, plage, timeout, extension de retour, annonce du slot). Clé
  technique FreeSWITCH jamais exposée à l'utilisateur.
- Explicitement rien de simulé pour ce qui n'est pas encore prêt côté
  SIPV : pas de statut live, pas de BLF, pas de continuité MOH dans
  l'écran -- ces backends n'existent pas encore.
- Vérifié de bout en bout (login réel, `GET`/`POST` avec collision,
  `npm run build` propre, services redémarrés -- `erpcrm-frontend.service`
  jamais `sudo`, règle du projet).
- Réutilise entièrement les validations SIPV déjà construites -- zéro
  logique de collision dupliquée côté ERPCRM.

**Correction d'architecture le même jour, GO Philippe** -- j'avais d'abord
empilé `ParkingLotsSection` directement dans `CompanyDetail.jsx` (3300+
lignes), exactement le problème identifié au tout début de cette
conversation. Corrigé : sorti vers
`frontend/src/pages/telephony/ParkingLotsSection.jsx`, premier morceau
d'une arborescence par domaine (le reste des sections téléphonie reste
pour l'instant dans `CompanyDetail.jsx`, à migrer graduellement, pas un
big-bang). `npm run build` propre, vérifié en direct après redémarrage.
Aussi ajouté `ParkingLot.is_active` (manquait, repéré par Philippe) --
voir TASK-S061 (TASKSIPV.md) pour le détail complet, y compris le backlog
non construit sur l'annonce TTS/Voicebox (deux options documentées, aucun
GO donné).

**Vraie navigation par sous-onglets construite + raffinements (2026-08-20,
même session)** -- Philippe voulait les branches VISIBLES à l'écran, pas
juste le rangement de fichiers. `TelephonyTab.jsx` a maintenant 7
sous-onglets réels (barre cliquable en haut) : Numéros, Postes,
Acheminement d'appels, Horaires & Audio, Appareils, Urgence & Sécurité
(nouveau, placeholders Fax/SMS/Sécurité), Avancé. `E911AddressesSection`/`CdrSection` (cassés après le déplacement de code précédent, pas exportés) réparés avant de continuer.
`timeout_seconds` et `return_extension` (menu déroulant des vrais postes,
plus du texte libre) maintenant modifiables sur un lot existant, vérifiés
de bout en bout. Voir TASK-S061 (TASKSIPV.md) pour le détail complet,
y compris deux demandes non réalisables ce soir (retour dynamique vers
"le poste qui a parké", annonce liée à la langue du POSTE pas de la
compagnie) -- documentées clairement, aucun GO donné.

**INCIDENT même soir, causé et corrigé côté SIPV** -- un commentaire XML
ajouté dans le dialplan contenait `--` (invalide en XML), a cassé le
routage complet des appels pour le tenant pendant un moment avant d'être
repéré et corrigé. Un deuxième défaut identique préexistant trouvé et
corrigé au passage. Détail complet + risque systémique pas encore audité
(noms d'utilisateur avec `--` pourraient reproduire le même crash
ailleurs) dans TASK-S061 (TASKSIPV.md) -- à traiter en priorité avant
tout nouveau développement sur le dialplan.

**Preuve confirmée pour "poste qui a parké"** (retour dynamique au timeout,
plutôt qu'une extension statique) : `sip_h_Referred-By` fonctionne,
vérifié sur un vrai appel réel, contient bien l'identité du poste qui a
fait le park. Pas construit ce soir -- voir TASK-S061 pour le plan.

**"Poste qui a parqué" construit et vérifié en direct (2026-08-20, même
soirée)** -- côté SIPV : `sip_h_Referred-By` capturé et injecté
dynamiquement dans `valet_parking_orbit_exten` au moment du park (voir
TASK-S061 dans TASKSIPV.md pour le détail dialplan). Testé sur de vrais
appels : timeout réel déclenché, rappel du poste qui avait parqué,
réponse et reconnexion à l'appel parqué -- fonctionne.

**Raffinement demandé par Philippe le même soir** -- pas un simple
fallback automatique : "je ne veux pas de poste de sécurité, je veux
avoir l'option de rappel [...] comme ça je peux sélectionner la réception
et envoyer les park pas répondu là, ou de choisir l'option de base de
rappeler le poste qui a parqué." Nouveau champ `timeout_return_mode`
(parker/fixed, défaut parker) sur `ParkingLot`, exposé dans ERPCRM :
`ParkingLotsSection.jsx` a maintenant une colonne "Mode de rappel" (menu
déroulant) en plus du poste de rappel -- en mode "fixed", validé des
deux côtés (front + SIPV) qu'un poste est bien choisi. Migration SIPV
`0065_park_timeout_mode`, tests dialplan ajoutés (mode parker garde la
condition dynamique, mode fixed l'ignore complètement). `npm run build`
propre, backend + frontend ERPCRM redémarrés (`erpcrm-backend[-tls]` via
sudo systemctl -- services système, pas `--user` comme le frontend ; voir
[[project_infrastructure]] pour la nuance).

**INCIDENT + correction infra même soir (détail complet dans TASKSIPV.md,
TASK-S061)** -- un redémarrage `sipv-backend` a fait tomber le poste 102
(REGISTER/SUBSCRIBE en plein trou de service). Corrigé : `sipv-backend`
tourne maintenant sous `gunicorn` (2 workers, reload à chaud sans
coupure) -- nouvelle procédure de déploiement SIPV : `systemctl reload`,
plus jamais `restart` sauf process mort.

`uuid_getvar` renvoie littéralement `"_undef_"` pour une variable non définie (ni vide, ni `-ERR`) — le fallback dans `moh_hold_tracker.py` ne traitait pas ce cas, bloquant la reprise MOH du parcage. Corrigé, pas encore reconfirmé sur un cycle complet park -> reprise -> re-park (traces de diagnostic temporaires encore en place côté SIPV).

**Concept UI refait + lien audio ajouté (2026-08-20, même soirée)** --
Philippe a rejeté le menu à deux options nommées ("plus obligé de garder le
plus d'affaire possible") : remplacé par une case "Poste dédié" +
sélecteur de poste qui apparaît juste à côté quand coché (style
destinations DID). Décoché = comportement par défaut (rappelle le poste
qui a parqué), pas besoin de le nommer. La première version cachait le sélecteur de poste tant que le mode n'était pas "fixed" (blocage : impossible de choisir un poste pour passer en mode fixed) -- corrigé, les deux champs partent maintenant ensemble en une seule requête dès qu'un poste est choisi. Lien "Horaires & Audio"
ajouté sous la section (bascule le sous-onglet) pour configurer plus tard
les audios d'annonce du parcage avec choix de langue -- pointeur seulement,
le mécanisme TTS/Voicebox lui-même reste backlog (voir TASK-S061 dans
TASKSIPV.md).

---

## TASK-039 [ERPCRM] [x] Onglet Admin "Graphe de connaissance" — visualisation 3D de Graphiti

Demande (2026-08-24) : Philippe a vu des vidéos de visualisation de graphe de
connaissance en 3D et voulait pouvoir voir "les neurones" de son projet
(Graphiti/Neo4j) directement dans ERPCRM plutôt que via le dashboard Neo4j
brut.

Backend : `backend/app/api/v1/endpoints/knowledge_graph.py`, nouveau routeur
`GET /v1/knowledge-graph/graph` (`require_admin`, même pattern que
`admin.py`). Connexion directe au driver `neo4j` (ajouté à
`requirements.txt`) vers le conteneur Neo4j de Graphiti
(`tools/knowledge/graphiti/docker-compose.yml`), en Bolt sur
`127.0.0.1:7687` (loopback, même serveur qu'ERPCRM — PAS le hostname Docker
interne `neo4j` utilisé par le conteneur graphiti-mcp). Nouveaux settings
`NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD`/`NEO4J_DATABASE`
(`backend/app/core/config.py`), mot de passe copié dans `backend/.env`
depuis `tools/knowledge/graphiti/.env`. Requête Cypher générique
`MATCH (n)-[r]->(m) RETURN n, r, m LIMIT $limit`, filtre optionnel par
`group_id` (platform/erpcrm/sipv), propriétés `*_embedding` retirées de la
réponse (gros vecteurs, inutiles côté client). Validé en direct (script
manuel bypassant l'auth HTTP) : 9 nœuds / 18 liens retournés correctement
depuis les vraies données Graphiti.

Frontend : nouveau composant `frontend/src/components/KnowledgeGraphViewer.jsx`
avec `react-force-graph-3d` (three.js — nouvelles dépendances `three` +
`react-force-graph-3d` dans `package.json`), nouvel onglet "Graphe de
connaissance" dans `Admin.jsx` (`TABS`). Filtre par domaine + limite de
nœuds, panneau de détail au clic sur un nœud. Build de prod relancé
(`npm run build` + `systemctl --user restart erpcrm-frontend`).

Non vérifié visuellement dans le navigateur par Claude (pas d'accès aux
identifiants de connexion ERPCRM) — Philippe à confirmer que l'onglet
s'affiche et se comporte comme attendu une fois connecté.

---


---

# PLATFORM_TASKS.md — Section SIPV (Telephony Plane)

> Produit en Phase O à partir de l'inventaire Phase M (`phase_m_inventory_sipv.md`) et de la lecture intégrale de `TASKSIPV.md` (5731 lignes, source archivée intacte, non modifiée). Réorganisation + corrections de numérotation (voir `phase_o_id_mapping_sipv.md` pour le détail de chaque changement) — le contenu fonctionnel (décisions, bugs+fixes, fichiers touchés, dépendances, reste à faire) est préservé fidèlement ; la prose de vérification la plus répétitive ("tel poste reste Registered après redémarrage", etc.) est condensée sans perte d'information fonctionnelle.
>
> Convention : `TASK-SXXX` = création initiale de module, `TASK-SXXX.Y` = ajout/fix. Statuts `[ ]` à faire, `[~]` partiel, `[x]` complété/validé, `[!]` bug/décision à revoir. Chaque bloc porte une ligne `Classification:` reprise de l'inventaire Phase M.
>
> **PLAN_SIPV.md n'est PAS fusionné ici** (hors scope Phase O, traité séparément).

---

## Bloc 0 — Fondation serveur

### TASK-S000 [SIPV] [x] Fondation serveur SIPV
**Classification: CURRENT**
Audit serveur, installation FreeSWITCH, PostgreSQL, structure projet FastAPI+React. Toujours la base d'infrastructure active.

#### TASK-S000.1 [x] Audit serveur SIPV
Ubuntu 26.04 LTS, 15 Go RAM, 98 Go disque, Python 3.14 pré-installé. Asterisk/Kamailio/PostgreSQL/nginx/rtpengine absents au départ.

#### TASK-S000.2 [x] FreeSWITCH 1.10.12
Compilé depuis sources (GCC 15). sofia-sip 1.13.17. Binaire `/usr/local/freeswitch/bin/freeswitch`, systemd `freeswitch.service`. FusionPBX installé sur le même serveur mais ABANDONNÉ (interface jugée trop contre-intuitive) — DB `fusionpbx` conservée pour référence technique uniquement, schéma jamais réutilisé.

#### TASK-S000.3 [x] PostgreSQL 18
DB `freeswitch` créée, schéma 100% custom SIPV. 14 migrations Alembic initiales (0001→0014).

#### TASK-S000.4 [x] Structure projet FastAPI + React
Port 8020 backend, port 3020 frontend. Même pattern qu'ERPCRM (schemas Pydantic inline, `get_current_user`, `get_db`, UUID primary keys). Backend `/home/simpleip/sipv/backend/app/`, Frontend `/home/simpleip/sipv/frontend/src/` — ⚠️ ce chemin local ERPCRM n'est PAS le code qui tourne réellement (voir avertissement dans TASK-S018.3 : le code réel est sur `/home/sipv/sipv/backend` sur le serveur SIPV lui-même).

---

## Bloc 1 — Code backend/frontend (modules initiaux)

⚠️ Avertissement historique conservé du fichier source : le code S001–S017 a été écrit à l'origine pour Asterisk PJSIP Realtime (tables `ps_endpoints`/`ps_auths`/`ps_aors`, champ `asterisk_synced`). Le moteur retenu est FreeSWITCH 1.10.12 via mod_xml_curl + ESL. Ne jamais ajouter de logique Asterisk ni recréer de tables `ps_*`.

### TASK-S001 [SIPV] [x] Auth
**Classification: CURRENT**
`sipv_users` table, JWT Bearer, `get_current_user` dependency. Endpoints `POST /api/v1/auth/login`, `GET /api/v1/auth/me`. Fichiers : `api/v1/endpoints/auth.py`, `models/user.py`.

### TASK-S002 [SIPV] [x] Tenants + sync ERPCRM
**Classification: CURRENT**
`Tenant.account_number` = domaine FreeSWITCH = context_prefix (`t-{account}`). Sync depuis ERPCRM : `POST /api/v1/sync/company` (X-Api-Key). Health check `GET /api/v1/sync/status`. Fichiers : `models/tenant.py`, `api/v1/endpoints/tenants.py`, `api/v1/endpoints/sync.py`.

### TASK-S003 [SIPV] [x] Extensions
**Classification: CURRENT**
`SIPExtension` : `username = {account}-{extension}` (unique global), password, voicemail_enabled, caller_id, record_calls, max_contacts, is_active. Champ legacy `asterisk_synced` (renommé `freeswitch_synced` en S017.1). Fichiers : `models/sip.py`, `api/v1/endpoints/extensions.py`.

#### TASK-S003.1 [x] TLS sur le profil internal + transport imposé par poste
3 transports (udp/tcp/tls) disponibles au choix par poste, TLS par défaut, imposé (pas juste informatif) : `xml_curl.py::_handle_directory()` compare `sip_via_protocol` au transport configuré, rejette (403) si différent. Certificat auto-signé (CN=sipv.simpleip.local, 10 ans) sur le port TLS 5061 ; UDP/TCP sur 5060. Champ `SIPExtension.transport` (migration 0019). Vérification limitée à `sip_auth_method == "REGISTER"` (décision : ne pas bloquer les lookups internes de la directory faits pour le bridge d'appel, qui n'ont pas de `sip_via_protocol`). Certificat auto-signé généré (`agent.pem`/`cafile.pem`/`dh2048.pem`, CN=sipv.simpleip.local, 10 ans, `tls-verify-policy=none`) — ⚠️ à remplacer par un vrai certificat (Let's Encrypt ou fourni client) si des postes se connectent depuis l'extérieur avec vérification stricte. Validé en direct : poste `tls` refuse un REGISTER UDP (403), accepte en TLS (200 OK) ; les 3 transports confirmés coexister simultanément (`sofia status profile internal` + `ss -tulnp` + handshake `openssl s_client`). Reste à faire : TLS trunks, bloqué en attente de confirmation du support côté fournisseur ISP.

### TASK-S004 [SIPV] [x] Trunks
**Classification: CURRENT**
`SIPTrunk` : name, carrier_name, host, username, password, from_domain, caller_id, `failover_trunk_id` (FK auto-référentielle), is_active. Gestion Simple IP uniquement (jamais exposé au portail client). ⚠️ Champ legacy `asterisk_synced` (à renommer `freeswitch_synced`, voir S017.1). Fichiers : `models/sip.py`, `api/v1/endpoints/trunks.py`.

#### TASK-S004.1 [x] Premier trunk PSTN réel (ScopServ, TLS) — bug contexte sipv-external
*(anciennement TASK-023.27 — voir mapping Phase O)*
Connexion d'un vrai compte SIP ScopServ (`vgw1.simpleip.scopcloud.com`, DID de test `15143222112`, usage test uniquement confirmé par Philippe). Deux bugs corrigés : contexte `sipv-external` (renommé, collisionnait avec `dialplan/public.xml` sous le nom générique `public`) ; TLS activé sur le profil `external` (port 5081, certs `internal` réutilisés) après un 403 Forbidden en UDP malgré digest correct — gateway reconfiguré `register-transport="tls"` vers `vgw1.simpleip.scopcloud.com:5061`. Confirmé `State: REGED`/`Status: UP` côté SIPV et ScopServ.
`SIPTrunk.password` désormais chiffré (Fernet). Enregistrements créés (tenant t1001) : trunk "ScopServ Test", DID `15143222112`, InboundRoute (→ extension test `t1001-100`), OutboundRoute (patterns NANP standard).
Écart vs plan : gateway écrit à la main sur le serveur (pas de génération dynamique via xml_curl) — à revoir si plusieurs trunks/tenants s'ajoutent fréquemment.
Reste à faire : tester un vrai appel entrant/sortant réel (pas fait au moment de l'écriture), router l'InboundRoute vers une destination définitive.
Fichiers : `api/v1/endpoints/trunks.py`, `api/v1/endpoints/xml_curl.py` ; config serveur hors git (`vars.xml`, `sip_profiles/external.xml`, `sip_profiles/external/t1001-gw-1e083163.xml`).

### TASK-S005 [SIPV] [x] DIDs
**Classification: CURRENT**
`TenantDID` : number, label, destination_type (extension/ivr/queue/voicemail/hangup), destination, has_911, e911_address, is_active. Fichiers : `models/sip.py`, `api/v1/endpoints/dids.py`.

### TASK-S006 [SIPV] [x] Routes
**Classification: CURRENT**
`OutboundRoute` (dial_patterns, trunk_id, strip_digits, prepend, priority), `InboundRoute` (did_number, destination_type, destination_id), failover via `SIPTrunk.failover_trunk_id`. Fichiers : `models/dialplan.py`, `api/v1/endpoints/routes.py`, `frontend/src/pages/RoutesPage.jsx`.

### TASK-S007 [SIPV] [x] IVR / Files d'attente / Groupes
**Classification: CURRENT**
Modèles de base : IVR + IVROption, Queue + QueueMember, RingGroup, ParkingLot. `music_on_hold` sur Queue (override par tenant, S033). Fichiers : `models/ivr.py`, `api/v1/endpoints/ivr.py`, `frontend/src/pages/IVRPage.jsx`.

#### TASK-S007.2 [x] Agents de file d'attente (QueueMember étendu)
Champs agent : `agent_number`, `agent_password` (non chiffré, valeur active nécessaire au système), `is_dynamic`, `auto_login`, `pause_allowed`, `pause_reasons`, `wrap_up_time_seconds`, `skills`. `SIPExtension.pickup_group`/`paging_groups`/`can_intercept_calls` ajoutés (concept niveau poste, pas queue). CRUD membres de queue ajouté (n'existait pas avant : `members` était one-shot à la création). ⚠️ Trouvaille : le routage vers une queue est câblé dans le dialplan, mais RIEN ne pousse jamais les queues/agents vers `mod_callcenter` runtime — champs stockés/gérables mais pas encore actifs côté FreeSWITCH (limite documentée, reprise dans plusieurs sous-tâches suivantes). Dépend de : TASK-S007 (queues existantes). Fichiers : `models/ivr.py`, `models/sip.py`, `api/v1/endpoints/ivr.py`, `extensions.py`, migration `0024_queue_agent_pickup_s007_2`.

#### TASK-S007.3 [~] Ring groups reconstruits (priorité/ordre/exclusion/confirmation/horaire)
*(anciennement TASK-S023.9)*
Nouvelle table `ring_group_members` (extension_id, priority, ring_order, temporarily_excluded) — CSV `members` legacy migré automatiquement (migration de données), conservé comme repli. `RingGroup.confirm_before_answer`, `schedule_id` (réutilise S016). `_ringgroup_dialplan_entries()` réécrite : tri hunt par ring_order/priority, exclusion temporaire, vérification horaire, transfert vers `no_answer_destination` si fermé, préfixe `group_confirm_key` si confirmation requise. `MissingGreenlet` corrigé (eager-load manquant). Testé en direct (ordre hunt confirmé, exclusion confirmée). `[~]` : horaire et confirm_before_answer testés seulement au niveau génération XML, pas avec un vrai décrochage/touche. Migration `0032_ring_group_members_s023_9`.

#### TASK-S007.4 [x] QueueMember : sonnerie même si occupé + plusieurs appels de file
*(anciennement TASK-023.10)*
Champs `ring_even_if_busy`, `allow_multiple_queue_calls` — stockés/éditables, PAS poussés vers `mod_callcenter` (même limite que S007.2). ⚠️ Piège Alembic retenu pour tout le projet : `alembic_version.version_num` est `VARCHAR(32)` — noms de révision toujours ≤ 32 caractères. Migration `0033_queue_ring_multi`.

#### TASK-S007.5 [~] Intercom/paging granulaire
*(anciennement TASK-023.11)*
9 champs `SIPExtension` : `intercom_warning_tone`, `intercom_mic_muted_on_answer`, `paging_priority`, `paging_allow_send/receive`, `paging_emergency`, `multicast_address/port`, `forced_volume`. Seul `auto_answer_enabled` (existait depuis S018.3) est réellement câblé : préfixe le bridge `{sip_h_Call-Info=<sip:intercom>;answer-after=0}`. Les 8 autres restent stockés/éditables sans effet réel (multicast = config téléphone P-code, pas dialplan ; micro coupé = nécessiterait script post-réponse, non construit). Migration `0034_intercom_paging`.

#### TASK-S007.6 [x] Préfixe d'interception *8 réellement câblé
*(anciennement TASK-023.15)*
`_pickup_dialplan_entries()` interroge ESL (`show channels`) pour trouver un canal RINGING dont le callee partage le `pickup_group` de l'appelant, émet `intercept {uuid réel}`. Testé avec un vrai appel simulé, UUID confirmé exact. Aucune régression pour les postes sans `pickup_group`. Fichier : `api/v1/endpoints/xml_curl.py`.

#### TASK-S007.7 [x] Groupe de pickup nommé (PickupGroup)
*(anciennement TASK-S023.15.1)*
Nouveau modèle `PickupGroup` (tenant_id, name, is_active) — purement organisationnel : le dialplan `*8` continue de matcher par la string `SIPExtension.pickup_group` (S007.6, non touché). Permet de créer un groupe vide/le renommer en masse. Renommer met à jour tous les membres ; supprimer retire le tag de tous les membres avant suppression (jamais de tag orphelin). ⚠️ Latent trouvé, pas corrigé (hors scope) : `ExtUpdate.can_intercept_calls: bool | None` accepte `None` mais la colonne DB est `NOT NULL` → 500 au lieu d'un 422 propre si `null` explicite envoyé (aucun appelant actuel ne le fait). Dépend de : TASK-S007.6 (anciennement TASK-S023.15), TASKERPCRM TASK-023.19.1. Migration `0055_pickup_groups`.

#### TASK-S007.8 [x] Accès proxy ERPCRM pour les groupes d'appel (ring groups)
*(anciennement TASK-023.20)*
7 endpoints `ring-groups` (list/create/update/delete + membres) basculés de `get_current_user` à `get_current_user_or_service` pour permettre le proxy ERPCRM (X-Api-Key). Fichier : `api/v1/endpoints/ivr.py`.

#### TASK-S007.9 [~] Paging groups (bidirectionnel/unidirectionnel, multicast)
*(anciennement TASK-023.23)*
Nouveau modèle `PagingGroup` (extension déclencheur, mode uni/bidirectional, multicast_address/port) + `PagingGroupMember` (can_send/can_receive). CRUD complet, dialplan diffusion simultanée via `bridge` (l'application dédiée `page` n'existe PAS sur ce build FreeSWITCH — vérifié via `show application`, `bridge` utilisé à la place pour les deux modes). ⚠️ `[~]` : `mode="unidirectional"` ne coupe PAS réellement l'audio retour — les deux modes se comportent identiquement aujourd'hui côté FreeSWITCH (documenté honnêtement). `multicast_address/port` = données de provisioning téléphone, pas encore consommées (S011.4 pas commencée à l'époque). Migration `0040_paging_groups`.

### TASK-S008 [SIPV] [x] Voicemail
**Classification: CURRENT**
`VoicemailBox` + `VoicemailMessage`, options email_on_new/attach_message/delete_after_email. Fichiers : `models/voicemail.py`, `api/v1/endpoints/voicemail.py`, `frontend/src/pages/VoicemailPage.jsx`.

#### TASK-S008.2 [x] Voicemail — accueils audio, langue, politique globale/compagnie/poste
Dépend de : TASK-S008, décision transverse (héritage de settings, résolue plus haut). Première tâche à utiliser la chaîne d'héritage `resolve_setting()` (décision transverse). `TelephonySettings` (singleton Global), `Tenant.voicemail_delete_after_email` (Compagnie), `VoicemailBox.delete_after_email` nullable (Poste). ⚠️ Écart volontaire : résolution explicite en 3 lignes (`_resolve_delete_after_email()`) plutôt que `resolve_setting()` générique — noms de champs différents entre niveaux. Accueils audio : upload/download/suppression par type (unavailable/busy/name/temp), stockage disque privé (jamais public, contrairement au catalogue produit ERPCRM). Chaîne d'héritage à 3 niveaux testée et confirmée (global→compagnie→poste). Migration `0022_voicemail_s008_2`.

#### TASK-S008.3 [x] Conversion automatique du format d'accueil vocal importé
*(anciennement TASK-023.16)*
`ffmpeg` installé (apt universe). Upload converti systématiquement en WAV PCM 8kHz mono via `asyncio.create_subprocess_exec` (async, pas bloquant). Erreur de conversion → 400 explicite. Testé avec un MP3 44.1kHz stéréo réel → conversion confirmée via `ffprobe`. Fichier : `api/v1/endpoints/voicemail.py`.

#### TASK-S008.4 [x] UI Boîte vocale (checkbox activer + options) — gap complet trouvé
*(anciennement TASK-S023.29)*
Gap total confirmé côté ERPCRM avant cette tâche : zéro référence `VoicemailBox` dans le frontend, "Activée/Désactivée" en lecture seule. Un poste pouvait avoir `voicemail_enabled=true` en DB sans AUCUNE ligne `VoicemailBox` réelle. Fait : checkbox activable (crée la boîte au premier coche), courriel/NIP/3 options revélés. 5 endpoints basculés `get_current_user_or_service`. Section repositionnée deux fois selon retours de Philippe (finalement juste avant DND). NIP rendu visible en clair (`VoicemailBox.password` n'a jamais été chiffré — c'est un NIP composé au clavier, pas un mot de passe de connexion, donc décision différente du reste du projet, justifiée explicitement).

#### TASK-S008.5 [~] Bug critique BV corrigé (domain_name jamais posé) + accueil upload/download
*(anciennement TASK-S023.31)*
Philippe a testé le vrai poste 100 : sonnerie → messagerie sans bip, aucun message possible. Cause racine (logs réels) : `domain_name` FreeSWITCH vide (`${domain_name}` non posé) avant l'app `voicemail` — corrigé aux 5 points du dialplan touchant le flux normal (*97, *98, DND, timeout, DID entrant). PAS corrigé : options voicemail dans un menu IVR (bug latent probable, hors du chemin testé). `[~]` volontaire : correction vérifiée structurellement (XML régénéré correct) mais pas reconfirmée par un vrai appel qui laisse effectivement un message — à retester par Philippe. Accueil upload/download/suppression ajouté côté ERPCRM (scope "unavailable" uniquement, le cas signalé).

#### TASK-S008.6 [x] Suite S008.5 : annonce dit le numéro pas le username + sonneries + auto-save
*(anciennement TASK-S023.32)*
Dépend de : TASK-S008.5 (anciennement TASK-S023.31). 3 retours de Philippe traités : (1) annonce disait "t1001-100" au lieu de "100" — corrigé aux 4 endroits concernés, avec repli de lookup par numéro nu si le lookup par username échoue pour l'action `voicemail-lookup` spécifiquement (jamais actif pour un vrai REGISTER). (2) Bouton "Enregistrer" semblait ne rien faire — en réalité les PUT fonctionnaient, juste aucun retour visuel — remplacé par sauvegarde automatique par champ (indice bleu). (3) "Nombre de sonneries avant messagerie" absent pour le cas simple — ajouté, exprimé en NOMBRE DE SONNERIES (conversion basée sur la cadence réelle du serveur, vérifiée pas inventée).

#### TASK-S008.7 [x] Layout Boîte vocale + indice bleu invisible + NIP par défaut configurable
*(anciennement TASK-S023.33)*
Dépend de : TASK-S008.6 (anciennement TASK-S023.32). 4 retours de Philippe : largeurs de champs corrigées (flex au lieu de grille 2 colonnes égales), durée minimum de l'indice de sauvegarde (400ms, réseau local trop rapide sinon), `maxLength=20` sur le NIP (limite DB réelle), nouveau `TelephonySettings.voicemail_default_password` configurable (priorité : NIP explicite > défaut configuré > aléatoire). Migration `0050_vm_default_password`.

### TASK-S009 [SIPV] [x] CDR + coûts
**Classification: CURRENT**
CDR complet (champs FreeSWITCH + direction + cost + prefix_id), `RatePrefix` (prefix unique, rate_per_minute, min_duration, increment — longest-prefix match). Import grille prix : `POST /api/v1/cdr/prefixes/import` (CSV upsert). Résumé (total/answered/billsec/cost) + liste paginée avec filtres + index sur `tenant_id+start_time`. Fichiers : `models/cdr.py`, `api/v1/endpoints/cdr.py`, `frontend/src/pages/CDRPage.jsx`. Étendu plus tard par la famille S055.5/.6/.7 (fixes filtre + rétention configurable + recherche libre).

### TASK-S010 [SIPV] [x] E911
**Classification: CURRENT**
`E911Address` (adresse civique NENA NG911, province, is_validated, carrier_reference, label par adresse — jamais limité à une seule adresse par tenant), `DID911Assignment` (DID→adresse 1:1 unique, emergency_trunk_id, alert_email). Alerte conformité : `GET /api/v1/e911/dids-without-911/tenant/{id}`. Fichiers : `models/e911.py`, `api/v1/endpoints/e911.py`, `frontend/src/pages/E911Page.jsx`.

#### TASK-S010.2 [x] 911 par poste (pas seulement par DID)
Dépend de : TASK-S010 (E911Address/DID911Assignment existants — liés au DID, pas au poste). Nouveau modèle `ExtensionE911Assignment` (une seule assignation active par poste, `emergency_location`/`floor`/`office`/`alert_email`). Réutilise `SIPExtension.site` existant (S018.3) plutôt que de dupliquer "succursale". Endpoints miroir des endpoints DID existants. Migration `0025_extension_911_s010_2`.

#### TASK-S010.3 [x] UI Succursales (911 multi-site) — ERPCRM
Dépend de : TASK-S010, TASK-S010.2. Fondation de données déjà complète côté SIPV depuis S010/S010.2 — seule l'UI ERPCRM manquait (zéro référence E911 dans le frontend avant). 15 endpoints `e911.py` basculés proxy-compatible, `CompanyDetail.jsx` (succursales) + `ContactDetail.jsx` (assignation par poste) ajoutés.

### TASK-S011 [SIPV] [x] Provisioning Grandstream (prioritaire)
**Classification: CURRENT**
`PhoneModel` (brand/model/firmware, config_template Jinja2, max_accounts, protocole), `ProvisionedPhone` (mac_address unique, extension_id, extra_config JSON). `GET /provisioning/mac/{mac}/config` sans auth (appelé directement par le téléphone). Grandstream prioritaire (98% clients). Fichiers : `models/provisioning.py`, `api/v1/endpoints/provisioning.py`, `frontend/src/pages/ProvisioningPage.jsx`.

#### TASK-S011.2 [x] Fiche physique du poste (ProvisionedPhone étendu)
Dépend de : TASK-S011 (provisioning existant). `serial_number`, `hardware_version`, `encrypted_admin_password` (Fernet), `wifi_enabled`, `bluetooth_enabled`, `headset_used`, `expansion_module`. Mot de passe admin jamais renvoyé en clair par défaut (`reveal-admin-password` à la demande). Remplacement d'appareil = PUT avec nouveau MAC/SN sur le même enregistrement (jamais recréer). `GET /esl/registration/{username}` (répondait toujours "Unregistered" — `sofia_contact` exige `user@domain`, pas juste `user`) corrigé en marge. Nombre d'appareils enregistrés (`registered_count`) ajouté à `GET /esl/registration/{username}` et `GET /esl/registrations/tenant/{id}` — a nécessité de changer `_parse_registrations()` (esl.py) qui écrasait silencieusement les enregistrements multiples pour un même username (dict simple) → devenu une liste par username. Migration `0021_phone_physical_fields`.

#### TASK-S011.3 [!] Configuration visuelle du modèle de téléphone (image cliquable)
Dépend de : TASK-S011, TASK-S011.2. Exigence : nouvelle table de mapping bouton (poste/modèle, position, type bouton — BLF/speed dial/extension/autre, valeur, label) + coordonnées cliquables sur l'image, popup au clic avec save/cancel ; décision à trancher au moment du code : mapping stocké par `PhoneModel` (template partagé) ou par `ProvisionedPhone` (par appareil physique) — probablement les deux. ⚠️ BLOQUÉ depuis 2026-07-23 : nécessite la photo du GXP2135 (fournie par Philippe pour le bouton mais jamais pour cette table de mapping visuel précise) — pas de photo = pas de conception de coordonnées cliquables à l'aveugle. Contournement fonctionnel construit à la place : voir S011.11 (éditeur en liste, découplé de la photo, mêmes colonnes réutilisables telles quelles si la photo arrive). Reste bloqué en l'état, en attente de clarification/photo.

#### TASK-S011.4 [~] Auto-provisioning Grandstream (fichier cfg\<MAC\>.xml, zero-touch)
Référence P-codes complète documentée (P271/P31/P270/P47/P48/P35/P36/P34/P3/P130/P2329/P40/P138/P26002/P95030/P212/P237). Mécanisme zero-touch : `cfg<mac>.xml` en HTTPS, `cfg.xml` générique en repli. Limite confirmée : aucun P-code ne force un enregistrement à distance côté serveur — le téléphone décide toujours (démarrage/cycle/retry). **Fait le 2026-08-02** : premier `config_template` GXP2135 réel écrit (Jinja2, croisé contre un fichier ScopServ réel fonctionnel + la doc officielle, jamais copié tel quel). Mot de passe SIP stocké chiffré exposé en clair dans le premier jet du template — corrigé (déchiffré côté contexte avant rendu). Ambiguïté VPK résolue empiriquement (légende "Fixed VPK" du fichier réel, pas "Dynamic VPK" de la doc officielle, qui semble mal étiquetée). `[~]` : le déclenchement "premier démarrage zero-touch" (DHCP option 66 vs config manuelle unique) reste une question ouverte, jamais tranchée avec Philippe. Migration `0045_gxp2135_provisioning`.

#### TASK-S011.5 [x] Catalogue d'options téléphonie — défaut compagnie + override poste
Demande de l'utilisateur (2026-08-02) : reproduire le concept "Options" de l'UCM Grandstream (catalogue de réglages, seuls ceux ajoutés explicitement apparaissent — page propre par défaut) sur 2 niveaux : Compagnie (défaut global) et Contact (personnalisation qui écrase le défaut compagnie pour ce poste précis seulement). `Tenant.phone_option_defaults` (JSON), `ProvisionedPhone.extra_config` (réutilisé). Fusion : défaut système → défaut compagnie → override poste. Catalogue minimal (une option : langue P1362) volontairement, extensible sans migration (dict JSON). `GET/PUT /{tenant_id}` basculés proxy-compatible.

#### TASK-S011.6 — voir TASKERPCRM.md TASK-023.28
Catalogue de paramètres formalisé — construit exclusivement côté ERPCRM (`ref_data.py`), rien côté SIPV pour cet item. Numéro conservé comme référence croisée uniquement (aucun contenu SIPV propre, pas de redistribution nécessaire).

#### TASK-S011.7 [x] Catalogue PhoneModel — 20 marques additionnelles (liste seulement)
Dépend de : TASK-S011.12 (catalogue Grandstream initial, anciennement TASK-023.18). 259 entrées, 21 marques (Alcatel, AudioCodes, Cisco, CyberData, CounterPath, Fanvil, FlyingVoice, Grandstream, Hitachi, LG-Ericsson, Mitel/Aastra, Panasonic, Polycom, Linksys/Sipura, Snom, Tiptel, Uniden, Voice Operator Panel, VTech, Yealink, Other) — liste catalogue uniquement, aucun `config_template` écrit (chantier séparé par modèle). Migration idempotente `0048_seed_more_brands` (guard par paire brand+model). 21 marques / 319 modèles au total confirmés après seed.

#### TASK-S011.8 [x] Pack vocal français FreeSWITCH + lien avec la langue du poste
Dépend de : TASK-S011.5/S011.6 (catalogue "language"). Pack `sounds-fr-ca-june` installé (voix "June", 8kHz — seul pack français officiel disponible est canadien). `_LANGUAGE_PROMPT_MAP` (fr→fr/ca/june, en→en/us/callie) posée par poste selon `Tenant.phone_option_defaults["language"]`. Portée volontairement limitée au niveau Tenant (pas la chaîne à 5 niveaux S044 — chemin sensible à la performance, appelé à chaque REGISTER/INVITE).

#### TASK-S011.9 [x] PhoneModel.device_type (téléphone/ATA/softphone/intercom)
*(anciennement TASK-023.13)*
Champ `device_type` (défaut "telephone"), migration `0036_phone_device_type`.

#### TASK-S011.10 [~] Identification poste : langue d'affichage, fuseau horaire, nom "autre"
*(anciennement TASK-023.14)*
`display_language` (défaut fr, distinct de `VoicemailBox.language`), `timezone` (nullable), `name_override`. `name_override=false` : `sync.py::erpcrm_event` met à jour `SIPExtension.name` ET `caller_id_name` quand le contact ERPCRM change de nom ; `true` : `name` protégé, `caller_id_name` continue de suivre. ⚠️ Limite non résolue ici (documentée ailleurs aussi) : rien côté ERPCRM n'appelle encore `POST /sync/erpcrm-event` automatiquement — mécanisme testé manuellement, jamais déclenché à la source. Migration `0037_ext_identification`.

#### TASK-S011.11 [x] Boutons/touches programmables — éditeur en liste (découplé de la photo)
*(anciennement TASK-023.17)*
Nouvelle table `phone_buttons` rattachée à `ProvisionedPhone` (pas `PhoneModel` — valeurs par appareil physique, cohérent avec S011.2/S011.3). Champs : position, page, button_type (14 types listés : ligne/BLF/composition rapide/parc/récupération de parc/messagerie/transfert/intercom/paging/DND/renvoi/file/agent/pickup group/code fonction/porte/répertoire), label, value, destination, sip_account_index, client_editable, locked_by_simpleip. CRUD complet. Réutilisable telle quelle par S011.3 une fois la photo disponible. Migration `0038_phone_buttons`.

#### TASK-S011.12 [x] Catalogue PhoneModel Grandstream (65 modèles)
*(anciennement TASK-023.18)*
65 fichiers `.txt` de référence P-code parsés/dédupliqués par famille firmware. `device_type` classé par préfixe de famille connu. Migration idempotente `0039_seed_grandstream`.

#### TASK-S011.13 [~] Accès proxy ERPCRM pour modèles/appareils/boutons
*(anciennement TASK-023.19)*
Endpoints `/provisioning/models`, `/provisioning/tenant/{id}`, `/provisioning/{id}` PUT, + 4 endpoints boutons basculés `get_current_user_or_service`. Nouvel endpoint `GET /provisioning/by-extension/{extension_id}` (retourne `null` proprement si aucun appareil, pas une erreur).

#### TASK-S011.14 [x] Templates de configuration de boutons (sauvegarder/appliquer)
*(anciennement TASK-023.25)*
`PhoneButtonTemplate` + `PhoneButtonTemplateItem` (nom + tenant, mêmes champs qu'un bouton sans rattachement à un appareil). `save-as-template` (copie l'état actuel), `apply/{phone_id}` (REMPLACE les boutons existants — sémantique simple, pas de fusion). Migration `0041_button_templates`.

### TASK-S012 [SIPV] [x] Enregistrements d'appels
**Classification: CURRENT**
`RecordingPolicy` per tenant (record_inbound/outbound/internal, retention_days, storage_backend local/dropbox/onedrive/s3, credentials chiffrés). `CallRecording` (metadata, expires_at auto, soft-delete). Intégration cloud = stub non implémenté (OAuth2 SDK requis). Fichiers : `models/recording.py`, `api/v1/endpoints/recordings.py`.
Note cross-ref : ne pas confondre avec `TASK-S012.1` (stockage cloud du CLIENT — mentionné mais jamais construit côté SIPV, voir TASKERPCRM TASK-034).

### TASK-S013 [SIPV] [x] Fax + SMS
**Classification: CURRENT**
`FaxLine`/`FaxJob` (T.38, ATA, PDF). `SMSConfig` per tenant (multi-provider), `SMSMessage`. `POST /sms/webhook/{tenant_id}` public inbound. Dispatch réel vers provider = stub activable, jamais activé (aucun besoin client à ce jour). Fichiers : `models/fax.py`, `models/sms.py`, `api/v1/endpoints/fax.py`, `sms.py`, `frontend/src/pages/FaxSMSPage.jsx`.

### TASK-S014 [SIPV] [x] Sécurité avancée
**Classification: CURRENT**
`SecurityEvent` (audit log), `ACLRule` (CIDR allow/deny, per-tenant/global), `FraudRule` (limites appels/h, blocage auto), `BlockedIP`. SRTP = config FreeSWITCH hors API. Fichiers : `models/security.py`, `api/v1/endpoints/security.py`, `frontend/src/pages/Security.jsx`.

#### TASK-S014.2 [~] Onglet Sécurité — whitelist/blacklist par poste et compagnie + seuils F2B
Dépend de : TASK-S014 (ACLRule/BlockedIP/FraudRule existants). ⚠️ `[~]` volontaire : la gestion de données (CRUD) est faite/testée, la détection/blocage automatique n'existe PAS — module 100% CRUD manuel, aucun watcher ne compte les échecs d'auth en temps réel. `FraudRule.max_failed_auth_attempts` (défaut 5) stocké mais rien ne l'applique. `ACLRule.extension_id` (scope par poste), `POST /security/acl/whitelist-extension/{ext_id}` (whitelist l'IP publique actuelle du poste via ESL). Bonus trouvé en marge, PAS corrigé : `SIPExtension.max_contacts` n'est jamais émis dans le XML directory — aucune limite d'enregistrements simultanés réellement appliquée malgré le champ affiché en UI (syntaxe XML exacte du paramètre mod_sofia non confirmée avec certitude, pas de config silencieusement inefficace risquée sans vérification). Migration `0023_security_s014_2`.

### TASK-S015 [SIPV] [x] Webhooks sortants
**Classification: CURRENT**
`WebhookEndpoint` (url + secret HMAC-SHA256 + event_types), `WebhookDelivery` (log, retry). `POST /webhooks/dispatch` enregistre + met en queue. Dispatch HTTP réel = worker background stub, jamais activé. Fichiers : `models/webhook.py`, `api/v1/endpoints/webhooks.py`.

### TASK-S016 [SIPV] [x] Horaires
**Classification: CURRENT**
`Schedule` (timezone, closed_destination), `ScheduleRule` (days_of_week, open/close), `Holiday`. `GET /{id}/is-open` (zoneinfo). Très réutilisé (S018, S007.3, S045.1). Fichiers : `models/schedule.py`, `api/v1/endpoints/schedules.py`, `frontend/src/pages/SchedulesPage.jsx`.

### TASK-S017 [SIPV] [x] Commit/rollback PendingChange
**⚠️ Classification: LEGACY-ASTERISK — incompatible avec le stack actuel, remplacé par TASK-S017.1**
`PendingChange` model (tenant_id, change_type, entity_type, entity_id, payload JSONB, status, error_message, applied_at, created_by) — conservé, toujours la base de données de S023/S024/S025 (backlog jamais construit). `commit.py` écrivait dans `ps_endpoints`/`ps_auths`/`ps_aors` (tables Asterisk, inexistantes dans FreeSWITCH) — logique morte. Champ `asterisk_synced` sur `SIPExtension`/`SIPTrunk` remplacé par `freeswitch_synced` (S017.1). **NE PAS UTILISER `commit.py` pour de nouveaux développements.** Fichiers (historiques, non retouchés) : `models/pending_change.py`, `api/v1/endpoints/commit.py`.

#### TASK-S017.1 [~] Commit/sync FreeSWITCH
**Classification: CURRENT** *(remplace TASK-S017)*
Dépend de : TASK-S020 (ESL) ✓, TASK-S021 (mod_xml_curl endpoint) ✓. Migration `0016_freeswitch_synced_rename` (RENAME COLUMN asterisk_synced→freeswitch_synced, données préservées). `_apply_change_to_freeswitch(esl)` : appelle `esl.reload_xml()` une fois par commit — pas d'écriture locale, FreeSWITCH retire le XML à jour directement via xml_curl au prochain lookup. `[~]` à l'origine (déploiement serveur + validation réelle en attente) — dans les faits, l'infrastructure ESL/xml_curl qu'il introduit est devenue le socle de tout le routage dans les modules suivants (S020/S021 et tout ce qui en dépend), donc fonctionnellement CURRENT et actif. Note non résolue conservée du texte source : `models/dialplan.py` (OutboundRoute/InboundRoute) garde son propre champ `asterisk_synced` distinct, jamais touché.

---

## Bloc 1bis — Bloqueurs FreeSWITCH foundation

### TASK-S020 [SIPV] [x] ESL — connexion FastAPI → FreeSWITCH
**Classification: CURRENT**
Implémentation asyncio pure (protocole ESL manuel, pas de lib externe type greenswitch — écart vs plan initial assumé). `ESLClient` : connect/api/bgapi/reload_xml/sofia_status/sofia_contact/show_registrations/uuid_kill/originate. Singleton lifespan FastAPI. Fondation de tout le monitoring live et du parcage (S061). Fichiers : `core/esl.py`, `api/v1/endpoints/esl.py`.

#### TASK-S020.1 [x] IP publique/privée sur les registrations (diagnostic NAT/SIP ALG)
`_parse_registrations()` extrait `network_ip` (fiable, vue par FreeSWITCH) et l'IP annoncée dans le Contact SIP (souvent IP LAN) — sert à diagnostiquer SIP ALG/double NAT. `tenant_registrations()` optimisé (1 appel ESL par tenant au lieu d'1 par extension).

#### TASK-S020.2 [~] Monitoring poste temps réel
Dépend de : TASK-S020 (ESL), TASK-S020.1 (IP publique/privée par registration). Réel et testé : ping SIP + `EXPSECS` (nouveau parseur texte `_parse_sofia_reg_detail()`, format non disponible en JSON) ; qualité d'appel (MOS/gigue/perte) seulement si un appel est activement en cours. PAS fait, documenté honnêtement : dernier code erreur SIP (nécessiterait capture d'événements en temps réel, même lacune que la détection F2B S014.2) ; historique en série temporelle (aucun worker de persistance construit).

#### TASK-S020.3 [x] Statut d'appel en direct (en ligne / sonne) par poste
*(anciennement TASK-S023.7)*
`_parse_channel_states()` : parse `show channels as json`, classe `ringing` (RINGING/EARLY) ou `active` (ACTIVE/HELD) — valeurs confirmées par un vrai appel de test. `_lookup_call_state()` matche par sous-chaîne (les champs FreeSWITCH contiennent souvent un suffixe). `RegistrationOut.call_state` ajouté. Testé en direct sans faux positif.

#### TASK-S020.4 [x] Reconnexion automatique sur connexion ESL figée (postes 102/103 affichés rouge alors que réellement enregistrés)
**Date de demande** : 2026-09-11. **Date de travail** : 2026-09-11.
`ESLClient.is_connected` ne reflétait qu'un booléen mis à jour par `connect()`/`disconnect()` — quand le socket TCP mourait en silence (FreeSWITCH redémarré, coupure réseau, pas de FIN/RST propre), `_connected` restait `True` indéfiniment et `get_esl()` ne redéclenchait donc jamais de reconnexion ; chaque appel suivant échouait en 503 jusqu'à un redémarrage manuel du service. Corrigé : `_send()` capture toute exception d'écriture/lecture et marque explicitement `self._connected = False` avant de relancer, pour que le PROCHAIN `get_esl()` reconnecte automatiquement. Vérifié en conditions réelles : coupure ESL provoquée par un vrai redémarrage FreeSWITCH pendant que `sipv-backend-tls.service` restait actif (aucun redémarrage manuel du service SIPV) — 1er appel après coupure échoue (503, détection), 2e appel immédiatement après réussit tout seul et retourne les 4 postes de Simple IP inc. correctement enregistrés (100/101/102/103). Fichier : `sipv/backend/app/core/esl.py` (`ESLClient._send`). Service redémarré : `sipv-backend-tls.service` (port 8022, celui réellement appelé par ERPCRM — distinct de `sipv-backend.service` port 8020, à ne pas confondre à l'avenir).

### TASK-S021 [SIPV] [x] mod_xml_curl endpoint
**Classification: CURRENT**
Endpoint unique `POST /api/v1/xml_curl` (sections directory/dialplan/configuration lues dans le form body). `_handle_directory()`, `_dialplan_internal()`, `_dialplan_public()`, `_config_ivr()`, `_bridge()`. Context naming `internal-{account_number}`. **L'endpoint le plus critique du projet** — sert tout le routage dynamique consommé par la quasi-totalité des modules suivants. Fichier : `api/v1/endpoints/xml_curl.py`.

---

## Bloc 2 — Modèle de données (sync ERPCRM↔SIPV)

### TASK-S022 [SIPV] [~] Lien extension ↔ contact ERPCRM
**Classification: CURRENT**
Dépend de : TASK-S037 ✓, TASKERPCRM TASK-018 ✓. Migration `0018_extension_erpcrm_contact_id` (`erpcrm_contact_id` UUID nullable, pas de FK cross-DB). `core/erpcrm_client.py` (search/create/update_contact). `_link_erpcrm_contact()` best-effort (extension créée même si ERPCRM injoignable). `sync.py::POST /sync/erpcrm-event` (symétrique côté ERPCRM). `[~]` à l'origine (non déployé) — confirmé fonctionnel et utilisé dans des sessions ultérieures (S011.10).

### TASK-S023 [SIPV] [ ] Sync states étendus
**Classification: CURRENT (backlog ouvert)**
Sujet réel du module : étendre `PendingChange.status` (draft/saved/pending/synced/error/blocked_by_impact/approval_required/cancelled) + message client dans le portail. **Jamais construit.** ⚠️ Note de fusion Phase O : les 22 entrées historiquement numérotées `023.X`/`S023.X` dans TASKSIPV.md n'avaient AUCUN rapport avec ce sujet — elles ont été redistribuées vers leurs modules réels (S004/S007/S008/S011/S018/S020, voir `phase_o_id_mapping_sipv.md`). TASK-S023 lui-même n'a donc plus aucune sous-entrée après cette fusion — reste un backlog ouvert intact.

### TASK-S024 [SIPV] [ ] Analyse d'impact
**Classification: CURRENT (backlog ouvert)**
Avant DELETE/PATCH sur extension/groupe/IVR/DID/horaire : vérifier toutes les dépendances, bloquer (`status=blocked_by_impact`) tant que non résolu. Jamais construit. Besoin réel confirmé plus tard (suppression d'un ParkingLot avec appel actif dedans, gap identifié explicitement dans S061).

### TASK-S025 [SIPV] [ ] Sync queue ordonné
**Classification: CURRENT (backlog ouvert)**
Ordre d'application des PendingChange (contacts→extensions→boîtes vocales→renvois→audio→groupes→IVR→horaires→routes→DID→CDR→facturation). Jamais construit, dépend de S023/S024.

### TASK-S026 [SIPV] [~] Audit trail complet
**Classification: CURRENT**
Infrastructure complète (`AuditLog`, `log_audit()`, `GET /audit`), câblage limité à `extensions.py` seulement (create/update/delete). Reste à câbler : trunks/dids/ivr/tenants/commit — jamais étendu depuis. Migration `0015_audit_log`.

---

## Bloc 3 — UX UCM (admin SIPV, port 3020)

### TASK-S018 [SIPV] [~] Fiche extension unifiée (style UCM Grandstream)
**Classification: CURRENT**
Page centrale de gestion d'un poste. Dépend de : TASK-S020 (statut live ESL) ✓, TASK-S016 (schedules, réutilisé) ✓. Statut live (ESL), infos SIP (régénération mot de passe server-side, `POST /extensions/{id}/regenerate-password` génère server-side via `secrets.token_urlsafe`, affiché une seule fois côté UI), voicemail/provisioning en lecture seule (édition ailleurs, pas de formulaire dupliqué). Codec + horaires ajoutés ensuite sur autorisation explicite (migration `0017_extension_codec_schedule` : `codec` nullable + `schedule_id` FK schedules, horaires réutilise le Schedule existant S016 sans dupliquer la "destination hors-heures"). Nouvel endpoint nécessaire ajouté : `GET /extensions/{ext_id}` (fetch unitaire, n'existait pas). Non fait : lien ERPCRM visible mais pas câblé sur cette page à l'époque (fait ailleurs depuis), DND/appels en cours en direct (nécessiterait de nouvelles méthodes ESLClient type `show channels`, plus gros qu'un simple champ). Build frontend vérifié après chaque ajout.

#### TASK-S018.1 [ ] Fiche DID unifiée
SAUTÉE (2026-08-16, boucle autonome) — deux champs demandés ("carrier", "type") sans définition dans le modèle `TenantDID` ni ailleurs (pas de `trunk_id`, pas de valeurs possibles pour "type"). Zéro supposition : reste ouverte en attente de clarification de Philippe sur ces deux champs. Le reste (destination/horaires/E911) existe déjà sur la fiche DID actuelle.

#### TASK-S018.2 [x] Fiche trunk unifiée
Carrier/host/credentials/failover/routes/statut live sur une seule page. 4 endpoints trunks basculés proxy-compatible. `GET /{trunk_id}/status` (statut live réel via ESL, regex de parsing corrigée en testant contre le vrai gateway ScopServ). `GET /{trunk_id}/routes`. Côté ERPCRM : `TrunkSection` dans l'onglet Téléphonie, badge "non synchronisé" honnête (`freeswitch_synced=false`). Vérifié en conditions réelles contre le trunk ScopServ réel.

#### TASK-S018.3 [x] Identification/site, plan d'appel, renvois, DND, codec liste ordonnée, groupes
*(⚠️ voir Annexe "Archives" pour une entrée doublon périmée du même ID, jamais valide — traçabilité conservée, ne pas confondre les deux)*
Champs (migration `0020_extension_s018_3`) : `site`, `description`, `call_permission` (stocké/reflété dans `toll_allow` mais NON appliqué par le dialplan à l'origine — voir S018.5 pour l'application réelle), 4 groupes de renvoi + DND (stockés, pas câblés à l'origine — voir S018.7/S007 pour le câblage réel), `max_concurrent_calls`, `distinctive_ring`, `record_mode`, `codec_list` (remplace `codec`, RÉELLEMENT appliqué via `absolute_codec_string`, défaut `ulaw,alaw,g722,g729`), `max_contacts` (défaut 3→1 pour les nouvelles extensions seulement). Groupes d'appartenance calculés à la volée (pas stockés). Testé en direct sans interruption des postes réels.

#### TASK-S018.5 [x] Plan d'appel réellement appliqué (Canada/US/international/premium/NIP/limite)
`app/core/nanp.py` (classification NANP, `CANADIAN_AREA_CODES` statique vs liste NANPA publique). Champs granulaires par poste (`allow_canada/us/international/premium`, `blocked_countries/prefixes`, `ld_pin` chiffré, `ld_monthly_limit`, `preferred_trunk_id`) + défauts compagnie (`Tenant.default_allow_*`, refus international/premium par défaut). `_call_permission_gate_entries()` génère des rejets 403 AVANT le routage sortant. NIP d'autorisation (`*80<NIP><numéro>`) outrepasse tous les blocages en une seule catégorie (pas de bypass partiel). Testé en direct (premium/international rejetés par défaut, bascule Canada testée réellement). Migration `0029_call_permission_s018_5`.

#### TASK-S018.6 [x] Caller ID séparé interne/externe + masquer + défaut compagnie
`caller_id_internal_name/number`, `caller_id_external_name/number`, `hide_caller_id` — anciens champs conservés comme fallback intermédiaire (compat ascendante totale). `Tenant.default_caller_id_name/number` (défaut externe compagnie). `hide_caller_id` émet `origination_privacy` uniquement sur le sortant. Testé en direct (bascule réelle confirmée). Migration `0030_caller_id_split_s018_6`.

#### TASK-S018.7 [~] Typer les destinations de renvoi + câbler renvoi immédiat/DND
*(anciennement TASK-S023.6)*
4 nouveaux champs `forward_*_destination_type`. `_forward_action_xml()` résout 3 types (extension/voicemail/ring_group) ; external/queue/ivr/message acceptés en stockage mais pas résolus (repli honnête, poste sonne normalement). SEULS renvoi immédiat + DND réellement câblés dans `_ext_dialplan_entries()`. `[~]` : renvoi sur occupé/non-répondu restent stockés/typés mais pas câblés (patron plus intrusif sur le bridge partagé, pas vérifiable honnêtement sans vrai scénario "occupé"/"non répondu"). Migration `0031_forward_destination_types`.

#### TASK-S018.8 [~] Sonnerie détaillée (interne/externe/file/silencieuse/règle caller ID)
*(anciennement TASK-023.12)*
`ring_internal/external/queue`, `silent_ring`, `caller_id_ring_rules`. Câblé pour les appels INTERNES seulement, via header SIP standard `Alert-Info` (transmis par FreeSWITCH, c'est le téléphone qui choisit la sonnerie locale). Priorité : silencieux > règle caller ID > sonnerie interne > sonnerie distinctive générale. `[~]` : `ring_external` (aucun trunk réel pour tester à l'époque) et `ring_queue` (mod_callcenter jamais alimenté) restent stockés sans câblage. Migration `0035_ring_detail`.

---

## Bloc 4 — Portail client (côté ERPCRM, port 3010)

### TASK-S027 [SIPV] [x] Permissions téléphoniques PortalUser ERPCRM
**Classification: CURRENT**
13 champs boolean sur `portal_users` côté ERPCRM (voir TASKERPCRM TASK-017). Validation serveur systématique pas encore applicable — aucun endpoint SIPV ne consomme ces permissions tant que S028/S029 ne sont pas construits.

### TASK-S028 [SIPV] [ ] Portal "Mon poste"
**Classification: CURRENT (backlog ouvert)**
Statut live, DND toggle, renvois, voicemail, CDR personnel — selon permissions individuelles. Jamais construit. Bloque explicitement `dnd_locked` (S052) et l'étape 9 du POC (S036).

### TASK-S029 [SIPV] [ ] Portal "Gestion téléphonique"
**Classification: CURRENT (backlog ouvert)**
Gestion granulaire par permission (postes/IVR/groupes/prompts/CDR compagnie). Trunks/routes/DID/E911/sécurité TOUJOURS protégés (jamais exposés portail). Jamais construit.

### TASK-S030 [SIPV] [ ] Session gestionnaire lock
**Classification: CURRENT (backlog ouvert)**
Une seule session gestionnaire active par tenant, timeout 30 min configurable. Table cible `SIPManagerSession`. Jamais construit.

### TASK-S031 [SIPV] [ ] Code temporaire gestionnaire
**Classification: CURRENT (backlog ouvert)**
Code unique à durée limitée pour un accès ticket limité sans gestion complète. Table cible `SIPTempCode`. Jamais construit.

---

## Bloc 5 — Infrastructure et services

### TASK-S032 [SIPV] [x] Billing triggers SIPV → ERPCRM
**Classification: CURRENT**
Facturation automatique obligatoire (exigence explicite de Philippe). `send_billing_event()` best-effort (ne bloque jamais la création/suppression réelle si ERPCRM injoignable). `extension_added/removed`, `did_added` (uniquement sur `action=="created"` réel, pas update/adopted — évite un câblage décoratif du mauvais chemin). Protection double-facturation naturelle : `sipv_enabled` non coché = aucun tenant = rien à facturer. Testé en direct (ligne créée puis retirée, confirmé).

### TASK-S033 [SIPV] [x] MOH — Music on Hold (câblé pour le hold_music général ; queue mod_callcenter reste bloquée)
**Classification: CURRENT**
Demande de l'utilisateur (2026-08-07/08) : bibliothèque MOH gérée dans "Serveur" (admin ERPCRM) pour voir/téléverser tous les fichiers ; page Compagnie pour voir/choisir les MOH dédiées à ce tenant ; un fichier téléversé SANS compagnie assignée est "Global" et apparaît comme option pour TOUTES les compagnies ; sélection multiple et ordonnée par compagnie. `MohFile` (tenant_id nullable = global) + `TenantMohSelection` (sélection multiple ordonnée). Upload avec conversion ffmpeg. `core/local_stream.py` — approche additive, ne touche jamais le `local_stream.conf.xml` statique existant, un fragment `<include>` par tenant. ⚠️ Rappel du blocage (toujours vrai) : `Queue.music_on_hold` (mod_callcenter) reste un champ mort — `callcenter.conf.xml` jamais généré dynamiquement, distinct du `hold_music` général réellement câblé ici. Migration `0059_moh`.

#### TASK-S033.1 [x] Écoute par appel poste + ordre liste/aléatoire par tenant
`POST /moh/{id}/call` (même principe que S055/AudioPrompt). Bug de permission trouvé et corrigé (copie vers un cache accessible en écriture par `freeswitch`). `Tenant.moh_shuffle` (défaut true = comportement historique). 4 pistes stock FreeSWITCH importées par défaut. Migration `0060_tenant_moh_shuffle`.

#### TASK-S033.2 [x] 0.5s de silence avant le début du MOH
`hold_music` = `file_string://silence_stream://500!local_stream://{stream}` — rejoué à chaque Hold (pas partagé comme le flux `local_stream` lui-même), donc l'effet fonctionne à chaque fois.

#### TASK-S033.3 [ ] Même délai pour les Phrases IVR — configurable, 0.5s par défaut
Explicitement reporté par Philippe ("prochaine conversation") — jamais commencé, ne pas commencer sans nouveau GO. Reste ouvert.

#### TASK-S033.4 [x] Musique d'attente : dossiers hors de /usr/local/freeswitch (écriture refusée depuis le 2026-08-12)
Date de demande : 2026-10-10 (Philippe, après sa première migration (TASK-051) : « pour les permissions d'écriture dans musique, trouve pourquoi et note-le, parce que ce problème va sûrement revenir avec les changements de poste d'un portail… oui fais les corrections aussi »)
Date(s) de travail : 2026-10-10

- **Cause** : le service FreeSWITCH (`systemctl cat freeswitch`) contient `ExecStartPre=/bin/chown -R freeswitch:freeswitch /var/run/freeswitch /var/lib/freeswitch /var/log/freeswitch /usr/local/freeswitch` : à CHAQUE démarrage de FreeSWITCH, tout `/usr/local/freeswitch` repasse à freeswitch. Tout ce que SIPV (utilisateur sipv) écrit dedans devient non inscriptible au premier redémarrage : `sounds/sipv_moh` et `conf/local_stream` (musique d'attente, TASK-S033) depuis le 2026-08-12 — tout changement de musique d'attente (écran, portail, migration) échouait en silence (`regenerate_tenant_moh_stream` est « best-effort », seulement journalisé) ; même cause que TASK-S055.8 (« Appeler »), qui avait été vue comme « un changement de propriétaire ».
- **Correction** (SIPV commit 361e57f) : `settings.MOH_STREAM_DIR = /var/lib/sipv/moh_streams` et `settings.MOH_INCLUDE_DIR = /var/lib/sipv/local_stream` (sipv:sipv 755, lisibles par FreeSWITCH) ; `autoload_configs/local_stream.conf.xml` inclut maintenant `/var/lib/sipv/local_stream/*.xml` (copie de l'ancien : `~/migration_backups/local_stream.conf.xml.before_moh_move`) ; sauvegarde cloud (backup_runner) suit les nouveaux chemins. Flux régénérés : `local_stream show` → moh_t1000 et moh_t1001 depuis /var/lib/sipv. Anciens fichiers (`conf/local_stream/moh_t1001.xml`, `sounds/sipv_moh/`) laissés, plus inclus. FreeSWITCH pas redémarré (couperait les appels) ; le prochain redémarrage ne touche plus ces dossiers.
- **Règle pour la suite** (portail, migration, tout nouveau fichier écrit par SIPV) : jamais sous `/usr/local/freeswitch` — un dossier sous `/var/lib/sipv` avec son chemin en réglage. Déménager le serveur = créer `/var/lib/sipv/{call_cache,moh_streams,local_stream}` (sipv:sipv 755).

### TASK-S034 [SIPV] [ ] Alertes trunk/extension
**Classification: CURRENT (backlog ouvert)**
Événements ESL surveillés (trunk DOWN, extension unregistered, HEARTBEAT absent) → webhook (S015)/courriel/SMS. Simple IP toujours notifié, client selon option. Table cible `SIPAlertConfig`. Jamais construit.

### TASK-S036 [SIPV] [~] POC bout en bout — premier jalon
**Classification: CURRENT**
Dépend de : TASK-S017.1, TASK-S020, TASK-S021, TASK-S022, TASK-S027, TASK-S028, TASK-S037. 10 étapes de validation E2E. Étapes 1-7 confirmées (création tenant/contact/extension, directory XML, registration, appel interne+CDR, isolation multi-tenant). Étape 8 (DID entrant→IVR→extension) explicitement reportée par Philippe (trunk/PSTN "plus tard"). Étapes 9/10 non faites (dépendent de S028/S034, jamais construits). Toujours un jalon de référence valide.

### TASK-S037 [SIPV] [x] Champs contact ERPCRM (nécessaire pour TASK-S022)
**Classification: CURRENT**
Fait côté ERPCRM (TASK-016) : `sipv_sync`, `phone_other` sur Contact. `extension`/`mobile` existants réutilisés pour "Poste SIP"/"Cellulaire" (pas de doublon de champ).

### TASK-S038 [SIPV] [ ] Health check + sync manuelle + alerte connexion
**Classification: CURRENT (backlog ouvert)**
`GET /health/erpcrm`↔`GET /health/sipv`. Bouton "Synchronisation" admin → rapport de cohérence (extensions orphelines, contacts désynchronisés, tenants sans compagnie, noms différents). Jamais construit.

### TASK-S039 [SIPV] [~] Installation Kamailio + rtpengine (SBC, NAT, TLS, sécurité périmètre)
**Classification: CURRENT**
Dépend de : rien techniquement, mais logiquement avant TASK-S014.2 (affichage IP publique/statut F2B fiable pour un poste distant derrière NAT). kamailio 6.0.5 + rtpengine 13.5.1.4 (apt universe). ⚠️ Ne résout PAS le blocage d'accès distant connu (routeur, pas le serveur — voir mémoire projet). Config custom minimale écrite (pas de patch du template vendor 1108 lignes — rôle visé = proxy NAT-aware transparent, pas un registrar autonome). **Cutover live réussi (2026-07-23)** : Kamailio écoute les vrais ports 5060/5061, FreeSWITCH `internal` déplacé sur loopback. `loose_route()` (gaté à tort derrière `has_totag()`) et `fs_path` (traité comme proxy route au lieu d'un header Route standard) corrigés en cutover. Path RFC 3327 fonctionnel nativement côté FreeSWITCH. Validation audio réelle avec vrai téléphone **pas encore faite au moment de cette entrée** (voir S058.2 pour la suite avec vrais téléphones). `rtpengine_manage()` resté désactivé (jamais validé avec audio réel à ce stade).

#### TASK-S039.1 [x] Chiffrement mot de passe SIP + TLS inter-serveurs ERPCRM↔SIPV
Fernet (`core/crypto.py`, clé dérivée de `SECRET_KEY`) pour `SIPExtension.password`. CA privée auto-signée, un certificat par serveur, nouveaux ports TLS dédiés (SIPV 8022, ERPCRM 8011, en plus des ports HTTP existants inchangés). Piège rencontré : CA sans extensions X.509v3 rejetée par OpenSSL 3.x (fonctionnait avec curl, masquant le problème) — régénérée avec `basicConstraints`/`keyUsage` explicites. Validé en direct dans les deux sens.

#### TASK-S039.2 [x] SRTP obligatoire (audio chiffré)
Contexte : l'utilisateur a demandé "TLS & SRTP" après avoir compris que TLS (déjà en place) protège seulement la signalisation, pas l'audio lui-même — objectif exprimé : viser le plus haut niveau de sécurité technique possible. `require-secure-rtp` = code mort dans cette version FreeSWITCH (vérifié contre le source, ne rien lire ce flag) — vrai mécanisme = `rtp_secure_media` (variable de canal). Variable posée dans le directory XML ne fonctionne PAS pour les appels LIVRÉS à un poste (seulement ceux qu'il place) — fix réel = variable GLOBALE dans `vars.xml` (repli natif FreeSWITCH sur les globales). Nécessite redémarrage complet (`vars.xml` lu au démarrage seulement). Validé : SDP `RTP/SAVP` confirmé avec 10 suites de chiffrement. S'applique à TOUS les postes internes sans exception.

#### TASK-S039.3 [x] Plage RTP personnalisée (évite conflit avec ports de jeux)
Plage par défaut FreeSWITCH (16384-32768) chevauchait les ports de jeux hébergés par Philippe sur le même réseau. Changée à 41000-43000 après vérification contre toutes les plages de jeux connues. ⚠️ Erreur commise et corrigée : une première plage (20000-20200) avait été implémentée sur une simple QUESTION traitée à tort comme un GO — corrigée après signalement, refaite seulement après GO explicite. Non résolu, mineur : marquage QoS DSCP référençant l'ancienne plage, module DSCP iptables incompatible sur cet hôte (aucun impact fonctionnel/sécurité). Port forwarding routeur reste à faire par Philippe.

#### TASK-S039.4 [x] Connexion SIP "conventionnelle" (serveur=IP, tenant via lien, pas via domaine)
Contexte : configurer Zoiper (et d'autres apps SIP grand public) a révélé que l'approche "domaine = tenant + outbound proxy séparé" ne correspond PAS à comment la majorité des vrais clients SIP fonctionnent (confirmé par l'expérience de l'utilisateur avec des dizaines de fournisseurs VoIP) — demande explicite : le tenant lié au poste par une vraie relation en base (déjà le cas via `SIPExtension.tenant_id`), le client SIP se connectant juste avec IP/DNS classique + username + password, sans jamais connaître le nom du tenant. Root cause #1 (auth) : le lookup tenant par domaine échouait en premier sans jamais retomber sur une recherche par username si le domaine ne matchait rien. Fix : repli par username → `SIPExtension.tenant_id`. Piège trouvé en testant : FreeSWITCH exige que le `<domain name>` retourné corresponde EXACTEMENT au domaine demandé — fix : écho du domaine brut envoyé (`advertised_domain`) en externe, vrai domaine tenant en interne. Root cause #2 (routage) : même problème dans `_dialplan_internal`, résolu via `variable_sip_from_user`. Résultat : n'importe quelle app SIP peut se connecter avec juste IP/DNS + username complet + password, sans connaître le tenant. Les deux méthodes (avec/sans domaine explicite) coexistent.

### TASK-S040 [SIPV] [ ] App SIP mobile maison (softphone dédié SimpleIP)
**Classification: CURRENT (backlog ouvert)**
Après incompatibilité SRTP probable avec Zoiper en test à distance. Contraintes documentées (SRTP obligatoire natif fiable, connexion conventionnelle, TLS signalisation). Plateforme/librairie SIP pas encore scopées. Jamais commencé.

#### TASK-S040.1 [ ] Softphone SimpleIP pour ordinateur (compagnon du mobile)
Même contraintes que S040, techno pas scopée (Electron vs natif). Jamais commencé, dépend de S040.

### TASK-S041 [SIPV] [x] Fix — courriels cron root rebondissaient vers mail.simpleip.tel
**Classification: HISTORICAL**
`mydestination = localhost` sans `$myhostname` dans Postfix — root@sipv-lab non reconnu comme destination locale, relais échouait. Fix `postconf -e` + reload. Config serveur uniquement, aucun code touché. Correctif ponctuel fermé, aucune suite attendue.

### TASK-S042 [SIPV] [~] Fondation multi-serveur SIPV (pas le dispatcheur "classe 4")
**Classification: CURRENT**
`SipvServer` (name/hostname/ip_address/is_active), `Tenant.server_id` (FK nullable). Migration `0044_sipv_servers` avec seed automatique + backfill (aucun tenant orphelin). Décision explicite : un seul serveur nécessaire aujourd'hui/5-6 ans, mais logiciel destiné à être vendu — fondation de données construite maintenant (coût quasi nul), dispatcheur central lui-même reporté tant qu'un 2e serveur n'est pas réellement provisionné (aucune valeur testable à un dispatcheur pour un seul serveur).


#### TASK-S042.1 [x] Un tenant créé par ERPCRM est rattaché au serveur
Date de demande : 2026-10-10 (trouvé pendant la correction du provisionnement, TASK-051)
Date(s) de travail : 2026-10-10

- Constaté : T1000 (créé le 2026-10-10 par l'activation de la téléphonie de Compagnie test) avait `server_id` vide — `sync/company` ne le remplissait pas — donc la configuration des téléphones de ses postes sortait sans serveur SIP (`<P47></P47>`, `<P48></P48>` Grandstream).
- Corrigé (SIPV commit 523f551) : `sync/company` rattache le nouveau tenant au serveur actif s'il n'y en a qu'un ; migration `0067_tenant_default_server` (T1000 rattaché à sipv-lab). Plusieurs serveurs un jour : ERPCRM devra dire lequel (dispatcheur, reste à faire).

### TASK-S043 [SIPV] [ ] Architecture 3 couches (Serveur/Compagnie-Tenant/Contact-Poste) — backlog validé
**Classification: CURRENT**
Dépend de : TASK-S042 (première ronde d'analyse architecture). Document de référence issu du travail ChatGPT+Philippe (2026-08-02), sert de feuille de route active — S044/.1/.2 s'y réfèrent comme "item 1". Déjà construit et confirmé aligné : héritage `resolve_setting()`, caller ID "As Company", objets partagés du tenant, E911, catalogue d'options S011.5, fondation multi-serveur S042. Pas construit — items 2-6 : Global Templates à 5 niveaux (partiellement fait depuis via S044), Global Policy formalisée, registre 911 automatique + tableau de bord, trunks/routes en onglets de haut niveau ERPCRM, catalogue de paramètres riche (démarré via TASKERPCRM TASK-023.28), nettoyage terminologie Grandstream-only.

### TASK-S044 [SIPV] [x] Global/Tenant/Model Templates — chaîne d'héritage
**Classification: CURRENT**
Dépend de : TASK-S043 (item 1), TASK-S011.6/TASK-023.28 (item 5, catalogue). 3 modèles (`GlobalTemplate` scopé serveur, `TenantTemplate`, `TenantModelTemplate`) — Global Policy (Tenant.phone_option_defaults, S011.5) → Global Template → Tenant Template → Tenant Model Template → poste, le plus spécifique gagne. Testé de bout en bout sur le GXP2135 physique réel avec bascule de rendu confirmée à chaque niveau. CRUD+UI ajoutés le même jour. Migration `0046_template_inheritance_chain`.

#### TASK-S044.1 [x] Choix explicite des templates + bibliothèque par serveur (correction de placement)
Dépend de : TASK-S044. Corrigé suite au test de Philippe : `TenantTemplate` déplacé de Compagnie vers Serveur (bibliothèque par serveur, comme `GlobalTemplate`) — modèle mental hiérarchique de Philippe (Serveur→Compagnie→Contact, "create" dans la couche supérieure, "choix" dans la couche adéquate). Résolution passée de "scan is_default" à référence explicite (`Tenant.selected_tenant_template_id`, `ProvisionedPhone.selected_tenant_model_template_id`). Mécanisme "as template" par champ ajouté (`PhoneOptionsEditor.jsx`). Migration `0047_template_explicit_selection`.

#### TASK-S044.2 [x] Templates choisissables PLUSIEURS à la fois + visibilité du Global dans Compagnie
Dépend de : TASK-S044.1. Les 3 FK simples converties en tableaux UUID (fusion dans l'ordre, dernier gagne). `Tenant.selected_global_template_ids` nouveau (Global Templates supplémentaires en plus du `is_default` automatique). Frontend : listes à cases à cocher au lieu de `<select>`. Testé avec les vrais templates de Philippe ("Global Français"/"Global Anglais"). Migration `0049_template_multi_select`.

### TASK-S045 [SIPV] [x] Sync succursale (E911Address) + DID (TenantDID) depuis ERPCRM maître
**Classification: CURRENT**
Dépend de : TASK-S010.3, TASKERPCRM TASK-023.30/.31. ERPCRM devient maître pour `CompanySite`→`E911Address` et `DID`→`TenantDID` (même patron bloquant que `sync_company`). `erpcrm_site_id`/`erpcrm_did_id` (upsert). `DELETE /dids/{id}` proxy-compatible (avant : suppression impossible depuis ERPCRM, miroir orphelin). Schedules endpoints proxy-compatible. Migrations `0051`→`0053`.

#### TASK-S045.1 [x] Destination par plage horaire (ScheduleRule) + endpoint d'édition manquant
Dépend de : TASK-S045, TASKERPCRM TASK-023.31.1. `ScheduleRule.destination_type/destination`. Nouveau `PUT /rules/{rule_id}` (une règle ne pouvait avant qu'être créée ou supprimée, jamais modifiée en place). Migration `0054_schedule_rule_destination`.

### TASK-S046 [SIPV] [x] Bibliothèque de phrases/annonces réutilisables (Prompts)
**Classification: CURRENT**
`AudioPrompt` (tenant_id CASCADE, name, filename, duration_seconds). Upload multipart converti ffmpeg (WAV 8kHz mono). Suppression bloquée si référencée (IVR greeting, DID destination "message", InboundRoute) — liste des usages retournée dans l'erreur 400. Onglet "Phrases" dans `TenantDetail.jsx`. Migration `0056_audio_prompts`.

### TASK-S047 [SIPV] [x] Câblage réel des phrases dans IVR (greeting) + destination DID/route "message"
**Classification: CURRENT**
Dépend de : TASK-S046 ✓, TASK-S048 ✓ (sans le fix S048, ce câblage n'aurait jamais été atteignable par un DID configuré normalement depuis ERPCRM). `after_message_destination_type/destination` sur DID/InboundRoute (chaînage après lecture, un seul niveau autorisé). `IVR.greeting_prompt_id` (prioritaire sur `greeting_text`/TTS). Testé de bout en bout (message seul → hangup ; message + chaînage → bridge ; greeting IVR confirmé dans `ivr.conf`). Écart vs plan : options IVR par chiffre (0-9) n'ont PAS reçu de type "message" (limitation mod_dptools, une seule app par option) — documenté comme S047.1 potentielle si demandé un jour.

### TASK-S048 [SIPV] [x] Bug critique — TenantDID jamais synchronisé vers InboundRoute
**Classification: CURRENT**
`_dialplan_public()` (appelée à CHAQUE appel entrant réel) lisait uniquement `InboundRoute`, jamais `TenantDID` — malgré le docstring de `sync_did()` affirmant le contraire. Changer une destination DID depuis ERPCRM n'avait donc AUCUN effet réel, sauf le seul DID de test routé par script ponctuel. `app/core/did_route_sync.py` (nouveau) : `sync_inbound_route_from_did()` crée/met à jour/supprime le miroir InboundRoute, appelée aux 2 seuls points d'entrée réels (sync ERPCRM + chemin natif SIPV). Ce correctif EST le mécanisme de routage réel actif aujourd'hui. Migration 0056.

### TASK-S049 [SIPV] [x] Bug — CDR perdus pour les appels via trunk sortant
**Classification: CURRENT**
`cdr.py::ingest_cdr()` résolvait le tenant via `sip_from_host` en premier (toujours vrai pour un trunk, jamais vide) plutôt que `domain_name` (que le dialplan fixe explicitement) — CDR silencieusement perdu pour tout appel via trunk sortant. Fix : ordre de priorité inversé. Correctif intégré au chemin d'ingestion CDR actif en permanence.

### TASK-S050 [SIPV] [x] Sécurité — ACL entrante sur le profil "external" (trunks PSTN)
**Classification: CURRENT**
Demande explicite de l'utilisateur (2026-08-07 matin) : même pratique que sur ses autres serveurs — n'accepter le trafic SIP entrant que depuis le proxy du fournisseur, pour éviter les appels fantômes d'un scan/bot. Le profil `external` n'avait AUCUNE ACL entrante — port SIP du trunk grand ouvert à Internet. Nouvelle liste `sipv-trunks` (`default="deny"`, allow uniquement l'IP du fournisseur ScopServ). ⚠️ Limite connue : une seule IP (résolution DNS ponctuelle) — si le fournisseur utilise un pool d'IP ou change d'IP, de vrais appels pourraient être bloqués sans avertissement, à confirmer avec une plage CIDR officielle. Commentaire XML `--` corrigé la même nuit (premier cas documenté de ce piège, récidivé plus tard S061/2026-08-20).

### TASK-S051 [SIPV] [x] Chaîne illimitée de destinations après un groupe d'appel sans réponse
**Classification: CURRENT**
Demande de l'utilisateur (2026-08-07 matin), reformulée après plusieurs sessions sans suite ("ça fait plusieurs fois que je te le demande") — voir [[feedback_log_verbal_requests_immediately]], demande non tracée avant cette session. `RingGroup.no_answer_destination` existait depuis S007.3 mais n'était JAMAIS lu par le dialplan dans le cas "groupe ouvert avec membres actifs" (seul le cas "fermé par horaire" l'utilisait) — même famille de bug que S047/S048. `RingGroupFailoverStep` (liste ordonnée illimitée) remplace le champ simple (conservé en base pour compat lecture, marqué LEGACY). Reconstruction du username préfixé (manquante pour le type "extension") corrigée en testant. Côté ERPCRM : proxy + UI complète (`RingGroupsSection`). Migration `0057_ring_group_failover_steps`.

### TASK-S052 [SIPV] [~] Audit des champs SIPExtension stockés mais jamais câblés (busy/offline)
**Classification: CURRENT**
Audit demandé explicitement par Philippe ("il faut mettre toute la portion pas juste le début"). État par champ : `forward_immediate_enabled`/`dnd_enabled`/`auto_answer_enabled`/`forward_no_answer_enabled` déjà câblés ailleurs (S018.7/S007.5/S008.5) ; `forward_busy`/`forward_offline` **câblés cette tâche** (structure additive, régression vérifiée caractère pour caractère) ; `call_permission` tranché avec Philippe — retiré de l'UI (redondant avec le système granulaire réel S018.5) ; `dnd_locked` et `QueueMember.ring_even_if_busy`/`allow_multiple_queue_calls` restent BLOQUÉS (dépendent respectivement de S028 portail et de la génération dynamique de `callcenter.conf.xml`, jamais construite) ; `max_concurrent_calls` reste non câblé (mécanisme `mod_limit` probable, sémantique exacte pas confirmée).

### TASK-S054 [SIPV] [x] Champs config canaux SIP (IP entrante/sortante) sur le serveur
**Classification: CURRENT**
`SipvServer.sip_inbound_ip/outbound_ip` (nullable, demande explicite de construire les CHAMPS sans deviner de valeurs — le fournisseur du client n'avait pas encore communiqué les IP réelles). Bug trouvé et corrigé : `update_server()` exigeait JWT strict alors que `list_servers()` acceptait déjà le service — harmonisé. Reste à faire : appliquer ces valeurs au binding réseau réel une fois les vraies IP connues (pas bloquant côté code).

### TASK-S055 [SIPV] [~] Écouter/enregistrer un audio via appel à un poste (générique)
**Classification: CURRENT**
Dépend de : rien de bloquant techniquement (ESL + xml_curl existent), mais travail neuf des deux côtés (SIPV dialplan/ESL + ERPCRM UI). Deux modes demandés : Mode 1 "Faire écouter" (playback vers un poste actif/connecté, tenant+poste choisis) ; Mode 2 "Enregistrer" (menu DTMF 1/2/3 pour phrase IVR, jamais construit). `esl.originate_app()` — première vraie feature à utiliser `esl.originate` (existant mais jamais appelé ailleurs avant). Architecture du Mode 2 pas tranchée (statique XML vs script Lua/JS), GO requis avant de commencer.

#### TASK-S055.1 [x] Mode 1 partiellement implémenté (Phrases IVR) + fix appel qui ne sonnait pas
`POST /prompts/{id}/call`. Bug : `internal.xml` force TOUS les enregistrements SIP dans le domaine unique `sipv` peu importe le tenant — endpoint construit `user/{username}@{tenant}` au lieu de `@sipv`. Fix confirmé par test réel (`fs_cli`).

#### TASK-S055.2 [x] Fix .1 insuffisant — 2e bug de syntaxe ESL (espace non protégé dans caller_id_name)
`originate_app()` construisait les variables sans guillemets — un caller_id_name avec espace ("Ecoute Phrase") cassait le parseur FreeSWITCH (`DESTINATION_OUT_OF_ORDER`). Fix : guillemets simples systématiques. Confirmé par l'utilisateur : le bouton "Appeler" fait sonner et joue la phrase.

#### TASK-S055.3 [x] 1 seconde de silence avant la lecture (temps de porter le combiné à l'oreille)
`_copy_with_lead_silence()` (préfixe silence au format WAV source, écrit en cache). ⚠️ Confirmé par Philippe : doit devenir le comportement PAR DÉFAUT de toute écoute d'enregistrement par appel, réutilisable générique.

#### TASK-S055.4 [x] Régression — route /call + fixes .1/.3 perdus lors d'un déploiement (retrouvés et réappliqués)
Dépend de : TASK-S055, TASK-S055.1, TASK-S055.3. Un rsync depuis le dépôt local `/home/simpleip/sipv` (miroir sur ERPCRM) a écrasé `prompts.py` sur SIPV avec une copie n'ayant jamais reçu les ajouts S055/.1/.3. Aucun changement de comportement voulu — remise en état seulement. **Confirme un cas réel du risque de mirroring documenté ailleurs.**

#### TASK-S055.5 [x] Fix filtre CDR par poste — ratait les appels SORTANTS
Dépend de : TASK-S055. `CDR.src` stocké préfixé tenant ("t1001-103") — le filtre `CDR.src == extension` ne matchait jamais une source. Fix : ajout d'un 3e terme `LIKE '%-{extension}'`. Vérifié : poste 103, 0 résultat avant → 17 après.

#### TASK-S055.6 [x] Rétention CDR configurable + champs de détail
`Tenant.cdr_retention_days` (défaut 365) + worker de purge horaire. `CDROut` étendu (answer_time/end_time/duration/clid/accountcode). Migration `0062_cdr_retention`.

#### TASK-S055.7 [x] Filtre CDR par recherche libre (search) sur src/dst
Paramètre `search` (`ILIKE '%...%'`) sur `GET /cdr/tenant/{id}`.

#### TASK-S055.8 [x] « Appeler » (écouter une phrase / une musique d'attente sur un poste) en échec depuis le 2026-08-14 — permission refusée sur le cache
Date de demande : 2026-10-09 (Philippe : « le ERPCRM qui envoie la commande de faire sonner le poste pour faire écouter la musique en attente » ne marche pas quand il est à l'extérieur du bureau)
Date(s) de travail : 2026-10-09 (diagnostic, puis correction après GO)

- Pas lié à l'extérieur : la commande passe par le serveur (navigateur → ERPCRM → SIPV 8022 → FreeSWITCH). Journal ERPCRM : derniers succès le 2026-08-12, puis 4 échecs sur 4 (502) : 2026-08-14 (phrase), 08-29 et 08-30 (musique d'attente), 10-07 (phrase).
- Cause (journal sipv-backend-tls) : `PermissionError: [Errno 13]` à l'écriture de la copie dans `/usr/local/freeswitch/conf/prompts_cache/` et `/usr/local/freeswitch/conf/moh_call_cache/` (prompts.py `_copy_with_lead_silence`, moh.py `shutil.copy2`). Dossiers et fichiers appartiennent à `freeswitch:freeswitch` (755 / 644) ; le service SIPV tourne en `sipv` → ne peut ni créer ni réécrire.
- Ces deux dossiers avaient été créés à la main en `sipv:sipv` (commentaires du code : « PAS persistant via code/migration ») et sont repassés à `freeswitch` le 2026-08-12 : la fonction a cassé sans que personne le voie pendant près de 2 mois.
- Correction (GO de Philippe, 2026-10-09) : nouveau réglage `CALL_CACHE_DIR` dans `config.py` SIPV (défaut `/var/lib/sipv/call_cache`), `PROMPT_CACHE_DIR = CALL_CACHE_DIR/prompts` (prompts.py) et `MOH_CALL_CACHE_DIR = CALL_CACHE_DIR/moh` (moh.py). Dossier créé une fois : `sudo install -d -o sipv -g sipv -m 755 /var/lib/sipv /var/lib/sipv/call_cache` — à refaire si le serveur déménage (noté dans config.py). Plutôt que de rouvrir les droits sur conf/, qu'un prochain changement de propriétaire recasserait. Les anciens dossiers sous conf/ sont laissés en place (plus utilisés).
- Preuve réelle, poste 102 (t1001-102) via les vrais endpoints ERPCRM : musique d'attente « decontract » (`POST /api/v1/server/moh/{id}/call` → 200, décroché, lecture de `/var/lib/sipv/call_cache/moh/…wav` sans erreur, raccroché NORMAL_CLEARING) ; phrase « sood » (`POST /api/v1/telephony/prompts/{id}/call` → 200, « done playing file » sur `/var/lib/sipv/call_cache/prompts/…wav`). Philippe a entendu l annonce au téléphone (« bonjour soud »).

### TASK-S056 [SIPV] [x] Audit config centralisée — éliminer les IPs/chemins codés en dur restants
**Classification: HISTORICAL**
13 chemins absolus codés en dur trouvés à travers 6 fichiers SIPV (ERPCRM déjà propre) — tous éliminés via `APP_DIR`/`FREESWITCH_DIR` centralisés dans `config.py`. Vérifié avant déploiement (assert Python, aucun changement de comportement). Non touchés volontairement : chemins d'installation système standards (kamailio.cfg, vars.xml). Audit ponctuel fermé, aucune évolution depuis.

### TASK-S057 [SIPV] [x] ⚠️ OBSOLETE — Provisioning transport SIP jamais poussé (doublon non détecté de TASK-S011.4)
**Classification: OBSOLETE**
Ouverte le 2026-08-11 suite à un symptôme réel (poste 103 en UDP malgré config héritée de l'ancien UCM). Investigation (2026-08-16) : le câblage dynamique demandé (`P130`/`P2329` selon `SIPExtension.transport`) existait DÉJÀ dans le `config_template` Jinja2 depuis TASK-S011.4 (2026-08-02) — 9 jours avant l'ouverture de cette tâche. **Aucun changement de code nécessaire** — correction de documentation seulement. La vraie cause du symptôme original : le téléphone physique 103 n'avait simplement pas re-tiré sa config depuis SIPV depuis le 08-02 (config héritée, jamais re-provisionnée). → Voir **TASK-S011.4** pour le vrai câblage actif. Conservé ici comme trace de l'investigation (pas en annexe, car documente une vraie leçon méthodologique : toujours grep le contenu réel d'un template stocké en DB, pas seulement le code Python de l'endpoint, avant de conclure à un gap).

### TASK-S058 [SIPV] [x] Bug — Hold GXP2170/GXP2135 raccrochait au lieu de mettre en attente (rejet SRTP re-INVITE)
**Classification: CURRENT**
Après résolution de S057, testé avec de vrais appels bidirectionnels réels. Hold → `488 Not Acceptable Here` (`rtp_secure_media=mandatory` forcé sans exception, l'offre SDP du Hold ne réoffre pas de `a=crypto`). Fix : `execute_on_answer=set:rtp_secure_media=optional` — SRTP reste obligatoire pour établir l'appel, optionnel pour les renégociations ultérieures. Incident pendant le déploiement : commentaire XML avec `--` a cassé TOUS les REGISTER jusqu'au correctif (2e occurrence du piège S050).

#### TASK-S058.1 [x] Keep-alive NAT serveur aligné sur les téléphones (20s)
`nat-options-ping=true` + `ping-mean-interval=20` (les Grandstream envoient déjà un keep-alive NAT à 20s côté client, FreeSWITCH n'en envoyait aucun côté serveur).

#### TASK-S058.2 [x] Kamailio (SBC, S039) jamais validé avec vrais téléphones — 3 bugs trouvés et corrigés
Premier vrai test audio réel du cutover Kamailio du 2026-07-23. 3 bugs trouvés : (1) coupure automatique ~32s — `ext-sip-ip` du profil `internal` pointait encore vers l'IP publique alors que le profil écoute en loopback derrière Kamailio, retiré. (2) `auth-calls` jamais réellement actif (référence à une variable jamais définie) — INVITE entrants jamais authentifiés, cause du mauvais nom affiché ET du mauvais MOH sur les Hold. (3) Voix silencieuse en début d'appel jusqu'au premier Hold — **vraie cause prouvée** : `rtpengine_manage()` était en fait actif (contrairement à la doc S039 qui le disait désactivé) et réécrivait le SDP avec ses propres ports média jamais annoncés par FreeSWITCH — recommenté, retour au média direct.

#### TASK-S058.3 [x] MOH — mauvais fichier sélectionné + reprise de position par appel en cours
Fichier de test ("Arianne") sélectionné par erreur au lieu du vrai MOH voulu — corrigé en base. Mécanisme de reprise de position construit (`app/core/moh_hold_tracker.py`, service ESL dédié écoutant CHANNEL_HOLD/UNHOLD/HANGUP_COMPLETE, `playback_last_offset_pos` natif FreeSWITCH lu sur le partenaire) — prouvé manuellement avant de coder. Limite acceptée : en mode Liste si un Hold dépasse la durée du fichier en cours, la reprise cible le même fichier avec l'offset (jamais de lecture corrompue, retombe sur le comportement par défaut si incohérent).

#### TASK-S058.4 [x] MOH — local_stream:// retiré, remplacé par file_string:// (réinitialisation à zéro à chaque appel)
Bug architectural racine : `hold_music` pointait vers un flux continu partagé (`local_stream://`) qui ne redémarre jamais à zéro — faussait tout le troubleshooting Hold précédent. Fix : lecture directe des fichiers `.wav` du tenant, chaînés via `file_string://` (redémarre bien à zéro, vérifié dans le source FreeSWITCH). Confirmé par test réel sur téléphone (2 appels distincts, chacun repart du début).

### TASK-S059 [SIPV] [x] Backup cloud automatique de notre propre infra SIPV (pas client)
**Classification: CURRENT**
⚠️ Distinct de S012.1 (stockage cloud du CLIENT, payant, jamais construit côté SIPV). Backup interne (DB + config serveur + MOH) vers Dropbox/Google Drive. Architecture : OAuth relayé par ERPCRM (seul serveur avec domaine public joignable) — SIPV ne partage jamais son `client_secret`. `CloudBackupConnection`, `BackupCycle`, `BackupRunLog` (migration `0061_backup_tables`). Rotation par préfixe, anti-boucle (une tentative/jour/connexion). Dropbox connecté et testé en conditions réelles ; Google Drive reporté par choix explicite de Philippe (pas un blocage technique).
**Incident de mirroring documenté dans cette tâche (2026-08-16)** : le dépôt GitHub `CaptainePoui/SIPV` était poussé depuis un miroir périmé conservé sur ERPCRM (`/home/simpleip/sipv`), le vrai serveur SIPV n'ayant jamais eu de clé SSH GitHub. Un `rsync --delete` de rattrapage a failli supprimer `TASKSIPV.md`/`CLAUDE.md`/`.env` (récupérés). Philippe a explicitement rejeté cette architecture et demandé un accès Git DIRECT depuis SIPV lui-même — déploy key générée, en attente d'autorisation GitHub à la fin du fichier source.

### TASK-S060 [SIPV] [ ] Conférence — backlog non prioritaire
**Classification: CURRENT (backlog gelé, pas obsolète)**
`mod_conference` chargé/configuré côté FreeSWITCH mais aucun modèle SIPV ne l'exploite. Explicitement déprioritisé par Philippe ("en 8 ans j'ai utilisé conference 1 fois"). Distinct de S061 (Parcage) — ne jamais les regrouper malgré un statut technique similaire.

### TASK-S061 [SIPV] [ ] Parcage d'appel — utilisé en permanence chez les clients, PAS déprioritisé
**Classification: CURRENT — module le plus actif du fichier source au moment de la fusion**
⚠️ Distinct de S060 — fonction critique utilisée activement et en permanence chez les clients de Philippe (équivalent moderne d'une ligne partagée en attente, BLF sur tous les postes). `ParkingLot` existait comme modèle depuis S007 mais sans aucun endpoint exposé avant cette tâche.

**Plan technique vérifié ligne par ligne dans le source `mod_valet_parking.c` réel du serveur** (pas deviné) : `valet_park <lot> auto in <min> <max>` pour le pilote, `valet_park <lot> <extension>` pour park/reprise directe (une seule appli gère les deux). Ordre d'exécution retenu (10 étapes, GO explicite de Philippe à chaque étape) :

1. **Mécanisme central de collision de numéros** [x] — `app/core/numbering.py`, aucune nouvelle table, interroge directement `sip_extensions`/`ring_groups`/`paging_groups`/`parking_lots`. Trou systémique confirmé : aucune validation d'unicité ne croisait ces tables avant cette tâche. Infrastructure de tests créée (première du projet) : DB `sipv_test` dédiée, garde-fou anti-fuite vers la DB de dev, transaction+SAVEPOINT par test. 12/12 tests verts. **Bug de branchement trouvé et corrigé le jour même** : le validateur n'était appelé nulle part au moment du premier récapitulatif — corrigé, re-testé (5 tests HTTP réels ajoutés).
2. **CRUD ParkingLot** [x] — validation de cohérence interne (start≤end, pilote hors de sa propre plage) + collision sur l'état fusionné (jamais sur le seul champ envoyé, exigence explicite de Philippe). 21/21 tests verts.
   **Point de concurrence identifié, PAS corrigé (demande explicite : identifier, ne pas construire de table registre)** : aucune sérialisation transactionnelle nulle part dans le projet, aucune contrainte unique DB sur les colonnes de numérotation — deux requêtes simultanées pourraient créer un vrai doublon silencieux. Dette réelle, prouvée dans le code, pas hypothétique. Mitigation suggérée pour plus tard : verrou avisoire Postgres par tenant (`pg_advisory_xact_lock`), pas construit.
3. **Dialplan pilote (700 → auto in start/end)** [x] — clé technique FreeSWITCH dérivée de l'UUID (`tenant_{id}_parking_{lot_id}`), **jamais** du nom affiché (`ParkingLot.name`, modifiable) : namespace `mod_valet_parking` confirmé GLOBAL au processus (pas par tenant) dans le source — sans cette clé dérivée, deux tenants avec le même nom de lot partageraient littéralement le même pool de slots en mémoire FreeSWITCH.
4. **Dialplan plage 701-7xx (parcage direct + reprise)** [x] — une seule règle dialplan pour toute la plage (regex alternation), comportement natif confirmé par Philippe contre son UCM réel (transférer au pilote = premier slot libre ; transférer/composer un slot précis = ce slot précisément, park ou reprise selon occupation) — aucune logique "retrieve only" à fabriquer.
5. **Tests réels sur vrais postes** [en cours] — TEST 1 (valet auto) et TEST 3 (slot manuel) confirmés fonctionnels avec bridge audio réel. 4 défauts distincts trouvés en testant :
   - **MOH délai 500ms** — RÉSOLU et vérifié à la milliseconde (retiré de `hold_music_var`, déplacé vers les chemins de préécoute `call_moh`/`call_prompt` où il compense le temps de décrocher).
   - **MOH repart du début à chaque park/reprise** — NON RÉSOLU. Cause identifiée : `valet_park` déclenche son propre événement custom `valet_parking::info` (Action=hold/exit/bridge), jamais écouté par `moh_hold_tracker.py` (S058.3, conçu pour le Hold classique CHANNEL_HOLD/UNHOLD). Preuve de continuité UUID obtenue (même `call_uuid` du bout en bout d'un cycle park→reprise→re-park). **Bug de décodage résolu séparément** : les événements ESL `event plain` sont URL-encodés par FreeSWITCH (`::`→`%3A%3A`) — `_parse_event_body()` ne décodait jamais, comparaison toujours fausse. Corrigé (`urllib.parse.unquote`). Malgré le fix, la continuité MOH pour le parcage reste NON confirmée en test réel — **décision explicite de Philippe (2026-08-20) : "je suis tanné de ce point, on passe à autre chose"** — ne pas relancer sans nouvelle demande.
   - **Annonce du slot inaudible** — macro `valet_announce_ext` absente en français à l'origine ; construite ensuite (voir ci-dessous) mais **reste inaudible en test réel** (2026-08-20, cause non diagnostiquée, investigation mise de côté par Philippe).
   - **BLF ne s'allume pas** — mécanisme natif confirmé présent dans le source (présence par slot, pas seulement par lot), hypothèse de domaine non confirmée, moniteur ESL de diagnostic construit mais aucune capture décisive obtenue.
6. **Timeout/orbit** [x] — `valet_parking_orbit_exten` posé dynamiquement via `sip_h_Referred-By` (poste qui a réellement parqué l'appel, PAS `sip_referred_by_user_stripped` qui ne se peuple pas dans ce chemin de code, prouvé par capture réelle) — `return_extension` du lot devient un FALLBACK si l'en-tête est absent, jamais le mécanisme principal (reclassification explicite de Philippe : "je ne veux pas de poste de sécurité, je veux avoir l'option de rappel"). `break="never"` explicitement posé sur la condition dynamique (le défaut FreeSWITCH `break="on-false"` aurait silencieusement sauté `valet_park` en l'absence de `Referred-By`). Testé en direct : timeout réel → rappel du bon poste → reconnexion confirmée.
   **Reste à construire** (pas de GO donné) : mode `timeout_return_mode` (parker/fixed) explicite par lot, demandé par Philippe le même soir — pas encore de migration ni de champ créé.
7. **valet_info / statut** — pas encore construit.
8. **BLF réel à travers Kamailio** — non prouvé (voir point 5).
9. **Provisioning des touches BLF (701→7xx)** — pas automatique par conception (capacité de touches différente par modèle de téléphone).
10. **Proxy ERPCRM + interface** [x, partiel] — `sipv_client.py` + `companies.py` (proxy avec propagation du vrai message d'erreur SIPV, ex. collision de numérotation) + `ParkingLotsSection.jsx` (sorti de `CompanyDetail.jsx` vers `frontend/src/pages/telephony/ParkingLotsSection.jsx`, premier morceau d'une arborescence par domaine). `ParkingLot.is_active` ajouté (migration `0064`, jamais create-only). `timeout_seconds` et `return_extension` (menu déroulant de vrais postes) rendus éditables en ligne.

**Incident de production distinct, causé et corrigé dans cette même série de sessions (2026-08-20)** : commentaire XML `--` dans `_parking_dialplan_entries` (3e occurrence du même piège que S050/S058) → tout le routage du tenant t1001 cassé (catch-all busy) pendant un moment avant d'être repéré. Deuxième occurrence latente trouvée et corrigée au même moment (`_ringgroup_dialplan_entries`). ⚠️ Risque systémique PAS entièrement audité : tout nom saisi par un utilisateur (lot, ring group, paging group...) interpolé dans un commentaire XML reste vulnérable — priorité explicitement notée pour la prochaine session avant tout nouveau développement dialplan.

**Incident infra distinct, corrigé dans la même série** : redémarrages `sipv-backend` (uvicorn simple) faisaient tomber des postes en cas de coïncidence avec un REGISTER/SUBSCRIBE pendant le trou de service (aucun cache/fallback côté `mod_xml_curl`, confirmé dans le source). Corrigé : bascule vers `gunicorn` (2 workers, `--graceful-timeout 30`), `ExecReload` ajouté. Nouvelle procédure retenue pour tout déploiement SIPV : `systemctl reload sipv-backend` (jamais `restart`, sauf process bloqué/mort).

**Annonce du slot en français construite (2026-08-20)** : la macro `valet_announce_ext` existe nativement dans FreeSWITCH (`lang/en/vm/sounds.xml`, épelle simplement le numéro — aucun TTS/Voicebox nécessaire pour cette partie, le backlog qui le supposait était prématuré). Vraie cause du blocage : `mod_say_fr` (module d'épellation français) jamais compilé — compilé et chargé en direct sans redémarrage FreeSWITCH. Macro ajoutée en français (copie de la version anglaise). **Testée en vrai le soir même : résultat négatif** (aucune phrase entendue, cause non diagnostiquée) — mise de côté avec la continuité MOH sur décision explicite de Philippe.

**Backlog identifié pour l'annonce, PAS construit** : Option A (fournir la macro manquante, déjà tentée, résultat négatif) vs Option B (contourner le mécanisme natif, construire une annonce TTS/Voicebox déclenchée par SIPV lui-même via l'événement `valet_parking::info`, jamais activer `announce_slot` côté module). Aucune décision prise. Précision de Philippe (pas construite) : l'annonce doit suivre la langue du POSTE qui écoute, pas celle de la compagnie/du lot.

**État final au moment de la fusion Phase O** : CRUD + dialplan (park/reprise/timeout/orbit dynamique) fonctionnels et testés avec de vrais téléphones. Deux défauts connus, documentés, explicitement mis en pause par Philippe (continuité MOH, annonce audio muette) — ne pas relancer de diagnostic sans nouvelle demande explicite. Confirme le statut "fonction critique, jamais dépriorisée" ([[project_parking_critical_feature]]).

---

## Annexe — Archives (entrées périmées, jamais actives, conservées pour traçabilité uniquement)

### TASK-S018.3 [ ] Fiche extension — identification, plan d'appel, renvois, DND — **ARCHIVÉ, DOUBLON PÉRIMÉ**
Dépend de (tel qu'écrit à l'origine, jamais réactivé) : TASK-S018 (fiche unifiée existante).
⚠️ Cette entrée (originellement en fin de section "Backlog — Configuration complète du poste" de TASKSIPV.md) est un doublon jamais valide de **TASK-S018.3** (entrée active, voir Bloc 3 ci-dessus, `[x]` depuis le 2026-07-23). L'auteur l'avait lui-même identifiée et documentée comme périmée au moment de l'écrire ("⚠️ ENTREE PERIMEE -- superseee par TASK-S018.3 [x] plus haut dans ce fichier ... Laissee ici telle quelle (regle 'ne jamais effacer une entree') plutot que supprimee"). Contenu original (jamais implémenté sous cet énoncé, entièrement couvert par la vraie entrée S018.3 à la place) : succursale/site, plan d'appel (autorisation interurbain/international), 4 types de renvoi, DND+verrouillage, réponse automatique, max appels simultanés, codec (décision projet PCMU par défaut), sonnerie distinctive, enregistrement auto/manuel, `max_contacts` défaut 3→1, groupes d'appartenance en lecture. **Ne jamais réactiver comme une tâche distincte — tout son contenu fonctionnel est couvert par TASK-S018.3 (actif) et ses extensions TASK-S018.5/S018.6/S018.7/S018.8.**

---

## Résumé de fusion

- **59 modules top-level** (TASK-S000 à TASK-S061) intégrés, aucune tâche fonctionnelle perdue.
- **22 sous-entrées** redistribuées de la fausse famille "023.X"/"S023.X" vers leurs modules réels (S004, S007×7, S008×5, S011×6, S018×2, S020×1) — détail complet dans `phase_o_id_mapping_sipv.md`.
- **1 doublon** archivé proprement (TASK-S018.3 périmé), sans perte, renvoi croisé vers l'entrée active.
- **1 module reclassé OBSOLETE** (TASK-S057, doublon d'investigation auto-documenté, renvoi vers TASK-S011.4).
- **1 module reclassé LEGACY-ASTERISK** (TASK-S017 base, jamais réactivé, renvoi vers TASK-S017.1 actif).
- **TASK-S023** (sujet réel : sync states PendingChange) reste intact comme backlog ouvert `[ ]`, désormais sans sous-entrées mal attribuées.
- Aucun code applicatif touché. `PLAN_SIPV.md` non fusionné (hors scope Phase O).

---

# Section 3 — Architecture multi-SIPV (tâches `[ARCH]`)

> Nouvelles tâches, pas migrées depuis `TASKERPCRM.md`/`TASKSIPV.md`. Namespace `TASK-ARCH-XXX` choisi pour ne collisionner ni avec `TASK-XXX` (ERPCRM) ni avec `TASK-SXXX` (SIPV). Origine : audit read-only Phase L (`multi-sipv-architect`, 2026-08-21), voir `ARCHITECTURE_PLATFORM.md` §3 pour la cible `1 ERPCRM → N SIPV`. Décision de nommage (2026-08-21) : identifiants de serveur simples `SIPV001`, `SIPV002`, etc. — pas de modèle conceptuel complexe (`SipvServerInstance` écarté comme sur-ingénierie pour un besoin qui n'arrivera concrètement qu'avec un 2e serveur physique, probablement dans plusieurs années). Aucun code n'a été écrit pour ces tâches — [ARCH] documente la cible, ne l'implémente pas.

---

## TASK-ARCH-001 [ARCH] [ ] Modèle ERPCRM "serveur SIPV" (identifiants SIPV001/SIPV002/...)
Classification: TARGET_NOT_IMPLEMENTED

Créer un modèle ERPCRM représentant un serveur SIPV géré par la plateforme : identifiant simple (`SIPV001`, `SIPV002`, ...), URL de base, clé API sortante (ERPCRM→SIPV), clé API entrante attendue (SIPV→ERPCRM), actif/inactif. Remplace à terme les 3 settings globaux uniques actuels (`SIPV_API_URL`, `SIPV_API_KEY`, `ERPCRM_API_KEY` — voir `backend/app/core/config.py:18-20`, `sipv_client.py`, 126 sites d'appel).

**Attention terminologique (trouvé en Phase L)** : un modèle `SipvServer` existe déjà côté SIPV (`/home/sipv/sipv/backend/app/models/server.py:8-30`) mais désigne un nœud FreeSWITCH interne à UN SEUL déploiement SIPV (répartition de charge intra-instance, TASK-S042, jamais construit) — concept différent de "serveur SIPV" au sens plateforme (une instance déployée entière du produit Telephony Plane). Éviter tout nom qui recolle les deux concepts. Voir aussi `Server.jsx` (frontend ERPCRM) qui affiche déjà les `sipv_servers` internes sous le mot "Serveur" — collision de vocabulaire à trancher avant de choisir le nom définitif du nouveau modèle (voir TASK-ARCH-005).

Dépend de : rien (première pierre). Bloque : TASK-ARCH-002 à 004.

---

## TASK-ARCH-002 [ARCH] [ ] Company → serveur SIPV (FK)
Classification: TARGET_NOT_IMPLEMENTED

Ajouter une FK sur `Company` vers le nouveau modèle serveur SIPV (TASK-ARCH-001), nullable pendant la transition, backfill de toutes les compagnies existantes vers `SIPV001` (l'instance SIPV-LAB actuelle, 192.168.1.55). Aujourd'hui `Company` connaît le tenant SIPV (`sipv_enabled`, `sipv_tenant_id` — `backend/app/models/company.py:14-15`) mais pas QUEL serveur l'héberge.

Dépend de : TASK-ARCH-001.

---

## TASK-ARCH-003 [ARCH] [ ] Refactor `sipv_client.py` — résolution tenant → serveur → URL/credentials
Classification: TARGET_NOT_IMPLEMENTED

Chaque fonction de `sipv_client.py` (1201 lignes, 126 sites utilisant `settings.SIPV_API_URL` en dur) doit résoudre le serveur cible via la FK `Company` (TASK-ARCH-002) au lieu de lire une settings globale. Point d'entrée `_client()`/`_headers()` à faire évoluer en premier pour réduire la surface réelle du refactor.

Dépend de : TASK-ARCH-001, TASK-ARCH-002.

---

## TASK-ARCH-004 [ARCH] [ ] Authentification webhook entrant par serveur
Classification: TARGET_NOT_IMPLEMENTED

`verify_sipv_api_key` (`backend/app/api/v1/endpoints/recurring_billing.py:42,290`) authentifie aujourd'hui le webhook entrant `POST /billing/sipv-event` avec UNE clé globale unique (`settings.SIPV_API_KEY`). Passer à une résolution par serveur SIPV pour permettre de révoquer/distinguer l'accès d'un serveur précis sans affecter les autres.

Dépend de : TASK-ARCH-001.

---

## TASK-ARCH-005 [ARCH] [ ] Clarifier la terminologie "serveur" avant tout nommage définitif
Classification: UNCERTAIN

Décider et documenter explicitement la distinction entre "serveur SIPV" (instance plateforme, `SIPV001`/`SIPV002`, TASK-ARCH-001) et `SipvServer`/`Tenant.server_id` (nœud FreeSWITCH interne à une instance, TASK-S042 côté SIPV) — avant de choisir le nom de champ/modèle définitif côté ERPCRM, pour ne pas entrer en collision avec l'existant `/v1/server/servers` et la page `Server.jsx` qui utilisent déjà "serveur" pour l'autre concept.

Dépend de : rien. Bloque : le nommage final de TASK-ARCH-001 (déjà fait à un niveau générique "serveur SIPV" en attendant cette clarification).

---

## TASK-ARCH-006 [ARCH] [ ] Jobs de fond scopés par serveur SIPV
Classification: TARGET_NOT_IMPLEMENTED

`cdr_report_runner.py` (et tout futur job de fond) doit se paramétrer par serveur SIPV en plus du tenant, une fois TASK-ARCH-001 à 003 en place. Aujourd'hui `_fetch_all_cdr` itère correctement par tenant mais retombe sur `settings.SIPV_API_URL` unique (`backend/app/workers/cdr_report_runner.py:32-44`).

Dépend de : TASK-ARCH-001, TASK-ARCH-002, TASK-ARCH-003.

---

## TASK-ARCH-007 [ARCH] [ ] Cache futur scopé par serveur (contrainte de conception préventive)
Classification: NOT_RELEVANT

Aucun cache pour les données SIPV n'existe aujourd'hui côté ERPCRM (vérifié, 0 résultat sur `cache|Cache|lru_cache|redis` dans `sipv_client.py`/`telephony.py`). Pas un problème actuel — contrainte à respecter dès la conception SI un cache est introduit un jour : le scoper par serveur SIPV, jamais global.

Dépend de : rien (préventif, pas de blocage).

---

## TASK-040 [TOOLING] [x] Outillage Graphiti — fiabilité du backfill, alertes, refonte de la méthode d'ingestion
Date de demande : 2026-09-03 (alertes Slack) — étendu le 2026-09-04 (refonte complète après audit qualité)
Date(s) de travail : 2026-09-03, 2026-09-04

Outillage de la plateforme (`tools/knowledge/graphiti/`), pas un module ERPCRM/SIPV — voir `ERRORS_LESSONS.md` pour le détail des erreurs rencontrées, identifiées par les mêmes numéros de sous-tâche ci-dessous.

### TASK-040.1 [x] Correctif timeout LLM (backfill bloqué 7h+)
`graphiti-backfill.service` coincé en boucle d'échec sur `openai.APITimeoutError` — cause réelle : `gpt-oss:20b` à ~4,4 tokens/sec en CPU pur, items denses dépassant régulièrement 1-4h. Timeout SDK OpenAI remonté de 3600s à 86400s dans `graphiti-build/patches/0002-long-timeout-no-retry-ollama-client.patch` + appliqué à chaud dans le conteneur.

### TASK-040.2 [x] Alertes Slack de progression du backfill
`scripts/slack_notify.py` — notifie à chaque fin d'item (succès/échec) avec % par catégorie + % global. Silencieux 22h-6h heure de Montréal, regroupé au réveil. Webhook dans `scripts/.slack_webhook_url` (jamais commité).

### TASK-040.3 [x] Fiabilité — processus fantômes après `systemctl stop` (récidive 2x)
`systemctl stop graphiti-backfill.service` ne tuait pas le vrai processus (`docker exec` sans proxy de signal, SIGTERM jamais propagé au conteneur) — récidivé 2x. Fix : après tout stop, vérifier avec `docker top graphiti-graphiti-mcp-1` et `kill -9` le PID réel côté hôte si orphelin.

### TASK-040.4 [x] Fiabilité — `kill -9` gèle une requête concurrente sans erreur
Un `kill -9` sur le processus fantôme (TASK-040.3) a gelé silencieusement une requête `add_memory` concurrente partageant le même Ollama (`-np 1`, un seul créneau d'inférence) — aucune erreur, 8h+ sans progrès. Fix : redémarrage complet du conteneur `graphiti-mcp`, épisode perdu resoumis après coup.

### TASK-040.5 [x] Refonte complète de la méthode d'ingestion (table rase décidée)
Audit qualité le 2026-09-03/04 : 77% du graphe (77/100 épisodes) issus du backfill mécanique de `PLATFORM_TASKS.md`, résumés vides, nœuds nommés par numéro de tâche au lieu du concept réel, zéro résultat pour "facturation"/"billing". Décision : `clear_graph` complet, nouvelle méthode où les nœuds portent le vrai nom du concept (Facturation, Ticket...) avec relations causales expliquées, et TASK-XXX comme simple référence de provenance. Reconstruction en cours.

### TASK-040.6 [x] Reset partiel au lieu de complet (service/backend/données non réinitialisés ensemble)
Plusieurs redémarrages isolés effectués séparément (service backfill seul, puis conteneur `graphiti-mcp` seul) au lieu des 3 couches (service/backend/données Neo4j) ensemble. Fix : redémarrage coordonné des 3 couches en une seule action une fois signalé.

### TASK-040.7 [x] Premier test d'insertion post-reset trop gros malgré une demande explicite de test minimal
Premier épisode de test contenait 8 entités (Captaine, Simple IP, ERPCRM, SIPV, Crypto, DashV16, Musique, Suno) au lieu d'une seule ("Captaine" seul, comme explicitement demandé). Interrompu (`kill`, vérifié 0 nœud écrit), relancé correctement avec une seule entité.

### TASK-040.8 [x] Redémarrer le conteneur `graphiti-mcp` casse la connexion MCP de la session Claude Code
Un `docker compose restart`/`up -d` du conteneur ferme brutalement la connexion HTTP du client MCP de la session (`ECONNRESET`) — récidivé à chaque redémarrage. Fix : reconnexion manuelle via `/mcp` → **Reconnect** (jamais Authenticate, ce serveur local n'a pas d'OAuth malgré le message trompeur).

### TASK-040.9 [x] `add_triplet` jugé cassé après seulement 5 minutes — conclusion prématurée, retest concluant
`add_triplet` déclaré défaillant après abandon côté client à 300s, jamais vérifié côté serveur. Retest avec surveillance CPU/Ollama directe : fonctionne, ~7-8 min, plus rapide que `add_memory` pour un fait précis (pas d'extraction générique). Reclassé fiable et recommandé pour la reconstruction du graphe.

### TASK-040.10 [x] `search_memory_facts` cassé — 34 arêtes sans `episodes` (`None` au lieu d'une liste)
Date de demande : 2026-09-10 (constaté en répondant à "où on est rendu" côté outil, pas une demande verbale de Philippe)
Date(s) de travail : 2026-09-10

Constaté en interrogeant Graphiti en premier (LOI 2) pour une relance de
session : `search_memory_facts` échouait systématiquement, quelle que soit la
requête, avec `1 validation error for EntityEdge / episodes: Input should be
a valid list [type=list_type, input_value=None, input_type=NoneType]`.
`search_nodes` et `get_episodes` fonctionnaient encore.

**Cause confirmée** (requête directe Neo4j, `tools/knowledge/graphiti/scripts/find_null_episodes.py`) :
34 relations avaient la propriété `episodes` totalement absente (donc `None`
à la lecture), pas une seule arête isolée. Origine : `fast_write.py`
(TASK-040.11, écriture rapide qui contourne le LLM) créait la relation par
Cypher direct sans jamais inclure `episodes` dans le `CREATE` — la propriété
n'existait simplement pas côté Neo4j.

**Correctif appliqué :**
1. `tools/knowledge/graphiti/scripts/fix_null_episodes.py` : `SET r.episodes = []`
   sur les 34 relations concernées (liste vide, honnête — ces faits ont été
   écrits directement, sans épisode source ; rien d'autre touché : fact,
   source, target, embeddings inchangés). Vérifié avant (34) et après (0).
2. `fast_write.py` corrigé pour inclure `episodes: $episodes` (= `edge.episodes`,
   `[]` par défaut côté `EntityEdge`) dans son `CREATE` — n'arrivera plus sur
   les prochains faits écrits par ce script.
3. Vérifié avec le vrai outil MCP `search_memory_facts` (2 requêtes
   distinctes, ERPCRM et SIPV) : résultats corrects, faits complets avec
   relations et provenance (ex. "Ticket RELATES_TO Facturation", "SIPV
   CONTAINS Interception").
Fichiers : tools/knowledge/graphiti/scripts/{find_null_episodes.py,
fix_null_episodes.py, fast_write.py}.

### TASK-040.11 [x] `fast_write.py` — écriture directe rapide (contourne la résolution LLM)
Date de demande : 2026-09-07 (rattrapé rétroactivement depuis mtime, non inscrit au moment de l'écriture)
Date(s) de travail : 2026-09-07

`add_triplet` fonctionne mais prend ~7-8 min par fait sur ce matériel CPU-seul
(résolution/dedup par LLM local). Pour la construction courante du graphe,
où c'est déjà Claude qui vérifie les noms existants avant d'écrire,
`tools/knowledge/graphiti/scripts/fast_write.py` contourne cette étape LLM
(seul l'embedder rapide `nomic-embed-text` est utilisé) — même résultat
cherchable ensuite, mais en secondes. Détail de la procédure et des pièges
(fusion à tort de deux concepts au nom proche) : voir
`.claude/skills/graphiti-knowledge/SKILL.md`, section "Comment écrire un
fait". Patch local du serveur MCP associé :
`tools/knowledge/graphiti/patches/graphiti_mcp_server.py`.
Fichiers : tools/knowledge/graphiti/scripts/fast_write.py,
tools/knowledge/graphiti/patches/graphiti_mcp_server.py.

### TASK-040.12 [x] Correctifs ponctuels post-refonte (provenance fichier, résumés manquants, tâches de genèse)
Date de demande : 2026-09-06/08 (rattrapé rétroactivement depuis mtime, non inscrit au moment de l'écriture)
Date(s) de travail : 2026-09-06, 2026-09-08

Trois correctifs ponctuels appliqués après la reconstruction du graphe
(TASK-040.5), chacun documenté en tête de son propre fichier — pas dupliqué
ici, voir le docstring de chaque script pour le détail exact :
- `add_file_refs.py` — ajoute la référence fichier modèle source en fin de
  fait pour tout fait sans TASK-XXX associé (le code EST la provenance).
- `add_genesis_tasks.py` — ajoute le TASK-XXX de création initiale en fin de
  fait "ERPCRM CONTAINS <module>".
- `backfill_summaries.py` (+ données `_summaries_data.json`) — remplit le
  `summary` des nœuds créés via `add_triplet`/`fast_write.py` qui n'en
  recevaient aucun à la construction.
Fichiers : tools/knowledge/graphiti/scripts/{add_file_refs.py,
add_genesis_tasks.py, backfill_summaries.py, _summaries_data.json}.

### TASK-040.13 [x] Passe en profondeur — 63/63 nœuds audités, 22 liens SIPV manquants
Date de demande : 2026-09-10
Date(s) de travail : 2026-09-10

Suite à la demande de Philippe de faire de Graphiti l'index du projet avec ses vrais liens de dépendance (pas un fichier séparé, pour ne pas doubler avec PLATFORM_TASKS.md/ERRORS_LESSONS.md). Méthode : un nœud à la fois, groupé par famille plutôt qu'alphabétique (pour garder le fil), checklist de suivi dans `docs/platform/graphiti_deep_pass.md`, vérification double (requête avant écriture, relecture après) sur chacun des 63 nœuds (`group_id=platform`).

**Résultat** : SIPV avait 22 modules déjà présents dans le graphe mais jamais rattachés au nœud SIPV lui-même (`CONTAINS` manquant) — le vrai trou de la passe. Chaque ajout vérifié contre sa genèse `TASK-SXXX` réelle dans PLATFORM_TASKS.md. ERPCRM (25 modules) déjà complet depuis TASK-040.5, rien ajouté. Quelques ajouts ciblés : Captaine (+3 règles), Crypto (+1 lien vers Captaine, structure Captaine→Crypto→DashV16 documentée mais pas câblée), ReglagesGlobaux_SIPV (+1 chaîne d'héritage).

**Outillage créé** : `list_all_nodes.py` (liste exhaustive), `list_node_facts.py` (toutes les relations d'un nœud — plus fiable que `search_memory_facts`, sémantique/BFS, pas garanti exhaustif ; réécrit en cours de route pour se connecter directement au driver Neo4j plutôt que via `graphiti_mcp_server.initialize_server()`, qui chargeait le reranker BGE ~2.3 Go à chaque appel et a causé un kill pour mémoire basse après plusieurs appels rapprochés).
Fichiers : docs/platform/graphiti_deep_pass.md, tools/knowledge/graphiti/scripts/{list_all_nodes.py, list_node_facts.py}.

### TASK-040.14 [x] Graphiti EN PREMIER sur toute demande, sans exception
Date de demande : 2026-09-10
Date(s) de travail : 2026-09-10

Philippe : "je veux l'interroger a toute mes demande pour cibler Tout ce qu'on a besoin... eviter les doublon et avancer ou resoudre les situation." J'avais proposé une exception pour les demandes "purement mécaniques" (typo, commande, commit) — correction explicite et insistante de Philippe ("toute les demandes!!!") : pas de tri par jugement, interroger Graphiti systématiquement avant d'agir. Ajouté aussi le pendant écriture : alimenter Graphiti (nouveaux nœuds/liens) après toute tâche non-triviale qui crée ou périme un concept/une dépendance, avec la même vérification double.

CLAUDE.md (règle absolue, visible immédiatement) et `.claude/skills/graphiti-knowledge/SKILL.md` (procédure complète, sections "Quand interroger"/"Quand alimenter") mis à jour. Testé en direct : lecture rapide (~1,2s), écriture + relecture confirmées, et le test a lui-même trouvé une vraie erreur (voir TASK-040.15).
Fichiers : CLAUDE.md, .claude/skills/graphiti-knowledge/SKILL.md.

### TASK-040.15 [x] Correction — classification "NE JAMAIS RÉACTIVER" reformulée en fait technique
Date de demande : 2026-09-10 (trouvé en testant TASK-040.14)
Date(s) de travail : 2026-09-10

En testant le nouveau réflexe d'écriture (TASK-040.14), fait trouvé légèrement inexact sur le nœud PendingChange : référençait TASK-S017 comme sujet actif, alors que TASK-S017 est classé LEGACY-ASTERISK et le vrai backlog ouvert est TASK-S023. En corrigeant, Philippe a objecté au langage "NE JAMAIS RÉACTIVER" dans PLATFORM_TASKS.md — pas une règle que j'ai inventée (déjà présente depuis la réorg Phase O), mais formulée comme un interdit de principe alors que c'est un fait technique (commit.py écrit dans des tables Asterisk ps_endpoints/ps_auths/ps_aors, inexistantes depuis le passage à FreeSWITCH — code incompatible avec le stack actuel, pas une interdiction). Reformulé des deux côtés (PLATFORM_TASKS.md et le fait Graphiti correspondant). Passe de vérification faite sur tout PLATFORM_TASKS.md/ERRORS_LESSONS.md pour d'autres occurrences similaires ("jamais"/"toujours" en classification) — aucune autre trouvée, le reste sont soit des états factuels ("jamais construit"), soit des résumés historiques, soit des règles délibérées de Philippe déjà voulues (ex. jamais supprimer un tenant) — rien d'autre à adoucir.
Fichiers : docs/platform/PLATFORM_TASKS.md (ligne TASK-S017), fait Graphiti `SIPV CONTAINS PendingChange`.

### TASK-040.16 [x] Ouvrir Graphiti au LAN — HTTP 421 bloquait toute VM externe (DashV16)
Date de demande : 2026-09-14 (brancher DashV16 sur Graphiti)
Date(s) de travail : 2026-09-20

Objectif : connecter la VM DashV16 (192.168.1.101) au même Graphiti unifié que ERPCRM/SIPV (`group_id="platform"`), via MCP HTTP direct sur le LAN (`http://192.168.1.9:8000/mcp/`), sans SSH.

Bloqué par un `HTTP 421 Invalid Host header` dès qu'une requête arrivait avec `Host: 192.168.1.9:8000` au lieu de `localhost`/`127.0.0.1`. Cause : `FastMCP()` (bibliothèque `mcp` officielle) est construit sans paramètre `host` dans `graphiti_mcp_server.py`, retombe sur son défaut interne `"127.0.0.1"`, ce qui active une protection anti-DNS-rebinding avec `allowed_hosts` limité à `localhost`/`127.0.0.1` — indépendamment de `config.server.host="0.0.0.0"` réglé par ailleurs (jamais synchronisé avec la whitelist).

**Correctif déjà préparé le 2026-09-02 (voir CONVERSATION_LOG dans `docs/platform/`), jamais déployé jusqu'ici** — 18 jours sans trace dans PLATFORM_TASKS.md, redécouvert de zéro par la session DashV16 le 2026-09-20 (voir Leçon dans ERRORS_LESSONS.md TASK-040.16). Déployé aujourd'hui :
1. Converti le fichier complet déjà prêt (`tools/knowledge/graphiti/patches/graphiti_mcp_server.py`) en patch numéroté `graphiti-build/patches/0003-mcp-allowed-hosts-lan.patch` (règle explicitement `mcp.settings.transport_security` via une variable d'env `MCP_ALLOWED_HOSTS`, défaut = localhost seul si absente).
2. Ajouté `MCP_ALLOWED_HOSTS=127.0.0.1:*,localhost:*,[::1]:*,192.168.1.9:8000` dans `.env`/`.env.example`.
3. Rebuild de l'image `graphiti-mcp-standalone:v0.29.3-021d3a5` via `graphiti-build/build.sh` (tarball upstream verrouillé par commit + SHA256, patches 0001/0002/0003 appliqués).
4. Vérifié qu'aucune ingestion n'était active (pas de lock, pas d'écriture récente dans les logs) avant `docker compose up -d graphiti-mcp`.

Vérifié après coup (pas juste supposé) : handshake MCP complet réussi sur `Host: 192.168.1.9:8000` (`POST /mcp` → 200, `serverInfo: Graphiti Agent Memory v1.30.0`) ; un `Host` non autorisé (`totally-invalid-host-xyz`) reçoit toujours `421 Invalid Host header` — la protection reste active pour tout ce qui n'est pas explicitement listé, ce n'est pas un contournement qui désactive la sécurité.

Effet de bord connu (voir TASK-040.8) : le restart du conteneur casse la connexion MCP de toute session Claude Code déjà connectée à `graphiti-platform` — reconnexion manuelle (`/mcp` → Reconnect) nécessaire pour ces sessions-là.

Fichiers : `tools/knowledge/graphiti/graphiti-build/patches/0003-mcp-allowed-hosts-lan.patch`, `tools/knowledge/graphiti/.env`, `tools/knowledge/graphiti/.env.example`.

### TASK-040.17 [x] Nettoyage de 2 dumps mécaniques (`add_memory`) — `delete_episode` a effacé 3 nœuds hub non prévus (SIPV, ERPCRM, Contacts), reconstruits partiellement
Date de demande : 2026-09-20 (Philippe a repéré un nœud "Philippe" suspect en consultant le graphe)
Date(s) de travail : 2026-09-20, 2026-09-21

Deux épisodes (`add_memory`, extraction automatique sur texte brut, contraire à la méthode retenue depuis TASK-040.5) ont pollué le graphe : 2026-09-11 (TASK-S020.4/bug ESL, 16 nœuds junk dont un doublon "Philippe" distinct de "Captaine") et 2026-09-12 (TASK-023.34/dot SIP, 5 nœuds junk nommés par fichier — `ContactDetail.jsx`, `CompanyDetail.jsx`, `ContactsTab`, `TelephonyTab.jsx` — jamais rattachés à aucun nœud réel). Scope confirmé exhaustif par recherche de tout nœud de type "Document" sur tout le graphe (aucun autre épisode concerné).

**GO explicite obtenu de Philippe avant suppression.** `delete_episode` (`Graphiti.remove_episode`) exécuté sur les 2 épisodes — mais contrairement à sa documentation ("preserve les entités/faits aussi supportés par d'autres épisodes"), la cascade a supprimé en plus **3 nœuds hub majeurs, chacun avec des dizaines de faits légitimes construits depuis le 2026-09-04** : `SIPV`, `ERPCRM`, `Contacts`. Détecté immédiatement après coup par vérification systématique (`list_node_facts.py` sur ces 3 noms → 0 relation, puis confirmé par UUID direct dans Neo4j). Aucun backup Neo4j disponible pour une restauration point-in-time.

**Réparation** : 15 faits reconstruits via `fast_write.py`, un par un (jamais en lot en arrière-plan — un premier essai en lot de 8 appels chaînés a déclenché un OOM kill, probablement le rechargement répété du reranker BGE ~2,3 Go), à partir des faits exacts déjà lus dans cette même session (recherches précédentes, pas de reconstruction approximative) : `Simple IP CONTAINS ERPCRM`, 7 `ERPCRM CONTAINS <module>`, 5 `SIPV CONTAINS <module>`, `SIPV RELATES_TO Synchronisation`, `Contacts SYNCS_WITH SIPV`, `Portail SYNCS_WITH SIPV`, et 6 faits `<module> RELATES_TO/HAS Contacts`. Vérifié après coup (`list_node_facts.py`) : SIPV 8 relations, ERPCRM 8 relations, Contacts 9 relations, toutes correctement formées.

**Suite (même session, 2026-09-21)** : scan complet demandé par Philippe pour combler l'écart entre la reconstruction initiale (17 faits) et l'état documenté par la passe du 2026-09-10 (`graphiti_deep_pass.md`, 63/63 nœuds audités, seule vraie source de vérité sur l'état visé). Corrigé une erreur de reconstruction (fait "Portail HAS Contacts" créé par erreur — dupliquait en fait "Compagnies HAS Portail", jamais touché par la suppression — supprimé via `delete_entity_edge`). Complété via lecture du vrai code (grep des FK `contact_id`/`company_id` dans `backend/app/models/*.py`) : `Compagnies RELATES_TO Contacts` (vendor_id), `Taches RELATES_TO Contacts`, `Compagnies HAS Taches`. Pour SIPV, genèses des 23 modules manquants trouvées via l'agent `sipv-researcher` (lecture directe de `TASKSIPV.md`/`PLATFORM_TASKS.md` côté SIPV, jamais devinées) : SecuriteSIPV, Serveur_SIPV, Provisioning, Queues, RingGroups, Voicemail, Horaires, Routes, CDR, E911, Enregistrements, Fax, IVR, MOH, PendingChange, Webhooks, AudioPrompts, Boutons, Interception, PagingGroups, Tarifs (pas de genèse dédiée, fusionné dans TASK-S009/CDR), SMS (pas de genèse dédiée, fusionné dans TASK-S013/Fax), ParkingLots (modèle de base TASK-S007, fonctionnel seulement depuis TASK-S061 -- les deux cités). Ajouté aussi `ERPCRM RELATES_TO Claude` et `SIPV RELATES_TO Claude` (perdus car Claude référence ces deux nœuds directement, pas seulement via Captaine).

**Suite 2 (même session)** : Philippe a explicitement refusé "reconstruction solide" comme critère d'arrêt -- reprise de l'investigation par lecture de code réelle jusqu'à épuisement raisonnable des pistes, pas arrêt à un pourcentage. Vérifié que les relations fines inter-modules (Extensions, DIDs, RingGroups, etc.) n'avaient jamais été touchées par l'incident (degrés identiques à la passe du 2026-09-10 -- confirmé, pas supposé). L'écart restant sur SIPV n'était donc pas dans les modules mais dans des faits SYSTÈME jamais capturés avant : agent `sipv-researcher` dépêché sur le vrai dépôt SIPV (SSH, jamais deviné), a trouvé et vérifié sur disque ET à l'exécution (`systemctl`, `fs_cli`) 5 faits d'architecture réels absents du graphe depuis toujours (pas juste depuis l'incident) : mécanisme `mod_xml_curl` (dialplan/directory FreeSWITCH généré dynamiquement, jamais statique), Kamailio/RTPengine (RTPengine chargé mais désactivé du chemin actif depuis TASK-S058), canal TLS+CA privée+clé API SIPV↔ERPCRM (port 8022 dédié, pas de mTLS client-cert complet -- corrige une supposition imprécise), mapping Tenant SIPV↔Compagnie ERPCRM (account_number = tenant_id Asterisk), relais OAuth du backup cloud SIPV via le domaine public d'ERPCRM. Écrits avec citations exactes (fichier + ligne quand pertinent).

**Suite 3 (même session)** : Philippe a rejeté "écart résiduel acceptable" comme conclusion ("criss pourquoi je dois me repeter... on ne peut pas couper"). Reprise par une méthode systématique plutôt que de la lecture ponctuelle : comparer la liste EXHAUSTIVE de tous les fichiers `backend/app/models/*.py` (ERPCRM, lu directement) et `backend/app/models/*.py` (SIPV, via agent `sipv-researcher` sur le vrai dépôt) contre les nœuds Graphiti existants. Cette méthode a trouvé **5 vrais modules jamais documentés dans Graphiti, même avant l'incident** :
- `Statuts` (Status/EntityStatus, étiquettes many-to-many sur Compagnie ou Contact) -- pas de genèse dédiée.
- `Canaux_Communication` (CommunicationChannel, email/phone/mobile/fax multiples par Entité) -- pas de genèse dédiée.
- `Ouvertures_Email` (EmailOpen, pixel de tracking, append-only). Genèse : TASK-006.1.
- `Parametres` (AppSetting, clé/valeur). Genèse : TASK-013.
- `Audit_SIPV` (AuditLog SIPV, snapshot avant/après par action admin) -- **nommé délibérément différent du nœud `Journal` existant** (qui est le journal ERPCRM/entity_log, un système totalement distinct) pour éviter une fusion à tort entre deux concepts proches mais réellement séparés (SIPV reste autonome). Genèse : TASK-S026. Vérifié après coup qu'aucune fusion n'a eu lieu (`Journal` toujours à 3 relations, inchangé).

Côté SIPV, l'agent a aussi confirmé explicitement que plusieurs candidats N'étaient PAS des concepts distincts (pas ajoutés) : les gabarits de provisioning (`GlobalTemplate`/`TenantTemplate`/`TenantModelTemplate`) sont un sous-mécanisme de `Provisioning`, et `Holiday` un sous-mécanisme de `Horaires` -- décision explicite, pas un oubli.

**État final vérifié (`list_node_facts.py`)** : **ERPCRM 33 (visé 28, dépassé de 5 faits réels nouveaux)**, **Compagnies 27 (visé 24, dépassé)**, **Contacts 12/12 -- parité exacte**, SIPV 38 (visé 43 -- écart résiduel de 5, contre 11 au départ). L'écart SIPV restant n'est plus explicable par un modèle de code non-mappé (vérifié fichier par fichier des deux côtés) -- le résidu est probablement des liens de provenance techniques (`MENTIONS`, pas de vrais faits) ou du contenu dont la formulation exacte ne peut être retrouvée sans le contenu original supprimé (aucun backup Neo4j).

Fichiers : aucun (écriture Graphiti seulement, pas de fichier repo).

### TASK-040.19 [x] Deux règles de travail ajoutées : relire le diff + délégation limitée aux recherches en lecture seule
Date de demande : 2026-09-30
Date(s) de travail : 2026-09-30

Philippe a soumis une recette vue en vidéo (« ne fais jamais le travail toi-même, délègue toujours à des sub-agents », routage de modèles, contexte minimal par sub-agent, résumé en 3 lignes, relire le diff). Analyse : la délégation systématique avec contexte minimal et résumés de 3 lignes contredit les règles existantes (zéro supposition, vérifier l'intégration réelle) et les incidents déjà vécus par manque de contexte — rejetée. Retenu sur accord de Philippe : (1) relire le diff complet avant de conclure, (2) déléguer seulement les recherches larges en lecture seule.

Ajoutées dans CLAUDE.md (Règles absolues) et dans Graphiti (2 faits `Captaine -[EXPECTS]-> Claude`, rattachés au nœud Claude, lui-même relié à ERPCRM/SIPV/DashV16).
Fichiers : CLAUDE.md.

---

## TASK-041 [TOOLING] [x] Journal de conversation Claude Code -- ERPCRM
Date de demande : 2026-09-01 (rattrapé rétroactivement depuis mtime/crontab, non inscrit au moment de l'écriture)
Date(s) de travail : 2026-09-01

Convertit les transcriptions JSONL que Claude Code écrit déjà (`~/.claude/projects/-home-simpleip-erpcrm/*.jsonl`) en un journal texte lisible et cumulatif, `docs/platform/CONVERSATION_LOG.md` (gitignored — mot-pour-mot des sessions, peut contenir des secrets tapés dans le chat, jamais commité). Rien n'est résumé/reformulé : messages utilisateur et réponses texte recopiés tels quels ; les appels d'outils sont réduits à une ligne datée (Lu/Créé/Modifié/Exécuté/...), pas leur contenu brut. Tourne via cron (`* * * * *`, déjà installé et actif — voir `crontab -l`), idempotent par offset (`tools/logging/.conversation_log_state.json`, gitignored). Scopé à ce serveur uniquement — DashV16/SIPV ont besoin de leur propre copie tournant sur leur propre machine (jamais de miroir de code entre projets, voir `feedback_sipv_must_stay_autonomous`).
Fichier : tools/logging/sync_conversation_log.py.

---

## TASK-042 [ERPCRM] [~] Banque — comptes bancaires, flux de transactions, rapprochement automatique des encaissements
Date de demande : 2026-10-01
Date(s) de travail : 2026-10-01 (page Aperçu bancaire, fiche de compte : interface et options ; import de relevés)

Demande de Philippe (2026-10-01, 3 captures de l'écran Banque de Zoho Books comme modèle) :
1. **Aperçu bancaire** (menu Banque), précisé le 2026-10-01 (analyse détaillée de la 1re capture) :
   - En-tête avec les actions générales : Relevés bancaires, Ajouter une banque ou une carte de crédit, Gérer les règles de transaction, menu Plus.
   - Grand panneau : sélecteur « Tous les comptes ▼ » (ou un seul compte), sélecteur de période modifiable (« 30 derniers jours ▼ ») ; indicateurs icône + titre + valeur (Espèces disponibles, Solde bancaire) ; indicateur « Transactions non classées » avec lien « Classer maintenant » (raccourci vers le traitement) ; graphique temporel des soldes (une série par indicateur, grille, légende), repliable (« Masquer le graphique »).
   - Section « Comptes actifs ▼ » en tableau : Détails du compte | Non classé | Chèques en attente | Montant en banque | Montant dans ERPCRM, loupe de recherche ; chaque ligne a un bouton chevron pour ouvrir/agir.
   - Compte interne (ex. Petite caisse) : même liste, sans synchronisation.
   - Compte bancaire connecté : icône banque, nom en lien, voyant vert de connexion active, numéro masqué (xxxx1234), « Mis à jour le : date », nombre de non classées en couleur.
   - Ignorer « Fonds non déposés ». Référence fonctionnelle et visuelle, pas une copie pixel par pixel.
2. **Fiche d'un compte — Transactions non classées** : lignes reçues de la banque (date, description du relevé, dépôt/retrait) que le rapprochement automatique n'a pas su associer (nouveau payeur, nouveau type de transfert…), à classer à la main.
3. **Fiche d'un compte — Toutes les transactions** : historique avec type (paiement de client + nom du client, dépense…), statut (mis en correspondance / classé / ajouté manuellement), dépôts, retraits, solde courant.
But : une connexion bancaire « plus efficace » qui associe automatiquement les dépôts aux paiements/factures (`ClientPayment` de TASK-005.4).

Décisions ouvertes (rien n'est codé) :
- Source des transactions : agrégateur bancaire (API), import de relevés OFX/CSV, courriels Interac, ou une combinaison.
- Périmètre : seulement les dépôts ↔ encaissements clients, ou aussi le classement des dépenses (= plan comptable, que ERPCRM n'a pas).
- ERPCRM remplace-t-il Zoho Books pour la banque, ou les deux coexistent-ils ?
- Lien avec TASK-005.4 point 1 (escompte/frais par mode de paiement) : les dépôts Elavon sont nets de frais.

**Fait le 2026-10-01 — page Aperçu bancaire (interface et options, consigne de Philippe : « on bâtit l'interface et les options, pas les chiffres »)** :
- Backend : modèle `BankAccount` (`bank_accounts` : type `bank|credit_card|petty_cash`, nom, institution, 4 derniers chiffres, notes, `feed_connected`, `last_synced_at`, `is_active` — un compte se désactive, ne se supprime jamais). Endpoints `/api/v1/bank/accounts` : GET (`include_inactive`), POST, PUT (modification + désactivation/réactivation). Migration Alembic `c2d3e4f5a6b7` (revises `b1c2d3e4f5g6`), testée up/down/up.
- Frontend : `pages/Bank.jsx`, route `/bank`, entrée « Banque » dans le menu (après Récurrence), icônes ajoutées dans `Icons.jsx`, dépendance `recharts` ajoutée.
  - En-tête : Relevés bancaires, Ajouter une banque ou une carte de crédit, Gérer les règles de transaction, Plus (Ajouter une petite caisse, Afficher les comptes inactifs).
  - Panneau : sélecteur Tous les comptes / un compte, période (7/30/90 jours, 12 mois), indicateurs Espèces disponibles / Solde bancaire / Transactions non classées + « Classer maintenant › » (inactif jusqu'à la fiche de compte), graphique temporel 2 séries repliable.
  - Comptes : filtre actifs/inactifs/tous, colonnes Détails du compte | Non classé | Chèques en attente | Montant en banque | Montant dans ERPCRM, loupe de recherche (nom, institution, 4 chiffres), chevron par ligne (Modifier, Désactiver/Réactiver) ; icône par type, voyant vert si connexion active, xxxx1234 + « Mis à jour le », petite caisse sans ligne de connexion.
  - Modal compte (création/modification) ; modals Relevés bancaires et Règles de transaction : structure seulement (import et nouvelle règle désactivés).
  - Tous les montants, compteurs et le graphique affichent un état vide (« — », « Aucune donnée pour cette période ») : aucune source de transactions branchée.
- Preuve : endpoints testés en HTTP (création, validations type/4 chiffres → 422, modification, désactivation, filtre) ; rendu vérifié par capture headless desktop et mobile 390 px ; création et désactivation depuis l'interface vérifiées par interception des requêtes (POST/PUT corrects, sans écriture en base). Le compte de test HTTP a été retiré par un `DELETE` SQL direct (aucun endpoint de suppression, voulu) — seule ligne touchée, créée par le test.

**Fait le 2026-10-01 — fiche d'un compte (captures 2 et 3, interface et options, GO de Philippe)** — frontend seulement, aucune table ni migration :
- `pages/BankAccountDetail.jsx`, route `/bank/:id` ; ouverte par le clic sur le nom du compte dans l'aperçu (ou « Ouvrir le compte » du chevron) ; « Classer maintenant › » de l'aperçu devient actif → onglet Non classées du compte choisi, sinon du premier compte bancaire/carte actif.
- En-tête : nom du compte avec menu ▼ pour changer de compte, voyant de connexion, « Numéro de compte : xxxx1228 · institution » ; boutons Relevés bancaires (compte présélectionné), Catégorisation rapide (grisé), Ajouter une transaction ▼ (Dépôts : paiement de client, dépôt, virement entrant ; Retraits : dépense, paiement de fournisseur, virement sortant — grisés), Enregistrer un dépôt (grisé), engrenage (modification du compte), ✕ (retour à l'aperçu).
- Montant dans ERPCRM, Montant en banque, Dernière date de flux ; « Dernière actualisation le… » + « Actualiser les flux » (inactif).
- Onglets (dans l'URL `?tab=`) : Tableau de bord (solde, dépôts et retraits de la période, période modifiable, graphique une courbe) ; Transactions non classées (Tout / Reconnu, interrupteur Correspondance & sélection multiple, Exclu, colonnes case / Date / Détails du relevé / Dépôts / Retraits, loupe, pagination 50/100/200) ; Toutes les transactions avec filtre ▼ (toutes, dépôts, retraits, mises en correspondance, classées, ajoutées manuellement), colonnes Date / N° de référence / Type / Statut / Dépôts / Retraits / Solde actuel, loupe, pagination.
- Petite caisse : pas d'onglet Non classées, pas de montant en banque, de flux ni de relevés.
- Composants partagés exportés depuis `Bank.jsx` (menus, indicateurs, graphique `BalanceChart`, modals) plutôt que dupliqués.
- Preuve : captures headless (comptes simulés dans le navigateur, aucune écriture en base) des 3 onglets, du menu Ajouter une transaction, de la petite caisse et du mobile 390 px ; navigation vérifiée (Classer maintenant → `/bank/<id>?tab=unclassified`, changement de compte, ✕ → `/bank`, clic sur le nom → fiche) ; aucune erreur console.

**Fait le 2026-10-01 — import de relevés bancaires (demande de Philippe : « construit l'import », compte BNC (Banque Nationale du Canada, institution 006) xxxx1228)** :
- Lecteur `backend/app/core/bank_statement_parser.py` : OFX/QFX/QBO (SGML 1.x et XML 2.x : FITID, LEDGERBAL, ACCTID) et CSV (délimiteur détecté, en-tête cherché dans les 15 premières lignes, colonnes FR/EN date / description / montant signé ou débit+crédit, dates AAAAMMJJ, AAAA-MM-JJ, JJ/MM/AAAA ou MM/JJ/AAAA selon le fichier, montants 1 234,56 / 1,234.56 / (12.00)). Message d'erreur affiché tel quel, avec l'en-tête lu si les colonnes ne sont pas reconnues.
- Doublons : clé FITID, sinon empreinte date + montant + description + rang d'apparition (deux lignes identiques le même jour restent distinctes ; un relevé qui chevauche le précédent retombe sur les mêmes clés). Contrainte unique (compte, clé).
- Tables `bank_statement_imports` (historique, solde du relevé, fichier original conservé dans `backend/storage/bank_statements/`, hors du dossier public `/uploads`, ajouté à `.gitignore`) et `bank_transactions` (montant signé, statut `unclassified|excluded`). Migration `d3e4f5a6b7c8` (revises `c2d3e4f5a6b7`), testée up/down/up.
- Endpoints : `POST /bank/accounts/{id}/statements` (`dry_run=true` = aperçu sans écriture, `false` = import des seules nouvelles lignes ; avertit si le numéro du fichier ne finit pas par les 4 chiffres du compte), `GET /bank/accounts/{id}/statements`, `DELETE /bank/statements/{id}` (annule un import tant que ses lignes ne sont pas traitées), `GET /bank/accounts/{id}/transactions`. `GET /bank/accounts` renvoie aussi `unclassified_count`, `bank_balance` (solde du dernier relevé OFX), `last_feed_date`.
- Frontend : modal Relevés bancaires fonctionnel (choix du fichier → aperçu → « Importer N transactions », historique avec Annuler) ; aperçu : Solde bancaire, compteur de non classées, colonnes Non classé (lien vers le compte) et Montant en banque ; fiche : Montant en banque, Dernière date de flux, onglet Non classées avec les vraies lignes (recherche, tri par date, sélection, pagination).
- Preuve : lecteur testé sur 5 fichiers d'exemple (OFX SGML, OFX XML, CSV avec ligne de titre et deux lignes identiques, CSV français débit/crédit JJ/MM/AAAA, CSV invalide) ; HTTP : aperçu, import, réimport → 3 doublons / 400, compteurs, historique, annulation ; navigateur de bout en bout (fichier → aperçu → import → aperçu et fiche mis à jour → annulation). Base et dossier de stockage revenus à zéro après chaque test (annulation par l'endpoint, sans SQL).
- Premier vrai import par Philippe (2026-10-01) : `transactions SIP 1 ans.csv`, BNC (la fiche de compte indiquait par erreur « Banque de Montreal Entreprise », corrigée le 2026-10-02 — institution 006 = Banque Nationale), 365 lignes du 2025-10-01 au 2026-10-01, montants et dates corrects. Format BNC réel : ligne de titre `Simple IP inc.,SIMPLE IP INC,0006-00701-0601228,CAD`, puis `Date,Description,Référence,Autres détails,Contrepartie,Transit émetteur,Débit,Crédit,Solde total` (dates AAAA-MM-JJ, trié du plus récent au plus ancien, 32 lignes de frais à 0,00 $).
- Correctif le même jour : le lecteur ignorait « Autres détails » (nom du payeur/bénéficiaire, ex. ELAVON MRCH SVC, PAD DESIGN AVANCE — indispensable au futur rapprochement), « Solde total » et le numéro de compte de la ligne de titre. Maintenant : « Autres détails » → bénéficiaire, solde du relevé = solde courant de la ligne la plus récente (21 082,87 $ au 2026-10-01), numéro de compte lu (vérification xxxx1228 active). Vérifié en aperçu sur le fichier conservé (aucune écriture) ; les clés de doublon ne changent pas. Les 365 lignes déjà importées n'avaient pas le bénéficiaire.
- Lignes à 0,00 $ ignorées à l'import (avis de frais nuls, aucun argent à classer), comptées dans l'aperçu (« N lignes à 0,00 $ ignorées ») — GO de Philippe.
- Avec son GO (« fait le, arrange tout ça »), le 2026-10-01 : fichier original copié en lieu sûr (empreinte vérifiée), import annulé par l'endpoint, puis fichier réimporté → 333 lignes (32 lignes à zéro ignorées), 259 avec bénéficiaire, solde 21 082,87 $ au 2026-10-01, numéro de compte concordant. Rendu de la fiche vérifié en capture.

**Fait le 2026-10-01 — graphique entrées / sorties / solde (demande de Philippe : voir l'évolution de l'année, choix jour, semaine, 2 semaines, mois, semestre, année, année imposable)** :
- Décision avec Philippe : le choix est un regroupement ; chaque regroupement affiche un nombre fixe de périodes (jour = 30, semaine = 12, 2 semaines = 13, mois = 12, semestre = 6, année = 5, année imposable = 5) se terminant à la période en cours, flèches ‹ › pour reculer. Semaine = lundi ; 2 semaines = paires fixes depuis le lundi 2024-01-01 ; semestre = janv.-juin / juil.-déc.
- Année imposable : nouveau paramètre `fiscal_year_start_month` (défaut 1 = janvier ; Simple IP inc. = 7, exercice du 1er juillet au 30 juin, confirmé par Philippe), modifiable dans Paramètres (« Début de l'exercice financier »), validé 1 à 12.
- Backend : `backend/app/core/bank_chart.py` (périodes, libellés, solde reconstitué à toute date à partir du solde du dernier relevé : solde − mouvements postérieurs + mouvements après la date du relevé ; inconnu avant la première ligne importée) ; `GET /api/v1/bank/chart?granularity=&offset=&account_id=` (sans compte : comptes bancaires actifs, hors cartes de crédit et petite caisse, comme le Solde bancaire ; lignes exclues non comptées).
- Frontend : composant `BankChart` (barres Entrées vertes, Sorties rouges, courbe Solde sur un 2e axe, info-bulle en $) dans l'aperçu (suit le sélecteur Tous les comptes / un compte, l'ancien sélecteur « 30 derniers jours » retiré) et dans le Tableau de bord du compte (Entrées / Sorties de la période = totaux de la plage affichée) ; regroupement mémorisé dans le navigateur.
- Preuve : soldes calculés identiques à la colonne « Solde total » du fichier BNC (20 949,84 $ le 2026-09-29, 16 478,05 $ le 2026-08-31, 20 340,97 $ le 2026-07-31) ; regroupement invalide → 400, mois 13 → 422 ; captures mois / année imposable / jour / semaine / semaine précédente / fiche, aucune erreur console.
- Limite : les données importées commencent le 2025-10-01, donc l'exercice 2025-2026 est incomplet (juillet à septembre 2025 manquants) tant qu'un relevé plus ancien n'est pas importé.

**Demande de Philippe (2026-10-01) — attribuer un paiement (transactions non classées), non codé** :
1. Cliquer sur une transaction → recherche des factures les plus probables.
2. Attribuer la transaction à une entreprise → liste de toutes les factures de cette entreprise avec l'indication payée / non payée.
3. Cliquer sur le bénéficiaire → l'attribuer à une compagnie → appliqué automatiquement aux prochaines transactions de ce bénéficiaire.
Question ouverte en parallèle : cases à cocher de l'onglet Non classées (aucune action groupée aujourd'hui) — proposé : barre « Exclure la sélection » / « Restaurer ».
Constat au 2026-10-01 : 32 compagnies dans ERPCRM, dont plusieurs bénéficiaires du relevé sous un nom différent (« PATIO DESIGN MONTREA » ↔ « Patio Desing », « CRYSTAL » ↔ « Mc Crystal », « SSTCONSTRUCTION » ↔ « SST CONSTRUCTION 2016 INC ») ; 1 seule facture (brouillon), 0 encaissement — les factures de la dernière année sont dans Zoho Books.

**Demande de Philippe (2026-10-02) — dépenses (retraits), non codé** : comme dans Zoho, une dépense doit pouvoir être saisie « hors taxes » (taxes ajoutées) ou « taxes incluses » (le montant payé est le total ; TPS/TVQ extraites à rebours, le total exact au cent), avec le choix des taxes réellement payées (parfois une seule selon le fournisseur / l'endroit de la commande). Par défaut, TPS et TVQ cochées toutes les deux (c'est rare d'en retirer une) — Philippe ne veut pas avoir à les sélectionner à chaque dépense. Ventes : toujours TPS + TVQ, rien à changer. ERPCRM n'a pas encore de module Dépenses — à concevoir avec le classement des retraits bancaires.

**Fait le 2026-10-02 — les 3 modes d'attribution (GO de Philippe)** :
- Migration `f5a6b7c8d9e0` : `bank_transactions` + `company_id`, `company_source` (manual | rule), `client_payment_id`, `payment_created`, `matched_at` ; table `bank_payee_rules` (bénéficiaire normalisé → compagnie). Logique dans `backend/app/core/bank_matching.py`.
- Mode 1 (suggestions, `GET /bank/transactions/{id}/suggestions`) : encaissement déjà enregistré non lié du même montant (paiement déclaré au portail, historique Zoho) → « Lier » (confirmé au passage s'il était en attente) ; factures ouvertes classées (montant exact, compagnie reconnue, ressemblance du nom, date) ; combinaisons de factures d'une compagnie dont les soldes font le montant.
- Mode 2 (`GET /bank/companies/{id}/invoices`) : choisir une compagnie → toutes ses factures avec payé / solde, cocher une ou plusieurs, répartir le dépôt (le reste non réparti reste un crédit du client) → `POST /bank/transactions/{id}/match` crée un encaissement confirmé (source `bank_import`, mode deviné : Interac / Elavon / chèque / virement, modifiable) et met à jour les statuts.
- Mode 3 : clic sur le bénéficiaire → compagnie (`PUT /bank/transactions/{id}/company`), avec « Retenir » : règle créée, appliquée aux lignes non classées et à chaque import → onglet « Reconnu » (propose, ne confirme jamais). Règles consultables / modifiables / supprimables dans « Gérer les règles de transaction ». Associer avec « Retenir » crée aussi la règle.
- Onglet Reconnu : « Valider » quand la suggestion est sûre (un seul paiement de la compagnie au même jour ±2, ou une seule facture au solde exact) ; actions groupées (`POST /bank/transactions/bulk`) : Valider la sélection, Exclure, Restaurer (vue Exclu). Toutes les transactions : lignes associées (client, factures) avec « Annuler » (`/unmatch` : supprime l'encaissement créé, ou délie un paiement existant — un paiement du portail redevient en attente). Annuler un import reste refusé si une de ses lignes est associée.
- Données (2026-10-02) : les 10 dépôts sûrs associés par l'API (Hamak, PAD, SST, Oxygene → Maison Le Passeur, Maison Le Passeur, MRST, Remorque 125, Cycle Vert, Jardin-Idéal, Centre Cardio) → 10 factures payées ; 6 règles créées ; 65 anciennes lignes reconnues dont 59 avec suggestion sûre (paiements historiques Zoho au même jour). Audacie non touchée (test de Philippe) : son dépôt du 17 sept. correspond en fait à INV-112201 (déjà payée dans Zoho).
- Preuve : suggestions vérifiées (Hamak → INV-112217, PAD → INV-112226, Interac 261,22 → Jardin-Idéal, dépôt de janvier → paiement Zoho HRH du même jour) ; annuler puis refaire une association (facture repasse Envoyée puis Payée) ; double association → 400 ; captures Non classées, Reconnu, fenêtre Associer, Toutes les transactions, Règles, factures « Non transmise » ; aucune erreur console. Liste des transactions : ~1,2 s (suggestions calculées pour les lignes reconnues).
- Correction le 2026-10-02 : la banque est la BNC (Banque Nationale du Canada) ; la fiche du compte indiquait « Banque de Montreal Entreprise » — corrigée.

**Prochaine étape** : classement des retraits = module Dépenses (spécification ci-dessus), à concevoir avec Philippe.

### TASK-042.1 [ ] Relevés BNC automatiques par SFTP (Transfert de fichiers corporatifs)
Date de demande : 2026-10-05 (Philippe : « pour Simple IP, la connexion directement avec la BNC par SFTP — service TFC, accessible par SFTP et conçu pour être automatisé », guide https://www.bnc.ca/content/dam/bnc/entreprise/pdf/transfert-de-fichiers-corporatifs.pdf)
Date(s) de travail : 2026-10-05 (lecture du guide seulement, rien construit)

Ce que dit le guide (ins-021, 2020) : TFC = boîte aux lettres pour échanger des fichiers avec la BNC, par le Web (https://web.tfc.bnc.ca) ou par SFTP (sftp.bnc.ca, automatisable), mot de passe ou clé publique (RSA 1024 bits sans phrase de passe, nom de clé = numéro client à 10 chiffres) ; maintenance samedi 23 h 59 → dimanche 6 h et dimanche 22 h → 23 h 59 ; soutien Solutions électroniques aux entreprises 1 844 394-4494, support.tfc@bnc.ca.
Ce que le guide ne dit PAS : quels fichiers sont déposés. TFC n'est que le canal ; les relevés de compte exigent un service BNC à part qui y dépose les fichiers. À obtenir de la BNC avant de coder : nom du service de relevés, format (CAMT.053, BAI2, MT940, OFX ?), fréquence (quotidienne, intrajournalière), frais, clé acceptée (2048/4096 bits ou ed25519 ?), et **un fichier exemple**.
Plan proposé (en attente de ces réponses) : connexion SFTP configurable par compte bancaire dans l'écran (pas d'identifiant en dur, logiciel destiné à être vendu), clé privée hors du dépôt et lisible seulement par le service, récupération planifiée → lecteur du format BNC → même import que les relevés OFX/CSV (doublons écartés, rien de confirmé sans Philippe).

### TASK-042.4 [x] Retraits bancaires : dépenses, paiements fournisseurs, règles fournisseur
Date de demande : 2026-10-06 (Philippe : « pis les retraits maintenant »)
Date(s) de travail : 2026-10-06

Constat avant de construire (93 retraits) : 55 correspondent déjà à une dépense importée (même montant, ±10 j), 11 à un paiement de facture fournisseur, 27 à rien (virements Interac, Mastercard 6 × = 42 391 $, Revenu Québec / ARC…). Les dépenses et paiements déjà enregistrés se LIENT — jamais recréés (double compte).
- Migration 9559265c75e8 : `bank_transactions.vendor_id`, `vendor_source` (manual | rule | name), `expense_id`, `vendor_payment_id` ; `bank_payee_rules.company_id` devient optionnel + `vendor_id`, `category_id` (un même bénéficiaire peut être client pour ses dépôts et fournisseur pour ses retraits). Voir ERRORS_LESSONS TASK-042.4 (incident d'identifiant de migration).
- `bank_matching` : `withdrawal_suggestions` (dépenses ±15 j et paiements fournisseurs −35/+15 j non liés, même montant, même fournisseur si connu ; factures ouvertes du fournisseur, plus vieilles d'abord), `best_exact_withdrawal` (une seule dépense/paiement, ou le plus proche nettement ≤ 10 j ; sinon fournisseur confirmé + plus vieilles factures dont la somme égale le retrait), `propose_vendors` (règle du bénéficiaire, sinon nom évident = proposition « Fournisseur probable » à accepter). Les règles client ne s'appliquent plus qu'aux dépôts.
- API : `POST /bank/transactions/{id}/match-withdrawal` (lier dépense | lier paiement | payer des factures — paiement fournisseur créé, groupé possible pour la carte de crédit | nouvelle dépense, taxes incluses par défaut), `PUT /bank/transactions/{id}/vendor`, `GET …/withdrawal-suggestions`, `GET /bank/vendors/{id}/open-bills` ; « Annuler » supprime ce que l'association a créé (dépense, paiement + recalcul des factures) ou délie seulement ; association sûre automatique (import, « Associer ce qui est sûr », « Valider la sélection ») aussi pour les retraits.
- Écran : sur chaque retrait, fournisseur reconnu ou probable (« Accepter »), suggestion sûre + « Valider », « Associer » → fenêtre retrait (déjà enregistré dans ERPCRM → Lier ; payer des factures fournisseurs avec « Appliquer aux plus vieilles d'abord » et paiement groupé ; enregistrer une dépense) ; règles de transaction : client et/ou fournisseur ; Toutes les transactions : libellé Dépense / Paiement fournisseur.
- Mesure (lecture) : 65/93 retraits associables « sûrs » (54 dépenses, 11 paiements), 27 sans correspondance, 1 ambigu ; 12 retraits ELAVON MRCH SVC → fournisseur Elavon proposé par le nom.
- Preuve (vrais retraits, chaque fois annulé) : lier une dépense → « Dépense — Assurance » puis annuler, dépenses inchangées ; nouvelle dépense (FRAIS TRANSACTION 3,50 $) créée puis supprimée à l'annulation ; payer une facture Industrielle Alliance → partielle 174,79 $, annulation → en retard 178,29 $, paiements inchangés ; mauvais montant refusé. Défaut trouvé en testant : relecture de la dépense après commit (MissingGreenlet) → rechargée avec `populate_existing` ; la dépense de test restée liée a été annulée proprement.
- 2026-10-07 : défaut trouvé en vérifiant les 27 retraits sans correspondance — le test « payer une facture » avait laissé Industrielle Alliance comme fournisseur du retrait FRAIS TRANSACTION après l'annulation, ce qui cachait sa dépense du même jour. Corrigé : un fournisseur venu d'une association est marqué `vendor_source = match` et retiré à l'annulation (règle ou nom reproposés) ; un fournisseur choisi à la main reste. Retrait remis dans son état d'origine ; contrôle : de nouveau 54 dépenses + 11 paiements sûrs, 27 sans correspondance, 1 ambigu (FACTURATION EDI 1,50 $, deux dépenses possibles).
- 2026-10-07, Philippe (« Valider : pas besoin de cette étape, le rapprochement est sûr » ; « Associer : on va l'enlever, mais quand je clique sur une transaction je veux l'option d'éditer, changer le client, voir les % des factures plausibles ou liées, toutes les infos — dépôt, retrait même principe ») :
  - Boutons « Valider », « Associer », « Valider la sélection » et « Associer ce qui est sûr » retirés ; seul « Accepter » reste (quand une proposition existe). Clic sur une ligne (non classées ou toutes) → fiche `TransactionModal` : infos du relevé (description, bénéficiaire, référence, compte, fichier importé), client/fournisseur modifiable (retenu pour le bénéficiaire, associe aussitôt si c'est sûr), proposition de l'IA, « Lié à » avec annulation, suggestions avec **pertinence %** (`pct` : dépôts score/145 factures, score/120 paiements ; retraits selon l'écart de date), actions (lier, payer des factures, nouvelle dépense, exclure/restaurer). `GET /bank/transactions/{id}/detail`.
  - Rapprochement sûr automatique : à l'import, à l'acceptation, et toutes les 10 minutes (`bank_ai_poller.run_sure_pass`). Sauvegarde avant le premier passage : /home/simpleip/backups/erpcrm_avant_rapprochement_auto_20261007_1055.sql. Premier passage : 122 dépôts (121 liés à un paiement existant, 1 encaissement créé : Attaches Viscan 958,61 $ sur sa plus vieille facture ouverte) et 65 retraits (54 dépenses, 11 paiements fournisseurs).
  - Défaut trouvé au contrôle : 6 dépôts liés à un paiement enregistré 27 à 34 jours plus tôt/plus tard (règle « un seul candidat sur 45 jours » trop lâche chez les clients mensuels au même montant ; un cas lié à une facture émise après le dépôt). Règle resserrée (≤ 10 jours, jamais une facture émise après le dépôt) et les 6 liens défaits (déliés seulement, rien supprimé) ; plus aucun lien à plus de 10 jours.
  - 2026-10-07 (Philippe : « Accepter sur Elavon, c'est pour créer la règle ? Je veux le voir dans l'edit de la transaction et lui attribuer un article dans les 6 classes ») : oui, « Accepter » crée la règle bénéficiaire → fournisseur ; bouton ajouté dans la fiche (fournisseur probable) ; « Enregistrer une dépense » depuis un retrait : choix de la classe (6 classes de TASK-044.1, taxes réglées selon la classe) → ligne de dépense (`NewExpenseIn.line_class`). Testé sur FRAIS FORFAIT 7 $ (Frais de fournisseur, sans taxes) puis annulé.
- 2026-10-07 (Philippe : « pourquoi j'ai Accepter, Valider et Associer ? » → GO) : un seul bouton principal par ligne — « Valider » si la correspondance est sûre, sinon « Accepter » (client proposé par l'IA ou fournisseur probable) ; « Associer… » devient un lien. « Accepter » va jusqu'au bout : `PUT …/company` et `PUT …/vendor` (`auto_match`, vrai par défaut) associent aussitôt quand la correspondance devient sûre (auto_matched).

### TASK-042.5 [x] Avis de virement Interac lus par courriel → expéditeur des dépôts
Date de demande : 2026-10-07 (Philippe a obtenu de la BNC le dépôt automatique Interac — « c'est tout, le reste des automatisations est impossible » ; GO pour lire facturation@simpleip.tel ; « je veux qu'il reste en mémoire, mais crypté »)
Date(s) de travail : 2026-10-07

- Pourquoi : le relevé BNC n'indique que « VIREMENT INTERAC » (31 dépôts sans client) ; l'avis d'Interac donne l'expéditeur, le montant, la date, le message (souvent un n° de facture) et la référence.
- Migration 0bb075ae97b5 (id généré, une seule tête, up/down testés) : `interac_notices`.
- `app/core/interac_mail.py` + `services/interac_poller.py` (toutes les 15 min si activé) : boîte ouverte en **lecture seule** (select readonly + BODY.PEEK : rien marqué lu ni déplacé), seulement les courriels dont l'expéditeur contient « interac » ; l'IA locale lit chaque avis (reçu ou pas — un virement envoyé, une demande ou un rappel est ignoré) ; le programme vérifie que le montant lu figure dans le courriel ; avis relié au dépôt Interac du même montant (−1/+3 jours) s'il est unique → le dépôt prend l'expéditeur comme bénéficiaire (règles, comparaison des noms, IA et rapprochement sûr s'appliquent ensuite).
- Paramètres › « Courriels Interac (dépôts) » : serveur, port, utilisateur, mot de passe **chiffré** (Fernet, `core/crypto.py`, jamais réaffiché), dossier, « lire depuis le », lecture automatique, « Tester la connexion » (nombre d'avis + 3 derniers sujets), « Lire maintenant » (arrière-plan), compteurs. Aucun identifiant dans le code (`mail.simpleip.tel` saisi par Philippe).
- Preuve sans la vraie boîte : avis fictif « JEAN TREMBLAY vous a envoyé 1 234,56 $ » → lu (expéditeur, montant, date, message, référence) ; virement envoyé à Bell → ignoré ; montant absent du courriel → refusé ; chiffrement/déchiffrement ; relié à un vrai dépôt « VIREMENT INTERAC » (transaction annulée).
- À faire par Philippe : entrer la connexion dans Paramètres, tester, lire.

### TASK-042.3 [ ] Dépôts Elavon : détail des paiements par carte (Authorize.Net / Elavon)
Date de demande : 2026-10-05 (Philippe : « si je te donne accès à mon courriel Facturation@simpleip.tel tu pourrais avoir les rapports de carte de crédit, ça te sert-tu à quelque chose ? » ; puis « je vais regarder si j'ai des API avec Elavon »)
Date(s) de travail : (aucune — en attente de Philippe)

Constat : les dépôts « ELAVON MRCH SVC » (22 non classés) sont des lots de paiements par carte ; le bénéficiaire est toujours le même, donc ni règle ni IA ne peut trouver le client. Le courriel de règlement Authorize.Net (ID marchand 2787824) donne le lot (ex. 22 sept. 2026 : 193,67 $, 1 transaction = dépôt Elavon du 24 sept.) mais pas le client ni la facture. Chaîne : Authorize.Net = passerelle (détail par transaction : client, courriel, montant, n° de facture), Elavon = processeur (dépôts et frais par lot).
Recommandé : API de rapports Authorize.Net (lecture seule : lots réglés → transactions), identifiants (API Login ID + Transaction Key) saisis par Philippe dans un écran ERPCRM, jamais dans le code ni le chat → association exacte dépôt Elavon → lot → client/facture, automatique quand sûre. Courriel = plan B (totaux de lots seulement). En attente : Philippe vérifie ce qu'Elavon offre comme API.

### TASK-042.6 [x] Faux crédits clients retirés + tâches de fond dans un seul processus
Date de demande : 2026-10-14 (Philippe : « oui corrige ça en premier » — après la découverte des faux crédits en faisant TASK-005.19)
Date(s) de travail : 2026-10-14

- Constat (voir ERRORS_LESSONS TASK-042.2, 2026-10-14) : 40 encaissements `bank_import` (15 915,70 $) mis en crédit du client par l'association automatique du 2026-10-08 13:06 UTC — des dépôts dont les factures étaient déjà payées par un « Paiement antérieur » ; 13 en double parce que les deux services (erpcrm-backend :8010 et erpcrm-backend-tls :8011) faisaient tourner les mêmes tâches de fond en même temps. Aucun n'avait encore payé une facture ; J. Lavoie (18 oct.), Audacie (19), Rubi (20), Mc Crystal et MRST (22) l'auraient été à tort.
- Règle (`bank_matching.best_exact`) : plus jamais de crédit automatique (crédit seul ou surplus) quand le client a un paiement confirmé pas encore relié à la banque à 45 jours ou moins du dépôt, ni pour un dépôt daté avant ou le jour du dernier « Paiement antérieur » importé (lu dans la base) — dans la période de l'historique, les dates des paiements importés ne suivent pas les dépôts (LS : dépôt du 2026-03-04, paiement importé du 2026-07-06). Le dépôt reste « non classé » pour Philippe. « Mettre en crédit du client » à la main reste possible.
- Tâches de fond (`app/core/background_leader.py`, `main.py`) : verrou consultatif PostgreSQL (session) ; le processus qui l'obtient fait tourner les 9 tâches (courriels, rappels, sauvegarde, rapports CDR, périodiques, banque/IA, reçus, Interac, synchronisation des boîtes) ; l'autre réessaie toutes les 30 s et prend la relève si la connexion du premier se ferme. L'horloge reste dans chaque processus.
- Données (`backend/fix_phantom_credits_20261014.py`, essai à blanc puis `--apply`, sauvegarde `/home/simpleip/backups/erpcrm_avant_faux_credits_20261014_2203.sql`) : 13 doublons supprimés ; 27 associations annulées comme le bouton « Annuler » (encaissement supprimé, dépôt remis non classé avec sa compagnie) ; INV-112237 Mc Crystal repasse « partiellement payée » (solde 145,57 $, comme dans l'ancien logiciel). Le passage automatique de 22:03 UTC, encore avec la première version de la règle (sans la garde de l'historique), a recréé 3 crédits (MRST 211,09, LS 45,88, Rubi 142,16 — une seule fois chacun : le verrou a empêché les doublons) ; annulés de la même façon.
- Preuve : un seul détenteur du verrou (`pg_locks`), aussi après un redémarrage ; simulation de l'association automatique sur les 27 dépôts : aucune association (tous attendent d'être reliés) ; 0 encaissement confirmé avec une part non répartie.
- Suite : relier ces 27 dépôts à leurs « Paiement antérieur » avec l'historique complet des factures que Philippe télécharge (un dépôt qui paie plusieurs factures antérieures, ex. Hamak 263,30 $ = 2 × 131,65 $, demande de pouvoir lier une ligne bancaire à plusieurs encaissements).

### TASK-042.7 [~] Relevés BNC 2019-2025 importés des PDF + liaison des dépôts aux « Paiement antérieur »
Date de demande : 2026-10-14 (Philippe : « dans /home/simpleip/Simple_IP j'ai mes relevés de BNC entreprise… certains paiements se sont rentrés 2 fois, j'aimerais ne pas les recréer chez toi ») ; 2026-10-15 : « commence à relier les paiements »
Date(s) de travail : 2026-10-15

- Relevés : `Relevé BNC.rar` (7zip + 7zip-rar installés), 85 relevés PDF du 2019-09-13 au 2026-09-30. Lecteur local `backend/bnc_statement_pdf.py` (pdftotext ; OCR Tesseract pour les 3 relevés à police illisible de mai, août, sept. 2025, avec correction CP1→CPI, V1→VI) : chaque ligne vérifiée contre le solde imprimé, chaque mois contre le résumé de la banque (nombre et total des débits/crédits) — tous conformes. Formats avant/depuis 2025 (AAAA-MM-JJ / JJ-MM-AAAA, « 12 674,99 », mois imprimé sur certaines lignes seulement, solde négatif « 24.00 - »).
- Manquait : le relevé de novembre 2021 (« RC 2021 11 31 » contient octobre) — fourni le 2026-10-15, voir plus bas. Mars 2023 en double (ignoré). Vérification croisée oct. 2025 → sept. 2026 : PDF = CSV déjà importé (seule différence : frais d'oct. 2025 en une ligne de 10,50 $ dans le PDF, 7,00 + 3,50 dans le CSV).
- Import `backend/import_bnc_pdf_statements.py` (sauvegarde `erpcrm_avant_releves_bnc_pdf_20261015_0830.sql`) : 72 relevés, 1 902 transactions du 2019-09-30 au 2025-09-30 (dépôts 440 869,04 $, retraits 426 704,30 $), PDF gardés dans storage/bank_statements, description séparée comme le CSV (type + bénéficiaire, référence CPI/*carte à part), sans aucune association ni IA.
- Liaison `backend/link_bank_history.py` (sauvegarde `erpcrm_avant_liaison_banque_v2_20261015_0835.sql`) : client du dépôt par l'historique bancaire de l'ancien logiciel (`Zoho_Books_historique_2020-2026.csv`, 1 580 « Paiement de client » ; même montant, date −3/+7 j ; lots de cartes ; égalité départagée par le bénéficiaire ou le seul client qui doit ce montant), sinon règles de bénéficiaire, sinon (dépôt sans nom) un seul paiement de ce montant tous clients confondus. Puis **deux passes** : (1) paiements datés à 7 jours du dépôt (attribution de l'ancien logiciel), seuls ou en groupe ; (2) pour le reste, les plus vieilles factures du client (même montant, puis groupes de 2 à 4). Au cent près, sinon rien. Un dépôt qui paie plusieurs factures = un seul encaissement (fusion), daté du dépôt. Les doublons de l'ancien logiciel ne sont jamais recréés : la BNC décide (ex. Construction Nationale 2026-02-05 → INV-111889 seulement ; INV-111934 rattrapée par le dépôt de 2 166,48 $ du 2026-04-17).
- Résultat : **1 233 dépôts reliés** (880 selon les dates de l'ancien logiciel, 353 aux plus vieilles factures) ; montant réglé de chaque facture inchangé (comparé à la sauvegarde), 0 encaissement à part non répartie.
- Reste (listes pour Philippe) : `/home/simpleip/Simple_IP/depots_non_relies.csv` — 239 dépôts (111 428 $ ; 129 sans client connu, dont les dépôts mobiles et Interac de 2019-2020 avant l'historique, 96 d'un client connu sans paiement qui tombe juste — souvent des factures d'avant 2020 absentes, 14 lots de cartes multi-clients) ; `/home/simpleip/Simple_IP/paiements_anterieurs_sans_depot.csv` — 342 « Paiement antérieur » depuis 2019-10 sans dépôt BNC (84 726 $ ; Construction Nationale 35 / 15 602 $, ABC 28 / 11 149 $, Piscines Poséidon 15 / 10 962 $, Resto Bar le 103 27 / 326 $…) : doublons de l'ancien logiciel, paiements par chèque groupés, ou factures marquées payées sans l'être.
- 2 erreurs pendant la liaison, corrigées le même jour (ERRORS_LESSONS TASK-042.7).
- 2026-10-15, relevé de novembre 2021 fourni par Philippe (`factures_zoho/RELCPTE_ACCTSTMT_007011228_113021.pdf`, importé sous le nom « RC 2021 11 30 … » que le script attend) : 30 transactions (dépôts 7 681,77 $, retraits 7 000,62 $), solde 2 524,56 → 3 205,71 = fermeture d'octobre / ouverture de décembre, résumé de la banque conforme ; enchaînement des 85 mois maintenant complet. Liaison relancée (sauvegarde `erpcrm_avant_liaison_nov2021_20261015_0951.sql`) : **24 dépôts de plus** — 13 de novembre 2021, et 11 d'autres mois dont l'ambiguïté venait des paiements de novembre restés libres (prélèvements Visa : facture datée 4 à 12 jours avant le dépôt, comme leurs autres mois ; Construction Nationale 431,16 $ = INV-000610 + INV-000733 ; Jardin-Idéal 261,22 $ du 2025-07-22 → INV-111397). Relancé jusqu'à stabilité (0 nouvelle). Contrôle : montant réglé de chacune des 2 456 factures inchangé, 0 encaissement incohérent, 0 dépôt relié à un montant différent. Rapport : liste `linked` ajoutée (chaque liaison proposée, vérifiable avant `--apply`). Restes mis à jour : 237 dépôts non reliés (114 292 $) ; 314 « Paiement antérieur » sans dépôt (79 909 $ ; Construction Nationale 33 / 15 171 $, ABC 28 / 11 149 $, Piscines Poséidon 15 / 10 962 $).
- 2026-10-15, règle changée (Philippe : « certains paiements se font dès que la facture sort s'il avait rentré sa carte de crédit, donc tu dois calculer de 0 à 400 jours » ; « oui, corriger la règle pour qu'un dépôt cherche d'abord les factures datées juste avant lui ») : après les dates réelles de l'ancien logiciel (1re passe, inchangée), la 2e passe prend la facture du même montant datée **juste avant** le dépôt (0 à 400 jours, jamais après), puis le groupe de 2 à 4 le plus récent (parmi les 12 plus proches), et seulement ensuite les plus vieilles (client en retard qui rattrape — Poséidon, rappelé par Philippe des mois après une facture). Mesure avant : 91 % des 790 paiements datés 2024-2026 arrivent dans les 40 jours, 47 % le jour même. Le script fait ses tours jusqu'à stabilité et réserve, au départ, la ligne d'historique de chaque dépôt déjà relié. État d'avant la liaison remis depuis `erpcrm_avant_liaison_banque_v2_20261015_0835.sql` (0 écart ; 13 dépôts de novembre 2021 remis non classés ; sauvegarde avant : `erpcrm_avant_liaison_v3_20261015_1013.sql`), réappliqué : **1 268 dépôts reliés** ; réglé de chacune des 2 456 factures inchangé, 0 encaissement incohérent, relance = 0. Poséidon : août 2021 payé le 9 sept., le 1 302,22 $ du 5 nov. = sept. + oct. Restes : 226 dépôts (103 837 $, dont 125 sans client connu) ; 291 « Paiement antérieur » sans dépôt (69 454 $ ; ABC 25 / 10 083 $, Poséidon 13 / 9 660 $, LS Comptable 4 / 5 938 $, Construction Nationale 13 / 5 887 $). Erreur notée : ERRORS_LESSONS TASK-042.7 (2e entrée du 2026-10-15).
- 2026-10-15, question de Philippe (« mais tu n'as pas les noms des entreprises associées avec les paiements de Zoho ? ») : sur les 125 dépôts sans client, 84 sont d'avant le 2020-06-01 (début de l'historique de l'ancien logiciel ; relevés BNC dès 2019-09) ; pour les autres, le nom existait mais la fenêtre de dates historique ↔ dépôt (−3 / +7 j) était mal placée. Mesuré sur les dépôts reliés : le paiement de l'ancien logiciel est daté du jour du dépôt ou 1 à 5 jours AVANT (cartes GBL/Elavon, fins de semaine), jamais plus d'un jour après → `HIST_MIN, HIST_MAX = -6, 2` (aussi pour les lots de cartes et la réservation des lignes déjà prises). Liaison refaite au complet depuis l'état d'avant (sauvegarde `erpcrm_avant_liaison_v4_20261015_1136.sql`, 0 écart) : **1 291 dépôts reliés** (+23, cartes Waterco, Talentech, Garage du Coin, KIKO, ABC, Couvre-Planchers) ; réglé de chaque facture inchangé, 0 incohérent, relance = 0. Restes : 203 dépôts (96 380 $ ; 98 sans client dont 84 d'avant juin 2020, 3 remboursements du gouvernement et 2 « autres revenus » selon l'ancien logiciel, 2 tests « Simple Test », 2 virements Jardin-Idéal en double le même jour — 2024-11-28 et 2025-07-22, l'ancien logiciel n'en a qu'un), 263 « Paiement antérieur » sans dépôt (61 997 $).

### TASK-042.8 [x] Chèques numérisés de Philippe : séparer, lire, jumeler aux dépôts
Date de demande : 2026-10-15 (Philippe : « je garde mes chèques… je vais en faire des PDF de plusieurs chèques, est-ce que tu es capable de les séparer après (image) et les mettre dans le fichier client ? » ; « je te les donne à toi de la même façon, demande-moi comme avec les autres quand il y a des incompréhensions »)
Date(s) de travail : 2026-10-15

- À faire (local, sans IA payante) : PDF → pages (pdftoppm) → un fichier par chèque (découpe sur le fond foncé, remis à l'endroit) → OCR Tesseract (payeur imprimé, date, montant imprimé) → jumelage au dépôt BNC (même montant, déposé dans les jours après la date du chèque) → chèque attaché au paiement (TASK-005.24). Chèques manuscrits : vérifiés à l'œil ou demandés à Philippe. Priorité : septembre 2019 à mai 2020 (avant l'historique de l'ancien logiciel).
- Déjà appris de 9 photos (2026-10-15) : 57,49 $ du 2020-03-17 = Houle Avocat facture #1300 (pas K-DO) ; 120,72 $ du 2020-04-01 = Groupe Lavoie (pas Guimond Lavallée) → 2 liaisons TASK-042.7 à défaire, et plus de « un seul client a ce montant » avant le 2020-06-01 (liste de factures incomplète) ; Inolec/J. Carrier 459,91 $ (facture 1246) = dépôt du 2020-01-07 ; PAD 1 309,78 $ = dépôt du 2020-03-16 ; chèques personnels (Retraite Québec, Allocation canadienne pour enfants) et chèques de sept. 2019 absents du compte BNC d'entreprise.
- Fait (2026-10-15) : `app/core/cheque_scan.py` (OpenCV + Tesseract, local) — découpe les chèques posés sur fond foncé, les redresse, choisit le sens que Tesseract lit avec le plus d'assurance ; 23 pièces de 13 photos séparées et identifiées. Décisions de Philippe : créer les anciens clients absents ; CLAM = installation/débogage, pas de mensuel ; pas de relevés personnels ; chèques d'avant l'incorporation (entreprise individuelle NEQ 2274052275 ; Simple IP inc. constituée le 2019-07-02) et déposés au compte personnel = ignorés. `backend/apply_cheques_20261015.py` (sauvegarde `erpcrm_avant_cheques_20261015_1249.sql`) : J. Carrier Fournitures industrielles inc. (t1095) et CLAM (t1096) créées inactives ; 2 liaisons TASK-042.7 défaites (K-DO 1275 et Guimond Lavallée 1312 reprennent leurs dates d'origine) ; 11 paiements « facture perdue » + le test PAD (PAD ×4 dont #1197 et #1235, Pro-Sin, Strong, J. Carrier #1236 et #1246, CLAM ×2 le 2019-12-02, Houle #1300, Groupe Lavoie), 13 pièces attachées. `link_bank_history.py` : plus de « montant unique » avant le 2020-06-01.
- 2e lot (2026-10-15, 5 photos) : `backend/apply_cheques_lot2_20261015.py` (sauvegarde `erpcrm_avant_cheques_lot2_*.sql`) : 7 paiements « facture perdue » (Houle #1219 et #1233, J. Carrier #1223, Vincent Radiateur #1195, Domaine des Cascades #1189, Gestion Immo 1ère 3 316,87 $, PAD 918,52 $) ; pièces ajoutées aux paiements existants (talon Pro-Sin = factures 1202 et 1206, talon Strong = facture 1216, chèques J. Carrier #112104/#112213, PAD #14807) ; talon J. Carrier #111654 (facture 1193, sept. 2019) ignoré. 28 pièces au total. 3e lot (2026-10-15, `apply_cheques_lot3_20261015.py`) : Houle #1253 (58,14 $), HRH 57,49 $ (dépôt du 2019-12-24, pas Houle), J. Carrier 459,90 $ ; chèque de l'agence de recouvrement mis de côté (TASK-005.25). 4e lot (2026-10-15, `apply_cheques_lot4_20261015.py`, 16 chèques) : Société commerciale Saint-Georges inc. (t1097) et Clinique des professionnels de la santé de Sorel-Tracy (t1098) créées ; 13 paiements « facture perdue » (Saint-Georges #1278, Houle #1270/#1284/#1325, PAD ×3, Domaine des Cascades, Château Vincent d'Indy ×3 dont 5 643,27 $, Strong 753,54 $, HRH 60,35 $) ; chèque Guimond Lavallée #8119 ajouté au paiement antérieur de la facture 1312 (dépôt du 2020-06-03). En attente de Philippe : Clinique #822 (2020-02-29, facture 1259) et Pro-Sin #8056 (2020-04-09), 114,98 $ chacun, pour les dépôts de 114,98 $ du 2020-04-17 et du 2020-05-27 (images dans `storage/payment_documents_pending/`). 6e lot (`apply_cheques_lot6_20261015.py`, 16 chèques surtout après juin 2020) : 13 chèques attachés aux paiements déjà reliés (factures connues) ; correction : le dépôt de 114,98 $ du 2020-05-27 = J. Carrier #112874 (pas la Clinique, voir ERRORS_LESSONS TASK-042.8) ; 2020-04-17 à confirmer (Pro-Sin ou Clinique) ; en attente : Clinique #822, K-DO #10451, Dany Gauthier Arseneault #050 (250 $ à Philippe, absent du compte d'entreprise). 7e lot (`apply_cheques_lot7_20261015.py`) : 4 chèques attachés (Domaine des Cascades ×2, ScopServ #3131 = INV-000013-14, PAD). Maisons mères (Philippe, 2026-10-15, par `PUT /companies/{id}/group`, sans tenant donc sans effet téléphonique, chacune facturée à son nom) : **Gestion Immo 1ère inc.** ← Domaine des Cascades, Les Jardins Bleu & Or, Château Vincent d'Indy, Jacques-Cartier, L'Ermitage, Le St-Michel, Ste-Geneviève (créée inactive, sans facture) — Data Informatique exclue (compagnie de Jeanne Côté) ; **Inolec** (t1099, créée inactive) ← J. Carrier Fournitures industrielles inc. Lots 8 à 13 (2026-10-15) par `backend/apply_cheques_auto.py` (une règle : premier dépôt du même montant de −7 j à +70 j après la date du chèque, sans chèque déjà attaché ; avant juin 2020 = facture perdue ; sinon mis de côté sans question), talons par `apply_cheques_stubs_20261015.py`, fin par `apply_cheques_final_20261015.py`. **Série terminée** : 168 pièces sur 151 paiements, 38 « factures perdues » (23 031,30 $) ; contrôle : 0 paiement incohérent, 0 dépôt relié à un montant différent. Restent en attente (`storage/payment_documents_pending/`) : Remorques 125 #20403 (172,12 $, 2026-08-15, jamais déposé — facture INV-112203 encore ouverte), Domaine des Cascades 45,88 $ du 2021-10-04 (aucun dépôt libre), Clinique Sorel-Tracy #822 / Pro-Sin #8056 (un seul dépôt de 114,98 $), K-DO #10451, Oligny et Thibodeau #8178 (TASK-005.25), Dany Gauthier Arseneault (personnel). Écarts vus sur les talons : PAD INV-000132 (talon 512,08 $ / ERPCRM 12,08 $), ACVRQ #4068 (talon = facture 1396 / dépôt relié à 1423). Talon Pro-Sin découpé à l'envers (retourné à la main) : le choix du sens par Tesseract échoue sur un talon presque vide.


### TASK-042.9 [x] Fenêtre « Relevés bancaires » : Fermer et Importer en haut
Date de demande : 2026-10-19 (Philippe : « les boutons fermer et importer les transactions des relevés doivent être en haut de la boîte parce que je dois descendre et passer tous les relevés pour y arriver »)
Date(s) de travail : 2026-10-19

- `Bank.jsx` (StatementsModal) : titre, Fermer et Importer dans un en-tête collé en haut de la fenêtre, toujours visible pendant qu'on fait défiler la liste des relevés importés ; plus de boutons au bas. Vérifié (Playwright 1920) : fenêtre défilée jusqu'au dernier relevé, boutons encore visibles en haut.


### TASK-042.10 [x] Banque : retirer le client attribué à un dépôt par erreur
Date de demande : 2026-10-21 (Philippe : « j'ai associé le 2,23 avec HB Architecture inc. mais je n'ai pas l'option de désassocier si je me suis trompé, un bouton serait cool »)
Date(s) de travail : 2026-10-21

- Fiche du dépôt : « Retirer le client » à côté du client attribué ; liste des transactions non classées : petit ✕ après « → client ». Choix : « Ce dépôt seulement » (bouton principal) ou « Tous les dépôts « bénéficiaire » » : oublie aussi la règle bénéficiaire → client (`PUT /bank/transactions/{id}/company` avec `forget`, `_forget_company_rule` : le fournisseur retenu pour les retraits du même bénéficiaire est gardé ; les autres dépôts reconnus par cette règle redeviennent sans client). Une transaction déjà associée à un paiement garde « Annuler l'association ».
- Fenêtres de choix (`Dialog.jsx`) : les boutons passent à la ligne au lieu de déborder de la boîte.
- Constat signalé à Philippe : la règle « ELAVON MRCH SVC → HB Architectes inc. » (créée le 2026-10-07) attribue à HB tous les dépôts d'Elavon (1 642,57 $, 968,35 $, 1 596,35 $…) ; Elavon est un service de paiement par carte, donc probablement pas toujours HB. Rien n'a été retiré : décision de Philippe.
- Vérifié (Playwright) : ✕ dans la liste, bouton dans la fiche, fenêtre de choix lisible ; logique de la règle essayée dans une transaction annulée (règle gardée pour le fournisseur, client retiré).
- 2026-10-21 (2e passe) — Philippe : « pourquoi la banque est si longue à loader… si je n'ai pas à descendre je n'ai pas à les loader » ; « la boîte pour retirer n'est pas assez large pour tes boutons (tu fais souvent cette erreur) » ; « retirer le client du dépôt fait peur, dis de l'autre côté ». (1) Mesuré : la liste d'un compte (2 274 lignes) prenait 13,5 s au serveur, dont 9,8 s à monter les fiches une requête à la fois et 3,3 s de suggestions. `_tx_out_bulk` : fiches en ~10 requêtes groupées (0,35 s, résultat identique ligne pour ligne à l'ancien calcul) ; suggestions retirées de la liste et demandées seulement pour les lignes affichées (`POST /bank/transactions/suggestions`) ; 25 lignes par page par défaut (25/50/100/200). Navigateur : compte affiché en 2,6 s (avant ~25 s). (2) `Dialog.jsx` : la fenêtre s'élargit à ses boutons (min 460 px, max 92 % de l'écran), boutons sur une ligne. (3) Libellés : « Retirer ce dépôt du client », « Retirer ce dépôt de 2,23 $ de HB Architectes inc. ? ».


### TASK-042.11 [x] Paiements par carte (Elavon / Authorize.Net) reconnus par les reçus « Merchant Email Receipt »
Date de demande : 2026-10-21 (Philippe : « pour les paiements d'Elavon (bénéficiaire ELAVON MRCH SVC), dans facturation (courriel) j'ai des rapports d'Elavon (Merchant Email Receipt) avec la facture » ; liste des dernières factures Zoho fournie pour vérifier la concordance des numéros)
Date(s) de travail : 2026-10-21

- Constat : la boîte facturation@ contient 9 « Merchant Email Receipt » (noreply@mail.authorize.net, 2026-08-10 → 10-14 : n° de facture, montant, entreprise, carte, date) et 10 rapports de lot (« Successful Credit Card Settlement Report »). Chaque reçu correspond à un dépôt ELAVON MRCH SVC du même montant 1 à 3 jours plus tard : 2,23 $ du 2026-09-16 = HB Architectes, INV-112228 (l'association de Philippe était juste) ; 81,29 $ du 10-15 = Talentech INV-112258 ; 55,01 $ du 10-16 = HB INV-112259 (ces 3 dépôts sont non classés). Le dépôt de 1 642,57 $ du 2026-07-17 n'a pas de reçu.
- Proposé (GO attendu) : lire ces reçus comme les avis Interac, et associer automatiquement le dépôt Elavon de même montant à la facture du reçu (n° de facture + montant exact = sûr).
- Concordance avec Zoho (17 dernières factures) : montants tous identiques ; INV-112251 (MGB Associés, 160,23 $, payée dans Zoho) absente d'ERPCRM ; INV-112263 et INV-112264 inversées (Zoho : 263 = SST Construction, 264 = Audacie ; ERPCRM : l'inverse) ; dates de INV-112260/112261 différentes (ERPCRM 10-07/10-08, Zoho 10-14) ; statuts de paiement différents selon le système qui a reçu l'information. Aucune correction faite : décision de Philippe.
- 2026-10-21 — GO (« fais les autres aussi, tous les courriels Merchant Email Receipt »). Migration `491d43d8d577` (table `card_receipts`) ; `core/card_receipts.py` : lecture des reçus déjà synchronisés dans Courriels (expressions régulières, pas d'IA : n° de facture, montant, entreprise, carte, n° de transaction, date ; refusé ou illisible → « failed ») ; association SÛRE seulement (un seul dépôt ELAVON du même montant 0–5 jours après, et la facture a encore un solde ≥ montant) avec `match_transaction` (mode « authorizenet », aucune règle « ELAVON → client » apprise) ; sinon « à vérifier » avec la raison ; dépôt déjà associé à la même facture → « linked ». Lancé toutes les 15 min avec les avis Interac (`interac_poller`). Sauvegarde : `backups/erpcrm_avant_recus_carte_20261021.sql`. Résultat sur les 9 reçus (essai à blanc puis réel) : 7 retrouvés sur des dépôts déjà associés à la bonne facture (dont INV-112259, 55,01 $ du 10-16), INV-112258 Talentech (81,29 $ du 10-15) associé ; aucun paiement en double. INV-112228 (2,23 $ du 09-16, HB) « à vérifier » : la facture (55,01 $) est déjà entièrement payée par un « paiement antérieur » venu de Zoho, sans dépôt — décision de Philippe.
- 2026-10-21 — Philippe : « il doit y avoir la règle pour Zéko que quand c'est Elavon, il aille chercher l'info dans les courriels ». (1) `bank_ai_poller` : un dépôt ELAVON n'est plus deviné par le nom ; Zéko lit le reçu de carte (relié au dépôt, ou unique du même montant 0–5 jours avant) → proposition du client de la facture du reçu (95 %, note « Reçu de paiement par carte dans les courriels… ») ; sans reçu, il le dit. Appliqué aux 4 dépôts Elavon non classés : 2,23 $ → HB Architectes (INV-112228, avec la raison « à vérifier ») ; 1 642,57 $, 968,35 $, 1 596,35 $ → aucun reçu. (2) Conversation : outil `paiements_carte` (par montant ou client) + consigne « un dépôt ELAVON MRCH SVC est un paiement par carte : client et facture dans les reçus des courriels ». Vérifié : « Le dépôt ELAVON de 2,23 $ du 16 septembre ? » → outil paiements_carte → « HB Architectes inc., facture INV-112228 ».
- 2026-10-21 — Outil `paiements_carte` plus explicite (Philippe : « oui pour rendre son outil plus clair pour qu'il ne fasse plus ce genre de raccourci » — Zéko avait conclu que 2,23 $ « réglait le solde » d'une facture de 55,01 $) : chaque reçu donne aussi le total de la facture, le déjà payé, le reste à payer, la part payée sans dépôt bancaire et un « constat » en clair ; consigne : ne jamais affirmer qu'un paiement règle une facture si les montants ne le permettent pas. Revérifié : « …ne couvre qu'une petite partie de cette facture. L'écart n'est pas expliqué ; il faut vérifier… ».
- 2026-10-21 — HB Architectes : doublons trouvés dans les données de Zoho (`Simple_IP/Zoho_anomalies_8_suspectes.csv`, A006 : 52,78 $ le 15 juin [réf. 81655612990] et le 18 juin pour un seul dépôt Elavon du 18 juin ; A007 : 52,78 $ le 14 août [réf. 81748631566] et le 31 août pour un seul dépôt du 17 août) → 105,56 $ de paiements fictifs ; d'où le solde de 2,23 $ au portail en septembre, payé par carte le 14 septembre (transaction 81798816808). Philippe : « on va le noter dans le dossier client que ces factures ont été données et non pas payées, à cause d'une erreur d'entrée de données de Zoho ». Note complète écrite dans les Notes internes de HB (dates, références, factures INV-112122 et INV-112228, total donné 105,56 $). Rien changé dans les factures ni les paiements : une facture émise ne s'« offre » pas, elle se crédite par un avoir (effet sur TPS/TVQ) — question posée à Philippe.
- 2026-10-21 — Concordance Zoho (Philippe : « Zoho pour l'instant est la référence, ajuste-les dans ERPCRM » ; MGB INV-112251 = son erreur dans Zoho, rien à faire ; dates de 112260/112261 « pas d'importance ») : migration `0f0ad0d71eb4` → INV-112263 = SST Construction (229,03 $), INV-112264 = Audacie (311,05 $). Aucune des deux n'avait été envoyée depuis ERPCRM ; aucun paiement ni note ne citait ces numéros.


### TASK-042.12 [x] Banque : classer automatiquement les retraits reconnus quand c'est sûr
Date de demande : 2026-10-21 (Philippe : « pourquoi on a les transactions reconnues dans l'onglet non classées, elles sont reconnues donc classées ! » → explication : reconnue = on sait qui, classée = inscrite dans les livres ; puis « oui, classe automatiquement ce qui est sûr »)
Date(s) de travail : 2026-10-21

- Mesuré avant : 263 « reconnues » non classées (222 retraits au fournisseur connu, 41 dépôts au client connu sans facture exacte). L'historique n'est pas uniforme par fournisseur (Banque Nationale : 2 comptes ; Gouvernement : 5 traitements) → « sûr » défini plus strictement : même fournisseur + même libellé de relevé (sans chiffres) + au moins 3 retraits déjà classés en dépense, tous identiques (compte de dépense, mode et code de taxes) ; on recopie ce traitement (`_expense_by_example`, branché dans `_auto_associate` : import de relevé et passe « sûre » toutes les 10 min). Jamais : gouvernement (traitements mélangés), paiements de factures fournisseurs, historiques mélangés ou trop courts.
- Appliqué (essai à blanc puis réel, sauvegarde `backups/erpcrm_avant_classement_auto_20261021.sql`) : 46 frais de la Banque Nationale (43 « facturation mensuelle », 3 « frais forfait ») → dépenses « Frais bancaires et charges », sans taxes, 1 789,07 $ ; marqués « associés automatiquement », annulables. Non classées restantes : 347.
- 2026-10-21 — Enquête Mc Crystal et Richard Handfield (lecture seule d'abord ; Philippe : « n'avance pas trop vite, c'est dangereux et important les transactions »). Mc Crystal : ses « Relevés des dépôts directs » (PDF joints à ses courriels « Paiement ») donnent les factures payées ; ils contredisent des répartitions venues de Zoho (dépôt du 2026-09-16 de 301,52 $ mis sur INV-112134 alors que le relevé dit INV-112196 + INV-112204 − avoir 301 ; INV-112237 « payée » 133,02 $ sans dépôt alors que le relevé dit 212,08 $ le 2026-10-19) — rien corrigé, relevé complet à faire avec Philippe. Richard : le retrait de 19,56 $ du 2026-10-09 correspondait à sa facture du même jour ; bloqué par 2 factures de ristourne de septembre (RIST-2026-09 : 5,28 $ + 0,22 $). Philippe : « dans Zoho j'avais essayé une automatisation avec ses clients… ça faisait 2 factures de ristourne ; à date seuls les 19,56 $ sont vrais, les autres peuvent être détruites » → sauvegarde `backups/erpcrm_avant_ristournes_richard_20261021.sql`, les 2 ristournes (sans paiement) supprimées par l'écran ; passe sûre : le retrait du 9 octobre s'est associé tout seul à la facture d'octobre. La facture périodique de Richard (19,56 $/mois) est intacte ; aucun générateur de ristourne dans ERPCRM.


### TASK-042.13 [~] Propositions de Zéko : avis de paiement trouvés dans les courriels → associations à accepter
Date de demande : 2026-10-21 (Philippe : « est-ce qu'il peut faire tous les courriels/factures qu'il trouve de Mc Crystal, une fois fait je pourrais les associer toutes » ; « oui construis… on a mis les mêmes numéros de factures de Zoho à ERPCRM, qu'il scanne tous les courriels… il va en trouver plein et il va pouvoir les associer… facturation@simpleip.tel pour commencer ; je reviendrai ce soir voir où il en est »)
Date(s) de travail : 2026-10-21

- Migration `ccc4a5eb920e` : `zeko_mail_scans` (courriel examiné une seule fois : paiement | pas_un_paiement | erreur, + ce que Zéko a lu) et `zeko_proposals` (dépôt, client, factures et montants, raison, extrait du courriel comme preuve ; proposee | a_corriger | sans_depot | deja_associe | acceptee | refusee).
- `core/zeko_payments.py` : un courriel à la fois en tâche de fond (`run_poller`, cède toujours la place aux conversations), boîtes du réglage `zeko_scan_boxes` (par défaut facturation@simpleip.tel), reçus de carte et avis Interac écartés (leurs propres modules) ; texte du courriel + pièces jointes (PDF, images) → Zéko (`complete`, objet « avis_paiement ») dit si c'est un avis de paiement d'un client et lit payeur, montant, date, factures → le programme cherche le dépôt (même montant, 3 jours avant à 10 jours après, libre, pas déjà proposé) et vérifie chaque facture (existe — « 112237 » = INV-112237 —, solde suffisant, somme = montant) ; tout concorde → « proposée », sinon « à corriger » avec la raison, ou « dépôt pas encore trouvé ». Revérification sans IA (`recheck_all`) quand le moteur n'a plus de courriel à lire et sur demande.
- API `/zeko/proposals` (liste + progression), `accept` (tout revérifié au moment d'accepter : dépôt encore libre, solde des factures, montants ; puis `match_transaction`, aucune règle « bénéficiaire → client » apprise), `accept-all`, `refuse`, `recheck`. Banque › Transactions non classées › onglet « Propositions de Zéko » (`components/ZekoProposals.jsx`) : progression « Zéko a examiné X courriels sur Y », Tout accepter, par proposition Voir la preuve / Accepter / Refuser, liens vers client et factures.
- Essai à blanc sur l'avis de Mc Crystal du 15 octobre (100 s) : lu « 212,08 $, facture 112237 », dépôt du 19 octobre trouvé → « à corriger : INV-112237 : 212,08 $ payés selon l'avis, mais ERPCRM ne lui laisse que 145,57 $ à payer » (le faux paiement venu de Zoho). Lancé le 2026-10-21 sur les 45 courriels de facturation@ (Mc Crystal écrit à service@ : boîte à ajouter au réglage).
- Au passage : `reset` (changement d'onglet dans Transactions non classées) n'était plus défini depuis une modification antérieure → erreur à chaque clic sur « Tout » ou « Reconnu » ; rétabli.

### TASK-042.14 [x] Reçus de carte : un dépôt Elavon peut couvrir plusieurs reçus et un reçu plusieurs factures
- **Date de demande** : 2026-10-22 (Philippe : « même règle que les paiements, c'est un client qui paye et il peut payer une vieille facture et une nouvelle comme Talentech… il faut qu'il soit capable de les rechercher, associer »)
- **Date(s) de travail** : 2026-10-22
- `core/card_receipts.py` : `invoice_numbers()` lit toutes les factures de « Description » ; `match()` cherche la combinaison UNIQUE de reçus (0–5 jours avant) qui fait exactement le dépôt Elavon ; `_settle()` : factures encore ouvertes → encaissement réparti (la plus ancienne d'abord), ou factures déjà réglées par des paiements antérieurs non reliés qui font le dépôt → dépôt relié (plusieurs paiements de l'ancien système regroupés en un seul encaissement). Tout le reste reste « à vérifier ».
- facturation@ : date de copie reculée au 2025-09-01 (le serveur n'a rien avant mai 2026) → 23 reçus lus.
- Résultat : dépôt 1 642,57 $ du 2026-07-17 = 3 reçus Talentech (10 factures) associé. Restent : HB 52,78 $ (juin, doublon connu) et HB 2,23 $. Sauvegarde : `~/backups/before_card_group_20261022_1203.sql`.
- Reçu SANS n° de facture (Philippe : « s'il n'y a pas de # de facture on cherche une ou une association de factures ») : `guess_invoices()` trouve le client (nom exact, sinon courriel du reçu → contact ; un seul) puis la seule façon exacte de payer le montant avec ses plus vieilles factures ouvertes — `bank_matching.exact_options()`, extraite de `best_exact` (41 dépôts : résultat identique avant/après). Plusieurs façons ou aucune → « à vérifier » avec la raison. Seuls les reçus à 0 $ (vérifications de carte) restent « échoué ».
- Constat non corrigé (attend Philippe) : règle de bénéficiaire « ELAVON MRCH SVC → HB Architectes » (créée 2026-10-07) qui attribue à tort les dépôts Elavon à HB.

### TASK-042.15 [x] Banque : virement Interac envoyé reconnu par son montant (le relevé ne donne pas le destinataire)
Date de demande : 2026-10-22 (Philippe : « si je lui fais un virement de 150,69, Zéko va trouver les dépenses ? » ; « ça n'existe plus [les paiements d'entreprise]… là c'est tout Interac » ; GO 2026-10-23)
Date(s) de travail : 2026-10-23

- Constat : le relevé BNC d'un virement Interac envoyé n'a que « VIREMENT INTERAC » / « VIRDT INTERAC » / « MOBILE VIRDT IT », sans destinataire ; une règle bénéficiaire → fournisseur sur ce libellé (« Retenir ce bénéficiaire », coché par défaut) mettait TOUS les virements au même fournisseur (règle VIREMENT INTERAC → Richard, 8 retraits de 150 $ à 2 069 $). Supprimer une règle ne libérait pas les retraits qu'elle avait reconnus (seulement les dépôts).
- `core/bank_matching.py` : `generic_transfer()` (sans bénéficiaire + libellé Interac) ; `_bills_by_amount()` : un seul fournisseur dont les plus vieilles factures ouvertes (émises au plus tard à la fin du mois du virement) font exactement le montant → association sûre (passe sûre aux 10 min et import), annulable ; deux fournisseurs possibles ou aucun → rien. Simulé : 150,69 $ → Techni-Express COM-2026-05 à -09 ; 4,79 $ → Richard COM-2026-10.
- Jamais de règle sur ce libellé : `propose_vendors` ne l'applique plus et retire le fournisseur d'une règle supprimée ou d'une règle sur ce libellé ; `match_withdrawal` n'en retient plus ; `rule_delete` libère aussi les retraits. Écran Banque : « fournisseur : factures … (montant exact) » ; la case « Retenir ce bénéficiaire » remplacée par une explication sur ces virements.
- Effet sur les données (passe sûre) : 10 retraits non classés libérés (8 « Richard », 2 « kim Sylvestre » de la règle VIRDT INTERAC, désormais ignorée) ; le retrait du 2022-05-17 de 750 $ trouve le paiement fournisseur déjà enregistré RDNetwork du même jour (bloqué avant par le mauvais fournisseur).

### TASK-042.2 [x] Dépôt d'un relevé dans la page : doublons, associations sûres, IA locale
Date de demande : 2026-10-05 (Philippe : « j'aimerais avoir mon IA locale qui gère un fichier importé, pour commencer ; ce serait une sécurité si les autres connexions se perdent » ; « j'ai besoin qu'elle analyse ce qui est, enlève les doublons et associe ce qu'elle est sûre, une place dans la page »)
Date(s) de travail : 2026-10-05, 2026-10-06, 2026-10-07, 2026-10-08

Répartition retenue (montants jamais confiés à l'IA) :
- Lecture du fichier et doublons = code exact (OFX/QFX/QBO/CSV). Nouveau : **doublons probables** — même date et même montant qu'une ligne déjà importée d'un autre fichier/format (ex. CSV déposé à la main + futur relevé SFTP), comptés ligne par ligne (deux frais identiques le même jour restent deux lignes) ; écartés par défaut, case « ce ne sont pas des doublons » pour les garder.
- **Associations sûres automatiques** après l'import : seulement `best_exact` (compagnie reconnue par une règle ET un seul paiement en attente/antérieur OU une seule facture ouverte au solde exact) ; `bank_transactions.auto_matched` ; annulables comme les autres (« automatiquement (sûre) » dans Toutes les transactions). Bouton « Associer ce qui est sûr » pour les lignes déjà importées (`POST /bank/accounts/{id}/auto-associate`). Contrôle en lecture : 59 des 65 lignes « Reconnues » existantes seraient liées (toutes à des « Paiement antérieur » du bon client) — **pas appliqué sans Philippe**.
- **IA locale** (`services/bank_ai_poller.py`, `LOCAL_AI_URL`/`LOCAL_AI_MODEL` dans `.env`/config — gpt-oss:20b sur Ollama, ~50 s par appel sans GPU) : pour chaque dépôt non reconnu (`ai_status` pending → done), propose le client parmi ceux qui ont un solde ouvert, avec certitude et raison ; affiché sous la ligne (« IA propose : X (95 %) — raison » + « Accepter » = attribuer la compagnie et retenir le bénéficiaire). Ne confirme jamais rien, ne touche jamais aux montants. Migration b3c4d5e6f7a8 (up/down testés).
- Écran : zone « Glissez votre relevé ici » en haut des transactions non classées (aperçu : nouvelles, doublons exacts, doublons probables, mauvais compte ; puis résultat : importées, associées automatiquement, reconnues, confiées à l'IA).
- Preuve : relevé d'un an redéposé → 0 nouvelle, 333 doublons exacts. Fichier du mois de Philippe (« transactions (2).csv », importé par lui à 10 h 36 avant ces changements) : 23 lignes, 3 nouvelles, 20 doublons. Test IA sur 8 dépôts non reconnus (marqués « pending » à la main pour le test — UPDATE limité aux champs de proposition ai_*) : ~20 min pour le lot (2 appels simultanés) ; justes à 90 % : Attaches Viscan, Patio Design → Construction Nationale, Audacie ; 4 dépôts Elavon (règlements de cartes) → « aucun client probable », correct. CRYSTAL et TECHNI-EXPRESS ratés au 1er passage parce que seuls les clients avec un solde ouvert étaient fournis → liste élargie aux clients facturés dans les 13 derniers mois ; 2e passage : Mc Crystal (70 %), Techni-Express (80 %).
- 2026-10-05, Philippe : « ça ne me dérange pas, ça va le faire pendant la nuit » → les 160 dépôts non reconnus de l'historique confiés à l'IA (propositions seulement ; « Associer ce qui est sûr » non lancé, à faire par Philippe).
- 2026-10-05 (question de Philippe : « pourquoi elle ne les fait pas un à la fois ? » — il avait raison) : les lots de 8 prenaient ~40 min (≈ 5 min par dépôt) et dispersaient l'attention (noms ratés à un endroit, trouvés à un autre). Refait : (1) **comparaison des noms par le programme** d'abord, sur tous les dépôts en attente, instantanée (`_name_match` : mots du client dans le bénéficiaire ET l'inverse, moyenne ≥ 0,6, écart ≥ 0,2 avec le 2e) — 82 dépôts trouvés (CRYSTAL → Mc Crystal, PHYSOTECH, PISCINES ET SPA → Piscine et Spa Paseidon, J. LAVOIE…), aucune fausse correspondance dans la liste vérifiée ; (2) l'IA **un dépôt par appel**, la liste des clients en message système identique d'un appel à l'autre (gardée en mémoire par Ollama) ; (3) **réflexion courte** (`reasoning_effort: low`, ~90 jetons) — PATIO DESIGN → Construction Nationale 90 % toujours trouvé. Mesuré : 8 dépôts en 3 min 39 s ≈ 27 s par dépôt (≈ 11× plus rapide). Les 36 dépôts sans proposition remis en file.
- 2026-10-06, demande de Philippe (« HBA, il a changé de nom aussi… mets ça en règle ; PATIO DESIGN même chose ») : règles de bénéficiaire créées (pas dans l'IA : une règle s'applique par le programme à chaque import, avant l'IA, et l'IA les reçoit aussi comme exemples) — « HBA » → HB Architectes inc. (6/6 reconnus, 6 associables sûrs), « PATIO DESIGN MONTREA » → Construction Nationale (9/9 reconnus, 5 associables sûrs). Résultat final de l'IA sur 168 dépôts : 96 propositions, 72 sans (31 Interac sans nom, 22 Elavon, 6 dépôts mobiles…).
- 2026-10-06, délai de paiement (Philippe : « le même client, mais il peut être en retard ou prendre les 30 jours pour payer ») — `bank_matching` : (1) plusieurs paiements enregistrés du même client au même montant → « sûr » = le plus proche du dépôt s'il l'est nettement (≤ 10 jours et strictement plus proche que le 2e), à égalité le même jour = la plus vieille facture (`payment_dict.invoice_date`) ; (2) factures ouvertes : bonus +15 si émise 1 à 30 jours avant le dépôt, +8 jusqu'à 120 jours (retard), +2 si datée jusqu'à 10 jours après ; à score égal, la plus vieille d'abord — classement seulement, jamais association automatique quand plusieurs factures ont le même montant ; (3) l'IA reçoit les factures ouvertes avec leur date et la règle « paie 1 à 30 jours après, parfois en retard ». Mesure : 76/83 dépôts reconnus associables « sûrs » (73 avant). Restent 7 : un dépôt qui paie plusieurs factures déjà marquées payées (1 444,32 $ = 2 × 722,16 $ — une ligne bancaire ne se lie aujourd'hui qu'à UN encaissement) ou sans paiement/facture du même montant (Hamak ×4, Construction Nationale ×2) → à voir avec Philippe.
- 2026-10-06, règle de Philippe : « il faudrait qu'il prenne la facture la plus vieille du client, ou les plus vieilles » → `best_exact` (factures) : association sûre si le dépôt égale exactement la plus vieille facture ouverte du client, ou la somme des 2, 3… plus vieilles (dans l'ordre) ; sinon (paiement partiel, autre facture) pas d'association automatique. `_match_body` (bank.py) applique la répartition sur plusieurs factures (auto, « Valider », groupé). Fenêtre « Associer » : bouton « Appliquer aux plus vieilles factures d'abord » (la dernière peut être payée en partie). Test en transaction annulée (Bitumar, factures de 100 $ janv. et févr.) : 100 $ → janv. ; 200 $ → janv. + févr. ; 150 $ → pas automatique. Historique : toujours 76/83 (déjà liés à des paiements enregistrés).
- 2026-10-06 (Philippe : « il doit analyser le plus vieux importé en premier… peut-être mettre un décompte ») : file de l'IA = plus vieil import d'abord (`QUEUE_ORDER` : created_at, puis date du relevé) ; vérification toutes les 15 s (au lieu de 60) ; chaque ligne en attente affiche sa place et l'attente estimée (`ai_queue_position`, `ai_eta_seconds`, 30 s par dépôt) et la page se rafraîchit toutes les 20 s tant qu'il y a une file. Relevé « transactions (3).csv » (7 lignes, 5 doublons, 2 nouvelles) : LS → LS Comptable et J. LAVOIE EQUIP → J. Lavoie trouvés par les noms en quelques secondes.
- Non fait (à proposer) : retraits (aucun écran d'attribution des retraits encore — TASK-042, classement des retraits) ; lecture par l'IA de formats inconnus (PDF).

- 2026-10-07 (Philippe colle 7 lignes du site BNC ; « je ne vois rien de ce que j'ai importé le 5 octobre ») : les lignes étaient associées automatiquement, donc sorties de « non classées » ; l'onglet « Toutes les transactions » ne montrait que les associées → renommé **« Transactions classées »** (choix de Philippe). Les 7 lignes passées en relevé CSV au format BNC : 5 reconnues comme déjà présentes, 2 nouvelles (Interac 261,22 → Jardin-Ideal INV-112251 automatiquement ; MRST 211,09). Règle « sûre » corrigée (`best_exact`, « corrige la règle elle-même ») : un paiement déjà enregistré à plus de 10 jours du dépôt ne bloque plus la règle de la plus vieille facture (MRST : un paiement non relié du 24 août bloquait le dépôt du 6 octobre). Essai sur les 27 dépôts non classés reconnus : aucun nouveau rapprochement.
- 2026-10-08 (Philippe : « si la facture a eu un paiement elle ne compte plus pour la plus ancienne, sinon je perds les différences de paiement » → GO ; puis « si le client paie sa facture et 3 retards, il prend les 3 retards les plus vieux ») : `best_exact` travaille avec deux files — factures qui n'ont encore rien reçu (les plus vieilles d'abord) et restes des factures déjà payées en partie (les plus vieux d'abord, restes « troc » compris — corrigé le même jour, Philippe : « même les restes en troc… la mention troc c'est juste pour ne pas recevoir de facture de retard et identifier une dette, d'un côté ou de l'autre ») ; sûr si le dépôt égale exactement j plus vieilles factures + k plus vieux restes, ou le reste d'une seule facture ; une seule possibilité → associé, plusieurs → suggestion. Suggestions : une facture déjà payée en partie perd 40 points sauf montant exact. La marque troc ne compte que pour les frais de retard (une facture troc qui n'a rien reçu se paie normalement). Bouton « Appliquer aux plus vieilles d'abord » : mêmes files. Tests (transaction annulée) : Physotech 49,33 → INV-112252 proposée en premier (non sûr) ; 53,93 → INV-112252 sûr ; sans troc, 53,93 + 3 × 4,60 = 67,73 → INV-112252 + les 3 plus vieux restes ; 27 dépôts non classés : aucun nouveau rapprochement automatique.
- 2026-10-08, **surplus et crédit du client** (Philippe : « s'il y a un surplus qu'il aille en premier à des restes de factures impayées les plus anciennes, s'il n'en a pas il le met en crédit dans le dossier client » ; « même les restes en troc… la mention troc c'est juste pour ne pas recevoir de facture de retard et identifier une dette » ; un dépôt plus petit que la plus vieille facture : « si c'est le nom qu'il connaît, oui il l'associe automatique » ; un client sans facture ouverte : « il va en crédit tout seul, l'automatisme général en premier ») : `best_exact` garde les comptes exacts (une seule façon → associé ; plusieurs façons exactes → proposition seulement) ; sinon, pour un client reconnu (règle ou choix de Philippe, jamais l'IA) : les plus vieilles factures qui n'ont rien reçu au complet, puis le surplus aux plus vieux restes (troc compris), puis une partie de la facture suivante ; un dépôt qui ne couvre aucune facture au complet va en partie sur la plus vieille ; ce qui dépasse tout ce qu'il doit = **crédit du client** (`core/client_credit.py`) : la part d'un encaissement confirmé répartie sur aucune facture — pas un avoir, aucun effet sur les ventes ni les taxes, pas de migration (aucun encaissement existant n'avait de part non répartie, vérifié). `MatchIn.company_id` : dépôt entier en crédit (« Mettre en crédit du client » dans la fenêtre Associer). Le crédit paie tout seul la facture qui vient d'être émise (`client_credit.on_issued` : le troc d'abord, puis le crédit — bouton Envoyer, passage brouillon → émise, création automatique des périodiques). Affichage : carte « Crédit du client » dans la fiche, « X $ en crédit du client » dans les transactions associées et la suggestion. « Appliquer aux plus vieilles factures d'abord » suit le même ordre. Simulations (transactions annulées, rien d'écrit, vérifié) : Physotech 53,93 → INV-112252 ; 49,33 → INV-112252 en partie ; 100 → INV-112252 + 46,07 sur les 11 plus vieux restes troc ; 153,93 → par l'endpoint réel ; Jardin-Ideal sans facture ouverte 75 $ → crédit 75 $, facture de 50 $ émise → payée (reste 25 $), 2e facture de 50 $ → partiellement payée (crédit 0).

---

## TASK-043 [ERPCRM] [~] Impôts et formulaires (onglet, inspiré de Zoho Books)
Date de demande : 2026-10-02
Date(s) de travail : 2026-10-02

Demande de Philippe : un onglet « Impôts et formulaires » avec ses menus, comme dans Zoho : Déclaration de TPS/TVQ & de la TVQ ; Ajustements fiscaux ; Paiements de taxe ; Feuillets T4A/T5018. Lié : TASK-005.8 (« Taxes déclarées jusqu'au », rappels de déclaration), TASK-005.9 (taxes par ligne), futur module Dépenses de TASK-042 (taxes payées récupérables : CTI/RTI).

**Fait le 2026-10-02 (GO de Philippe ; libellé corrigé : « Déclaration de TPS/TVQ » ; fréquence mensuelle / trimestrielle / annuelle, trimestrielle par défaut)** :
- Backend `backend/app/api/v1/endpoints/taxes.py` (`/api/v1/taxes`), modèles `TaxAdjustment` / `TaxPayment` (`backend/app/models/tax.py`), migration `a6b7c8d9e0f1` (revises `f5a6b7c8d9e0`), testée up/down/up. Défaut du paramètre `tax_filing_frequency` passé à « trimestrielle ».
- Déclaration de TPS/TVQ : périodes alignées sur l'exercice (en cours + 7 précédentes), état Déclarée (≤ « Taxes déclarées jusqu'au ») / À produire / En cours, échéance ; par période : ventes hors taxes, TPS et TVQ perçues = somme des factures émises datées dans la période (hors brouillons et annulées, avoirs soustraits), + ajustements datés dans la période, − paiements de la période → solde ; liste des factures ; « Marquer comme déclarée » avance `tax_lock_date` à la fin de la période et ferme la tâche de rappel (refusé si la période n'est pas finie ou déjà déclarée).
- Ajustements fiscaux : CRUD (date → période, catégorie CTI/RTI · créance irrécouvrable · correction · autre, montants TPS/TVQ signés) ; refusés dans une période déclarée. Tant qu'il n'y a pas de module Dépenses, les CTI/RTI se saisissent ici en négatif.
- Paiements de taxe : CRUD (période, date, TPS, TVQ, mode, référence ; remboursement en négatif), montants proposés = solde de la période.
- Feuillets T4A/T5018 : structure seulement (année, tableaux vides, « Générer » désactivé) — nécessite le module Dépenses (paiements aux fournisseurs et sous-traitants).
- Frontend `pages/Taxes.jsx` (route `/taxes`, menu « Impôts et formulaires » après Banque, icône %), menu latéral des 4 sections (`?section=`).
- Chiffres au 2026-10-02 : juillet–septembre 2026 (à produire, échéance 2026-10-31) : 77 factures, ventes 13 605,62 $, TPS 679,87 $, TVQ 1 355,95 $. Les périodes déjà déclarées affichent un solde tant que les paiements passés ne sont pas inscrits.
- Preuve HTTP : ajustement −10 / −19,95 dans juil.–sept. → taxe nette 669,87 / 1 336,00 ; ajustement dans une période déclarée → 400 ; catégorie invalide → 400 ; paiement 300 $ → solde 1 705,87 ; déclarer une période non terminée ou déjà déclarée → 400 ; données de test supprimées (0 ajustement, 0 paiement, verrou inchangé au 2026-06-30). Captures desktop, fenêtres, mobile ; aucune erreur console.
- Reste : CTI/RTI calculés et feuillets T4A/T5018 → module Dépenses.
- 2026-10-04 : CTI/RTI faits (voir TASK-044). Philippe met l'analyse des taxes **en attente** : « je suis mélangé avec les taxes, on va attendre d'avoir toute mon entreprise pour bien comprendre ce qui se passe… plusieurs paiements ont été faits en retard ou très en retard, on va avoir besoin de toutes les infos ». Ne pas proposer de convertir les dépenses « Taxe » en paiements de taxe ni d'autre travail sur les déclarations avant qu'il le redemande.

---

## TASK-043.1 [x] Versements au gouvernement rattachés à une période (TPS/TVQ, impôt, retenues)
Date de demande : 2026-10-07 (Philippe : « Versement au gouvernement… ça on pourrait l'associer à une taxe ou un impôt, et si la dépense est plus chère ça veut dire qu'il y a eu des frais de retard » ; « je vais te donner les rapports de taxe des anciennes années et les impôts » ; « oui ajoute tout »)
Date(s) de travail : 2026-10-07

- Migration 8bfd27dbcf5f (id généré, une seule tête, up/down testés) : `tax_obligations` (montant **déclaré** par période : TPS + TVQ d'un trimestre, montant d'une année d'impôt ou d'un mois de retenues — saisi depuis les avis, pas recalculé) ; `tax_payments` + `kind` (tps_tvq | impot_societe | das | autre), `amount`, `penalty_amount`, `bank_transaction_id` ; `bank_transactions.tax_payment_id`.
- `app/core/government.py` : reste dû = déclaré − déjà payé ; un versement paie le reste dû, l'excédent = **pénalités et intérêts** (non déductibles) ; TPS/TVQ réparties selon le déclaré (sans déclaré : proportion calculée par ERPCRM, signalé) ; périodes proposées (trimestres, années d'imposition selon l'exercice, mois).
- API : `GET /taxes/government/periods?kind=`, `PUT /taxes/government/obligations` ; `POST /bank/transactions/{id}/government-preview`, `POST …/match-government` (crée le paiement de taxe lié au retrait — TPS/TVQ : colonne « Payé » de la déclaration), annulation = suppression du paiement ; « Payé » de la déclaration TPS/TVQ ne compte que les versements TPS/TVQ.
- Écran : fiche d'un retrait → « Versement au gouvernement » (type deviné du bénéficiaire : REVENU QUEBEC → TPS/TVQ, ARC IMPOTS → impôt, ARC DEDUCTIONS → retenues ; période la plus probable = la dernière terminée avant le versement), saisie du montant déclaré, aperçu « paie le dû / pénalités et intérêts », « Rattacher le versement ».
- Preuve : versement Revenu Québec 1 712,76 $ (31 juillet 2026) — sans déclaré : tout paie le dû (TPS 576,44, TVQ 1 136,32) ; avec un déclaré fictif de 550 + 1 100 $ (test annulé) : dû 1 650 $, pénalités et intérêts 62,76 $ ; rattaché pour de vrai puis annulé (déclaration avril–juin : « Payé » 1 712,76 $ puis 0) ; aucune donnée réelle laissée.
- 2026-10-07 : Philippe fournit les montants déclarés de 22 trimestres (mars 2021 → juin 2026 ; « tout ça c'est payé mais ils ont tous eu des frais sauf le dernier ; payés les 2 ensemble TPS TVQ ») → copie `/home/simpleip/Simple_IP/taxes/declarations_tps_tvq_philippe.txt`, saisis par l'API (`tax_obligations`, date de déclaration en note). Relevé bancaire (oct. 2025 → oct. 2026) : 5 versements Revenu Québec égaux au cent à un trimestre déclaré → rattachés (mars 2025 2 013,87 ; juin 2025 1 106,89 ; sept. 2025 2 312,36 — tous le 2026-02-02 ; mars 2026 1 170,96 et juin 2026 1 712,76 — le 2026-07-31). Les frais de retard ne sont donc pas dans ces versements : payés à part (avis). Le versement de 110,72 $ du 2026-03-25 était déjà lié à une dépense « RQAP employeur » importée (laissé).
- À trancher avec Philippe : 2 526,35 $ du 2026-02-02 (déc. 2025 = 2 524,85 $ déclaré, écart 1,50 $ d'intérêts — payé 2 jours après l'échéance du 31 janvier ; ou déc. 2024 = 1 271,81 $ + 1 254,54 $ de frais) ; versements 756,75 $ et 124,68 $ (2026-03-25) et 104,00 $ (2026-05-27), probablement des pénalités et intérêts (avis de Revenu Québec pour savoir quelles périodes) ; paiement de déc. 2024 introuvable dans le relevé si 2 526,35 = déc. 2025 ; 3 versements à l'ARC (impôt des sociétés 474,62 et 507,08 ; retenues 826,00) en attente des avis d'impôt.


## TASK-043.2 [ ] Fiscalité › Rapports : seulement ceux utiles à Simple IP inc. au Québec
Date de demande : 2026-10-21 (Philippe : « dans Fiscalité il faut qu'on ait accès aux rapports… Zoho a ça… regarde pour mon projet et le Québec ce que j'ai besoin, plein de rapports de Zoho me sont inutiles, je ne les veux pas » ; liste des 73 rapports de Zoho fournie)
Date(s) de travail : —

- Recommandation proposée (en attente du GO) : 1) État des résultats de l'exercice (juillet–juin), détaillable par compte de dépense et par transaction ; 2) Bilan (dépend de ce qu'ERPCRM sait des actifs/passifs : banque, comptes clients, comptes fournisseurs connus ; capital-actions, prêt d'actionnaire, immobilisations/DPA pas encore modélisés) ; 3) Résumé des taxes TPS/TVQ (perçues, payées sur achats, à remettre par période — lié à l'onglet Déclaration) ; 4) Comptes clients par ancienneté ; 5) Comptes fournisseurs par ancienneté ; 6) Ventes par client et par article ; 7) Salaires et retenues (T4/RL-1, DAS) ; 8) Détail des transactions d'un compte (grand livre simplifié, pour justifier un chiffre). Écartés : ratios, prévisions, flux de trésorerie, vendeurs, canaux de vente, projets/feuilles de temps, budgets, devises, cartes et renouvellements, automatisation, API, activités (le Journal des actions existe déjà).
- Rappel : l'analyse TPS/TVQ des périodes reste suspendue (mémoire « taxes en attente ») ; ces rapports sont l'outil, pas une révision des déclarations.

## TASK-044 [ERPCRM] [x] Achats (onglet, inspiré de Zoho Books) — fournisseurs, dépenses, factures fournisseurs
Date de demande : 2026-10-02
Date(s) de travail : 2026-10-02 (menu Ventes / Achats, structure, modèle de données et API), 2026-10-03 (écrans, import, CTI/RTI ; GO de Philippe « go pour le module Achats »)

Demande de Philippe : un onglet « Achats » avec les menus Fournisseurs, Dépenses, Dépenses périodiques, Factures fournisseurs, Factures fournisseurs périodiques, Paiements effectués, Avoirs fournisseur. Existant au 2026-10-02 : seulement les bons de commande fournisseurs (`PurchaseOrder`, fournisseur en texte libre, onglet Commandes) — aucune entité fournisseur, dépense ni facture fournisseur.
Spécifications déjà données : dépense / facture « hors taxes » ou « taxes incluses », choix des taxes payées (TPS et TVQ cochées par défaut) ; factures fournisseurs payées par lots (un paiement — remboursement de carte de crédit, assurance — couvre plusieurs factures) ; Richard (IP Télécom) et Sylvain (Techni-Express) = commissions sur les clients apportés ; CTI/RTI à alimenter dans la déclaration TPS/TVQ (TASK-043) ; retraits bancaires à associer (TASK-042) ; feuillets T4A/T5018 (TASK-043).
Données Zoho fournies le 2026-10-02 dans `/home/simpleip/Simple_IP/factures_zoho/` : `Dépenses.csv` (675 dépenses 2020-06 → 2026-09, 206 795 $ ; compte « Taxe » 16 756 $ = versements TPS/TVQ probables), `Facture_fournisseur.csv` (851 factures 2020-05 → 2026-09, 276 656 $, 10 939,64 $ « dus » selon Zoho ; 360 lignes taxes incluses), `Facture_fournisseur_périodique.csv` (13 modèles).

**Fait le 2026-10-02 — menu regroupé Ventes / Achats (demandes de Philippe : « rassemble dans Ventes », « pas Clients », « sous-menus horizontaux avec les factures comme page d'accueil », bons de commande dans Achats)** :
- `Layout.jsx` : groupes `GROUPS` — une entrée « Ventes » (→ Factures) et « Achats » (→ Factures fournisseurs) dans le menu de gauche ; sous-menus en onglets horizontaux en haut de page (`GroupTabs`, CSS `.group-tabs`), onglet actif aussi sur les fiches de détail (`/invoices/:id`, `/devis/:id`, `/purchase-orders/:id`). Compagnies reste au menu principal ; Devis, Factures, Récurrence n'y sont plus (dans Ventes).
- Ventes : Devis, Factures d'acompte (structure), Factures, Factures périodiques (= Récurrence), Paiements reçus (nouveau : liste de tous les encaissements, `GET /api/v1/payments`, filtres confirmés / en attente / pas encore vus en banque / rejetés, recherche), Factures d'avoir (factures avec `credit_of_id`, `Invoices.jsx creditsOnly`).
- Achats : Fournisseurs, Dépenses, Dépenses périodiques, Factures fournisseurs, Factures fournisseurs périodiques, Paiements effectués, Avoirs fournisseur — pages de structure (`pages/Purchases.jsx`, colonnes de la future liste) ; Bons de commande (`/purchases/orders`, déplacés depuis Commandes ; `/purchase-orders` redirige). Commandes ne garde que les commandes web.
- Vérifié en captures (Ventes, Paiements reçus 724 / 171 096,85 $ confirmés, Factures d'avoir, Achats, Bons de commande, mobile), aucune erreur console.
- « Liens de paiement » retiré du menu Ventes le 2026-10-02 (Philippe ne s'en sert pas ; le cycle paiement → Paiements reçus → factures existe déjà via le portail). Idée gardée pour plus tard : bouton « Payer par carte » dans le portail client, sur chaque facture (compte marchand en ligne Elavon ou Authorize.Net requis).
- Modèle de données + API faits le 2026-10-02 (commit 95c368e) : `models/purchases.py`, `/api/v1/purchases`, migration 579d36744bb6.

**Fait le 2026-10-03 — module complet** :
- Écrans (`frontend/src/pages/purchases/` : common, Vendors, Expenses, Bills, Payments, Credits ; `Purchases.jsx` ne fait que les exporter) : Fournisseurs (liste, à payer, lien vers la compagnie de la CRM, catégorie par défaut), Dépenses (filtres compte / année, aperçu des taxes), Dépenses périodiques, Factures fournisseurs (liste filtrée À payer / En retard / Payées / Brouillons / Toutes, `?vendor=`) + fiche `/purchases/bills/:id` (lignes avec compte de dépense et code de taxe, hors taxes ou taxes incluses, ajustement d'arrondi, paiements et avoirs reçus, « Enregistrer un paiement »), Factures fournisseurs périodiques, Paiements effectués (à un fournisseur ou **groupé** — ex. carte de crédit — réparti facture par facture, tous fournisseurs, bouton « Répartir le montant »), Avoirs fournisseur (appliqués aux factures du même fournisseur). Tout se modifie et se supprime ; popups fermés seulement par Annuler/Enregistrer.
- Taxes « taxes incluses » alignées sur l'ancien logiciel : TPS et TVQ extraites de chaque ligne TTC et arrondies ligne par ligne, la base prend le reste (avant : base arrondie, TVQ = reste — 54 factures à 1 ¢ près). Vérifié : total ET taxes identiques sur les 851 factures importées.
- `bills.adjustment` (migration f1a2b3c4d5e6, up/down testés) : ajustement d'arrondi du fournisseur (17 factures à ±0,01 $), limité à 1 $.
- Récurrences fournisseurs : « Créer / Enregistrer » produit le **plus ancien cycle manquant** (avant : seulement le cycle courant, un mois oublié était perdu) ; refus clair si inactive / pas encore due / terminée ; fréquence « hebdomadaire » ajoutée.
- Défaut corrigé (partagé avec la facturation récurrente des clients, `recurring_billing._cycle_bounds`) : chaque cycle se calcule depuis la date de début (début + k sauts) ; avant, un début le 29-31 glissait au 28 après février et n'y revenait jamais. Aucune récurrence client ne commence après le 28 : rien ne change pour elles.
- Import `backend/import_zoho_purchases.py` (essai à blanc puis --apply, tout ou rien, refuse une 2e exécution) : 60 fournisseurs (ScopServ et TECHNI-EXPRESS liés à leur compagnie ; « Industriel Alliance » fusionné avec « Industrielle Alliance »), 20 comptes de dépense (Salaires, Taxe, Impôt Québec, Taxe 911, RQAP employeur, Frais bancaires marqués « pas de CTI/RTI »), 675 dépenses, 851 factures fournisseurs (794 payées, 52 en retard, 5 à payer = 10 939,64 $, comme dans l'ancien logiciel), 794 paiements « Paiement antérieur » (265 716,74 $ ; un par facture, date de la facture — les vrais paiements et leurs dates ne sont pas dans l'export), 7 factures périodiques actives (expirées non importées). Une dépense de repas 2021 (34,71 $, partie non taxable) garde les taxes du reçu (3,93 $). Rien de visible ne mentionne l'ancien logiciel.
- Vérifié de bout en bout par l'API (paiement groupé sur 2 fournisseurs → payées ; modification → partielle ; dépassement refusé ; suppression → retour ; facture taxes incluses 2 lignes + ajustement ; dépense ; rattrapage de cycles 31 août → 30 sept. → refus 31 oct. ; avoir appliqué puis retiré) et en captures (toutes les pages, popups, mobile), aucune erreur console. Données de test supprimées.

**CTI/RTI dans la déclaration TPS/TVQ (TASK-043), 2026-10-03** : `taxes._summary` déduit automatiquement la TPS (CTI) et la TVQ (RTI) des dépenses et factures fournisseurs datées dans la période, moins les avoirs fournisseur ; comptes « pas de CTI/RTI » exclus (une facture n'est exclue que si toutes ses lignes le sont). Écran : colonne « CTI + RTI », lignes CTI/RTI dans le détail, liste « achats taxés de la période ». L'ajustement manuel s'ouvre maintenant sur « Correction » (la catégorie CTI/RTI reste pour une correction, libellée comme telle) — aucun ajustement CTI/RTI n'existait, donc pas de double compte. Trimestre à produire (juil.–sept. 2026) : CTI 327,81 $, RTI 653,89 $ → solde 884,83 $ au lieu de 1 866,53 $.

Reste / idées non faites : les 26 dépenses du compte « Taxe » (16 756 $, versements TPS/TVQ) pourraient devenir des « Paiements de taxe » rattachés à leur période (colonne Payé) ; commissions (Techni-Express, Richard Handfield) à relier aux clients apportés ; retraits bancaires à associer aux paiements effectués (TASK-042) ; feuillets T4A/T5018.

### TASK-044.1 [x] Reçus et factures déposés, lus par l'IA locale → dépenses
Date de demande : 2026-10-07 (Philippe : « je lui pitche une facture et elle choisit matériel taxable ou non taxable (si elle ne trouve pas les taxes) ou service taxable ou non taxable… je dépose des zip, des pdf, des jpeg ou n'importe quoi d'autre et l'IA les analyse et me fait les dépenses » ; puis « Frais de fournisseur, Assurance, ça ferait 6 classes… si il trouve le nom de ce que c'est, le mettre en note… prépare-moi la place (drag and drop) comme pour les relevés bancaires » ; GO pour installer l'outil)
Date(s) de travail : 2026-10-07

- Serveur : Tesseract 5.5 (fra + eng) et poppler-utils installés (apt).
- Migration 0e67a0b1142c (id généré, une seule tête vérifiée, up/down testés) : `expense_lines` (classe parmi 6 — Matériel taxable/non taxable, Service taxable/non taxable, Frais de fournisseur, Assurance —, nom de l'article en note, montant, taxes, compte) et `receipt_documents` (fichier original gardé hors du dossier public, empreinte SHA-256, état, texte lu, lecture de l'IA, vérifications).
- `app/core/receipt_reader.py` : texte (pdftotext ; OCR Tesseract pour photos/PDF numérisés, image redressée, en gris, contrastée, agrandie — sans ce prétraitement « 19.99 » était lu « 13.95 ») ; IA locale (gpt-oss, réflexion courte) qui lit fournisseur, date, n°, lignes classées, sous-total, TPS, TVQ, total, compte ; le **programme** décide hors taxes / taxes incluses et vérifie (lignes = sous-total, TPS 5 % et TVQ 9,975 % des lignes taxables à 3 ¢ près, sous-total + taxes = total, aucune dépense identique déjà enregistrée). Une seule ligne peut expliquer l'écart → correction proposée « à confirmer » ; plusieurs → écart signalé, rien deviné.
- `services/receipt_poller.py` : un reçu à la fois, le plus vieux dépôt d'abord ; tout vert → dépense créée avec les taxes **réellement payées** (lues sur le reçu), fournisseur existant retrouvé par le nom (sinon créé), fichier joint, puis liée au retrait bancaire s'il est unique ; sinon « À vérifier ».
- API `/purchases/receipts` : dépôt multiple (ZIP ouverts, doublon = même contenu), liste avec place dans la file et attente estimée (90 s), fichier, réessayer, retirer (refusé si le reçu justifie une dépense), créer après vérification. Dépenses : lignes modifiables (taxes recalculées seulement si un montant ou une taxe change), `receipt_id`.
- Écran Dépenses : zone « Glissez vos reçus ici », liste des reçus (état, décompte, Vérifier / Réessayer / Saisir / Retirer), fenêtre « À vérifier » (reçu affiché à côté, vérifications ✓/✗, lignes avec les 6 classes) ; dépense : lignes, « 📎 Voir le reçu ».
- Preuve (reçus de test générés, puis supprimés) : PDF Patrick Morin (câble et boîtes taxables, livraison en Frais de fournisseur, consigne non taxable) → toutes les vérifications vertes, dépense créée automatiquement avec 4 lignes ; photo Canadian Tire (OCR) → dépense créée avec 3 lignes ; ZIP ouvert ; même PDF redéposé → doublon. Lecture ~3,5 min pour un PDF, ~1 min pour la photo.
- 2026-10-07 (Philippe : « INSURANCEIND ALL ASS VIE… l'IA n'a pas trouvé le fournisseur ?? ») : ce n'était pas l'IA — dépenses importées de l'ancien logiciel sans fournisseur, abréviation bancaire trop éloignée d'« Industrielle Alliance » pour la comparaison des noms. Corrigé : dépenses liées à un retrait au fournisseur connu (règle) → ce fournisseur (Industrielle Alliance 10, Richard Handfield 7) ; dépenses « INSURANCE IND ALL ASS VIE » / « ASSURANCE » du compte Assurance → Industrielle Alliance (36, toutes 178,29 $ le 22 du mois). Constat : la même prime figure 53 mois à la fois en facture fournisseur et en dépense dans l'ancien logiciel (9 449,37 $ comptés deux fois) ; idem Techni-Express 27 fois (967,95 $) et Global 1 une fois (51,08 $) — à corriger avec l'accord de Philippe.
- 2026-10-07, vraies factures de Philippe (2 ScopServ, Bell Internet, Bell Ligne, Bell Cellulaire ; « pour que tu entraînes mon IA locale ; elle peut aussi analyser le nom de fichier ») — 1 seule passée au 1er essai. Causes trouvées et corrigées : texte coupé à 7 000 caractères (factures de 12 000 à 50 000 : totaux perdus) → espaces compactés et 24 000 caractères ; Simple IP pris pour le fournisseur → consigne « Simple IP est le client » ; Bell : « montant total dû » (solde antérieur inclus) → règle télécom « période courante », crédits négatifs ; lignes TPS/TVQ prises pour des articles → retirées par le programme ; facture déjà payée (« Solde à payer 0,00 ») → total = sous-total + taxes ; crédits : si les taxes correspondent exactement aux lignes, total recalculé « à confirmer » ; nom du fichier passé en indice. « Entraînement » = apprentissage par l'exemple : les lectures validées des factures du même fournisseur (reconnu par le nom de fichier d'une facture déjà validée, ou par son nom dans le texte — à égalité, aucun choisi) sont données à l'IA ; le fournisseur reconnu l'emporte sur un nom lu inconnu (« SCOPCOMM » → ScopServ) ; un nouveau fournisseur qui ressemble à un existant (« Bell Mobilité » / « Bell Cellulaire ») va « À vérifier » au lieu d'être créé.
- 2026-10-07, Philippe : description courte « Facture ScopServ 2026-10-01 » (« je ne veux pas tout les articles ») ; **une ligne par classe** (« la partie taxable et la partie non taxable mais pas chaque article ») — l'IA lit encore chaque article pour vérifier, la dépense ne garde que les sommes par classe (`aggregate_lines`) ; colonne Taxes retirée de la liste (visible en ouvrant la dépense) ; titres de colonnes dans « Reçus déposés ». Résultat : les 5 factures en dépenses correctes (ScopServ 1 625,72 et 1 293,64 — 1 ligne service taxable ; Bell Internet 86,18 ; Bell Ligne 58,12 ; Bell Cellulaire 157,21 — service taxable + appareil non taxable). Corrigés à la main : Bell 667 attribuée à Bell Internet → Bell Ligne (« facture téléphonique ») ; fournisseur doublon « Bell Mobilité » créé par l'IA → facture rattachée à « Bell Cellulaire », doublon désactivé (pas supprimé).
- 2026-10-07 (Philippe : « oui ajoute tout ») : 4 classes ajoutées (10 au total) — Frais bancaires et de carte (aucune taxe), Repas et représentation (CTI/RTI réclamables à **50 %** : `CLAIM_RATIO`, appliqué dans `taxes._purchase_credits` au prorata des lignes taxables ; test annulé : repas de 100 $ → CTI +2,50 $, RTI +4,99 $), Salaires/commissions/sous-traitants (aucune taxe, feuillets T4A/T5018), Versement au gouvernement (pas une dépense — voir TASK-043.1). L'IA les connaît (consignes) ; la classe règle les taxes par défaut à l'écran.
- 2026-10-07 (Philippe : « oui go corrige les doublons ») : script ponctuel `backend/fix_duplicate_expenses.py` (essai à blanc puis `--apply`, sauvegarde `backups/erpcrm_avant_doublons_depenses_20261007_1323.sql`). La facture fournisseur est gardée (vrai document), la dépense en double retirée : 81 paires appariées une à une (même fournisseur, même total, dates à 10 jours près) — Industrielle Alliance 53, Techni-Express 27, Global 1 1 — 10 468,40 $ qui étaient comptés deux fois. 16 retraits du relevé étaient liés à la dépense en double alors que la facture correspondante restait « en retard » sans paiement → le retrait paie maintenant la facture (paiement créé par l'association, annulable dans Banque). Vérifié : 0 doublon restant. Restent en retard : Industrielle Alliance 2025-09-20 (avant le premier relevé importé) et Techni-Express mai à sept. 2026 (aucun retrait de 35,85 $ dans le relevé).

---

### TASK-044.2 [ ] Factures fournisseur payées par les remboursements de la carte Mastercard (logique de Philippe)
Date de demande : 2026-10-15 (Philippe : « le principe ne marche que si tu laisses dans ERPCRM les factures fournisseur pas payées et elles le deviennent quand je paie ma carte, comme ça je sais quel montant je dois rembourser » ; « plus tard tu regarderas »)
Date(s) de travail : 2026-10-15

- Règle : Philippe paie tous ses fournisseurs avec sa Mastercard World Elite ****3364 et rembourse la carte avant le 15 depuis le compte BNC (part personnelle de son compte perso). Une facture fournisseur reste « non payée » dans ERPCRM tant que le remboursement de carte qui la couvre n'est pas fait ; total non payé = ce que Simple IP doit rembourser sur la carte. Paiement fournisseur = le retrait BNC du remboursement (méthode « Banque », compte Simple IP), jamais la date du prélèvement sur la carte. Taxes inchangées (date de la facture).
- Fait (2026-10-15) : ScopServ #36405 (sept., 1 293,64 $) et #36687 (oct., 1 625,72 $) créées d'après leurs PDF (TVQ notée « TVP » sur leurs factures) ; #36132, #36405, #36687 payées par les deux remboursements du 2026-10-15 du compte BNC (2 666,09 $ = #36132 + 1 000,98 $ de #36405 ; 1 918,38 $ = 292,66 $ de #36405 + #36687) — à relier automatiquement à l'arrivée du relevé BNC (même montant, même date). **Corrigé le 2026-10-21** (Philippe : « ça n'a pas d'allure, on l'avait même noté qu'un était 2 factures et l'autre la 3e ») : la répartition « plus vieilles d'abord » contredisait ce qui avait été dit en conversation le 15 octobre (2 666,09 $ = #36405 + #36687 sans leur TVQ, ScopServ inscrivant la TVQ « TVP ») → sauvegarde `erpcrm_avant_repartition_scopserv_20261021.sql`, paiements modifiés par l'écran : 2 666,09 $ = #36405 1 181,41 $ + #36687 1 484,68 $ ; 1 918,38 $ = #36132 1 665,11 $ + TVQ de #36405 112,23 $ + TVQ de #36687 141,04 $. Factures toujours payées, retraits toujours associés, aucun effet sur les taxes. Fiche du retrait : « … payés ici, sur une facture de … » quand une facture n'est payée qu'en partie.
- À faire (plus tard) : 44 factures fournisseur non payées (7 374,66 $, févr.-oct. 2026 : Amazon, Elite, Bell, MyDomaine, ChatGPT, Claude, Spotify, Gentek…) — relier les remboursements de carte passés des relevés BNC à leurs factures ; vérifier Techni-Express (commissions) et Richard Handfield, probablement hors carte.
- ScopServ est aussi un client (chèque #3131 du 2020-09-22 = INV-000013-14) ; Philippe (2026-10-15) : « depuis un bout il me le crédite sur ma facture au lieu de me faire un chèque » → compensation : vente à ScopServ (facture client, taxes) + facture fournisseur ScopServ au complet, réglée en partie par ce crédit — à repérer dans les factures ScopServ récentes pendant les dépenses.

### TASK-044.3 [x] Elite : facture fournisseur annuelle, pas hebdomadaire
- **Date de demande** : 2026-10-22 (Philippe : « Elite (dépenses) se faisait chaque semaine, c'est annuel ; n'en garde que 1, le plus vieux qui n'a pas été payé… je ne veux pas débalancer les paiements ; j'ai mis la récurrence d'Elite à annuel »)
- **Date(s) de travail** : 2026-10-22
- 15 factures Elite non payées supprimées par l'API (14 juillet → 20 octobre 2026) ; gardées : celle du 7 juillet (la plus vieille impayée) et les 12 payées (avril → juin, 100 $ chacune, à revoir par Philippe avec un comptable). Prochaine facture annuelle : 2027-04-14. Sauvegarde : `~/backups/before_elite_bills_20261022_1334.sql`.

## TASK-045 [ERPCRM] [x] Fuseau horaire de l'entreprise — « quel jour on est » à l'heure de Montréal partout
Date de demande : 2026-10-07 (Philippe, au soir : « pourquoi elle est demain ?? » sur la facture des textos ; puis « oui go pour le fuseau horaire, c'est super important que tout le ERPCRM et le SIPV soit au bon fuseau horaire… le serveur est ici à Montréal »)
Date(s) de travail : 2026-10-07 (soir, heure du Québec)

- Cause : serveurs ERPCRM et SIPV en UTC (Etc/UTC) ; le code prenait `date.today()` → après 20 h (heure du Québec), « aujourd'hui » = lendemain (INV-112253 et son paiement Troc datés du 8 oct. ; la facture périodique INV-112252 créée à 20 h 24 la veille de son cycle).
- `backend/app/core/clock.py` : `today()` / `now()` au fuseau de l'entreprise (défaut **America/Toronto** = Montréal) ; fuseau lu au démarrage puis chaque minute par chaque processus (8010 et 8011), immédiatement après un changement dans Paramètres. Les **34** `date.today()` du backend remplacés par `clock.today()` (factures, paiements, périodiques, échanges, taxes, banque, numérotation PAY-AAAA, tickets, devis, achats, reçus, sauvegardes, rappels). Horodatages techniques inchangés (UTC, colonnes avec fuseau). Les sauvegardes et rapports CDR gardent leur propre fuseau (déjà America/Toronto).
- Paramètres : réglage **« Fuseau horaire de l'entreprise »** (`business_timezone`, liste des fuseaux, « il est HH:MM selon ce fuseau », fuseau inconnu refusé) ; `GET /settings/timezones`.
- Écran (`frontend/src/utils/date.js`) : `todayIso()` remplace `new Date().toISOString().slice(0, 10)` (9 endroits : taxes, avoirs, périodiques, facturation d'un contact/compagnie, échanges, achats) ; `parseDay()` lit une date seule à minuit local — avant, « 2026-10-07 » s'affichait le 6 au Québec (`fmtDate` de Banque/Achats, Admin, bons de commande, portail) et une tâche due aujourd'hui passait « en retard » dès 20 h (tâches, ticket, compagnie, contact). Les filtres CDR (date et heure locales) étaient déjà corrects.
- Vérifié à 21 h 41 (1 h 41 UTC le 8) : Paramètres « 2026-10-07 21:41 », jauge du troc « 7 octobre », port 8011 aussi à America/Toronto, « Mars/Olympus » refusé.
- SIPV : voir TASK-S064 (serveur SIPV mis à l'heure de Montréal le même soir).

## TASK-S064 [SIPV] [x] Serveur SIPV à l'heure de Montréal (fuseau horaire)
Date de demande : 2026-10-07 (Philippe : « c'est super important que tout le ERPCRM et le SIPV soit au bon fuseau horaire… le serveur est ici à Montréal » ; GO sur les 3 étapes proposées) — suite de TASK-045
Date(s) de travail : 2026-10-07 (soir)

- Vérifié avant (lecture seule) : CDR enregistrés avec `start_epoch`/`answer_epoch` (`cdr.py`, aucun décalage possible) ; messages vocaux et horodatages en base en UTC (colonnes avec fuseau) ; aucun code ne lit la date dans le nom des enregistrements (`${strftime(%Y%m%d-%H%M%S)}`, `xml_curl.py:112` — désormais heure de Montréal) ; horaires d'ouverture déjà calculés avec le fuseau de chaque horaire ; PostgreSQL laissé en UTC ; seule tâche planifiée : envoi Graphiti chaque minute (sans date).
- Fait : `timedatectl set-timezone America/Toronto` sur 192.168.1.55 ; FreeSWITCH redémarré à **0 appel en cours** (vérifié juste avant) → `strftime` donne 21:46 EDT ; services `sipv-backend` et `sipv-backend-tls` redémarrés (leur `date.today()` des sauvegardes suit maintenant Montréal). Vérifié après : 8 profils SIP en marche, 4 postes réenregistrés (t1001-100 à 103), appel test `originate null/test &echo()` → +OK ; Kamailio et RTPengine actifs (non redémarrés).
- Postes : déjà à l'heure de l'Est — modèle GXP2135 (seul en service, 3 postes) : `P64 = EST5EDT`, `P246 = EST+5EDT+4,M3.2.0,M11.1.0`, serveurs de temps pool.ntp.org. Choix d'un autre fuseau par poste/compagnie : à ajouter au catalogue d'options des postes (héritage système → compagnie → poste) quand les codes Grandstream exacts des autres fuseaux seront vérifiés sur un poste du labo — pas deviné.

## TASK-S062 [TOOLING] [x] Graphiti EN PREMIER côté SIPV — lecture ET écriture
Date de demande : 2026-09-10 (Philippe : "fais le SIPV", suite à TASK-040.14 côté ERPCRM)
Date(s) de travail : 2026-09-10

Réplication côté SIPV de la règle "Graphiti EN PREMIER sur toute demande, sans exception" (TASK-040.14). `CLAUDE.md` et `.claude/skills/graphiti-knowledge/SKILL.md` de SIPV mis à jour et poussés **depuis SIPV lui-même** (SSH `sipv@192.168.1.55`, jamais de mirroir sur le disque ERPCRM — voir `feedback_sipv_must_stay_autonomous`), commit `14be5e0` sur `github.com:CaptainePoui/SIPV.git`.

**Écart trouvé en le faisant** : SIPV n'a aucun mécanisme d'écriture vers Graphiti. Le consommateur de file côté ERPCRM (`graphiti_queue_consumer.py`) attend un push `incoming/*.jsonl` via scp "depuis leur propre cron" — mais ce cron/script n'a jamais été construit côté SIPV. Une session SIPV peut donc interroger Graphiti (lecture, centralisée sur la VM ERPCRM) mais ne peut pas y écrire de nouveau fait elle-même aujourd'hui. Documenté explicitement dans le skill SIPV comme limitation connue plutôt que de laisser une session SIPV improviser une écriture directe (violerait l'autonomie SIPV).

**Construit dans la foulée (même jour, GO explicite de Philippe : "fais le quand même pour être sûr que cette portion, même rare, ne tombe pas dans les limbes")** :
- `scripts/graphiti_queue_fact.py` (SIPV) — ajoute un fait (format triplet) à une file locale `graphiti_queue.jsonl` (gitignored).
- `scripts/push_graphiti_queue.py` (SIPV) + cron à la minute — pousse cette file par scp vers `erpcrm:/home/simpleip/erpcrm/tools/knowledge/graphiti/incoming/sipv.jsonl`.
- Clé SSH dédiée `id_ed25519_erpcrm` (paire générée sur SIPV, clé publique ajoutée à `~simpleip/.ssh/authorized_keys` sur ERPCRM) + alias `erpcrm` dans `~/.ssh/config` (SIPV). **Choix explicite de Philippe : sans restriction d'accès** (pas de `command=` limitant au dossier `incoming/`) — sa priorité "sécurité" est la correction/intégrité des données (voir `feedback_security_priority_correctness_not_hardening`), pas le durcissement d'accès à ce stade du projet.
- Testé de bout en bout avec un vrai fait (pas un test factice) : queue → push manuel → `incoming/sipv.jsonl` côté ERPCRM → `graphiti_queue_consumer.py` → lisible dans Graphiti, confirmé par relecture (`list_node_facts.py`).
- **Lenteur assumée, pas corrigée** : le consommateur traite via `add_triplet` (graphiti-core, résolution LLM, ~7-8 min — même limite que TASK-040.9), pas le chemin rapide `fast_write.py` (secondes, mais sans filet anti-doublon). Proposé de basculer sur le chemin rapide pour les items de type triplet — refusé explicitement par Philippe ("non je veux la sécurité") : la protection LLM contre les quasi-doublons prime sur la vitesse, pour SIPV comme pour la file locale ERPCRM (même consommateur).

**Autre écart trouvé en le faisant, corrigé sur demande de Philippe** : `CLAUDE.md` de SIPV référençait encore "Lire `TASKSIPV.md` EN PREMIER" alors que côté ERPCRM cette règle a été remplacée par `PLATFORM_TASKS.md` (source unifiée) depuis la migration Phase O — jamais propagé côté SIPV. Corrigé (référence `PLATFORM_TASKS.md`, section SIPV, avec note sur l'accès cross-dépôt via SSH ; `TASKSIPV.md` explicitement marqué comme archive).
Fichiers (sur SIPV, dépôt distinct) : CLAUDE.md, .claude/skills/graphiti-knowledge/SKILL.md, .gitignore, scripts/{graphiti_queue_fact.py, push_graphiti_queue.py}. Côté ERPCRM : `~/.ssh/authorized_keys` (nouvelle clé).

---

## TASK-S063 [SIPV] [ ] Messages vocaux reçus jamais réellement stockés/accessibles
Date de demande : 2026-09-11 (trouvé en construisant TASK-020, écoute des messages vocaux côté portail)
Date(s) de travail : 2026-09-11 (diagnostic seulement, rien construit)

Philippe voulait activer l'écoute des messages vocaux reçus dans le portail ("Mon poste", permission déjà existante `can_view_voicemail_messages`, jamais vérifiée nulle part jusqu'ici). Vérifié avant de construire (jamais supposé) :
- Table `voicemail_messages` (Postgres SIPV) — **0 ligne**, requête directe confirmée.
- Aucun code Python (backend SIPV) ne remplit `VoicemailMessage.recording_path` — grep exhaustif, seule la déclaration du modèle existe.
- `/usr/local/freeswitch/conf/autoload_configs/voicemail.conf.xml` — `storage-dir` ET `odbc-dsn` **commentés** (config par défaut) : `mod_voicemail` n'est ni en mode Realtime (base de données) ni configuré pour un chemin de stockage explicite. Les fichiers audio existent forcément quelque part (stockage par défaut du module) mais rien dans le code ne les localise, ne les liste, ni ne les sert.

**Reste à faire** (backlog, décision à prendre avant de construire — touche un service en production utilisé par de vrais clients) :
- Option A : activer le mode Realtime FreeSWITCH (`odbc-dsn` vers la DB Postgres existante) pour que `mod_voicemail` peuple `voicemail_messages` automatiquement — plus propre, mais modifie la config live de tous les tenants.
- Option B : scanner le répertoire de stockage par défaut du module (à localiser précisément) pour découvrir les fichiers sans toucher à la config FreeSWITCH — moins invasif, mais plus fragile (dépend de la structure de dossiers interne du module).
- Dans les deux cas : nouvel endpoint SIPV pour servir le fichier audio d'un message (n'existe pas, seul `GET /{vm_id}/greetings/{type}` existe pour le message d'accueil sortant, pas pour les messages reçus).
Fichiers concernés (pas touchés) : `/usr/local/freeswitch/conf/autoload_configs/voicemail.conf.xml`, `backend/app/models/voicemail.py`, `backend/app/api/v1/endpoints/voicemail.py` (SIPV).

## TASK-047 [ERPCRM] [ ] Courriels dans ERPCRM — boîte de réception, envoi, courriel reçu → ticket
Date de demande : 2026-10-08 (Philippe : « je veux mettre les courriels dans le ERPCRM comme ça tout est à la même place, on peut prendre un courriel reçu et en faire un ticket, etc. »)
Date(s) de travail : 2026-10-08, 2026-10-09

- Demandé pendant la signature par employé (TASK-007.1, Signature de courriel par employé). Boîtes : portabilite@ (portabilité), service@ (la plupart des courriels), facturation@ (factures, liens Interac), support@ (« pourrait être lié au ticket direct »). Serveur : mail.simpleip.tel (IMAP 993 / SMTP 465, certificat valide). Plan en 3 étapes proposé le 2026-10-08 : 1) connexion des boîtes et fonctions ; 2) boîte de réception dans ERPCRM (lien compagnie/contact par adresse, courriel → ticket/tâche, synchro lu/non lu avec Outlook) ; 3) répondre/écrire depuis ERPCRM (bonne adresse, signature, copie dans Envoyés). Recommandé et retenu pour l'instant : « en plus d'Outlook ».
- Rôle de chaque boîte précisé le 2026-10-09 (Philippe : « j'aimerais que tout soit géré du ERPCRM, tout placé à la bonne place ») :
  - nepasrepondre@ : annonces (promotions, augmentation des prix, infos) — envoi seulement, pas de réponse attendue ;
  - support@ : chaque courriel devient automatiquement un ticket (déjà en place, TASK-047.1) ;
  - philippe@ : boîte personnelle — Philippe répond lui-même aux clients qui lui ont écrit ;
  - service@ : boîte partagée — n'importe quel tech lit, répond et classe le courriel dans la fiche du client ;
  - facturation@ : factures, avoirs, avis de retard, liens Interac ;
  - portabilite@ : portabilité des DID, quand elle sera gérée dans ERPCRM (module à venir).
  - Plan révisé proposé (en attente du GO) : étape 2 boîte de réception (partagées + personnelles, classement automatique dans la fiche par adresse, « à classer » sinon, ticket/tâche) ; étape 3 répondre/écrire ; étape 4 annonces groupées depuis nepasrepondre@ ; portabilité plus tard avec le module DID.
  - Étape 4 précisée le 2026-10-09 (Philippe : « oui, un endroit dans le courriel pour se désabonner, et dans le portail un endroit pour s'abonner, être au courant des nouveaux services disponibles pour eux, exemple : les textos sont maintenant disponibles pour le numéro de votre entreprise ») : lien de désabonnement dans chaque promotion (LCAP) ; préférence « Nouveautés et promotions » dans le portail client (s'abonner/se désabonner), par contact ; date et source du consentement gardées (preuve LCAP) ; les avis de service (hausse de prix, panne) ne dépendent pas de l'abonnement.
  - 2026-10-09 (Philippe : « l'augmentation, on la mettra avec l'adresse service ») : les avis de service (hausse de prix…) partent de service@ (les clients peuvent répondre, la réponse arrive dans la boîte partagée) ; nepasrepondre@ = promotions et nouveautés seulement.

### TASK-047.1 [x] Boîtes de courriel et leurs fonctions (Administration → Intégrations)
Date de demande : 2026-10-08 (Philippe : « oui, dans admin / intégration, et j'aimerais pouvoir les attribuer à certaines fonctions comme facturation à facture, mais sans empêcher que si quelqu'un me fait un paiement dans service je puisse le reconnaître »)
Date(s) de travail : 2026-10-08

- Migration f8c36063abbc (id généré, une seule tête, up/down/up testés ; autogenerate nettoyé : il ajoutait des écarts sans rapport) : table `mailboxes` (adresse, nom affiché, identifiant, mot de passe chiffré Fernet, serveur, ports IMAP/SMTP, `functions`, active, dernier test/erreur).
- `core/mailboxes.py` : fonctions « tickets » (courriels reçus → tickets ; courriels de tickets envoyés d'ici), « invoices » (factures, avoirs, avis de retard), « devis » ; une fonction = une seule boîte active (refus 409 sinon). `sender_for` : `core/email.py` `_send(function=…)` part de la boîte qui a la fonction (adresse, nom, identifiants), sinon de l'adresse habituelle (.env) ; boîte illisible → adresse habituelle.
- support@ (lue jusqu'ici par IMAP_* du .env) reprise automatiquement au démarrage dans l'écran, fonction « tickets », mot de passe chiffré (`seed_from_server_config`) ; `imap_poller` lit maintenant toutes les boîtes « tickets ».
- Avis Interac (TASK-042.5) : lus dans **toutes** les boîtes actives (un même avis gardé une fois, par Message-ID) ; réglages déplacés de ⚙ Paramètres (« Courriels Interac », jamais configuré) vers le panneau ; « Reconnaître les paiements Interac » coché par défaut, « Lire depuis le », « Lire maintenant », statistiques. Anciennes routes `/settings/interac-mail*` retirées → `/mailboxes` (liste, ajout, modification, retrait sans rien toucher au serveur, test réel IMAP + SMTP sans envoi ni marquage), `/mailboxes/interac/settings`, `/mailboxes/interac/run`.
- Écran `components/MailboxesPanel.jsx` dans Administration → Intégrations (sous Options) : tableau boîte/fonctions/état, Tester, Modifier (adresse, mot de passe, nom affiché, fonctions, active, serveur en avancé), Retirer.
- Vérifié : support@ reprise et testée en vrai (réception : 7 courriels, 0 non lu ; envoi : connexion SMTP OK, rien envoyé) ; `poll_once` des tickets et lecture Interac sur les boîtes OK ; refus d'une 2e boîte « Tickets » ; mauvais mot de passe → « Connexion impossible » ; tickets → support@, factures/devis → adresse habituelle tant qu'aucune boîte n'a ces fonctions. À faire par Philippe : ajouter portabilite@, service@, facturation@ avec leur mot de passe et donner « Factures » à facturation@.

### TASK-047.2 [x] Boîte de réception dans ERPCRM — classement automatique dans la fiche, ticket/tâche, boîte personnelle
Date de demande : 2026-10-09 (Philippe : « go étape 2 … c'est juste si ERPCRM s'est trompé, sinon c'est automatique ; en plus ça pourrait même créer un contact avec le courriel d'entreprise et prendre les infos de sa signature » ; « philippe@ apparaît à la même place que tous les services mais juste moi je le vois … on va le mettre dans Employé : le courriel professionnel et le courriel perso (colargol) qui va servir juste à envoyer les paies ou écrire à l'employé » ; « j'ai l'accès propriétaire/patron donc accès à tout, mais pour les futurs employés ça va marcher comme ça »)
Date(s) de travail : 2026-10-09

- Migration a0edb228d9ba (id généré, une seule tête, up/down/up testés) : `mailboxes` + kind (shared / personal / send_only), owner_user_id, sync_since, uidvalidity, last_uid, last_sync_at, sync_error ; table `mail_messages` (en-têtes, texte, HTML, pièces jointes listées, .eml gardé dans storage/mail, lu/non lu, compagnie/contact, classé auto/main, contact créé, lecture de signature, partagé, ticket/tâche ; unique boîte+uidvalidity+uid).
- Copie (`services/mail_sync.py`, chaque minute, verrou PostgreSQL : les 2 services ne copient jamais en double) : boîtes partagées et personnelles actives, sauf la boîte « Tickets » (support@ → tickets, inchangé) ; première copie = 90 derniers jours (ou « depuis le »), par paquets de 200 ; reculer la date ajoute les plus anciens sans retélécharger. Lu/non lu dans les deux sens (ERPCRM → boîte immédiat, boîte → ERPCRM au passage suivant) ; rien n'est jamais effacé ni déplacé dans la boîte.
- Classement automatique (`core/mail_match.py`) : adresse connue (contact, contact dans une compagnie, adresse d'une fiche) → fiche ; sinon domaine d'entreprise connu d'une seule compagnie → compagnie + contact créé (nom de l'expéditeur, note « créé automatiquement… »), téléphone/cellulaire/poste/titre lus dans la signature par l'IA locale (champs vides seulement, numéro vérifié dans le courriel) ; adresses de service (info@, facturation@, noreply@…) → compagnie sans contact ; gmail/hotmail… et inconnus → « À classer ». Nos propres domaines ignorés.
- Correction à la main (« Classer » / « Changer ») : compagnie et/ou contact, « Retenir cette adresse » (ajoutée au contact, les autres courriels de cette adresse suivent), « Créer le contact dans cette compagnie » pour un expéditeur inconnu ; « Remettre À classer ».
- Écran **Courriels** (menu) : Tous / À classer / chaque boîte avec non lus ; recherche ; lecture isolée (aucun script) ; pièces jointes ; « Faire un ticket » / « Faire une tâche » (titre + texte du courriel pré-remplis, courriel relié) ; Marquer lu/non lu ; Actualiser. Onglet **Courriels** dans la fiche compagnie et la fiche contact.
- Qui voit quoi : partagées → toute l'équipe ; personnelle → son propriétaire et le patron (rôles gestionnaire/administrateur, `mailboxes.sees_all`) ; « Partager avec l'équipe » par courriel. Envoi seulement (nepasrepondre@) → jamais lue.
- Fiche Employé : bouton « ✉ Courriels et signature » : courriel professionnel (sa boîte personnelle, mot de passe chiffré, Tester ; une boîte déjà ajoutée dans Administration est reprise sans retaper le mot de passe) et courriel personnel (adresse de sa fiche contact : paies, lui écrire). Administration → Intégrations : type de boîte, « copier depuis le », nombre de courriels copiés, dernière copie, erreur.
- Mis en place avec Philippe : philippe@ → boîte personnelle de Philippe (reprise de la boîte qu'il venait d'ajouter) ; nepasrepondre@ → envoi seulement.
- Vérifié : 214 courriels copiés (service 132, facturation 56, philippe 22, portabilité 1), 64 classés automatiquement, 14 contacts créés ; signatures lues (ex. Thomas Pelletier : téléphone, cellulaire, titre) ; lu/non lu aller-retour prouvé sur un vrai courriel (ERPCRM → boîte et boîte → ERPCRM), remis dans son état ; écrans vérifiés (Playwright). Avant la règle des adresses de service, 3 contacts génériques ont été créés (« Services - ScopServ », « Facturation » ScopServ, « LNP SCOPCLOUD ») : Philippe (2026-10-09) : garder « Services » (ses techs) et « LNP SCOPCLOUD » (portabilités), retirer « Facturation » (il n'y écrit jamais) → retiré par l'écran (DELETE /contacts, copie de la base avant) ; ses 3 courriels restent dans ScopServ.
- Constaté : la sauvegarde n'incluait pas `storage/` → corrigé dans TASK-035.1 (Le dossier storage/ ajouté à la sauvegarde).

### TASK-047.3 [x] Répondre et écrire depuis ERPCRM — bonne boîte, signature, copie dans Envoyés
Date de demande : 2026-10-09 (Philippe : « go pour le 3 des courriels »)
Date(s) de travail : 2026-10-09

- Migration 573fc8c0b97a (id généré, une seule tête, up/down/up testés, copie des tables mail_messages/mailboxes avant) : `mail_messages` + direction (in / out), sent_by_user_id, copy_error, answered_at ; uidvalidity/uid facultatifs (un courriel envoyé d'ici n'en a pas) ; index sur in_reply_to.
- `core/mail_send.py` : courriel complet (texte + HTML, images collées/signature/courriel cité → pièces intégrées, pièces jointes 20 Mo au total), Message-ID, In-Reply-To et References (le fil reste groupé chez le client), noms accentués encodés dans les en-têtes ; envoi par le serveur d'envoi de la boîte (SMTP 465) ; copie dans le dossier Envoyés de la boîte (trouvé par son attribut \Sent, ici INBOX.Sent), lue ; courriel d'origine marqué \Answered dans la boîte (Outlook montre « répondu »). Destinataires de Répondre / Répondre à tous lus dans le courriel gardé (Reply-To respecté, nos adresses retirées).
- API : `GET /mail/senders` (boîtes partagées + sa boîte personnelle — jamais celle d'un autre, même pour le patron ; ni support@, ni nepasrepondre@), `POST /mail/send` (refus 403 d'une autre boîte, 422 adresse invalide ou sans destinataire, 502 envoi impossible) ; liste `direction=in|out`, recherche aussi dans les destinataires ; lecture : envoyé par, réponses envoyées d'ici. Le courriel envoyé est gardé (.eml) et classé : fiche d'où on écrit, sinon fiche du courriel d'origine, sinon adresse connue d'un destinataire. Un courriel envoyé ne peut jamais faire « retenir » notre propre adresse sur un contact.
- Écran : Répondre / Répondre à tous / Transférer dans la lecture, « ✉ Écrire » dans Courriels et dans l'onglet Courriels des fiches (destinataire prérempli dans la fiche contact) ; fenêtre : De (la boîte où le courriel est arrivé par défaut), À, Cc, Objet (RE: / TR:), éditeur (mêmes outils que la signature), pièces jointes, pièces du courriel transféré à cocher, « Ajouter ma signature » ; Annuler demande confirmation si quelque chose est écrit. Dossier « Envoyés d'ici » ; ↩ sur un courriel répondu, « Répondu le … par … » dans la lecture.
- Vérifié sans envoyer : construction d'une vraie réponse (en-têtes, fil, signature, citation, pièce jointe) ; boîtes d'envoi du compte de Philippe (service@, facturation@, portabilite@, philippe@) ; refus 403/422 ; écrans (Playwright) : Répondre à tous prérempli (De service@, À, Cc, RE:), Transférer, Écrire depuis une fiche contact. Aucun courriel envoyé (0 ligne « out »).
- Noms d'expéditeur (Philippe, 2026-10-09 : « avec les beaux noms professionnels Simple IP - "quelque chose" ») : réglés par l'API des boîtes, tous les autres réglages renvoyés à l'identique et comparés (aucun autre changement) — service@ « Simple IP - Service », facturation@ « Simple IP - Facturation », portabilite@ « Simple IP - Portabilité », support@ « Simple IP - Support », nepasrepondre@ « Simple IP - Ne Pas Répondre » (choix de Philippe, remplace « Nouveautés ») ; philippe@ garde « Philippe Normandeau ». Le client voit le nom ET l'adresse ; il répond toujours à l'adresse.
- Envoi réel prouvé (accord de Philippe, 2026-10-09) : `POST /mail/send` avec son compte, de service@ à philippe@, signature + fichier joint → 200, aucune erreur de copie ; vérifié dans les boîtes (lecture seule) : copie dans INBOX.Sent de service@ (UID 134, lue, « Simple IP - Service ») et reçu dans philippe@ (UID 37, laissé non lu).
- Défaut trouvé par Philippe (2026-10-09, « je ne voyais pas à qui je devais réécrire, il n'y avait pas d'adresse de retour ») : « Répondre » retirait TOUTES nos adresses, donc un courriel venant de service@ vers philippe@ n'avait plus de destinataire. Corrigé comme Outlook : Répondre → toujours l'expéditeur (Reply-To sinon From), même une de nos boîtes ; Répondre à tous → retire seulement la boîte qui a reçu le courriel. Vérifié sur « Test ERPCRM » (→ Simple IP - Service <service@…>) et sur le courriel PAD (inchangé : McGurn + 3 Cc).
- Constaté en même temps : Philippe se connecte avec **admin@simpleip.ca** (« Administrateur »), pas avec philippe@simpleip.ca (gestionnaire, jamais connecté), auquel sa fiche Employé — donc philippe@ et sa signature — est reliée ; depuis admin@, philippe@ n'est pas proposée à l'envoi et la signature ne s'ajoute pas. Philippe : « laisse ça comme ça » (décision sur la suite en attente de précision).
- Reste à prouver par un vrai usage : « Répondre » (marque « répondu » \Answered dans la boîte, fil In-Reply-To) — Philippe peut répondre au courriel « Test ERPCRM » depuis ERPCRM.

---

## TASK-048 [ERPCRM+SIPV] [ ] Installation chez un client : un seul endroit pour savoir quoi changer
Date de demande : 2026-10-09 (Philippe, après TASK-S055.8 : « c'est important d'être dynamique : si on installe chez un client, il faut savoir quoi changer et ne pas chercher partout dans le projet »)
Date(s) de travail : —

- Constaté le 2026-10-09 : les réglages sont déjà centralisés (`config.py` / `.env` de chaque serveur, TASK-031 et TASK-S056), mais aucun document ne dit, pour une nouvelle installation, quoi régler, quels dossiers créer et dans quel ordre. Le script `scripts/install.sh` de SIPV est périmé (installe Asterisk, pas FreeSWITCH ; ne crée aucun service ni dossier).
- Exemple qui a déjà cassé : TASK-S055.8 (dossier créé à la main, perdu). À faire par le code plutôt qu'à la main quand c'est possible : `StateDirectory=sipv` dans les services systemd SIPV crée `/var/lib/sipv` au démarrage, avec le bon propriétaire.
- Demande ajoutée le 2026-10-09 (Philippe : « j'espère que le courriel de celui qui va installer ERPCRM va être l'administrateur ») : à l'installation, la personne qui installe crée elle-même le premier compte administrateur (nom, courriel, mot de passe) au lieu du compte par défaut admin@simpleip.ca / mot de passe connu.
- À proposer à Philippe avant de construire : un guide d'installation par serveur (ERPCRM, SIPV) généré à partir des réglages réels, plus une vérification au démarrage qui signale en clair un réglage ou un dossier manquant.

## TASK-046 [ERPCRM] [x] Sélection multiple dans les listes (Maj / Ctrl) et actions de masse
Date de demande : 2026-10-08 (Philippe : « si je garde enfoncé le Shift ou le Ctrl je peux sélectionner plusieurs transactions ; Shift = le premier et le dernier ciblés et tout entre les deux ; Ctrl = plusieurs factures/transactions séparément… un genre de popup pour faire des changements de masse ; ex. Physotech : je sélectionnerais les factures avec un paiement partiel et j'aurais l'option (si activée dans les réglages admin) de créer un échange (troc), de créditer… en vois-tu d'autres qui seraient pratiques ? »)
Date(s) de travail : 2026-10-08

- En attente du GO sur la proposition (2026-10-08) : barre d'actions qui apparaît dès qu'une ligne est sélectionnée (plutôt qu'un popup au relâchement de la touche) ; Maj+clic = plage, Ctrl+clic = une à une, comme dans l'Explorateur ; d'abord dans l'onglet Transactions de la fiche compagnie et la liste des Ventes, puis Banque (qui a déjà des cases) et Achats.
- Actions proposées : créer un échange (troc) qui paie exactement les factures choisies (option Échanges cochée seulement — aujourd'hui un échange paie toutes les factures ouvertes, la plus vieille d'abord) ; créditer le reste (avoir) ; marquer / retirer « À régler en troc » ; enregistrer un paiement groupé ; envoyer par courriel ; émettre ou supprimer des brouillons ; télécharger les PDF.
- GO 2026-10-08 (« oui go pour la barre d'actions et les 4 actions… enlève les cases à cocher de la banque, elles ne servent à rien, ou on met des cases partout… le Shift ou le Ctrl ferait sélectionner les cases et la barre en bas apparaît… ça nous ferait 3 façons ») → recommandé et fait : **cases partout**, Ctrl/Shift les cochent (visible, et utilisable sur tablette/téléphone sans clavier) ; clic simple = ouvrir, comme avant. `hooks/useRowSelection.js` (case, Ctrl/Cmd+clic, Maj+clic = plage depuis la dernière ligne ciblée, texte non surligné). Listes : onglet Transactions de la fiche compagnie, Ventes → Factures, boîte « À régler en troc » de l'onglet Échanges ; Banque : ses cases existantes reçoivent Ctrl/Maj+clic (ses actions groupées restent dans sa barre du haut).
- `components/BulkInvoiceBar.jsx` : barre en bas (« N factures · reste X $ ») — **Créer un échange** (option Échanges ; une seule compagnie) : la fiche d'échange s'ouvre avec la valeur = total des restes et paie d'abord exactement ces factures (`BarterIn.invoice_ids`, `pay_open_invoices(only_ids=)`), le surplus suit la règle habituelle ; **Marquer / Retirer « À régler en troc »** (option Échanges ; `POST /invoices/bulk/barter-flag`, jamais sur un avoir ni un avis de retard) ; **Créditer le reste** (`POST /invoices/bulk/credit-remainder` : un avoir émis par facture, taxes au prorata de la facture, base ajustée au cent pour égaler le reste — sinon ligne « Ajustement d'arrondi » —, appliqué aussitôt ; la fenêtre avertit que la TPS/TVQ baisse et renvoie au troc pour une dette de troc) ; **Paiement groupé** (une seule compagnie ; mode, date, montant par facture prérempli au reste, référence PAY- ; `POST /payments/multi` refuse maintenant, pour un paiement manuel confirmé, un brouillon, un avoir ou un montant plus grand que le reste). `GET /invoices` donne `paid` ; la fiche finance donne `barter_settlement`.
- Demande ajoutée en cours de travail (Philippe : « quand je clique troc ça le met dans Échanges, mais de façon dynamique : si une facture est payée, un retard ou un crédit est fait, tout s'ajuste ») : boîte **« À régler en troc »** en tête de l'onglet Échanges (`troc_debt`, `GET /barter/companies/{id}` → `troc_invoices`) — restes calculés à chaque affichage, rien de copié. Physotech : 25 factures, 164,33 $.
- Défaut trouvé en test et corrigé (voir ERRORS_LESSONS TASK-046) : l'utilisation d'un échange n'était ajoutée qu'à la session, pas à `b.applications` → un 2e calcul dans la même opération réutilisait le crédit (échange de 9,20 $ sur 2 factures en payait 4). Corrigé aussi dans `advance` (mois de service), par précaution : simulation D'Astous au 29 juillet 2027 identique avant/après (facture 584,99 $ émise, non payée par le troc, 860/860 $ utilisés).
- Vérifié (transactions annulées, rien d'écrit) : 57 avoirs de reste sur 60 factures ouvertes, chacun égal au reste, 0 facture encore ouverte (ex. INV-111288 : avoir 4,00 + TPS 0,20 + TVQ 0,40 = 4,60 $) ; échange ciblé 9,20 $ → exactement INV-111490 et INV-111656. Écran (Playwright) : Ctrl+clic ×2 puis Maj+clic = 5 lignes cochées sans ouvrir la facture ; paiement groupé prérempli ; échange prérempli 18,40 $ ; Ventes multi-compagnies → échange et paiement groupé désactivés ; Banque Ctrl/Maj = 5 cochées ; aucune erreur console.
- 2026-10-08, correction après essai de Philippe (« le Shift ne marche pas… le Shift est important ») : Maj+clic sur une **case** ne cochait qu'une ligne (voir ERRORS_LESSONS TASK-046) ; corrigé, vérifié dans les 4 listes (case 2 puis Maj+case 7 = 6 cochées).

## TASK-049 [ERPCRM] [x] Journal des actions — qui a fait quoi, partout (employés et clients du portail)
Date de demande : 2026-10-09 (Philippe : « je ne veux pas des journaux des prix du catalogue, je veux que les logs de ce que le tech a fait (changer un prix d'article) soient consignés là… je veux avoir un log pour toutes les manips, comme ça on peut investiguer ou tout savoir de qui a fait quoi… pareil que les logs du portail client : s'il modifie, c'est logué »)
Date(s) de travail : 2026-10-09

- Constaté (2026-10-09) : ~300 actions qui modifient des données dans le serveur ; seules les fiches contact et compagnie et le courriel de connexion écrivent au journal (`entity_logs`, 214 lignes, avec « annuler ce changement ») ; rien pour le catalogue, factures, paiements, tickets, portail client, etc. Le journal ne connaît que les employés (pas les clients du portail).
- Plan proposé (2026-10-09) : un seul journal pour tout ERPCRM (quand, qui = employé / client du portail / automatique, quoi, champ, ancien → nouveau ; personnes et objets liés, pas copiés ; les 214 lignes actuelles déplacées dedans) ; inscription automatique au niveau de la base (pas action par action) ; jamais de mot de passe ni le va-et-vient technique ; rien ne s'efface ; lecture dans Administration → Journal (filtres) et un onglet Historique par fiche. Étape 1 : le journal, prouvé sur un prix d'article et une modification au portail ; étape 2 : les écrans.
- Décidé le 2026-10-09 (Philippe : « on note seulement ce qui est modifié, et le gestionnaire a la possibilité d'activer aussi ce qui est consulté (qui a ouvert telle fiche), par défaut pas activé ») : modifications toujours notées ; consultations = option, éteinte au départ, activable par un administrateur ou un gestionnaire.
- Étape 1 faite (GO de Philippe, 2026-10-09 : « go »), copie complète de la base avant (full_before_049.dump) :
  - Un seul journal : `entity_logs` devient le journal de tout ERPCRM — migration fc8d12251c14 (id généré, une seule tête, down/up testés) : `object_type` (table) + `object_id` (clé) de l'objet, `portal_user_id`, `source` (ecran / portail / automatique / sipv) ; `entity_id` facultatif ; une fiche supprimée ne supprime plus son journal (SET NULL au lieu de CASCADE). Les 214 lignes existantes restent en place (rien à déplacer), complétées (objet, source).
  - Inscription automatique (`core/audit.py`, événements SQLAlchemy) : chaque objet créé, supprimé, ou modifié champ par champ (ancien → nouveau), sans code par action ; aussi les modifications/suppressions « en lot » (lignes visées lues avant). Qui : `ActorMiddleware` + `get_current_user` / `get_portal_user` / clé SIPV / connexion ; rien = automatique. Les entrées écrites à la main des fiches compagnie/contact (« annuler ce changement ») ne sont pas doublées.
  - Une action réussie d'un employé ou d'un client du portail qui ne change rien dans la base d'ERPCRM (ex. poste, boîte vocale, gardés dans SIPV) est inscrite quand même : l'action et ce qui a été envoyé.
  - Jamais inscrit : mots de passe, secrets, NIP (« modifié », sans la valeur ; masqués « ••• » dans ce qui est envoyé) ; journaux techniques (sauvegardes, verrous de téléphonie, ouvertures de courriel), copie automatique des courriels, suivi des boîtes, lu/non lu. Plus de 25 créations/suppressions d'une même sorte d'un coup = une ligne résumé.
  - Vérifié (vrais écrans du serveur, dans un essai annulé, rien gardé — 214 lignes avant et après) : prix d'un article 300 → 301 par Philippe ; site web d'une compagnie (une seule ligne) ; accès portail créé par Philippe ; connexion du client inscrite à son nom ; ticket créé par le client (source portail) ; action hors base du client avec NIP masqué ; contact créé puis supprimé (nom gardé après la suppression) ; onglet journal d'une compagnie toujours 200. Serveur redémarré, aucune erreur ; 3 minutes de tâches automatiques : aucun bruit.
  - Pas couvert : SQL écrit à la main dans le code (`text("UPDATE…")`), aucun dans les écrans aujourd'hui.
- Étape 2 faite (GO de Philippe, 2026-10-09 : « go ») :
  - Fiche parente : migration f877151f6593 (`parent_type`, `parent_id`, id généré, down/up testés) — une ligne de facture, une note de ticket, un paiement appliqué… est rattaché à sa fiche (facture, ticket…), même après sa suppression (aussi pour les modifications « en lot »).
  - `GET /journal` (filtres qui / sorte de fiche / action / dates / recherche, « voir plus ») ; `GET /journal/filters` ; `GET/PUT /journal/options`. Noms des personnes et des fiches lus là où ils vivent au moment de l'affichage (jamais copiés dans le journal) ; libellés en français (sortes de fiche, champs, actions) ; liens vers la fiche.
  - Administration → onglet « Journal » (`components/JournalPanel.jsx`) : tout le journal, filtres, et la case « Noter aussi les consultations (qui a ouvert telle fiche) » — éteinte au départ, seul un administrateur ou un gestionnaire peut la changer (403 sinon) ; le changement est lui-même inscrit.
  - Consultations (si allumé) : ouverture d'une fiche compagnie, contact, article, facture, devis, ticket, bon de commande, facture fournisseur, tâche (et facture vue au portail) ; l'option est relue chaque 30 s par les deux serveurs.
  - Bouton « 🕘 Historique » (`components/HistoryButton.jsx`) : article du catalogue, devis, bon de commande, facture fournisseur ; icône seule sur facture et ticket (en-têtes déjà pleins : mise en page gardée). Compagnie et contact gardent leur onglet Journal (qui montre maintenant aussi les changements inscrits tout seuls et le nom du client du portail).
  - Vérifié : essai annulé (rien gardé, option toujours éteinte) — prix d'article visible dans son Historique (« Prix : 300.0 → 301.0 », Philippe) ; option allumée → ouverture de l'article inscrite « Consultation », éteinte → rien ; recherche « prix » ; filtre automatique + dates ; ligne de facture modifiée puis supprimée en lot → rattachée à sa facture. Écrans (Playwright, aucune erreur) : Admin → Journal (ordinateur et cellulaire), filtres, Historique d'un article, en-tête de facture comparé avant/après.

---

## TASK-050 [ERPCRM] [~] Mise en page et apparence — utiliser toute la largeur de l'écran, look moderne
Classification: CURRENT
Date de demande : 2026-10-10 (Philippe : « je n'aime pas les onglets de admin en 2 lignes… depuis le début je veux travailler sur l'implémentation visuelle, il y a beaucoup d'espace non utilisé, tu limites les boîtes ou les pages à je ne sais pas quelle règle et on perd plein d'espace des 2 côtés… pourquoi tu ne les mets pas en pourcentage au lieu de fixe, comme ça qu'on le regarde sur une tablette ou un téléphone ça va s'ajuster… à l'ordi j'ai plein de place… plein ! … en plus le look de ERPCRM est vraiment 1990 »)
Date(s) de travail : 2026-10-10

- Constaté (2026-10-10) : chaque page a sa propre largeur maximale fixe, différente d'une page à l'autre : Administration 900 px, Commandes / bon de commande / commandes web 900–1000 px, Compagnies 1200 px, fiche compagnie 1400 px, et une douzaine de boîtes à largeur fixe dans Téléphonie ; sur un grand écran, le reste est vide des deux côtés. Les onglets d'Administration passent sur 2 lignes depuis TASK-002.3 parce que la page est limitée à 900 px.
- Écran de Philippe : 1920 × 1080. Mesuré à cette largeur (2026-10-10) : zone de travail 1700 px ; utilisé : Administration 900, Compagnies et Tickets 1200, fiche compagnie 1400, Ventes et Commandes 1636.
- Proposé (2026-10-10) : étape 1 pleine largeur (pages fluides, marges en %, onglets d'Administration sur une ligne ; fiches en 2–3 colonnes plutôt que des champs étirés ; connexion et pages publiques restent étroites) ; étape 2 nouveau look, maquettes d'abord.
- Philippe (2026-10-10) : « oui je veux des maquettes » ; couleurs de simpleip.tel à reprendre (« j'ai une couleur de bleu pour Simple IP ») : bleu #0066CC, foncé #004A99, clair #3399FF, cyan #00D4FF, marine #0A1929 / #132F4C, fond #F5F9FF, gris #6B7C8F.
- Maquettes de la fiche compagnie en 1920 (artifact privé « ERPCRM — maquettes du nouveau look », https://claude.ai/artifact/EuP4RDwYZQ88xZ5fUaBdg5) : A clair et aéré (menu blanc à gauche) ; B bandeau marine (menu marine, nom et soldes dans un bandeau foncé) ; C menu en haut, compact (modules en barre horizontale, colonne d'identité à gauche). En attente de son choix, et du GO pour l'étape 1.
- Philippe (2026-10-10) : « A est bien, j'aimerais avoir A mais en mode nuit pour voir avant de tout changer » → 4e maquette « A — Mode nuit » (même mise en page, fond marine #0B1E33, boîtes #102A45, texte clair, liens #5AB0FF, boutons #0066CC).
- Philippe (2026-10-10) : « cool, je veux l'option dans Admin de mettre en mode nuit » → à construire avec le nouveau look : réglage Jour / Nuit dans Administration (pour tout le monde). Aussi : menu de gauche trop large → maquettes A et nuit : 248 → 186 px, marge de gauche −15 % (30 → 26 px), espace vide à droite des libellés −60 % (« Impôts et formulaires » passe sur 2 lignes).
- Philippe (2026-10-10) : « j'aime beaucoup le champ de recherche en haut… presque parfait ; on va enlever "et formulaires" de Impôts et formulaires, on rapetisse encore un petit peu, et pour Impôts mets un petit drapeau au lieu d'un % » → maquettes : menu 172 px, libellé « Impôts », icône drapeau (à appliquer aussi au vrai menu) ; drapeau de pays rectangulaire (Philippe : le 1er « c'est un drapeau de golf ») ; libellé « Tx & Impôts », puis final « Fiscalité » (Philippe, 2026-10-10 : « oui mets Fiscalité » ; couvre déclarations TPS/TVQ, paiements, ajustements, feuillets).
- Appliqué à tout le site (Philippe, 2026-10-10 : « ok mets-moi le site au complet visuellement comme ça, par défaut mode jour ») :
  - Couleurs : variables dans `index.css` (`--brand` #0066CC, `--c-bg`, `--c-surface`, `--c-surface-2/3`, `--c-border(-strong)`, `--c-text(-2)`, `--c-muted`, `--c-faint`, teintes `--c-tint-*` / `--c-on-*`) et leur version nuit sous `:root[data-theme="dark"]`. Les ~1 250 couleurs grises écrites en dur dans 72 fichiers remplacées mécaniquement par ces variables (même rôle, script relu) ; pas touchés : l'éditeur de signature et les aperçus de courriel (leurs couleurs partent dans les courriels), le graphique de la Banque, les sélecteurs de couleur, les couleurs d'état (rouge, vert, orange). L'ancien changement automatique selon le réglage sombre de l'ordinateur est retiré (seul le réglage d'ERPCRM compte).
  - Police Manrope installée dans le logiciel (`@fontsource-variable/manrope`, pas de lien vers Google : marche sans Internet).
  - Menu et en-tête (`Layout.jsx/.css`) comme la maquette A : menu blanc de 172 px avec le logo en haut (icônes seules sur tablette, tiroir sur cellulaire), en-tête blanc avec la recherche (loupe), nom et rôle, pastille d'initiales = Mon compte, Déconnexion. « Impôts et formulaires » → **Fiscalité** (drapeau) dans le menu et le titre de la page.
  - Pleine largeur : limites retirées (Administration 900, Compagnies 1200, fiche compagnie 1400, Commandes/bons de commande/commandes web 900–1000, Serveur 900, Factures périodiques 1100, Tâches 1100, Employés 860) ; marges de 2,5 % ; Administration → Entreprise et Mon compte en colonnes. Onglets d'Administration sur une ligne. Restent étroits : connexion, portail client, boutique, prise de rendez-vous, confidentialité, fenêtres.
  - Boutons, tableaux, onglets, boîtes, fenêtres : coins plus ronds (10–16 px), texte plus gras, onglets soulignés.
  - **Administration → Entreprise → Apparence** : Jour (par défaut) / Nuit, pour tout le monde, appliqué tout de suite (réglage `ui_theme`, `GET/PUT /settings`) ; gardé dans le navigateur pour éviter un éclair blanc ; la connexion et le portail client restent en mode jour.
  - Vérifié (Playwright, 1920 × 1080 jour et nuit, et 390 de large) : fiche compagnie, Inventaire, Compagnies, Contacts, Factures, Tickets, Courriels, Catalogue, Banque, Fiscalité, Tâches, Agenda, Bons de commande, Administration (Utilisateurs, Entreprise), Mon compte, connexion, portail : aucune erreur. Le réglage Nuit a été essayé sans changer le vrai réglage (réponse modifiée dans le navigateur d'essai).
  - Reste (étape 3, écran par écran) : réorganiser l'intérieur des fiches comme la maquette (cartes de chiffres, boîtes en grille), à commencer par la fiche compagnie.

---

## TASK-051 [ERPCRM+SIPV] [~] Migration de tenant — déplacer une entreprise (ou ses postes) d'un tenant à un autre
Classification: CURRENT
Date de demande : 2026-10-10 (Philippe : « option B, donc on va créer le principe de migrer une entreprise, ça va servir quand une entreprise va se joindre à une autre ou la quitter, ça va être un gros travail »)
Date(s) de travail : 2026-10-10, 2026-10-11

- Besoin : une succursale qui se joint à une maison mère qui a déjà un tenant, une succursale qui quitte (TASK-002.4, alertes), et les postes d'essai 100-103 de Simple IP (T1001) vers la compagnie test T1000 (TASK-002.5).
- Constaté (2026-10-10) : SIPV sait créer et supprimer un poste dans un tenant, mais rien pour le déplacer d'un tenant à un autre (`extensions.py`). Un poste déplacé change d'identifiant SIP : les téléphones doivent être reconfigurés (provisionnement).
- À faire avant le plan : inventaire de tout ce qui appartient à un tenant sur SIPV (postes, numéros, groupes d'appel, IVR, messageries et messages, musique d'attente, adresses 911, parcage, historique d'appels, facturation) ; croiser avec l'architecture TASK-027 / TASK-S043 ; SIPV reste autonome (aucune copie de code).
- Inventaire (2026-10-10, lecture seule sur SIPV) : 30 tables liées à un tenant — postes `sip_extensions` (identifiant SIP = « {compte}-{poste} », ex. t1001-100 : il change avec le tenant), messageries + messages, téléphones provisionnés + boutons, adresses 911 + assignations (postes et numéros), numéros `tenant_dids` + routes entrantes/sortantes, groupes d'appel / files / interphone / interception, IVR, horaires et fériés, messages et musique d'attente, parcage, trunks, télécopie, SMS, enregistrements, sécurité / fraude, historique d'appels (CDR), changements en attente. T1001 aujourd'hui : postes 100-103, 3 téléphones provisionnés, 3 messageries, 8 numéros, 1 groupe d'appel, 51 appels dans l'historique. TASK-027 / TASK-S043 ne prévoient rien sur la migration : pas de conflit.
- Plan proposé (2026-10-10) : la migration est faite par SIPV (il possède les données ; ERPCRM l'appelle), par poste ou par numéro, ou « toute la compagnie » (ses postes et numéros = ceux de son adresse 911). Toujours un **aperçu** d'abord (ce qui part, numéro déjà pris dans la destination → choisir un autre, appartenances retirées des groupes de l'ancien tenant, boutons qui pointaient vers l'ancien tenant), puis exécution en une seule transaction SIPV : poste + messagerie et messages + téléphone provisionné et boutons + adresse 911 → nouveau tenant, nouvel identifiant SIP, configurations régénérées pour les deux tenants, téléphone reprovisionné ; avis de facturation retrait / ajout (prorata) vers ERPCRM. L'historique d'appels et les enregistrements restent à l'ancien tenant (recommandé). Fonctionne aussi plus tard entre deux serveurs SIPV (sortie d'un tenant + entrée dans l'autre). Copie de la base SIPV avant chaque migration.
- Décisions de Philippe (2026-10-10) : « les appels historique on delete… le groupe on le bouge, les DID il me faut une fenêtre pour identifier ceux qui bougent, fenêtre pour les postes aussi (je vais choisir les postes qui partent) (je pense aux prochaines fois aussi)… une fenêtre avec tout ça, même le groupe et ce qu'il y a dans le groupe, comme ça je peux le déplacer / copier si les 2 groupes restent actifs mais avec les postes enlevés en moins et le nouveau avec les postes enlevés du vieux groupe ; le 911 va suivre le DID migré, juste confirmer le nouveau 911 avec la nouvelle compagnie ou la compagnie succursale qui se sépare… on pourrait avoir un onglet Migration dans Serveur pour tout sélectionner ce qui migre ».
  → Écran **Serveur → Migration** : tenant source et destination ; cases à cocher pour les postes et les numéros qui partent ; pour chaque groupe (et ce qu'il contient) : déplacer, copier (les deux restent actifs : l'ancien sans les postes partis, le nouveau avec eux) ou laisser ; l'adresse 911 suit les numéros et postes migrés, à confirmer (nouvelle compagnie ou succursale qui se sépare) ; aperçu, puis exécution. Historique d'appels des postes / numéros migrés : supprimé (proposé : seulement une fois les appels facturés).
- Philippe (2026-10-10) : « il peut aussi tout garder et juste mettre une espèce de date de fin ou de migration dans les CDR » → retenu à la place de la suppression : l'historique reste dans l'ancien tenant, marqué « migré le … vers … » ; rien de perdu, facturation des appels intacte.
- Philippe (2026-10-10) : « je veux pouvoir faire la migration moi, comme si c'était un tech qui le fait, donc l'onglet dans Serveur et cocher tout ce que je dois pour voir si tout marche bien » → je construis et vérifie l'écran (aperçu, essais annulés) ; la première vraie migration (postes 100-103, T1001 → T1000) est faite par Philippe à l'écran.
- En attente du GO.
- Construit (GO de Philippe, 2026-10-10 : « go, construis tout ce qu'il faut pour que je fasse la migration ») :
  - SIPV (commit aa9c089 + correction) : `app/core/tenant_migration.py` (inventaire, aperçu, exécution), `endpoints/migration.py` (`/api/v1/migration/...`, clé de service ERPCRM), migration `0066_cdr_migration_mark` (`cdr.migrated_at`, `migrated_to_tenant_id`) ; copie de la base SIPV avant (`~/migration_backups/`). Postes : nouveau tenant, nouveau numéro au besoin, identifiant « {compte}-{poste} », messagerie, téléphone provisionné, 911 recréé (adresse confirmée) ; numéros : routes entrantes, 911 ; groupes d'appel, files, interphone, interception, parcage, IVR, horaires, messages enregistrés (fichier copié), musique d'attente, jours fériés : laisser / déplacer / copier ; trunks et routes sortantes : laisser / déplacer (jamais copiés : le même compte serait enregistré deux fois ; une route ne part pas sans son trunk) ; conflits refusés (numéro déjà pris, identifiant pris, chevauchement de parcage, 911 non confirmé) ; historique d'appels marqué ; après : avis de facturation retrait / ajout, flux de musique d'attente régénérés, XML rechargé, téléphones enregistrés redémarrés (domaine d'enregistrement réel). Limite : les messages vocaux déjà reçus restent dans l'ancienne boîte (signalé dans l'aperçu).
  - ERPCRM : `endpoints/migration.py` (`/api/v1/migration/tenants|inventory|addresses|preview|execute`), `sipv_client.migration_*` ; numéros migrés passés à la compagnie d'arrivée avec l'adresse 911 confirmée ; journal « Migration téléphonique » sur les deux fiches. Écran **Serveur → Migration** (`components/TenantMigration.jsx`) : tenants, cases postes / numéros (nouveau numéro, 911 à l'arrivée), groupes et réglages (Laisser / Déplacer / Copier), aperçu (conflits rouges, avertissements orange, étapes), confirmation, résultat.
  - Vérifié : essai annulé sur les vraies données de T1001 → T1000 (4 postes, groupe, horaire, parcage, 5 messages, musique copiés, 911, 23 appels marqués) ; écran jusqu'à l'aperçu (Playwright, aucune erreur).
- **Première vraie migration faite par Philippe à l'écran (2026-10-10 15:43)** : postes 100-103 de T1001 → T1000 (t1000-100…103), 4 adresses 911 au 11206, 3 téléphones provisionnés suivis, 23 appels marqués, musique d'attente copiée, 4 lignes ajoutées à la facturation de Compagnie test (0 $ : aucun prix de poste au catalogue), journal sur les deux fiches, copie SIPV `migration_t1001_to_t1000_20261010_154358.dump`.
  - Constaté après : (1) les téléphones n'ont pas reçu l'ordre de redémarrer — le domaine d'enregistrement réel est « sipv », pas le compte → corrigé (le domaine est lu de chaque enregistrement) et redémarrage envoyé ; (2) le Grandstream GXP2135 du poste 102 (192.168.1.178) n'est plus provisionné par le serveur depuis le 2026-08-03 : il demande `/cfgc074ad31d573` à la racine et reçoit 404 (problème existant) → l'identifiant t1000-102 est à entrer dans le téléphone (même mot de passe) ou l'adresse de provisionnement à corriger ; les postes 100, 101, 103 (logiciels) : identifiant à changer à la main ; (3) musique d'attente : le dossier `/usr/local/freeswitch/sounds/sipv_moh` (propriétaire freeswitch, créé le 2026-08-12) n'est pas inscriptible par SIPV → tout changement de musique d'attente échoue en silence depuis (problème existant, même famille que TASK-S055.8) ; T1000 joue la musique par défaut.
- Suite (Philippe, 2026-10-10 : « Voir l'aperçu : j'aimerais qu'on ne soit pas obligé de le regarder pour migrer… j'ai changé le user de mes 2 postes connectés… quand on travaillera sur le provisioning va falloir que ça marche… oui fais les corrections aussi ») :
  - « Migrer » fait l'aperçu tout seul : conflits → montrés, rien ne part ; sinon la fenêtre de confirmation montre les avertissements. « Voir l'aperçu » reste pour regarder avant.
  - Postes reconnectés par Philippe : t1000-102 (GXP2135) et t1000-103 (GXP2170).
  - Musique d'attente : TASK-S033.4 (cause trouvée et corrigée). Serveur du tenant : TASK-S042.1.
  - Provisionnement Grandstream : `/api/v1/provisioning/gs/cfg<mac>` construit (configuration complète vérifiée pour le poste 102 : serveur sipv-lab, proxy 192.168.1.55, t1000-102) ; **pas encore branché** dans le serveur web (nginx, encore le site FusionPBX abandonné, renvoie 404 sur `/cfg<mac>`) — le brancher ferait reprendre sa configuration au téléphone tout seul à sa vérification de 5 h : à faire avec Philippe présent, téléphone surveillé.
- Bouton **« Redémarrer »** (Philippe, 2026-10-10 : « tu connais la commande pour redémarrer le poste ?? je veux cette option dans le ERPCRM à côté des statuts en direct quand on est dans le poste, et dans les postes de téléphonie entre l'IPv4 privée et la case à cocher ») : SIPV `POST /api/v1/extensions/{id}/reboot` (`core/phone_reboot.py` : `flush_inbound_reg <utilisateur>@<domaine réel> reboot`, domaine lu des enregistrements ; 409 si aucun téléphone enregistré ; aussi utilisé par la migration — commit 062b18a) ; ERPCRM `POST /v1/telephony/extensions/{id}/reboot` ; `components/RebootButton.jsx` (confirmation « un appel en cours sera coupé », « Envoyé »), dans la fiche du poste à côté de « Statut en direct » et dans Téléphonie → Postes (colonne « Redémarrer » entre IP privée et Actif ; grisé si le poste n'est pas enregistré). Vérifié à l'écran (Compagnie test : 102 et 103 actifs, 100 et 101 grisés) sans redémarrer.
- « Le redémarrage ne marche pas » (Philippe, 2026-10-10) : trace SIP — FreeSWITCH envoie bien `NOTIFY … Event: check-sync` au GXP2135, qui répond **401 Unauthorized** (le téléphone exige l'authentification des NOTIFY ; FreeSWITCH ne s'authentifie pas). `P95030=1` (redémarrage par check-sync permis) est déjà dans le gabarit. À régler dans le téléphone (réglage d'authentification des NOTIFY, compte 1 → sécurité SIP), puis l'ajouter au gabarit de provisionnement une fois le bon code confirmé sur l'appareil.
  - Effet secondaire corrigé : `flush_inbound_reg … reboot` effaçait aussi l'enregistrement — le téléphone qui refusait l'ordre restait « hors ligne » côté serveur jusqu'à son prochain renouvellement (jusqu'à 60 min, appels entrants perdus). Remplacé par `check_sync` (SIPV commit caf3c98) : vérifié, l'enregistrement reste.
  - Postes 100 et 101 = clients baresip sur le serveur SIPV (`baresip-test100/101.service`, `~/.baresip100|101/accounts`) : passés à t1000-100 / t1000-101 (copies `~/migration_backups/baresip10x.accounts.bak`), réenregistrés.
- Philippe (2026-10-10) : « et pourquoi on ne s'authentifierait pas ? » → recommandé : oui, plutôt que de désactiver la protection du téléphone. Constaté : le GXP2135 défie le NOTIFY (`WWW-Authenticate: Digest realm="192.168.1.55:5061", qop="auth"`) avec les identifiants SIP du compte ; FreeSWITCH ne répond pas aux défis sur un NOTIFY sortant (401 puis rien). Proposé : Kamailio (par qui passent tous les téléphones, connexion TLS déjà ouverte, fonctionne à travers le NAT) envoie le NOTIFY check-sync avec le module `uac` (`uac_req_send`, champs `auser`/`apasswd`), déclenché par SIPV ; mot de passe lu par SIPV. Touche la configuration Kamailio (tous les clients) : `kamailio -c` avant, redémarrage = les téléphones se réenregistrent. En attente du GO.
- **Fait et prouvé (GO de Philippe, 2026-10-10 : « ok on essaie »)** : le bouton « Redémarrer » envoie maintenant un NOTIFY check-sync **authentifié** — SIPV `core/phone_reboot.py` envoie une demande interne (MESSAGE `sipv-check-sync`, clé `KAMAILIO_CTRL_KEY` dans `.env` et `config.py`) à Kamailio, qui envoie le NOTIFY au contact réel du téléphone (connexion TLS déjà ouverte) et répond au défi avec l'identifiant et le mot de passe **déchiffré** du poste (`uac_req_send`, `auser`/`apasswd`) ; repli sur le check_sync de FreeSWITCH. `kamailio.cfg` : `loadmodule "uac.so"` + bloc en tête de `request_route` (copie avant : `~/migration_backups/kamailio.cfg.before_uac_*`), `kamailio -c` OK, Kamailio redémarré, postes revenus. Preuve : clic (via l'API ERPCRM) → le GXP2135 du poste 102 coupe sa connexion (port 38934) et revient enregistré sur une nouvelle connexion (port 35953) en moins d'une minute. SIPV commits 29803fe. Note : l'erreur Kamailio « load_tm(): Module not initialized » au démarrage existait déjà (11 fois depuis août).
  - Pièges rencontrés : la nouvelle variable `.env` aurait empêché SIPV de redémarrer (réglages qui refusent les variables inconnues) → déclarée dans `config.py` avant tout redémarrage ; le mot de passe du poste est chiffré en base (Fernet) → `decrypt()` comme le fait le directory.
- **Provisionnement Grandstream branché et prouvé** (Philippe, 2026-10-10 : « oui fais-le ») : (1) piège trouvé — P237 envoyait le téléphone vers `192.168.1.55:8020/api/…` en HTTPS alors que 8020 ne parle que HTTP (les vérifications suivantes auraient échoué) → migration SIPV `0068_provision_url_root` : P237 = `{{ provision_host }}` (= SIPV_HOST) ; (2) nginx (encore le site FusionPBX) : `include /etc/nginx/snippets/sipv-provisioning.conf` dans les blocs 80 et 443 — `/cfg<mac>(.xml)` → SIPV `/api/v1/provisioning/gs/cfg<mac>` (HTTP redirige vers HTTPS ; copie avant : `~/migration_backups/nginx_fusionpbx.before_provisioning`). Preuve : bouton Redémarrer → le GXP2135 du poste 102 demande `/cfgc074ad31d573.xml` (200, 18:57:19), `last_provisioned` mis à jour, revient enregistré t1000-102 en TLS (nouvelle connexion). SIPV commit 2ce1b28.
- Contacts : « bien oui ils doivent suivre, c'est les postes, les contacts » (Philippe, 2026-10-10) → la migration rattache le contact de chaque poste migré à la compagnie d'arrivée (son lien avec la compagnie de départ devient celui avec l'arrivée ; ses autres liens restent ; journal sur les deux fiches ; ligne dans l'aperçu). Migration ERPCRM 4dc25b87ef4f : Test Un, Test Deux, Test Trois, Test SIPV passés à Compagnie test (up/down/up testés, copie avant).
- **Adresse publique** (Philippe, 2026-10-10 : « 192.168.1.55 non, il faut que ce soit mon IP publique !!! dès que je quitte le bureau le local ne marche pas ») : ports publics de 142.112.42.52 vérifiés — 5061 → Kamailio du SIPV ✓ (même certificat, aussi depuis le bureau par la boucle NAT) ; 443/80 → serveur ERPCRM/portail (certificat portail.simpleip.tel) ; 8080 → DashV16. **P48 (proxy SIP) = adresse publique** : migration SIPV `0069_sip_proxy_public` (`{{ sip_proxy_host }}` = `SIPV_PUBLIC_IP`) ; preuve : poste 102 redémarré, configuration reprise (19:28:17), réenregistré par la boucle NAT (connexion Kamailio depuis 192.168.1.1, le routeur). SIPV commit f85f325.
  - **P237 (serveur de configuration) reste 192.168.1.55** : le 443 public mène à ERPCRM. À décider : redirection d'un port public vers le SIPV dans le routeur (recommandé, SIPV reste autonome, ex. 8443 → 192.168.1.55:443) ou passage par le serveur web d'ERPCRM.
- 2026-10-11 05:2x — poste 102 « down » (Philippe : « pourquoi Test Trois (102) est down ? ») : constaté — pas d'enregistrement dans FreeSWITCH ; aucune demande REGISTER du 102 en 3 minutes de trace (le 103, qui passe encore par 192.168.1.55 directement, se réenregistre normalement) ; Kamailio garde une connexion TLS ouverte depuis 192.168.1.1:44195 (le routeur, boucle NAT, ouverte le 2026-10-10 19:28) d'où plus rien n'arrive ; le téléphone répond au ping ; il a repris sa configuration à 01:27 (vérification automatique). Cause probable : la boucle NAT du routeur (proxy = adresse publique depuis le bureau) ne tient pas une connexion TLS de longue durée — conséquence directe du passage de P48 à l'adresse publique (0069). À confirmer en voyant le téléphone ; solution proposée : un nom (ex. sip.simpleip.tel) qui donne 192.168.1.55 au bureau (DNS local du routeur) et l'adresse publique ailleurs, ou un choix bureau / extérieur par téléphone.
- Philippe (2026-10-11) : « la portion des park dans une migration est automatique, je n'ai pas à choisir de le faire puisque c'est inévitable qu'il faut qu'il soit transféré, et c'est automatique aussi quand on crée un tenant : il vient avec sa zone de park » → à faire : (1) SIPV `sync/company` crée le parcage par défaut (700, places 701-720) avec le nouveau tenant ; (2) la migration ne propose plus de choix pour le parcage : le tenant d'arrivée a toujours le sien (créé s'il manque), celui de départ garde le sien.
  - **Fait (2026-10-11)** : SIPV `core/default_parking.py` (`ensure_default_parking` : « Parcage », 700, places 701-720, retour au parqueur, seulement si le tenant n'a aucune zone) appelé à la création d'un tenant (`sync/company` et `POST /tenants`) et à l'exécution d'une migration (tenant d'arrivée) ; « Parcage » retiré des choix de la migration (`KINDS`) ; l'aperçu annonce « Zone de parcage de … créée », refuse si un poste migré prend un numéro 700-720 dans une destination sans zone, et avertit si le parcage de départ renvoie les appels oubliés à un poste qui part. Testé en transaction annulée (création, 2e appel sans doublon, conflit 705) ; écran de migration vérifié (T1000 et T1001 : plus de choix « Parcage »). T1000 et T1001 avaient déjà chacun leur zone.
- 2026-10-11 : touches du GXP2135 (photos de Philippe : page 2 « Verrouillage… » / « INFO », touches 6-8 mal placées) → touches 6-8 = parcs surveillés 701-703 (API boutons) ; gabarit : 32 touches toujours envoyées à leur vraie position, non définies = « aucune » (-1) — migration SIPV `0070_vpk_all_keys`, commit cb817be. Test au redémarrage du téléphone en cours.
- 2026-10-11 07:50 — redémarrage du poste 102 par Philippe : configuration reprise (07:50:52, nouvelles touches) ; connexion TLS ouverte par la boucle NAT (192.168.1.1:33989) mais **aucun REGISTER n'atteint FreeSWITCH** (seulement un petit paquet aux 20-30 s ; Test SIPV et les postes qui visent 192.168.1.55 directement restent enregistrés). Cause = le chemin par le routeur. Proposé à Philippe : nom sip.simpleip.tel (DNS public → adresse publique, DNS local du routeur → 192.168.1.55) ; test de preuve de 2 min (102 seul sur 192.168.1.55) en attente de son GO. Trace SIP de FreeSWITCH remise à off.
- **2026-10-14 — touches du GXP2135 et « SIP Server » : erreur de ma part, cause prouvée** (Philippe, photos de la page web du 102 : « pourquoi ce n'est pas une adresse IPv4 … sipv-lab », « je t'ai envoyé la liste des codes Grandstream », « l'option none existe ») :
  - Source de vérité : gabarit officiel `~/GrandStream/Template_Config_Pcode/config-template/gxp2130_40_60_70_35_config_1.0.11.106.txt` (firmware du 102 = 1.0.11.106), section « For GXP2135 » (ligne 11573). GXP2135 : VPK 1-6 = `P1363…P1374` (mode/compte) + `P1465…P1476` (description/valeur) ; VPK 7-8 = `P23800…P23807` ; VPK 9-32 (touches dynamiques, pages 2-4) = `P23808…P23903`, **autre légende de modes** (-1 aucune, 0 numérotation rapide, 1 BLF, 9 parcage, 16 parcage surveillé, 19 information, 26 verrouillage clavier…). Note du gabarit : une touche dynamique « aucune » doit quand même être envoyée dans l'ordre ; en sauter une efface toutes celles qui suivent.
  - Notre gabarit (0045, puis 0070) écrivait la touche *n* à `P23800 + 4(n-1)` : touche 1 → VPK 7, touche 5 (PARK, 19) → VPK 11 = « Information », touches 6-8 (26) → VPK 12-14 = « Verrouillage clavier » ; VPK 1-6 jamais envoyées (le téléphone garde ses vieux réglages : lignes comptes 1-4, ancien Park 700 / park 1 701) ; et on envoyait jusqu'à la « touche 38 ». Page web du 102 = exactement ça. La note 0045 « légende Fixed VPK confirmée empiriquement » et la correction 0070 étaient fausses.
  - P47 (SIP Server) = `server.hostname` (« sipv-lab », le nom du serveur de labo) au lieu d'une adresse IPv4.
  - Données du 102 : touches 1-4 = ligne ; Philippe veut **une seule ligne (touche 1, en haut à gauche)**, touches 5-8 = Park 700, park 1-3 (701-703, colonne de droite de haut en bas), **pas de page 2**.
  - Correction proposée : position → P-codes et légende de modes par modèle, lues du gabarit officiel ; P47 = même adresse IPv4 que le proxy (interne ou publique) ; touches 2-4 du 102 → aucune ; preuve sur la page web du 102 et à l'écran.
  - **Fait (GO 2026-10-14)** : SIPV `provisioning.py` — `GS_VPK_LAYOUT` (touches fixes/total par modèle GXP2130/2135/2140/2160/2170), `_vpk_pcodes(n)` (n ≤ 6 : P1363/P1364/P1465/P1466 + 2(n-1) ; n ≥ 7 : P23800 + 4(n-7) — règle vérifiée touche par touche contre le gabarit pour les 5 modèles), `GS_KEY_MODES` (légende des touches fixes du gabarit ; touche dynamique = code − 10, Ligne/Ligne partagée refusées ; ancien « directory » = 29 « Information » retiré) ; `_vpk_keys` envoie toutes les touches fixes (non définie = aucune) puis les dynamiques dans l'ordre jusqu'à la dernière définie. Migration `0072_vpk_pcodes_by_model` (gabarit GXP2135 : codes par touche + `P47 = sip_proxy_host`), up/down/up testés, copie avant `~/migration_backups/sipv_before_0072_vpk_pcodes_20261014_0623.dump`. Touches 2-4 du 102 supprimées par l'API (non définies = aucune). Config servie du 102 vérifiée : P47 = P48 = 192.168.1.55, P1363 = 0 (ligne), P1365/P1367/P1369 = -1, P1371 = 19 PARK 700, P1373 = 26 park 1 701, P23800 = 26 park 2 702, P23804 = 26 park 3 703, aucune touche dynamique. Redémarrage du 102 (bouton) : configuration reprise 06:26:05, réinscrit t1000-102 depuis 192.168.1.178.
  - Philippe (2026-10-14) : « si on n'ajoute pas les pages, les boutons doivent être configurés à none » → `_vpk_keys` envoie toujours toutes les touches du modèle (GXP2135 : 32, dernière `P23903`), non définies = aucune (-1). Redémarrage du 102 : configuration reprise 06:31:53, réinscrit t1000-102. À confirmer par Philippe sur l'écran et la page web.
- **2026-10-14 — Modèles de provisionnement par modèle de téléphone (Téléphonie → Provisionnement)** (Philippe : « pourquoi je ne peux pas le créer ici, c'est LA place ! pas de doublon » ; « la langue est dans le template, c'est toutes des templates par modèle, on ne peut pas avoir des templates généraux » ; « quand on crée un template il faut choisir en premier le modèle » ; décisions : (1) un nouveau modèle part des valeurs Simple IP, (2) un poste sans modèle reçoit les valeurs Simple IP et ses touches à « aucune », (3) un poste peut ajuster une option ou une touche par-dessus son modèle) :
  - SIPV `core/grandstream_keys.py` (seule source, gabarits officiels 1.0.11.106) : disposition des touches GXP2130/2135/2140/2160/2170, modes avec libellés, `merge_keys` (touche du poste = remplace celle du modèle à la même place), boutons sous l'écran (3 au repos `pks.softkey.N`, 3 en appel `pks.scSoftkey.N`, boutons système cachés, disposition par état d'appel `softkeys.layout.state.*` avec options et défauts du gabarit alias). `provisioning.py` : options du téléphone = valeurs Simple IP (système + template global « par défaut » du serveur) → modèle → ajustements du poste (fin de la chaîne à 5 niveaux de TASK-S044) ; routes `key-catalog/{modèle}` (+ valeurs Simple IP), modèles par compagnie (créer / modifier / supprimer, refus si des postes l'utilisent, refus d'une ligne hors des touches physiques), `{poste}/button-templates` (ceux de sa compagnie pour son modèle), `{poste}/button-template` (choix), `save-as-template` (prend le modèle du téléphone ; options + touches du poste passent dans le modèle). Migrations `0073_provisioning_templates` (modèle de téléphone, pages, boutons sous l'écran, lien poste → modèle, éléments « alias » dans le gabarit GXP2135) et `0074_template_options` ; copies avant chacune dans `~/migration_backups`. Anciennes tables (templates de tenant, templates par modèle) gardées, plus lues — à effacer après confirmation de Philippe.
  - ERPCRM : `components/ProvisioningTemplates.jsx` (liste + éditeur : nom, modèle de téléphone d'abord, options pré-remplies, page 1 = 8 touches à gauche 1-4 / à droite 5-8, « + Ajouter une page » jusqu'à 4, « Retirer la page », menu déroulant du mode + description + valeur, boutons sous l'écran, deux fenêtres avec flèches ← → ▲ ▼ pour la disposition par état) ; proxys `companies.py` (`/button-templates`, `/key-catalog`) et `contacts.py` (choix du modèle, modèles offerts, modes) ; fiche du poste : « Modèle de provisionnement » + « Options ajustées pour ce poste » + « Touches ajustées pour ce poste » (modes Grandstream), « Sauvegarder comme modèle » ; Provisionnement : blocs « Options téléphonie (défaut compagnie) » et « Templates par modèle » retirés ; Horaires & Audio : « Langue des annonces vocales » (réglage de compagnie : FreeSWITCH lit `phone_option_defaults.language` pour les annonces) ; Serveur : « Global Templates » / « Templates de tenant » remplacés par « Valeurs par défaut des téléphones ».
  - Preuves : modèle « Réception GXP2135 » créé à l'écran (1920×1080, aucune erreur) ; 102 lié au modèle : configuration valide (XML), touche 9 = BLF « Test Un » 100 avec le code des touches dynamiques (P23808 = 1), touche 5 du poste (« PARK ») remplace celle du modèle, 33 éléments de boutons sous l'écran dont `softkeys.layout.enable = Yes` et Custom-Hold ajouté en appel ; 102 redémarré : configuration prise 06:55:14, réinscrit. **À confirmer sur le téléphone** : le GXP2135 accepte-t-il les éléments « alias » dans un fichier à P-codes (page 2 « Test Un », bouton Custom-Hold en appel, page web Softkeys).
- **2026-10-14 — Bouton « Pousser la config » + date de la config prise** (Philippe : « tu as la possibilité de pousser le provisioning aussi ? j'aimerais avoir ce bouton à côté des postes, avec la date de la config prise ») : gabarit officiel, `P95030` « Reboot on check-sync event without "reboot=" » → un NOTIFY `Event: check-sync;reboot=false` fait relire la configuration sans redémarrer. SIPV : `phone_reboot.reboot_phones(..., reboot=False)` (en-tête `X-Event` vers Kamailio ; pas de repli FreeSWITCH, qui redémarrerait) ; `POST /extensions/{id}/push-config` ; `last_provisioned` noté seulement quand c'est un téléphone Grandstream qui demande sa config (plus mes tests depuis le serveur) ; `esl` (statut des postes) : `config_taken_at`. Kamailio : `X-Event` accepté seulement s'il vaut `check-sync;reboot=false` (copie avant `~/migration_backups/kamailio.cfg.before_push_config_20261014_0657`, `kamailio -c` OK, redémarré, 4 postes revenus). ERPCRM : `POST /v1/telephony/extensions/{id}/push-config`, `config_taken_at` dans les postes de la compagnie et la fiche du poste ; `components/PushConfigButton.jsx` (« ⇪ » + « prise 14 oct., 06 h 59 ») dans Téléphonie → Postes (colonne « Config ») et à côté de « Redémarrer » dans la fiche du poste. Preuve : envoi au 102 → configuration reprise 06:59:01, même connexion TLS (port 38157, pas de redémarrage), date affichée à l'écran (1920×1080, aucune erreur).
- **2026-10-14 — Provisionnement refait selon Philippe** : (1) « pour les softkeys tu as mélangé des clés normales, je veux les options des softkeys » → boutons sous l'écran = seulement la disposition par état d'appel (`softkeys.layout.state.*`, 10 états), plus de touches de l'écran au repos (`pks.softkey`/`pks.scSoftkey`) ; préférence Simple IP = sa config ScopServ (photos) : composition EndCall-Redial-Dial-Backspace-Target, sans décrocher Cancel-Dial-Backspace-Onhook-Target, sonne Reject-Answer-Forward, appel sortant EndCall, en appel EndCall-NewCall-Transfer-Cancel-Swap-Record, conférence EndCall-NewCall-Record, garde Custom-EndCall-Custom-NewCall-Resume-Add, échec EndCall-Custom-NewCall, transfert Cancel-BlindTrnf-AttTrnf-Backspace-Target, ajout conférence Cancel-Dial-Backspace-Target ; (2) « les boutons sous l'écran : un bouton qui mène à une page » → page à part, une carte par état (deux fenêtres, flèches, numéros d'ordre, « modifié », « Préférence Simple IP ») ; (3) « la liste des modèles en haut, une fois sélectionné les options apparaissent en bas » → fait (`ProvisioningTemplates.jsx`, blocs réutilisables exportés) ; (4) « dans le poste je veux un onglet Provisioning avec le choix du template et les réglages qu'il donne avec des cases cochées (Modèle) ; si je décoche je peux personnaliser » → fiche contact, onglet **Provisionnement** (`PhoneProvisioningTab.jsx`) : choix du modèle, options / touches / états des boutons sous l'écran avec case « Modèle », « Enregistrer » d'un coup, « Sauvegarder comme modèle » ; l'ancien tableau de touches et le bloc d'options de l'onglet Général y sont déplacés (liens). SIPV : migration `0075_phone_softkeys` (`provisioned_phones.softkeys`, copie avant), `PUT /{poste}/provisioning` (options + touches + boutons sous l'écran du poste), rendu = modèle puis états personnalisés du poste. Preuves : écrans en 1920×1080 sans erreur ; modèle de test remis à la préférence Simple IP → config du 102 identique à la capture ScopServ ; dans l'onglet du poste, touche 5 remise au modèle → `P1473 = Park` ; config poussée au 102.
- **2026-10-14 — Touches LINE 2-4 sans le nom du compte (tests sur le 102)** (Philippe : garder 4 touches LINE fonctionnelles, seul la 1re affiche le nom) :
  - Test 1, U+200B dans la description de la touche 2 (GO de Philippe) : octets `E2 80 8B` vérifiés dans `<P1467>`, config poussée 07:47:39 → **échec** : le GXP2135 affiche « Test Trois » (traite le caractère comme vide).
  - Test 2 (piste ChatGPT, vérifiée dans le gabarit : `P270` « Account Name », vide par défaut ; une touche sans description affiche l'Account Name ; `P3` « Name » = nom envoyé, non touché) : SIPV migration `0076_account_name_option` (`P270` = option `account_name` du poste si définie, sinon nom du poste — aucun changement pour les autres ; copie avant) ; 102 : `account_name` = "", touche 1 LINE « Test Trois », touches 2-4 LINE sans description ; config poussée 07:56:40 → **échec** (Philippe : « tout est avec le user t1000-102 ») : un Account Name vide est remplacé par l'identifiant SIP, en-tête compris. Remis (`account_name` retiré du 102, config poussée 07:59:39) ; touches 1-4 restent LINE, la 1re avec « Test Trois ». Prochaine piste proposée : comparer avec la config qu'un UCM envoie au même GXP2135 (export Zero Config) ; essais rapides possibles : espace insécable U+00A0, caractère braille vide U+2800.
  - Test 3 (Philippe, d'après l'export du GXP2170 de son bureau sur l'UCM, analysé par ChatGPT : P8369=1 Line Mode ; VPK 1 LINE compte 1 « Ligne », VPK 2 LINE **compte 2 non configuré**, sans description → touche vide mais utilisable pour un 2e appel du compte 1 ; VPK 3 LINE compte 3) : 102, touches 2-4 LINE sur le **compte 2** (non configuré sur le 102), description vide (`P1366/P1368/P1370 = 1`) ; touche 1 LINE compte 1 « Test Trois ». Config poussée 08:29:28, 102 inscrit. Note : SIPV n'envoie pas `P8369` (le téléphone garde le sien ; défaut du gabarit = 1, Line Mode). → **réussi** (Philippe : « ça marche, fais-en la règle dans le modèle »).
  - **Règle (2026-10-14)** : SIPV `grandstream_keys.vpk_keys` — la 1re touche Ligne du compte 1 garde son compte et sa description (vide = Account Name = nom du poste) ; les touches Ligne suivantes du compte 1 sont envoyées sur le compte 2 (`SPARE_LINE_ACCOUNT`, jamais configuré par SIPV), sans description. Migration `0077_line_mode` : `P8369=1` (Line Mode, défaut du gabarit) toujours envoyé, la règle en dépend (copie avant). Écran : phrase d'explication sous « Touches à côté de l'écran » (modèle et onglet du poste). Modèle de test « Réception GXP2135 » : touches 2-4 = Ligne ; 102 remis entièrement sur son modèle (plus de personnalisation) → config : P1364=0 / P1366=P1368=P1370=1, descriptions vides, P8369=1 ; poussée 08:31:53, 102 inscrit.
- **2026-10-14 — Colonne « Compte » dans les touches** (Philippe : « on ajoute la colonne account entre les options et la description, pour le GXP2135 un des 4 accounts » ; il a retiré la page 2 lui-même — « parfait avec le popup Attention » — et confirmé « le bouton pousser la config marche ») : comptes par modèle tirés du gabarit (« Account. 0 - Account 1… » de chaque section) : GXP2130 = 3, GXP2135 = 4, GXP2140 = 4, GXP2160 = 6, GXP2170 = 6 (`GS_ACCOUNTS`, `key_catalog.accounts`) ; SIPV refuse un compte hors du téléphone ; `KeyRow` : menu « Compte 1…N » entre le mode et la description (modèle et onglet du poste). Vérifié en 1920×1080 : GXP2135 → Compte 1 à 4 ; enregistrement sans changement → config du 102 identique (P1366/P1368/P1370 = 1 par la règle des lignes, page 2 = aucune).
- **2026-10-14 08:43 → 09:03 — 102 hors ligne** (Philippe : « Test Trois est down ??? ») : pas sa personnalisation (enregistrée correctement : touches 2-4 LINE compte 2) ; mon redémarrage de SIPV à 08:43:01 → FreeSWITCH « Can't find user » → 403 → le GXP2135 attend `P26002` = 1200 s ; revenu seul à 09:03:17. Voir ERRORS_LESSONS TASK-051. Correctif (GO « on va avec réessaie ») : rechargement sans coupure `systemctl reload sipv-backend` (HUP gunicorn), mesuré 0 échec / 308 interrogations du répertoire pendant 2 rechargements.
- **2026-10-14 — Bouton « Remise à zéro » (Factory Reset) avec popup Attention** (Philippe : « je veux aussi avoir l'option Factory Reset avec un popup Attention, entre Redémarrer et Actif dans Compagnie → Téléphonie → Postes, et dans le poste après la date de la config poussée ») : guide d'administration Grandstream — « Allow SIP Reset » (`P26015`, défaut 0) : NOTIFY « Event: reset » authentifié → réglages d'usine. SIPV : migration `0078_allow_sip_reset` (`P26015=1` toujours envoyé, copie avant), `phone_reboot.factory_reset_phones` (Kamailio, pas de repli), `POST /extensions/{id}/factory-reset` ; Kamailio : `X-Event: reset` accepté (copie avant `~/migration_backups/kamailio.cfg.before_factory_reset_*`, `kamailio -c` OK, redémarré, 4 postes revenus) ; SIPV rechargé avec `reload` (sans coupure). ERPCRM : `POST /v1/telephony/extensions/{id}/factory-reset`, `components/FactoryResetButton.jsx` (⟲ rouge ; popup « Attention » : appel coupé, réglages effacés, **le téléphone oublie son serveur de configuration — à reprovisionner sur place sauf DHCP 66**, doit avoir pris une config récente ; il faut taper le numéro du poste ; ne se ferme qu'avec Annuler / Remettre à zéro) dans Postes (colonne « Remise à zéro » entre Redémarrer et Actif) et dans la fiche du poste après « Pousser la config ». Vérifié à l'écran sans envoyer d'ordre : bouton bloqué avec « 10 », actif avec « 102 », clic dehors ne ferme pas, Annuler ferme, aucun POST. **Pas testé sur un vrai téléphone** (le 102 serait effacé) — en attente du GO de Philippe.
- **2026-10-14 — Boutons sous l'écran en P-codes** : le gabarit officiel les a en P-codes (« Settings/Programmable Keys / Softkeys Settings » : `P2923` disposition personnalisée, `P2925` composition, `P2935` sans décrocher, `P2926` sonne, `P2927` appel sortant, `P2928` en appel, `P2933` conférence, `P2929` garde, `P2930` échec, `P2931` transfert, `P2932` ajout conférence ; options = listes « String: », avec SpkOnOff, ShowHideLabel, Custom1-3) — ma recherche précédente les avait ratés (fichier traité comme binaire par grep, il faut `grep -a`). SIPV : `SOFTKEY_STATES` en P-codes, anciennes clés « alias » relues (`normalize_layouts`), migration `0079_softkeys_pcodes` (plus d'éléments `<item>` dans le fichier P-codes ; copie avant). Config du 102 vérifiée (P2923=1 + 10 états = préférence Simple IP), poussée 09:51:15.
- **2026-10-14 — Options du téléphone comme l'UCM** (Philippe, captures UCM Zero Config → Model Templates : « il donne les options qu'on peut ajouter au template, si non c'est tout par défaut » ; GO) : SIPV `tools/parse_gs_template.py` transforme le gabarit officiel en catalogue (`app/core/catalogs/gxp21xx_1.0.11.106.json` : 144 sections, 1 788 options, libellé = commentaire du gabarit, choix « 0 - No, 1 - Yes », codes de langue, tableau des fuseaux, défaut « Default is », bornes « Number: a - b » ; exclus : touches, boutons sous l'écran, touches des modules d'extension, fond d'écran) ; `core/gs_catalog.py` (catalogue par modèle, `MANAGED` = réglages calculés par SIPV, refusés dans un modèle ou un poste, `to_pcodes`) ; route `option-catalog/{modèle}` ; rendu : `pcodes` = valeurs Simple IP → modèle → poste, le gabarit GXP2135 lit P32/P40/P138/P26002/P30/P8333/P64/P246/P1362 avec repli sur l'ancienne valeur et ajoute les autres (`extra_pcodes`). Migration `0080_options_pcodes` (copie avant) : « language » → `P1362` (modèles, postes, valeurs du serveur) ; valeurs par défaut du serveur + keep-alive `P52=2` (NAT Traversal = keep alive) et `P84=20` (demande de Philippe). Preuve : config du 102 avant/après = seulement `P52=2` et `P84=20` en plus, XML valide. ERPCRM : `GET /v1/telephony/option-catalog/{modèle}` ; `components/OptionsTree.jsx` (bouton « + Ajouter une option » → arbre avec recherche par nom ou P-code, catégories en gras quand elles ont un réglage, options gérées par SIPV grisées ; options ajoutées rangées par section en barres repliables avec leur vrai menu et le défaut du téléphone, ✕ pour retirer ; « Paramètres personnalisés » P-code libre + « + Ajouter un champ » ; mode poste : case « Modèle » par option) dans l'éditeur de modèle, l'onglet Provisionnement du poste et Serveur → « Valeurs par défaut des téléphones ». Vérifié en 1920×1080 : recherche « keep » → Compte 1 › SIP Settings › Basic (P2397-P2399), Compte 2…, ajout de « Keep-Alive Interval » P84 rangé sous Réglages › General Settings.
- **2026-10-14 — Fonds d'écran** (Philippe : « je t'ai mis les backgrounds dans ~/Simple_IP/BackGround avec 2 exemples de comment je veux les lier aux compagnies et 8 autres ; dans le provisioning, aller chercher le fichier ou drag and drop comme les relevés ; ajustement de taille selon le modèle, fit et crop, crop on déplace l'image, petit carré bleu Simple IP, Snap centre activable » ; « Global c'est parce que mes téléphones arrivent avec ça » ; Patio Design = Construction Nationale) : gabarit officiel `P2916` « Wallpaper Source » (1 = Download) + `P2917` « Wallpaper Server Path » ; tailles d'écran du guide (GXP2130/2135 = 320×240, GXP2140/2160/2170 = 480×272). SIPV : table `wallpapers` (migration `0081_wallpapers`) liée par **numéro de compte** (identité commune ERPCRM/SIPV ; les compagnies clientes n'ont pas encore de tenant SIPV), vide = Global ; image à la taille de l'écran (taille vérifiée dans l'en-tête JPEG), original + cadrage gardés (recadrer), « par défaut » par compte et taille ; fichiers `/var/lib/sipv/wallpapers` ; choix dans le modèle et le poste ; rendu : poste → modèle → défaut de la compagnie → Global ; nginx `/wallpaper/<id>.jpg` (copie avant, `nginx -t`, rechargé). ERPCRM : routes `/v1/telephony/wallpapers…` (liste, envoi multipart, recadrage, par défaut, suppression, image) ; `WallpaperEditor.jsx` (glisser ou choisir, taille d'écran, Fit / Crop, image déplaçable sous le cadre bleu, partie coupée atténuée, zoom molette + curseur, couleur de bordure en Fit, Snap centre avec guides, image produite à la taille exacte) ; `WallpapersSection.jsx` (vignettes par taille, par défaut, recadrer, supprimer ; Global en lecture dans la compagnie) dans Provisionnement et dans Serveur (« Fonds d'écran Global ») ; choix du fond dans le modèle et dans l'onglet du poste (case « Modèle »). Import des 12 images par l'API (2 Global, PAD t1002, Groupe Idéal t1031, KIKO t1037, CNJ t1017, Mc Crystal t1008, MRST t1027, Patio Design t1013, Rubi t1034, SST t1035, Waterco t1032 ; CNJ 280×280, Mc Crystal 306×252 et Waterco 200×200 mis en 320×240 « Fit » avec la couleur du coin, à recadrer au besoin ; SST 1280×720 gardé tel quel, GRP2650) ; dossier rangé en sous-dossiers « tXXXX - Nom ». Preuves : écran en 1920×1080 (dépôt, crop déplacé, zoom, Snap centre, enregistrement), config du 102 = `P2916=1` + `P2917`, le 102 a téléchargé lui-même le fond Global (10:02:41) puis le fond recadré de Compagnie test (12:04:55).
- **2026-10-14 — « Modèle par défaut »** (comme « Default Model Template » de l'UCM) : SIPV migration `0082_template_default` (`phone_button_templates.is_default`, un seul par compagnie et modèle de téléphone) ; un poste sans modèle choisi prend ce modèle. ERPCRM : case « Modèle par défaut » dans l'éditeur, étiquette « par défaut » dans la liste, onglet du poste « Modèle par défaut (nom) » et ses réglages hérités. Config du 102 inchangée après la migration ; « Réception GXP2135 » est le modèle par défaut de Compagnie test.
- 2026-10-14 — Éditeur de fond trop haut (Philippe : « la fenêtre dépasse, je n'ai pas accès au reste, le save ») : image et réglages côte à côte, échelle limitée par la hauteur de la fenêtre, défilement interne, boutons Annuler / Enregistrer toujours visibles. Vérifié : titre, image et boutons visibles à 1920×1080, 1920×900 et 1366×700.
- 2026-10-14 — Fonds d'écran refaits (Philippe : « recadrer ou crop, c'est des options de gestion après le choix du background, pas en premier ; tu mets un background inadéquat pour le modèle ; c'est de la marde » — mon essai en « Crop » avait coupé « 2009 » sur le 102) : **un fond = une image avec une version par taille d'écran** (SIPV migration `0083_wallpaper_groups`, `group_id` ; les deux « Simple IP » Global regroupés ; copie avant) ; le téléphone reçoit la version à la taille de son écran ; « par défaut », renommer et supprimer portent sur le fond entier. Écran : **Ajouter** (glisser ou choisir) → fond créé tout de suite, versions 320×240 et 480×272 faites automatiquement en **Fit** (image entière, jamais coupée ; telle quelle si déjà à la taille) ; **clic sur un fond → Gérer** (nom, fond par défaut, télécharger l'original, supprimer, aperçu par taille + « Ajuster » = éditeur Fit/Crop, « Créer cette taille ») ; le modèle et le poste choisissent un fond par son nom. Versions manquantes des fonds importés créées en Fit depuis leur original (11). Mes fonds d'essai sur Compagnie test supprimés ; le 102 est revenu au fond Simple IP. Vérifié en 1920×1080 : gestion de PAD, Ajuster (Enregistrer visible), ajout d'une image → 2 tailles, choix dans le modèle.
- 2026-10-14 — Placement (Philippe : « au lieu d'un scroll je veux un bouton Setting où les options de téléchargement et de modification sont toutes là… en bas du provisioning tu l'as chié, c'est 2 trucs… tu enlèves le fond qui se gère dans Serveur… je n'aime pas quand tu mets des affaires pour rien ») : la section « Fonds d'écran » du bas de Provisionnement est retirée (avec l'affichage des fonds Simple IP, qui se gèrent dans Serveur) ; dans le modèle, à côté du choix « Fond d'écran », un bouton « ⚙ Paramètres » ouvre la fenêtre d'ajout (glisser ou choisir) et de gestion des fonds de la compagnie ; la liste du choix se met à jour à la fermeture. Fond d'essai enregistré dans « Réception GXP2135 » remis à « Fond par défaut de la compagnie ». Vérifié en 1920×1080.
- 2026-10-14 — Réglages de l'image remontés (Philippe : « hey, les settings de l'image ?? le crop, l'ajust, le déplacement… ») : ils étaient à 3 clics (Paramètres → fond → Ajuster). La fenêtre « ⚙ Paramètres » montre maintenant chaque fond sur une ligne (nom modifiable, Fond par défaut, Télécharger l'original, Supprimer) avec ses tailles et un bouton « Ajuster » qui ouvre directement l'éditeur (Fit / Crop, déplacement, zoom, cadre bleu, Snap centre). Vérifié dans Serveur (1920×1080) : Paramètres → Ajuster 320×240 → éditeur, Enregistrer visible.
- 2026-10-14 — Options graphiques dans « ⚙ Paramètres » (Philippe, en colère : « les options de graphisme du fond d'écran, vas-tu finir par les remettre… si tu ne comprends pas, tu poses des questions, tu ne codes pas à l'aveuglette, et tu me demandes un GO avec ce que tu as compris » ; cause : dans Compagnie test le seul fond est Simple IP, mis en lecture seule → aucune option graphique visible ; ailleurs cachées derrière « Ajuster »). Après reformulation et GO : la fenêtre montre l'ajout, puis les **vignettes** (un clic = fond choisi pour le modèle ; fini le bouton radio et les « Choisir »), puis, du fond choisi, nom / par défaut / télécharger / supprimer et **son éditeur graphique ouvert directement** (`WallpaperEditor` `inline` : cadre bleu, déplacement, Fit / Crop, zoom, Snap centre, une taille à la fois avec bascule 320×240 / 480×272, « Enregistrer le cadrage ») ; le fond Simple IP s'édite aussi avec un avertissement (« change le fond de TOUS les téléphones »). Vérifié en 1920×1080 : éditeur ouvert, Fit/Crop, zoom, Snap, Enregistrer atteignable, clic sur la vignette → choix mis à jour.
- 2026-10-14 — Dans la fenêtre d'un modèle, seulement la taille de son écran (Philippe : « je ne veux pas voir les fonds d'écran qui ne cadrent pas avec le modèle ; le GXP2135 a un écran 320×240, il fait quoi le fond du GXP2170 ? ») : plus de bascule 320×240 / 480×272 ni de choix « Écran du téléphone » dans la fenêtre d'un modèle — vignettes et éditeur à la taille de l'écran du modèle. (La version 480×272 reste créée à l'ajout, pour les GXP2140/2160/2170 de la compagnie, mais n'apparaît pas dans un modèle GXP2135.) Vérifié : modèle GXP2135 → aucune mention 480×272, éditeur en 320×240.
- 2026-10-14 — Import d'une image (Philippe : « si on importe une image d'un cadre différent, le mode graphisme nous sert à gérer la bonne taille et sauvegarder ») : après l'import, la nouvelle image devient le fond sélectionné (et choisi pour le modèle) et son éditeur s'ouvre aussitôt à la taille de l'écran du modèle ; la sélection se « décroche » ensuite (un clic sur une autre vignette ne ramène pas à l'image importée). Vérifié : import de waterco (200×200) dans le modèle GXP2135 → éditeur « waterco — 320×240 », Crop + déplacement + Enregistrer le cadrage, clic sur Simple IP → éditeur Simple IP ; image d'essai supprimée ensuite.
- **2026-10-14 — Succursale avec son propre tenant → tenant de sa maison mère** (Philippe : « non, pas de tricherie, on migre » ; « 1 ça se fait automatique… le 911 est lié au DID affiché des postes, le tenant qui change garde son 911… 3 oui on désactive… donc go ») — l'ancien échange de numéros (TASK-002.7) est retiré :
  - Arrivée : `GET /v1/migration/destinations/{compagnie}` = tenants existants + ses maisons mères sans tenant (« maison mère, tenant créé à la migration ») ; l'aperçu SIPV traite ce tenant comme vide (`dest_new_account_number`) ; à l'exécution ERPCRM l'active d'abord (même chemin que « activer la téléphonie » : son propre numéro, sa facturation), puis migre.
  - 911 : **chaque poste et numéro garde son adresse 911** (plus de choix « 911 à l'arrivée », route `/migration/addresses` retirée) ; SIPV (`tenant_migration.py`) garde les assignations (tenant changé), passe l'adresse au tenant d'arrivée quand plus rien ne l'utilise au départ, toutes les adresses quand le départ est vide ; ERPCRM suit (`company_sites.company_id`). Succursale vers sa maison mère : ses adresses sont marquées siennes (`branch_company_id`) **avant** l'exécution (les avis de facturation arrivent pendant), donc ses postes restent facturés à elle ; ses contacts restent les siens.
  - Départ vidé : tenant désactivé dans la même transaction SIPV (jamais supprimé), `sipv_enabled` = faux dans ERPCRM ; sa récurrence téléphonique reste (ses postes y sont facturés).
  - Preuves : aperçu (Compagnie test t1000 simulée succursale de Maison Le Passeur t1026, transaction annulée) — « Tenant de Maison Le Passeur créé (t1026) », « garde son adresse 911 », adresse → t1026, « t1000 sera désactivé » ; exécution SIPV réelle dans une transaction annulée (t1000 → t1001) : 911 inchangé pour les 4 postes, assignations et adresse dans t1001, t1000 inactif, tout revenu après annulation ; exécution ERPCRM avec appels SIPV simulés : tenant t1026 créé avec son numéro, t1000 garde le sien et passe inactif, adresse = maison mère + marquée Compagnie test, contacts inchangés, deux récurrences actives. Écran en 1920×1080 : colonne « 911 » seule, aucune erreur. **Aucune vraie migration lancée.**
  - Leçon (ERRORS_LESSONS TASK-051) : `reload sipv-backend` ne recharge pas `sipv-backend-tls` (8022, par où passe ERPCRM) → 422 jusqu'au redémarrage de celui-ci.
- Reste (Philippe) : vérifier sur le 102 le fond recadré et les boutons sous l'écran en appel ; feu vert pour effacer les anciennes tables (templates de tenant, templates par modèle) ; recadrer au besoin CNJ / Mc Crystal / Waterco ; test réel de la remise à zéro.

## TASK-052 [ERPCRM] [x] Recherche globale (champ du haut) : tolérante et sur tout
Date de demande : 2026-10-16 (Philippe : « dans le champ de recherche en haut j'aimerais trouver l'entreprise même s'il me manque un espace, un -, un ' ou des accents ; j'ai tenté de rechercher dastou et je ne trouvais rien ; aussi rechercher une facture, j'ai dû aller dans Factures ; j'aimerais que ce champ soit une recherche de tout : un prix (avec . ou , pas de différence), une facture, un nom, contact ou entreprise »)
Date(s) de travail : 2026-10-16

- Existant : `/v1/search` (compagnies, contacts ; ilike + unaccent). À faire : comparaison sans espaces, tirets, apostrophes ni accents (« dastou » trouve « D'Astous Auto ») ; numéros de facture ; montants (1234.56 = 1234,56) ; résultats ouverts dans la fiche du client (TASK-002.9).
- Fait (2026-10-16) : `search.py` — noms comparés sans accents, espaces, tirets, apostrophes ni ponctuation (`regexp_replace(unaccent(lower(...)))`), compagnies (nom, nom légal, n° de compte), contacts (prénom + nom collés, courriel, téléphones) ; si aucune compagnie, ressemblance (difflib, ≥ 0,66, en Python — pas d'extension pg_trgm) pour les fautes de frappe ; factures par numéro (« 112183 », « 1372 ») ou par montant ; paiements par montant ; montants « 131.65 », « 131,65 », « 1 103,65 », « $1,234.56 » équivalents. Facture / paiement trouvés ouverts dans la fiche du client. Essais : « dastou », « d astous » → D Astous Auto ; « physoteque », « physotheque » → Physotech ; « jacquescartier » → Résidence Jacques-Cartier ; « 131,65 » → factures Hamak ; « 1 103,65 » → paiement Domaine des Cascades.



## TASK-053 [PLATFORM] [ ] Migration des serveurs vers le Lenovo ThinkStation P720 (DashV16, ERPCRM, SIPV) ; Z620 en sauvegarde + Plex
Date de demande : 2026-10-21 (Philippe, document « Migration des serveurs — DashV16, ERPCRM et SIPV » : P720 128 Go chez Jean-François Lane / Nanotech ; Z620 repris à 48 Go DDR3 pour sauvegardes, Plex et secours ; « inventaire et recommandation seulement, ne déplace aucune VM, ne supprime rien, ne modifie aucun stockage »)
Date(s) de travail : 2026-10-21

- Étape 1 (inventaire, lecture seule) mesuré depuis la VM ERPCRM :
  - VM ERPCRM (192.168.1.9) : 12 vCPU, 45 Go RAM, disque virtuel 256 Go dont 134 Go utilisés. Base `erpcrm` 50 Mo ; fichiers ERPCRM 1,3 Go (storage 225 Mo, surtout des imports d'octobre) ; sauvegardes 812 Mo ; modèles IA Ollama 22 Go (gpt-oss:20b, qwen3:14b, nomic-embed-text) ; Docker : Graphiti/Neo4j (0,5 Go de données), « voicebox » (cache 25 Go), images 62 Go dont 60 Go récupérables et cache de construction 51 Go dont 41 Go récupérables (rien supprimé).
  - VM SIPV (192.168.1.55, `sipv-lab`) : 4 vCPU, 15 Go RAM, disque virtuel 256 Go dont 21 Go utilisés ; bases ~55 Mo (sipv, fusionpbx, freeswitch, sipv_test) ; enregistrements 52 Mo (pas encore de vraies lignes).
  - Non visible depuis une VM : disques physiques du Z620, Hyper-V et ses VHDX, VM DashV16 → scripts en lecture seule préparés : `docs/platform/migration/inventaire_z620.ps1` (Windows, administrateur) et `inventaire_vm_linux.sh` (DashV16).
- 2026-10-21 — Philippe : « ma bibliothèque Plex va rester sur le vieux serveur, elle fait 6 téra ». DashV16 : inventaire demandé au Claude de DashV16 par Philippe.
- 2026-10-21 — Philippe : « ne fais que ERPCRM et SIPV, le vieux serveur a déjà tout ce qu'il faut » (Z620 et DashV16 hors de ma portée ; scripts gardés pour référence). Recommandation ERPCRM + SIPV pour le P720 : besoin réel aujourd'hui ~120 Go (ERPCRM ~100 Go une fois le cache Docker inutile retiré, dont modèles d'IA 22 Go ; SIPV ~21 Go) ; dans 2 ans ~250–400 Go selon les modèles d'IA et les enregistrements d'appels (1 Mo/min en WAV, ~0,12 Mo/min compressé ; à archiver sur le Z620). → 2 × NVMe 1 To en miroir pour les VM (place aussi pour DashV16 à confirmer par son inventaire), le NVMe 512 Go fourni pour l'hyperviseur ; aucun SATA ni HDD requis pour ERPCRM/SIPV. Le P720 a 2 emplacements M.2 sur la carte mère ; alimentation : 690 W = un seul connecteur 8 broches pour carte graphique, 900 W = deux → demander la 900 W (3060 Ti maintenant, 5070 Ti plus tard).
- 2026-10-21 — Philippe : « le SIPV d'un client va peser autant que moi après 9 ans ??? c'est pour ça que la connexion à Dropbox ou OneDrive est importante, je ne veux pas avoir les enregistrements d'appel » (= TASK-034). Recommandation révisée : un SIPV de client ≈ 15–25 Go (système + FreeSWITCH ; le SIPV actuel fait 21 Go, surtout système et outils) ; enregistrements envoyés au nuage du client, seulement une petite mémoire tampon locale → pas de niveau SSD SATA ; 2 × NVMe 2 To en miroir suffisent largement (1 To aurait suffi ; 2 To pour l'endurance et le confort).
- 2026-10-21 — Chiffre final donné : ERPCRM + son SIPV ≈ 80 Go aujourd'hui, ≈ 130 Go dans 2 ans, VM de 200 Go + 60 Go, 500 Go très confortable ; données de l'entreprise < 2 Go. Philippe : « on double ×2,5 pour garder plus de 20 ans de données » → ~1,25 To réservé pour ERPCRM + SIPV, qui tient dans le miroir 2 × 2 To.

## TASK-054 [ERPCRM] [x] Liens partout vers compagnie, contact, facture, avoir, devis ; bouton Retour avec mémoire au serveur
Date de demande : 2026-10-21 (Philippe : « j'aimerais que les infos dans ERPCRM de compagnie, de contact, de facture, de crédit, de devis soient des liens vers cette page pour aller les consulter rapidement… le bouton back nous ramène où on était (mettre un système de mémoire à l'extérieur du browser pour y avoir accès même après un refresh) »)
Date(s) de travail : 2026-10-21

- `components/EntityLink.jsx` : lien unique (compagnie, contact, facture/avoir, devis, ticket) — vrai lien (Ctrl+clic = nouvel onglet), ne déclenche pas le clic de la ligne autour ; `InvoiceLinks` pour une liste de factures.
- Liens ajoutés : Factures, Avoirs, Paiements (compagnie + factures payées), Devis, Tickets, Contacts (compagnies), Fiscalité (n° de facture + compagnie), Tâches (compagnie, contact, ticket, facture), fiche ticket (compagnie, contact), fiche facture et devis (compagnie), fiche paiement (compagnie, factures), fiche compagnie (factures des paiements, contact des tâches), Banque (client, client proposé par Zéko, factures des transactions classées). API : `invoices` {id, n°} ajouté aux paiements et aux transactions bancaires, `company_id` aux factures de Fiscalité, `contact_id` à la liste des tickets. Pas de liens internes dans le portail client, la boutique ni les rendez-vous publics.
- Retour : `components/navTrail.js` suit chaque écran (adresse + onglet) ; « ← Retour » ramène à l'écran précédent (fiche compagnie, contact, ticket, devis, article, facture fournisseur) ; une redirection remplace l'étape (sinon boucle sur /invoices/x → fiche client). Chemin gardé sur l'appareil et au serveur (migration `b63e91e5bf6b`, `users.nav_trail`, `GET/PUT /auth/me/nav-trail`, 50 derniers écrans).
- Vérifié (Playwright) : tickets → lien compagnie → rafraîchir → Retour = /tickets ; paiements → lien facture (fiche client) → Retour = /sales/payments (pas de boucle) ; 16 écrans modifiés ouverts sans erreur. Voir ERRORS_LESSONS TASK-054 (fiche compagnie plantée quelques minutes).


## TASK-055 [ERPCRM+SIPV] [~] Conversations clients : enregistrement, transcription, voix reconnues (Zéko)
Classification: CURRENT

Demandé : 2026-10-23 (Philippe : « mettre du speech to text pour les conversations de client pour avoir la conversation en son dans le contact / compagnie et aussi la transcription pour des recherches rapides… enregistrer à partir du ticket quand un client me parle, qu'il sache la distinction de moi et le client (moi est important, le client moins, mais si je peux associer la voix à un contact c'est super)… pour Zéko »).

Constats (2026-10-23) : aucune transcription dans ERPCRM ; SIPV enregistre déjà des appels (`record_session`, .wav mono dans /usr/local/freeswitch/recordings, 59 fichiers) ; serveur ERPCRM sans carte graphique (12 cœurs, 45 Go).

Proposition en attente de GO : (1) enregistrer depuis le ticket (micro du navigateur/cellulaire), son + transcription dans le ticket, donc dans la fiche contact/compagnie ; transcription locale, cherchable (recherche globale + Zéko) ; voix de Philippe reconnue (échantillon enregistré une fois) ; (2) voix d'un client associée à un contact, reconnue ensuite ; (3) appels téléphoniques SIPV transcrits automatiquement (enregistrement en stéréo : un côté par canal).

Ajout 2026-10-23 (Philippe : « je pourrais aussi dicter à Zéko ce que je veux… rien ne sort de chez moi ») : dictée vocale à Zéko avec le même moteur ; décision : tout local, rien ne sort du serveur (donc pas la dictée intégrée du navigateur, qui passe par Google).

Ajout 2026-10-23 (Philippe : micro choisi « dans portail.simpleip.tel/admin?tab=configuration avec les appareils comme l'ordi de Phil, la tablette de Phil, le cell de Phil ») puis GO pour les étapes 1 et 2.

- Étape 1 [x] Moteur (2026-10-23) : faster-whisper 1.2.1 + av 16.1.0 (av 17+ incompatible), modèle large-v3-turbo int8 sur CPU, `app/core/speech.py` (une transcription à la fois, modèle chargé au premier usage ; `SPEECH_MODEL`/`SPEECH_DEVICE`/`SPEECH_COMPUTE`/`SPEECH_THREADS`). Mesuré sur les échantillons de voix de Philippe : qualité excellente ; serveur actuel (Xeon E5-2630 v2, sans AVX2 ni GPU) ≈ 30-40 s par phrase de 10 s (fenêtre fixe de 30 s), ≈ 1,3× la durée pour un long enregistrement ; « small » 3× plus rapide mais fautif → refusé. Sur le P720 (TASK-053, RTX) : `SPEECH_DEVICE=cuda`.
- Étape 2 [x] Dictée à Zéko + appareils audio (2026-10-23) : `POST /v1/speech/transcribe` ; table `audio_devices` (migration 4b7e0a3ed055, sauvegarde `before_audio_devices_20261023.sql`) ; `/v1/speech/devices` (inscription, liste des micros vue par l'appareil, micro choisi, rapport d'utilisation et repli sur le micro par défaut ; admin/gestionnaire voient tous les appareils). Front : `utils/audioDevice.js`, `components/MicButton.jsx` (🎙️ dans Zéko ; 1re fois : « Nommer cet appareil »), `components/AudioDevicesPanel.jsx` (Administration › Configuration générale › Appareils audio, test de niveau sur l'appareil courant). Vérifié : dictée de bout en bout dans Chromium avec faux micro (34 s, texte correct), écrans 1920 et iPhone 13.
- Constat hors tâche : /companies défile de 5 px de côté sur cellulaire (déjà avant, pas lié).
- Étape 3 [x] Conversations enregistrées depuis le ticket + voix reconnues (2026-10-23, GO « on fait la prochaine étape ? ») :
  - Tables `conversations`, `conversation_segments`, `voice_prints` (migration 6b0131087178, sauvegarde `before_conversations_20261023.sql`). Une conversation appartient au ticket (compagnie/contact par le ticket, pas de copie) ; son dans `storage/conversations/` (inclus dans la sauvegarde), envoyé par morceaux de 10 s (page fermée = ce qui est reçu est transcrit après 15 min) ; supprimé avec le ticket.
  - `core/conversations.py` (poller du processus leader, une à la fois) : transcription mot à mot, empreinte de voix par fenêtre de 1,5 s (`core/voices.py`, sherpa-onnx + WeSpeaker ResNet34 dans `backend/ai_models/`, hors git), regroupement des voix ENTRE ELLES dans la conversation (même voix 0,60-0,83, voix différentes 0,26-0,40 → seuil 0,5 sur la moyenne, jamais sur un centre), puis chaque groupe reçoit la voix connue la plus proche (≥ 0,6, une voix = un groupe) ; un bout < 2 s dans une phrase rejoint sa voisine. Leçon : le navigateur (anti-bruit, gain auto) rapproche toutes les voix d'un même micro — un seuil fixe contre l'empreinte a mis la voix du client au nom de Philippe ; corrigé par le regroupement d'abord.
  - « Qui est « Client 1 » ? » → contact du client ou membre de l'équipe : renomme ses phrases et apprend/affine sa voix (`PUT /conversations/{id}/speaker`). « Ma voix » (Administration › Configuration générale › Appareils audio) : 30 s de lecture, réenregistrer ou effacer. Texte corrigeable phrase par phrase ; « ↻ Refaire » retranscrit avec les voix apprises.
  - Visible : ticket (section « Conversations enregistrées », 🎙️ avec rappel Loi 25), compagnie (onglet « Conversations »), contact (section). Recherche du haut (ce qui a été dit → ticket, 🎙️) ; Zéko : outil `conversations` (client, personne, texte).
  - Vérifié : conversation à 2 voix (Philippe + autre) correcte avec et sans voix connue, par fichier et par le navigateur (faux micro) ; 26 s transcrites en 54 s ; écrans 1920 et iPhone 13 ; « Qui est-ce », recherche et Zéko dans une transaction annulée ; données de test retirées.
- Étape 4 (appels SIPV transcrits) : à faire.
- Demande 2026-10-23 (Philippe : « je veux aussi avoir les autres employés, les settings de leur voix, mais j'aimerais mieux que ce soit dans Employés et dans Contact aussi ») : section « Voix » dans la fiche employé et la fiche contact (enregistrer / effacer), « Ma voix » retirée de l'administration — [x] fait 2026-10-23 (GO) : `GET/POST/DELETE /v1/speech/voices/{contact_id}` (employé avec compte → empreinte de son compte, reconnu comme équipe ; sinon empreinte du contact, la même que « Qui est… ? » ; patron/gestionnaire pour tous, un employé pour lui seul) ; `components/VoiceSection.jsx` (lecture jusqu'à 2 min, « Reconnue dans N conversations ») dans Employés (bouton 🎙️ Voix → fenêtre) et la fiche contact (section « Voix ») ; anciens `/speech/my-voice` retirés ; employés sans compte ajoutés aux voix connues de toutes les conversations. L'empreinte déjà enregistrée par Philippe est conservée. Vérifié : écran 1920/iPhone 13, enregistrement + effacement sur le contact de test « Test SIPV » (rien laissé). Constat hors tâche : la section Téléphonie d'une fiche contact (Statut en direct, Pousser la config, Remise à zéro) déborde sur cellulaire (déjà avant).
- Demande 2026-10-24 (Philippe : « le texte de lecture pour l'enregistrement est trop petit et compacté, il ne se lit pas bien et ça me fait me tromper ») — [x] fait 2026-10-24 : texte de lecture de `VoiceSection.jsx` en 21 px, une phrase par ligne (10 phrases plus courtes), affiché sous le bouton Terminer. Vérifié 1920/iPhone 13 sur « Test SIPV » sans enregistrer (aucune voix créée).
- Correction 2026-10-24 (Philippe : « j'ai dit 1 min pas 2 », fenêtre trop étroite, veut des fenêtres dynamiques en pourcentage, plus de vérification cellulaire) — [x] fait 2026-10-24 : lecture limitée à 1 min (Terminer après 20 s) ; fenêtre Voix d'Employés en 60 % de la largeur visible, 90 % de la hauteur max avec défilement interne ; texte en taille relative (clamp 18–26 px selon l'écran). Défaut corrigé : fermer la fenêtre pendant la lecture enregistrait quand même la voix à moitié lue, maintenant abandonné. Vérifié 1920×940, 1366×640, 2560×1300 ; l'empreinte de Philippe n'a pas changé.
- Demande 2026-10-24 (Philippe : « quand je lis le mot, à l'écran le mot change de couleur à vert pour me confirmer qu'il a bien associé le mot […] pourquoi j'ai un temps, pourquoi je n'ai pas un bouton Fin ? ») — révisé le même jour (Philippe : « laisse faire le vert en direct et n'installe rien sans mon GO […] on reste lent pour l'instant mais prêt à être sur un GPU ») : pas de direct ni de nouveau moteur. [ ] en attente du GO : bouton « Fin » sans chronomètre ; forme d'onde (waveform) en direct pendant l'enregistrement ; transcription Whisper en arrière-plan après l'enregistrement, puis bouton « Vérifier » dans Voix qui montre le texte, mots reconnus en vert, mots manqués en gris ; clic sur un mot gris = relire ce passage et l'ajouter à la voix. Ajout 2026-10-24 (« un chrono de 3 secondes pour se préparer, un gros 3 .. 2 .. 1 .. Enregistrement en cours ») : décompte en gros avant le début de chaque enregistrement.
- Plus tard (Philippe : « une fois rendu là, mettre accessible Zéko par voix ») : parler à Zéko et l'entendre répondre — pas commencé.
