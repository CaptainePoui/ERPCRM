# Banc d'essai des modèles de Zéko — résultats (TASK-006.10)

Fichier permanent des résultats du banc. Une section par passe ; les réponses brutes complètes sont dans `brut/`, les scripts dans `scripts/`.
Tâches liées : TASK-006.10 (banc, aiguilleur, banc de nuit), TASK-006.12 (plus de limite de temps), TASK-053.

## Conditions
- Machine : VM 188 « Zeko » (192.168.1.88) sur le P720 : RTX 3060 Ti 8 Go, 96 Go de mémoire pendant le banc, Ollama 0.40.13. Les modèles de plus de 8 Go roulent en partie sur le processeur.
- Vraies consignes (`SYSTEM` de `endpoints/zeko.py`), vrais outils (`core/zeko_tools.py`), vraies données ERPCRM en lecture. Les outils qui modifient (agenda, retenir, postes, etc.) ne sont JAMAIS exécutés : ils répondent « TEST : outil de modification non exécuté ». Session de base annulée (rollback) après chaque question.
- Lot 1 et lot 2 : 8 tours d'outils au plus, délai 3600 s. Passes 2 et 3 : 20 tours (comme Zéko depuis TASK-006.12), aucune limite de temps, Q3 retirée.
- Température 0,3. Réglage de réflexion indiqué entre parenthèses (low, high, none ; « aucune » = réglage non envoyé).
- Tailles réelles des modèles : gpt-oss:120b 65 Go ; llama3.1:70b 42 ; nemotron-3-nano:30b 24 ; qwen3.5:35b-a3b 22 ; gemma4:31b 20 ; glm-4.7-flash 19 ; deepseek-r1:32b 19 ; qwen3.5:27b 17 ; mistral-small3.2:24b 15 ; gpt-oss:20b 13 ; qwen3:14b 9,3.

## Questions et réponses de référence (vérifiées dans les courriels)
- **Q1** « Qu'est-ce que Jean-François de Nanotech m'a écrit pour la mémoire vive du serveur P720, et combien ça coûtait de plus ? » → Jean-François Lane, 15 oct. 2026 : retirer les 4x16 Go pour 4x32 Go, **+600 $** pour passer de 64 à 128 Go (aussi le 19 oct. 12:40 : mémoire ECC obligatoire, pas de DDR3 avec de la DDR4). Piège : le 19 oct. 14:06, c'est Philippe qui parle de la DDR3 de son ANCIEN serveur.
- **Q2** « Qu'est-ce que tu sais sur le client D Astous Auto ? » → t1033, actif, 514-645-5115, 11399 R. Sherbrooke E, Montréal-Est H1B 1B8, aucun contact, aucun ticket, aucune facture impayée, pas de téléphonie.
- **Q3** (retirée) « Quels postes a Simple IP… » : les postes de Simple IP ont été déplacés dans « AAA Compagnie test » (t1000).
- **Q4** « Mets-moi un dîner avec Jean-François de Nanotech mardi prochain à midi. » → mardi 3 novembre 12:00. Non comptée : le banc bloque l'outil d'agenda au complet, le modèle ne reçoit jamais la question de l'outil. À refaire avec un banc qui laisse l'outil vérifier sans écrire.
- **Q5** calcul canaux/DID → coût **18,50 $**/mois, vente **30,83 $** (18,50 / 0,60).
- **Q6** « Est-ce que Jérémie de Nanotech m'a envoyé une soumission corrigée pour les processeurs ? » → oui, Jérémie Deschênes, 23 oct., `12781corr.pdf` : **2x Gold 6148** au lieu de 2x Gold 4110 (la soumission disait bien Gold 4110).

## Lot 1 et lot 2 (2026-10-30 et 31) : tous les modèles, une passe
| Modèle | Constat |
|---|---|
| gemma4:31b (low) | Q1, Q2, Q5, Q6 justes ; lent (2 à 11 min par question) |
| gpt-oss:120b (high) | Q2, Q5, Q6 justes ; Q1 tourne sans répondre |
| gpt-oss:120b (low) | rapide (10 à 40 s) mais paresseux : une recherche puis « rien trouvé » (Q1, Q6) ; « Nanotech introuvable » à Q4 |
| qwen3.5:35b-a3b (low) | Q1 et Q5 justes ; Q2 et Q3 vides (réponse écrite dans `reasoning`, `content` vide) ; Q6 « rien trouvé » |
| gpt-oss:20b (high) | Q2, Q5, Q6 justes ; Q1 tourne sans répondre |
| gpt-oss:20b (low) | Q1 et Q6 « rien trouvé » |
| qwen3.5:27b | lent (3 à 12 min) et faible (Q1, Q6 « rien trouvé ») |
| qwen3:14b | Q1 demande quel Jean-François ; Q6 « rien trouvé » |
| glm-4.7-flash | Q5 faux (46,25 $) ; Q1 « rien trouvé » ; Q6 tourne sans répondre |
| nemotron-3-nano:30b | trop timide : demande la permission même pour lire |
| mistral-small3.2:24b | **invente** « Jean-François Gagnon » (le vrai nom est Lane) : éliminé |
| deepseek-r1:32b | **invente** : éliminé |
| llama3.1:70b | **invente**, le plus lent : éliminé |

