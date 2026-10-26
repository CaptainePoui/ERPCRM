"""Documents deposes sur Zeko (TASK-006.9, 2026-10-26).

On glisse un fichier sur le bouton Zeko, de n'importe quelle page. Zeko le lit en arriere-plan et reconnait ce que
c'est d'apres son contenu, le nom du fichier et le courriel qui l'accompagnait (un .eml est ouvert : chaque piece
jointe devient un document, le courriel sert d'indice). La page ou l'on etait n'est qu'un indice faible.

  releve    -> releve bancaire OFX/CSV : importe dans Banque (meme import que l'ecran Banque)
  depense   -> facture ou recu d'achat : file des recus (TASK-044.1), qui cree la depense ou la met « A verifier »
  carte     -> carte d'affaires : nouveau contact (et sa compagnie), ou fiche existante completee (TASK-003.3)
  photo     -> photo sans texte : photos d'installation de la compagnie
  document  -> autre document d'un client : classe dans sa fiche

Rien n'est fait avant le oui. « Autre » relance l'analyse sans la reponse refusee ; au 2e « Autre », la personne dit
ou il va (instruction suivie par l'analyse). La question est redigee par le programme, pas par l'IA.
"""
import asyncio
import email
import hashlib
import io
import json
import logging
import re
import shutil
import uuid
import zipfile
from email import policy
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select

from app.core import zeko
from app.core.database import AsyncSessionLocal
from app.models.zeko import ZekoDrop

log = logging.getLogger(__name__)

DROPS_DIR = Path(__file__).resolve().parents[2] / "storage" / "zeko_drops"
MAX_BYTES = 25 * 1024 * 1024
SECONDS_PER_DROP = 120
TYPES = {"releve": "Relevé bancaire", "depense": "Facture ou reçu de dépense", "carte": "Carte d'affaires",
         "photo": "Photo", "document": "Document d'un client"}
SECTION = {"releve": "banque", "depense": "achats", "carte": "clients", "photo": "clients", "document": "clients"}
_STATEMENT_EXT = (".csv", ".ofx", ".qfx", ".qbo")
_IMAGE_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".bmp", ".tif", ".tiff")
OPEN = ("pending", "reading", "analyzing", "ready", "done", "failed")


# ── Depot ─────────────────────────────────────────────────────────────────────

def _expand(name: str, raw: bytes, origin: str | None = None, context: str | None = None, depth: int = 0) -> list[tuple]:
    """(nom, contenu, origine, contexte) : un ZIP est ouvert, un courriel .eml donne ses pieces jointes."""
    low = name.lower()
    if depth < 2 and low.endswith(".zip"):
        out = []
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                for info in z.infolist():
                    base = Path(info.filename).name
                    if info.is_dir() or info.filename.startswith("__MACOSX") or base.startswith(".") or info.file_size > MAX_BYTES:
                        continue
                    out += _expand(base, z.read(info), f"dans le ZIP « {name} »", context, depth + 1)
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail=f"{name} : ZIP illisible")
        return out
    if depth < 2 and low.endswith(".eml"):
        msg = email.message_from_bytes(raw, policy=policy.default)
        subject = str(msg.get("subject") or "").strip()
        body = msg.get_body(preferencelist=("plain", "html"))
        text = body.get_content() if body else ""
        if body is not None and body.get_content_type() == "text/html":
            text = re.sub(r"<[^>]+>", " ", text)
        ctx = (f"Courriel de {msg.get('from') or '?'} à {msg.get('to') or '?'}, le {msg.get('date') or '?'}, "
               f"sujet « {subject} » :\n{re.sub(r'\s+', ' ', text)[:1500]}")
        out = []
        for part in msg.iter_attachments():
            fn = part.get_filename() or "piece_jointe"
            data = part.get_payload(decode=True) or b""
            if data and len(data) <= MAX_BYTES:
                out += _expand(fn, data, f"joint au courriel « {subject} »", ctx, depth + 1)
        return out or [(name, raw, origin, ctx)]
    return [(name, raw, origin, context)]


