import uuid
import shutil
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.settings import get_setting
from app.models.catalogue import CatalogueItem
from app.models.user import User
from pydantic import BaseModel

router = APIRouter()
UPLOAD_DIR = Path("/home/simpleip/erpcrm/backend/uploads/catalogue")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

CatalogueType = Literal["service", "materiel", "connaissance"]


class CatalogueOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    price: float
    currency: str
    is_active: bool
    image_url: str | None
    description: str | None
    notes: str | None
    sipv_service_type: str | None
    rate_multiplier: float | None
    model_config = {"from_attributes": True}


class CatalogueCreate(BaseModel):
    name: str
    type: CatalogueType
    price: float = 0
    currency: str = "CAD"
    sipv_service_type: str | None = None


class CatalogueUpdate(BaseModel):
    name: str | None = None
    type: CatalogueType | None = None
    price: float | None = None
    is_active: bool | None = None
    description: str | None = None
    notes: str | None = None
    sipv_service_type: str | None = None
    rate_multiplier: float | None = None


@router.get("", response_model=list[CatalogueOut])
async def list_items(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(CatalogueItem).order_by(CatalogueItem.name))
    return result.scalars().all()


@router.get("/{item_id}", response_model=CatalogueOut)
async def get_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(CatalogueItem).where(CatalogueItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")
    return item


@router.post("", response_model=CatalogueOut, status_code=status.HTTP_201_CREATED)
async def create_item(payload: CatalogueCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    item = CatalogueItem(**payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.put("/{item_id}", response_model=CatalogueOut)
async def update_item(item_id: uuid.UUID, payload: CatalogueUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(CatalogueItem).where(CatalogueItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")
    changed = payload.model_dump(exclude_unset=True)
    for field, value in changed.items():
        setattr(item, field, value)
    # Prix des articles "connaissance" = taux horaire global x multiplicateur --
    # recalcule immediatement si on vient de classer l'item ou de changer son
    # multiplicateur, sans attendre le prochain changement de taux (Réglages).
    if item.type == "connaissance" and ("type" in changed or "rate_multiplier" in changed):
        hourly_rate = float(await get_setting(db, "hourly_rate"))
        item.price = hourly_rate * (item.rate_multiplier or 1)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{item_id}/image", response_model=CatalogueOut)
async def upload_image(item_id: uuid.UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(CatalogueItem).where(CatalogueItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item introuvable")
    ext = Path(file.filename).suffix.lower()
    if ext not in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
        raise HTTPException(status_code=400, detail="Format non supporté")
    if item.image_url:
        old_path = Path("/home/simpleip/erpcrm/backend") / item.image_url.lstrip("/")
        if old_path.exists():
            old_path.unlink()
    filename = f"{item_id}{ext}"
    dest = UPLOAD_DIR / filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    item.image_url = f"/uploads/catalogue/{filename}"
    await db.commit()
    await db.refresh(item)
    return item
