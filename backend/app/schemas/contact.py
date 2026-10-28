from pydantic import BaseModel
from datetime import datetime
import uuid
from app.schemas.common import StatusOut


class CompanyInContactOut(BaseModel):
    contact_company_id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    email: str | None = None
    is_primary: bool
    is_active: bool
    functions: list[str]

    model_config = {"from_attributes": True}


class ContactCreate(BaseModel):
    first_name: str
    last_name: str = ""
    email: str | None = None
    email_other: str | None = None
    phone: str | None = None
    mobile: str | None = None
    extension: str | None = None
    phone_other: str | None = None
    sipv_sync: bool = False
    notes_internal: str | None = None
    status_ids: list[uuid.UUID] = []
    allow_duplicate: bool = False      # « Créer quand même » apres l'avertissement (TASK-003.3)


class ContactUpdate(BaseModel):
    first_name: str | None = None
    zeko_replies_off: bool | None = None          # TASK-026.9
    last_name: str | None = None
    email: str | None = None
    email_other: str | None = None
    phone: str | None = None
    mobile: str | None = None
    extension: str | None = None
    phone_other: str | None = None
    sipv_sync: bool | None = None
    notes_internal: str | None = None
    is_active: bool | None = None


class ContactListItem(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    first_name: str
    last_name: str
    is_active: bool
    created_at: datetime
    statuses: list[StatusOut]
    companies: list[CompanyInContactOut]
    email: str | None
    phone: str | None
    mobile: str | None

    model_config = {"from_attributes": True}


class ContactOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    email_other: str | None
    zeko_replies_off: bool = False
    phone: str | None
    mobile: str | None
    extension: str | None
    phone_other: str | None
    sipv_sync: bool
    notes_internal: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    statuses: list[StatusOut]
    companies: list[CompanyInContactOut]

    model_config = {"from_attributes": True}


class ContactCompanyLink(BaseModel):
    contact_id: uuid.UUID
    email: str | None = None
    function_ids: list[uuid.UUID] = []
    is_primary: bool = False


class ContactCompanyUpdate(BaseModel):
    email: str | None = None
    # None = ne pas toucher aux fonctions (TASK-003.5 : [] par defaut effacait toutes
    # les fonctions a chaque modification du courriel depuis la carte ou un ticket)
    function_ids: list[uuid.UUID] | None = None
    is_primary: bool | None = None
    is_active: bool | None = None
