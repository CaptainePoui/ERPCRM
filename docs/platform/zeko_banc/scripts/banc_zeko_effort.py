"""Banc d'essai des modeles pour Zeko (2026-10-30) : vraies consignes, vrais outils, vraies donnees en lecture.
Les outils qui changent quelque chose ne sont JAMAIS executes. Session de base annulee a la fin (rollback)."""
import asyncio, json, sys, time
import httpx
sys.path.insert(0, "/home/simpleip/erpcrm/backend")
from app.core.database import AsyncSessionLocal
from app.core import zeko_tools
from app.api.v1.endpoints.zeko import SYSTEM

import os
EFFORT = os.environ.get("EFFORT", "low")
URL = "http://127.0.0.1:11435/v1/chat/completions"      # tunnel SSH vers Ollama de Zeko (.88)
USER_ID = "d1ba78ea-f3b6-47f9-9e64-c85e1b5aea4e"           # Philippe
BLOQUES = {"retenir", "oublier", "changer_regle_banque", "changer_nom_client", "ajouter_ancienne_info",
           "mettre_agenda", "creer_poste", "regler_poste", "ouvrir_page"}
SYS = SYSTEM + " Tu parles avec Philippe Normandeau (patron chez Simple IP) ; ce n'est pas un client. Aujourd'hui : vendredi 2026-10-30."
QUESTIONS = [
    "Qu'est-ce que Jean-François de Nanotech m'a écrit pour la mémoire vive du serveur P720, et combien ça coûtait de plus ?",
    "Qu'est-ce que tu sais sur le client D Astous Auto ? Fais-moi un résumé utile avant que je l'appelle.",
    "Quels postes a Simple IP et lesquels sont en ligne en ce moment ?",
    "Mets-moi un dîner avec Jean-François de Nanotech mardi prochain à midi.",
    "Un client a 2 canaux SIP chez ISP Telecom à 8,50 $ par canal et 3 DID à 0,75 $. Il veut 2 canaux et 2 DID de plus. "
    "Combien ça me coûte de plus par mois, et à quel prix je devrais lui revendre ce supplément pour garder une marge de 40 % sur le prix de vente ? Montre le calcul.",
    "Est-ce que Jérémie de Nanotech m'a envoyé une soumission corrigée pour les processeurs ? Qu'est-ce qui avait été corrigé ?",
]


async def ask(model, question, db, log):
    msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": question}]
    outils, t0, toks = [], time.monotonic(), 0
    async with httpx.AsyncClient(timeout=httpx.Timeout(3600, connect=10)) as c:
        for _ in range(8):
            corps = {"model": model, "temperature": 0.3, "messages": msgs, "tools": zeko_tools.TOOLS}
            if EFFORT != "aucune":          # mistral-small3.2 et llama3.1 refusent le reglage de reflexion (400)
                corps["reasoning_effort"] = EFFORT
            r = await c.post(URL, json=corps)
            r.raise_for_status()
            d = r.json()
            toks += (d.get("usage") or {}).get("completion_tokens", 0)
            m = d["choices"][0]["message"]
            calls = m.get("tool_calls") or []
            if not calls:
                return m.get("content") or "", outils, time.monotonic() - t0, toks
            msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": calls})
            for tc in calls:
                name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"].get("arguments") or "{}")
                except Exception:
                    args = {}
                outils.append(f"{name}({json.dumps(args, ensure_ascii=False)})")
                if name in BLOQUES:
                    res = "TEST : outil de modification non exécuté (aucune donnée changée)."
                else:
                    res = await zeko_tools.run(name, args, db, user_id=USER_ID)
                msgs.append({"role": "tool", "tool_call_id": tc.get("id") or name, "content": res})
    return "(8 tours d'outils sans réponse finale)", outils, time.monotonic() - t0, toks


async def main(models, out):
    with open(out, "a") as log:
        for model in models:
            for i, q in enumerate(QUESTIONS, 1):
                async with AsyncSessionLocal() as db:
                    try:
                        rep, outils, secs, toks = await ask(model, q, db, log)
                    except Exception as e:
                        rep, outils, secs, toks = f"ERREUR : {e!r}"[:500], [], 0, 0
                    await db.rollback()
                log.write(f"\n### {model} [réflexion {EFFORT}] — Q{i} ({secs:.0f} s, {toks} jetons)\n**Question :** {q}\n"
                          f"**Outils :** {' ; '.join(outils) or 'aucun'}\n\n{rep}\n")
                log.flush()
                print(f"{model} Q{i} {secs:.0f}s", flush=True)


asyncio.run(main(sys.argv[2:], sys.argv[1]))
