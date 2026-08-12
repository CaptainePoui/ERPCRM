# Plan SIPV — Téléphonie IP

> Dernière vérification de l'état réel : 2026-08-12
> Ce PLAN est une carte actuelle du projet, pas une preuve runtime.
> Si une information technique doit servir à une décision ou un debug,
> la vérifier dans le code/config/runtime.

## Infrastructure (serveur 192.168.1.55)
- Ubuntu 26.04, FreeSWITCH 1.10.12 (compilé sources), PostgreSQL 18
- Kamailio 6.0.5 + rtpengine 13.5.1.4 (apt universe) — SBC en façade, ajouté TASK-S039
- FusionPBX — ABANDONNÉ (DB `fusionpbx` présente mais inutilisée, ne pas réutiliser le schéma)

## Architecture EN PLACE (vérifiée 2026-08-12)
```
[Téléphone] ←TLS→ [Kamailio :5060/5061] ←loopback→ [FreeSWITCH :127.0.0.1]
                          │                                │
                    (signalisation)                   [ESL] → [FastAPI :8020] → [PostgreSQL]
                          │
                   média RTP : DIRECT téléphone↔FreeSWITCH
                   (rtpengine installé, service actif, mais rtpengine_manage()
                    commenté dans kamailio.cfg — PAS dans le chemin média actuellement)
```
Kamailio gère : NAT (Path header RFC 3327), TLS end-to-end (jamais de terminaison en clair), relais transparent vers FreeSWITCH.

Validé avec vrais téléphones (GXP2170/GXP2135, 102/103), 2026-08-11/12 : registration, appel interne bidirectionnel, Hold, MOH — tous fonctionnels après la session de bugs TASK-S058.

## Décisions architecturales
- TLS bout en bout Kamailio→FreeSWITCH obligatoire (terminer en clair casse `sip_via_protocol` dans `xml_curl.py`, tous les postes TLS échoueraient silencieusement)
- SRTP : `mandatory` à l'établissement, `optional` après réponse (`execute_on_answer`) — mécanisme permanent pour permettre le Hold sans exiger crypto sur le re-INVITE
- `hold_music` via `file_string://`, jamais `local_stream://` (ne redémarre pas à zéro sinon)
- Commentaires XML dans les réponses `xml_curl` : jamais de `--` (casse le XML, fait échouer TOUS les REGISTER)
- Héritage via `resolve_setting()` (`core/settings_resolver.py`) : Poste → Compagnie → Global actuellement (voir usages dans `voicemail.py`, `xml_curl.py`) ; `ExtensionProfile` prévu comme niveau intermédiaire dans le docstring de la fonction, mais pas encore créé comme modèle — ne pas présumer qu'il existe
- Fichiers serveur manuels (`kamailio.cfg`, `internal.xml`, `vars.xml`) — PAS dans ce dépôt git, backups `.bak-<date>` avant toute modif

## Contraintes actuelles / à revalider avant changement
- `rtpengine_manage()` reste désactivé — pas une décision définitive, c'est l'état post-incident S058.2 (activation silencieuse antérieure a causé un bug de silence audio, jamais validée avec un test complet). Ne pas réactiver sans un test audio complet dédié.
- Provisioning transport SIP (TASK-S057) : pas automatisé, contournement manuel appareil par appareil en attendant.

## Backlog actif (statut réel TASKSIPV.md, 2026-08-12)
| Tâche | Statut | Sujet |
|---|---|---|
| S018.3 | `[ ]` | Fiche extension — identification, plan d'appel, renvois, DND |
| S023.9 | `[~]` | Ring groups — priorité/ordre/exclusion/horaire |
| S011.3 | `[!]` | Config visuelle modèle téléphone — bug connu |
| S011.4 | `[~]` | Auto-provisioning Grandstream zero-touch |
| S014.2 | `[~]` | Sécurité — whitelist/blacklist + seuils F2B |
| S020.2 | `[~]` | Monitoring poste temps réel |
| S023.31 | `[~]` | Boîte vocale — bug critique corrigé, reste incomplet |
| S042 | `[~]` | Fondation multi-serveur |
| S043 | `[ ]` | Architecture 3 couches — 1/6 items fait (Templates, via S044/.1/.2), 5 restants non commencés |
| S040 / S040.1 | `[ ]` | App SIP mobile + softphone desktop — pas commencé |
| S057 | `[ ]` | Provisioning transport SIP — pas commencé, contournement manuel en place |

## Prochaine étape
Non tranchée dans TASKSIPV.md — à confirmer avec Philippe.
