"""Outils de LECTURE de Zeko (TASK-006.5 etape 2, 2026-10-18) : Zeko consulte les donnees d'ERPCRM, il ne modifie
rien (les actions viendront a l'etape 6, avec permissions et confirmation). Reponses courtes : sur ce processeur,
chaque mot lu par le modele coute du temps."""
import json
import uuid

from sqlalchemy import select, or_, func, cast, Text
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.contact import Contact
from app.models.contact_company import ContactCompany, ContactCompanyFunction
from app.models.entity import Entity
from app.models.equipment import Equipment
from app.models.invoice import Invoice
from app.models.telephony import DID, Extension
from app.models.ticket import Ticket, TicketMessage, TicketTimePeriod, TicketTimeAdjustment

_MAX = 3500


def _fn(name, desc, props=None, required=None):
    return {"type": "function", "function": {"name": name, "description": desc, "parameters": {
        "type": "object", "properties": props or {}, "required": required or []}}}


# Les outils prennent des NOMS, jamais des identifiants : Zeko ne voit aucun id interne, il ne peut donc jamais en
# montrer un (Philippe, 2026-10-18 : « les ID client c'est pour ERPCRM, pas pour les techs ni les clients »).
_CLIENT = {"client": {"type": "string", "description": "nom du client (entreprise)"}}
TOOLS = [
    _fn("chercher", "Trouve des clients, contacts, factures ou paiements par nom, numéro de facture, téléphone, courriel ou montant.",
        {"texte": {"type": "string"}}, ["texte"]),
    _fn("fiche_client", "Fiche d'un client : coordonnées, adresses, contacts (postes, téléphones, courriels), compagnie mère, factures impayées.",
        _CLIENT, ["client"]),
    _fn("fiche_contact", "Fiche d'une personne : ses coordonnées et les entreprises où elle travaille.",
        {"contact": {"type": "string", "description": "prénom et nom de la personne"}}, ["contact"]),
    _fn("tickets_client", "Tickets d'un client (récents d'abord) ; texte optionnel pour chercher dans leurs messages.",
        {**_CLIENT, "texte": {"type": "string"}}, ["client"]),
    _fn("lire_ticket", "Messages complets d'un ticket, par son numéro (ex. #1A2B3C4D).",
        {"ticket": {"type": "string"}}, ["ticket"]),
    _fn("equipements", "Équipements d'un client (marque, modèle, IP, MAC, état, notes).", _CLIENT, ["client"]),
    _fn("telephonie", "Numéros de téléphone (DID) et postes d'un client.", _CLIENT, ["client"]),
]
LABELS = {"chercher": "cherche dans ERPCRM", "fiche_client": "lit la fiche du client", "fiche_contact": "lit la fiche de la personne",
          "tickets_client": "lit les tickets du client", "lire_ticket": "lit un ticket", "equipements": "lit les équipements",
          "telephonie": "lit la téléphonie"}


def _out(x) -> str:
    s = json.dumps(x, ensure_ascii=False, default=str, separators=(",", ":"))
    return s if len(s) <= _MAX else s[:_MAX] + "…(tronqué)"


def _uuid(v):
    try:
        return uuid.UUID(str(v).strip())
    except (ValueError, AttributeError):
        return None


async def _ticket_secs(db, t: Ticket) -> int:
    from app.api.v1.endpoints.tickets import _worked_seconds
    return _worked_seconds(t)


async def _companies_of_contact(db, contact_id) -> list[str]:
    rows = (await db.execute(select(Company.name).join(ContactCompany, ContactCompany.company_id == Company.id)
                             .where(ContactCompany.contact_id == contact_id))).scalars().all()
    return list(rows)


