# BUILD_HISTORY.md

Document canonique — `docs/platform/`, dépôt ERPCRM. Reçoit ce qui a été réellement construit au niveau architecture de Simple IP Platform : décision retenue, pourquoi, fichiers principaux, état actuel. Ce n'est PAS un journal de chaque tâche (voir `PLATFORM_TASKS.md` pour le détail complet des 97+ tâches migrées) — uniquement les décisions structurantes, sourcées et vérifiées. Format par entrée : Décision / Pourquoi / Fichiers principaux / État actuel. Aucune section inventée : "Non documenté" plutôt que deviné.

---

## 1. Séparation Control Plane (ERPCRM) / Telephony Plane (SIPV)

**Décision retenue** : deux dépôts et deux serveurs volontairement séparés, jamais fusionnés. ERPCRM = Control Plane (ERP/CRM, gestion compagnies/contacts/tenants, orchestration). SIPV = Telephony Plane (moteur téléphonie multi-tenant, FreeSWITCH + portail custom React/FastAPI piloté via ESL).

**Pourquoi** : SIPV doit pouvoir déménager de serveur indépendamment d'ERPCRM (migration planifiée ~2026-08-29) sans aucune dépendance croisée. Produit destiné à être vendu à d'autres clients — chaque instance doit pouvoir être opérée de façon autonome.

**Fichiers principaux** : `ARCHITECTURE_PLATFORM.md` §1, §3 (ce dépôt) ; topologie `/home/simpleip/erpcrm` (192.168.1.9) et `/home/sipv/sipv` (192.168.1.55, hostname `sipv-lab`).

**État actuel** : PROUVÉ, en place depuis la genèse du projet. Lien concret entre les deux plans : `Company.account_number` ↔ tenant SIPV (ex. `t1001`).

---

## 2. Canaux de communication ERPCRM ↔ SIPV (HTTP + TLS séparés)

**Décision retenue** : deux process uvicorn indépendants par backend — HTTP applicatif (ERPCRM 8010, SIPV 8020) pour les frontends respectifs, TLS serveur-à-serveur (ERPCRM 8011, SIPV 8022) pour tout transport de données sensibles entre les deux plans.

**Pourquoi** : isoler le trafic serveur-à-serveur du trafic frontend, restreindre par pare-feu à l'IP de l'autre serveur uniquement. Ajouté en TASK-S039.1.

**Fichiers principaux** : `erpcrm-backend-tls.service`, `sipv-backend-tls.service` ; `ARCHITECTURE_PLATFORM.md` §5.

**État actuel** : PROUVÉ, en place. Les deux process ne partagent aucun état mémoire — tout changement de code partagé exige de redémarrer les deux services, jamais un seul (piège déjà rencontré, voir `ERRORS_LESSONS.md`).

---

## 3. Autonomie stricte de SIPV (pas de mirroring)

**Décision retenue** : SIPV doit rester 100% autonome pour son propre fonctionnement, dépôt git, backups et déploiement — jamais de copie/miroir de code ou config d'un dépôt sur le disque de l'autre. Tout accès externe (GitHub, cloud, API tierce) nécessaire à SIPV doit être configuré et exécuté depuis SIPV lui-même.

**Pourquoi** : SIPV va déménager sur un autre serveur ; toute dépendance croisée casse cette indépendance au moment du déménagement. Le proxy applicatif ERPCRM→SIPV pour l'UI (`sipv_client.py`) reste acceptable — SIPV demeure l'unique détenteur de ses propres données/secrets.

**Fichiers principaux** : `ARCHITECTURE_PLATFORM.md` §4.

**État actuel** : PROUVÉ. Règle établie après un incident réel (2026-08-16, miroir de code SIPV trouvé sur ERPCRM, supprimé le même soir, accès GitHub direct reconfiguré depuis SIPV — voir `ERRORS_LESSONS.md`).

---

## 4. Architecture cible multi-SIPV — 1 ERPCRM → N SIPV

**Décision retenue** : la plateforme doit pouvoir gérer plusieurs serveurs SIPV depuis un seul ERPCRM (identifiants simples `SIPV001`, `SIPV002`, etc.), pas un modèle conceptuel complexe. `SIPV-LAB` (192.168.1.55) est aujourd'hui la seule instance déployée mais représente une instance du concept générique "serveur SIPV", jamais un synonyme de SIPV en tant que produit.

**Pourquoi** : architecture produit à long terme (le besoin concret d'un 2e serveur physique n'arrivera probablement que dans plusieurs années, mais la base doit être posée sans sur-ingénierie).

**Fichiers principaux** : `ARCHITECTURE_PLATFORM.md` §3 ; audit complet Phase L (2026-08-21, agent `multi-sipv-architect`, read-only).

**État actuel** : **CURRENT_SINGLE_SIPV_LIMITATION, PROUVÉ (audit Phase L)**. Le code actuel est un cas particulier strict de la cible — l'écart est concentré presque entièrement dans une seule couche : `backend/app/core/sipv_client.py` (126 sites utilisant `settings.SIPV_API_URL` unique) + `backend/app/core/config.py` (`SIPV_API_URL`/`SIPV_API_KEY`/`ERPCRM_API_KEY`, 3 settings globaux) + absence de FK côté `Company` vers un serveur SIPV. Aucune autre couche métier (modèles, endpoints, jobs) n'a de logique de routage propre à corriger séparément. Tâches de mise en œuvre : voir `PLATFORM_TASKS.md`, section `[ARCH]` (`TASK-ARCH-001` à `TASK-ARCH-007`). Aucun code écrit pour cette cible à ce jour.
