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
| TASK-018   | sipv webhook    | SIPV — endpoint webhook SIPV→ERPCRM (sync nom contact, sipv_sync)              |
| TASK-019   | sipv mon poste  | SIPV — portail "Mon poste" dans Portal.jsx (TASK-S028)                         |
| TASK-020   | sipv gestion    | SIPV — portail "Gestion téléphonique" dans Portal.jsx (TASK-S029)              |
| TASK-021   | sipv billing    | SIPV — endpoint billing events SIPV→ERPCRM (TASK-S032)                         |

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

### TASK-018 [ ] Endpoint webhook SIPV→ERPCRM
Lien TASKSIPV : TASK-S022, TASK-S038.
But : SIPV peut appeler ERPCRM pour :
  1. Chercher un contact par nom/numéro (GET /api/v1/contacts?search=...)  ← existe déjà
  2. Cocher sipv_sync sur un contact existant (PATCH /api/v1/contacts/{id})  ← existe déjà
  3. Créer un contact si absent (POST /api/v1/contacts)  ← existe déjà
  4. Notifier d'un changement de nom d'extension → mettre à jour extension sur contact
  5. Décocher sipv_sync quand une extension est supprimée dans SIPV
Travail requis :
- Créer endpoint POST /api/v1/sipv/event (authentifié par X-Api-Key = settings.SIPV_API_KEY)
- Actions supportées : contact_name_changed, extension_deleted, extension_created
- Payload : { action, erpcrm_contact_id, data: { ... } }
- Valider X-Api-Key dans un dependency dédié (ne pas réutiliser get_current_user)
Nouveau fichier : backend/app/api/v1/endpoints/sipv_events.py.
Enregistrer dans main.py.

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
