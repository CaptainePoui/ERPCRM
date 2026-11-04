"""Onglets de la fiche contact selon ses spécialisations (fonctions, TASK-002.18) et ses pastilles (vendeur) — TASK-002.17,
GO de Philippe 2026-11-02 ; mêmes règles que la fiche
compagnie (core/company_tabs.py) : chaque pastille apporte des onglets (statuses.contact_tabs, Administration ->
Configuration -> Pastilles) ; la fiche montre l'union ; Général toujours là ; un onglet qui contient des données reste
visible ; un contact sans pastille montre tout.
"""
import uuid

from sqlalchemy import exists, select

ALWAYS = ["general"]
OPTIONAL = {"telephonie": "Téléphonie", "courriels": "Courriels", "provisionnement": "Provisionnement",
            "conversations": "Conversations"}
ORDER = ["general", "telephonie", "courriels", "provisionnement", "conversations"]     # ordre de ContactDetail.jsx CONTACT_TABS
# Philippe 2026-11-04 : « pourquoi Yoann a provisioning, il doit apparaître quand tu es hébergé (nouvelle pastille) » ->
# Provisionnement seulement si le contact a un poste, ou si une pastille (la sienne, ou celle d'une de ses compagnies,
# p. ex. « Hébergé ») l'apporte ; jamais par défaut.
ON_DEMAND = {"provisionnement"}


def clean(tabs) -> list[str]:
    wanted = set(tabs or [])
    return [t for t in ORDER if t in OPTIONAL and t in wanted]


async def tabs_with_data(db, contact) -> set[str]:
    """Téléphonie et Provisionnement : le contact a un poste (SIPV) ; Courriels : des courriels classés sur lui ;
    Conversations : une conversation de son ticket, ou où sa voix a été reconnue."""
    from app.models.conversation import Conversation, ConversationSegment
    from app.models.mailbox import MailMessage
    from app.models.ticket import Ticket
    found = set()
    if contact.sipv_sync:
        found.update({"telephonie", "provisionnement"})
    if (await db.execute(select(exists().where(MailMessage.contact_id == contact.id)))).scalar():
        found.add("courriels")
    if (await db.execute(select(exists().where(Conversation.ticket_id == Ticket.id, Ticket.contact_id == contact.id)))).scalar() \
            or (await db.execute(select(exists().where(ConversationSegment.contact_id == contact.id)))).scalar():
        found.add("conversations")
    return found


async def visible_tabs(db, contact_id: uuid.UUID) -> dict | None:
    from app.models.contact import Contact
    from app.models.status import EntityStatus, Status
    contact = await db.get(Contact, contact_id)
    if not contact:
        return None
    from app.models.contact_company import ContactCompany, ContactCompanyFunction
    from app.models.function import Function
    worn = (await db.execute(select(Status).join(EntityStatus, EntityStatus.status_id == Status.id)
                             .where(EntityStatus.entity_id == contact_id))).scalars().all()
    # TASK-002.18 : les onglets viennent surtout des spécialisations du contact (fonctions chez ses compagnies actives)
    specs = (await db.execute(select(Function).join(ContactCompanyFunction, ContactCompanyFunction.function_id == Function.id)
                              .join(ContactCompany, ContactCompany.id == ContactCompanyFunction.contact_company_id)
                              .where(ContactCompany.contact_id == contact_id, ContactCompany.is_active.is_not(False)))).scalars().all()
    # Philippe 2026-11-02 : « ou juste quand je vais mettre sa compagnie en client » -> une pastille de ses compagnies qui
    # apporte Téléphonie (client, mauvais payeur, prospect…) donne au contact Téléphonie et Provisionnement
    # Une pastille de compagnie peut aussi apporter des onglets à ses contacts (statuses.contact_tabs, p. ex. « Hébergé »
    # -> Provisionnement, Philippe 2026-11-04)
    co_tabs, given = set(), set()
    for tabs, ctabs in (await db.execute(select(Status.company_tabs, Status.contact_tabs).join(EntityStatus, EntityStatus.status_id == Status.id)
                                         .join(ContactCompany, ContactCompany.company_id == EntityStatus.entity_id)
                                         .where(ContactCompany.contact_id == contact_id, ContactCompany.is_active.is_not(False)))).all():
        co_tabs.update(tabs or [])
        given.update(ctabs or [])
    from_company = ({"telephonie"} if "telephonie" in co_tabs else set()) | set(clean(given))
    with_data = await tabs_with_data(db, contact) | from_company
    if not worn and not specs:
        return {"tabs": [t for t in ORDER if t not in ON_DEMAND or t in with_data], "by_status": [],
                "with_data": clean(with_data), "all": True}
    by_status = set()
    for s in list(worn) + list(specs):
        by_status.update(s.contact_tabs or [])
    shown = set(ALWAYS) | by_status | with_data
    return {"tabs": [t for t in ORDER if t in shown], "by_status": clean(by_status), "with_data": clean(with_data), "all": False}
