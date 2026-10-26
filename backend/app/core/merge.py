"""Fusion de deux contacts ou de deux compagnies (TASK-003.4, 2026-10-26).

Une fiche est gardee, l'autre disparait : tout ce qui pointait vers celle qui disparait passe sur celle qui reste
(tickets, taches, rendez-vous, courriels, conversations, factures et paiements pour une compagnie, liens
contact-compagnie, adresses, coordonnees, pastilles, journal...). Pour chaque champ different, on choisit la valeur
gardee ; l'autre nom / courriel / telephone va dans les anciennes coordonnees (former_infos, TASK-002.8) : rien n'est
perdu. Le journal de la fiche gardee dit avec quoi elle a ete fusionnee.

Refuse (avec la raison) ce qui ne se fusionne pas sans risque : deux employes, deux acces au portail, deux vendeurs,
une fiche qui disparait avec un poste ou une telephonie (SIPV), la compagnie de l'entreprise elle-meme.
"""
import uuid

from fastapi import HTTPException
from sqlalchemy import text, select

from app.models.contact import Contact
from app.models.company import Company
from app.models.entity_log import EntityLog
from app.models.former_info import FormerInfo

# (table, colonne, libelle pour l'ecran) -- tout ce qui pointe vers la fiche ; les cas a contrainte d'unicite a part
_CONTACT_REFS = [
    ("tickets", "contact_id", "tickets"), ("tasks", "contact_id", "tâches"), ("appointments", "contact_id", "rendez-vous"),
    ("mail_messages", "contact_id", "courriels"), ("conversation_segments", "contact_id", "passages de conversations enregistrées"),
    ("zeko_conversations", "contact_id", "conversations avec Zéko"), ("portal_users", "contact_id", "accès au portail"),
    ("sales_reps", "contact_id", "fiche vendeur"), ("companies", "vendor_id", "compagnies dont il est le vendeur"),
    ("companies", "internet_contact_id", "compagnies (contact internet)"), ("companies", "network_contact_id", "compagnies (contact réseau)"),
    ("company_sites", "billing_contact_id", "succursales (contact de facturation)"), ("entity_logs", "contact_id", None),
]
_COMPANY_REFS = [
    ("invoices", "company_id", "factures et avoirs"), ("client_payments", "company_id", "paiements reçus"),
    ("devis", "company_id", "devis"), ("company_recurring_billings", "company_id", "factures périodiques"),
    ("recurring_billing_lines", "for_company_id", None), ("barter_exchanges", "company_id", "ententes / échanges"),
    ("tickets", "company_id", "tickets"), ("tasks", "company_id", "tâches"), ("appointments", "company_id", "rendez-vous"),
    ("equipment", "company_id", "équipements"), ("client_access", "company_id", "accès conservés"),
    ("installation_photos", "company_id", "photos d'installation"), ("company_sites", "company_id", "succursales"),
    ("company_sites", "branch_company_id", None), ("portal_users", "company_id", "accès au portail"),
    ("mail_messages", "company_id", "courriels"), ("bank_payee_rules", "company_id", "règles de la banque"),
    ("bank_transactions", "company_id", "transactions bancaires"), ("bank_transactions", "ai_company_id", None),
    ("commission_entries", "company_id", "commissions"), ("ecom_orders", "company_id", "commandes en ligne"),
    ("purchase_orders", "company_id", "commandes fournisseurs"), ("vendors", "company_id", "fiche fournisseur"),
    ("cdr_report_schedules", "company_id", "rapports d'appels"), ("zeko_conversations", "company_id", "conversations avec Zéko"),
    ("zeko_proposals", "company_id", None), ("zeko_rules", "company_id", None),
    ("companies", "parent_company_id", "compagnies dont elle est la maison mère"), ("companies", "bill_to_company_id", "compagnies facturées à elle"),
    ("companies", "internet_company_id", None), ("companies", "network_company_id", None),
]
_ENTITY_REFS = [("addresses", "entity_id", "adresses"), ("communication_channels", "entity_id", "coordonnées"),
                ("former_infos", "entity_id", "anciennes coordonnées"), ("entity_logs", "entity_id", None), ("email_opens", "entity_id", None)]

CONTACT_FIELDS = [("first_name", "Prénom", "name"), ("last_name", "Nom", "name"), ("email", "Courriel", "email"),
                  ("email_other", "Autre courriel", "email"), ("phone", "Téléphone", "phone"), ("mobile", "Cellulaire", "phone"),
                  ("extension", "Poste", None), ("phone_other", "Autre téléphone", "phone")]
