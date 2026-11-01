"""Onglets de la fiche compagnie selon ses pastilles (TASK-002.13, GO de Philippe 2026-11-01).

Chaque pastille apporte des onglets, réglés dans Administration -> Configuration -> Pastilles (statuses.company_tabs) ;
la fiche montre l'union des onglets de ses pastilles (« comme ça, plusieurs pastilles pourraient ajouter certains
onglets »). Règles de sécurité :
- Général, Contacts, Courriels et Journal sont toujours là ;
- un onglet qui contient des données reste visible, même si aucune pastille ne le demande (rien ne disparaît sans bruit
  quand on enlève une pastille) ;
- une fiche sans pastille, et la compagnie du propriétaire (TASK-002.5), montrent tous les onglets.
"""
import uuid

from sqlalchemy import exists, or_, select

ALWAYS = ["general", "contacts", "courriels", "journal"]
OPTIONAL = {"tickets": "Tickets", "conversations": "Conversations", "telephonie": "Téléphonie",
            "transactions": "Transactions", "entente": "Entente", "inventaire": "Inventaire", "photos": "Photos"}
ORDER = ["general", "tickets", "contacts", "courriels", "telephonie", "transactions", "entente", "inventaire",
         "conversations", "photos", "journal"]       # ordre des onglets de la fiche (Philippe, 2026-10-14 ; Conversations déplacé le 2026-11-01)


def clean(tabs) -> list[str]:
    """Onglets réglables seulement, dans l'ordre de la fiche."""
    wanted = set(tabs or [])
    return [t for t in ORDER if t in OPTIONAL and t in wanted]


async def has_receivables(db, company_id) -> bool:
    """Factures ou paiements reçus de cette compagnie (le côté client de Transactions)."""
    from app.models.client_payment import ClientPayment
    from app.models.invoice import Invoice
    return bool((await db.execute(select(or_(exists().where(Invoice.company_id == company_id),
                                                exists().where(ClientPayment.company_id == company_id))))).scalar())


async def has_payables(db, company_id) -> bool:
    """Factures, paiements, avoirs ou dépenses de sa fiche fournisseur (le côté fournisseur, TASK-002.13 étape 2)."""
    from app.models.purchases import Bill, Expense, RecurringBill, Vendor, VendorCredit, VendorPayment
    vid = (await db.execute(select(Vendor.id).where(Vendor.company_id == company_id))).scalar()
    if not vid:
        return False
    return bool((await db.execute(select(or_(*[exists().where(m.vendor_id == vid) for m in
                                               (Bill, Expense, RecurringBill, VendorCredit, VendorPayment)])))).scalar())


async def tabs_with_data(db, company) -> set[str]:
    """Les onglets optionnels qui ont quelque chose à montrer pour cette compagnie."""
    from app.models.barter import BarterExchange
    from app.models.company import Company
    from app.models.conversation import Conversation
    from app.models.equipment import Equipment
    from app.models.installation_photo import InstallationPhoto
    from app.models.recurring_billing import CompanyRecurringBilling
    from app.models.telephony import DID, Extension
    from app.models.ticket import Ticket
    from app.models.zeko import ZekoDrop

    cid = company.id
    checks = {
        "tickets": [exists().where(Ticket.company_id == cid)],
        "conversations": [exists().where(Conversation.ticket_id == Ticket.id, Ticket.company_id == cid)],
        "telephonie": [exists().where(DID.company_id == cid), exists().where(Extension.company_id == cid)],
        "entente": [exists().where(CompanyRecurringBilling.company_id == cid), exists().where(BarterExchange.company_id == cid)],
        "inventaire": [exists().where(Equipment.company_id == cid),
                       exists().where(or_(Company.internet_company_id == cid, Company.network_company_id == cid))],
        "photos": [exists().where(InstallationPhoto.company_id == cid), exists().where(ZekoDrop.company_id == cid)],
    }
    found = set()
    if company.sipv_enabled:
        found.add("telephonie")
    if company.internet_company_id or company.network_company_id:
        found.add("inventaire")
    if await has_receivables(db, cid) or await has_payables(db, cid):
        found.add("transactions")
    for tab, conds in checks.items():
        if tab not in found and (await db.execute(select(or_(*conds)))).scalar():
            found.add(tab)
    return found


async def visible_tabs(db, company_id: uuid.UUID) -> dict:
    """{"tabs": [...], "by_status": [...], "with_data": [...], "all": bool} pour la fiche."""
    from app.models.company import Company
    from app.models.status import EntityStatus, Status

    company = await db.get(Company, company_id)
    if not company:
        return None
    worn = (await db.execute(select(Status).join(EntityStatus, EntityStatus.status_id == Status.id)
                             .where(EntityStatus.entity_id == company_id))).scalars().all()
    with_data = await tabs_with_data(db, company)
    ledgers = await _ledgers(db, company, worn)
    if company.is_owner or not worn:
        return {"tabs": list(ORDER), "by_status": [], "with_data": clean(with_data), "all": True,
                "reason": "owner" if company.is_owner else "no_status", "ledgers": ledgers}
    by_status = set()
    for s in worn:
        by_status.update(s.company_tabs or [])
    shown = set(ALWAYS) | by_status | with_data
    return {"tabs": [t for t in ORDER if t in shown], "by_status": clean(by_status), "with_data": clean(with_data),
            "all": False, "reason": None, "ledgers": ledgers}


async def _ledgers(db, company, worn) -> list[str]:
    """Sous-onglets de Transactions (TASK-002.13 étape 2, Philippe : « pour ceux qui ne sont que clients, il n'y a que les
    comptes à recevoir, et ceux qui sont juste fournisseurs, il y aurait juste comptes à payer ») :
    - « payables » : la pastille fournisseur, ou des données sur sa fiche fournisseur ;
    - « receivables » : une autre pastille qui apporte Transactions (client, mauvais payeur...), des factures ou paiements
      reçus, ou une fiche qui montre tout (sans pastille, propriétaire) ;
    toujours au moins un des deux."""
    from app.core.vendors import supplier_status_id
    sid = await supplier_status_id(db)
    payable = any(s.id == sid for s in worn) or await has_payables(db, company.id)
    receivable = (any(s.id != sid and "transactions" in (s.company_tabs or []) for s in worn)
                  or await has_receivables(db, company.id)
                  or (not worn and not payable) or bool(company.is_owner))
    out = (["receivables"] if receivable else []) + (["payables"] if payable else [])
    return out or ["receivables"]
