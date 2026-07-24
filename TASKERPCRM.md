# TASKS ERPCRM

## Politique de suivi — lire avant toute intervention

### Numérotation
- `TASK-XXX` = création initiale d'un module ERPCRM
- `TASK-XXX.Y` = ajout, fix ou extension sur ce module (Y = numéro séquentiel)
- **Chercher le numéro existant AVANT d'en créer un nouveau**

### Statuts
| Statut | Signification |
|--------|---------------|
| `[ ]`  | À faire |
| `[~]`  | Partiel — infrastructure en place mais câblage incomplet ou fonctionnalité incomplète |
| `[x]`  | Complété et validé |
| `[!]`  | Attention — bug connu, comportement inattendu, ou décision à revoir |

### Contenu obligatoire — tâche COMPLÉTÉE `[x]` ou PARTIELLE `[~]`
- **Fichiers touchés** : chemin complet de chaque fichier créé ou modifié
- **Migration Alembic** : numéro de révision + nom si applicable
- **Bugs rencontrés** : erreur exacte → correction appliquée
- **Écarts vs plan** : si l'implémentation diffère du plan initial, noter quoi et pourquoi
- **Reste à faire** : si `[~]`, liste explicite de ce qui manque

```
⚠️ Bug : <description de l'erreur exacte>
   Fix  : <correction appliquée>
```

### Contenu obligatoire — tâche BACKLOG `[ ]`
- **Dépend de** : TASK-XXX qui doit être fait avant
- **Fichiers cibles** : où le travail aura lieu
- **Décisions prises** : choix d'architecture déjà arrêtés

### Règle de mise à jour
1. Mettre à jour **immédiatement après** l'implémentation, jamais avant
2. Si partiel → passer à `[~]` et lister explicitement ce qui manque
3. Ne jamais marquer `[x]` sans documenter les fichiers touchés
4. Bug découvert après `[x]` → créer TASK-XXX.Y (sous-tâche fix) et noter ici avec `[!]`
5. Mettre à jour le tableau récapitulatif en même temps que la description détaillée

---

## Complétées

| Task       | Module-clé      | Description                                                                    |
|------------|-----------------|--------------------------------------------------------------------------------|
| TASK-001   | auth login      | Auth — Login JWT, get_current_user, sessions                                   |
| TASK-002   | companies       | Compagnies — liste, fiche, onglets, boutons + Ticket / + Facture / + Tâche    |
| TASK-003   | contacts        | Contacts — liste, fiche, multi-compagnies, + Ticket / + Facture / + Tâche     |
| TASK-003.1 | contacts/compagnies | Téléphone bureau contact = champ partagé compagnie (office_phone) + journal filtré/recherche/revert |
| TASK-004   | catalogue       | Catalogue — items, types, linked_to_hourly_rate                                |
| TASK-005   | invoices        | Factures — création, lignes, paiements, modal mise à jour prix                 |
| TASK-006   | tickets         | Tickets — statuts, entrées temps, email résumé, + Tâche                        |
| TASK-007   | employees       | Employés — depuis contacts, salaires, confirmation Interac                     |
| TASK-008   | purchase orders | Commandes fournisseurs — PO + lignes                                           |
| TASK-009   | ecom orders     | Web orders — commandes boutique ecom                                           |
| TASK-010   | equipment       | Équipements — catalogue équipements clients                                    |
| TASK-011   | maintenance     | Maintenance — accès clients (ClientAccess)                                     |
| TASK-012   | telephony       | Téléphonie — DIDs, extensions                                                  |
| TASK-013   | settings        | Paramètres — settings globaux                                                  |
| TASK-014   | admin           | Admin — gestion utilisateurs, rôles                                            |
| TASK-015   | tasks agenda    | Tâches & Agenda — liste, vues mois/semaine/jour, checklist, templates, rappels |
| TASK-015.1 | tasks agenda    | Fix — édition : checklist/rappels/compagnie/contact modifiables dans le panneau|
| TASK-015.2 | tasks agenda    | Fix — champs filtre noirs (color-scheme forcé à light dans index.css)          |
| TASK-015.6 | tasks agenda    | Sous-tâches — parent_task_id FK auto-référentielle, section sous-tâches panneau|
| TASK-015.7 | tickets         | Ticket — section Tâches toujours visible, rafraîchissement auto post-création  |
| TASK-015.8 | tasks agenda    | Recherche template dans champ titre (NewTaskModal) + champ sous-tâche          |
| TASK-015.9 | tickets         | Fix dropdown template + ticket en_cours + email ouverture + chrono permanent   |
| TASK-015.10| tickets         | Chrono TicketDetail : note inline, pause/reprise auto, Donner du temps         |
| TASK-015.11| tickets         | Facturable au niveau ticket, chrono total/réponse, pause auto sur clic         |

---

## Backlog

| Task       | Module-clé      | Description                                                                    |
|------------|-----------------|--------------------------------------------------------------------------------|
| TASK-015.3 | tasks agenda    | Tâches — notifications popup temps réel (WebSocket ou polling)                 |
| TASK-015.4 | tasks agenda    | Tâches — envoi courriel de rappel (connecter email.py)                         |
| TASK-024   | companies       | Onglet Photos d'installation sur la fiche compagnie (galerie upload) ✓         |
| TASK-003.2 | contacts        | UI — bouton Journal à droite de Tâches (au lieu de section pleine largeur) ✓   |