async def store(db, user, files: list[tuple[str, bytes]], page_company_id=None, page_contact_id=None) -> list[ZekoDrop]:
    DROPS_DIR.mkdir(parents=True, exist_ok=True)
    done = {s: f for s, f in (await db.execute(select(ZekoDrop.sha256, ZekoDrop.filename).where(
        ZekoDrop.status.in_(["done", "archived"]), ZekoDrop.result.is_not(None)))).all()}
    created = []
    for name, raw in files:
        if len(raw) > MAX_BYTES:
            raise HTTPException(status_code=400, detail=f"{name} : fichier trop volumineux (25 Mo maximum)")
        for fn, data, origin, ctx in _expand(name, raw):
            d = ZekoDrop(id=uuid.uuid4(), user_id=user.id, filename=fn[:255], sha256=hashlib.sha256(data).hexdigest(), size=len(data),
                         origin=(origin or "")[:500] or None, context=ctx, page_company_id=page_company_id, page_contact_id=page_contact_id,
                         stored_path="")
            safe = re.sub(r"[^A-Za-z0-9._-]+", "_", fn)[-100:]
            path = DROPS_DIR / f"{d.id}_{safe}"
            path.write_bytes(data)
            d.stored_path = str(path)
            if d.sha256 in done:
                d.status, d.error = "failed", f"Déjà déposé et placé ({done[d.sha256]})"
            db.add(d)
            created.append(d)
    await db.commit()
    return created


# ── Analyse ───────────────────────────────────────────────────────────────────

async def _statement(db, d: ZekoDrop, raw: bytes) -> dict | None:
    """Releve OFX/CSV lisible -> apercu de l'import (sans rien enregistrer)."""
    from app.core.bank_statement_parser import parse_statement, StatementParseError
    from app.models.bank_account import BankAccount
    try:
        st = parse_statement(raw, d.filename)
    except (StatementParseError, Exception):
        return None
    accounts = (await db.execute(select(BankAccount).where(BankAccount.is_active.is_(True), BankAccount.account_type != "petty_cash"))).scalars().all()
    digits = re.sub(r"\D", "", st.account_number or "")
    acc = next((a for a in accounts if a.account_last4 and digits.endswith(a.account_last4)), None) or (accounts[0] if len(accounts) == 1 else None)
    if not acc:
        return {"type": "releve", "erreur": "Relevé lu, mais je ne sais pas dans quel compte de la banque l'importer"}
    prev = await _import(db, d, acc.id, raw, dry_run=True)
    return {"type": "releve", "compte_id": str(acc.id), "compte": f"{acc.name} ({acc.institution or 'banque'} ****{acc.account_last4 or '?'})",
            "debut": str(prev.get("period_start") or ""), "fin": str(prev.get("period_end") or ""), "lignes": prev.get("rows_total"),
            "nouvelles": prev.get("rows_new"), "compte_different": bool(prev.get("account_mismatch"))}


async def _import(db, d: ZekoDrop, account_id, raw: bytes, dry_run: bool) -> dict:
    from starlette.datastructures import UploadFile
    from app.api.v1.endpoints.bank import import_statement
    from app.models.user import User
    user = await db.get(User, d.user_id)
    return await import_statement(account_id, UploadFile(file=io.BytesIO(raw), filename=d.filename), dry_run, False, db, user)