COMPANY_FIELDS = [("name", "Nom", "name"), ("legal_name", "Raison sociale", "name"), ("office_phone", "Téléphone", "phone"),
                  ("website", "Site web", None), ("industry", "Secteur", None), ("neq", "NEQ", None),
                  ("tps_number", "N° TPS", None), ("tvq_number", "N° TVQ", None)]
# Compagnie : ces champs passent de l'autre fiche seulement s'ils sont vides sur celle qu'on garde
_COMPANY_FILL = ["shareholder_type", "employee_count", "annual_revenue", "internal_manager_id", "vendor_id", "vendor_support",
                 "vendor_rate", "parent_company_id", "bill_to_company_id", "internet_company_id", "internet_contact_id",
                 "network_company_id", "network_contact_id"]


def _empty(v) -> bool:
    return v is None or (isinstance(v, str) and not v.strip())


async def _count(db, table, col, rid) -> int:
    return (await db.execute(text(f"select count(*) from {table} where {col} = :i"), {"i": rid})).scalar() or 0


async def _counts(db, refs, rid) -> list[dict]:
    out = {}
    for table, col, label in refs:
        if label:
            n = await _count(db, table, col, rid)
            if n:
                out[label] = out.get(label, 0) + n
    return [{"quoi": k, "nombre": v} for k, v in out.items()]


def _conflicts(fields, keep, drop) -> list[dict]:
    out = []
    for f, label, _k in fields:
        a, b = getattr(keep, f), getattr(drop, f)
        if not _empty(a) and not _empty(b) and str(a).strip().lower() != str(b).strip().lower():
            out.append({"champ": f, "libelle": label, "garde": str(a), "autre": str(b)})
    return out


def _contact_label(c: Contact) -> str:
    return f"{c.first_name} {c.last_name}".strip() + (f" ({c.email})" if c.email else "")


# ── Contacts ──────────────────────────────────────────────────────────────────

async def _contact_blockers(db, keep: Contact, drop: Contact) -> list[str]:
    from app.core import sipv_client
    import httpx
    out = []
    for table, label in (("employees", "employé"), ("portal_users", "accès au portail"), ("sales_reps", "vendeur")):
        k, d = await _count(db, table, "contact_id", keep.id), await _count(db, table, "contact_id", drop.id)
        if k and d:
            out.append(f"Les deux fiches ont un {label} : on ne peut en garder qu'un")
    if await _count(db, "employees", "contact_id", drop.id):
        out.append(f"{drop.first_name} {drop.last_name} est employé : garde plutôt cette fiche (bouton « Garder l'autre fiche »)")
    try:
        if await sipv_client.get_extensions_by_contact(str(drop.id)):
            out.append(f"{drop.first_name} {drop.last_name} a un poste téléphonique : déplace ou supprime le poste d'abord (ou garde cette fiche)")
    except httpx.HTTPError:
        out.append("Le serveur téléphonique ne répond pas : impossible de vérifier les postes, réessaie plus tard")
    return out


async def contact_preview(db, keep_id, drop_id) -> dict:
    keep, drop = await _pair(db, Contact, keep_id, drop_id, "Contact")
    return {"garde": _contact_label(keep), "autre": _contact_label(drop),
            "conflits": _conflicts(CONTACT_FIELDS, keep, drop),
            "deplace": await _counts(db, _CONTACT_REFS + _ENTITY_REFS + [("contact_companies", "contact_id", "compagnies liées"),
                                                                         ("voice_prints", "contact_id", "voix apprise")], drop.id),
            "bloque": await _contact_blockers(db, keep, drop)}


