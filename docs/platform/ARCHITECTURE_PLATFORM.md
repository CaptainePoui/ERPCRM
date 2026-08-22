# ARCHITECTURE_PLATFORM.md

Document canonique de l'architecture de **Simple IP Platform**. Emplacement : `docs/platform/` dans le dépôt ERPCRM — convention créée le 2026-08-21 pour regrouper la documentation transversale ERPCRM + SIPV, distincte de la documentation propre à chaque dépôt (qui reste à la racine de chacun, non déplacée par ce changement).

Ce document décrit l'état **décidé et vérifié** de l'architecture. Il ne remplace pas `PLATFORM_TASKS.md` (source active/canonique des tâches) ni `CLAUDE.md` de chaque dépôt (conventions de code locales).

## 1. Vision produit

**Simple IP Platform** est un seul produit composé de deux plans :

- **ERPCRM = Control Plane** — ERP/CRM, gestion des compagnies/contacts/tenants, interface d'administration, orchestration.
- **SIPV = Telephony Plane** — moteur de téléphonie multi-tenant (FreeSWITCH + portail custom React/FastAPI piloté via ESL).

Les deux plans sont volontairement des dépôts et des serveurs **séparés**, pas fusionnés. Voir §4 pour les règles d'autonomie qui découlent de ce choix.

## 2. Topologie physique actuelle

| Composant | IP | Hostname | Utilisateur | Chemin |
|---|---|---|---|---|
| ERPCRM | 192.168.1.9 | erpcrm | `simpleip` | `/home/simpleip/erpcrm` |
| SIPV | 192.168.1.55 | sipv-lab | `sipv` | `/home/sipv/sipv` |

Détails d'accès SSH, pièges fail2ban, gestion des services (systemd système vs `--user`), ports TLS serveur-à-serveur : voir la mémoire `project_infrastructure`. Ce document ne duplique pas ces détails opérationnels.

Une migration serveur est planifiée (~2026-08-29) pour brancher de vraies lignes SIP ; l'IP publique cible n'est pas encore décidée (voir `project_server_migration_planned`).

## 3. Modèle de relation ERPCRM ↔ SIPV

**Architecture cible : 1 ERPCRM → N SIPV.**

`SIPV-LAB` (192.168.1.55) est aujourd'hui la seule instance déployée, mais elle représente **une instance** du concept générique **SIPV Server** — jamais un synonyme de SIPV en tant que produit. Toute conception future (schéma DB, code, documentation) doit distinguer explicitement :

- **SIPV** (le produit / la codebase Telephony Plane), de
- **un SIPV Server** (une instance déployée de ce produit, identifiée individuellement).

Le lien concret aujourd'hui entre les deux plans passe par `Company.account_number` côté ERPCRM, qui porte l'identifiant du tenant SIPV (ex. `t1001` = Simple IP inc.). Ce champ est le pivot pour toute fonctionnalité de gestion de tenant (voir `project_erpcrm_entities`).

