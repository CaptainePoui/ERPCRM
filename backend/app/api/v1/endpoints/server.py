"""Proxy vers les serveurs SIPV + Global Templates (TASK-S044, page Serveur
TASK-026) -- pas de donnees propres a ERPCRM ici, tout vit cote SIPV."""
import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Response, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from app.core import sipv_client
from app.core.config import settings
from app.api.v1.endpoints.auth import get_current_user, get_current_user_media
from app.models.user import User

router = APIRouter()


@router.get("/servers")
async def list_servers(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_servers()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class ServerUpdatePayload(BaseModel):
    name: str | None = None
    hostname: str | None = None
    ip_address: str | None = None
    sip_inbound_ip: str | None = None
    sip_outbound_ip: str | None = None
    is_active: bool | None = None
    notes: str | None = None


@router.put("/servers/{server_id}")
async def update_server(server_id: uuid.UUID, payload: ServerUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_server(str(server_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class TemplatePayload(BaseModel):
    name: str
    description: str | None = None
    options: dict = {}
    is_default: bool = False
    is_active: bool = True

class TemplateUpdatePayload(BaseModel):
    name: str | None = None
    description: str | None = None
    options: dict | None = None
    is_default: bool | None = None
    is_active: bool | None = None


@router.get("/servers/{server_id}/global-templates")
async def list_global_templates(server_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_global_templates(str(server_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/servers/{server_id}/global-templates", status_code=status.HTTP_201_CREATED)
async def create_global_template(server_id: uuid.UUID, payload: TemplatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.create_global_template(server_id=str(server_id), **payload.model_dump())
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/global-templates/{template_id}")
async def update_global_template(template_id: uuid.UUID, payload: TemplateUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_global_template(str(template_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/global-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_global_template(template_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_global_template(str(template_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Tenant Templates -- bibliotheque par serveur, choisie explicitement par
# compagnie (TASK-S044.1) ──────────────────────────────────────────────────
@router.get("/servers/{server_id}/tenant-templates")
async def list_tenant_templates(server_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_tenant_templates(str(server_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/servers/{server_id}/tenant-templates", status_code=status.HTTP_201_CREATED)
async def create_tenant_template(server_id: uuid.UUID, payload: TemplatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.create_tenant_template(server_id=str(server_id), **payload.model_dump())
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/tenant-templates/{template_id}")
async def update_tenant_template(template_id: uuid.UUID, payload: TemplateUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_tenant_template(str(template_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/tenant-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tenant_template(template_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_tenant_template(str(template_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Reglages globaux boite vocale -- NIP par defaut des nouvelles BV
# (TASK-S023.33, demande de Philippe 2026-08-04) ────────────────────────────
class VoicemailGlobalSettingsPayload(BaseModel):
    voicemail_delete_after_email: bool | None = None
    voicemail_max_messages: int | None = None
    voicemail_max_message_length: int | None = None
    voicemail_language: str | None = None
    voicemail_default_password: str | None = None


@router.get("/voicemail-settings")
async def get_voicemail_settings(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.get_voicemail_global_settings()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.put("/voicemail-settings")
async def update_voicemail_settings(payload: VoicemailGlobalSettingsPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_voicemail_global_settings(**payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── MOH (TASK-S033) -- bibliothèque globale, page Serveur ───────────────────

@router.get("/moh")
async def list_moh(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_all_moh()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/moh", status_code=status.HTTP_201_CREATED)
async def upload_moh(
    name: str = Form(...), file: UploadFile = File(...), tenant_id: uuid.UUID | None = Form(None),
    _: User = Depends(get_current_user),
):
    try:
        content = await file.read()
        return await sipv_client.upload_moh(
            name, file.filename or "moh.wav", content, file.content_type,
            str(tenant_id) if tenant_id else None,
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"SIPV injoignable : {e}")


class MohUpdatePayload(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    tenant_id: uuid.UUID | None = None
    clear_tenant: bool = False


@router.put("/moh/{moh_id}")
async def update_moh(moh_id: uuid.UUID, payload: MohUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_moh(str(moh_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/moh/{moh_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_moh(moh_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_moh(str(moh_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/moh/{moh_id}/file")
async def download_moh(moh_id: uuid.UUID, _: User = Depends(get_current_user_media)):
    try:
        content, filename = await sipv_client.download_moh(str(moh_id))
        return Response(content=content, media_type="audio/wav", headers={"Content-Disposition": f'attachment; filename="{filename}"'})
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Fichier introuvable")
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class CallMohPayload(BaseModel):
    extension_id: uuid.UUID


@router.post("/moh/{moh_id}/call")
async def call_moh(moh_id: uuid.UUID, payload: CallMohPayload, _: User = Depends(get_current_user)):
    """Meme principe que call_prompt (telephony.py) : appelle un poste et joue
    ce fichier MOH des que ca decroche, pour l'ecouter au telephone."""
    try:
        return await sipv_client.call_moh(str(moh_id), str(payload.extension_id))
    except httpx.HTTPStatusError as e:
        detail = "SIPV injoignable"
        try:
            detail = e.response.json().get("detail", detail)
        except Exception:
            pass
        raise HTTPException(status_code=e.response.status_code if e.response.status_code < 500 else 502, detail=detail)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


# ── Backup cloud SIPV (TASK-S059) -- proxy pur, tout vit cote SIPV ─────────
# Le flux OAuth est relaye ici : SEUL ERPCRM a un domaine public joignable
# par Dropbox/Google. connect() et callback() sont volontairement SANS auth
# (navigation directe du navigateur, pas un appel XHR du SPA -- le CSRF est
# protege par le "state" cote SIPV, pas par un JWT ici).

@router.get("/backup/connections")
async def sipv_backup_list_connections(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_backup_connections()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class BackupConnectionSettingsPayload(BaseModel):
    enabled: bool | None = None
    timezone: str | None = None
    backup_hour: str | None = None
    bandwidth_limit_kbps: int | None = None


@router.put("/backup/connections/{provider}")
async def sipv_backup_update_connection(provider: str, payload: BackupConnectionSettingsPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_backup_connection(provider, **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class BackupCredentialsPayload(BaseModel):
    client_id: str
    client_secret: str


@router.put("/backup/connections/{provider}/credentials")
async def sipv_backup_update_credentials(provider: str, payload: BackupCredentialsPayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_backup_credentials(provider, payload.client_id, payload.client_secret)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/backup/connections/{provider}/connect")
async def sipv_backup_connect(provider: str):
    try:
        url = await sipv_client.get_backup_connect_url(provider)
    except httpx.HTTPError:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/server?server_backup={provider}_error")
    return RedirectResponse(url)


@router.get("/backup/connections/{provider}/callback")
async def sipv_backup_callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    if error or not code or not state:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/server?server_backup={provider}_error")
    try:
        await sipv_client.relay_backup_callback(provider, code, state)
    except httpx.HTTPStatusError as e:
        detail = "error"
        try:
            detail = e.response.json().get("detail", "error")
        except Exception:
            pass
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/server?server_backup={provider}_{detail}")
    except httpx.HTTPError:
        return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/server?server_backup={provider}_error")
    return RedirectResponse(f"{settings.PUBLIC_BASE_URL}/server?server_backup={provider}_connected")


@router.post("/backup/connections/{provider}/disconnect")
async def sipv_backup_disconnect(provider: str, _: User = Depends(get_current_user)):
    try:
        await sipv_client.disconnect_backup(provider)
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")
    return {"ok": True}


@router.get("/backup/cycles")
async def sipv_backup_list_cycles(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_backup_cycles()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class BackupCyclePayload(BaseModel):
    frequency_type: str
    day_of_week: int | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    retention_enabled: bool = True
    retention_count: int = 3
    enabled: bool = True


@router.post("/backup/cycles", status_code=status.HTTP_201_CREATED)
async def sipv_backup_create_cycle(payload: BackupCyclePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.create_backup_cycle(**payload.model_dump())
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


class BackupCycleUpdatePayload(BaseModel):
    day_of_week: int | None = None
    day_of_month: int | None = None
    month_of_year: int | None = None
    retention_enabled: bool | None = None
    retention_count: int | None = None
    enabled: bool | None = None


@router.put("/backup/cycles/{cycle_id}")
async def sipv_backup_update_cycle(cycle_id: uuid.UUID, payload: BackupCycleUpdatePayload, _: User = Depends(get_current_user)):
    try:
        return await sipv_client.update_backup_cycle(str(cycle_id), **payload.model_dump(exclude_unset=True))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.delete("/backup/cycles/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def sipv_backup_delete_cycle(cycle_id: uuid.UUID, _: User = Depends(get_current_user)):
    try:
        await sipv_client.delete_backup_cycle(str(cycle_id))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.post("/backup/run")
async def sipv_backup_run_now(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.run_backup_now()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")


@router.get("/backup/logs")
async def sipv_backup_list_logs(_: User = Depends(get_current_user)):
    try:
        return await sipv_client.list_backup_logs()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="SIPV injoignable")
