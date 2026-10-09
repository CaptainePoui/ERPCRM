"""Journal des actions -- lecture (TASK-049 etape 2, 2026-10-09).

Administration -> Journal : tout, filtre par personne, date, sorte de fiche, recherche ; option « noter les
consultations » (eteinte au depart, administrateur ou gestionnaire). Onglet Historique d'une fiche : ses lignes et
celles de ses morceaux (lignes de facture, notes de ticket...), meme supprimes. Les noms (personne, fiche) sont lus la
ou ils vivent au moment de l'affichage, jamais copies dans le journal.
"""
import uuid
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.endpoints.auth import get_current_user
from app.api.v1.endpoints.logs import ACTION_LABELS as ENTITY_ACTIONS, FIELD_LABELS as ENTITY_FIELDS
from app.core import audit, clock
from app.core.database import Base, get_db
from app.models.entity_log import EntityLog
from app.models.portal import PortalUser
from app.models.user import User, UserRole

router = APIRouter()

TABLE_LABELS = {
    "companies": "Compagnie", "contacts": "Contact", "catalogue_items": "Article du catalogue", "invoices": "Facture",
    "invoice_lines": "Ligne de facture", "devis": "Devis", "devis_lines": "Ligne de devis", "tickets": "Ticket",
    "ticket_entries": "Note de ticket", "tasks": "Tâche", "task_reminders": "Rappel de tâche", "client_payments": "Paiement reçu",
    "payment_allocations": "Paiement appliqué à une facture", "payments": "Paiement", "credit_allocations": "Crédit appliqué",
    "bills": "Facture fournisseur", "bill_lines": "Ligne de facture fournisseur", "vendors": "Fournisseur",
    "vendor_payments": "Paiement effectué", "vendor_payment_allocations": "Paiement fournisseur appliqué",
    "vendor_credits": "Avoir fournisseur", "vendor_credit_allocations": "Avoir fournisseur appliqué", "expenses": "Dépense",
    "expense_lines": "Ligne de dépense", "expense_categories": "Catégorie de dépense",
    "recurring_bills": "Facture fournisseur périodique", "recurring_bill_lines": "Ligne de facture fournisseur périodique",
    "recurring_expenses": "Dépense périodique", "company_recurring_billings": "Facturation périodique",
    "recurring_billing_lines": "Ligne de facturation périodique", "bank_accounts": "Compte bancaire",
    "bank_transactions": "Transaction bancaire", "bank_statement_imports": "Relevé bancaire importé",
    "bank_payee_rules": "Règle bancaire", "purchase_orders": "Bon de commande", "purchase_order_lines": "Ligne de bon de commande",
    "ecom_orders": "Commande web", "ecom_order_lines": "Ligne de commande web", "employees": "Employé",
    "salary_payments": "Salaire", "users": "Compte de connexion", "portal_users": "Accès portail",
    "mailboxes": "Boîte de courriel", "mail_messages": "Courriel", "app_settings": "Réglage",
    "document_counters": "Numérotation", "payment_methods": "Méthode de paiement", "tax_obligations": "Taxes à payer",
    "tax_payments": "Paiement de taxes", "tax_adjustments": "Ajustement de taxes", "receipt_documents": "Reçu",
    "interac_notices": "Avis Interac", "barter_exchanges": "Échange (troc)", "barter_applications": "Échange appliqué",
    "barter_deductions": "Déduction d'échange", "barter_files": "Document d'échange", "equipment": "Équipement",
    "client_access": "Accès client", "dids": "Numéro de téléphone", "extensions": "Poste", "addresses": "Adresse",
    "communication_channels": "Coordonnée", "contact_companies": "Lien contact – compagnie", "entity_statuses": "Statut",
    "company_sites": "Site", "installation_photos": "Photo d'installation", "appointments": "Rendez-vous",
    "cdr_report_schedules": "Rapport d'appels programmé", "cloud_backup_connections": "Sauvegarde infonuagique",
    "contact_company_functions": "Fonction d'un contact", "requete": "Action",
}
ROUTES = {"companies": "/companies/{}", "contacts": "/contacts/{}", "catalogue_items": "/catalogue/{}", "invoices": "/invoices/{}",
          "devis": "/devis/{}", "tickets": "/tickets/{}", "purchase_orders": "/purchase-orders/{}", "bills": "/purchases/bills/{}"}
