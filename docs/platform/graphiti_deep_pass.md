# Passe en profondeur — dépendances Graphiti

Checklist de suivi pour ajouter les relations manquantes entre les 63 concepts déjà présents dans Graphiti (`group_id=platform`). Un nœud à la fois, dans l'ordre ci-dessous — ne pas sauter, ne pas paralléliser. Objectif : Graphiti devient l'index du projet avec ses vrais liens de dépendance, sans relire le projet en entier à chaque fois.

**Méthode par nœud** (voir aussi `.claude/skills/graphiti-knowledge/SKILL.md`) :
1. Lire le vrai code du module (modèles, FK, endpoints) — pas deviner.
2. `search_memory_facts` centré sur ce nœud pour voir ce qui existe déjà — ne jamais dupliquer.
3. Écrire (`fast_write.py`) seulement les relations manquantes qui expliquent un vrai "pourquoi" (pas un dump mécanique de chaque FK), avec provenance (fichier ou TASK-XXX).
4. Revérifier avec `search_memory_facts` que le fait écrit est bien lisible.
5. Cocher `[x]` ici, avec la date.

Généré le 2026-09-10 depuis une requête directe Neo4j (`tools/knowledge/graphiti/scripts/list_all_nodes.py`) — `degré` = nombre de relations déjà existantes au moment de la génération, indicatif seulement (change au fur et à mesure de la passe).

---

## Meta / structure du graphe (9)

- [x] Captaine (degré 23 → 26, complété 2026-09-10) — 19 vrais faits déjà présents (4 des 23 étaient des liens de provenance `MENTIONS`, pas des faits), 3 ajoutés : refus des menus à choix multiples, direction générale ≠ GO pour une action concrète, toujours nommer un TASK-XXX avec son titre
- [x] Claude (degré 14, complété 2026-09-10) — miroir des 12 faits Captaine EXPECTS + 3 ponts directs ERPCRM/SIPV/DashV16, déjà complet, rien ajouté
- [x] Simple IP (degré 5, complété 2026-09-10) — compagnie de Captaine, contient ERPCRM+SIPV, produit vendable, déjà complet, rien ajouté
- [x] ERPCRM (degré 28, complété 2026-09-10) — 24 modules CONTAINS, complet, rien ajouté. Correction : "Synchronisation" (listé plus bas par erreur sous ERPCRM) appartient en fait a SIPV (sync.py/erpcrm_client.py vérifiés absents du repo ERPCRM) — voir section SIPV — Téléphonie et outillage
- [x] SIPV (degré 20 → 43, complété 2026-09-10) — gros trou trouvé : seulement 7/29 modules reliés (CONTAINS). 22 relations manquantes ajoutées (SecuriteSIPV, Boutons, Extensions, PagingGroups, Provisioning, Queues, RingGroups, Voicemail, DIDs, Horaires, Routes, Tarifs, Trunks, AudioPrompts, CDR, E911, Enregistrements, Fax, IVR, MOH, ParkingLots, PendingChange, SMS), chacune avec sa genèse TASK-SXXX vérifiée dans PLATFORM_TASKS.md, relues et confirmées
- [x] DashV16 (degré 3, complété 2026-09-10) — hors scope réel (autre projet), déjà correct, rien ajouté
- [x] Crypto (degré 2 → 3, complété 2026-09-10) — lien manquant vers Captaine ajouté (structure Captaine→Crypto→DashV16 documentée dans SKILL.md mais pas câblée)
- [x] Musique (degré 3, complété 2026-09-10) — hors scope réel, déjà correct, rien ajouté
- [x] Suno (degré 2, complété 2026-09-10) — hors scope réel, déjà correct, rien ajouté

## ERPCRM — Cœur métier (13)

