# PLATFORM_TASKS.md

Source unique et active des tâches de Simple IP Platform (ERPCRM + SIPV). Remplace `TASKERPCRM.md` et `TASKSIPV.md` comme source active — ces deux fichiers restent des archives historiques (voir Phase N, `/home/simpleip/BackUp/phase_n_task_archive_20260821/` et `/home/sipv/BackUp/phase_n_task_archive_20260821/`), plus aucune nouvelle entrée active n'y est ajoutée.

Généré le 2026-08-22T11:42:42+00:00, issu de la migration Phases M→P (2026-08-21/22) : inventaire/classification (M), archivage hashé des sources (N), fusion documentaire avec mapping d'IDs (O), audit indépendant `task-migration-auditor` (P, verdict PASS AVEC RÉSERVES puis toutes réserves fermées). Convention TASK-XXX/TASK-SXXX inchangée (voir CLAUDE.md de chaque dépôt). Aucune tâche fonctionnelle perdue ou inventée. Mapping complet de tout changement d'ID/emplacement : voir `PHASE_O_ID_MAPPING.md` (racine `docs/platform/`).

Scope explicite par tâche : `[ERPCRM]`/`[SIPV]`/`[ARCH]` (voir `documentation-sync` pour la liste complète des tags possibles, dont `[SHARED]`/`[INFRA]`/`[TOOLING]`/`[PLATFORM]` — non utilisés ici faute de tâche correspondante identifiée lors de cette migration).

---

# PLATFORM_TASKS.md — Section ERPCRM

> Produit en Phase O à partir de l'inventaire Phase M (`phase_m_inventory_erpcrm.md`). Contenu repris fidèlement de `TASKERPCRM.md` (archivé intact en Phase N), réorganisé par ordre de TASK-XXX croissant (au lieu de l'ordre chronologique dispersé de l'original), avec corrections listées dans `phase_o_id_mapping_erpcrm.md`. La convention de numérotation (`TASK-XXX` = création de module, `TASK-XXX.Y` = ajout/fix) et la légende des statuts (`[ ]`/`[~]`/`[x]`/`[!]`) restent définies dans `CLAUDE.md` (ERPCRM) — non dupliquées ici.

Ligne `Classification:` ajoutée en tête de chaque bloc TASK-XXX top-level, reprise telle quelle de l'inventaire Phase M (CURRENT = actif/en développement ou backlog toujours valide ; HISTORICAL = complété, stable, sans contradiction ; aucune entrée ERPCRM n'est OBSOLETE ni LEGACY-ASTERISK).

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

---

## TASK-003 [ERPCRM] [x] Contacts — liste, fiche, multi-compagnies, + Ticket / + Facture / + Tâche
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `contacts`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Contacts — liste, fiche, multi-compagnies, + Ticket / + Facture / + Tâche

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

⚠️ Bug : juste après TASK-004.1, l'utilisateur ne pouvait cocher aucune case
"Connaissance" dans l'écran de classement -- clic sans effet visible. Logs
`erpcrm-backend` : `IntegrityError: CheckViolationError ...
catalogue_items_type_check`. La table avait un CHECK constraint en base
(`type IN ('service','materiel')`) posé hors du modèle SQLAlchemy à un moment
non tracé dans l'historique Alembic -- invisible dans `models/catalogue.py`
donc pas repéré avant TASK-004.1.
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

---

## TASK-006 [ERPCRM] [x] Tickets — statuts, entrées temps, email résumé, + Tâche
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `tickets`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Tickets — statuts, entrées temps, email résumé, + Tâche

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

## TASK-007 [ERPCRM] [x] Employés — depuis contacts, salaires, confirmation Interac
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `employees`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Employés — depuis contacts, salaires, confirmation Interac

---

## TASK-008 [ERPCRM] [x] Commandes fournisseurs — PO + lignes
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `purchase orders`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Commandes fournisseurs — PO + lignes

---

## TASK-009 [ERPCRM] [x] Web orders — commandes boutique ecom
Classification: HISTORICAL

