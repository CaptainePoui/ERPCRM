"""Classement automatique d'un courriel recu dans la bonne fiche (TASK-047.2, 2026-10-09).

Philippe : « c'est juste si ERPCRM s'est trompe, sinon c'est automatique ; en plus ca pourrait meme creer un contact
avec le courriel d'entreprise et prendre les infos de sa signature ».
1. adresse connue (contact, contact dans une compagnie, adresse d'une fiche) -> ce contact / cette compagnie ;
2. sinon, nom de domaine d'entreprise connu (@hamak.ca -> Hamak) -> la compagnie, et un contact est cree (nom de
   l'expediteur ; telephone/titre lus dans la signature par l'IA locale) ;
3. sinon -> « A classer » (gmail, hotmail... ne disent pas de quelle compagnie il s'agit : jamais devines).
"""
from __future__ import annotations

import json
import logging
import re

import httpx
from sqlalchemy import func, select

from app.core.config import settings
from app.core import zeko

log = logging.getLogger("mail_match")

# Domaines publics : une adresse @gmail.com ne dit pas de quelle compagnie il s'agit
PUBLIC_DOMAINS = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.ca", "hotmail.fr", "outlook.com", "outlook.fr", "live.com",
    "live.ca", "live.fr", "msn.com", "yahoo.com", "yahoo.ca", "yahoo.fr", "icloud.com", "me.com", "mac.com", "aol.com",
    "videotron.ca", "videotron.qc.ca", "bell.net", "sympatico.ca", "cogeco.ca", "cgocable.ca", "rogers.com",
    "telus.net", "shaw.ca", "eastlink.ca", "globetrotter.net", "derytele.com", "ebox.ca", "teksavvy.com",
    "protonmail.com", "proton.me", "gmx.com", "zoho.com", "yandex.com", "mail.com",
}


_NO_PERSON = re.compile(r"^(no-?reply|ne-?pas-?repondre|donotreply|do-not-reply|notifications?|mailer-daemon|postmaster|bounces?|"
                        r"alerts?|newsletter|infolettre|info|infos|services?|support|facturation|billing|invoices?|factures?|"
                        r"comptabilite|accounting|comptes?|admin|administration|sales|ventes?|contact|reception|office|bureau|"
                        r"commandes?|orders?|rh|hr|marketing|team|equipe)\b", re.I)


def domain_of(addr: str | None) -> str | None:
    return addr.rsplit("@", 1)[1].lower() if addr and "@" in addr else None


async def _company_of_contact(db, contact_id):
    from app.models.contact_company import ContactCompany
    rows = (await db.execute(select(ContactCompany).where(ContactCompany.contact_id == contact_id,
                                                          ContactCompany.is_active.is_(True)))).scalars().all()
    if len(rows) == 1:
        return rows[0].company_id
    primary = [r for r in rows if r.is_primary]
    return primary[0].company_id if len(primary) == 1 else None


async def by_address(db, addr: str):
    """(company_id, contact_id) d'une adresse deja connue, sinon (None, None)."""
    from app.models.communication import ChannelType, CommunicationChannel
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    from app.models.entity import Entity, EntityType
    a = addr.lower()
    cc = (await db.execute(select(ContactCompany).where(func.lower(ContactCompany.email) == a,
                                                        ContactCompany.is_active.is_(True)).limit(2))).scalars().all()
    if len(cc) == 1:
        return cc[0].company_id, cc[0].contact_id
    ids = (await db.execute(select(Contact.id).where(Contact.is_active.is_(True),
                                                     (func.lower(Contact.email) == a) | (func.lower(Contact.email_other) == a)))).scalars().all()
    ch = (await db.execute(select(CommunicationChannel.entity_id, Entity.entity_type).join(Entity, Entity.id == CommunicationChannel.entity_id)
                           .where(CommunicationChannel.channel_type == ChannelType.email, CommunicationChannel.is_active.is_(True),
                                  func.lower(func.trim(CommunicationChannel.value)) == a))).all()
    from app.core.former_infos import entity_of_email          # TASK-002.8 : ancienne adresse
    olds = await entity_of_email(db, a)
    if olds:
        kinds = dict((await db.execute(select(Entity.id, Entity.entity_type).where(Entity.id.in_(olds)))).all())
        ch = list(ch) + [(e, kinds[e]) for e in olds if e in kinds]
    ids = list(dict.fromkeys(list(ids) + [e for e, t in ch if t == EntityType.person]))
    companies = list(dict.fromkeys(e for e, t in ch if t == EntityType.company))
    if len(ids) == 1:
        return (await _company_of_contact(db, ids[0])) or (companies[0] if len(companies) == 1 else None), ids[0]
    if not ids and len(companies) == 1:
        return companies[0], None
    return None, None


async def by_domain(db, dom: str):
    """Compagnie dont une adresse connue a ce nom de domaine -- seulement si une seule compagnie l'a."""
    from app.models.communication import ChannelType, CommunicationChannel
    from app.models.company import Company
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    from app.models.entity import Entity, EntityType
    pat = f"%@{dom}"
    found = set((await db.execute(select(CommunicationChannel.entity_id).join(Entity, Entity.id == CommunicationChannel.entity_id)
                                  .join(Company, Company.id == CommunicationChannel.entity_id)
                                  .where(CommunicationChannel.channel_type == ChannelType.email, Entity.entity_type == EntityType.company,
                                         Company.is_active.is_(True), func.lower(func.trim(CommunicationChannel.value)).like(pat)))).scalars().all())
    found |= set((await db.execute(select(ContactCompany.company_id).join(Contact, Contact.id == ContactCompany.contact_id)
                                   .where(ContactCompany.is_active.is_(True),
                                          (func.lower(Contact.email).like(pat)) | (func.lower(ContactCompany.email).like(pat))))).scalars().all())
    from app.core.former_infos import entities_of_domain        # TASK-002.8 : ancien domaine (ancien nom de la compagnie)
    for e in await entities_of_domain(db, dom):
        if await db.get(Company, e):
            found.add(e)
        else:
            cid = await _company_of_contact(db, e)
            if cid:
                found.add(cid)
    return next(iter(found)) if len(found) == 1 else None


