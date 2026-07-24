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