def _prompt(d: ZekoDrop, page: str | None, refused: list[str]) -> str:
    rules = (
        "Tu tries un document déposé dans ERPCRM, le logiciel de Simple IP inc. (téléphonie IP et informatique, Québec). "
        "Simple IP est NOTRE entreprise. Types possibles :\n"
        "- « depense » : facture ou reçu d'un fournisseur où Simple IP est le client (achat, abonnement, Bell, Amazon…).\n"
        "- « carte » : carte d'affaires d'une personne (nom, fonction, compagnie, téléphones, courriel).\n"
        "- « photo » : photo d'un lieu ou d'un équipement chez un client (peu ou pas de texte).\n"
        "- « document » : tout autre document qui concerne un client : contrat, soumission, bon de travail, facture émise PAR "
        "Simple IP à un client, lettre, formulaire, plan… (« compagnie » = le client concerné).\n"
        "- « releve » : relevé de compte bancaire de Simple IP.\n"
        "Donne la compagnie et la personne nommées dans le document (jamais Simple IP comme compagnie d'un document de client). "
        "N'invente rien : null si absent.\n"
        "Réponds UNIQUEMENT en JSON : {\"type\": str, \"titre\": str (court, ex. « Facture Bell octobre 2026 »), "
        "\"compagnie\": str|null, \"personne\": str|null, \"fournisseur\": str|null, \"date\": \"AAAA-MM-JJ\"|null, \"total\": number|null, "
        "\"carte\": {\"prenom\": str|null, \"nom\": str|null, \"compagnie\": str|null, \"fonction\": str|null, \"telephone\": str|null, "
        "\"cellulaire\": str|null, \"courriel\": str|null, \"site\": str|null}|null, \"raison\": str (une phrase)}"
    )
    if refused:
        rules += f"\nCes réponses ont été refusées par la personne, ne les redonne pas : {'; '.join(refused)}."
    if d.instruction:
        rules += f"\nLa personne dit où va ce document : « {d.instruction} ». Suis son indication (type et client)."
    if page:
        rules += f"\nIndice faible : la personne était sur la fiche de « {page} » (seulement si le document ne nomme aucun autre client)."
    return rules


def _refused(d: ZekoDrop) -> list[str]:
    return [f"type « {r.get('type')} »" + (f" pour « {r.get('cible')} »" if r.get("cible") else "") for r in d.rejected or []]


async def _company(db, name):
    from app.core import duplicates
    from app.models.company import Company
    if not name:
        return None
    found = [m for m in await duplicates.similar_companies(db, name) if "nom" in m["raison"]]
    return await db.get(Company, uuid.UUID(found[0]["id"])) if found else None


async def analyze(db, d: ZekoDrop) -> dict:
    from app.core.receipt_reader import extract_text, compact, ReadError
    from app.models.company import Company
    from app.models.contact import Contact
    raw = Path(d.stored_path).read_bytes()
    refused_types = {r.get("type") for r in d.rejected or []}
    ext = Path(d.filename).suffix.lower()
    told_kind, told_comp, told_contact = await _from_instruction(db, d.instruction)
    if ("releve" not in refused_types or told_kind == "releve") and told_kind in (None, "releve") \
            and (ext in _STATEMENT_EXT or b"OFX" in raw[:2000].upper()):
        st = await _statement(db, d, raw)
        if st:
            return st
    if d.text is None:
        d.status = "reading"
        await db.commit()
        try:
            text, _m = await asyncio.to_thread(extract_text, Path(d.stored_path))
        except ReadError:
            text = ""                    # format non lu (Word, Excel…) : le nom du fichier et le courriel restent
        d.text = text[:50000]
    d.status = "analyzing"
    await db.commit()
    page = None
    if d.page_contact_id and (c := await db.get(Contact, d.page_contact_id)):
        page = f"{c.first_name} {c.last_name}".strip()
    elif d.page_company_id and (co := await db.get(Company, d.page_company_id)):
        page = co.name
    user = f"Nom du fichier : {d.filename}\n" + (f"Provenance : {d.origin}\n" if d.origin else "") + (f"{d.context}\n" if d.context else "")
    user += "Texte du document :\n" + (compact(d.text)[:6000] if d.text and d.text.strip() else "(aucun texte lisible : image ou format non lu)")
    content = await zeko.complete([{"role": "system", "content": _prompt(d, page, _refused(d))}, {"role": "user", "content": user}],
                                  purpose="depot", timeout=1200, user_id=d.user_id)
    m = re.search(r"\{.*\}", content, re.S)
    if not m:
        raise ValueError("Réponse de Zéko illisible")
    a = json.loads(m.group(0))
    kind = a.get("type") if a.get("type") in TYPES else "document"
    if told_kind:                        # ce que la personne a dit l'emporte toujours sur la lecture du modele
        kind = told_kind
    if kind == "photo" and ext not in _IMAGE_EXT:
        kind = "document"
    if kind == "releve":                 # releve en PDF ou image : la Banque n'importe que l'OFX/CSV
        return {"type": "document", "titre": a.get("titre") or d.filename, "releve_pdf": True,
                **await _target(db, d, "Simple IP", None, owner=True)}
    out = {"type": kind, "titre": (a.get("titre") or d.filename)[:200], "raison": a.get("raison")}
    if kind == "depense":
        out.update({"fournisseur": a.get("fournisseur"), "date": a.get("date"), "total": a.get("total")})
    elif kind == "carte":
        out.update(await _card(db, a.get("carte") or {}))
        if told_comp:
            out.update({"compagnie_id": str(told_comp.id), "compagnie": told_comp.name})
    elif told_comp or told_contact:
        out.update({"compagnie_id": str(told_comp.id) if told_comp else None, "compagnie": told_comp.name if told_comp else None,
                    "contact_id": str(told_contact.id) if told_contact else None,
                    "contact": f"{told_contact.first_name} {told_contact.last_name}".strip() if told_contact else None})
    else:
        out.update(await _target(db, d, a.get("compagnie"), a.get("personne")))
    return out


