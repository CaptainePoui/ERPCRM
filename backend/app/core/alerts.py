"""Alertes : un service tombe ou une sauvegarde échoue (TASK-047.12, GO de Philippe 2026-11-01).

« oui, je veux ça dans les réglages, en courriel, en webhook Slack ou en texto ; on va régler les textos avec les API de
ScopServ, on changera pour les miens quand j'aurai les services avec l'ISP ».

Toutes les 2 min (tâche de fond, un seul des deux services) : SIPV joignable, FreeSWITCH relié à SIPV (ESL), machine de
Zéko, sauvegarde ERPCRM et sauvegarde SIPV réussies depuis moins de N h, espace disque du serveur ERPCRM. Une panne =
2 vérifications ratées de suite (pas d'alerte pour un hoquet) ; UNE alerte par panne (cloche + courriel + Slack, selon
les réglages), puis un avis « rétabli ». Réglages : Administration -> Configuration -> Notifications (app_settings
« alerts_config ») ; état : app_settings « alerts_state ». Textos : à venir (API ScopServ, TASK-047.12).
"""
import asyncio
import copy
import json
import logging
import shutil
from datetime import datetime, timedelta, timezone

import httpx

log = logging.getLogger("alerts")
INTERVAL = 120
KEY, STATE_KEY = "alerts_config", "alerts_state"
CHECKS = {"sipv": "SIPV (serveur téléphonique) joignable", "freeswitch": "FreeSWITCH relié à SIPV",
          "zeko": "Machine de Zéko (modèles d'IA)", "backup_erpcrm": "Sauvegarde ERPCRM", "backup_sipv": "Sauvegarde SIPV",
          "disk": "Espace disque du serveur ERPCRM"}
DEFAULTS = {"enabled": True, "checks": {k: True for k in CHECKS}, "backup_max_hours": 26, "disk_min_pct": 10,
            "emails": [], "slack_webhook": ""}


def validate(data: dict) -> dict:
    cfg = copy.deepcopy(DEFAULTS)
    d = data or {}
    cfg["enabled"] = bool(d.get("enabled", True))
    cfg["checks"] = {k: bool((d.get("checks") or {}).get(k, True)) for k in CHECKS}
    try:
        cfg["backup_max_hours"] = max(1, min(24 * 14, int(d.get("backup_max_hours", 26))))
        cfg["disk_min_pct"] = max(1, min(50, int(d.get("disk_min_pct", 10))))
    except (TypeError, ValueError):
        raise ValueError("Durée de sauvegarde et espace disque : des nombres")
    emails = d.get("emails") or []
    if isinstance(emails, str):
        emails = [e for e in emails.replace(";", ",").split(",")]
    cfg["emails"] = [e.strip() for e in emails if e and e.strip()][:10]
    for e in cfg["emails"]:
        if "@" not in e or " " in e:
            raise ValueError(f"Adresse invalide : {e}")
    hook = str(d.get("slack_webhook") or "").strip()
    if hook and not hook.startswith("https://hooks.slack.com/"):
        raise ValueError("Le webhook Slack commence par https://hooks.slack.com/")
    cfg["slack_webhook"] = hook
    return cfg


async def _get(db, key, default):
    from app.api.v1.endpoints.settings import get_setting
    raw = await get_setting(db, key)
    try:
        return json.loads(raw) if raw else copy.deepcopy(default)
    except (TypeError, ValueError):
        return copy.deepcopy(default)


async def load(db) -> dict:
    return validate(await _get(db, KEY, DEFAULTS))


async def save(db, data: dict) -> dict:
    from app.api.v1.endpoints.settings import set_setting
    cfg = validate(data)
    await set_setting(db, KEY, json.dumps(cfg))
    await db.commit()
    return cfg


async def state(db) -> dict:
    return await _get(db, STATE_KEY, {})


# ── Les vérifications : (ok, détail) ─────────────────────────────────────────────────────────────────────────────

