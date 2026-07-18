"""
Client HTTP ERPCRM -> SIPV.
Utilise pour creer/activer/desactiver le tenant telephonique d'une compagnie.
Authentification par X-Api-Key (settings.ERPCRM_API_KEY) — jamais de compte utilisateur.
"""
import httpx
from app.core.config import settings


def _headers() -> dict:
    return {"X-Api-Key": settings.ERPCRM_API_KEY}


async def sync_company(account_number: str, company_name: str, erpcrm_company_id: str, is_active: bool) -> dict:
    """
    Cree ou met a jour le tenant SIPV correspondant a cette compagnie.
    is_active=False desactive le tenant (les postes ne peuvent plus s'enregistrer)
    sans le supprimer — reversible en rappelant avec is_active=True.
    """
    async with httpx.AsyncClient(timeout=5.0) as client:
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