ACTIONS = {**ENTITY_ACTIONS, "created": "Création", "field_change": "Modification", "deleted": "Suppression",
           "request": "Action", "viewed": "Consultation"}
FIELDS = {**ENTITY_FIELDS, "price": "Prix", "cost": "Coût", "status": "Statut", "title": "Titre", "description": "Description",
          "quantity": "Quantité", "unit_price": "Prix unitaire", "unit_cost": "Coût unitaire", "total": "Total",
          "subtotal": "Sous-total", "due_date": "Échéance", "notes": "Notes", "amount": "Montant", "date": "Date",
          "number": "Numéro", "priority": "Priorité", "type": "Type", "sku": "Code", "is_read": "Lu", "last_login": "Connexion",
          "hashed_password": "Mot de passe", "password_enc": "Mot de passe", "role": "Rôle", "full_name": "Nom",
          "invoice_date": "Date de facture", "issue_date": "Date", "paid_at": "Payé le", "assigned_to": "Assigné à",
          "company_id": "Compagnie", "contact_id": "Contact", "vendor_id": "Fournisseur", "category_id": "Catégorie",
          "rate_multiplier": "Multiplicateur du taux", "image_path": "Image", "hourly_rate": "Taux horaire",
          "labour_round_minutes": "Arrondi du temps", "commission_rate": "Commission vendeur (%)",
          "audit_views_enabled": "Noter les consultations", "email_signature": "Signature", "work_email": "Courriel professionnel"}
SOURCES = {"ecran": "Employé", "portail": "Client (portail)", "automatique": "Automatique", "sipv": "SIPV"}


class OptionsIn(BaseModel):
    views_enabled: bool


def _can_change(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.manager)


async def _names(db: AsyncSession, wanted: dict[str, set[str]]) -> dict[tuple[str, str], str]:
    """Nom actuel de chaque fiche, lu dans sa table (jamais garde dans le journal)."""
    out: dict[tuple[str, str], str] = {}
    for table_name, ids in wanted.items():
        table = Base.metadata.tables.get(table_name)
        if table is None or len(table.primary_key.columns) != 1:
            continue
        pk = list(table.primary_key.columns)[0]
        try:
            keys = [uuid.UUID(i) for i in ids] if str(pk.type) == "UUID" else list(ids)
        except ValueError:
            continue
        names = [c.name for c in table.c]
        for row in (await db.execute(select(table).where(pk.in_(keys)))).all():
            r = dict(zip(names, row))
            label = audit._label(r)
            if label:
                out[(table_name, str(r[pk.name]))] = label
    return out


async def _rows(db: AsyncSession, logs: list[EntityLog]) -> list[dict]:
    wanted: dict[str, set[str]] = {}
    for l in logs:
        if l.object_type and l.object_id:
            wanted.setdefault(l.object_type, set()).add(l.object_id)
        if l.parent_type and l.parent_id:
            wanted.setdefault(l.parent_type, set()).add(l.parent_id)
    names = await _names(db, wanted)
    out = []
    for l in logs:
        if l.user is not None:
            who = l.user.full_name
        elif l.portal_user is not None:
            who = f"{l.portal_user.full_name} (portail)"
        else:
            who = SOURCES.get(l.source, "Automatique") if l.source != "ecran" else "Système"
        name = names.get((l.object_type, l.object_id)) or (l.description if l.action in ("created", "deleted") else None)
        field = l.field_name
        out.append({
            "id": str(l.id), "at": l.created_at.isoformat(), "who": who, "source": l.source, "source_label": SOURCES.get(l.source, l.source),
            "action": l.action, "action_label": ACTIONS.get(l.action, l.action),
            "object_type": l.object_type, "object_label": TABLE_LABELS.get(l.object_type, (l.object_type or "").replace("_", " ")),
            "object_id": l.object_id, "object_name": name,
            "link": ROUTES[l.object_type].format(l.object_id) if l.object_type in ROUTES and l.object_id and l.action != "deleted" else None,
            "parent_label": TABLE_LABELS.get(l.parent_type) if l.parent_type else None,
            "parent_name": names.get((l.parent_type, l.parent_id)) if l.parent_type else None,
            "parent_link": ROUTES[l.parent_type].format(l.parent_id) if l.parent_type in ROUTES and l.parent_id else None,
            "field": field, "field_label": FIELDS.get(field, (field or "").replace("_", " ")) if field else None,
            "old": l.old_value, "new": l.new_value, "description": l.description if l.action not in ("created", "deleted") else None,
        })
    return out