Réponses vides de qwen3.5:35b-a3b : ERPCRM lit seulement `content` (`core/zeko.py`). Avec la réflexion `none` : plus de réponses vides, mais voir passe 2.

## Passes 2 et 3 (2026-10-31) : constance des 4 meilleurs
Légende : ✅ juste · ❌R « rien trouvé » à tort · ❌M mélange · ❌I invente · ❌B boucle sans réponse · ❌V vide · ❌C mauvais calcul · ❌P demande la permission au lieu d'agir

| Modèle (réglage) | Passe | Q1 | Q2 | Q5 | Q6 | Justes |
|---|---|---|---|---|---|---|
| gemma4:31b (low) | 1 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| gemma4:31b (low) | 2 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| gemma4:31b (low) | 3 | ✅ | ✅ | ✅ | ✅ | 4/4 |
| gpt-oss:120b (high) | 1 | ❌B | ✅ | ✅ | ✅ | 3/4 |
| gpt-oss:120b (high) | 2 | ❌M | ✅ | ✅ | ✅ | 3/4 |
| gpt-oss:120b (high) | 3 | ❌P | ✅ | ✅ | ✅ | 3/4 |
| gpt-oss:20b (high) | 1 | ❌B | ✅ | ✅ | ✅ | 3/4 |
| gpt-oss:20b (high) | 2 | ❌B | ❌V | ✅ | ❌V | 1/4 |
| gpt-oss:20b (high) | 3 | ⚠️500 | ✅ | ✅ | ✅ | 3/3 |
| qwen3.5:35b-a3b (low) | 1 | ✅ | ❌V | ✅ | ❌R | 2/4 |
| qwen3.5:35b-a3b (none) | 2 | ❌P | ✅ | ❌P | ❌R | 1/4 |
| qwen3.5:35b-a3b (low) | 3 | ❌R | ❌V | ✅ | ❌R | 1/4 |

## Total sur 3 passes (Q1, Q2, Q5, Q6)
| Modèle | Justes | Q1 seule | Remarque |
|---|---|---|---|
| gemma4:31b (low) | **12/12** | 3/3 | Seul modèle parfait et constant ; 3 à 11 min par question |
| gpt-oss:120b (high) | 9/12 | 0/3 | Q2, Q5, Q6 toujours justes ; Q1 jamais (boucle, mélange, permission) |
| gpt-oss:20b (high) | 7/11 | 0/2 | Instable (+1 erreur 500 d'Ollama non comptée, cause non journalisée) |
| qwen3.5:35b-a3b | 4/12 | 1/3 | low : 3/8 ; none : 1/4 |

Notes passe 3 :
- gemma Q1 ajoute « ECC » et « pas de DDR3 avec de la DDR4 » : VRAI (Jean-François, 19 oct. 12:40).
- gpt-oss:20b Q6 nomme l'ancien processeur « Silver 4110 » (la soumission disait Gold 4110 ; Silver vient de l'offre du 15 oct.) : compté juste, petite imprécision.
- qwen3.5 (low) Q4 : affirme « mis à l'agenda, ticket créé » alors que l'outil a répondu « non exécuté » : prétend une action non faite (Q4 non comptée, mais grave).
- gpt-oss:20b Q4 : « mardi 4 novembre » (mauvaise date, mardi = 3 nov.).
- Correction passe 2 : le mélange de gpt-oss:120b vient du courriel de Philippe du 19 oct. 14:06 (DDR3 de l'ancien serveur), pas du 21 oct.

## Conclusions (2026-10-31)
- **gemma4:31b** : seul modèle parfait et constant (12/12) ; candidat principal pour le travail de nuit (la lenteur ne compte pas en arrière-plan).
- **gpt-oss:120b (high)** : fiable pour les calculs et les résumés de fiche, jamais juste pour chercher dans les courriels (Q1) ; prend 65 Go de mémoire.
- **qwen3.5:35b-a3b** et **gpt-oss:20b** : écartés pour l'instant. Le réglage `none` n'est pas la solution aux réponses vides : garder la réflexion et ajouter une relance « écris ta réponse » quand `content` est vide.
- Défaut le plus fréquent : abandonner trop vite (« je ne trouve rien » alors que le courriel existe). Ce n'est pas une invention, mais ça trompe autant.
- Défaut d'outil trouvé : la sortie de `chercher_courriels` est coupée au milieu du JSON quand il y a beaucoup de résultats ; les modèles reçoivent une liste tronquée.
- Deux ou trois passes ne suffisent pas : prochaine étape = 5 à 10 questions par catégorie, passées plusieurs fois, avec vérification automatique (TASK-006.10 étape 3).
