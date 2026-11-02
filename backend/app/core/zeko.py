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
import socket
import time
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine

log = logging.getLogger("zeko")

CHAT_LOCK = 0x5A454B4F          # « ZEKO »

# Modele local (TASK-006.12) : aucune limite de duree, il peut reflechir 10 min et plus. Seule la connexion a une
# limite (serveur d'IA eteint). Une machine d'IA morte en pleine reponse est detectee par le keep-alive TCP (aucun
# paquet ne passe pendant qu'Ollama reflechit sans flux) : sonde apres 60 s de silence, puis 3 x 20 s.
_LOCAL_TIMEOUT = httpx.Timeout(None, connect=10)
_KEEPALIVE = [(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1), (socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 60),
              (socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 20), (socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)]


# Relance d'une reponse vide (TASK-006.13, idee de Philippe) : le modele a tout ecrit dans sa reflexion
EMPTY_NUDGE = ("Ta réponse précédente est arrivée vide : seule ta réflexion a été écrite, et elle n'est pas transmise. "
               "Écris maintenant ta réponse finale.")


def _local_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_LOCAL_TIMEOUT, transport=httpx.AsyncHTTPTransport(socket_options=_KEEPALIVE))


# Serveur de secours (TASK-006.14) : le serveur principal (ex. Zeko sur le P720) est utilise s'il repond ; sinon
# (debranche, deplace, en panne) le serveur de secours, avec ses propres modeles. Verifie au plus toutes les 30 s.
_ALIVE_TTL = 30
_alive: dict = {}                 # url -> (moment de la verification, repond ?)


async def _answers(url: str) -> bool:
    seen = _alive.get(url)
    if seen and time.monotonic() - seen[0] < _ALIVE_TTL:
        return seen[1]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(4, connect=3)) as c:
            ok = (await c.get(f"{url}/models")).status_code == 200
    except Exception:
        ok = False
    if seen and seen[1] != ok:
        log.warning("Zeko : %s %s", url, "repond de nouveau" if ok else "ne repond plus")
    _alive[url] = (time.monotonic(), ok)
    return ok


async def pick_server(cfg: dict, kind: str, model: str | None = None) -> tuple[str, str, str]:
    """(adresse, modele, « local » ou « secours ») pour un appel : kind = « tasks » ou « chat »."""
    b = cfg["backup"]
    if b["url"] and not await _answers(cfg["url"]) and await _answers(b["url"]):
        return b["url"], b[f"model_{kind}"] or model or cfg[f"model_{kind}"], "secours"
    return cfg["url"], model or cfg[f"model_{kind}"], "local"


_CACHE_TTL = 20
_cache: dict = {"at": 0.0, "cfg": None}


class ZekoUnavailable(Exception):
    pass


# Le modele ecrit des espaces typographiques (fine insecable U+202F, etc.) et des traits insecables que la police de
# l'ecran ne dessine pas (« SimpleIPinc. » a l'ecran, espaces presentes au copier) -- remplaces a la sortie.
_ODD = str.maketrans({"\u202f": " ", "\u00a0": " ", "\u2009": " ", "\u2007": " ", "\u2008": " ", "\u200a": " ",
                      "\u2002": " ", "\u2003": " ", "\u205f": " ", "\u200b": "", "\u2011": "-", "\u2010": "-"})


def clean(text: str) -> str:
    return text.translate(_ODD)