### TASK-015.6 [x] Sous-tâches dans les tâches
Fichiers touchés :
- `backend/app/models/task.py` — ajout `parent_task_id` FK auto-référentielle + `subtasks` + `parent` relationships
- `backend/alembic/versions/h9i0j1k2l3m4_add_task_parent_id.py` — migration colonne `parent_task_id`
- `backend/app/api/v1/endpoints/tasks.py` — `SubTaskOut` schema; `parent_task_id` dans `TaskIn/TaskUpdate/TaskOut`; `subtasks` list dans `TaskOut`; `_load_opts` charge les sous-tâches + leur `assigned_to` + `checklist_items`; liste filtre `parent_task_id IS NULL` par défaut; `parent_task_id` filter query param; create/update supportent `parent_task_id`
- `frontend/src/pages/Tasks.jsx` — section "Sous-tâches" dans `TaskDetail` (view mode) : liste, checkbox, click naviguer, ajout rapide; `onSelect` prop pour naviguer vers une sous-tâche
Migration : `h9i0j1k2l3m4` appliquée.
Décision : `ondelete="SET NULL"` sur FK (les sous-tâches deviennent top-level si le parent est supprimé); la liste principale filtre `parent_task_id IS NULL` par défaut; les sous-tâches sont chargées 1 niveau profond (pas de récursion).

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

### TASK-015.7 [x] Section Tâches dans TicketDetail — toujours visible
Fichiers touchés :
- `frontend/src/pages/TicketDetail.jsx` — `TicketTachesSection` toujours rendue (suppression du guard `return null`); `refreshKey` prop pour refetch post-création; compteur sous-tâches visible sur chaque tâche

| TASK-015.5 | tasks agenda    | Tâches — vue "Mes tâches" vs "Toute l'équipe"                                  |
| TASK-016   | sipv contact    | SIPV — champs sipv_sync + phone_other sur Contact (TASK-S037) ✓                |
| TASK-017   | sipv portal     | SIPV — permissions téléphoniques sur PortalUser (TASK-S027) ✓                  |
| TASK-018   | sipv webhook    | SIPV — endpoint webhook SIPV→ERPCRM (sync nom contact, sipv_sync) ✓            |
| TASK-019   | sipv mon poste  | SIPV — portail "Mon poste" dans Portal.jsx (TASK-S028)                         |
| TASK-020   | sipv gestion    | SIPV — portail "Gestion téléphonique" dans Portal.jsx (TASK-S029)              |
| TASK-021   | sipv billing    | SIPV — endpoint billing events SIPV→ERPCRM (TASK-S032)                         |
| TASK-022   | sipv tenant     | Checkbox activer/désactiver le tenant SIPV sur la fiche compagnie ✓            |
| TASK-023   | sipv postes     | Postes SIP visibles sur fiche contact + fiche compagnie (proxy SIPV) ✓         |

---

## Détail backlog SIPV (intégration ERPCRM ↔ SIPV)

### TASK-016 [x] Contact — champs SIPV
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

### TASK-017 [x] PortalUser — permissions téléphoniques
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

### TASK-018 [x] Endpoint webhook SIPV→ERPCRM + auth clé API sur /v1/contacts
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

### TASK-019 [ ] Portail "Mon poste"
Lien TASKSIPV : TASK-S028.
Dépend de : TASK-017 (permissions) + SIPV TASK-S020 (ESL statut live).
But : ajouter un onglet "Mon poste" dans Portal.jsx, visible si can_view_own_extension = true.
Travail requis backend (portal.py) :
- GET /api/v1/portal/extension → appelle SIPV API, retourne infos du poste lié au contact
- PATCH /api/v1/portal/extension → modifie nom/renvoi/DND/voicemail selon permissions
- GET /api/v1/portal/cdr → CDR personnels (filtrés sur l'extension du contact connecté)
- GET /api/v1/portal/voicemail → messages vocaux du contact connecté
Travail requis frontend (Portal.jsx) :
- Ajouter 'can_view_own_extension' dans TABS_MAP → onglet "Mon poste"
- Sections selon permissions : statut live, DND toggle, renvois, voicemail, CDR
- Statut live = polling ou WebSocket vers SIPV (via ERPCRM proxy)
Données viennent de SIPV via appels API ERPCRM→SIPV (ERPCRM est proxy, jamais accès direct SIPV depuis frontend client).
Fichiers : backend/app/api/v1/endpoints/portal.py, frontend/src/pages/Portal.jsx.

### TASK-020 [ ] Portail "Gestion téléphonique"
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

### TASK-021 [ ] Billing events SIPV
Lien TASKSIPV : TASK-S032.
But : SIPV appelle ERPCRM quand un service est créé/modifié/retiré → lignes de facturation.
Travail requis :
- Créer endpoint POST /api/v1/billing/sipv-event (X-Api-Key = settings.SIPV_API_KEY)
- Actions : extension_added, extension_removed, did_added, did_removed, service_added, service_removed
- Payload : { action, tenant_id, company_id, service_type, quantity, unit_price, effective_date }
- Créer ou retirer ligne récurrente sur la facture courante ou prochaine avec prorata
- Lien avec le module Invoice existant (TASK-005)
Fichier cible : backend/app/api/v1/endpoints/billing_sipv.py.
Enregistrer dans main.py.

### TASK-022 [x] Checkbox tenant SIPV sur fiche compagnie
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

### TASK-023 [x] Postes SIP visibles sur fiche contact + fiche compagnie
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

### TASK-024 [x] Onglet Photos d'installation sur la fiche compagnie
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
