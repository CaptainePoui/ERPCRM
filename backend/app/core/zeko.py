"""Zeko : l'IA unique d'ERPCRM (et, par son API, de SIPV) -- TASK-006.5 etape 2, 2026-10-18.

Tous les appels au modele passent ici : un seul reglage (Administration -> Integrations -> Zeko), un seul journal
(zeko_invocations), une seule regle de priorite. Fournisseur : API compatible OpenAI (Ollama local aujourd'hui ;
Gemini ou autre plus tard, sans toucher aux appelants).

Priorite : une conversation passe toujours avant les taches de fond (depots, recus, Interac, signatures). Tant
qu'une conversation genere, elle tient un verrou Postgres partage (visible des deux services 8010/8011) ; une tache
de fond qui tourne a ce moment est coupee (le modele s'arrete quand la connexion se ferme), puis reprise plus tard.
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine

log = logging.getLogger("zeko")

CHAT_LOCK = 0x5A454B4F          # « ZEKO »
_CACHE_TTL = 20
_cache: dict = {"at": 0.0, "cfg": None}


class ZekoUnavailable(Exception):
    pass


async def config(fresh: bool = False) -> dict:
    """Reglages de Zeko (ecran Administration), relus au plus toutes les 20 s."""
    if not fresh and _cache["cfg"] and time.monotonic() - _cache["at"] < _CACHE_TTL:
        return _cache["cfg"]
    from app.api.v1.endpoints.settings import get_setting
    async with AsyncSessionLocal() as db:
        url = (await get_setting(db, "zeko_url")) or settings.LOCAL_AI_URL
        cfg = {
            "enabled": (await get_setting(db, "zeko_enabled")) != "false" and bool(url),
            "url": url.rstrip("/"),
            "model_tasks": (await get_setting(db, "zeko_model_tasks")) or settings.LOCAL_AI_MODEL,
            "model_chat": (await get_setting(db, "zeko_model_chat")) or settings.LOCAL_AI_MODEL,
        }
    _cache.update(at=time.monotonic(), cfg=cfg)
    return cfg


def invalidate() -> None:
    _cache["cfg"] = None


async def enabled() -> bool:
    return (await config())["enabled"]


async def _journal(**kw) -> None:
    from app.models.zeko import ZekoInvocation
    try:
        async with AsyncSessionLocal() as db:
            db.add(ZekoInvocation(**kw))
            await db.commit()
    except Exception:
        log.exception("Journal Zeko")


async def chat_active() -> bool:
    async with engine.connect() as conn:
        n = (await conn.execute(text(
            "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND granted AND objid = :k"), {"k": CHAT_LOCK})).scalar()
    return bool(n)


async def _post(cfg: dict, payload: dict, timeout: float) -> dict:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(f"{cfg['url']}/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()


async def complete(messages: list[dict], *, purpose: str, model: str | None = None, temperature: float = 0,
                   reasoning_effort: str | None = "low", timeout: float = 1200, priority: str = "background",
                   user_id=None) -> str:
    """Un appel complet (sans flux) ; retourne le texte de la reponse. En priorite « background », cede la place a
    toute conversation : attend qu'elle finisse, et s'il en commence une pendant l'appel, coupe et recommence apres."""
    cfg = await config()
    if not cfg["enabled"]:
        raise ZekoUnavailable("Zéko n'est pas configuré (Administration → Intégrations)")
    payload = {"model": model or cfg["model_tasks"], "temperature": temperature, "messages": messages}
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort
    for _attempt in range(20):
        if priority == "background":
            while await chat_active():
                await asyncio.sleep(3)
        t0 = time.monotonic()
        task = asyncio.create_task(_post(cfg, payload, timeout))
        interrupted = False
        try:
            while not task.done():
                await asyncio.wait({task}, timeout=2)
                if not task.done() and priority == "background" and await chat_active():
                    task.cancel()
                    interrupted = True
            if interrupted:
                try:
                    await task
                except BaseException:
                    pass
                await _journal(purpose=purpose, model=payload["model"], status="interrompu",
                               duration_ms=int((time.monotonic() - t0) * 1000), user_id=user_id,
                               error="Coupé pour laisser passer une conversation ; repris ensuite")
                await asyncio.sleep(5)
                continue
            data = task.result()
        except asyncio.CancelledError:
            task.cancel()
            raise
        except Exception as e:
            await _journal(purpose=purpose, model=payload["model"], status="erreur",
                           duration_ms=int((time.monotonic() - t0) * 1000), user_id=user_id, error=str(e)[:2000])
            raise
        usage = data.get("usage") or {}
        await _journal(purpose=purpose, model=payload["model"], status="ok", duration_ms=int((time.monotonic() - t0) * 1000),
                       prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"), user_id=user_id)
        return data["choices"][0]["message"].get("content") or ""
    raise ZekoUnavailable("Zéko est resté occupé par des conversations ; nouvel essai plus tard")


async def stream_chat(messages: list[dict], *, tools: list[dict] | None = None, purpose: str = "conversation",
                      user_id=None, conversation_id=None):
    """Conversation en flux. Produit des evenements : ("pense", None) pendant la reflexion, ("texte", morceau),
    puis ("outils", [appels]) ou ("fin", None). Tient le verrou de priorite pendant toute la generation."""
    cfg = await config()
    if not cfg["enabled"]:
        raise ZekoUnavailable("Zéko n'est pas configuré (Administration → Intégrations)")
    payload = {"model": cfg["model_chat"], "stream": True, "temperature": 0.3, "reasoning_effort": "low",
               "messages": messages, "stream_options": {"include_usage": True}}
    if tools:
        payload["tools"] = tools
    t0 = time.monotonic()
    calls: dict[int, dict] = {}
    usage = {}
    status, error = "ok", None
    lock_conn = await engine.connect()
    try:
        await lock_conn.execute(text("SELECT pg_advisory_lock_shared(:k)"), {"k": CHAT_LOCK})
        await lock_conn.commit()
        thinking_sent = False
        async with httpx.AsyncClient(timeout=httpx.Timeout(1800, connect=10)) as client:
            async with client.stream("POST", f"{cfg['url']}/chat/completions", json=payload) as r:
                if r.status_code >= 400:
                    raise ZekoUnavailable(f"Le modèle a répondu {r.status_code} : {(await r.aread())[:300]!r}")
                async for line in r.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    chunk = line[6:]
                    if chunk.strip() == "[DONE]":
                        break
                    d = json.loads(chunk)
                    if d.get("usage"):
                        usage = d["usage"]
                    for ch in d.get("choices") or []:
                        delta = ch.get("delta") or {}
                        if delta.get("reasoning") and not thinking_sent:
                            thinking_sent = True
                            yield ("pense", None)
                        if delta.get("content"):
                            yield ("texte", delta["content"])
                        for tc in delta.get("tool_calls") or []:
                            c = calls.setdefault(tc.get("index", 0), {"id": tc.get("id"), "name": "", "arguments": ""})
                            fn = tc.get("function") or {}
                            c["id"] = c["id"] or tc.get("id")
                            c["name"] += fn.get("name") or ""
                            c["arguments"] += fn.get("arguments") or ""
        if calls:
            yield ("outils", [calls[i] for i in sorted(calls)])
        else:
            yield ("fin", None)
    except (asyncio.CancelledError, GeneratorExit):
        status, error = "interrompu", "Arrêté par l'utilisateur"
        raise
    except Exception as e:
        status, error = "erreur", str(e)[:2000]
        raise
    finally:
        try:
            await lock_conn.execute(text("SELECT pg_advisory_unlock_shared(:k)"), {"k": CHAT_LOCK})
            await lock_conn.commit()
        except Exception:
            pass
        await lock_conn.close()
        await _journal(purpose=purpose, model=payload["model"], status=status, duration_ms=int((time.monotonic() - t0) * 1000),
                       prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                       error=error, user_id=user_id, conversation_id=conversation_id)