# IA externes possibles (toutes parlent le format OpenAI) : un seul branchement, le fournisseur se choisit a l'ecran.
# Zeko local reste le chef ; l'IA externe ne recoit que des questions expurgees (core/zeko_redact.py).
PROVIDERS = {
    "gemini":   {"label": "Gemini (Google)", "url": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash"},
    "deepseek": {"label": "DeepSeek", "url": "https://api.deepseek.com/v1", "model": "deepseek-chat"},
    "mistral":  {"label": "Mistral", "url": "https://api.mistral.ai/v1", "model": "mistral-small-latest"},
    "openai":   {"label": "OpenAI", "url": "https://api.openai.com/v1", "model": "gpt-4o-mini"},
    "autre":    {"label": "Autre (compatible OpenAI)", "url": "", "model": ""},
}


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
            "model_vision": (await get_setting(db, "zeko_model_vision")) or "",     # TASK-006.18 : lit les images
            "backup": {"url": ((await get_setting(db, "zeko_url_backup")) or "").strip().rstrip("/"),
                       "model_tasks": (await get_setting(db, "zeko_model_tasks_backup")) or "",
                       "model_chat": (await get_setting(db, "zeko_model_chat_backup")) or ""},
        }
        prov = (await get_setting(db, "zeko_ext_provider")) or "gemini"
        preset = PROVIDERS.get(prov, PROVIDERS["autre"])
        key_enc = await get_setting(db, "zeko_ext_key_enc")
        key = ""
        if key_enc:
            try:
                from app.core.crypto import decrypt
                key = decrypt(key_enc)
            except Exception:
                log.warning("Cle de l'IA externe illisible")
        cfg["ext"] = {
            "provider": prov, "label": preset["label"],
            "url": ((await get_setting(db, "zeko_ext_url")) or preset["url"]).rstrip("/"),
            "model": (await get_setting(db, "zeko_ext_model")) or preset["model"],
            "key": key,
            "enabled": (await get_setting(db, "zeko_ext_enabled")) == "true" and bool(key),
        }
    _cache.update(at=time.monotonic(), cfg=cfg)
    return cfg


def invalidate() -> None:
    _cache["cfg"] = None
    _alive.clear()


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


async def ask_external(question: str, *, user_id=None, conversation_id=None) -> tuple[str, str]:
    """Pose une question TECHNIQUE a l'IA externe, apres expurgation locale. Retourne (reponse, question envoyee).
    Leve ZekoUnavailable (non configuree, quota, panne) : Zeko continue alors seul."""
    from app.core.zeko_redact import redact
    cfg = (await config())["ext"]
    if not cfg["enabled"]:
        raise ZekoUnavailable("aucune IA externe n'est activée")
    sent = await redact(question)
    payload = {"model": cfg["model"], "temperature": 0.3, "messages": [
        {"role": "system", "content": "Tu aides un technicien en téléphonie IP et informatique au Québec. Réponds en français, "
                                      "concret et court. Les étiquettes entre crochets remplacent des données retirées."},
        {"role": "user", "content": sent}]}
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(f"{cfg['url']}/chat/completions", json=payload, headers={"Authorization": f"Bearer {cfg['key']}"})
        if r.status_code == 429:
            raise ZekoUnavailable(f"{cfg['label']} : quota atteint pour l'instant")
        if r.status_code in (401, 403) or (r.status_code == 400 and "key" in r.text.lower()):
            raise ZekoUnavailable(f"{cfg['label']} : clé refusée")
        r.raise_for_status()
        data = r.json()
        answer = clean(data["choices"][0]["message"].get("content") or "")
    except ZekoUnavailable as e:
        await _journal(purpose="ia_externe", provider=cfg["provider"], model=cfg["model"], status="erreur", error=str(e),
                       duration_ms=int((time.monotonic() - t0) * 1000), request_redacted=sent, user_id=user_id, conversation_id=conversation_id)
        raise
    except Exception as e:
        await _journal(purpose="ia_externe", provider=cfg["provider"], model=cfg["model"], status="erreur", error=str(e)[:2000],
                       duration_ms=int((time.monotonic() - t0) * 1000), request_redacted=sent, user_id=user_id, conversation_id=conversation_id)
        raise ZekoUnavailable(f"{cfg['label']} ne répond pas")
    usage = data.get("usage") or {}
    await _journal(purpose="ia_externe", provider=cfg["provider"], model=cfg["model"], status="ok",
                   duration_ms=int((time.monotonic() - t0) * 1000), prompt_tokens=usage.get("prompt_tokens"),
                   completion_tokens=usage.get("completion_tokens"), request_redacted=sent, response=answer[:20000],
                   user_id=user_id, conversation_id=conversation_id)
    return answer, sent


async def chat_active() -> bool:
    async with engine.connect() as conn:
        n = (await conn.execute(text(
            "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND granted AND objid = :k"), {"k": CHAT_LOCK})).scalar()
    return bool(n)


async def _post(url: str, payload: dict) -> dict:
    async with _local_client() as client:
        r = await client.post(f"{url}/chat/completions", json=payload)
        r.raise_for_status()
        return r.json()