L'hypothèse actuelle du code (1 ERPCRM ↔ 1 SIPV) n'a pas encore été auditée systématiquement pour des dépendances implicites à un seul serveur SIPV — c'est l'objet de la **Phase L** (audit read-only via l'agent `multi-sipv-architect`), qui suit ce document.

## 4. Frontières d'autonomie (règle non négociable)

SIPV doit rester **100% autonome** pour son propre fonctionnement, son dépôt git, ses backups et son déploiement — indépendant d'ERPCRM. Raison : SIPV va déménager sur un autre serveur, et toute dépendance croisée (miroir de code, script de sync, secrets partagés) casse cette indépendance au moment du déménagement.

Règles concrètes :
- Jamais de copie/miroir du code ou de la config d'un dépôt sur le disque de l'autre.
- Tout accès externe (GitHub, cloud backup, API tierce) nécessaire à SIPV doit être configuré et exécuté **depuis SIPV lui-même** (clé SSH/deploy key dédiée), jamais via un accès déjà fonctionnel sur ERPCRM.
- Le proxy applicatif ERPCRM → SIPV existant pour l'UI (page Serveur, `sipv_client.py`) reste acceptable : SIPV demeure l'unique détenteur de ses propres données et secrets. La ligne à ne jamais franchir est qu'ERPCRM devienne une dépendance matérielle (code, clés) pour que SIPV fonctionne ou soit sauvegardé.

Voir `feedback_sipv_must_stay_autonomous` (incident du 2026-08-16) pour le contexte complet.

## 5. Canaux de communication ERPCRM ↔ SIPV

Deux familles de ports, par serveur :

- **HTTP applicatif** (inchangé) : ERPCRM 8010, SIPV 8020 — servent les frontends respectifs.
- **TLS serveur-à-serveur** (ajouté TASK-S039.1, pour tout transport de données sensibles) : ERPCRM 8011 (`erpcrm-backend-tls.service`), SIPV 8022 (`sipv-backend-tls.service`) — chacun restreint par pare-feu à l'IP de l'autre serveur. Attention : 8021 est déjà pris par l'ESL FreeSWITCH sur SIPV, jamais réutilisable.

Chaque backend tourne en **deux process uvicorn indépendants** (HTTP + TLS) qui ne partagent aucun état mémoire — tout changement de code partagé exige de redémarrer les deux services, jamais un seul.

**Authentification des endpoints SIPV appelés en proxy par ERPCRM** : doivent dépendre de `get_current_user_or_service` (accepte le header `X-Api-Key` = `settings.ERPCRM_API_KEY`), jamais du strict `get_current_user` (JWT SIPV uniquement) — sinon l'endpoint répond 401 à chaque appel réel depuis ERPCRM, un bug déjà rencontré deux fois (voir `feedback_sipv_erpcrm_auth_dependency`).

Aucune IP codée en dur : toujours `settings.ERPCRM_HOST` / `settings.SIPV_API_URL` côté backend, `import.meta.env.VITE_API_BASE` côté frontend.

## 6. Contrainte produit vendable

Simple IP Platform (ERPCRM + SIPV) est destiné à être **vendu** à d'autres clients, notamment des interconnecteurs de lignes SIP. Chaque acheteur doit pouvoir opérer son instance de façon autonome, sans accès SSH au serveur ni support direct.

Conséquence architecturale : toute intégration externe (OAuth, API tierce, clé de service) doit être **configurable depuis l'UI Admin** (credentials chiffrés en DB, formulaire), avec `.env` en fallback pratique pour l'instance interne Simple IP uniquement — jamais l'inverse. Voir `project_sellable_product_autonomy` pour l'exemple appliqué (`CloudBackupConnection` / `resolve_credentials`).

## 7. Outillage de connaissance et de développement

État vérifié au 2026-08-21 (voir `project_simple_ip_platform_mission_checkpoint` pour le détail complet et les commits git associés) :

- **Serena** (indexation code, MCP) : opérationnel sur les deux dépôts (`serena-erpcrm`, `serena-sipv` via tunnel SSH).
- **Graphiti** (graphe de connaissance, Neo4j) : infrastructure construite et reproductible, mais **non fonctionnelle** — bloquée sur l'attente d'une vraie `OPENAI_API_KEY` (v0.29.3 exige une clé valide au démarrage, contrairement à 0.28.2). Aucune ingestion ni recherche n'a encore été testée. Ne pas revenir à 0.28.2, ne pas patcher pour contourner.
- **Skills et subagents projet** : déployés dans les deux dépôts (`.claude/skills/`, `.claude/agents/`), couvrant vérification runtime, impact cross-système, intégration d'options, migration de tâches, etc.
- **Agent Teams natives** : `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` activé, mais la messagerie directe teammate-à-teammate par nom **ne fonctionne pas** dans cet environnement. Ne jamais présenter de simples subagents lancés par un lead comme une "vraie Agent Team" — utiliser le pattern lead-médiateur documenté dans le skill `debug-with-agent-team` tant qu'une vraie team native n'a pas été prouvée fonctionnelle par un nouveau test.

## 8. Gouvernance documentaire

- `docs/platform/` (ce dépôt, ERPCRM) est l'emplacement canonique de la documentation **commune** ERPCRM + SIPV : `ARCHITECTURE_PLATFORM.md` (ce fichier), `PLATFORM_TASKS.md`, `BUILD_HISTORY.md`, `ERRORS_LESSONS.md`.
- Les documents propres à chaque dépôt (`PLAN_ERPCRM.md`, `CLAUDE.md` côté ERPCRM ; leurs équivalents côté SIPV) restent à la racine de leur dépôt respectif — non déplacés par cette convention.
- **`PLATFORM_TASKS.md` = source active/canonique des tâches** (migration M→P auditée, finalisée en Phase Q). `TASKERPCRM.md`/`TASKSIPV.md` = sources historiques archivées (voir archives Phase N). Toutes les tâches ont été conservées dans `PLATFORM_TASKS.md` ; les renumérotations et redistributions d'identifiants sont tracées explicitement dans `PHASE_O_ID_MAPPING.md`. Plus aucune nouvelle entrée active ne doit être ajoutée aux anciens fichiers.

## Références

Mémoires liées : `project_infrastructure`, `project_sipv_architecture`, `project_erpcrm_entities`, `feedback_sipv_erpcrm_auth_dependency`, `feedback_sipv_must_stay_autonomous`, `project_sellable_product_autonomy`, `project_server_migration_planned`, `feedback_no_hardcoded_ips`, `project_simple_ip_platform_mission_checkpoint`.
