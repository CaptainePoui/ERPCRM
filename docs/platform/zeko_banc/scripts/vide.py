"""Reproduit Q2 avec qwen3.5:35b-a3b et garde la reponse brute de chaque tour (contenu, reflexion, raison de fin)."""
import asyncio, json, sys, time
import httpx
sys.path.insert(0, "/home/simpleip/erpcrm/backend")
from app.core.database import AsyncSessionLocal
from app.core import zeko_tools
from app.api.v1.endpoints.zeko import SYSTEM
URL = "http://127.0.0.1:11435/v1/chat/completions"
USER_ID = "d1ba78ea-f3b6-47f9-9e64-c85e1b5aea4e"
SYS = SYSTEM + " Tu parles avec Philippe Normandeau (patron chez Simple IP) ; ce n'est pas un client. Aujourd'hui : vendredi 2026-10-30."
BLOQUES = {"retenir", "oublier", "changer_regle_banque", "changer_nom_client", "ajouter_ancienne_info",
           "mettre_agenda", "creer_poste", "regler_poste", "ouvrir_page"}
Q = sys.argv[2]
async def main():
    async with AsyncSessionLocal() as db:
        msgs = [{"role": "system", "content": SYS}, {"role": "user", "content": Q}]
        async with httpx.AsyncClient(timeout=600) as c:
            for tour in range(8):
                r = await c.post(URL, json={"model": "qwen3.5:35b-a3b", "temperature": 0.3, "reasoning_effort": sys.argv[1],
                                             "messages": msgs, "tools": zeko_tools.TOOLS})
                d = r.json(); ch = d["choices"][0]; m = ch["message"]
                print(f"--- tour {tour} fin={ch.get('finish_reason')} jetons={d.get('usage')}")
                print("contenu:", repr((m.get("content") or "")[:300]))
                print("reflexion:", repr((m.get("reasoning") or m.get("reasoning_content") or "")[-400:]))
                calls = m.get("tool_calls") or []
                print("outils:", [t["function"]["name"] for t in calls])
                if not calls: break
                msgs.append({"role": "assistant", "content": m.get("content") or "", "tool_calls": calls})
                for tc in calls:
                    name = tc["function"]["name"]; args = json.loads(tc["function"].get("arguments") or "{}")
                    res = "TEST : outil de modification non exécuté (aucune donnée changée)." if name in BLOQUES else await zeko_tools.run(name, args, db, user_id=USER_ID)
                    msgs.append({"role": "tool", "tool_call_id": tc.get("id") or name, "content": res})
        await db.rollback()
asyncio.run(main())