- [x] Adresses (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Catalogue (degré 10, complété 2026-09-10) — complet, rien ajouté
- [x] Compagnies (degré 24, complété 2026-09-10) — complet, rien ajouté
- [x] Contacts (degré 12, complété 2026-09-10) — complet, rien ajouté
- [x] Devis (degré 4, complété 2026-09-10) — complet, rien ajouté
- [x] Facturation (degré 16, complété 2026-09-10) — complet, rien ajouté
- [x] Journal (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Paiements (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Portail (degré 4, complété 2026-09-10) — complet, rien ajouté
- [x] Recurrence (degré 8, complété 2026-09-10) — complet, rien ajouté
- [x] Succursales (degré 6, complété 2026-09-10) — complet, rien ajouté
- [x] Ticket (degré 9, complété 2026-09-10) — complet, rien ajouté
- [x] Users (degré 6, complété 2026-09-10) — complet, rien ajouté

## ERPCRM — Opérations (6)

- [x] Agenda (degré 5, complété 2026-09-10) — complet, rien ajouté
- [x] Employes (degré 2, complété 2026-09-10) — complet, rien ajouté
- [x] Equipements (degré 2, complété 2026-09-10) — complet, rien ajouté
- [x] Maintenance (degré 2, complété 2026-09-10) — complet, rien ajouté
- [x] Photos (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Taches (degré 7, complété 2026-09-10) — complet, rien ajouté

## ERPCRM — Achats / e-commerce (2)

- [x] Commandes_fournisseurs (degré 4, complété 2026-09-10) — complet, rien ajouté
- [x] Ecom (degré 3, complété 2026-09-10) — complet, rien ajouté

## ERPCRM — Téléphonie et outillage (3)

- [x] Backup (degré 2, complété 2026-09-10) — complet, rien ajouté
- [x] Rapports_CDR (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Telephonie (degré 7, complété 2026-09-10) — complet, rien ajouté

## SIPV — Fondation (6)

- [x] Acces_Backoffice_SIPV (degré 1, complété 2026-09-10) — leaf legitime (systeme independant), rien ajouté
- [x] ReglagesGlobaux_SIPV (degré 1 → 2, complété 2026-09-10) — chaîne d'héritage Global→Tenant→Poste ajoutée (mentionnée en texte mais jamais câblée)
- [x] SecuriteSIPV (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Serveur_SIPV (degré 3, complété 2026-09-10) — complet, rien ajouté
- [x] Synchronisation (degré 8, complété 2026-09-10) — complet, rien ajouté
- [x] Tenant (degré 24, complété 2026-09-10) — très riche, quasi tous les modules SIPV déjà HAS depuis Tenant (niveau instance-par-tenant), complète bien le niveau SIPV CONTAINS (module-existe) ajouté plus haut

## SIPV — Postes et groupes (8)

- [x] Boutons (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté (déjà 3 relations vues via Provisioning)
- [x] Extensions (degré 11 → 12, complété 2026-09-10) — complet, rien ajouté
- [x] Interception (degré 2, complété 2026-09-10) — complet, rien ajouté
- [x] PagingGroups (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] Provisioning (degré 5 → 6, complété 2026-09-10) — complet, rien ajouté
- [x] Queues (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] RingGroups (degré 4 → 5, complété 2026-09-10) — complet, rien ajouté
- [x] Voicemail (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté

## SIPV — Routage et trunks (5)

- [x] DIDs (degré 5 → 6, complété 2026-09-10) — complet, rien ajouté
- [x] Horaires (degré 4 → 5, complété 2026-09-10) — complet, rien ajouté
- [x] Routes (degré 3 → 4, complété 2026-09-10) — complet, rien ajouté
- [x] Tarifs (degré 1 → 2, complété 2026-09-10) — complet, rien ajouté
- [x] Trunks (degré 4 → 5, complété 2026-09-10) — complet, rien ajouté

## SIPV — Fonctionnalités (11)

- [x] AudioPrompts (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] CDR (degré 3 → 4, complété 2026-09-10) — complet, rien ajouté
- [x] E911 (degré 5 → 6, complété 2026-09-10) — complet, rien ajouté
- [x] Enregistrements (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] Fax (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] IVR (degré 2 → 3, complété 2026-09-10) — complet, rien ajouté
- [x] MOH (degré 1 → 2, complété 2026-09-10) — complet, rien ajouté
- [x] ParkingLots (degré 1 → 2, complété 2026-09-10) — complet, rien ajouté
- [x] PendingChange (degré 1 → 2, complété 2026-09-10) — corrigé le même jour (test du réflexe d'écriture) : le fait `SIPV CONTAINS` référençait TASK-S017 comme si le sujet était actif, alors que TASK-S017 est classé LEGACY-ASTERISK (jamais réactiver) et le vrai backlog ouvert est TASK-S023 — fait mis à jour en place (pas de duplicata), vérifié par relecture
- [x] SMS (degré 1 → 2, complété 2026-09-10) — complet, rien ajouté
- [x] Webhooks (degré 1, complété 2026-09-10) — complet, rien ajouté (module confirmé non-fonctionnel, pas de sur-documentation ajoutée)

---

## Progression

**PASSE TERMINÉE — 63/63 nœuds, 2026-09-10.**

Résumé :
- **Meta (9)** : Captaine (+3 faits), Claude (complet), Simple IP (complet), ERPCRM (complet, correction classement Synchronisation), SIPV (**+22 relations CONTAINS manquantes** — le vrai trou de la passe), DashV16/Musique/Suno (complets, hors scope réel), Crypto (+1 lien vers Captaine).
- **ERPCRM (25 modules)** : déjà quasi complet depuis la reconstruction initiale (TASK-040.5) — rien ajouté sur aucun des 25.
- **SIPV (28 modules restants après Synchronisation)** : 22 liens `SIPV CONTAINS X` ajoutés (module manquait au niveau système), + 1 lien chaîne d'héritage réglages. Le niveau "instance par tenant" (`Tenant HAS X`) était déjà quasi complet — c'est le niveau "le module existe dans le système" qui manquait, pas la profondeur des relations entre modules eux-mêmes (déjà très bonnes : Extensions↔RingGroups/Queues/Voicemail/Provisioning/Trunks/Horaires/E911/SecuriteSIPV, DIDs↔Routes/E911/Fax, etc.)

**Conclusion** : le vrai trou de "pas allé en profondeur" était structurel (modules SIPV jamais rattachés au nœud SIPV lui-même), pas un manque de détail — les relations fines entre modules SIPV étaient déjà largement présentes via Tenant.

**Méthode qui a fonctionné** : `tools/knowledge/graphiti/scripts/list_node_facts.py` (requête directe Neo4j, liste TOUTES les relations d'un nœud — plus fiable que `search_memory_facts`, semantique/BFS, pas garanti exhaustif). Réécrit en cours de route pour se connecter directement au driver Neo4j (variables d'env déjà dans le conteneur) plutôt que de passer par `graphiti_mcp_server.initialize_server()` (charge inutilement le reranker BGE ~2.3 Go à chaque appel — a causé un kill pour mémoire basse après plusieurs appels rapprochés).

**Prochaine étape possible** : créer les règles d'usage de Graphiti (comment et quand l'interroger/l'alimenter au quotidien) — voir demande de Philippe.
