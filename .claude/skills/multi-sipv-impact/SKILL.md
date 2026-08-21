---
name: multi-sipv-impact
description: Audit des hypotheses implicites "1 ERPCRM = 1 SIPV" dans le code. A utiliser pour tout changement transversal ERPCRM<->SIPV, ou pour auditer si une fonctionnalite existante bloquerait le passage a plusieurs serveurs SIPV geres par le meme ERPCRM.
---

# Impact multi-SIPV

L'architecture cible est **1 ERPCRM -> N SIPV** (voir ARCHITECTURE_PLATFORM.md). Le code actuel peut encore supposer 1:1 -- c'est attendu, mais il faut le savoir et le documenter, pas le decouvrir en production.

## Ne jamais confondre

`SIPV` (le type/concept de serveur) et `192.168.1.55` / `SIPV-LAB` (UNE instance). Une instance a un nom (aujourd'hui SIPV-LAB), pas juste une IP.

## Ce qu'il faut chercher a chaque changement transversal

- IP ou FQDN d'un serveur SIPV hardcode (au lieu de `settings.SIPV_API_URL`)
- Credential SIPV global au lieu de par-serveur
- Absence de `server_id`/notion d'instance sur une entite qui devrait en avoir une (Tenant notamment)
- Generateur de config qui suppose une seule destination
- Job de fond (background job) sans notion de serveur cible
- Monitoring/statut non scope par serveur
- Cache non scope par serveur

## Classification obligatoire de chaque decouverte

- `ALREADY_MULTI_SIPV_COMPATIBLE`
- `CURRENT_SINGLE_SIPV_LIMITATION`
- `HARDCODED_1_TO_1`
- `TARGET_NOT_IMPLEMENTED`
- `UNCERTAIN`
- `NOT_RELEVANT`

## Questions a poser pour toute option touchant SIPV

- Cette option est-elle globale, par serveur, ou par tenant ?
- Comment le tenant choisit-il son serveur SIPV cible ?
- Que se passe-t-il avec plusieurs SIPV geres par le meme ERPCRM ?
- Que se passe-t-il si le serveur cible est indisponible ?
- L'erreur retournee identifie-t-elle clairement le serveur en cause ?

## Ne pas refactorer en reaction

Un audit qui trouve 30 endroits a corriger ne doit PAS declencher 30 corrections immediates. Documenter chaque trouvaille comme tache dans PLATFORM_TASKS.md avec scope `[ARCH]` ou `[SHARED]`, pas la corriger sur le coup sauf demande explicite.
