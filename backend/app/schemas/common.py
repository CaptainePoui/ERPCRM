from pydantic import BaseModel
from datetime import datetime
import uuid


class StatusOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str | None
    is_system: bool
    applies_to: str = "both"
    choice_menu: bool = False          # TASK-002.20 : pastille-menu déroulant
    choices: list = []                 # [{"group": str|None, "options": [str]}]
    choice: str | None = None          # choix gardé sur la fiche (entity_statuses.choice)

    model_config = {"from_attributes": True}


def status_out(es) -> StatusOut:
    """Pastille portée par une fiche, avec le choix de son menu (TASK-002.20)."""
    return StatusOut.model_validate(es.status).model_copy(update={"choice": es.choice})


class FunctionOut(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    color: str | None = None          # TASK-002.18 : spécialisation du contact
    contact_tabs: list[str] = []

    model_config = {"from_attributes": True}


class AddressOut(BaseModel):
    id: uuid.UUID
    address_type: str
    street_1: str
    street_2: str | None
    city: str
    province: str
    postal_code: str
    country: str
    is_primary: bool
    is_active: bool

    model_config = {"from_attributes": True}


class AddressCreate(BaseModel):
    address_type: str
    street_1: str
    street_2: str | None = None
    city: str
    province: str = "QC"
    postal_code: str
    country: str = "CA"
    is_primary: bool = False


class CommunicationOut(BaseModel):
    id: uuid.UUID
    channel_type: str
    value: str
    label: str | None
    is_primary: bool
    is_active: bool

    model_config = {"from_attributes": True}


class CommunicationCreate(BaseModel):
    channel_type: str
    value: str
    label: str | None = None
    is_primary: bool = False


class UserRefOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str

    model_config = {"from_attributes": True}