async def merge_contacts(db, keep_id, drop_id, choices: dict, user) -> Contact:
    keep, drop = await _pair(db, Contact, keep_id, drop_id, "Contact")
    blockers = await _contact_blockers(db, keep, drop)
    if blockers:
        raise HTTPException(status_code=400, detail=" ; ".join(blockers))
    summary = await _counts(db, _CONTACT_REFS + _ENTITY_REFS + [("contact_companies", "contact_id", "compagnies liées"),
                                                                ("voice_prints", "contact_id", "voix apprise")], drop.id)
    label = _contact_label(drop)
    former = _fields(keep, drop, CONTACT_FIELDS, choices)
    if not _empty(drop.notes_internal):
        keep.notes_internal = "\n\n".join(x for x in (keep.notes_internal, f"(Fusionné, notes de {label}) {drop.notes_internal}") if not _empty(x))
    keep.is_active = keep.is_active or drop.is_active
    keep.sipv_sync = keep.sipv_sync or drop.sipv_sync
    k, d = keep.id, drop.id
    # liens aux compagnies : un seul lien par compagnie (fonctions et courriel reunis)
    for (link_id, comp_id) in (await db.execute(text("select id, company_id from contact_companies where contact_id = :d"), {"d": d})).all():
        mine = (await db.execute(text("select id from contact_companies where contact_id = :k and company_id = :c"), {"k": k, "c": comp_id})).scalar()
        if mine:
            await db.execute(text("""insert into contact_company_functions (contact_company_id, function_id)
                                     select :m, function_id from contact_company_functions f where f.contact_company_id = :l
                                     and not exists (select 1 from contact_company_functions g where g.contact_company_id = :m and g.function_id = f.function_id)"""),
                             {"m": mine, "l": link_id})
            await db.execute(text("""update contact_companies m set email = coalesce(nullif(m.email, ''), o.email),
                                     is_primary = m.is_primary or o.is_primary, is_active = m.is_active or o.is_active
                                     from contact_companies o where m.id = :m and o.id = :l"""), {"m": mine, "l": link_id})
            await db.execute(text("delete from contact_companies where id = :l"), {"l": link_id})
        else:
            await db.execute(text("update contact_companies set contact_id = :k where id = :l"), {"k": k, "l": link_id})
    if await _count(db, "voice_prints", "contact_id", k):
        await db.execute(text("delete from voice_prints where contact_id = :d"), {"d": d})     # une voix par personne : celle gardee
    else:
        await db.execute(text("update voice_prints set contact_id = :k where contact_id = :d"), {"k": k, "d": d})
    await _move(db, _CONTACT_REFS + _ENTITY_REFS, k, d, "contacts")
    await _finish(db, keep, drop, "contacts", label, summary, former, user)
    return keep


# ── Compagnies ────────────────────────────────────────────────────────────────

async def _company_blockers(db, keep: Company, drop: Company) -> list[str]:
    out = []
    if drop.is_owner:
        out.append(f"{drop.name} est ta propre entreprise : garde plutôt cette fiche")
    if drop.sipv_enabled or drop.sipv_tenant_id or await _count(db, "extensions", "company_id", drop.id) or await _count(db, "dids", "company_id", drop.id):
        out.append(f"{drop.name} a la téléphonie (postes, numéros) : garde plutôt cette fiche, ou migre sa téléphonie d'abord")
    return out


def _company_label(c: Company) -> str:
    return f"{c.name} ({c.account_number})" if c.account_number else c.name


async def company_preview(db, keep_id, drop_id) -> dict:
    keep, drop = await _pair(db, Company, keep_id, drop_id, "Compagnie")
    return {"garde": _company_label(keep), "autre": _company_label(drop),
            "conflits": _conflicts(COMPANY_FIELDS, keep, drop),
            "deplace": await _counts(db, _COMPANY_REFS + _ENTITY_REFS + [("contact_companies", "company_id", "contacts liés")], drop.id),
            "bloque": await _company_blockers(db, keep, drop)}


async def merge_companies(db, keep_id, drop_id, choices: dict, user) -> Company:
    keep, drop = await _pair(db, Company, keep_id, drop_id, "Compagnie")
    blockers = await _company_blockers(db, keep, drop)
    if blockers:
        raise HTTPException(status_code=400, detail=" ; ".join(blockers))
    summary = await _counts(db, _COMPANY_REFS + _ENTITY_REFS + [("contact_companies", "company_id", "contacts liés")], drop.id)
    label = _company_label(drop)
    former = _fields(keep, drop, COMPANY_FIELDS, choices)
    for f in _COMPANY_FILL:
        if _empty(getattr(keep, f)) and not _empty(getattr(drop, f)) and getattr(drop, f) != keep.id:
            setattr(keep, f, getattr(drop, f))
    if not _empty(drop.notes_internal):
        keep.notes_internal = "\n\n".join(x for x in (keep.notes_internal, f"(Fusionnée, notes de {label}) {drop.notes_internal}") if not _empty(x))
    keep.is_active = keep.is_active or drop.is_active
    k, d = keep.id, drop.id
    for (link_id, contact_id) in (await db.execute(text("select id, contact_id from contact_companies where company_id = :d"), {"d": d})).all():
        mine = (await db.execute(text("select id from contact_companies where company_id = :k and contact_id = :c"), {"k": k, "c": contact_id})).scalar()
        if mine:
            await db.execute(text("""insert into contact_company_functions (contact_company_id, function_id)
                                     select :m, function_id from contact_company_functions f where f.contact_company_id = :l
                                     and not exists (select 1 from contact_company_functions g where g.contact_company_id = :m and g.function_id = f.function_id)"""),
                             {"m": mine, "l": link_id})
            await db.execute(text("""update contact_companies m set email = coalesce(nullif(m.email, ''), o.email),
                                     is_primary = m.is_primary or o.is_primary, is_active = m.is_active or o.is_active
                                     from contact_companies o where m.id = :m and o.id = :l"""), {"m": mine, "l": link_id})
            await db.execute(text("delete from contact_companies where id = :l"), {"l": link_id})
        else:
            await db.execute(text("update contact_companies set company_id = :k where id = :l"), {"k": k, "l": link_id})
    if (await db.execute(text("select 1 from company_sites where company_id = :k and is_primary"), {"k": k})).first():
        await db.execute(text("update company_sites set is_primary = false where company_id = :d"), {"d": d})   # une seule succursale principale
    await db.execute(text("delete from telephony_locks where company_id = :d"), {"d": d})
    await _move(db, _COMPANY_REFS + _ENTITY_REFS, k, d, "companies")
    for col in ("parent_company_id", "bill_to_company_id", "internet_company_id", "network_company_id"):
        await db.execute(text(f"update companies set {col} = null where id = :k and {col} = :k"), {"k": k})   # jamais elle-meme
    note = f". Son numéro de compte {drop.account_number} n'existe plus" if drop.account_number else ""
    await _finish(db, keep, drop, "companies", label, summary, former, user, note)
    return keep