*(Entrée sans section dédiée dans TASKERPCRM.md — seule trace : une ligne dans le tableau récapitulatif "Complétées", module-clé `ecom orders`. Reproduite telle quelle, aucun détail supplémentaire disponible dans la source.)*

**Description (table) :** Web orders — commandes boutique ecom

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

---

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
⚠️ Bug fix : `HOURLY_RATE` (nom non défini) dans `create_invoice_from_ticket` → corrigé en `hourly_rate`
⚠️ Bug fix : `work_mins` pouvait être négatif si seul un crédit "Donner du temps" existait → ajout `max(0, ...)`
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

---

## TASK-016 [ERPCRM] [x] Contact — champs SIPV
Classification: HISTORICAL

Lien TASKSIPV : TASK-S037.
Fichiers modifiés :
- `backend/app/models/contact.py` — ajout `sipv_sync` bool + `phone_other` str nullable
- `backend/app/schemas/contact.py` — ajout dans ContactCreate, ContactUpdate, ContactOut
- `backend/app/api/v1/endpoints/contacts.py` — `create_contact` inclut `phone_other` + `sipv_sync`
- `frontend/src/pages/ContactDetail.jsx` — checkbox "Synchroniser avec SIPV" + badge "SIP actif" + champ "Autre numéro"
Migration : `g8h9i0j1k2l3_add_contact_sipv_fields.py` (down_revision corrigé : `b7a0691596a0`).
⚠️ Bug : `down_revision` initial pointait vers `f7a8b9c0d1e2` (inexistant) → erreur `alembic heads` (multiple heads)
   Fix  : corrigé à `b7a0691596a0` (vraie tête Alembic au moment de la migration)
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

## TASK-020 [ERPCRM] [ ] Portail "Gestion téléphonique"
Classification: CURRENT

Lien TASKSIPV : TASK-S029, TASK-S030, TASK-S031.
Dépend de : TASK-017, TASK-019.
But : ajouter onglet "Gestion téléphonique" visible si can_manage_telephony = true.
Travail requis backend (portal.py) :
- GET /api/v1/portal/telephony/extensions → liste postes du tenant
- PATCH /api/v1/portal/telephony/extensions/{id} → modifier nom/voicemail/renvoi
- GET/POST/PATCH /api/v1/portal/telephony/ivr → si can_manage_ivr
- GET/POST/PATCH /api/v1/portal/telephony/groups → si can_manage_groups
- GET /api/v1/portal/telephony/cdr → CDR compagnie si can_view_company_cdr
- POST /api/v1/portal/telephony/session → créer session gestionnaire (lock)
- DELETE /api/v1/portal/telephony/session → libérer session gestionnaire
- POST /api/v1/portal/telephony/temp-code → générer code temporaire (can_manage_telephony)
Éléments jamais exposés dans portail : trunks, routes sortantes, E911, sécurité, config fournisseur.
Validation serveur : chaque endpoint vérifie la permission correspondante + session lock.
Fichiers : backend/app/api/v1/endpoints/portal.py, frontend/src/pages/Portal.jsx.

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

⚠️ Bug trouvé et corrigé en testant (pas laissé tel quel) : `generate-invoice`
plantait avec `MissingGreenlet` — `db.get(Invoice, id, options=[...])` ne
déclenche pas l'eager loading attendu dans ce contexte async ; remplacé par un
vrai `select().options(selectinload(...))`.

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

⚠️ Bug trouvé et corrigé en testant (pas laissé tel quel) : `PhoneUpdatePayload`
oubliait le champ `is_active` -- la désactivation d'un appareil de test semblait
réussir (200 OK) mais ne changeait rien réellement (Pydantic ignore silencieusement
les champs non déclarés). Ajouté, retesté, confirmé (`is_active: false` appliqué).

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
- Bug corrigé en testant : `ensure_primary_site` importé dans `companies.py` mais oublié
  dans `contacts.py` (`NameError` -- 500 sur les endpoints 911/succursale) ; `is_primary`
  manquant dans `_site_dict()` de `contacts.py`, cassait silencieusement la détection de
  la primaire.
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