_TOLD = [("releve", r"relev|banque"), ("depense", r"d[eé]pense|re[cç]u|achat|fournisseur"), ("carte", r"carte"),
         ("photo", r"photo|image"), ("document", r"document|contrat|classe|dossier|fiche")]


async def _from_instruction(db, text: str | None):
    """Ce que la personne a dit (« photo de CNJ », « c'est une dépense ») : le type et le client NOMMES, lus par le
    programme -- le modele, lui, suivait parfois le courriel plutot que la personne."""
    from app.core.duplicates import norm, norm_company
    from app.models.company import Company
    from app.models.contact import Contact
    if not text:
        return None, None, None
    low = text.lower()
    kind = next((k for k, rx in _TOLD if re.search(rx, low)), None)
    flat = norm(text)
    comps = [(len(n), c) for c in (await db.execute(select(Company))).scalars().all()
             for n in {norm_company(c.name), norm_company(c.legal_name)} if len(n) >= 3 and n in flat]
    conts = [(len(n), c) for c in (await db.execute(select(Contact))).scalars().all()
             for n in {norm(f"{c.first_name}{c.last_name}")} if len(n) >= 5 and n in flat]
    comp = max(comps, key=lambda x: x[0])[1] if comps else None
    contact = max(conts, key=lambda x: x[0])[1] if conts else None
    return kind, comp, contact


async def _target(db, d: ZekoDrop, company_name, person, owner=False) -> dict:
    from app.core import duplicates
    from app.models.company import Company
    from app.models.contact import Contact
    comp = None
    if owner:
        comp = (await db.execute(select(Company).where(Company.is_owner.is_(True)))).scalars().first()
    comp = comp or await _company(db, company_name)
    if not comp and not company_name and d.page_company_id:
        comp = await db.get(Company, d.page_company_id)
    contact = None
    if person:
        parts = person.split(" ", 1)
        found = [m for m in await duplicates.similar_contacts(db, parts[0], parts[1] if len(parts) > 1 else "") if "nom" in m["raison"]]
        if len(found) == 1:
            contact = await db.get(Contact, uuid.UUID(found[0]["id"]))
    if not comp and not contact and d.page_contact_id:
        contact = await db.get(Contact, d.page_contact_id)
    return {"compagnie_id": str(comp.id) if comp else None, "compagnie": comp.name if comp else None, "compagnie_lue": company_name,
            "contact_id": str(contact.id) if contact else None, "contact": f"{contact.first_name} {contact.last_name}".strip() if contact else None}


