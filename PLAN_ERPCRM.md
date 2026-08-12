# Plan ERPCRM — Fonctionnalités & État

> Dernière vérification de l'état réel : 2026-08-12
> Ce PLAN est une carte actuelle du projet, pas une preuve runtime.
> Si une information technique doit servir à une décision ou un debug,
> la vérifier dans le code/config/runtime.

## Modules complétés
Compagnies, Contacts, Catalogue (+ famille "Connaissance"), Factures, Devis (TASK-025),
Tickets, Tâches & Agenda (+ fusion Google Calendar bidirectionnelle), Employés,
Commandes fournisseurs, Web orders, Templates Global/Tenant/Modèle (héritage,
TASK-027.1/.2), Musique d'attente — bibliothèque + upload + sélection par compagnie
(TASK-028.x), Voicebox — génération TTS de phrases IVR, Kokoro/Siwis, testé bout en
bout (TASK-029.x), Boîte vocale UI complète.

### Téléphonie (fiche compagnie/contact) — construit
DID (refonte, glisser-déposer, horaires par plage), Extensions, Ring groups, Pickup
groups, Paging (bidirectionnel/unidirectionnel), Templates de boutons, Succursales
(911 multi-site), Options téléphonie (style UCM).

## Backlog
- TASK-019 `[~]` Portail "Mon poste" + arbre de privilèges
- TASK-020 `[ ]` Portail "Gestion téléphonique" — pas commencé
- TASK-027 `[ ]` Architecture 3 couches — 1 item fait (Templates, TASK-027.1), reste :
  Trunks/Routes en sections propres, tableau de bord registre 911
- TASK-030 `[ ]` Assistant IA intégré ("petit Claude Code" Simple IP) — idée notée, pas commencé
- TASK-031 `[ ]` Audit config centralisée — IPs/chemins codés en dur restants
- TASK-032 `[ ]` CDR dans fiche compagnie + par poste
- TASK-033 `[ ]` Poste SIP depuis un contact + parité facturation

## Connexion ERPCRM ↔ SIPV
- `account_number` (ERPCRM) = domain FreeSWITCH = tenant SIPV
- Push ERPCRM→SIPV : `/api/v1/sync/company` (clé API)
- Webhook SIPV→ERPCRM : `/v1/contacts` (auth clé API, TASK-018)
- Billing events SIPV → facturation récurrente automatique (TASK-021)
- Voir `PLAN_SIPV.md` pour l'état de l'infrastructure téléphonique elle-même

## Tables/endpoints clés
Voir `CLAUDE.md` pour l'arborescence backend/frontend complète (modèles, endpoints, pages).
