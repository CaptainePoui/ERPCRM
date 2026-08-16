"""
Client HTTP ERPCRM -> SIPV.
Utilise pour creer/activer/desactiver le tenant telephonique d'une compagnie.
Authentification par X-Api-Key (settings.ERPCRM_API_KEY) — jamais de compte utilisateur.
"""
import httpx
from app.core.config import settings

# CA privee ERPCRM<->SIPV (TASK-039 TLS inter-serveurs) -- verifie le certificat du
# port TLS dedie de SIPV (8022), distinct du port HTTP existant (8020, inchange,
# reste utilise par le frontend).
_CA_PATH = "/home/simpleip/erpcrm/backend/certs/ca.pem"


def _headers() -> dict:
    return {"X-Api-Key": settings.ERPCRM_API_KEY}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=5.0, verify=_CA_PATH)


async def sync_company(account_number: str, company_name: str, erpcrm_company_id: str, is_active: bool) -> dict:
    """
    Cree ou met a jour le tenant SIPV correspondant a cette compagnie.
    is_active=False desactive le tenant (les postes ne peuvent plus s'enregistrer)
    sans le supprimer — reversible en rappelant avec is_active=True.
    """
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/sync/company",
            json={
                "account_number": account_number,
                "company_name": company_name,
                "erpcrm_company_id": erpcrm_company_id,
                "is_active": is_active,
            },
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def sync_site(tenant_id: str, erpcrm_site_id: str, label: str, civic_number: str, street_name: str,
                     unit: str | None, city: str, province: str, postal_code: str, country: str, is_active: bool) -> dict:
    """
    Cree ou met a jour la copie SIPV (E911Address) d'une succursale ERPCRM.
    ERPCRM est maitre pour company_sites -- comme sync_company, cet appel est
    bloquant : si SIPV ne repond pas, rien n'est sauvegarde ni cote ERPCRM ni
    cote SIPV (pas d'etat divergent possible entre les deux bases).
    """
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/sync/site",
            json={
                "erpcrm_site_id": erpcrm_site_id, "tenant_id": tenant_id, "label": label,
                "civic_number": civic_number, "street_name": street_name, "unit": unit,
                "city": city, "province": province, "postal_code": postal_code,
                "country": country, "is_active": is_active,
            },
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def sync_did(tenant_id: str, erpcrm_did_id: str, number: str, label: str | None,
                    destination_type: str | None, destination: str | None, is_active: bool,
                    schedule_id: str | None = None,
                    after_message_destination_type: str | None = None,
                    after_message_destination: str | None = None) -> dict:
    """
    Cree ou met a jour la copie SIPV (TenantDID) d'un DID ERPCRM. ERPCRM est
    maitre (numero/destination/succursale/horaire), SIPV reste la source reelle
    du routage d'appel. Bloquant comme sync_company/sync_site.
    `after_message_destination_type/destination` (TASK-023.32) : action apres la
    lecture d'une phrase quand destination_type == "message" ("Ajouter une
    destination" cote UI) -- ignore par SIPV pour tout autre type.
    """
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/sync/did",
            json={
                "erpcrm_did_id": erpcrm_did_id, "tenant_id": tenant_id, "number": number,
                "label": label, "destination_type": destination_type, "destination": destination,
                "is_active": is_active, "schedule_id": schedule_id,
                "after_message_destination_type": after_message_destination_type,
                "after_message_destination": after_message_destination,
            },
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Horaires (Schedule/ScheduleRule/Holiday, TASK-S016/S010.7) -- simple proxy,
# pas de copie maitre cote ERPCRM : le routage d'appel n'a besoin d'exister que
# dans SIPV, contrairement aux succursales (aussi utilisees pour la facturation).
async def list_prompts(tenant_id: str) -> list[dict]:
    """TASK-023.32 : phrases/annonces disponibles pour ce tenant (bibliotheque
    AudioPrompt, TASKSIPV TASK-S046) -- alimente le selecteur de destination
    "Message enregistre" cote CompanyDetail.jsx."""
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/prompts/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def upload_prompt(tenant_id: str, name: str, filename: str, content: bytes, content_type: str) -> dict:
    """TASK-029 : cree une phrase (upload direct OU audio genere par Voicebox)."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/prompts/tenant/{tenant_id}",
            data={"name": name},
            files={"file": (filename, content, content_type or "application/octet-stream")},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def rename_prompt(prompt_id: str, name: str) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/prompts/{prompt_id}", json={"name": name}, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_prompt(prompt_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/prompts/{prompt_id}", headers=_headers())
        resp.raise_for_status()


async def download_prompt(prompt_id: str) -> tuple[bytes, str]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/prompts/{prompt_id}/file", headers=_headers())
        resp.raise_for_status()
        filename = "phrase.wav"
        cd = resp.headers.get("content-disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=", 1)[1].strip('"; ')
        return resp.content, filename


async def call_prompt(prompt_id: str, extension_id: str) -> dict:
    """TASK-S055 : appelle un poste et joue cette phrase des que ca decroche."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/prompts/{prompt_id}/call",
            json={"extension_id": extension_id},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def call_moh(moh_id: str, extension_id: str) -> dict:
    """Meme principe que call_prompt : appelle un poste et joue ce fichier MOH
    des que ca decroche, pour l'ecouter au telephone."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/moh/{moh_id}/call",
            json={"extension_id": extension_id},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_schedules(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/schedules/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_schedule(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/schedules/tenant/{tenant_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_schedule(sched_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/schedules/{sched_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_schedule(sched_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/schedules/{sched_id}", headers=_headers())
        resp.raise_for_status()


async def add_schedule_rule(sched_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/schedules/{sched_id}/rules", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_schedule_rule(rule_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/schedules/rules/{rule_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_schedule_rule(rule_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/schedules/rules/{rule_id}", headers=_headers())
        resp.raise_for_status()


async def delete_tenant_did(tenant_did_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/dids/{tenant_did_id}", headers=_headers())
        if resp.status_code == 404:
            return
        resp.raise_for_status()


async def get_extensions_by_contact(erpcrm_contact_id: str) -> list[dict]:
    """
    Retourne les postes SIP lies a ce contact (normalement 0 ou 1, mais SIPV ne
    l'impose pas strictement, donc on retourne une liste).
    """
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/extensions/by-contact/{erpcrm_contact_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def create_extension(tenant_id: str, **fields) -> dict:
    """TASK-033 : cree un vrai poste SIP dans SIPV depuis ERPCRM (n'existait
    pas avant -- la creation ne se faisait que directement dans SIPV)."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/extensions/tenant/{tenant_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_extensions(tenant_id: str) -> list[dict]:
    """Liste des postes SIP d'un tenant (pour l'onglet Telephonie de la fiche compagnie)."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/extensions/tenant/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_connection_info(extension_id: str) -> dict:
    """
    Infos de connexion completes (avec mot de passe en clair) d'un poste SIP, pour
    configuration manuelle d'un telephone quand le provisioning automatique echoue.
    Mot de passe chiffre (Fernet) au repos cote SIPV, dechiffre uniquement a l'appel.
    """
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/extensions/{extension_id}/connection-info",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_extension(extension_id: str, **fields) -> dict:
    """Met a jour un poste SIP (enregistrement d'appel, renvois, etc.) depuis ERPCRM."""
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/extensions/{extension_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def delete_extension(extension_id: str) -> None:
    """TASK-033 : supprime reellement un poste SIP dans SIPV -- SIPV gere lui-meme
    la notification de retrait pour le prorata de facturation (extension_removed)."""
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/extensions/{extension_id}", headers=_headers())
        resp.raise_for_status()


# ── Groupes de pickup (interception *8, TASK-023.15.1) ─────────────────────────
async def list_pickup_groups(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/extensions/pickup-groups/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_pickup_group(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/extensions/pickup-groups/tenant/{tenant_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_pickup_group(group_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/extensions/pickup-groups/{group_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_pickup_group(group_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/extensions/pickup-groups/{group_id}", headers=_headers())
        resp.raise_for_status()


async def get_tenant(tenant_id: str) -> dict:
    """Fiche complete du tenant SIPV (TASK-S011.5 -- lecture des options telephonie compagnie)."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/tenants/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_tenant(tenant_id: str, **fields) -> dict:
    """Met a jour le tenant SIPV (TASK-S011.5 -- ecriture des options telephonie compagnie)."""
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/tenants/{tenant_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def tenant_registrations(tenant_id: str) -> list[dict]:
    """Statut d'enregistrement en direct (via ESL) de chaque poste d'un tenant."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/esl/registrations/tenant/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_esl_status() -> dict:
    """
    Connexion SIPV<->FreeSWITCH (ESL), un fait GLOBAL au serveur, pas par poste
    (TASK-023.32) -- distinct du statut d'enregistrement d'un poste precis
    (tenant_registrations). Retourne {"connected": False} plutot que de lever si
    SIPV est injoignable -- c'est justement l'info qu'on veut afficher.
    """
    try:
        async with _client() as client:
            resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/esl/status", headers=_headers())
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError:
        return {"connected": False, "sofia_status": None, "error": "SIPV injoignable"}


async def list_phone_models() -> list[dict]:
    """Catalogue des modeles de telephones (TASK-023.19), pour les dropdowns marque/modele."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/models",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_phone_by_extension(extension_id: str) -> dict | None:
    """Telephone physique attribue a ce poste, ou None si aucun."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/by-extension/{extension_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def create_provisioned_phone(tenant_id: str, **fields) -> dict:
    """Attribue un nouvel appareil physique a un poste (marque/modele/MAC/serie)."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/tenant/{tenant_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_provisioned_phone(phone_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/{phone_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_phone_buttons(phone_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/{phone_id}/buttons",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def create_phone_button(phone_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/{phone_id}/buttons",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_phone_button(button_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/buttons/{button_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def delete_phone_button(button_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/buttons/{button_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def list_cdr_for_extension(tenant_id: str, extension: str, page: int = 1, page_size: int = 50) -> dict:
    """TASK-S055 : historique d'appels personnel, portail Mon poste."""
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/cdr/tenant/{tenant_id}",
            params={"extension": extension, "page": page, "page_size": page_size},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_cdr(tenant_id: str, page: int = 1, page_size: int = 50, extension: str | None = None,
                    direction: str | None = None, disposition: str | None = None,
                    date_from: str | None = None, date_to: str | None = None) -> dict:
    """TASK-032 : historique d'appels de toute la compagnie (fiche compagnie ERPCRM),
    avec filtre optionnel par poste -- meme endpoint SIPV que list_cdr_for_extension,
    juste sans forcer le filtre extension."""
    params = {"page": page, "page_size": page_size}
    if extension:
        params["extension"] = extension
    if direction:
        params["direction"] = direction
    if disposition:
        params["disposition"] = disposition
    if date_from:
        params["date_from"] = date_from
    if date_to:
        params["date_to"] = date_to
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/cdr/tenant/{tenant_id}",
            params=params,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def list_ivrs(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/ivr/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def list_queues(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/ivr/queues/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def list_ring_groups(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/tenant/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def create_ring_group(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/tenant/{tenant_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_ring_group(rg_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/{rg_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def delete_ring_group(rg_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/{rg_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def add_ring_group_member(rg_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/{rg_id}/members",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_ring_group_member(member_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/members/{member_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def remove_ring_group_member(member_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/members/{member_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def add_ring_group_failover_step(rg_id: str, **fields) -> dict:
    """TASK-S051 : etape de la chaine de destinations de secours (illimitee)."""
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/{rg_id}/failover-steps",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_ring_group_failover_step(step_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/failover-steps/{step_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def remove_ring_group_failover_step(step_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/ivr/ring-groups/failover-steps/{step_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def list_paging_groups(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/tenant/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def create_paging_group(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/tenant/{tenant_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_paging_group(pg_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/{pg_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def delete_paging_group(pg_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/{pg_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def add_paging_group_member(pg_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/{pg_id}/members",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_paging_group_member(member_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/members/{member_id}",
            json=fields,
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def remove_paging_group_member(member_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/ivr/paging-groups/members/{member_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def list_button_templates(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/button-templates/tenant/{tenant_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def delete_button_template(template_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/button-templates/{template_id}",
            headers=_headers(),
        )
        resp.raise_for_status()


async def save_phone_as_template(phone_id: str, name: str) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/{phone_id}/save-as-template",
            json={"name": name},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def apply_button_template(template_id: str, phone_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/provisioning/button-templates/{template_id}/apply/{phone_id}",
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


# ── Tenant/Tenant-Model/Global Templates -- chaine d'heritage (TASK-S044) ──────
async def list_servers() -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/servers", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_server(server_id: str, **fields) -> dict:
    """TASK-S054 : édition des champs serveur (dont sip_inbound_ip/sip_outbound_ip)."""
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/servers/{server_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def list_global_templates(server_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/servers/{server_id}/global-templates", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_global_template(**fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/servers/global-templates", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_global_template(template_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/servers/global-templates/{template_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_global_template(template_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/servers/global-templates/{template_id}", headers=_headers())
        resp.raise_for_status()


async def list_tenant_templates(server_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/servers/{server_id}/tenant-templates", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_tenant_template(**fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/servers/tenant-templates", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_tenant_template(template_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/servers/tenant-templates/{template_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_tenant_template(template_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/servers/tenant-templates/{template_id}", headers=_headers())
        resp.raise_for_status()


async def list_tenant_model_templates(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/provisioning/tenant-model-templates/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_tenant_model_template(**fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/provisioning/tenant-model-templates", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_tenant_model_template(template_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/provisioning/tenant-model-templates/{template_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_tenant_model_template(template_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/provisioning/tenant-model-templates/{template_id}", headers=_headers())
        resp.raise_for_status()


# ── E911 -- adresses (succursales) + assignation par poste (TASK-S010/S010.2) ──
async def list_e911_addresses(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/e911/addresses/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_e911_address(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/e911/addresses/tenant/{tenant_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_e911_address(addr_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/e911/addresses/{addr_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_e911_address(addr_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/e911/addresses/{addr_id}", headers=_headers())
        resp.raise_for_status()


async def get_extension_e911_assignment(extension_id: str) -> dict | None:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/e911/extension-assignments/by-extension/{extension_id}", headers=_headers())
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return resp.json()


async def create_extension_e911_assignment(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/e911/extension-assignments/tenant/{tenant_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_extension_e911_assignment(assign_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/e911/extension-assignments/{assign_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_extension_e911_assignment(assign_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/e911/extension-assignments/{assign_id}", headers=_headers())
        resp.raise_for_status()


# ── Boite vocale (VoicemailBox) ─────────────────────────────────────────────────
async def list_voicemails(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/voicemail/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_voicemail(tenant_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/voicemail/tenant/{tenant_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_voicemail(vm_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/voicemail/{vm_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_voicemail(vm_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/voicemail/{vm_id}", headers=_headers())
        resp.raise_for_status()


async def upload_voicemail_greeting(vm_id: str, greeting_type: str, filename: str, content: bytes, content_type: str) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/voicemail/{vm_id}/greetings/{greeting_type}",
            files={"file": (filename, content, content_type or "application/octet-stream")},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def download_voicemail_greeting(vm_id: str, greeting_type: str) -> tuple[bytes, str]:
    """Retourne (contenu, filename) -- laisse l'appelant decider du Content-Type."""
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/voicemail/{vm_id}/greetings/{greeting_type}", headers=_headers())
        resp.raise_for_status()
        filename = "greeting.wav"
        cd = resp.headers.get("content-disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=", 1)[1].strip('"; ')
        return resp.content, filename


async def delete_voicemail_greeting(vm_id: str, greeting_type: str) -> dict:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/voicemail/{vm_id}/greetings/{greeting_type}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def get_voicemail_global_settings() -> dict:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/voicemail/global-settings", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_voicemail_global_settings(**fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/voicemail/global-settings", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


# ── MOH (TASK-S033) ─────────────────────────────────────────────────────────

async def list_all_moh() -> list[dict]:
    """Toutes les MOH (globales + dediees), pour la page Serveur."""
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/moh", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def list_available_moh(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/moh/available/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def upload_moh(name: str, filename: str, content: bytes, content_type: str, tenant_id: str | None = None) -> dict:
    async with _client() as client:
        data = {"name": name}
        if tenant_id:
            data["tenant_id"] = tenant_id
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/moh",
            data=data,
            files={"file": (filename, content, content_type or "application/octet-stream")},
            headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def update_moh(moh_id: str, **fields) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/moh/{moh_id}", json=fields, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_moh(moh_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/moh/{moh_id}", headers=_headers())
        resp.raise_for_status()


async def download_moh(moh_id: str) -> tuple[bytes, str]:
    """Retourne (contenu, filename) -- laisse l'appelant decider du Content-Type."""
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/moh/{moh_id}/file", headers=_headers())
        resp.raise_for_status()
        filename = "moh.wav"
        cd = resp.headers.get("content-disposition", "")
        if "filename=" in cd:
            filename = cd.split("filename=", 1)[1].strip('"; ')
        return resp.content, filename


async def get_moh_selection(tenant_id: str) -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/moh/selection/tenant/{tenant_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def set_moh_selection(tenant_id: str, items: list[dict]) -> list[dict]:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/moh/selection/tenant/{tenant_id}", json=items, headers=_headers())
        resp.raise_for_status()
        return resp.json()


# ── Backup cloud SIPV (TASK-S059, proxy depuis la page Serveur) ────────────

async def list_backup_connections() -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/backup/connections", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_backup_connection(provider: str, **kwargs) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/backup/connections/{provider}", json=kwargs, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_backup_credentials(provider: str, client_id: str, client_secret: str) -> dict:
    async with _client() as client:
        resp = await client.put(
            f"{settings.SIPV_API_URL}/api/v1/backup/connections/{provider}/credentials",
            json={"client_id": client_id, "client_secret": client_secret}, headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def get_backup_connect_url(provider: str) -> str:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/backup/connections/{provider}/connect-url", headers=_headers())
        resp.raise_for_status()
        return resp.json()["url"]


async def relay_backup_callback(provider: str, code: str, state: str) -> dict:
    async with _client() as client:
        resp = await client.post(
            f"{settings.SIPV_API_URL}/api/v1/backup/connections/{provider}/callback",
            json={"code": code, "state": state}, headers=_headers(),
        )
        resp.raise_for_status()
        return resp.json()


async def disconnect_backup(provider: str) -> None:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/backup/connections/{provider}/disconnect", headers=_headers())
        resp.raise_for_status()


async def list_backup_cycles() -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/backup/cycles", headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def create_backup_cycle(**kwargs) -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/backup/cycles", json=kwargs, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def update_backup_cycle(cycle_id: str, **kwargs) -> dict:
    async with _client() as client:
        resp = await client.put(f"{settings.SIPV_API_URL}/api/v1/backup/cycles/{cycle_id}", json=kwargs, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def delete_backup_cycle(cycle_id: str) -> None:
    async with _client() as client:
        resp = await client.delete(f"{settings.SIPV_API_URL}/api/v1/backup/cycles/{cycle_id}", headers=_headers())
        resp.raise_for_status()


async def run_backup_now() -> dict:
    async with _client() as client:
        resp = await client.post(f"{settings.SIPV_API_URL}/api/v1/backup/run", headers=_headers(), timeout=120.0)
        resp.raise_for_status()
        return resp.json()


async def list_backup_logs() -> list[dict]:
    async with _client() as client:
        resp = await client.get(f"{settings.SIPV_API_URL}/api/v1/backup/logs", headers=_headers())
        resp.raise_for_status()
        return resp.json()