async def _card(db, c: dict) -> dict:
    from app.core import duplicates
    clean = {k: (str(v).strip() if v not in (None, "") else None) for k, v in c.items()}
    if not clean.get("prenom") and not clean.get("nom"):
        return {"carte": clean, "erreur": "Je ne trouve pas le nom de la personne sur cette carte"}
    found = await duplicates.similar_contacts(db, clean.get("prenom") or "", clean.get("nom") or "", clean.get("courriel"),
                                              (clean.get("telephone"), clean.get("cellulaire")))
    comp = await _company(db, clean.get("compagnie"))
    return {"carte": clean, "existe": found[0] if found else None,
            "compagnie_id": str(comp.id) if comp else None, "compagnie": comp.name if comp else clean.get("compagnie")}


def question(d: ZekoDrop) -> str:
    """La phrase de Zeko, redigee ici a partir de l'analyse (jamais inventee par le modele)."""
    a = d.analysis or {}
    if a.get("meme_conclusion"):
        return "2e analyse, même conclusion : " + _question(d, a) + " Sinon, dis-moi où il va (Autre)."
    return _question(d, a)


def _question(d: ZekoDrop, a: dict) -> str:
    if a.get("erreur"):
        return a["erreur"] + ". Dis-moi où le placer (Autre)."
    k = a.get("type")
    if k == "releve":
        diff = " Attention : le numéro de compte du fichier ne correspond pas." if a.get("compte_different") else ""
        if not a.get("nouvelles"):
            return f"Relevé bancaire {a['compte']} du {a['debut']} au {a['fin']} : ses {a['lignes']} transactions sont déjà dans Banque. Rien à importer."
        return (f"Relevé bancaire {a['compte']} du {a['debut']} au {a['fin']} : {a['lignes']} transactions, dont {a['nouvelles']} nouvelles."
                f"{diff} Je l'importe dans Banque ?")
    if k == "depense":
        bits = [x for x in (a.get("fournisseur"), a.get("date"), f"{a['total']:.2f} $".replace(".", ",") if isinstance(a.get("total"), (int, float)) else None) if x]
        return (f"{a.get('titre')} — facture d'achat ({', '.join(bits) or 'détails lus ensuite'}). Je l'envoie dans Achats › Dépenses ? "
                f"(lecture complète et vérification des taxes là-bas)")
    if k == "carte":
        c = a.get("carte") or {}
        who = " ".join(x for x in (c.get("prenom"), c.get("nom")) if x)
        info = ", ".join(x for x in (c.get("fonction"), c.get("compagnie"), c.get("telephone"), c.get("cellulaire"), c.get("courriel")) if x)
        if a.get("existe"):
            e = a["existe"]
            return f"Carte d'affaires de {who} ({info}). {e['nom']}{' (' + e['compagnies'] + ')' if e['compagnies'] else ''} existe déjà : je complète sa fiche avec ce qui manque ?"
        where = f"chez {a['compagnie']}" + ("" if a.get("compagnie_id") else " (nouvelle compagnie)") if a.get("compagnie") else "sans compagnie"
        return f"Carte d'affaires de {who} ({info}). Je crée le contact {where} ?"
    if k == "photo":
        return (f"Photo : je l'ajoute aux photos d'installation de {a['compagnie']} ?" if a.get("compagnie_id")
                else "Photo, mais je ne sais pas de quel client. Dis-moi lequel (Autre).")
    who = a.get("compagnie") or a.get("contact")
    if a.get("releve_pdf"):
        return (f"Relevé bancaire en PDF : la Banque n'importe que les fichiers CSV ou OFX. Je le classe dans les documents de {who} ?"
                if who else "Relevé bancaire en PDF : la Banque n'importe que les fichiers CSV ou OFX (télécharge le CSV de la banque).")
    if not who:
        lu = f" (j'ai lu « {a['compagnie_lue']} », introuvable dans ERPCRM)" if a.get("compagnie_lue") else ""
        return f"« {a.get('titre')} » : je ne sais pas à quel client il appartient{lu}. Dis-moi lequel (Autre)."
    return f"« {a.get('titre')} » : je le classe dans les documents de {who}{' (' + a['contact'] + ')' if a.get('contact') and a.get('compagnie') else ''} ?"


