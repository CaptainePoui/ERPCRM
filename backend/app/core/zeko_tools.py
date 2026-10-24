"""Outils de Zeko (TASK-006.5 etape 2, 2026-10-18) : Zeko consulte les donnees d'ERPCRM. Il ne modifie aucune donnee
d'affaires ; seuls ce qu'il a appris, les regles d'association de la banque (TASK-006.6, 2026-10-22) et le changement de
nom d'un client / les anciennes coordonnees (TASK-002.8, 2026-10-23) se changent, apres un « oui » et pour un
administrateur ou un gestionnaire. Depuis TASK-006.7 etape 2 (2026-10-24), Zeko fait aussi le travail demande, apres un
oui par tache : agenda (RDV, appel, perso) et nouveau poste / reglages d'un poste. Reponses courtes : sur ce processeur,
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
    _fn("conversations", "Conversations enregistrées avec les clients (transcription : qui a dit quoi, avec la date et le ticket). "
        "Par client, par personne et/ou texte cherché dans ce qui a été dit (ex. « ce que Jean-François a dit sur le portier »).",
        {**_CLIENT, "personne": {"type": "string", "description": "prénom et nom de la personne"}, "texte": {"type": "string"}}),
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
    _fn("oublier", "Fait oublier à Zéko une chose apprise (texte qui la décrit, ou le client). À appeler SEULEMENT après que "
        "l'utilisateur a répondu oui à ta question « J'oublie que… ? ».",
        {"quoi": {"type": "string", "description": "mots de ce qui a été appris"}, "client": {"type": "string"}}),
    _fn("regles_banque", "Règles d'association de la banque : quel bénéficiaire du relevé est reconnu comme quel client (dépôts) "
        "ou quel fournisseur (retraits), et combien de lignes elles touchent. Filtre optionnel par bénéficiaire ou par client.",
        {"beneficiaire": {"type": "string"}, "client": {"type": "string"}}),
    _fn("changer_regle_banque", "Change une règle d'association de la banque : « retirer_client » (le bénéficiaire n'est plus "
        "reconnu comme ce client ; le fournisseur des retraits reste), « supprimer » (toute la règle) ou « associer_client » "
        "(ce bénéficiaire = ce client). Ne touche aucune transaction déjà associée. À appeler SEULEMENT après que "
        "l'utilisateur a répondu oui à ta question « Je … ? » qui décrit le changement exact.",
        {"beneficiaire": {"type": "string"}, "action": {"type": "string", "enum": ["retirer_client", "supprimer", "associer_client"]},
         "client": {"type": "string", "description": "pour associer_client"}}, ["beneficiaire", "action"]),
    _fn("changer_nom_client", "Changement de nom (ou achat) d'un client : la fiche prend le nouveau nom et garde l'ancien, avec "
        "ses dates, pour le retrouver encore (recherche, courriels). Ex. un courriel « Strong-MDI a changé de nom pour MDI "
        "innovations Inc. ». À appeler SEULEMENT après que l'utilisateur a répondu oui à ta question « Je renomme… ? ».",
        {"client": {"type": "string", "description": "nom actuel dans ERPCRM"}, "nouveau_nom": {"type": "string"},
         "ancien_nom": {"type": "string", "description": "ancien nom à garder s'il diffère du nom actuel dans ERPCRM (ex. nom légal)"},
         "ancien_nom_jusqua": {"type": "string", "description": "AAAA-MM-JJ : fin de l'ancien nom (date du courriel si inconnue)"},
         "ancien_nom_depuis": {"type": "string", "description": "AAAA-MM-JJ, optionnel"},
         "note": {"type": "string", "description": "d'où vient l'info (ex. courriel de Jean-François Gagnon du 2026-10-23)"}},
        ["client", "nouveau_nom"]),
    _fn("ajouter_ancienne_info", "Garde une ancienne coordonnée d'un client ou d'une personne (ancien nom, ancien courriel, ancien "
        "téléphone) avec ses dates, pour continuer à reconnaître ses courriels et la retrouver. À appeler SEULEMENT après que "
        "l'utilisateur a répondu oui à ta question « Je garde… comme ancien… ? ».",
        {"client": {"type": "string"}, "contact": {"type": "string", "description": "prénom et nom, si c'est une personne"},
         "genre": {"type": "string", "enum": ["nom", "courriel", "telephone"]}, "valeur": {"type": "string"},
         "jusqua": {"type": "string", "description": "AAAA-MM-JJ"}, "depuis": {"type": "string", "description": "AAAA-MM-JJ"},
         "note": {"type": "string"}}, ["genre", "valeur"]),
    _fn("equipements", "Équipements d'un client (marque, modèle, IP, MAC, état, notes).", _CLIENT, ["client"]),
    _fn("telephonie", "Numéros de téléphone (DID) et postes d'un client.", _CLIENT, ["client"]),
    # TASK-006.7 etape 2 (2026-10-24) : Zeko fait le travail, un oui par tache
    _fn("agenda", "Rendez-vous, appels et événements de l'agenda entre deux dates (tous les calendriers).",
        {"depuis": {"type": "string", "description": "AAAA-MM-JJ"}, "jusqua": {"type": "string", "description": "AAAA-MM-JJ, inclus"}},
        ["depuis"]),
    _fn("mettre_agenda", "Met à l'agenda un RDV ou un appel avec un client (crée aussi son ticket) ou un événement perso "
        "(sans client). À appeler SEULEMENT après un oui à ta question « Je mets… à l'agenda ? ».",
        {"genre": {"type": "string", "enum": ["rdv", "appel", "perso"]}, "titre": {"type": "string"},
         "date": {"type": "string", "description": "la date comme elle a été dite, avec le jour et le mois en mots (ex. « lundi 2 novembre »)"},
         "heure": {"type": "string", "description": "HH:MM (24 h)"},
         "duree_minutes": {"type": "integer", "description": "par défaut : RDV 60, appel 30, perso 60"},
         "client": {"type": "string"}, "personne": {"type": "string", "description": "prénom et nom"},
         "lieu": {"type": "string"}, "description": {"type": "string"}}, ["genre", "titre", "date", "heure"]),
    _fn("creer_poste", "Nouveau poste téléphonique pour une personne d'un client : crée la personne si elle n'existe pas "
        "encore dans ce client, puis son poste (numéro suivant si non précisé) avec ses réglages. Renvois possibles vers un "
        "poste, la boîte vocale ou un groupe d'appel. IMPOSSIBLE pour l'instant : un renvoi vers un cellulaire ou un numéro "
        "externe (dis-le dans ta question). À appeler SEULEMENT après un oui à ta question « Je crée… ? ». Ensuite, dis "
        "seulement ce que le résultat dit fait et pas fait.",
        {**_CLIENT, "prenom": {"type": "string"}, "nom": {"type": "string"}, "numero": {"type": "string", "description": "numéro du poste, optionnel"},
         "courriel": {"type": "string", "description": "seulement s'il est donné"},
         "cellulaire": {"type": "string", "description": "numéro, seulement s'il est donné"}, "boite_vocale": {"type": "boolean"},
         "langue": {"type": "string", "enum": ["fr", "en"], "description": "langue d'affichage du téléphone : fr ou en"},
         "renvois": {"type": "array", "description": "renvois du poste", "items": {"type": "object", "properties": {
             "quand": {"type": "string", "enum": ["toujours", "occupe", "sans_reponse", "non_connecte"]},
             "vers": {"type": "string", "enum": ["poste", "boite_vocale", "groupe_appel", "numero_externe"]},
             "destination": {"type": "string", "description": "numéro du poste, du groupe ou du téléphone"},
             "delai_secondes": {"type": "integer", "description": "sans_reponse seulement"}}}}},
        ["client", "prenom", "nom"]),
    _fn("regler_poste", "Change les réglages du poste d'une personne : boîte vocale, langue du téléphone, renvois (mêmes "
        "règles que creer_poste). À appeler SEULEMENT après un oui à ta question « Je règle… ? ».",
        {"personne": {"type": "string", "description": "prénom et nom"}, "boite_vocale": {"type": "boolean"},
         "langue": {"type": "string", "enum": ["fr", "en"]},
         "renvois": {"type": "array", "items": {"type": "object", "properties": {
             "quand": {"type": "string", "enum": ["toujours", "occupe", "sans_reponse", "non_connecte"]},
             "vers": {"type": "string", "enum": ["poste", "boite_vocale", "groupe_appel", "numero_externe", "aucun"]},
             "destination": {"type": "string"}, "delai_secondes": {"type": "integer"}}}}},
        ["personne"]),
    _fn("ouvrir_page", "Ouvre à l'écran, dans la fenêtre ERPCRM de l'utilisateur, la page d'un client, d'une personne, d'un "
        "ticket ou d'une facture : à faire quand la demande porte sur un dossier précis, pour qu'il le voie.",
        {"genre": {"type": "string", "enum": ["client", "personne", "ticket", "facture"]},
         "nom": {"type": "string", "description": "nom du client ou de la personne, numéro du ticket ou de la facture"}}, ["genre", "nom"]),
]
EXTERNAL_TOOL = _fn("demander_ia_externe", "Demande l'avis d'une IA externe plus puissante sur une question TECHNIQUE générale "
                    "(dépannage, configuration, normes) quand tes connaissances ne suffisent pas, ou si l'utilisateur le demande. "
                    "Écris la question technique seule, sans noms ni coordonnées.", {"question": {"type": "string"}}, ["question"])
LABELS = {"ouvrir_page": "ouvre la page", "agenda": "lit l'agenda", "mettre_agenda": "met à l'agenda",
          "creer_poste": "crée le poste", "regler_poste": "règle le poste", "chercher_courriels": "cherche dans les courriels", "lire_courriel": "lit un courriel et ses pièces jointes",
          "transactions_banque": "lit le relevé bancaire", "regles_apprises": "relit ce qu'il a appris", "retenir": "retient pour la suite", "oublier": "oublie ce qui était appris",
          "regles_banque": "lit les règles de la banque", "changer_regle_banque": "change une règle de la banque",
          "paiements_carte": "lit les reçus de carte dans les courriels", "demander_ia_externe": "demande à l'IA externe", "chercher": "cherche dans ERPCRM", "fiche_client": "lit la fiche du client", "fiche_contact": "lit la fiche de la personne",
          "tickets_client": "lit les tickets du client", "lire_ticket": "lit un ticket", "conversations": "relit les conversations enregistrées", "equipements": "lit les équipements",
          "telephonie": "lit la téléphonie", "changer_nom_client": "change le nom d'un client",
          "ajouter_ancienne_info": "garde une ancienne coordonnée"}


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


async def _former(db, entity_id) -> list:
    from app.core import former_infos as fi
    from app.models.former_info import FormerInfo
    rows = (await db.execute(select(FormerInfo).where(FormerInfo.entity_id == entity_id))).scalars().all()
    return [f"ancien {fi.KIND_FR[f.kind]} : {f.value} {fi.period(f)}".strip() for f in rows]


async def _can_change(db, user_id) -> bool:
    """Changer ce que Zeko sait ou une regle de la banque : administrateur ou gestionnaire seulement."""
    from app.models.user import User, UserRole
    u = await db.get(User, user_id) if user_id else None
    return bool(u and u.role in (UserRole.admin, UserRole.manager))


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
        return _out("retenu (visible dans Administration › Zéko › Ce que Zéko a appris)")

    if name == "oublier":
        from app.models.zeko import ZekoRule
        if not await _can_change(db, user_id):
            return _out("refusé : seuls un administrateur ou un gestionnaire peuvent faire oublier quelque chose à Zéko")
        q = select(ZekoRule)
        if args.get("client"):
            comp = await _resolve_company(db, args["client"])
            if not isinstance(comp, Company):
                return _out(comp)
            q = q.where(ZekoRule.company_id == comp.id)
        quoi = str(args.get("quoi") or "").strip()
        rules = (await db.execute(q)).scalars().all()
        if quoi:
            mots = [m for m in quoi.lower().split() if len(m) > 2]
            rules = [r for r in rules if all(m in r.description.lower() for m in mots)] or \
                    [r for r in rules if quoi.lower() in r.description.lower()]
        if len(rules) != 1:
            return _out({"constat": "aucune chose apprise ne correspond" if not rules else "plusieurs correspondent : précise",
                         "candidats": [r.description[:160] for r in rules[:8]]})
        txt = rules[0].description
        await db.delete(rules[0])
        await db.commit()
        return _out(f"oublié : {txt[:200]}")

    if name in ("regles_banque", "changer_regle_banque"):
        from app.models.bank_account import BankPayeeRule
        from app.core import bank_matching as bm
        from app.api.v1.endpoints import bank
        rules = (await db.execute(select(BankPayeeRule).order_by(BankPayeeRule.payee_label))).scalars().all()
        ids = {r.company_id for r in rules if r.company_id}
        names = dict((await db.execute(select(Company.id, Company.name).where(Company.id.in_(ids)))).all()) if ids else {}
        from app.models.purchases import Vendor
        vids = {r.vendor_id for r in rules if r.vendor_id}
        vnames = dict((await db.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_(vids)))).all()) if vids else {}
        ben = str(args.get("beneficiaire") or "").strip()
        if name == "regles_banque":
            if ben:
                rules = [r for r in rules if bm.payee_key(ben) in r.payee_key or ben.lower() in r.payee_label.lower()]
            if args.get("client"):
                comp = await _resolve_company(db, args["client"])
                if not isinstance(comp, Company):
                    return _out(comp)
                rules = [r for r in rules if r.company_id == comp.id]
            return _out([{"beneficiaire": r.payee_label, "client": names.get(r.company_id), "fournisseur": vnames.get(r.vendor_id),
                          "depuis": r.created_at.date()} for r in rules[:40]] or "aucune règle")
        if not await _can_change(db, user_id):
            return _out("refusé : seuls un administrateur ou un gestionnaire peuvent changer une règle de la banque")
        action = str(args.get("action") or "")
        key = bm.payee_key(ben)
        match = [r for r in rules if r.payee_key == key] or [r for r in rules if key and key in r.payee_key]
        if action == "associer_client":
            comp = await _resolve_company(db, args.get("client"))
            if not isinstance(comp, Company):
                return _out(comp)
            if len(match) > 1:
                return _out({"constat": "plusieurs bénéficiaires correspondent : précise", "candidats": [r.payee_label for r in match]})
            label = match[0].payee_label if match else ben
            if not key:
                return _out("précise le bénéficiaire tel qu'il apparaît sur le relevé")
            await bank._remember(db, label, comp.id)
            await db.commit()
            return _out(f"règle : « {label} » = {comp.name} (les dépôts non classés de ce bénéficiaire sont maintenant reconnus)")
        if len(match) != 1:
            return _out({"constat": "aucune règle pour ce bénéficiaire" if not match else "plusieurs règles correspondent : précise",
                         "candidats": [r.payee_label for r in match]})
        r = match[0]
        if action == "retirer_client":
            if not r.company_id:
                return _out(f"la règle « {r.payee_label} » n'a déjà aucun client")
            who = names.get(r.company_id)
            await bank.rule_forget_client(db, r)
            await db.commit()
            return _out(f"« {r.payee_label} » n'est plus reconnu comme {who}" + (" (le fournisseur des retraits reste)" if r.vendor_id else ""))
        if action == "supprimer":
            label = r.payee_label
            await bank.rule_delete(db, r)
            await db.commit()
            return _out(f"règle « {label} » supprimée (les associations déjà faites restent)")
        return _out("action inconnue : retirer_client, supprimer ou associer_client")

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

    if name in ("changer_nom_client", "ajouter_ancienne_info"):
        from app.core import former_infos as fi
        if not await _can_change(db, user_id):
            return _out("refusé : seuls un administrateur ou un gestionnaire peuvent changer le nom d'un client ou ses anciennes coordonnées")
        note = str(args.get("note") or "").strip() or None
        if name == "changer_nom_client":
            comp = await _resolve_company(db, args.get("client"))
            if not isinstance(comp, Company):
                return _out(comp)
            old_label = str(args.get("ancien_nom") or "").strip()
            current = comp.name
            await fi.rename_company(db, comp, str(args.get("nouveau_nom") or ""), _day(args.get("ancien_nom_jusqua")),
                                    _day(args.get("ancien_nom_depuis")), note, user_id, source="automatique")
            if old_label and old_label.lower() != current.lower():
                await fi.add(db, comp.id, "name", old_label, _day(args.get("ancien_nom_depuis")), _day(args.get("ancien_nom_jusqua")), note, user_id)
            await db.commit()
            return _out(f"renommé : « {current} » → « {comp.name} » (ancien nom gardé{', ' + old_label if old_label else ''})")
        kind = {"nom": "name", "courriel": "email", "telephone": "phone"}.get(str(args.get("genre") or ""))
        if not kind:
            return _out("précise le genre : nom, courriel ou telephone")
        target = await (_resolve_contact(db, args["contact"]) if args.get("contact") else _resolve_company(db, args.get("client")))
        if not isinstance(target, (Company, Contact)):
            return _out(target)
        f = await fi.add(db, target.id, kind, str(args.get("valeur") or ""), _day(args.get("depuis")), _day(args.get("jusqua")), note, user_id)
        await db.commit()
        who = target.name if isinstance(target, Company) else f"{target.first_name} {target.last_name}"
        return _out(f"gardé pour {who} : ancien {fi.KIND_FR[kind]} {f.value} {fi.period(f)}".strip())

    if name == "fiche_contact":
        c = await _resolve_contact(db, args.get("contact"))
        if not isinstance(c, Contact):
            return _out(c)
        ccs = (await db.execute(select(ContactCompany).options(selectinload(ContactCompany.company))
                                .where(ContactCompany.contact_id == c.id))).scalars().all()
        return _out({"nom": f"{c.first_name} {c.last_name}", "courriel": c.email, "tel": c.phone, "poste": c.extension,
                     "cell": c.mobile, "actif": c.is_active, "notes": (c.notes_internal or "")[:300] or None,
                     "entreprises": [{"client": x.company.name, "courriel": x.email, "principal": x.is_primary, "actif": x.is_active} for x in ccs],
                     "anciennes_coordonnees": await _former(db, c.id)})

    if name == "conversations":   # TASK-055 etape 3
        from app.models.conversation import Conversation, ConversationSegment
        q = (select(Conversation).options(selectinload(Conversation.ticket).selectinload(Ticket.company),
                                          selectinload(Conversation.segments))
             .join(Ticket, Ticket.id == Conversation.ticket_id).where(Conversation.status == "done")
             .order_by(Conversation.started_at.desc()))
        if args.get("client"):
            co = await _resolve_company(db, args["client"])
            if not isinstance(co, Company):
                return _out(co)
            q = q.where(Ticket.company_id == co.id)
        who = None
        if args.get("personne"):
            who = await _resolve_contact(db, args["personne"])
            if not isinstance(who, Contact):
                return _out(who)
            q = q.where(Conversation.id.in_(select(ConversationSegment.conversation_id).where(ConversationSegment.contact_id == who.id))
                        | (Ticket.contact_id == who.id))
        texte = str(args.get("texte") or "").strip()
        if texte:
            q = q.where(func.unaccent(func.lower(Conversation.text)).ilike(func.unaccent(func.lower(f"%{texte}%"))))
        rows = (await db.execute(q.limit(5))).scalars().all()
        if not rows:
            return _out("aucune conversation enregistrée ne correspond")
        return _out([{"le": c.started_at.strftime("%Y-%m-%d %H:%M"), "ticket": ticket_no(c.ticket), "client": c.ticket.company.name,
                      "duree_min": round((c.duration or 0) / 60, 1),
                      "transcription": [f"{x.speaker} : {x.text}" for x in c.segments][:200]} for c in rows])

    if name in ("agenda", "mettre_agenda", "creer_poste", "regler_poste"):
        res = await (_agenda if name in ("agenda", "mettre_agenda") else _poste)(name, args, db, user_id)
        if name != "agenda" and not (isinstance(res, dict) and res.get("fait")):
            res = f"{ECHEC}{res}"          # l'ecran le montre aussi (✗), meme si Zeko le resume mal
        return _out(res)
    if name == "ouvrir_page":           # TASK-006.7 : le chemin n'est lu que par l'ecran, Zeko ne le montre pas
        genre, nom = args.get("genre"), str(args.get("nom") or "").strip()
        if genre == "client":
            c = await _resolve_company(db, nom)
            return _out({"ouvert": c.name, "chemin": f"/companies/{c.id}"} if isinstance(c, Company) else c)
        if genre == "personne":
            c = await _resolve_contact(db, nom)
            return _out({"ouvert": f"{c.first_name} {c.last_name}".strip(), "chemin": f"/contacts/{c.id}"} if isinstance(c, Contact) else c)
        if genre == "ticket":
            t = (await db.execute(select(Ticket).where(func.upper(Ticket.number) == nom.lstrip("#").upper()))).scalars().first()
            return _out({"ouvert": f"ticket {ticket_no(t)}", "chemin": f"/tickets/{t.id}"} if t else "ticket introuvable")
        if genre == "facture":
            inv = (await db.execute(select(Invoice).where(func.upper(Invoice.number) == nom.lstrip("#").upper()))).scalars().first()
            return _out({"ouvert": f"facture {inv.number}", "chemin": f"/invoices/{inv.id}"} if inv else "facture introuvable")
        return _out("genre inconnu : client, personne, ticket ou facture")
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
            "anciens_noms_et_coordonnees": await _former(db, comp.id),
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


# --- TASK-006.7 etape 2 (2026-10-24) : Zeko fait le travail (agenda, poste), apres un oui, comme dans l'ecran ---

async def _user(db, user_id):
    from app.models.user import User
    return await db.get(User, user_id) if user_id else None


def _http_detail(e) -> str:
    return str(getattr(e, "detail", None) or e)[:300]


_JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


_MOIS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"]


def _date_dite(v, today):
    """Date comme on la dit (« lundi 2 novembre », « 2 nov. 2026 ») ou AAAA-MM-JJ : lue ici, pas par le modele (il se
    trompait de mois). Annee absente = la prochaine fois que cette date arrive. Jour de semaine dit et faux = refus."""
    import re, unicodedata
    from datetime import date, timedelta
    txt = "".join(ch for ch in unicodedata.normalize("NFD", str(v or "").lower()) if unicodedata.category(ch) != "Mn")
    d = _day(txt.strip())
    dit = next((i for i, j in enumerate(_JOURS_FR) if j in txt), None)
    if not d:
        rel = next((n for w, n in (("apres-demain", 2), ("apres demain", 2), ("demain", 1), ("aujourd", 0)) if w in txt), None)
        if rel is not None:
            return today + timedelta(days=rel)
    if not d and dit is not None and not re.search(r"\d", txt):    # « lundi », « lundi prochain » : le prochain lundi
        return today + timedelta(days=(dit - today.weekday() - 1) % 7 + 1)
    if not d:
        m = re.search(r"(\d{1,2})(?:er)?\s+([a-z]+)\.?(?:\s+(\d{4}))?", txt)
        mois = next((i + 1 for i, n in enumerate(_MOIS) if m and n.startswith(m.group(2)[:3])), None)
        if not m or not mois:
            return "précise la date (ex. « lundi 2 novembre » ou 2026-11-02)"
        try:
            y = int(m.group(3)) if m.group(3) else today.year
            d = date(y, mois, int(m.group(1)))
            if not m.group(3) and d < today:
                d = date(y + 1, mois, int(m.group(1)))
        except ValueError:
            return "cette date n'existe pas"
    if dit is not None and dit != d.weekday():
        return f"le {d.day} {_MOIS[d.month - 1]} {d.year} est un {_JOURS_FR[d.weekday()]}, pas un {_JOURS_FR[dit]} : vérifie la date"
    return d


async def _agenda(name, args, db, user_id):
    from datetime import datetime, time, timedelta
    from fastapi import HTTPException
    from app.core import clock
    tz = clock.business_tz()
    if name == "agenda":
        from app.core.google_calendar import list_events
        d1 = _day(args.get("depuis")) or clock.today()
        d2 = _day(args.get("jusqua")) or d1
        evs = await list_events(db, datetime.combine(d1, time(0), tz), datetime.combine(d2 + timedelta(days=1), time(0), tz))
        out = []
        for e in sorted(evs, key=lambda e: e["start"]):
            if e["all_day"]:
                when = f"{e['start']} (journée)"
            else:
                st, en = datetime.fromisoformat(e["start"]).astimezone(tz), datetime.fromisoformat(e["end"]).astimezone(tz)
                when = f"{st:%Y-%m-%d %H:%M}-{en:%H:%M}"
            out.append({"quand": when, "titre": e["title"], "lieu": e.get("location") or None})
        return out or "rien à l'agenda pour cette période"

    user = await _user(db, user_id)
    if not await _can_change(db, user_id):
        return "seul un administrateur ou un gestionnaire peut faire changer l'agenda par Zéko"
    from app.api.v1.endpoints.google_oauth import EventCreate, create_google_event
    genre = str(args.get("genre") or "").strip().lower()
    if genre not in ("rdv", "appel", "perso"):
        return "genre : rdv, appel ou perso"
    d = _date_dite(args.get("date"), clock.today())
    if isinstance(d, str):
        return d
    try:
        hh, mm = (int(x) for x in str(args.get("heure") or "").replace("h", ":").split(":")[:2])
        start = datetime.combine(d, time(hh, mm), tz) if d else None
    except (ValueError, TypeError):
        start = None
    if not start:
        return "précise la date (AAAA-MM-JJ) et l'heure (HH:MM)"
    if start < clock.now():
        return f"le {_JOURS_FR[d.weekday()]} {d.isoformat()} à {start:%H:%M} est déjà passé : vérifie la date"
    minutes = int(args.get("duree_minutes") or (30 if genre == "appel" else 60))
    titre = str(args.get("titre") or "").strip() or str(args.get("description") or "").strip()[:80]
    prefix = {"rdv": "RDV - ", "appel": "Appel - "}.get(genre, "")
    if prefix and not titre.lower().startswith(prefix.split(" ")[0].lower()):
        titre = prefix + titre
    company = contact = None
    if genre != "perso":            # un RDV ou un appel cree toujours un ticket (TASK-015.19)
        if args.get("personne"):
            contact = await _resolve_contact(db, args["personne"])
            if not isinstance(contact, Contact):
                return contact
        if args.get("client"):
            company = await _resolve_company(db, args["client"])
            if not isinstance(company, Company):
                return company
        if not company and not contact:
            return "un RDV ou un appel est toujours lié à un client (il crée son ticket) : précise le client ou la personne"
    payload = EventCreate(title=titre, description=args.get("description"), location=args.get("lieu"), start=start,
                          end=start + timedelta(minutes=minutes), company_id=company.id if company else None,
                          contact_id=contact.id if contact else None, personal=genre == "perso")
    try:
        res = await create_google_event(payload, db, user)
    except HTTPException as e:
        return f"pas mis à l'agenda : {_http_detail(e)}"
    fait = {"fait": f"mis à l'agenda : {titre}, le {_JOURS_FR[d.weekday()]} {d.isoformat()} à {start:%H:%M}, {minutes} min"}
    if res.get("ticket_id"):
        t = await db.get(Ticket, uuid.UUID(res["ticket_id"]))
        fait.update(ticket=ticket_no(t), ouvert=f"ticket {ticket_no(t)}", chemin=f"/tickets/{t.id}")
    return fait


_LANGUE = {"fr": "fr", "francais": "fr", "français": "fr", "french": "fr", "en": "en", "anglais": "en", "english": "en"}
_QUAND_FR = {"forward_immediate": "toujours", "forward_busy": "si occupé", "forward_no_answer": "si pas de réponse",
             "forward_offline": "si non connecté"}
_VERS_FR = {"extension": "vers le poste", "voicemail": "vers la boîte vocale", "ring_group": "vers le groupe d'appel"}
ECHEC = "ÉCHEC, rien n'a été fait : "
_QUAND = {"toujours": "forward_immediate", "occupe": "forward_busy", "sans_reponse": "forward_no_answer", "non_connecte": "forward_offline"}
_VERS = {"poste": "extension", "boite_vocale": "voicemail", "groupe_appel": "ring_group"}


def _poste_fields(args) -> dict | str:
    """Reglages du poste demandes -> champs SIPV ; un reglage invalide refuse tout (rien n'est change), un renvoi vers un
    numero externe (pas encore fait par SIPV) est seulement marque « pas fait »."""
    f = {}
    if args.get("boite_vocale") is not None:
        f["voicemail_enabled"] = bool(args["boite_vocale"])
    lang = _LANGUE.get(str(args.get("langue") or "").strip().lower())
    if lang:
        f["display_language"] = lang
    for r in args.get("renvois") or []:
        key = _QUAND.get(r.get("quand"))
        if not key:
            return "renvoi : quand = toujours, occupe, sans_reponse ou non_connecte"
        vers = r.get("vers")
        if vers == "numero_externe":        # le reste de la tache se fait ; ce renvoi est dit « pas fait »
            f["_externe"] = True
            continue
        if vers == "aucun":
            f[f"{key}_enabled"] = False
            continue
        if vers not in _VERS:
            return "renvoi : vers = poste, boite_vocale ou groupe_appel"
        dest = str(r.get("destination") or "").strip()
        if vers != "boite_vocale" and not dest:
            return "renvoi : précise le numéro du poste ou du groupe"
        f.update({f"{key}_enabled": True, f"{key}_destination_type": _VERS[vers], f"{key}_destination": dest or None})
        if key == "forward_no_answer" and r.get("delai_secondes"):
            f["forward_no_answer_delay_seconds"] = int(r["delai_secondes"])
    return f


def _applied(fields) -> str:
    """Ce qui a vraiment ete applique au poste, en clair : Zeko le repete, il n'en dit jamais plus."""
    out = []
    if "voicemail_enabled" in fields:
        out.append("boîte vocale " + ("active" if fields["voicemail_enabled"] else "désactivée"))
    if "display_language" in fields:
        out.append("téléphone en " + ("anglais" if fields["display_language"] == "en" else "français"))
    for key, quand in _QUAND_FR.items():
        if f"{key}_enabled" in fields:
            out.append(f"renvoi {quand} " + (f"{_VERS_FR[fields[key + '_destination_type']]} {fields.get(key + '_destination') or ''}".strip()
                                             if fields[f"{key}_enabled"] else "retiré"))
    if not any(k.endswith("_enabled") and k.startswith("forward_") for k in fields):
        out.append("aucun renvoi changé")
    return " ; réglé : " + ", ".join(out)


def _not_live(fields, externe=False) -> str:
    ext = (" ; PAS FAIT : le renvoi vers un numéro externe (cellulaire) n'existe pas encore dans le serveur téléphonique "
           "(seulement vers un poste, la boîte vocale ou un groupe d'appel)") if externe else ""
    # meme avertissement que la fiche du poste (SIPV, TASK-S023.6) : a dire tel quel, jamais promettre que ca marche
    late = [lbl for k, lbl in (("forward_busy_enabled", "occupé"), ("forward_no_answer_enabled", "sans réponse"),
                                ("forward_offline_enabled", "non connecté")) if fields.get(k)]
    return (f" ; attention : le renvoi « {' / '.join(late)} » est enregistré, mais n'est pas encore confirmé par le "
            f"serveur téléphonique (seul le renvoi immédiat l'est)") + ext if late else ext


async def _poste(name, args, db, user_id):
    import httpx
    from fastapi import HTTPException
    from app.core import sipv_client
    user = await _user(db, user_id)
    if not await _can_change(db, user_id):
        return "seul un administrateur ou un gestionnaire peut faire créer ou régler un poste par Zéko"
    fields = _poste_fields(args)
    if isinstance(fields, str):
        return fields
    externe = fields.pop("_externe", False)
    if name == "regler_poste":
        c = await _resolve_contact(db, args.get("personne"))
        if not isinstance(c, Contact):
            return c
        if not fields:
            return "rien n'a été changé" + _not_live(fields, externe)
        if not c.sipv_sync:
            return f"{c.first_name} {c.last_name} n'a pas de poste"
        try:
            ext = (await sipv_client.get_extensions_by_contact(str(c.id)))[0]
            await sipv_client.update_extension(ext["id"], **fields)
        except (httpx.HTTPError, IndexError):
            return "le serveur téléphonique ne répond pas : rien n'a été changé"
        return {"fait": f"poste {ext.get('extension')} de {c.first_name} {c.last_name} réglé" + _applied(fields) + _not_live(fields, externe), "ouvert": f"{c.first_name} {c.last_name}",
                "chemin": f"/contacts/{c.id}"}

    from app.api.v1.endpoints.contacts import ContactSipvActivate, create_contact_sip_extension
    from app.models.entity import EntityType
    comp = await _resolve_company(db, args.get("client"))
    if not isinstance(comp, Company):
        return comp
    if not comp.sipv_enabled or not comp.sipv_tenant_id:
        return f"{comp.name} n'a pas encore la téléphonie (à activer dans sa fiche) : rien n'a été créé"
    first, last = str(args.get("prenom") or "").strip(), str(args.get("nom") or "").strip()
    if not first:
        return "précise le prénom et le nom"
    if last.lower().startswith(first.lower() + " "):     # nom complet donne comme nom : « Paul » + « Paul Vital »
        last = last[len(first):].strip()
    full = func.lower(func.unaccent(func.concat(Contact.first_name, " ", Contact.last_name)))
    c = (await db.execute(select(Contact).join(ContactCompany, ContactCompany.contact_id == Contact.id)
                          .where(ContactCompany.company_id == comp.id, full == func.lower(func.unaccent(f"{first} {last}"))))).scalars().first()
    created = c is None
    if c and c.sipv_sync:
        return f"{first} {last} a déjà un poste chez {comp.name} : rien n'a été créé"
    if c:                            # le poste va au client principal de la personne (comme dans sa fiche)
        main = (await db.execute(select(ContactCompany).where(ContactCompany.contact_id == c.id, ContactCompany.is_active == True)
                                 .order_by(ContactCompany.is_primary.desc()))).scalars().first()
        if not main or main.company_id != comp.id:
            return f"{first} {last} a {comp.name} comme entreprise secondaire : crée le poste depuis sa fiche. Rien n'a été créé"
    if created:                      # meme creation que l'ecran : personne + lien au client (entreprise principale)
        cell = str(args.get("cellulaire") or "").strip()
        mail = str(args.get("courriel") or "").strip()
        c = Contact(first_name=first, last_name=last, email=mail if "@" in mail else None,   # jamais un numero ou un courriel invente
                    mobile=cell if sum(ch.isdigit() for ch in cell) >= 7 else None)
        ent = Entity(entity_type=EntityType.person)
        db.add(ent)
        await db.flush()
        c.id = ent.id
        db.add(c)
        await db.flush()
        db.add(ContactCompany(contact_id=c.id, company_id=comp.id, email=c.email, is_primary=True))
        await db.commit()
    who = f"{first} {last}".strip()
    try:
        await create_contact_sip_extension(c.id, ContactSipvActivate(extension_number=str(args.get("numero") or "").strip() or None), db, user)
    except HTTPException as e:
        if created:                  # la personne existe maintenant : ce n'est pas « rien n'a été fait »
            return {"fait": f"{who} créé chez {comp.name} ; PAS FAIT : le poste ({_http_detail(e)})", "ouvert": who, "chemin": f"/contacts/{c.id}"}
        return f"poste pas créé : {_http_detail(e)}"
    await db.refresh(c)
    note = ""
    if fields:
        try:
            ext = (await sipv_client.get_extensions_by_contact(str(c.id)))[0]
            await sipv_client.update_extension(ext["id"], **fields)
        except (httpx.HTTPError, IndexError):
            note = " ; ses réglages (boîte vocale, langue, renvois) n'ont pas pu être appliqués : à refaire"
    return {"fait": (f"{who} créé chez {comp.name}, " if created else "") + f"poste {c.extension} créé" + (note or _applied(fields)) + _not_live(fields, externe),
            "ouvert": who, "chemin": f"/contacts/{c.id}"}