async def complete(messages: list[dict], *, purpose: str, model: str | None = None, temperature: float = 0,
                   reasoning_effort: str | None = "low", priority: str = "background",
                   user_id=None) -> str:
    """Un appel complet (sans flux) ; retourne le texte de la reponse. En priorite « background », cede la place a
    toute conversation : attend qu'elle finisse, et s'il en commence une pendant l'appel, coupe et recommence apres."""
    cfg = await config()
    if not cfg["enabled"]:
        raise ZekoUnavailable("Zéko n'est pas configuré (Administration → Intégrations)")
    payload = {"model": model or cfg["model_tasks"], "temperature": temperature, "messages": messages}
    where = "local"
    if reasoning_effort:
        payload["reasoning_effort"] = reasoning_effort
    for _attempt in range(20):
        if priority == "background":
            while await chat_active():
                await asyncio.sleep(3)
        t0 = time.monotonic()
        url, payload["model"], where = await pick_server(cfg, "tasks", model)    # principal, sinon secours
        task = asyncio.create_task(_post(url, payload))
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
                await _journal(purpose=purpose, provider=where, model=payload["model"], status="interrompu",
                               duration_ms=int((time.monotonic() - t0) * 1000), user_id=user_id,
                               error="Coupé pour laisser passer une conversation ; repris ensuite")
                await asyncio.sleep(5)
                continue
            data = task.result()
        except asyncio.CancelledError:
            task.cancel()
            raise
        except Exception as e:
            await _journal(purpose=purpose, provider=where, model=payload["model"], status="erreur",
                           duration_ms=int((time.monotonic() - t0) * 1000), user_id=user_id, error=str(e)[:2000])
            raise
        usage = data.get("usage") or {}
        await _journal(purpose=purpose, provider=where, model=payload["model"], status="ok", duration_ms=int((time.monotonic() - t0) * 1000),
                       prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"), user_id=user_id)
        answer = clean(data["choices"][0]["message"].get("content") or "")
        if not answer.strip() and payload["messages"] is messages:      # vide : une seule relance (TASK-006.13)
            payload = {**payload, "messages": messages + [{"role": "user", "content": EMPTY_NUDGE}]}
            await _journal(purpose=purpose, provider=where, model=payload["model"], status="vide", user_id=user_id,
                           duration_ms=int((time.monotonic() - t0) * 1000), error="Réponse vide : relancé une fois")
            continue
        return answer
    raise ZekoUnavailable("Zéko est resté occupé par des conversations ; nouvel essai plus tard")


def has_images(messages: list[dict]) -> bool:
    return any(isinstance(m.get("content"), list) and any(p.get("type") == "image_url" for p in m["content"]) for m in messages)


async def stream_chat(messages: list[dict], *, tools: list[dict] | None = None, purpose: str = "conversation",
                      user_id=None, conversation_id=None):
    """Conversation en flux. Produit des evenements : ("pense", morceau de reflexion), ("texte", morceau),
    puis ("outils", [appels]) ou ("fin", None). Tient le verrou de priorite pendant toute la generation.
    Des images dans les messages (TASK-006.18) : le « Modèle des images » repond, jamais un modele texte qui ne les
    verrait pas et inventerait."""
    cfg = await config()
    if not cfg["enabled"]:
        raise ZekoUnavailable("Zéko n'est pas configuré (Administration → Intégrations)")
    url, chat_model, where = await pick_server(cfg, "chat")                   # principal, sinon secours (TASK-006.14)
    if has_images(messages):
        if not cfg["model_vision"]:
            raise ZekoUnavailable("Aucun modèle ne lit les images : choisis le « Modèle des images » dans Administration → Zéko → Réglages")
        if where != "local":
            raise ZekoUnavailable("Le serveur principal de Zéko ne répond pas, et le serveur de secours ne lit pas les images")
        chat_model = cfg["model_vision"]
    payload = {"model": chat_model, "stream": True, "temperature": 0.3, "reasoning_effort": "low",
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
        async with _local_client() as client:
            async with client.stream("POST", f"{url}/chat/completions", json=payload) as r:
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
                        if delta.get("reasoning"):            # reflexion du modele : montree en direct, puis effacee
                            yield ("pense", clean(delta["reasoning"]))
                        if delta.get("content"):
                            yield ("texte", clean(delta["content"]))
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
        await _journal(purpose=purpose, provider=where, model=payload["model"], status=status, duration_ms=int((time.monotonic() - t0) * 1000),
                       prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
                       error=error, user_id=user_id, conversation_id=conversation_id)