def _split_name(name: str | None, addr: str) -> tuple[str, str]:
    name = re.sub(r"[\"']", "", (name or "")).strip()
    if not name or "@" in name:
        local = addr.split("@")[0]
        parts = [p for p in re.split(r"[._-]+", local) if p and not p.isdigit()]
        name = " ".join(p.capitalize() for p in parts) or local
    if "," in name:                                  # « Tremblay, Marie »
        last, first = [x.strip() for x in name.split(",", 1)]
        return first[:100] or last[:100], last[:100] if first else ""
    parts = name.split()
    return (parts[0][:100], " ".join(parts[1:])[:100]) if len(parts) > 1 else (name[:100], "")


async def create_contact(db, company_id, addr: str, name: str | None, box_email: str, when) -> object:
    """Contact cree a partir d'un courriel recu, relie a la compagnie ; note pour qu'on sache d'ou il vient."""
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    from app.models.entity import Entity, EntityType
    first, last = _split_name(name, addr)
    entity = Entity(entity_type=EntityType.person)
    db.add(entity)
    await db.flush()
    contact = Contact(id=entity.id, first_name=first, last_name=last, email=addr,
                      notes_internal=f"Créé automatiquement à partir d'un courriel reçu dans {box_email}"
                                     f"{' le ' + when.strftime('%Y-%m-%d') if when else ''}.")
    db.add(contact)
    db.add(ContactCompany(contact_id=entity.id, company_id=company_id, is_primary=True, is_active=True))
    await db.flush()
    return contact


async def classify(db, msg, own_domains: set[str], box_email: str) -> None:
    """Classe un courriel qui vient d'arriver (jamais un courriel deja classe a la main)."""
    addr = msg.from_email
    dom = domain_of(addr)
    if not addr or not dom or dom in own_domains:
        return
    company_id, contact_id = await by_address(db, addr)
    if company_id or contact_id:
        msg.company_id, msg.contact_id, msg.classified_by = company_id, contact_id, "auto"
        return
    if dom in PUBLIC_DOMAINS:
        return
    company_id = await by_domain(db, dom)
    if not company_id:
        return
    if _NO_PERSON.search(addr.split("@")[0]):          # avis automatiques d'une compagnie : classes, aucun contact cree
        msg.company_id, msg.classified_by = company_id, "auto"
        return
    contact = await create_contact(db, company_id, addr, msg.from_name, box_email, msg.sent_at)
    msg.company_id, msg.contact_id, msg.classified_by = company_id, contact.id, "auto"
    msg.contact_created = True
    msg.signature_status = "pending" if await zeko.enabled() else None


async def read_signature(db, msg) -> None:
    """Telephone, cellulaire, poste et titre lus dans la signature par l'IA locale ; seulement les champs vides du contact
    (jamais ecraser ce qu'un humain a ecrit). Le numero doit se trouver tel quel dans le courriel."""
    from app.models.contact import Contact
    contact = await db.get(Contact, msg.contact_id) if msg.contact_id else None
    if not contact:
        msg.signature_status = "done"
        return
    text = (msg.body_text or "")[:6000]
    prompt = (
        "Voici un courriel reçu par l'entreprise Simple IP. Lis la SIGNATURE de l'expéditeur (pas celle d'un message cité "
        "plus bas, pas Simple IP) et recopie, tels qu'écrits : son prénom, son nom, son titre/fonction, son téléphone de "
        "bureau, son poste, son cellulaire. Ce qui n'y est pas = null.\n"
        "Réponds UNIQUEMENT en JSON : {\"prenom\": str|null, \"nom\": str|null, \"titre\": str|null, "
        "\"telephone\": str|null, \"poste\": str|null, \"cellulaire\": str|null}\n\n"
        f"Expéditeur : {msg.from_name or ''} <{msg.from_email}>\n\n{text}"
    )
    content = await zeko.complete([{"role": "user", "content": prompt}], purpose="signature", timeout=900)
    m = re.search(r"\{.*\}", content, re.S)
    x = json.loads(m.group(0)) if m else {}
    digits = re.sub(r"\D", "", text)

    def phone(v):
        v = (v or "").strip()
        d = re.sub(r"\D", "", v)
        return v[:50] if len(d) >= 7 and d in digits else None
    if not contact.phone and phone(x.get("telephone")):
        contact.phone = phone(x.get("telephone"))
    if not contact.mobile and phone(x.get("cellulaire")):
        contact.mobile = phone(x.get("cellulaire"))
    ext = re.sub(r"\D", "", str(x.get("poste") or ""))
    if not contact.extension and ext and ext in digits and len(ext) <= 8:
        contact.extension = ext
    # nom lu dans la signature : seulement si le contact n'a que ce qu'on a devine de l'adresse
    for key, attr in (("prenom", "first_name"), ("nom", "last_name")):
        v = (x.get(key) or "").strip()
        if v and v.lower() in text.lower() and (not getattr(contact, attr) or msg.from_name is None):
            setattr(contact, attr, v[:100])
    title = (x.get("titre") or "").strip()
    if title and title.lower() in text.lower() and "Titre :" not in (contact.notes_internal or ""):
        contact.notes_internal = f"{contact.notes_internal or ''}\nTitre : {title[:150]}".strip()
    msg.signature_status = "done"
