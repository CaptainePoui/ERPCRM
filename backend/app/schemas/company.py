from pydantic import BaseModel
from datetime import datetime
import uuid
from app.schemas.common import StatusOut, AddressOut, CommunicationOut, UserRefOut

class VendorRef(BaseModel):
    contact_id: uuid.UUID
    first_name: str
    last_name: str
    model_config = {"from_attributes": True}


class ContactInCompanyOut(BaseModel):
    contact_company_id: uuid.UUID
    contact_id: uuid.UUID
    first_name: str
    last_name: str
    email: str | None
    is_primary: bool
    is_active: bool
    functions: list[str]
    communications: list[CommunicationOut]

    model_config = {"from_attributes": True}


class CompanyCreate(BaseModel):
    name: str
    account_number: str | None = None
    office_phone: str | None = None
    legal_name: str | None = None
    website: str | None = None
    industry: str | None = None
    neq: str | None = None
    shareholder_type: str | None = None
    employee_count: int | None = None
    annual_revenue: float | None = None
    notes_internal: str | None = None
    internal_manager_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    currency: str = "CAD"
    exchange_rate: float = 1.0
    is_taxable: bool = True
    tvq_applicable: bool = True
    status_ids: list[uuid.UUID] = []
    addresses: list[dict] = []
    communications: list[dict] = []


class CompanyUpdate(BaseModel):
    name: str | None = None
    account_number: str | None = None
    office_phone: str | None = None
    legal_name: str | None = None
    website: str | None = None
    industry: str | None = None
    neq: str | None = None
    shareholder_type: str | None = None
    employee_count: int | None = None
    annual_revenue: float | None = None
    notes_internal: str | None = None
    internal_manager_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    currency: str | None = None
    exchange_rate: float | None = None
    is_taxable: bool | None = None
    tvq_applicable: bool | None = None
    is_active: bool | None = None


class CompanyListItem(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    name: str
    account_number: str | None
    legal_name: str | None
    industry: str | None
    is_active: bool
    created_at: datetime
    statuses: list[StatusOut]
    internal_manager: UserRefOut | None
    city: str | None

    model_config = {"from_attributes": True}


class CompanyOut(BaseModel):
    id: uuid.UUID
    entity_id: uuid.UUID
    name: str
    account_number: str | None
    office_phone: str | None
    legal_name: str | None
    website: str | None
    industry: str | None
    neq: str | None
    shareholder_type: str | None
    employee_count: int | None
    annual_revenue: float | None
    notes_internal: str | None
    is_active: bool
    sipv_enabled: bool
    sipv_tenant_id: uuid.UUID | None
    internal_manager_id: uuid.UUID | None
    internal_manager: UserRefOut | None
    vendor_id: uuid.UUID | None
    vendor: VendorRef | None
    currency: str
    is_taxable: bool
    tvq_applicable: bool
    created_at: datetime
    updated_at: datetime
    statuses: list[StatusOut]
    addresses: list[AddressOut]
    communications: list[CommunicationOut]
    contacts: list[ContactInCompanyOut]

    model_config = {"from_attributes": True}
