# Plan ERPCRM — Fonctionnalités & État

## Modules complétés

### Compagnies (`/companies`)
- Liste, fiche détail avec onglets
- Champ Vendeur (contact référant, FK vendor_id → contacts)
- Boutons : + Ticket, + Facture, + Tâche

### Contacts (`/contacts`)
- Liste, fiche détail
- Liens vers compagnies multiples
- Boutons : + Ticket, + Facture, + Tâche

### Catalogue (`/catalogue`)
- Items type : service | produit | abonnement
- Checkbox `linked_to_hourly_rate` si type=service (Connaissance Simple IP vs inflation)

### Factures (`/invoices`)
- Création, lignes, paiements
- Modal prompt quand le prix change : juste ce client | mettre à jour le catalogue
- Bouton : + Tâche

### Tickets (`/tickets`)
- Statuts : ouvert → en_cours → en_attente → fermer_a_facturer → facturé → fermé | annulé
- Entrées de temps (billable/non-billable)
- Envoi résumé par email
- Bouton : + Tâche

### Tâches & Agenda (`/tasks`) ← NOUVEAU 2026-07
- Liste + vues Mois / Semaine / Jour
- Liées à compagnie, contact, ticket, facture
- Checklist par tâche
- Templates réutilisables
- Rappels (structure créée : local actif, email/popup/sms à connecter plus tard)
- Filtres : statut, priorité, complétées

### Employés (`/employees`)
- Ajout depuis contacts existants
- Paiements de salaire (À payer / Historique) avec confirmation Interac

### Commandes fournisseurs (`/purchase-orders`)
- PO avec lignes

### Web orders (`/ecom-orders`)
- Commandes boutique en ligne

### Autres
- Catalogue équipements
- Maintenance / Accès clients
- Téléphonie (DIDs, extensions)
- Paramètres
- Admin (gestion utilisateurs)

---

## Fonctionnalités à faire (backlog)

### Tâches — phase 2
- [ ] Notifications popup en temps réel (WebSocket ou polling)
- [ ] Envoi courriel de rappel (connecter `email.py`)
- [ ] Rappel texto (quand SMS disponible)
- [ ] Sync Google Agenda / Outlook (structure prête, pas de code)
- [ ] Vue "Mes tâches" vs "Équipe"
- [ ] Permissions granulaires par rôle

### SIPV (voir PLAN_SIPV.md)
- Portail client maison React + FastAPI
- Multi-tenant (account_number = tenant SIPV)

---

## Tables DB liées au module Tâches
- `tasks` — tâches et templates
- `task_reminders` — rappels par tâche
- `task_checklist_items` — checklist par tâche

## Endpoints tâches
- `GET /v1/tasks` — liste (filtrable)
- `POST /v1/tasks` — créer
- `GET /v1/tasks/templates` — templates seulement
- `POST /v1/tasks/from-template/{id}` — créer depuis template
- `GET /v1/tasks/assignees` — utilisateurs actifs
- `GET /v1/tasks/{id}` — détail
- `PUT /v1/tasks/{id}` — modifier
- `POST /v1/tasks/{id}/complete` — compléter
- `PATCH /v1/tasks/{id}/checklist/{item_id}` — cocher item
- `DELETE /v1/tasks/{id}` — supprimer
