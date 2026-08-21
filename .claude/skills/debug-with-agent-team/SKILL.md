---
name: debug-with-agent-team
description: Quand et comment utiliser plusieurs agents independants pour un probleme complexe (hypotheses concurrentes, SIP/FreeSWITCH/Kamailio difficile, contradiction importante, Claude qui tourne en rond). A utiliser pour les problemes couteux a se tromper, pas pour les taches routinieres.
---

# Debug avec plusieurs agents

## Limitation connue de cet environnement (verifiee reellement, pas supposee)

La messagerie directe teammate-a-teammate par nom (mecanisme "Agent Teams" documente officiellement par Claude Code) a ete testee reellement le 2026-08-21 dans cet environnement et **ne fonctionne pas** -- `SendMessage` par nom echoue systematiquement ("No agent named ... is reachable"). Cause probable : l'outil `Agent` disponible ici n'expose pas de parametre `name` explicite au moment du spawn, contrairement au CLI Claude Code standard.

**Consequence pratique : ne pas promettre une vraie "team" qui se coordonne seule.** Le pattern qui fonctionne reellement ici est le **lead-mediateur** : plusieurs agents `Agent` lances en parallele, independants, qui rapportent chacun au lead (moi) ; c'est le lead qui compare, contredit et synthetise -- pas les agents entre eux.

## Quand favoriser plusieurs agents (cout token secondaire face a un vrai probleme)

- Debugging avec hypotheses concurrentes
- Probleme SIP/FreeSWITCH/Kamailio/RTPengine/NAT/media difficile
- Modification cross-layer ERPCRM <-> SIPV
- Contradiction importante entre deux sources
- Claude tourne en rond sur le meme probleme

## Methode (lead-mediateur)

1. Formuler une question factuelle precise et verifiable, pas vague.
2. Lancer 2+ agents independants avec le meme objectif mais des instructions explicitement adversariales (l'un cherche a confirmer, l'autre cherche a refuter) -- prompts self-contained, ils ne partagent pas mon contexte.
3. Un agent explicitement "skeptic" : ne code pas, cherche uniquement la preuve manquante dans les conclusions des autres.
4. Attendre les notifications reelles (ne jamais fabriquer un resultat avant qu'il arrive).
5. Comparer moi-meme les conclusions, chercher les contradictions, rendre un verdict avec le vocabulaire de `verify-before-assume` (PROUVE/TRES PROBABLE/HYPOTHESE/REFUTE).

## Ne jamais faire

- Affirmer qu'une "vraie team" a communique entre elle sans l'avoir prouve (cf. test du 2026-08-21).
- Lancer un debug multi-agent pour une tache routiniere -- cout token trop eleve pour la valeur.
