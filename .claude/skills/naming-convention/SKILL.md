---
name: naming-convention
description: Procedure obligatoire avant de nommer ou renommer un concept, modele, champ, table, endpoint ou terme d'architecture (ERPCRM/SIPV/plateforme). A utiliser des qu'un nom manque, semble ambigu, ou pourrait entrer en collision avec un concept existant -- avant d'inventer ou de demander un nom. Distinct de la convention de numerotation TASK-XXX/TASK-SXXX (voir CLAUDE.md et feedback_workflow_rules), qui reste la procedure specifique aux IDs de tache.
---

# Trouver ou choisir un nom

Regle fondatrice : ne jamais inventer un nom au hasard, et ne jamais pretendre avoir retrouve un nom original quand on ne l'a pas reellement trouve.

## Quand appliquer cette procedure

**Ne pas declencher pour un nom evident.** Si le nom est deja etabli et conforme au vocabulaire existant (variable locale standard, champ dont le sens ne fait aucun doute, terme deja utilise partout de la meme facon) : l'utiliser directement, pas d'enquete.

Appliquer la procedure complete seulement quand le nom est :
- **nouveau** (aucun concept equivalent n'existe encore),
- **ambigu** (plusieurs lectures possibles),
- **conflictuel** (risque de reprendre un mot deja pris par un autre concept), ou
- **incertain** (un nom "original" est suppose exister mais n'est pas confirme).

Logique resumee :
1. Nom evident et conforme au vocabulaire existant → l'utiliser, fin.
2. Nom incertain/ambigu/nouveau → appliquer la procedure de recherche ci-dessous.
3. Collision trouvee → ne pas reutiliser ce terme.
4. Nom original introuvable → le dire explicitement, puis proposer le nom le plus simple fonde sur les preuves.
5. Decision structurante validee → la documenter (etape 7).

## Procedure, dans cet ordre

1. **Chercher si le nom existe deja** -- dans cet ordre de priorite :
   - `docs/platform/PLATFORM_TASKS.md`
   - `docs/platform/ARCHITECTURE_PLATFORM.md`
   - `docs/platform/BUILD_HISTORY.md`
   - `docs/platform/ERRORS_LESSONS.md`
   - `CLAUDE.md` (ERPCRM et SIPV)
   - skills/agents pertinents (`.claude/skills/`, `.claude/agents/`)
   - code reel ERPCRM + SIPV (Serena `find_symbol`/`get_symbols_overview`, ou grep si Serena indisponible)
   - `TASKERPCRM.md`/`TASKSIPV.md` -- uniquement comme historique, jamais comme source active a jour.

2. **Chercher le vocabulaire deja utilise pour le meme concept** -- nom de modele, table/champ DB, endpoint API, libelle interface utilisateur, terme FreeSWITCH/Kamailio, documentation historique. Un concept peut deja avoir un nom etabli sous une forme differente (ex: table vs endpoint vs libelle UI) -- les reperer tous avant de choisir.

3. **Eviter les collisions de sens** -- verifier explicitement qu'aucun nom candidat n'est deja utilise pour un AUTRE concept. Exemple reel deja rencontre (Phase L, 2026-08-21) : `SipvServer` existait deja cote SIPV avec un sens different (noeud FreeSWITCH interne a une instance, TASK-S042) -- le nouveau concept ERPCRM ("instance de serveur SIPV geree par la plateforme") ne devait donc pas recevoir aveuglement le meme mot.

4. **Privilegier le nom le plus simple qui decrit reellement le concept.** Ne pas ajouter `Instance`/`Manager`/`Entity`/etc. juste pour "faire architecture". Exemple valide : pour identifier un serveur SIPV gere par la plateforme, un code simple (`SIPV001`, `SIPV002`, ...) suffit -- pas besoin d'un modele conceptuel plus complexe (`SipvServerInstance` explicitement ecarte comme sur-ingenierie, decision du 2026-08-21).

5. **Si plusieurs noms restent possibles**, comparer sur des criteres objectifs :
   - coherence avec le vocabulaire deja en place
   - absence de collision de sens
   - comprehensible par un technicien sans explication supplementaire
   - toujours utilisable dans plusieurs annees (pas un nom de circonstance)
   - meme sens cote ERPCRM/SIPV/API/UI quand c'est pertinent (pas un mot different par couche pour la meme chose).

6. **Si le nom original est suppose exister mais reste introuvable**, ne jamais l'inventer en pretendant l'avoir retrouve. Marquer explicitement `NOM ORIGINAL INTROUVABLE`, dire ou la recherche a ete faite (fichiers/dossiers verifies), puis proposer un nouveau nom en suivant les etapes 1 a 5 ci-dessus.

7. **Une fois le nom decide**, l'inscrire dans la documentation canonique appropriee (`ARCHITECTURE_PLATFORM.md` pour une decision d'architecture, `PLATFORM_TASKS.md` pour une tache, `BUILD_HISTORY.md` pour une decision deja construite) -- pour que la prochaine recherche (etape 1) le retrouve immediatement, sans refaire l'enquete.

## Nommer une phase, un travail ou un composant temporaire

Pour un travail identifiable (phase de mission, migration, audit, chantier ponctuel -- PAS un modele/champ/endpoint permanent, voir sections precedentes) : convention deterministe, pour ne plus jamais avoir a retrouver un ancien libellé perdu.

```
<SYSTEME>_<SUJET>_<TYPE/PHASE>_<YYYYMMDD>
```

- `SYSTEME` -- exactement un de : `ERPCRM` (uniquement ERPCRM), `SIPV` (uniquement SIPV), `PLATFORM` (transversal ERPCRM + SIPV).
- `SUJET` -- decrit ce que le travail fait REELLEMENT (le composant ou l'objectif concret), jamais un nom abstrait invente.
- `TYPE/PHASE` -- `PhaseR`, `PhaseS`, etc. si une lettre de continuite du plan est utile a garder ; sinon un type explicite (`Migration`, `Audit`, `Refactor`, ...).
- `YYYYMMDD` -- toujours ce format, pour un tri chronologique naturel.

Exemples : `ERPCRM_Facturation_PhaseR_20260822`, `SIPV_Provisioning_PhaseS_20260822`, `PLATFORM_Graphiti_PhaseT_20260822`, `SIPV_FreeSWITCH_Audit_20260822`.

**Application concrete pour la suite R→W de la mission Simple IP Platform** : si le libelle original exact d'une phase reste introuvable (voir `NOM ORIGINAL INTROUVABLE` ci-dessus), ne pas continuer a chercher indefiniment. Determiner le perimetre reel du travail restant, appliquer cette convention, documenter le nom choisi dans `PLATFORM_TASKS.md`/`BUILD_HISTORY.md`, et continuer. Verifier seulement qu'aucun nom n'existe deja pour exactement le meme objet (etape 1 de la procedure ci-dessus) avant d'en creer un nouveau.

## Ce qu'il ne faut jamais faire

- Deviner un nom "plausible" et le presenter comme si c'etait le nom original ou deja etabli.
- Reutiliser un mot deja pris par un autre concept sans verifier la collision (voir etape 3).
- Ajouter de la complexite conceptuelle (`Instance`/`Manager`/couches d'abstraction) sans besoin demontre (voir LOI 4, zero supposition).
- Refaire cette recherche a chaque fois qu'un nom deja decide est reutilise -- une fois documente (etape 7), le chercher d'abord (etape 1) avant de la relancer.