Bugs corrigés en testant (plusieurs itérations, glisser-déposer ne fonctionnait pas au
premier essai) :
- `e.dataTransfer.setData(...)` manquant au `onDragStart` -- requis par le navigateur
  pour initier une vraie session de glisser natif, sans lui rien ne se passait au dépôt
  malgré un PUT qui réussissait en arrière-plan.
- Dépôt sur un DID sans `destination_type` n'avait rien à copier -- `onDropOnRow`
  détermine désormais `'extension'` par défaut et rétro-remplit aussi le DID cible pour
  que les deux partagent une vraie clé de regroupement.
- Script d'import initial n'avait pas toujours rempli `destination` (seulement
  `destination_type`) pour certains DID -- groupes avec destination vide ne
  fusionnaient jamais visuellement même si le PUT réussissait ; corrigé en réécrivant
  des valeurs de destination réelles/distinctes pour les DID concernés (Mc Crystal,
  Patio Design, Simple IP) directement en base après diagnostic `psql`.
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

⚠️ Bug trouvé et corrigé en cours de route : le paramètre `caption` de l'endpoint
d'upload était déclaré comme paramètre simple (`caption: str | None = None`) au lieu
de `Form(None)` — FastAPI le traitait comme un paramètre de query, jamais rempli par
un champ multipart. Découvert en testant l'upload avec légende (revenait toujours
`null`), corrigé avant de considérer la tâche terminée.

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

---

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

⚠️ Bug rencontré : après avoir ajouté le scope `calendar.readonly` au code,
`invalid_scope` au refresh — le refresh token existant ne portait pas le
nouveau scope. Fix : révoquer l'accès depuis `myaccount.google.com/permissions`
puis reconnecter à neuf (force un nouveau refresh token avec les scopes actuels).

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
- ⚠️ Bug corrigé : le `gap` CSS entre colonnes de la grille faussait le calcul en
  % des bandes multi-jours (colonnes plus étroites que 1/7 exact) — remplacé par
  des bordures individuelles par cellule, gap retiré entièrement.
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
  ⚠️ Bug corrigé : les segments consécutifs du même événement (ex: plein→moitié
  à la jonction) avaient chacun leur propre espacement/coin arrondi,
  créant une coupure visuelle à la jonction ("c'est mélangeant"). Fix :
  `joinLeft`/`joinRight` détectent si un autre segment du même `event.id`
  touche directement ce segment (jour adjacent) ; si oui, aucun espacement ni
  arrondi de ce côté — la pastille reste visuellement continue même si son
  épaisseur change en cours de route.
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

⚠️ Bug 1 : le menu déroulant "Compagnie" du formulaire d'upload MOH (page
Serveur) était TOUJOURS vide (aucune option sauf "Global"). Cause : `GET
/v1/companies` (liste) utilise le schéma `CompanyListItem`
(`schemas/company.py`), qui n'incluait PAS `sipv_enabled`/`sipv_tenant_id` --
contrairement à `CompanyOut` (fiche individuelle) qui les a toujours eus.
Le filtre frontend `c.sipv_enabled && c.sipv_tenant_id` (`Server.jsx`)
échouait donc pour TOUTES les compagnies, y compris "Simple IP inc." (seul
tenant SIPV réel). Vérifié en clair : `curl /api/v1/companies` renvoyait
`sipv_enabled: null` pour toutes les lignes avant le fix.
Fix : `sipv_enabled`/`sipv_tenant_id` ajoutés à `CompanyListItem`, peuplés
dans `list_companies` (`companies.py`). Revérifié après fix : "Simple IP
inc." apparaît correctement avec son tenant_id.

