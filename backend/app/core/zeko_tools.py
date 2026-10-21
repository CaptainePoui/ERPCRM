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
# Statuts lisibles (jamais le code interne « en_cours » devant un technicien ou un client)
STATUS_FR = {"ouvert": "ouvert", "en_cours": "en cours", "en_attente": "en attente", "en_attente_client": "en attente d'une réponse du client",
             "facture": "facturé", "ferme": "fermé"}
INVOICE_STATUS_FR = {"envoyee": "à payer", "partiellement_payee": "partiellement payée", "en_retard": "en retard"}


def ticket_no(t) -> str:
    if t.number:
        return f"#{t.number}" if t.number[0].isdigit() else t.number
    return f"#{str(t.id)[:8].upper()}"


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
    _fn("lire_ticket", "Messages complets d'un ticket, par son numéro (ex. 11000 ou T-11001).",
        {"ticket": {"type": "string"}}, ["ticket"]),
    _fn("paiements_carte", "Reçus de paiement par carte (Elavon / Authorize.Net, lus dans les courriels) : à consulter pour tout "
        "dépôt ELAVON MRCH SVC. Filtre optionnel par montant ou par client.",
        {"montant": {"type": "number"}, "client": {"type": "string", "description": "nom du client"}}),
    _fn("chercher_courriels", "Cherche des courriels reçus ou envoyés, dans toutes les boîtes permises : par client, par texte "
        "(sujet, contenu, expéditeur), par montant (ex. 212.08, cherché aussi dans les PDF joints) et par période (un avis de "
        "paiement arrive souvent quelques jours AVANT le dépôt : la période est élargie toute seule). Donne une référence "
        "lisible pour lire_courriel.",
        {"client": {"type": "string"}, "texte": {"type": "string"}, "montant": {"type": "number"},
         "depuis": {"type": "string", "description": "AAAA-MM-JJ"}, "jusqua": {"type": "string", "description": "AAAA-MM-JJ"}}),
    _fn("lire_courriel", "Lit un courriel trouvé par chercher_courriels (sa référence « date heure expéditeur ») : texte, et "
        "texte des pièces jointes (PDF, et images lues par reconnaissance de texte).",
        {"reference": {"type": "string"}}, ["reference"]),
    _fn("transactions_banque", "Dépôts et retraits du relevé bancaire : par client, montant ou période ; dit s'ils sont "
        "associés (et à quoi) ou non classés.",
        {"client": {"type": "string"}, "montant": {"type": "number"}, "depuis": {"type": "string"}, "jusqua": {"type": "string"},
         "non_classees": {"type": "boolean"}}),
    _fn("regles_apprises", "Ce que Zéko a déjà appris (avec l'accord de l'utilisateur) : avis de paiement des clients, etc.",
        {"client": {"type": "string"}}),
    _fn("retenir", "Retient une chose apprise pour les prochaines fois (ex. « Mc Crystal envoie ses avis de paiement en PDF "
        "Relevé des dépôts directs depuis n.gendron@mc-crystal.com, avec les numéros de factures »). À appeler SEULEMENT "
        "après que l'utilisateur a répondu oui à ta question « Je retiens que… ? ».",
        {"client": {"type": "string"}, "expediteur": {"type": "string"}, "quoi": {"type": "string"},
         "genre": {"type": "string", "description": "avis_paiement ou autre"}}, ["quoi"]),
    _fn("equipements", "Équipements d'un client (marque, modèle, IP, MAC, état, notes).", _CLIENT, ["client"]),
    _fn("telephonie", "Numéros de téléphone (DID) et postes d'un client.", _CLIENT, ["client"]),
]
EXTERNAL_TOOL = _fn("demander_ia_externe", "Demande l'avis d'une IA externe plus puissante sur une question TECHNIQUE générale "
                    "(dépannage, configuration, normes) quand tes connaissances ne suffisent pas, ou si l'utilisateur le demande. "
                    "Écris la question technique seule, sans noms ni coordonnées.", {"question": {"type": "string"}}, ["question"])