def can_accept(d: ZekoDrop) -> bool:
    a = d.analysis or {}
    if d.status != "ready" or a.get("erreur"):
        return False
    k = a.get("type")
    if k == "releve":
        return bool(a.get("nouvelles"))
    if k in ("photo", "document"):
        return bool(a.get("compagnie_id") or a.get("contact_id"))
    return k in ("depense", "carte")


async def process_one() -> bool:
    async with AsyncSessionLocal() as db:
        d = (await db.execute(select(ZekoDrop).where(ZekoDrop.status == "pending").order_by(ZekoDrop.updated_at).limit(1)
                              .with_for_update(skip_locked=True))).scalar_one_or_none()
        if not d:
            return False
        try:
            a = await analyze(db, d)
            # « Autre » puis la meme conclusion : on le dit (2e analyse, pour etre sur), sans pretendre autre chose
            if not d.instruction and any(r.get("type") == a.get("type") and r.get("cible") == (a.get("compagnie") or a.get("contact")) for r in d.rejected or []):
                a["meme_conclusion"] = True
            d.analysis = a
            d.status, d.error = "ready", None
            await db.commit()
        except Exception as e:      # noqa: BLE001 -- un document en echec ne bloque jamais la file
            await db.rollback()
            d = await db.get(ZekoDrop, d.id)
            d.status, d.error = "failed", str(e)[:500]
            await db.commit()
            log.warning("Depot Zeko %s : echec (%s)", d.filename, e)
        return True


async def run_drop_poller():
    await asyncio.sleep(20)
    while True:
        try:
            if await zeko.enabled():
                while await process_one():
                    pass
        except Exception:
            log.exception("Iteration des depots Zeko echouee")
        await asyncio.sleep(5)


# ── Execution apres le oui ────────────────────────────────────────────────────

async def accept(db, d: ZekoDrop, user) -> dict:
    from app.core import privileges
    a = d.analysis or {}
    k = a.get("type")
    if not can_accept(d):
        raise HTTPException(status_code=400, detail="Rien à faire pour ce document : choisis « Autre » pour dire où il va")
    if not privileges.allows(await privileges.for_user_id(db, user.id), SECTION[k], privileges.MODIFIER):
        label = next(l for key, l, _e in privileges.SECTIONS if key == SECTION[k])
        raise HTTPException(status_code=403, detail=f"Tes privilèges ne permettent pas de modifier : {label}")
    raw = Path(d.stored_path).read_bytes()
    if k == "releve":
        r = await _import(db, d, uuid.UUID(a["compte_id"]), raw, dry_run=False)
        res = {"texte": f"{r.get('rows_new', a.get('nouvelles'))} transactions importées dans Banque", "chemin": "/bank"}
    elif k == "depense":
        from app.api.v1.endpoints.purchases import _store_receipt
        from app.models.purchases import ReceiptDocument
        if (await db.execute(select(ReceiptDocument.id).where(ReceiptDocument.sha256 == d.sha256, ReceiptDocument.status != "failed"))).first():
            raise HTTPException(status_code=400, detail="Ce fichier est déjà dans les reçus d'Achats › Dépenses")
        rd = _store_receipt(raw, d.filename, None, user.id)
        db.add(rd)
        res = {"texte": "Envoyé dans Achats › Dépenses : la dépense se crée après la lecture (ou va « À vérifier »)", "chemin": "/purchases/expenses"}
    elif k == "carte":
        res = await _apply_card(db, d, a, user)
    elif k == "photo":
        from app.api.v1.endpoints.companies import PHOTO_UPLOAD_DIR, _log
        from app.models.installation_photo import InstallationPhoto
        cid = uuid.UUID(a["compagnie_id"])
        pid = uuid.uuid4()
        fname = f"{pid}{Path(d.filename).suffix.lower()}"
        shutil.copyfile(d.stored_path, PHOTO_UPLOAD_DIR / fname)
        db.add(InstallationPhoto(id=pid, company_id=cid, filename=fname, caption=a.get("titre"), uploaded_by_id=user.id))
        _log(db, cid, user, "photo_added", description=f"Photo déposée sur Zéko : {d.filename}")
        res = {"texte": f"Ajoutée aux photos de {a['compagnie']}", "chemin": f"/companies/{cid}?tab=photos"}
    else:
        d.company_id = uuid.UUID(a["compagnie_id"]) if a.get("compagnie_id") else None
        d.contact_id = uuid.UUID(a["contact_id"]) if a.get("contact_id") else None
        who = a.get("compagnie") or a.get("contact")
        res = {"texte": f"Classé dans les documents de {who}",
               "chemin": f"/companies/{d.company_id}?tab=photos" if d.company_id else f"/contacts/{d.contact_id}"}
    d.status, d.result = "done", res
    await db.commit()
    return res