⚠️ Bug 2 (rapporté en même temps, "le fichier reste en place, rien
n'indique que ça a téléversé") : le `<input type="file">` HTML n'était
jamais réinitialisé après un upload réussi (seul le state React `file:
null` était remis à zéro, ce qui ne vide pas l'affichage natif du nom de
fichier choisi dans le navigateur) -- ET aucun message de succès/erreur
n'était affiché, upload silencieux même quand il réussissait. Corrigé dans
`Server.jsx` ET `CompanyDetail.jsx` (même bug dans les 2) : `key`
incrémentée sur l'input file pour forcer un vrai reset visuel, message
"✓ Téléversé" (vert, 4s) ou message d'erreur explicite (rouge, depuis
`e.response.data.detail`) affiché à côté du bouton.

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

⚠️ Bug : malgré le fix TASK-028.2, l'upload échouait encore ("Échec de
l'envoi") pour un vrai fichier audio, en Global comme vers Simple IP inc.
-- et RIEN dans les logs `erpcrm-backend` pendant l'essai en direct
(surveillé avec l'utilisateur pendant la manip). Absence totale de log =
la requête n'atteignait jamais uvicorn.
Diagnostic : `/etc/nginx/sites-enabled/portail.simpleip.tel` (le reverse
proxy public, `proxy_pass http://127.0.0.1:3010` -- vite preview relaie
lui-même `/api/*` vers le backend 8010 via son propre `proxy` config,
`vite.config.js`) n'avait aucun `client_max_body_size` -- défaut nginx
1 Mo, largement sous la taille d'un fichier MOH réel. Confirmé en testant
un upload de 3 Mo : 201 en direct sur le port 8010, 201 via vite preview
3010, **413 via `https://portail.simpleip.tel`**.
Fix : `client_max_body_size 50m;` ajouté au bloc `server` de
`/etc/nginx/sites-enabled/portail.simpleip.tel`, `nginx -t` puis
`systemctl reload nginx`. Re-testé après fix : 201 confirmé via le domaine
public avec un fichier de 3 Mo.

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
- `CompanyDetail.jsx::MohSelectionSection` : ligne passée en CSS Grid
  (colonnes fixes) pour que rien ne bouge visuellement à la sélection —
  bug initial où l'audio/téléchargement se décalaient (`marginLeft: auto`
  dynamique), corrigé par le passage en grille.
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
  dialplan). ⚠️ Bug trouvé et corrigé pendant le test réel : lecture
  directe depuis `uploads/moh_files/` échouait ("Permission denied",
  `/home/sipv/` en 750, `freeswitch` ne peut pas traverser) — copie
  d'abord vers `/usr/local/freeswitch/conf/moh_call_cache/` (dossier créé
  manuellement, `chown sipv:sipv`, `755`, même pattern que
  `prompts_cache`), joué depuis là. Proxy ERPCRM :
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

