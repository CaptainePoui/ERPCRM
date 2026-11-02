"""Test de charge de Zéko (TASK-006.21, Philippe 2026-11-02 : « schedule un test pour cette nuit (00h00), tu pourras tester »).

Combien de demandes Zéko peut-il traiter en même temps ? Par la vraie API d'ERPCRM (comme l'écran), la nuit quand
personne ne l'utilise :
  A. 1 demande seule (référence)
  B. 2 demandes en même temps, même modèle (conversation)
  C. 3 demandes en même temps, même modèle
  D. 2 demandes en même temps, modèles différents (une avec image -> modèle des images ; une texte -> conversation)
Pour chacune : délai avant le premier mot, durée totale, erreur. Plus l'état de la machine des modèles (ollama ps,
nvidia-smi) avant et après. Résultats : backend/storage/zeko_load_test/<date>.json et .md ; les conversations d'essai
sont effacées. Ne fait rien si quelqu'un parle à Zéko à ce moment-là.

Lancement : python tools/zeko_load_test.py  (programmé : systemd-run --user --on-calendar=...)
"""
import asyncio
import base64
import io
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(ROOT))
OUT = ROOT / "storage" / "zeko_load_test"
API = "http://127.0.0.1:8010/api/v1"
USER_ID = "d1ba78ea-f3b6-47f9-9e64-c85e1b5aea4e"      # Philippe (administrateur)
QUESTION = "Test de charge automatique (TASK-006.21). Réponds seulement : OK, en un mot, sans utiliser d'outil."


def ssh(cmd: str) -> str:
    try:
        return subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "192.168.1.88", cmd],
                              capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception as e:                       # noqa: BLE001
        return f"(lecture impossible : {e})"


def machine() -> dict:
    return {"ollama_ps": ssh("ollama ps"),
            "gpu": ssh("nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader")}


def image_data_url() -> str:
    from PIL import Image, ImageDraw
    im = Image.new("RGB", (320, 160), "white")
    ImageDraw.Draw(im).text((40, 70), "TEST 006.21", fill="black")
    b = io.BytesIO()
    im.save(b, "PNG")
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


async def one(client, headers, label: str, with_image: bool, created: list) -> dict:
    r = await client.post(f"{API}/zeko/conversations", json={"title": f"Test de charge {label} (TASK-006.21)"}, headers=headers)
    cid = r.json()["id"]
    created.append(cid)
    body = {"content": QUESTION, "images": [image_data_url()] if with_image else []}
    t0 = time.monotonic()
    first, text, err = None, "", None
    try:
        async with client.stream("POST", f"{API}/zeko/conversations/{cid}/messages", json=body, headers=headers) as resp:
            if resp.status_code != 200:
                err = f"HTTP {resp.status_code}"
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                ev = json.loads(line[6:])
                if ev.get("type") in ("texte", "pense") and first is None:
                    first = time.monotonic() - t0
                if ev.get("type") == "texte":
                    text += ev.get("texte") or ""
                elif ev.get("type") == "erreur":
                    err = ev.get("texte")
    except Exception as e:                       # noqa: BLE001
        err = str(e)[:300]
    return {"demande": label, "image": with_image, "premier_mot_s": round(first, 1) if first else None,
            "total_s": round(time.monotonic() - t0, 1), "reponse": text.strip()[:80], "erreur": err}


async def scenario(client, headers, name: str, specs: list, created: list) -> dict:
    t0 = time.monotonic()
    res = await asyncio.gather(*(one(client, headers, f"{name}{i + 1}", img, created) for i, img in enumerate(specs)))
    return {"scenario": name, "demandes": len(specs), "duree_totale_s": round(time.monotonic() - t0, 1), "resultats": res}


async def main() -> int:
    import httpx
    from sqlalchemy import text
    from app.core.database import AsyncSessionLocal
    from app.core.security import create_access_token
    OUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    report = {"debut": datetime.now().isoformat(timespec="seconds"), "machine_avant": machine(), "scenarios": []}
    async with AsyncSessionLocal() as db:
        busy = (await db.execute(text("select count(*) from zeko_conversations where busy_since > now() - interval '30 seconds'"))).scalar()
    if busy:
        report["annule"] = "quelqu'un parlait à Zéko : test pas fait"
    else:
        headers = {"Authorization": "Bearer " + create_access_token({"sub": USER_ID, "role": "admin"}, expires_minutes=180)}
        created: list = []
        async with httpx.AsyncClient(timeout=httpx.Timeout(1800, connect=15)) as client:
            try:
                for name, specs in (("A", [False]), ("B", [False, False]), ("C", [False, False, False]), ("D", [False, True])):
                    report["scenarios"].append(await scenario(client, headers, name, specs, created))
                    report.setdefault("machine_apres_" + name, machine())
            finally:
                for cid in created:                  # conversations d'essai effacées (par l'API, comme le bouton)
                    try:
                        await client.delete(f"{API}/zeko/conversations/{cid}", headers=headers)
                    except Exception:                # noqa: BLE001
                        pass
                report["conversations_effacees"] = len(created)
    report["fin"] = datetime.now().isoformat(timespec="seconds")
    (OUT / f"{stamp}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    lines = [f"# Test de charge Zéko — {report['debut']}", ""]
    if report.get("annule"):
        lines.append(f"**Annulé** : {report['annule']}")
    for sc in report["scenarios"]:
        lines.append(f"## {sc['scenario']} — {sc['demandes']} demande(s) en même temps : {sc['duree_totale_s']} s au total")
        for r in sc["resultats"]:
            lines.append(f"- {r['demande']}{' (image)' if r['image'] else ''} : premier mot {r['premier_mot_s']} s, total {r['total_s']} s"
                         + (f", ERREUR {r['erreur']}" if r["erreur"] else f", réponse « {r['reponse']} »"))
        lines.append("")
    lines += ["## Machine des modèles", "```", json.dumps(report["machine_avant"], ensure_ascii=False, indent=1), "```"]
    (OUT / f"{stamp}.md").write_text("\n".join(lines))
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
