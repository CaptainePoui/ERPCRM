---
name: erpcrm-option-integration
description: Procedure obligatoire pour ajouter ou completer une option ERPCRM liee a la telephonie SIPV. A utiliser des qu'on ajoute un champ, un toggle, ou une fonctionnalite qui doit se repercuter dans SIPV/FreeSWITCH/Kamailio -- pas seulement dans l'interface.
---

# Integration d'une option ERPCRM (avec repercussion SIPV)

Une option n'est jamais terminee parce qu'elle est visible dans l'UI. Elle doit etre tracee jusqu'a son effet reel.

## A -- Identifier avant de coder

Determiner explicitement, sans supposer :

- **Nom** exact de l'option
- **Scope** : PLATFORM / SIPV SERVER / TENANT / EXTENSION / TRUNK / DID / ROUTE / QUEUE / IVR / RING GROUP / PARKING / PAGING / PROVISIONING -- ne jamais supposer que tout appartient au tenant par defaut
- **Type**, valeur par defaut, regles de validation
- **Dependances** avec d'autres options existantes

## B -- Chercher avant de creer (via `verify-before-assume` + Serena)

Chercher l'existant avant d'inventer :
- modele DB (ERPCRM et SIPV -- le champ peut deja exister cote SIPV)
- migration Alembic
- endpoint API existant ou equivalent proche
- schema Pydantic
- service/generateur de config
- composant frontend equivalent (`frontend/src/pages/telephony/` d'abord, pas `CompanyDetail.jsx`)
- template de generation SIPV (dialplan, XML)
- tests existants
- documentation/decisions dans Graphiti et BUILD_HISTORY

## C -- Tracer le flux complet

Toujours etre capable de dessiner et de VERIFIER chaque etape, pas juste l'ecrire :

```
UI -> API -> validation -> DB -> service -> assignation serveur SIPV
   -> generation config -> SIPV cible -> FreeSWITCH/Kamailio -> runtime
```

Ne jamais s'arreter au modele/API en pretendant que c'est termine.

## D -- Questions multi-SIPV obligatoires (voir aussi `multi-sipv-impact`)

- Cette option est-elle globale, par serveur, ou par tenant ?
- Quelle instance SIPV recoit la config ?
- Que se passe-t-il si le serveur cible est indisponible ?
- Les capacites peuvent-elles differer d'un SIPV a l'autre ?

## E -- Definition of Done

Une option n'est consideree terminee que si CHAQUE couche applicable est prouvee, pas juste codee :

- [ ] DB (modele + migration)
- [ ] Backend (endpoint + validation)
- [ ] API testee reellement (requete reelle, pas supposee)
- [ ] Frontend (dans la bonne arborescence -- voir `cross-system-impact`)
- [ ] Generation de config SIPV
- [ ] Effet reel confirme sur SIPV (dialplan/XML genere, ou runtime si applicable)
- [ ] Tests
- [ ] TASKERPCRM.md / TASKSIPV.md mis a jour (procedure existante : chercher le TASK-XXX du module avant de creer un nouveau numero)
- [ ] Graphiti/BUILD_HISTORY si la decision est structurante

## Ne jamais faire

- Ajouter une option "juste visuelle" sans effet reel prevu et documente.
- Supposer qu'un champ va automatiquement au tenant SIPV correspondant sans verifier `sipv_client.py`.
- Dupliquer une validation deja faite cote SIPV.