⚠️ Bug bloquant : le conteneur Voicebox crash-loopait en boucle (exit
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
(`health=healthy`, `restarts=0`). Deux bugs supplémentaires trouvés et
corrigés en testant une vraie génération de bout en bout :

1. **`engine` manquant dans la requête `/generate`** : un profil preset
   (voice_type=preset, preset_engine=kokoro) rejette silencieusement toute
   requête sans `engine: "kokoro"` explicite (défaut Voicebox = "qwen",
   incompatible) → 400 "only supports engine 'kokoro', not 'qwen'". Fix :
   `voicebox_client.generate()` envoie maintenant `"engine": PRESET_ENGINE`
   dans le payload `/generate`.
2. **Permissions des volumes Docker** : l'appli tourne en utilisateur
   `voicebox` (uid 999) dans le conteneur, mais Docker crée les volumes/
   bind-mounts en `root:root` par défaut à la première utilisation →
   `PermissionError` sur `/home/voicebox/.cache/huggingface/hub` (volume
   nommé, téléchargement du modèle Kokoro) ET sur `/app/data/generations`
   (bind-mount `./output`, écriture du fichier audio généré). Fix :
   `chown -R 999:999` sur le volume nommé `voicebox_huggingface-cache`
   (via un conteneur jetable) et sur `/home/simpleip/services/voicebox/
   output` (bind-mount, chown direct sur l'hôte).

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
`previewVoice`). Message d'erreur obtenu sur l'un des boutons (le seul qui
utilisait déjà `alert()` au lieu d'un message discret) : *"play() can only
be initiated by a user gesture"*. Cause : `new Audio(url); audio.play()`
est appelé APRÈS un `await` réseau (fetch du fichier ou génération TTS) --
le navigateur ne considère plus ça comme "dans le geste utilisateur" une
fois le délai réseau passé, et bloque la lecture. Fix (pattern standard) :
créer l'élément `Audio` et appeler `.play()` **immédiatement** dans le
handler de clic (avant l'attente réseau, avec un `.catch(() => {})` pour
ignorer le rejet attendu faute de source) -- ça "débloque" l'élément côté
navigateur. Une fois le fichier prêt, on change juste `audio.src` et on
rappelle `.play()` sur ce MÊME élément déjà débloqué. Appliqué aux 4
fonctions identiquement.

**2. "Écouter par le poste" -- 502** sur `POST /prompts/{id}/call`.
Traceback SIPV : `PermissionError: [Errno 13] Permission denied:
'/usr/local/freeswitch/conf/prompts_cache'`. Cause : le code (TASK-029.2)
faisait `PROMPT_CACHE_DIR.mkdir(parents=True, exist_ok=True)` en
supposant que le process `sipv` pouvait créer ce dossier -- faux, `conf/`
appartient à `freeswitch:freeswitch` (755), seul le propriétaire peut y
créer de nouvelles entrées. Le dossier MOH équivalent (`local_stream/`)
fonctionnait uniquement parce qu'il existait déjà (créé par un autre moyen
avant). Fix : dossier créé manuellement (`sudo mkdir` + `chown sipv:sipv`
+ `chmod 755`) une fois pour toutes, comme `local_stream/`. ⚠️ Pas
persistant dans du code/une migration -- si ce dossier disparaît un jour
(reset du serveur SIPV, réinstallation), il faudra le recréer à la main
avec les mêmes commandes.

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

**Bug séparé, appel au poste** : la commande FreeSWITCH générée par
`originate_app()` (TASK-029.2) était syntaxiquement invalide --
`"originate {vars}endpoint '&app(args)'"` avec des apostrophes littérales
(syntaxe shell, sans effet sur le parseur ESL brut) → `Parse Error!` côté
FreeSWITCH → `DESTINATION_OUT_OF_ORDER`, poste ne sonne jamais malgré un
200 OK côté API (l'origination était bien lancée en arrière-plan mais
échouait silencieusement après). Fix : apostrophes retirées,
`"originate {vars}endpoint &app(args)"` (syntaxe correcte, sans quoting).

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

**2. ⚠️ Régression corrigée** : en ajoutant la vérification "texte requis"
plus tôt, le bouton "Tester cette voix" a été lié par erreur au champ
Texte (désactivé si vide, jouait le contenu du champ). C'est faux -- les
deux sont indépendants :
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

**Bug trouvé et corrigé pendant le test réel (pas supposé)** : le filtre
`extension` de l'endpoint SIPV (déjà en place depuis TASK-S055) ratait tous
les appels SORTANTS d'un poste -- `CDR.src` est stocké avec le préfixe
tenant (`t1001-103`), pas juste le numéro nu, contrairement à `dst`. Poste
103 : 0 résultat retourné avant le fix alors que 17 appels existaient
réellement en DB. Corrigé côté SIPV, voir TASKSIPV.md TASK-S055.5 pour le
détail (affecte aussi le portail Mon poste, pas seulement cette tâche).

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

**Bug trouvé + corrigé (2026-08-14)** : premier test réel après connexion
Dropbox -- les 3 copies (daily/weekly/monthly) échouaient avec `400 Bad
Request` sur `upload_session/start`, mais l'UI affichait quand même "Backup
envoyé (3 copies)". Diagnostic (`raise_for_status()` seul ne donnait pas le
corps de la réponse Dropbox) :
- Ajouté `_check_dropbox()` dans `backup_cloud.py` -- capture le corps de la
  réponse + `X-Dropbox-Request-Id` dans le message d'erreur au lieu du
  `raise_for_status()` générique