@router.get("")
async def list_journal(
    person: str | None = Query(default=None, description="u:<id> employé, p:<id> client du portail, auto"),
    source: str | None = None, object_type: str | None = None, object_id: str | None = None,
    action: str | None = None, q: str | None = None, date_from: date | None = None, date_to: date | None = None,
    limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user),
):
    stmt = select(EntityLog).options(selectinload(EntityLog.user), selectinload(EntityLog.portal_user))
    if object_type and object_id:
        # la fiche et ses morceaux ; une fiche compagnie/contact : aussi les lignes ecrites a la main sur elle
        conds = [and_(EntityLog.object_type == object_type, EntityLog.object_id == object_id),
                 and_(EntityLog.parent_type == object_type, EntityLog.parent_id == object_id)]
        if object_type in ("companies", "contacts"):
            try:
                conds.append(EntityLog.entity_id == uuid.UUID(object_id))
            except ValueError:
                pass
        stmt = stmt.where(or_(*conds))
    elif object_type:
        stmt = stmt.where(or_(EntityLog.object_type == object_type, EntityLog.parent_type == object_type))
    if person == "auto":
        stmt = stmt.where(EntityLog.user_id.is_(None), EntityLog.portal_user_id.is_(None))
    elif person and person.startswith("u:"):
        stmt = stmt.where(EntityLog.user_id == uuid.UUID(person[2:]))
    elif person and person.startswith("p:"):
        stmt = stmt.where(EntityLog.portal_user_id == uuid.UUID(person[2:]))
    if source:
        stmt = stmt.where(EntityLog.source == source)
    if action:
        stmt = stmt.where(EntityLog.action == action)
    tz = clock.business_tz()
    if date_from:
        stmt = stmt.where(EntityLog.created_at >= datetime.combine(date_from, time.min, tz))
    if date_to:
        stmt = stmt.where(EntityLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, tz))
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        fields = [k for k, v in FIELDS.items() if q.strip().lower() in v.lower()]
        stmt = stmt.outerjoin(User, EntityLog.user_id == User.id).where(or_(
            func.lower(EntityLog.description).like(like), func.lower(EntityLog.old_value).like(like),
            func.lower(EntityLog.new_value).like(like), func.lower(EntityLog.field_name).like(like),
            func.lower(User.full_name).like(like), EntityLog.field_name.in_(fields) if fields else false(),
        ))
    logs = (await db.execute(stmt.order_by(EntityLog.created_at.desc(), EntityLog.id).offset(offset).limit(limit + 1))).scalars().all()
    return {"rows": await _rows(db, list(logs[:limit])), "has_more": len(logs) > limit}


@router.get("/filters")
async def journal_filters(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    users = (await db.execute(select(User).order_by(User.full_name))).scalars().all()
    pids = (await db.execute(select(EntityLog.portal_user_id).where(EntityLog.portal_user_id.isnot(None)).distinct())).scalars().all()
    portal = (await db.execute(select(PortalUser).where(PortalUser.id.in_(pids)))).scalars().all() if pids else []
    types = (await db.execute(select(EntityLog.object_type).where(EntityLog.object_type.isnot(None)).distinct())).scalars().all()
    return {
        "people": [{"id": f"u:{u.id}", "label": u.full_name} for u in users]
                  + [{"id": f"p:{p.id}", "label": f"{p.full_name} (portail)"} for p in portal]
                  + [{"id": "auto", "label": "Automatique / SIPV"}],
        "types": sorted(({"id": t, "label": TABLE_LABELS.get(t, t.replace("_", " "))} for t in types), key=lambda x: x["label"]),
        "actions": [{"id": k, "label": ACTIONS[k]} for k in ("created", "field_change", "deleted", "request", "viewed")],
    }


@router.get("/options")
async def get_options(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from app.api.v1.endpoints.settings import get_setting
    return {"views_enabled": (await get_setting(db, "audit_views_enabled")) == "true", "can_change": _can_change(user)}


@router.put("/options")
async def set_options(payload: OptionsIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not _can_change(user):
        raise HTTPException(status_code=403, detail="Seul un administrateur ou un gestionnaire peut changer cette option")
    from app.api.v1.endpoints.settings import set_setting
    await set_setting(db, "audit_views_enabled", "true" if payload.views_enabled else "false")
    audit.views_changed(payload.views_enabled)
    return {"views_enabled": payload.views_enabled, "can_change": True}
