# ERPCRM — Carte du projet pour Claude

## Stack
- **Backend** : FastAPI (async) + SQLAlchemy + PostgreSQL, port 8010
- **Frontend** : React + Vite, port 3010
- **Auth** : JWT Bearer token, `get_current_user` dependency dans chaque endpoint
- **Env** : `settings.ERPCRM_HOST`, `settings.SIPV_API_URL` — jamais d'IPs en dur
- **Frontend env** : `import.meta.env.VITE_API_BASE`

## Arborescence backend `/home/simpleip/erpcrm/backend/app/`

```
main.py                  — FastAPI app, routers enregistrés ici (include_router)
core/
  config.py              — settings (pydantic-settings)
  database.py            — engine async, Base, get_db()
  seed.py                — données initiales au démarrage
  email.py               — send_ticket_entry_email, send_ticket_close_email
models/
  __init__.py            — TOUS les modèles importés ici (nécessaire pour Alembic)
  user.py                — User, UserRole (admin/manager/tech/billing/readonly)
  company.py             — Company (vendor_id -> contacts FK)
  contact.py             — Contact
  contact_company.py     — ContactCompany (pivot), ContactCompanyFunction
  ticket.py              — Ticket, TicketEntry
  invoice.py             — Invoice, InvoiceLine
  catalogue.py           — CatalogueItem (linked_to_hourly_rate: bool)
  employee.py            — Employee, SalaryPayment
  task.py                — Task, TaskReminder, TaskChecklistItem  ← NOUVEAU
  payment.py             — Payment, PaymentMethod
  purchase_order.py      — PurchaseOrder, PurchaseOrderLine
  equipment.py           — Equipment
  maintenance.py         — ClientAccess
  telephony.py           — DID, Extension
  portal.py              — PortalUser
  ecom.py                — EcomOrder, EcomOrderLine
api/v1/endpoints/
  auth.py                — login, get_current_user
  companies.py           — /v1/companies
  contacts.py            — /v1/contacts
  tickets.py             — /v1/tickets
  invoices.py            — /v1/invoices
  catalogue.py           — /v1/catalogue
  employees.py           — /v1/employees
  tasks.py               — /v1/tasks  ← NOUVEAU
  payments.py            — /v1/payments
  purchase_orders.py     — /v1/purchase-orders
  equipment.py           — /v1/equipment
  maintenance.py         — /v1/maintenance
  telephony.py           — /v1/telephony
  settings.py            — /v1/settings
  admin.py               — /v1/admin
  portal.py              — /v1/portal
  ecom.py                — /v1/ecom
  ref_data.py            — /v1/ref
  logs.py                — /v1/entities
  search.py              — /v1/search
```

## Pattern modèle (SQLAlchemy async)
```python
class MyModel(Base):
    __tablename__ = "my_table"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FKs optionnelles: nullable=True, ondelete="SET NULL"
    # FKs obligatoires: nullable=False, ondelete="CASCADE"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

## Pattern endpoint
```python
router = APIRouter()
# Schemas Pydantic inline (pas de fichier schemas séparé)
# Toujours: current_user = Depends(get_current_user)
# Toujours: db: AsyncSession = Depends(get_db)
# selectinload() pour les relations
```

## Arborescence frontend `/home/simpleip/erpcrm/frontend/src/`

```
App.jsx                  — Routes React Router (BrowserRouter)
services/api.js          — axios instance, baseURL = VITE_API_BASE
components/
  Layout.jsx             — sidebar nav (NAV array en haut), header
  Layout.css
  Autocomplete.jsx       — props: items, value, onSelect, onCreate, openOnFocus
  NewTicketModal.jsx     — modal création ticket
  NewTaskModal.jsx       — modal création tâche  ← NOUVEAU
  QuickNewContact.jsx
  QuickNewCompany.jsx
pages/
  Companies.jsx / .css
  CompanyDetail.jsx / .css   — tabs: Informations | Contacts | Factures | Tickets | Équipements | Tâches
  Contacts.jsx
  ContactDetail.jsx          — fiche contact, bouton Créer une tâche
  Tickets.jsx / .css
  TicketDetail.jsx            — détail ticket, bouton Créer une tâche
  Invoices.jsx / .css
  InvoiceDetail.jsx           — détail facture, bouton Créer une tâche
  Catalogue.jsx / .css
  CatalogueDetail.jsx / .css — checkbox linked_to_hourly_rate si type=service
  Tasks.jsx                   — module tâches + agenda  ← NOUVEAU
  Employees.jsx
  Settings.jsx
  Admin.jsx / .css
  Login.jsx / .css
  Portal.jsx / .css
  Shop.jsx / .css
  PurchaseOrders.jsx / .css
  PurchaseOrderDetail.jsx / .css
  EcomOrders.jsx / .css
