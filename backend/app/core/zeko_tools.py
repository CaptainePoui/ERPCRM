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


_ID = {"client_id": {"type": "string", "description": "id du client (donné par chercher)"}}
TOOLS = [
    _fn("chercher", "Trouve des clients, contacts, factures ou paiements par nom, numéro de compte, numéro ou montant.",
        {"texte": {"type": "string"}}, ["texte"]),
    _fn("fiche_client", "Fiche d'un client : coordonnées, adresses, contacts, compagnie mère, factures impayées.", _ID, ["client_id"]),
    _fn("tickets_client", "Tickets d'un client (récents d'abord) ; texte optionnel pour chercher dans leurs messages.",
        {**_ID, "texte": {"type": "string"}}, ["client_id"]),
    _fn("lire_ticket", "Messages complets d'un ticket (id ou numéro comme #1A2B3C4D).",
        {"ticket": {"type": "string"}}, ["ticket"]),
    _fn("equipements", "Équipements d'un client (marque, modèle, IP, MAC, état, notes).", _ID, ["client_id"]),
    _fn("telephonie", "Numéros (DID) et postes téléphoniques d'un client.", _ID, ["client_id"]),
]
LABELS = {"chercher": "cherche dans ERPCRM", "fiche_client": "lit la fiche du client", "tickets_client": "lit les tickets du client",
          "lire_ticket": "lit un ticket", "equipements": "lit les équipements", "telephonie": "lit la téléphonie"}


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


async def run(name: str, args: dict, db) -> str:
    try:
        return await _run(name, args or {}, db)
    except Exception as e:
        return _out({"erreur": str(e)[:300]})


async def _run(name, args, db) -> str:
    if name == "chercher":
        from app.api.v1.endpoints.search import search
        res = await search(q=str(args.get("texte") or "").strip() or "?", db=db, _=None)
        return _out([{"type": r.type, "id": str(r.company_id or r.id) if r.type in ("invoice", "payment") else str(r.id),
                      "nom": r.label, "detail": r.sub} for r in res][:10] or "aucun résultat")

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

    cid = _uuid(args.get("client_id"))
    comp = await db.get(Company, cid) if cid else None
    if not comp:
        return _out("client introuvable : utilise d'abord chercher pour obtenir son id")

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