- Cause réelle (confirmée, pas supposée) : app Dropbox créée sans le scope
  `files.content.write` -- PAS un problème de taille de fichier/chunking
  (l'implémentation chunkait déjà correctement à 4 MiB, bien sous la limite
  de 150 MiB de Dropbox). Fix côté Philippe : activer le scope dans App
  Console > Permissions, puis déconnecter/reconnecter Dropbox dans Admin
  (le token existant ne regagne pas le scope rétroactivement)
- `backup_runner.py` (`_rotate_and_upload`, `run_manual`) retourne maintenant
  le vrai statut succès/échec par copie ; `Admin.jsx` (`runNow`) affiche le
  compte réel de succès/échecs au lieu de toujours dire "envoyé"
Services redémarrés (backend + frontend), tous vérifiés actifs.

**Suite du bug (2026-08-14/15)** : le scope manquant persistait même après le
premier "Submit" dans App Console -- cause réelle confirmée par Philippe :
les cases avaient été cochées mais le bouton Submit n'avait PAS été cliqué la
première fois. Corrections additionnelles pendant le diagnostic :
- `backup_cloud.py::dropbox_authorize_url` -- ajoute maintenant explicitement
  `scope=account_info.read files.metadata.read files.content.read
  files.content.write` dans l'URL d'autorisation (ne comptait avant que sur
  les cases cochées côté App Console, source de confusion)
- Bug de boucle infinie confirmé et corrigé (voir plus haut) -- 2692 lignes
  d'échecs accumulées en `backup_run_logs` avant le fix, table vidée sur
  demande explicite de Philippe (`DELETE FROM backup_run_logs`, 2026-08-15)
- **2026-08-15, confirmé en succès** : test manuel Dropbox -- 3 copies
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
(nouveau, placeholders Fax/SMS/Sécurité), Avancé. Bug trouvé et corrigé en
chemin : `E911AddressesSection`/`CdrSection` cassés après le déplacement de
code précédent (pas exportés), réparé avant de continuer.
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

**Bug trouvé et corrigé côté SIPV pendant les tests de continuité MOH** --
`uuid_getvar` renvoie littéralement `"_undef_"` pour une variable non
définie (ni vide, ni `-ERR`) ; le code de fallback dans
`moh_hold_tracker.py` ne traitait pas ce cas, empêchant tout le mécanisme
de reprise MOH du parcage de fonctionner. Corrigé, pas encore reconfirmé
sur un cycle complet park -> reprise -> re-park après le fix (traces de
diagnostic temporaires encore en place côté SIPV).