```

## Conventions frontend
- `api.get/post/put/delete` — axios depuis `../services/api`
- Styles inline (pas de CSS séparé sauf si fichier .css existant)
- Classes CSS globales réutilisables : `modal-overlay`, `modal-box`, `modal-title`, `modal-actions`, `btn-primary`, `btn-secondary`, `form-group`, `ifield`, `ifield-label`
- `Autocomplete` pour tout champ de recherche/sélection

## Navigation (Layout.jsx — NAV array)
```
/companies, /contacts, /catalogue, /invoices, /tickets,
/purchase-orders, /ecom-orders, /employees, /tasks (NOUVEAU), /admin
```

## Fichiers de plan
- `PLAN_ERPCRM.md` — modules complétés, backlog, endpoints tâches
- `PLAN_SIPV.md` — infrastructure SIPV, architecture cible, prochaines étapes

## Règles absolues
- GO obligatoire avant tout code
- Lire `docs/platform/PLATFORM_TASKS.md` EN PREMIER avant toute intervention
- Zéro supposition — demander si incertain
- Implémenter SEULEMENT ce qui est demandé
- Jamais d'IPs codées en dur
- Ne pas modifier un module existant sans demande explicite
- Alimenter Graphiti (`add_memory`) en fin de tâche non-triviale — voir skills `documentation-sync`/`graphiti-knowledge`

## Convention PLATFORM_TASKS.md
- TASK-XXX = création initiale d'un module ERPCRM (ex: TASK-015 = Module Tâches) ; TASK-SXXX = création initiale d'un module SIPV.
- TASK-XXX.Y = tout ajout ou fix sur ce module (ex: TASK-015.1, TASK-015.2, ...)
- `TASKERPCRM.md`/`TASKSIPV.md` sont les sources historiques archivées (migration 2026-08-21/22, voir `docs/platform/PLATFORM_TASKS.md` et `PHASE_O_ID_MAPPING.md`) — utiles pour consulter l'historique complet d'un ancien ID, plus aucune nouvelle entrée active n'y est ajoutée.

### Procédure obligatoire avant d'écrire une entrée dans PLATFORM_TASKS.md
1. Chercher dans `docs/platform/PLATFORM_TASKS.md` si le module concerné a déjà un numéro TASK-XXX (ERPCRM) ou TASK-SXXX (SIPV)
2. Si oui → ajouter TASK-XXX.Y (Y = prochain numéro disponible pour ce module)
3. Si non → créer TASK-XXX (numéro suivant le dernier utilisé dans le fichier, dans la bonne famille ERPCRM/SIPV)
4. Toujours mettre à jour `docs/platform/PLATFORM_TASKS.md` après le travail, pas avant

### Pourquoi
L'utilisateur travaille de façon non-linéaire : il revient sur des modules existants,
avance en parallèle sur plusieurs fronts. Sans recherche préalable, on crée des doublons
et on perd le lien entre les sous-tâches et leur module.

### Dates obligatoires sur chaque entrée TASK-XXX/TASK-SXXX
- **Date de demande** : quand l'utilisateur a demandé ce travail (pas la date d'écriture de l'entrée).
- **Date(s) de travail** : une date par session de travail réelle sur cette tâche. Si le travail reprend plus tard sur la même tâche (TASK-XXX.Y déjà existant, repris un autre jour), ajouter une nouvelle date de travail à la liste plutôt que de créer une nouvelle entrée.

### Lien avec ERRORS_LESSONS.md (depuis 2026-09-04)
Chaque erreur dans `ERRORS_LESSONS.md` est identifiée par le **même numéro que la tâche** où elle s'est produite (`TASK-XXX.Y`), jamais un compteur séquentiel indépendant. Si la même tâche produit une nouvelle erreur plus tard, elle s'ajoute datée sous le même numéro (pas une nouvelle entrée séparée) — voir `ERRORS_LESSONS.md` pour le format exact.

**Procédure** : avant de travailler sur une tâche existante, vérifier si son numéro apparaît dans `ERRORS_LESSONS.md` (coût négligeable en tokens) — si oui, lire les erreurs déjà commises sur cette tâche avant de recommencer. Le but n'est pas de trouver un coupable : c'est de repérer les patterns récurrents (une situation qui refait échouer, une façon de formuler qui manque de précision) pour s'améliorer à chaque reprise, pas juste corriger l'incident isolé.
