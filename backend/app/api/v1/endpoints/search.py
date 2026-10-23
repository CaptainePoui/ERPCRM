import unicodedata
import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.api.v1.endpoints.auth import get_current_user
from app.models.company import Company
from app.models.contact import Contact
from app.models.contact_company import ContactCompany
from app.models.user import User
from app.api.v1.endpoints.contacts import _office_company
from pydantic import BaseModel

router = APIRouter()


def _normalize(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')


class SearchResult(BaseModel):
    id: uuid.UUID
    type: str                       # company | contact | invoice | payment
    label: str
    sub: str | None
    company_id: uuid.UUID | None = None   # facture / paiement : ouverts dans la fiche du client (TASK-002.9)


def _squash(s: str) -> str:
    """TASK-052 : sans accents, espaces, tirets, apostrophes ni ponctuation -- « dastou » trouve « D'Astous Auto »."""
    import re
    return re.sub(r"[^a-z0-9]", "", _normalize(s))


def _sq(col):
    return func.regexp_replace(func.unaccent(func.lower(col)), "[^a-z0-9]", "", "g")


def _amount(q: str):
    """1234.56, 1234,56, 1 234,56 $, $1,234.56 -> Decimal, sinon None."""
    import re
    from decimal import Decimal, InvalidOperation
    t = q.replace("$", "").replace(" ", "").replace("\u00a0", "").strip()
    if not re.fullmatch(r"\d+([.,]\d{1,2})?|\d{1,3}([.,]\d{3})+([.,]\d{1,2})?", t):
        return None
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+([.,]\d{1,2})?", t) and len(t.replace(",", ".").split(".")[-1]) == 3:
        t = t.replace(",", "").replace(".", "")          # separateurs de milliers seulement
    else:
        last = max(t.rfind(","), t.rfind("."))
        t = t[:last].replace(",", "").replace(".", "") + "." + t[last + 1:] if last >= 0 else t
    try:
        return Decimal(t)
    except InvalidOperation:
        return None


@router.get("", response_model=list[SearchResult])
async def search(q: str = Query(min_length=1), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    term = f"%{_normalize(q)}%"
    sq = _squash(q)
    sterm = f"%{sq}%" if sq else term
    results = []

    companies = await db.execute(
        select(Company).where(
            or_(
                func.unaccent(func.lower(Company.name)).ilike(term),
                _sq(Company.name).ilike(sterm),
                _sq(func.coalesce(Company.legal_name, "")).ilike(sterm),
                Company.account_number.ilike(f"%{q.lower()}%"),
            )
        ).order_by(Company.is_active.desc(), Company.name).limit(6)
    )
    found = companies.scalars().all()
    if not found and len(sq) >= 4:
        # fautes de frappe (« physoteque » -> Physotech) : ressemblance sur le nom sans accents ni ponctuation
        from difflib import SequenceMatcher
        allc = (await db.execute(select(Company))).scalars().all()
        def score(c):
            n = _squash(c.name)
            parts = [n] + [_squash(w) for w in c.name.split()] + [n[:len(sq) + 2]]
            return max(SequenceMatcher(None, sq, p).ratio() for p in parts if p)
        scored = sorted(((score(c), c) for c in allc), key=lambda t: -t[0])
        found = [c for sc, c in scored if sc >= 0.66][:4]
    # TASK-002.8 : anciens noms et anciennes coordonnees (« str » -> MDI innovations Inc., anciennement Strong-MDI)
    from app.core import former_infos as fi
    former = await fi.entities_matching(db, q)
    seen = {c.id for c in found}
    if former:
        extra = (await db.execute(select(Company).where(Company.id.in_([e for e in former if e not in seen]))
                                  .order_by(Company.is_active.desc(), Company.name).limit(6))).scalars().all()
        found = list(found) + list(extra)
    for c in found:
        olds = [f for f in former.get(c.id, []) if f.kind == "name"]
        sub = c.account_number
        if olds and c.id not in seen:
            sub = f"anciennement {olds[0].value}" + (f" · {c.account_number}" if c.account_number else "")
        results.append(SearchResult(id=c.id, type="company", label=c.name, sub=sub))

    contacts = await db.execute(
        select(Contact)
        .outerjoin(ContactCompany, ContactCompany.contact_id == Contact.id)
        .outerjoin(Company, Company.id == ContactCompany.company_id)
        .options(selectinload(Contact.contact_companies).selectinload(ContactCompany.company))
        .where(
            or_(
                func.unaccent(func.lower(Contact.first_name)).ilike(term),
                func.unaccent(func.lower(Contact.last_name)).ilike(term),
                _sq(func.concat(Contact.first_name, Contact.last_name)).ilike(sterm),
                Contact.email.ilike(f"%{q.lower()}%"),
                Contact.phone.ilike(f"%{q.lower()}%"),
                Contact.mobile.ilike(f"%{q.lower()}%"),
                Company.office_phone.ilike(f"%{q.lower()}%"),
            )
        )
        .distinct()
        .limit(5)
    )
    contact_rows = list(contacts.scalars().unique())
    have = {c.id for c in contact_rows}
    old_ids = [e for e in former if e not in have and e not in seen]
    if old_ids:
        contact_rows += list((await db.execute(select(Contact).options(selectinload(Contact.contact_companies).selectinload(ContactCompany.company))
                                               .where(Contact.id.in_(old_ids)).limit(5))).scalars().unique())
    for c in contact_rows:
        name = f"{c.first_name} {c.last_name}".strip()
        office = _office_company(c)
        phone_display = (office.office_phone if office else None) or c.phone or c.mobile
        sub = c.email or phone_display
        if c.id not in have and former.get(c.id):
            f = former[c.id][0]
            sub = f"ancien {fi.KIND_FR[f.kind]} : {f.value}"
        results.append(SearchResult(id=c.id, type="contact", label=name, sub=sub))

    # TASK-052 : factures (par numero, ou par montant) et paiements (par montant)
    from app.models.invoice import Invoice
    from app.models.client_payment import ClientPayment
    status_fr = {"brouillon": "brouillon", "envoyee": "à payer", "en_retard": "en retard", "payee": "payée",
                 "partiellement_payee": "partiellement payée", "annulee": "annulée"}
    amt = _amount(q)
    conds = []
    if sq and any(ch.isdigit() for ch in sq):
        conds.append(_sq(Invoice.number).ilike(sterm))
    if amt is not None:
        conds.append(Invoice.total == amt)
    if conds:
        rows = (await db.execute(select(Invoice, Company.name).join(Company, Company.id == Invoice.company_id)
                                 .where(or_(*conds)).order_by(Invoice.issue_date.desc()).limit(8))).all()
        for inv, cname in rows:
            label = ("Avoir " if inv.credit_of_id else "Facture ") + inv.number
            results.append(SearchResult(id=inv.id, type="invoice", label=label, company_id=inv.company_id,
                                        sub=f"{cname} · {inv.total:.2f} $ · {inv.issue_date} · {status_fr.get(inv.status, inv.status)}"))
    if amt is not None:
        rows = (await db.execute(select(ClientPayment, Company.name).join(Company, Company.id == ClientPayment.company_id)
                                 .where(ClientPayment.amount == amt).order_by(ClientPayment.received_at.desc().nulls_last()).limit(6))).all()
        for cp, cname in rows:
            results.append(SearchResult(id=cp.id, type="payment", label=f"Paiement {cp.amount:.2f} $", company_id=cp.company_id,
                                        sub=f"{cname} · {cp.received_at or ''} · {cp.method_name}"))
    return results
