import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.equipment import Equipment
from app.models.user import User

router = APIRouter()

CATEGORIES = ["ordinateur", "serveur", "imprimante", "telephone", "switch", "routeur", "autre"]
CAT_LABELS = {"ordinateur": "Ordinateur", "serveur": "Serveur", "imprimante": "Imprimante",
              "telephone": "Téléphone", "switch": "Switch", "routeur": "Routeur", "autre": "Autre"}


class EquipmentOut(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    category: str
    category_label: str
    name: str
    brand: str | None
    model: str | None
    serial_number: str | None
    asset_tag: str | None
    mac_address: str | None
    ip_address: str | None
    status: str
    purchase_date: date | None
    warranty_expiry: date | None
    notes: str | None

class EquipmentCreate(BaseModel):
    category: str
    name: str
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    asset_tag: str | None = None
    mac_address: str | None = None
    ip_address: str | None = None
    status: str = "actif"
    purchase_date: date | None = None
    warranty_expiry: date | None = None
    notes: str | None = None

class EquipmentUpdate(BaseModel):
    category: str | None = None
    name: str | None = None
    brand: str | None = None
    model: str | None = None
    serial_number: str | None = None
    asset_tag: str | None = None
    mac_address: str | None = None
    ip_address: str | None = None
    status: str | None = None
    purchase_date: date | None = None
    warranty_expiry: date | None = None
    notes: str | None = None


def _build(e: Equipment) -> EquipmentOut:
    return EquipmentOut(
        id=e.id, company_id=e.company_id,
        category=e.category, category_label=CAT_LABELS.get(e.category, e.category),
        name=e.name, brand=e.brand, model=e.model,
        serial_number=e.serial_number, asset_tag=e.asset_tag,
        mac_address=e.mac_address, ip_address=e.ip_address,
        status=e.status, purchase_date=e.purchase_date,
        warranty_expiry=e.warranty_expiry, notes=e.notes,
    )


@router.get("/company/{company_id}", response_model=list[EquipmentOut])
async def list_equipment(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(
        select(Equipment).where(Equipment.company_id == company_id).order_by(Equipment.category, Equipment.name)
    )
    return [_build(e) for e in result.scalars().all()]


@router.post("/company/{company_id}", response_model=EquipmentOut, status_code=status.HTTP_201_CREATED)
async def create_equipment(company_id: uuid.UUID, payload: EquipmentCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if payload.category not in CATEGORIES:
        raise HTTPException(status_code=400, detail=f"Catégorie invalide: {payload.category}")
    e = Equipment(company_id=company_id, **payload.model_dump())
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _build(e)


@router.put("/{equipment_id}", response_model=EquipmentOut)
async def update_equipment(equipment_id: uuid.UUID, payload: EquipmentUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Équipement introuvable")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(e, field, value)
    await db.commit()
    await db.refresh(e)
    return _build(e)


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_equipment(equipment_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    result = await db.execute(select(Equipment).where(Equipment.id == equipment_id))
    e = result.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Équipement introuvable")
    await db.delete(e)
    await db.commit()
