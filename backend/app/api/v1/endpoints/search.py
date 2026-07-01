import unicodedata
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.company import Company
from app.models.contact import Contact
from app.models.user import User
from pydantic import BaseModel

router = APIRouter()


def _normalize(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')


class SearchResult(BaseModel):
    id: uuid.UUID
    type: str
    label: str
    sub: str | None


@router.get("", response_model=list[SearchResult])
async def search(q: str = Query(min_length=1), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    term = f"%{_normalize(q)}%"
    results = []

    companies = await db.execute(
        select(Company).where(
            or_(
                func.unaccent(func.lower(Company.name)).ilike(term),
                Company.account_number.ilike(f"%{q.lower()}%"),
            )
        ).limit(5)
    )
    for c in companies.scalars():
        results.append(SearchResult(id=c.id, type="company", label=c.name, sub=c.account_number))

    contacts = await db.execute(
        select(Contact).where(
            or_(
                func.unaccent(func.lower(Contact.first_name)).ilike(term),
                func.unaccent(func.lower(Contact.last_name)).ilike(term),
                Contact.email.ilike(f"%{q.lower()}%"),
                Contact.phone.ilike(f"%{q.lower()}%"),
                Contact.mobile.ilike(f"%{q.lower()}%"),
            )
        ).limit(5)
    )
    for c in contacts.scalars():
        name = f"{c.first_name} {c.last_name}".strip()
        results.append(SearchResult(id=c.id, type="contact", label=name, sub=c.email or c.phone or c.mobile))

    return results