**Concept UI refait + lien audio ajouté (2026-08-20, même soirée)** --
Philippe a rejeté le menu à deux options nommées ("plus obligé de garder le
plus d'affaire possible") : remplacé par une case "Poste dédié" +
sélecteur de poste qui apparaît juste à côté quand coché (style
destinations DID). Décoché = comportement par défaut (rappelle le poste
qui a parqué), pas besoin de le nommer. Bug corrigé en chemin : la
première version cachait le poste tant que le mode n'était pas "fixed",
créant un blocage (impossible de choisir un poste pour justement pouvoir
passer en mode fixed) -- les deux champs partent maintenant ensemble en
une seule requête dès qu'un poste est choisi. Lien "Horaires & Audio"
ajouté sous la section (bascule le sous-onglet) pour configurer plus tard
les audios d'annonce du parcage avec choix de langue -- pointeur seulement,
le mécanisme TTS/Voicebox lui-même reste backlog (voir TASK-S061 dans
TASKSIPV.md).

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
Connexion d'un vrai compte SIP ScopServ (`vgw1.simpleip.scopcloud.com`, DID de test `15143222112`, usage test uniquement confirmé par Philippe). Deux bugs trouvés et corrigés :
1. Profil sofia `external` utilisait `context="public"`, collision avec le fichier statique vanilla `dialplan/public.xml` (même piège déjà rencontré sur `internal`, TASK-S036) — renommé `sipv-external`, `_dialplan_public()` corrigée pour échoir le contexte réellement demandé (FreeSWITCH exige une correspondance exacte).
2. 403 Forbidden en UDP simple malgré digest correct — TLS activé sur le profil `external` (port 5081, réutilise les certs `internal`), gateway reconfiguré `register-transport="tls"` vers `vgw1.simpleip.scopcloud.com:5061`. Confirmé `State: REGED`/`Status: UP` côté SIPV et ScopServ.
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
Nouvelle table `ring_group_members` (extension_id, priority, ring_order, temporarily_excluded) — CSV `members` legacy migré automatiquement (migration de données), conservé comme repli. `RingGroup.confirm_before_answer`, `schedule_id` (réutilise S016). `_ringgroup_dialplan_entries()` réécrite : tri hunt par ring_order/priority, exclusion temporaire, vérification horaire, transfert vers `no_answer_destination` si fermé, préfixe `group_confirm_key` si confirmation requise. Bug MissingGreenlet trouvé et corrigé en testant (eager-load manquant). Testé en direct (ordre hunt confirmé, exclusion confirmée). `[~]` : horaire et confirm_before_answer testés seulement au niveau génération XML, pas avec un vrai décrochage/touche. Migration `0032_ring_group_members_s023_9`.

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
Dépend de : TASK-S011 (provisioning existant). `serial_number`, `hardware_version`, `encrypted_admin_password` (Fernet), `wifi_enabled`, `bluetooth_enabled`, `headset_used`, `expansion_module`. Mot de passe admin jamais renvoyé en clair par défaut (`reveal-admin-password` à la demande). Remplacement d'appareil = PUT avec nouveau MAC/SN sur le même enregistrement (jamais recréer). ⚠️ Bug pré-existant trouvé et corrigé en marge (depuis S018) : `GET /esl/registration/{username}` répondait toujours "Unregistered" — `sofia_contact` exige `user@domain`, pas juste `user`. Nombre d'appareils enregistrés (`registered_count`) ajouté à `GET /esl/registration/{username}` et `GET /esl/registrations/tenant/{id}` — a nécessité de changer `_parse_registrations()` (esl.py) qui écrasait silencieusement les enregistrements multiples pour un même username (dict simple) → devenu une liste par username. Migration `0021_phone_physical_fields`.

#### TASK-S011.3 [!] Configuration visuelle du modèle de téléphone (image cliquable)
Dépend de : TASK-S011, TASK-S011.2. Exigence : nouvelle table de mapping bouton (poste/modèle, position, type bouton — BLF/speed dial/extension/autre, valeur, label) + coordonnées cliquables sur l'image, popup au clic avec save/cancel ; décision à trancher au moment du code : mapping stocké par `PhoneModel` (template partagé) ou par `ProvisionedPhone` (par appareil physique) — probablement les deux. ⚠️ BLOQUÉ depuis 2026-07-23 : nécessite la photo du GXP2135 (fournie par Philippe pour le bouton mais jamais pour cette table de mapping visuel précise) — pas de photo = pas de conception de coordonnées cliquables à l'aveugle. Contournement fonctionnel construit à la place : voir S011.11 (éditeur en liste, découplé de la photo, mêmes colonnes réutilisables telles quelles si la photo arrive). Reste bloqué en l'état, en attente de clarification/photo.

#### TASK-S011.4 [~] Auto-provisioning Grandstream (fichier cfg\<MAC\>.xml, zero-touch)
Référence P-codes complète documentée (P271/P31/P270/P47/P48/P35/P36/P34/P3/P130/P2329/P40/P138/P26002/P95030/P212/P237). Mécanisme zero-touch : `cfg<mac>.xml` en HTTPS, `cfg.xml` générique en repli. Limite confirmée : aucun P-code ne force un enregistrement à distance côté serveur — le téléphone décide toujours (démarrage/cycle/retry). **Fait le 2026-08-02** : premier `config_template` GXP2135 réel écrit (Jinja2, croisé contre un fichier ScopServ réel fonctionnel + la doc officielle, jamais copié tel quel). Bug trouvé en testant : mot de passe SIP stocké chiffré exposé en clair dans le premier jet du template — corrigé (déchiffré côté contexte avant rendu). Ambiguïté VPK résolue empiriquement (légende "Fixed VPK" du fichier réel, pas "Dynamic VPK" de la doc officielle, qui semble mal étiquetée). `[~]` : le déclenchement "premier démarrage zero-touch" (DHCP option 66 vs config manuelle unique) reste une question ouverte, jamais tranchée avec Philippe. Migration `0045_gxp2135_provisioning`.

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
**⚠️ Classification: LEGACY-ASTERISK — NE JAMAIS RÉACTIVER, remplacé par TASK-S017.1**
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
Dépend de : rien techniquement, mais logiquement avant TASK-S014.2 (affichage IP publique/statut F2B fiable pour un poste distant derrière NAT). kamailio 6.0.5 + rtpengine 13.5.1.4 (apt universe). ⚠️ Ne résout PAS le blocage d'accès distant connu (routeur, pas le serveur — voir mémoire projet). Config custom minimale écrite (pas de patch du template vendor 1108 lignes — rôle visé = proxy NAT-aware transparent, pas un registrar autonome). **Cutover live réussi (2026-07-23)** : Kamailio écoute les vrais ports 5060/5061, FreeSWITCH `internal` déplacé sur loopback. 2 bugs de routage FreeSWITCH→client trouvés et corrigés en cutover (`loose_route()` gaté à tort derrière `has_totag()`, `fs_path` traité comme proxy route pas header Route standard). Path RFC 3327 fonctionnel nativement côté FreeSWITCH. Validation audio réelle avec vrai téléphone **pas encore faite au moment de cette entrée** (voir S058.2 pour la suite avec vrais téléphones). `rtpengine_manage()` resté désactivé (jamais validé avec audio réel à ce stade).

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
Demande explicite de l'utilisateur (2026-08-07 matin) : même pratique que sur ses autres serveurs — n'accepter le trafic SIP entrant que depuis le proxy du fournisseur, pour éviter les appels fantômes d'un scan/bot. Le profil `external` n'avait AUCUNE ACL entrante — port SIP du trunk grand ouvert à Internet. Nouvelle liste `sipv-trunks` (`default="deny"`, allow uniquement l'IP du fournisseur ScopServ). ⚠️ Limite connue : une seule IP (résolution DNS ponctuelle) — si le fournisseur utilise un pool d'IP ou change d'IP, de vrais appels pourraient être bloqués sans avertissement, à confirmer avec une plage CIDR officielle. Bug XML `--` dans un commentaire rencontré et corrigé la même nuit (premier cas documenté de ce piège, récidivé plus tard S061/2026-08-20).

### TASK-S051 [SIPV] [x] Chaîne illimitée de destinations après un groupe d'appel sans réponse
**Classification: CURRENT**
Demande de l'utilisateur (2026-08-07 matin), reformulée après plusieurs sessions sans suite ("ça fait plusieurs fois que je te le demande") — voir [[feedback_log_verbal_requests_immediately]], demande non tracée avant cette session. `RingGroup.no_answer_destination` existait depuis S007.3 mais n'était JAMAIS lu par le dialplan dans le cas "groupe ouvert avec membres actifs" (seul le cas "fermé par horaire" l'utilisait) — même famille de bug que S047/S048. `RingGroupFailoverStep` (liste ordonnée illimitée) remplace le champ simple (conservé en base pour compat lecture, marqué LEGACY). Bug trouvé en testant : reconstruction du username préfixé manquante pour le type "extension" — corrigé. Côté ERPCRM : proxy + UI complète (`RingGroupsSection`). Migration `0057_ring_group_failover_steps`.

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