LABELS = {"chercher_courriels": "cherche dans les courriels", "lire_courriel": "lit un courriel et ses pièces jointes",
          "transactions_banque": "lit le relevé bancaire", "regles_apprises": "relit ce qu'il a appris", "retenir": "retient pour la suite",
          "paiements_carte": "lit les reçus de carte dans les courriels", "demander_ia_externe": "demande à l'IA externe", "chercher": "cherche dans ERPCRM", "fiche_client": "lit la fiche du client", "fiche_contact": "lit la fiche de la personne",
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


async def run(name: str, args: dict, db, user_id=None) -> str:
    try:
        return await _run(name, args or {}, db, user_id)
    except Exception as e:
        return _out({"erreur": str(e)[:300]})


def _day(v):
    from datetime import date
    try:
        return date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _mail_ref(m) -> str:
    """Reference lisible d'un courriel (jamais un identifiant) : « 2026-10-15 18:45 n.gendron@mc-crystal.com »."""
    from app.core import clock
    when = m.sent_at.astimezone(clock.business_tz()).strftime("%Y-%m-%d %H:%M") if m.sent_at else "?"
    return f"{when} {m.from_email or ''}".strip()


def _attachment_text(name: str, ctype: str, data: bytes) -> str:
    """Texte d'une piece jointe : PDF (pdftotext ; si vide, lecture des pages en image), image (tesseract fra+eng)."""
    import subprocess, tempfile, os
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "f")
        open(path, "wb").write(data)
        try:
            if ctype == "application/pdf" or name.lower().endswith(".pdf"):
                txt = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, timeout=60).stdout
                if txt.strip():
                    return txt
                subprocess.run(["pdftoppm", "-r", "200", "-png", "-l", "3", path, os.path.join(tmp, "p")], timeout=120)
                pages = sorted(x for x in os.listdir(tmp) if x.startswith("p"))
                return "\n".join(subprocess.run(["tesseract", os.path.join(tmp, pg), "-", "-l", "fra+eng"], capture_output=True,
                                                text=True, timeout=120).stdout for pg in pages)
            if ctype.startswith("image/"):
                return subprocess.run(["tesseract", path, "-", "-l", "fra+eng"], capture_output=True, text=True, timeout=120).stdout
        except Exception as e:
            return f"(lecture impossible : {e})"
    return "(type de fichier non lu)"


