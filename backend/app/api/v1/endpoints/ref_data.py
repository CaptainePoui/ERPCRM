from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.status import Status
from app.models.function import Function
from app.models.user import User
from app.schemas.common import StatusOut, FunctionOut, UserRefOut

router = APIRouter()


@router.get("/statuses", response_model=list[StatusOut])
async def list_statuses(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Status).where(Status.is_active == True).order_by(Status.name))
    return result.scalars().all()


@router.get("/functions", response_model=list[FunctionOut])
async def list_functions(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Function).where(Function.is_active == True).order_by(Function.name))
    return result.scalars().all()


@router.get("/users/managers", response_model=list[UserRefOut])
async def list_managers(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(User).where(User.is_active == True).order_by(User.full_name))
    return result.scalars().all()


@router.get("/phone-models")
async def list_phone_models(_: User = Depends(get_current_user)):
    """Catalogue des modeles de telephones SIPV (TASK-023.19), pour les dropdowns marque/modele."""
    import httpx
    from app.core import sipv_client
    try:
        return await sipv_client.list_phone_models()
    except httpx.HTTPError:
        return []


# Catalogue des options de configuration de poste telephonique (TASK-S011.5),
# style "Options" de l'UCM Grandstream : seule une option ajoutee explicitement
# (niveau Compagnie ou Contact) apparait sur la fiche -- volontairement minimal,
# scope au GXP2135 pour l'instant, extensible plus tard sans migration (cle
# stockee en JSON cote SIPV : Tenant.phone_option_defaults / ProvisionedPhone.extra_config).
#
# Champs formalises (TASK-S011.6/TASK-023.28) :
# - technical_id : code de parametre provisioning reel (ex. P1362 chez Grandstream),
#   tel qu'ecrit dans PhoneModel.config_template (0045_gxp2135_provisioning.py).
# - compatible_brands : marques PhoneModel.brand pour lesquelles l'option est
#   valide ; None = toutes.
# - validation / depends_on : cles reservees pour une future option qui en aura
#   reellement besoin (aucune option actuelle ne les utilise -- pas de moteur de
#   validation/dependance construit tant qu'aucun cas reel ne l'exige).
PHONE_OPTIONS_CATALOG = [
    {
        "key": "language",
        "label": "Langue du poste",
        "type": "select",
        # Verifie le 2026-10-14 dans le gabarit officiel gxp2130_40_60_70_35_config_1.0.11.106.txt (« Display Language »,
        # P1362 : en, fr, ..., auto). L'ancienne note « aucune ligne P1362 dans le gabarit » etait fausse.
        "choices": [{"value": "auto", "label": "Automatique"}, {"value": "fr", "label": "Français"}, {"value": "en", "label": "Anglais"}],
        "default": "auto",
        "technical_id": "P1362",
        "compatible_brands": ["Grandstream"],
        "validation": None,
        "depends_on": None,
    },
]


@router.get("/phone-options")
async def list_phone_options(_: User = Depends(get_current_user)):
    """Catalogue des options de poste disponibles (TASK-S011.5), pour les pickers Compagnie/Contact."""
    return PHONE_OPTIONS_CATALOG