async def _check(db, name: str, cfg: dict) -> tuple[bool, str]:
    from app.core import sipv_client
    if name in ("sipv", "freeswitch"):
        st = await sipv_client.get_esl_status()
        if name == "sipv":
            return (st.get("error") != "SIPV injoignable", st.get("error") or "répond")
        if st.get("error") == "SIPV injoignable":
            return True, "SIPV injoignable : vérifié par l'alerte SIPV"      # une seule alerte pour la même panne
        return bool(st.get("connected")), "relié" if st.get("connected") else "FreeSWITCH n'est plus relié à SIPV (ESL)"
    if name == "zeko":
        from app.core import zeko
        c = await zeko.config(fresh=True)
        if not c.get("enabled") or not c.get("url"):
            return True, "Zéko désactivé"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(c["url"].rstrip("/") + "/models")
            return r.status_code < 500, f"répond ({r.status_code})"
        except httpx.HTTPError as e:
            return False, f"ne répond pas ({e.__class__.__name__})"
    if name in ("backup_erpcrm", "backup_sipv"):
        limit = datetime.now(timezone.utc) - timedelta(hours=cfg["backup_max_hours"])
        if name == "backup_erpcrm":
            from sqlalchemy import select, text
            if not (await db.execute(text("select 1 from cloud_backup_connections limit 1"))).first():
                return True, "aucune sauvegarde configurée"
            row = (await db.execute(text("select max(started_at) from backup_run_logs where success"))).scalar()
            last_fail = (await db.execute(text("select max(started_at) from backup_run_logs where not success"))).scalar()
        else:
            try:
                async with sipv_client._client() as client:
                    r = await client.get(f"{sipv_client.settings.SIPV_API_URL}/api/v1/backup/logs", headers=sipv_client._headers())
                    r.raise_for_status()
                    logs = r.json()
            except httpx.HTTPError:
                return True, "SIPV injoignable : vérifié par l'alerte SIPV"
            ok = [datetime.fromisoformat(x["started_at"].replace("Z", "+00:00")) for x in logs if x.get("success")]
            bad = [datetime.fromisoformat(x["started_at"].replace("Z", "+00:00")) for x in logs if not x.get("success")]
            row, last_fail = (max(ok) if ok else None), (max(bad) if bad else None)
            if not logs:
                return True, "aucune sauvegarde configurée"
        if last_fail and (not row or last_fail > row):
            return False, f"la dernière sauvegarde a échoué ({last_fail:%Y-%m-%d %H:%M} UTC)"
        if not row or row < limit:
            return False, f"aucune sauvegarde réussie depuis {cfg['backup_max_hours']} h" + (f" (dernière : {row:%Y-%m-%d %H:%M} UTC)" if row else "")
        return True, f"dernière réussie : {row:%Y-%m-%d %H:%M} UTC"
    if name == "disk":
        u = shutil.disk_usage("/")
        pct = u.free * 100 / u.total
        return pct >= cfg["disk_min_pct"], f"{pct:.0f} % libre ({u.free // 2**30} Go)"
    return True, ""


# ── Envoi ────────────────────────────────────────────────────────────────────────────────────────────────────────

async def notify(cfg: dict, subject: str, text: str) -> list[str]:
    """Courriel et Slack selon les réglages ; retourne ce qui a été envoyé (ou les échecs)."""
    from app.core.email import _send
    out = []
    for e in cfg["emails"]:
        ok = await _send(e, subject, f"<p>{text}</p><p style='color:#888'>ERPCRM — alertes (Administration → Configuration → Notifications)</p>")
        out.append(f"courriel {e} : {'envoyé' if ok else 'échec'}")
    if cfg["slack_webhook"]:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(cfg["slack_webhook"], json={"text": f"*{subject}*\n{text}"})
            out.append(f"Slack : {'envoyé' if r.status_code < 300 else f'échec {r.status_code}'}")
        except httpx.HTTPError as e:
            out.append(f"Slack : échec ({e.__class__.__name__})")
    return out


async def run_once(db) -> dict:
    from app.api.v1.endpoints.settings import set_setting
    cfg = await load(db)
    st = await state(db)
    if not cfg["enabled"]:
        return st
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for name, label in CHECKS.items():
        if not cfg["checks"].get(name):
            st.pop(name, None)
            continue
        try:
            ok, detail = await _check(db, name, cfg)
        except Exception as e:                       # noqa: BLE001 -- une vérification en erreur ne bloque pas les autres
            ok, detail = False, f"vérification impossible : {str(e)[:150]}"
        cur = st.get(name) or {}
        if ok:
            if cur.get("alerted"):
                await notify(cfg, f"Rétabli : {label}", f"{label} : {detail}. En panne depuis {cur.get('down_since')}.")
            st[name] = {"ok": True, "detail": detail, "checked": now}
            continue
        fails = int(cur.get("fails", 0)) + 1
        down_since = cur.get("down_since") or now
        st[name] = {"ok": False, "detail": detail, "checked": now, "fails": fails, "down_since": down_since,
                    "alerted": cur.get("alerted", False)}
        if fails >= 2 and not cur.get("alerted"):    # une alerte par panne, après 2 vérifications ratées de suite
            sent = await notify(cfg, f"Alerte ERPCRM : {label}", f"{label} : {detail} (depuis {down_since}).")
            st[name].update(alerted=True, sent=sent)
            log.warning("Alerte : %s — %s", label, detail)
    await set_setting(db, STATE_KEY, json.dumps(st))
    await db.commit()
    return st


async def bell_lines(db) -> list[dict]:
    """Pannes en cours (alertées) pour la cloche."""
    st = await state(db)
    return [{"text": f"{CHECKS[k]} : {v.get('detail')} (depuis {str(v.get('down_since', ''))[:16].replace('T', ' ')} UTC)",
             "path": "/admin?tab=configuration&section=notifications"}
            for k, v in st.items() if k in CHECKS and not v.get("ok") and v.get("alerted")]


async def run_alerts():
    from app.core.database import AsyncSessionLocal
    await asyncio.sleep(60)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await run_once(db)
        except Exception:
            log.exception("Tour des alertes échoué")
        await asyncio.sleep(INTERVAL)
