from pydantic import BaseModel
from datetime import datetime
import uuid
from app.schemas.common import StatusOut


class CompanyInContactOut(BaseModel):
    contact_company_id: uuid.UUID
    company_id: uuid.UUID
    company_name: str
    is_primary: bool
    is_active: bool
    functions: list[str]

    model_config = {"from_attributes": True}


class ContactCreate(BaseModel):
    first_name: str
    last_name: str = ""
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    extension: str | None = None
    notes_internal: str | None = None
    status_ids: list[uuid.UUID] = []


class ContactUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    mobile: str | None = None
    extension: str | None = None
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
    phone: str | None
    mobile: str | None
    extension: str | None
    notes_internal: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    statuses: list[StatusOut]
    companies: list[CompanyInContactOut]

    model_config = {"from_attributes": True}


class ContactCompanyLink(BaseModel):
    contact_id: uuid.UUID
    function_ids: list[uuid.UUID] = []
    is_primary: bool = False


class ContactCompanyUpdate(BaseModel):
    function_ids: list[uuid.UUID] = []
    is_primary: bool | None = None
    is_active: bool | None = None