async def _resolve_company(db, name):
    """Nom -> client : nom exact (sans accents ni casse), sinon la recherche tolerante d'ERPCRM ; plusieurs = demander."""
    name = str(name or "").strip()
    if not name:
        return "précise le nom du client"
    exact = (await db.execute(select(Company).where(func.lower(func.unaccent(Company.name)) == func.lower(func.unaccent(name))))).scalars().all()
    if len(exact) == 1:
        return exact[0]
    from app.api.v1.endpoints.search import search
    res = [r for r in await search(q=name, db=db, _=None) if r.type == "company"]
    if len(res) == 1:
        return await db.get(Company, res[0].id)
    if not res:
        return f"aucun client ne correspond à « {name} »"
    return {"plusieurs_clients": [r.label for r in res]}


async def _resolve_contact(db, name):
    name = str(name or "").strip()
    if not name:
        return "précise le nom de la personne"
    full = func.lower(func.unaccent(func.concat(Contact.first_name, " ", Contact.last_name)))
    exact = (await db.execute(select(Contact).where(full == func.lower(func.unaccent(name))))).scalars().all()
    if len(exact) == 1:
        return exact[0]
    from app.api.v1.endpoints.search import search
    res = [r for r in await search(q=name, db=db, _=None) if r.type == "contact"]
    if len(res) == 1:
        return await db.get(Contact, res[0].id)
    if not res:
        return f"aucune personne ne correspond à « {name} »"
    return {"plusieurs_personnes": [f"{r.label} ({', '.join(await _companies_of_contact(db, r.id)) or 'sans entreprise'})" for r in res]}


async def run(name: str, args: dict, db) -> str:
    try:
        return await _run(name, args or {}, db)
    except Exception as e:
        return _out({"erreur": str(e)[:300]})


