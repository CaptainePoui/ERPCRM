# Plan SIPV — Téléphonie IP

## Infrastructure (serveur 192.168.1.55)

### Installé / opérationnel
- [x] Ubuntu 26.04 "Resolute"
- [x] FreeSWITCH 1.10.12 (compilé depuis sources — `/usr/local/freeswitch/bin/freeswitch`)
- [x] PostgreSQL 18 (DB `freeswitch`)
- [x] Systemd service : `/etc/systemd/system/freeswitch.service`

### FusionPBX — ABANDONNÉ
- Trop contre-intuitif, config éparpillée sur trop de menus
- La DB `fusionpbx` reste sur le serveur mais n'est pas utilisée
- Ne pas réutiliser le schéma FusionPBX

### Notes de compilation FreeSWITCH
- GCC 15 trop strict — flags : `-std=gnu11 -Wno-error`
- Modules désactivés : `mod_shout` (MP3), `mod_spandsp` (fax T.38)
- sofia-sip 1.13.17 compilé depuis `/usr/src/sofia-sip-1.13.17`
- PID file : `/usr/local/freeswitch/run/freeswitch.pid`

---

## Architecture cible

### Principe : portail custom inspiré Grandstream UCM
- Tout ce qui touche une **extension** = sur une seule fiche (codec, voicemail, provisioning, horaires)
- Tout ce qui touche un **DID** = sur une seule fiche (routage, horaires, destination)
- Tout ce qui touche un **trunk** = sur une seule fiche (carrier, credentials, failover)
- Aucun besoin d'aller à 3 endroits pour une config complète

### Couches
```
[React Frontend]  ←→  [FastAPI Backend]  ←→  [FreeSWITCH via ESL]
                              ↕
                       [PostgreSQL — schéma custom]
```

- **ESL (Event Socket Library)** : le backend FastAPI commande FreeSWITCH en temps réel
  - Créer/modifier/supprimer extensions
  - Recharger dialplan à chaud
  - Surveiller appels en cours (CDR live)
  - Recevoir événements (appel entrant, raccroché, etc.)
- **Schéma DB custom** : pas de dépendance aux tables FusionPBX

### Multi-tenant
- `account_number` dans ERPCRM companies = domain FreeSWITCH
- Chaque client = un domain = un tenant isolé

---

## Modules à construire (portail SIPV)

### Backend FastAPI (`~/sipv/backend`, port 8020)
> Inspecter `~/sipv/backend` existant avant de créer quoi que ce soit

| Module          | Description                                                  |
|-----------------|--------------------------------------------------------------|
| Extensions      | Créer/modifier postes SIP — codec, voicemail, PIN, horaires  |
| DIDs            | Numéros entrants — routage, horaires, destination            |
| Trunks          | Carriers (Bell, ISP) — credentials, failover                 |
| Provisioning    | Auto-config Grandstream / Yealink / Fanvil                   |
| CDR             | Historique appels par tenant                                 |
| Portail client  | Vue client — ses propres extensions/DIDs/CDR                 |

### Frontend React
- Vue admin (tous les tenants)
- Vue par tenant (client voit seulement ses données)
- Fiches unifiées (UX type UCM)

---

## Connexion ERPCRM ↔ SIPV
- `settings.SIPV_API_URL` (backend ERPCRM) — jamais d'IP en dur
- SSH entre les deux serveurs : opérationnel
- `account_number` dans ERPCRM companies = domain FreeSWITCH tenant

---

## Prochaines étapes
- [ ] Inspecter `~/sipv/backend` existant
- [ ] Définir schéma DB custom (extensions, DIDs, trunks, tenants)
- [ ] Connexion ESL depuis FastAPI (lib : `greenswitch` ou `esl`)
- [ ] Premier endpoint : lister/créer extensions d'un tenant
- [ ] Fiche extension unifiée (frontend)