async def _apply_card(db, d: ZekoDrop, a: dict, user) -> dict:
    from app.models.contact import Contact
    from app.models.contact_company import ContactCompany
    c = a.get("carte") or {}
    if a.get("existe"):
        ct = await db.get(Contact, uuid.UUID(a["existe"]["id"]))
        filled = []
        for field, key, label in (("email", "courriel", "courriel"), ("mobile", "cellulaire", "cellulaire"), ("phone", "telephone", "téléphone")):
            if c.get(key) and not getattr(ct, field):
                setattr(ct, field, c[key])
                filled.append(label)
        await db.commit()
        return {"texte": f"Fiche de {ct.first_name} {ct.last_name} complétée ({', '.join(filled)})" if filled
                else f"{ct.first_name} {ct.last_name} avait déjà tout : rien à compléter", "chemin": f"/contacts/{ct.id}"}
    from app.api.v1.endpoints.contacts import create_contact
    from app.api.v1.endpoints.companies import create_company
    from app.schemas.contact import ContactCreate
    from app.schemas.company import CompanyCreate
    comp_id = uuid.UUID(a["compagnie_id"]) if a.get("compagnie_id") else None
    if not comp_id and c.get("compagnie"):
        comp = await create_company(CompanyCreate(name=c["compagnie"], website=c.get("site"), allow_duplicate=True), db, user)
        comp_id = comp.id
    ct = await create_contact(ContactCreate(first_name=c.get("prenom") or "", last_name=c.get("nom") or "", email=c.get("courriel"),
                                            phone=c.get("telephone"), mobile=c.get("cellulaire"), allow_duplicate=True,
                                            notes_internal=f"Créé d'après une carte d'affaires déposée sur Zéko{(' — ' + c['fonction']) if c.get('fonction') else ''}"),
                              db, user)
    if comp_id:
        db.add(ContactCompany(contact_id=ct.id, company_id=comp_id, email=c.get("courriel"), is_primary=True))
        await db.commit()
    return {"texte": f"Contact {ct.first_name} {ct.last_name} créé" + (f" chez {a.get('compagnie') or c.get('compagnie')}" if comp_id else ""),
            "chemin": f"/contacts/{ct.id}"}


async def other(db, d: ZekoDrop, where: str | None) -> None:
    """« Autre » : 1re fois, nouvelle analyse sans la reponse refusee ; ensuite, il faut dire ou il va."""
    a = d.analysis or {}
    if d.status not in ("ready", "failed"):
        raise HTTPException(status_code=400, detail="Zéko analyse encore ce document")
    if a.get("type"):
        d.rejected = (d.rejected or []) + [{"type": a.get("type"), "cible": a.get("compagnie") or a.get("contact")}]
    if where and where.strip():
        d.instruction = where.strip()[:1000]
    elif len(d.rejected or []) >= 2:
        raise HTTPException(status_code=400, detail="Dis-moi où va ce document")
    d.status, d.analysis, d.error = "pending", None, None
    await db.commit()