async def _run(name, args, db) -> str:
    if name == "chercher":
        from app.api.v1.endpoints.search import search
        res = await search(q=str(args.get("texte") or "").strip() or "?", db=db, _=None)
        out = []
        for r in res[:10]:
            item = {"type": {"company": "client", "contact": "personne", "invoice": "facture", "payment": "paiement"}.get(r.type, r.type),
                    "nom": r.label, "detail": r.sub}
            if r.type == "contact":
                item["entreprises"] = await _companies_of_contact(db, r.id)
            out.append(item)
        return _out(out or "aucun résultat")

    if name == "fiche_contact":
        c = await _resolve_contact(db, args.get("contact"))
        if not isinstance(c, Contact):
            return _out(c)
        ccs = (await db.execute(select(ContactCompany).options(selectinload(ContactCompany.company))
                                .where(ContactCompany.contact_id == c.id))).scalars().all()
        return _out({"nom": f"{c.first_name} {c.last_name}", "courriel": c.email, "tel": c.phone, "poste": c.extension,
                     "cell": c.mobile, "actif": c.is_active, "notes": (c.notes_internal or "")[:300] or None,
                     "entreprises": [{"client": x.company.name, "courriel": x.email, "principal": x.is_primary, "actif": x.is_active} for x in ccs]})

    if name == "lire_ticket":
        ref = str(args.get("ticket") or "").strip().lstrip("#").lower()
        tid = _uuid(ref)
        q = select(Ticket).options(selectinload(Ticket.company), selectinload(Ticket.messages).selectinload(TicketMessage.user),
                                   selectinload(Ticket.periods), selectinload(Ticket.adjustments))
        q = q.where(Ticket.id == tid) if tid else q.where(cast(Ticket.id, Text).ilike(f"{ref}%"))
        t = (await db.execute(q)).scalars().first()
        if not t:
            return _out("ticket introuvable")
        return _out({"numero": f"#{str(t.id)[:8].upper()}", "titre": t.title, "client": t.company.name, "statut": t.status,
                     "cree": t.created_at.date(), "demande": t.description, "temps_min": (await _ticket_secs(db, t)) // 60,
                     "messages": [{"de": m.user.full_name if m.user else ("client" if m.author_kind == "client" else "?"),
                                   "le": m.created_at.strftime("%Y-%m-%d %H:%M"), "texte": m.body[:800]} for m in t.messages[-25:]]})

    comp = await _resolve_company(db, args.get("client"))
    if not isinstance(comp, Company):
        return _out(comp)

    if name == "fiche_client":
        ent = (await db.execute(select(Entity).options(selectinload(Entity.addresses)).where(Entity.id == comp.id))).scalar_one_or_none()
        ccs = (await db.execute(select(ContactCompany).options(
            selectinload(ContactCompany.contact), selectinload(ContactCompany.functions).selectinload(ContactCompanyFunction.function))
            .where(ContactCompany.company_id == comp.id, ContactCompany.is_active == True))).scalars().all()
        unpaid = (await db.execute(select(Invoice).where(Invoice.company_id == comp.id,
                  Invoice.status.in_(("envoyee", "partiellement_payee", "en_retard"))).order_by(Invoice.issue_date))).scalars().all()
        parent = await db.get(Company, comp.parent_company_id) if comp.parent_company_id else None
        return _out({
            "nom": comp.name, "compte": comp.account_number, "actif": comp.is_active, "telephone": comp.office_phone,
            "telephonie_sipv": comp.sipv_enabled, "mere": parent.name if parent else None, "notes": (comp.notes_internal or "")[:500] or None,
            "adresses": [f"{a.street_1}{' ' + a.street_2 if a.street_2 else ''}, {a.city} {a.postal_code}" for a in (ent.addresses if ent else []) if a.is_active],
            "contacts": [{"nom": f"{c.contact.first_name} {c.contact.last_name}", "fonctions": [f.function.name for f in c.functions if f.function],
                          "courriel": c.email or c.contact.email, "tel": c.contact.phone, "poste": c.contact.extension,
                          "cell": c.contact.mobile, "principal": c.is_primary} for c in ccs],
            "factures_impayees": [{"no": i.number, "date": i.issue_date, "total": float(i.total), "statut": i.status} for i in unpaid],
        })

    if name == "tickets_client":
        q = (select(Ticket).options(selectinload(Ticket.messages), selectinload(Ticket.periods), selectinload(Ticket.adjustments))
             .where(Ticket.company_id == comp.id).order_by(Ticket.created_at.desc()))
        txt = str(args.get("texte") or "").strip()
        if txt:
            like = f"%{txt}%"
            q = q.where(or_(Ticket.title.ilike(like), Ticket.description.ilike(like),
                            Ticket.id.in_(select(TicketMessage.ticket_id).where(TicketMessage.body.ilike(like)))))
        ts = (await db.execute(q.limit(12))).scalars().all()
        return _out([{"numero": f"#{str(t.id)[:8].upper()}", "date": t.created_at.date(), "titre": t.title, "statut": t.status,
                      "temps_min": (await _ticket_secs(db, t)) // 60,
                      "dernier_message": (t.messages[-1].body[:200] if t.messages else (t.description or "")[:200])} for t in ts] or "aucun ticket")

    if name == "equipements":
        eqs = (await db.execute(select(Equipment).where(Equipment.company_id == comp.id).order_by(Equipment.category, Equipment.name))).scalars().all()
        return _out([{"nom": e.name, "type": e.category, "marque": e.brand, "modele": e.model, "ip": e.ip_address, "mac": e.mac_address,
                      "serie": e.serial_number, "etat": e.status, "notes": (e.notes or "")[:200] or None} for e in eqs] or "aucun équipement")

    if name == "telephonie":
        dids = (await db.execute(select(DID).where(DID.company_id == comp.id))).scalars().all()
        exts = (await db.execute(select(Extension).where(Extension.company_id == comp.id).order_by(Extension.extension))).scalars().all()
        return _out({"numeros": [{"no": d.number, "actif": d.is_active, "vers": f"{d.destination_type or ''} {d.destination or ''}".strip() or None} for d in dids],
                     "postes": [{"poste": x.extension, "nom": x.name, "actif": x.is_active} for x in exts]})

    return _out(f"outil inconnu : {name}")