# ── Commun ────────────────────────────────────────────────────────────────────

async def _pair(db, model, keep_id, drop_id, what):
    if str(keep_id) == str(drop_id):
        raise HTTPException(status_code=400, detail="Choisis une autre fiche que celle-ci")
    keep, drop = await db.get(model, keep_id), await db.get(model, drop_id)
    if not keep or not drop:
        raise HTTPException(status_code=404, detail=f"{what} introuvable")
    return keep, drop


def _fields(keep, drop, fields, choices: dict) -> list[tuple[str, str]]:
    """Valeurs gardees selon les choix ; retourne les anciennes valeurs (kind, valeur) a garder dans former_infos."""
    former = []
    for f, _label, kind in fields:
        a, b = getattr(keep, f), getattr(drop, f)
        if _empty(a) and not _empty(b):
            setattr(keep, f, b)
            continue
        if _empty(b) or str(a).strip().lower() == str(b).strip().lower():
            continue
        lost = a
        if choices.get(f) == "autre":
            setattr(keep, f, b)
        else:
            lost = b
        if kind:
            former.append((kind, str(lost)))
    if isinstance(keep, Contact):          # nom complet perdu : une seule ancienne valeur « Prénom Nom »
        names = [v for k, v in former if k == "name"]
        if names:
            full = f"{drop.first_name} {drop.last_name}".strip()
            mine = f"{keep.first_name} {keep.last_name}".strip()
            former = [x for x in former if x[0] != "name"] + ([("name", full)] if full.lower() != mine.lower() else [])
    return former


async def _move(db, refs, k, d, object_type):
    for table, col, _label in refs:
        await db.execute(text(f"update {table} set {col} = :k where {col} = :d"), {"k": k, "d": d})
    await db.execute(text("""insert into entity_statuses (entity_id, status_id, assigned_at)
                             select :k, status_id, assigned_at from entity_statuses s where s.entity_id = :d
                             and not exists (select 1 from entity_statuses t where t.entity_id = :k and t.status_id = s.status_id)"""), {"k": k, "d": d})
    await db.execute(text("delete from entity_statuses where entity_id = :d"), {"d": d})
    await db.execute(text("update entity_logs set object_id = :k where object_type = :t and object_id = :d"), {"k": str(k), "d": str(d), "t": object_type})
    await db.execute(text("update entity_logs set parent_id = :k where parent_type = :t and parent_id = :d"), {"k": str(k), "d": str(d), "t": object_type})


async def _finish(db, keep, drop, object_type, label, summary, former, user, note=""):
    for kind, value in former:
        db.add(FormerInfo(entity_id=keep.id, kind=kind, value=value[:255], note=f"Fusion avec {label}"[:500]))
    what = ", ".join(f"{s['nombre']} {s['quoi']}" for s in summary)
    db.add(EntityLog(entity_id=keep.id, user_id=user.id if user else None, action="merged", field_name="Fusion",
                     description=(f"Fusion avec {label}. " + (f"Passé sur cette fiche : {what}" if what else "Rien d'autre à déplacer") + f"{note}.")[:4000]))
    await db.flush()
    await db.execute(text("delete from entities where id = :d"), {"d": drop.id})      # cascade : la fiche qui disparait
    await db.commit()
