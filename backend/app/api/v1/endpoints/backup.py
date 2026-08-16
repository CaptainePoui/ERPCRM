"""Backup cloud infra ERPCRM (TASK-035) -- PAS TASK-034 (stockage cloud
CLIENT). Connexions Dropbox/Google Drive (OAuth natif, meme pattern que
google_oauth.py) + cycles de rotation configurables + backup manuel."""
import secrets
import uuid
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.crypto import encrypt
from app.core import backup_cloud
from app.models.app_settings import AppSetting
from app.models.backup import CloudBackupConnection, BackupCycle, BackupRunLog
from app.api.v1.endpoints.auth import get_current_user
from app.models.user import User
from app.workers import backup_runner

router = APIRouter()

_PROVIDERS = ("dropbox", "google_drive")


def _check_provider(provider: str):
    if provider not in _PROVIDERS:
        raise HTTPException(status_code=404, detail="Fournisseur inconnu")


def _redirect_uri(provider: str) -> str:
    return f"{settings.PUBLIC_BASE_URL}/api/v1/backup/connections/{provider}/callback"


async def _get_or_create(db: AsyncSession, provider: str) -> CloudBackupConnection:
    result = await db.execute(select(CloudBackupConnection).where(CloudBackupConnection.provider == provider))
    row = result.scalar_one_or_none()
    if not row:
        row = CloudBackupConnection(provider=provider)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def _set_setting(db: AsyncSession, key: str, value: str):
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()


async def _get_setting(db: AsyncSession, key: str) -> str | None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    row = result.scalar_one_or_none()
    return row.value if row else None


# ── Connexions ───────────────────────────────────────────────────────────

@router.get("/connections")
async def list_connections(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    out = []
    for provider in _PROVIDERS:
        conn = await _get_or_create(db, provider)
        client_id, client_secret = backup_cloud.resolve_credentials(conn)
        out.append({
            "provider": conn.provider,
            "connected": bool(conn.refresh_token_enc),
            "account_label": conn.account_label,
            "enabled": conn.enabled,
            "timezone": conn.timezone,
            "backup_hour": conn.backup_hour,
            "bandwidth_limit_kbps": conn.bandwidth_limit_kbps,
            "has_credentials": bool(client_id and client_secret),
            "client_id": conn.client_id or "",  # visible (equivalent App Key, pas un secret) -- le secret lui-meme n'est jamais renvoye
        })
    return out


class ConnectionSettingsPayload(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    backup_hour: str | None = None
    bandwidth_limit_kbps: int | None = None


@router.put("/connections/{provider}")
async def update_connection(provider: str, payload: ConnectionSettingsPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    _check_provider(provider)
    conn = await _get_or_create(db, provider)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(conn, field, value)
    await db.commit()
    return {"ok": True}


class CredentialsPayload(BaseModel):
    client_id: str
    client_secret: str


@router.put("/connections/{provider}/credentials")
async def update_credentials(provider: str, payload: CredentialsPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    _check_provider(provider)
    conn = await _get_or_create(db, provider)
    conn.client_id = payload.client_id.strip()
    conn.client_secret_enc = encrypt(payload.client_secret.strip())
    await db.commit()
    return {"ok": True}


@router.get("/connections/{provider}/connect")
async def connect(provider: str, db: AsyncSession = Depends(get_db)):
    _check_provider(provider)
    conn = await _get_or_create(db, provider)
    client_id, client_secret = backup_cloud.resolve_credentials(conn)
    if not (client_id and client_secret):
        label = "App Key / App Secret Dropbox" if provider == "dropbox" else "Client ID / Client Secret Google"
        raise HTTPException(status_code=400, detail=f"{label} pas encore configures -- entrez-les dans Admin > Backup cloud")

    state = secrets.token_urlsafe(24)
    await _set_setting(db, f"backup_oauth_state_{provider}", state)
    redirect_uri = _redirect_uri(provider)
    if provider == "dropbox":
        url = backup_cloud.dropbox_authorize_url(client_id, redirect_uri, state)
    else:
        url = backup_cloud.google_drive_authorize_url(client_id, redirect_uri, state)
    return RedirectResponse(url)


@router.get("/connections/{provider}/callback")
async def callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    _check_provider(provider)
    if error:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?backup={provider}_error")

    saved_state = await _get_setting(db, f"backup_oauth_state_{provider}")
    if not state or not saved_state or state != saved_state:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?backup={provider}_csrf")

    conn = await _get_or_create(db, provider)
    client_id, client_secret = backup_cloud.resolve_credentials(conn)
    redirect_uri = _redirect_uri(provider)
    try:
        if provider == "dropbox":
            token_data = await backup_cloud.dropbox_exchange_code(client_id, client_secret, code, redirect_uri)
        else:
            token_data = await backup_cloud.google_drive_exchange_code(client_id, client_secret, code, redirect_uri)
    except httpx.HTTPError:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?backup={provider}_error")

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?backup={provider}_no_refresh_token")

    conn.refresh_token_enc = encrypt(refresh_token)
    if provider == "dropbox":
        conn.account_label = await backup_cloud.dropbox_account_email(client_id, client_secret, refresh_token)
    else:
        conn.account_label = backup_cloud.google_drive_account_email(client_id, client_secret, refresh_token)
    await db.commit()
    return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/admin?backup={provider}_connected")


@router.post("/connections/{provider}/disconnect")
async def disconnect(provider: str, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    _check_provider(provider)
    conn = await _get_or_create(db, provider)
    conn.refresh_token_enc = None
    conn.account_label = None
    await db.commit()
    return {"ok": True}


# ── Cycles ───────────────────────────────────────────────────────────────

class CyclePayload(BaseModel):
    frequency_type: str  # daily / weekly / monthly / yearly
    day_of_week: int | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    retention_enabled: bool = True
    retention_count: int = 3
    enabled: bool = True


class CycleUpdatePayload(BaseModel):
    day_of_week: int | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    retention_enabled: bool | None = None
    retention_count: int | None = None
    enabled: bool | None = None


@router.get("/cycles")
async def list_cycles(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(BackupCycle).order_by(BackupCycle.created_at))
    return result.scalars().all()


@router.post("/cycles")
async def create_cycle(payload: CyclePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.frequency_type not in ("daily", "weekly", "monthly", "yearly"):
        raise HTTPException(status_code=400, detail="frequency_type invalide")
    cycle = BackupCycle(**payload.model_dump())
    db.add(cycle)
    await db.commit()
    await db.refresh(cycle)
    return cycle


@router.put("/cycles/{cycle_id}")
async def update_cycle(cycle_id: uuid.UUID, payload: CycleUpdatePayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    cycle = await db.get(BackupCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cycle, field, value)
    await db.commit()
    return cycle


@router.delete("/cycles/{cycle_id}")
async def delete_cycle(cycle_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    cycle = await db.get(BackupCycle, cycle_id)
    if not cycle:
        raise HTTPException(status_code=404, detail="Cycle introuvable")
    await db.delete(cycle)
    await db.commit()
    return {"ok": True}


# ── Execution ────────────────────────────────────────────────────────────

@router.post("/run")
async def run_now(_: User = Depends(get_current_user)):
    results = await backup_runner.run_manual()
    return {"ran": results}


@router.get("/logs")
async def list_logs(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(BackupRunLog).order_by(BackupRunLog.started_at.desc()).limit(50))
    return result.scalars().all()
