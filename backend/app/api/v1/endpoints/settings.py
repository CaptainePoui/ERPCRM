import math
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.app_settings import AppSetting
from app.models.catalogue import CatalogueItem
from app.models.user import User

router = APIRouter()

DEFAULTS = {
    "hourly_rate": "145.00",
    "labour_round_minutes": "15",
    "commission_rate": "10.0",
    "default_vendor_contact_id": "",
}


async def get_setting(db: AsyncSession, key: str) -> str:
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    return s.value if s else DEFAULTS.get(key, "")


async def set_setting(db: AsyncSession, key: str, value: str):
    r = await db.execute(select(AppSetting).where(AppSetting.key == key))
    s = r.scalar_one_or_none()
    if s:
        s.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    await db.commit()


def _round_psychological(price: float) -> float:
    """Round UP to nearest price ending in X4.95 or X9.95 (i.e. n*5 - 0.05)."""
    n = math.ceil((price + 0.05) / 5)
    if n < 1:
        n = 1
    return round(n * 5 - 0.05, 2)


class SettingsOut(BaseModel):
    hourly_rate: float
    labour_round_minutes: int
    commission_rate: float
    default_vendor_contact_id: str


class SettingsIn(BaseModel):
    hourly_rate: float | None = None
    labour_round_minutes: int | None = None
    commission_rate: float | None = None
    default_vendor_contact_id: str | None = None


class InflationPayload(BaseModel):
    percent: float  # e.g. 3.5 for 3.5%


@router.get("", response_model=SettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return SettingsOut(
        hourly_rate=float(await get_setting(db, "hourly_rate")),
        labour_round_minutes=int(await get_setting(db, "labour_round_minutes")),
        commission_rate=float(await get_setting(db, "commission_rate")),
        default_vendor_contact_id=await get_setting(db, "default_vendor_contact_id"),
    )


@router.put("", response_model=SettingsOut)
async def update_settings(payload: SettingsIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.hourly_rate is not None:
        await set_setting(db, "hourly_rate", str(payload.hourly_rate))
        # Sync all catalogue items linked to hourly rate
        r = await db.execute(select(CatalogueItem).where(CatalogueItem.linked_to_hourly_rate == True, CatalogueItem.is_active == True))
        for item in r.scalars().all():
            item.price = payload.hourly_rate
        await db.commit()
    if payload.labour_round_minutes is not None:
        await set_setting(db, "labour_round_minutes", str(payload.labour_round_minutes))
    if payload.commission_rate is not None:
        await set_setting(db, "commission_rate", str(payload.commission_rate))
    if payload.default_vendor_contact_id is not None:
        await set_setting(db, "default_vendor_contact_id", payload.default_vendor_contact_id)
    return await get_settings(db)


class InflationResult(BaseModel):
    updated: int
    preview: list[dict]


@router.post("/apply-inflation", response_model=InflationResult)
async def apply_inflation(payload: InflationPayload, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Apply inflation % to all catalogue items NOT linked to hourly rate."""
    r = await db.execute(
        select(CatalogueItem).where(
            CatalogueItem.linked_to_hourly_rate == False,
            CatalogueItem.is_active == True,
            CatalogueItem.price > 0,
        )
    )
    items = r.scalars().all()
    preview = []
    for item in items:
        old_price = item.price
        new_price = _round_psychological(old_price * (1 + payload.percent / 100))
        preview.append({"id": str(item.id), "name": item.name, "old_price": old_price, "new_price": new_price})
        item.price = new_price
    await db.commit()
    return InflationResult(updated=len(items), preview=preview)