async def _run(name, args, db, user_id=None) -> str:
    if name in ("chercher_courriels", "lire_courriel"):
        from sqlalchemy import and_
        from datetime import datetime, time, timezone
        from app.models.mailbox import MailMessage, Mailbox
        from app.models.user import User
        from app.api.v1.endpoints.mail import _visible
        user = await db.get(User, user_id) if user_id else None
        if not user:
            return _out("courriels non disponibles ici")
        base = select(MailMessage).join(Mailbox, Mailbox.id == MailMessage.mailbox_id).where(_visible(user))
        if name == "chercher_courriels":
            q = base
            if args.get("client"):
                comp = await _resolve_company(db, args["client"])
                if not isinstance(comp, Company):
                    return _out(comp)
                q = q.where(MailMessage.company_id == comp.id)
            if args.get("texte"):
                like = f"%{str(args['texte']).strip()}%"
                q = q.where(or_(MailMessage.subject.ilike(like), MailMessage.body_text.ilike(like), MailMessage.from_email.ilike(like),
                                MailMessage.from_name.ilike(like)))
            d1, d2 = _day(args.get("depuis")), _day(args.get("jusqua"))
            if args.get("montant") not in (None, "") and (d1 or d2):
                # un avis de paiement arrive souvent AVANT le depot (Mc Crystal : avis le 15, depot le 19) : periode elargie
                from datetime import timedelta as _td
                d1, d2 = (d1 or d2) - _td(days=10), (d2 or d1) + _td(days=3)
            if d1:
                q = q.where(MailMessage.sent_at >= datetime.combine(d1, time.min, timezone.utc))
            if d2:
                q = q.where(MailMessage.sent_at <= datetime.combine(d2, time.max, timezone.utc))
            rows = (await db.execute(q.order_by(MailMessage.sent_at.desc()).limit(60))).scalars().all()
            if args.get("montant") not in (None, ""):
                a = f"{float(args['montant']):.2f}"
                forms = {a, a.replace(".", ","), a.replace(".", " ")}
                from app.core import mail_store
                hits, where = [], {}
                for m in rows[:40]:
                    blob = f"{m.subject or ''} {m.body_text or ''}"
                    if any(f in blob for f in forms):
                        hits.append(m); where[m.id] = "dans le courriel"
                        continue
                    for at in (m.attachments or [])[:3]:          # le montant n'est souvent que dans le PDF joint
                        if not str(at.get("filename", "")).lower().endswith(".pdf"):
                            continue
                        try:
                            fname, ctype, data = mail_store.attachment(m.stored_path, at.get("i"))
                            if any(f in _attachment_text(fname, ctype or "", data) for f in forms):
                                hits.append(m); where[m.id] = f"dans la pièce jointe {fname}"
                                break
                        except Exception:
                            continue
                rows = hits
            where = locals().get("where", {})
            return _out([{"reference": _mail_ref(m), "de": m.from_name or m.from_email, "sujet": m.subject,
                          **({"montant_trouve": where[m.id]} if m.id in where else {}),
                          "sens": "reçu" if m.direction == "in" else "envoyé", "pieces_jointes": [a.get("filename") for a in (m.attachments or [])],
                          "debut": (m.body_text or "")[:160]} for m in rows[:15]] or "aucun courriel trouvé")
        ref = str(args.get("reference") or "").strip()
        parts = ref.split()
        if len(parts) < 3:
            return _out("référence incomplète : utilise celle donnée par chercher_courriels")
        from app.core import clock
        local = datetime.fromisoformat(f"{parts[0]} {parts[1]}").replace(tzinfo=clock.business_tz())
        sender = parts[2]
        cands = (await db.execute(base.where(MailMessage.from_email == sender,
                                             MailMessage.sent_at >= local.astimezone(timezone.utc).replace(second=0),
                                             MailMessage.sent_at < local.astimezone(timezone.utc).replace(second=0) + __import__("datetime").timedelta(minutes=1))
                                  )).scalars().all()
        if not cands:
            return _out("courriel introuvable avec cette référence")
        m = cands[0]
        from pathlib import Path
        from app.core import mail_store
        pieces = []
        for a in (m.attachments or [])[:5]:
            try:
                fname, ctype, data = mail_store.attachment(m.stored_path, a.get("i"))
                pieces.append({"nom": fname, "texte": _attachment_text(fname, ctype or "", data)[:3000]})
            except Exception as e:
                pieces.append({"nom": a.get("filename"), "texte": f"(lecture impossible : {e})"})
        out = {"reference": _mail_ref(m), "de": f"{m.from_name or ''} <{m.from_email}>", "sujet": m.subject,
               "texte": (m.body_text or "")[:2500], "pieces_jointes": pieces}
        if m.company_id and m.direction == "in":
            from app.models.zeko import ZekoRule
            known = (await db.execute(select(ZekoRule.id).where(ZekoRule.sender_email == (m.from_email or "").lower()))).first()
            if not known:
                comp = await db.get(Company, m.company_id)
                out["a_proposer"] = (f"Si ce courriel t'a servi (ex. avis de paiement), termine ta réponse en demandant : « Je retiens que "
                                     f"{comp.name} envoie ce genre d'avis depuis {m.from_email} ({m.subject or 'sans sujet'}"
                                     + (f", pièce jointe {pieces[0]['nom']}" if pieces else "") + ") ? » — n'appelle retenir qu'après un oui.")
        return _out(out)

    if name == "transactions_banque":
        from datetime import timedelta
        from app.models.bank_account import BankTransaction
        q = select(BankTransaction).order_by(BankTransaction.posted_date.desc())
        if args.get("client"):
            comp = await _resolve_company(db, args["client"])
            if not isinstance(comp, Company):
                return _out(comp)
            q = q.where(BankTransaction.company_id == comp.id)
        if args.get("montant") not in (None, ""):
            v = round(float(args["montant"]), 2)
            q = q.where(or_(BankTransaction.amount == v, BankTransaction.amount == -v))
        d1, d2 = _day(args.get("depuis")), _day(args.get("jusqua"))
        if d1:
            q = q.where(BankTransaction.posted_date >= d1)
        if d2:
            q = q.where(BankTransaction.posted_date <= d2)
        if args.get("non_classees"):
            q = q.where(BankTransaction.status == "unclassified")
        rows = (await db.execute(q.limit(25))).scalars().all()
        from app.api.v1.endpoints.bank import _tx_out_bulk
        outs = await _tx_out_bulk(rows, db)
        etat = {"matched": "associée", "unclassified": "non classée", "excluded": "exclue"}
        return _out([{"date": o.posted_date, "montant": o.amount, "libelle": o.description, "beneficiaire": o.payee,
                      "etat": etat.get(o.status, o.status), "client": o.company_name, "fournisseur": o.vendor_name,
                      "factures": o.invoice_numbers or None, "explication": o.withdrawal_label} for o in outs] or "aucune transaction")

    if name in ("regles_apprises", "retenir"):
        from app.models.zeko import ZekoRule
        comp = None
        if args.get("client"):
            comp = await _resolve_company(db, args["client"])
            if not isinstance(comp, Company):
                return _out(comp)
        if name == "regles_apprises":
            q = select(ZekoRule).where(ZekoRule.is_active.is_(True))
            if comp:
                q = q.where(ZekoRule.company_id == comp.id)
            rules = (await db.execute(q.order_by(ZekoRule.created_at.desc()).limit(30))).scalars().all()
            ids = {r.company_id for r in rules if r.company_id}
            names = dict((await db.execute(select(Company.id, Company.name).where(Company.id.in_(ids)))).all()) if ids else {}
            return _out([{"client": names.get(r.company_id), "expediteur": r.sender_email, "genre": r.kind, "appris": r.description,
                          "le": r.created_at.date()} for r in rules] or "rien d'appris encore")
        quoi = str(args.get("quoi") or "").strip()
        if not quoi:
            return _out("rien à retenir")
        genre = str(args.get("genre") or "autre")
        db.add(ZekoRule(kind=genre if genre in ("avis_paiement", "autre") else "autre", company_id=comp.id if comp else None,
                        sender_email=(str(args.get("expediteur") or "").strip().lower() or None), description=quoi[:2000], created_by=user_id))
        await db.commit()
        return _out("retenu (visible dans Administration › Intégrations › Zéko › Ce que Zéko a appris)")

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
        ref = str(args.get("ticket") or "").strip().lstrip("#").upper()
        q = select(Ticket).options(selectinload(Ticket.company), selectinload(Ticket.messages).selectinload(TicketMessage.user),
                                   selectinload(Ticket.periods), selectinload(Ticket.adjustments))
        found = (await db.execute(q.where(func.upper(Ticket.number) == ref))).scalars().first()
        q = q.where(Ticket.id == found.id) if found else q.where(cast(Ticket.id, Text).ilike(f"{ref.lower()}%"))
        t = (await db.execute(q)).scalars().first()
        if not t:
            return _out("ticket introuvable")
        return _out({"numero": ticket_no(t), "titre": t.title, "client": t.company.name, "statut": STATUS_FR.get(t.status, t.status),
                     "cree": t.created_at.date(), "demande": t.description, "temps_min": (await _ticket_secs(db, t)) // 60,
                     "messages": [{"de": m.user.full_name if m.user else {"client": "client", "zeko": "Zéko"}.get(m.author_kind, "?"),
                                   "le": m.created_at.strftime("%Y-%m-%d %H:%M"), "texte": m.body[:800]} for m in t.messages[-25:]]})

    if name == "paiements_carte":
        from app.models.bank_account import CardReceipt, BankTransaction
        q = select(CardReceipt).order_by(CardReceipt.paid_at.desc())
        if args.get("montant") not in (None, ""):
            q = q.where(CardReceipt.amount == round(float(args["montant"]), 2))
        if args.get("client"):
            q = q.where(CardReceipt.company_name.ilike(f"%{str(args['client']).strip()}%"))
        rows = (await db.execute(q.limit(20))).scalars().all()
        etat = {"matched": "dépôt associé par Zéko", "linked": "dépôt déjà associé à cette facture", "a_verifier": "à vérifier",
                "parsed": "en attente du dépôt", "failed": "refusé ou illisible"}
        from app.models.invoice import Invoice
        from app.models.client_payment import ClientPayment, PaymentAllocation
        out = []
        for r in rows:
            tx = await db.get(BankTransaction, r.bank_transaction_id) if r.bank_transaction_id else None
            item = {"date": r.paid_at, "client": r.company_name, "facture": r.invoice_number, "montant_du_recu": float(r.amount or 0),
                    "carte": r.card, "etat": etat.get(r.status, r.status), "raison": r.note,
                    "depot": f"{tx.posted_date} {float(tx.amount):.2f} $" if tx else None}
            inv = await db.get(Invoice, r.invoice_id) if r.invoice_id else None
            if inv:
                # Les chiffres de la facture, pour que Zeko ne conclue jamais plus que ce qu'ils disent (2026-10-21 :
                # « ce paiement a réglé le solde » alors qu'un recu de 2,23 $ ne peut pas regler une facture de 55,01 $)
                pays = (await db.execute(select(ClientPayment, PaymentAllocation.amount_allocated).join(
                    PaymentAllocation, PaymentAllocation.payment_id == ClientPayment.id).where(PaymentAllocation.invoice_id == inv.id))).all()
                deposited = set((await db.execute(select(BankTransaction.client_payment_id).where(
                    BankTransaction.client_payment_id.in_([p.id for p, _ in pays] or [None])))).scalars().all())
                total, paid = float(inv.total), sum(float(a) for _, a in pays)
                no_bank = sum(float(a) for p, a in pays if p.id not in deposited and not p.lost_invoice)
                item["facture_total"], item["deja_paye_sur_la_facture"], item["reste_a_payer"] = total, round(paid, 2), round(total - paid, 2)
                if no_bank:
                    item["paye_sans_depot_bancaire"] = round(no_bank, 2)
                if r.status == "matched" or r.status == "linked":
                    item["constat"] = f"Ce reçu de {r.amount:.2f} $ est l'argent reçu pour cette facture de {total:.2f} $."
                elif float(r.amount or 0) < total:
                    item["constat"] = (f"Ce reçu ne paie que {r.amount:.2f} $ d'une facture de {total:.2f} $. "
                                       + (f"La facture est déjà marquée payée ({paid:.2f} $), dont {no_bank:.2f} $ sans aucun dépôt à la banque : "
                                          f"écart non expliqué, à vérifier." if paid >= total and no_bank else
                                          f"Il reste {total - paid:.2f} $ à payer."))
                else:
                    item["constat"] = f"Reçu de {r.amount:.2f} $ sur une facture de {total:.2f} $ : {etat.get(r.status, r.status)}."
            out.append(item)
        return _out(out or "aucun reçu de carte correspondant")

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
            "factures_impayees": [{"no": i.number, "date": i.issue_date, "total": float(i.total), "statut": INVOICE_STATUS_FR.get(i.status, i.status)} for i in unpaid],
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
        return _out([{"numero": ticket_no(t), "date": t.created_at.date(), "titre": t.title, "statut": STATUS_FR.get(t.status, t.status),
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
