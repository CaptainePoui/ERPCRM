"""Journal des actions de tout ERPCRM (TASK-049, 2026-10-09).

Philippe : « je veux avoir un log pour toutes les manips, comme ça on peut investiguer ou tout savoir de qui a fait quoi…
pareil que les logs du portail client : s'il modifie, c'est logué ».

L'inscription se fait toute seule, au niveau de la base (evenements SQLAlchemy), pas action par action : chaque objet
cree, modifie (champ par champ, ancien -> nouveau) ou supprime est inscrit dans entity_logs, avec qui l'a fait (employe,
client du portail, ou automatique / SIPV) ; un nouveau module est couvert sans rien ajouter. Jamais de mot de passe ni
de secret (« modifié », sans la valeur), ni le va-et-vient technique (copie automatique des courriels, suivi des boites).
Les fiches compagnie/contact gardent leurs entrees ecrites a la main (lisibles, « annuler ce changement ») : l'entree
automatique du meme champ n'est alors pas doublee.
"""
from __future__ import annotations

import enum
import re
import uuid
from contextvars import ContextVar
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

# Qui fait l'action : rempli par la connexion (auth.get_current_user, portal.get_portal_user) pour la requete en cours ;
# vide = travail automatique (courriels, rappels, factures periodiques...).
_actor: ContextVar[dict | None] = ContextVar("audit_actor", default=None)


def _ctx() -> dict:
    d = _actor.get()
    if d is None:
        d = {}
        _actor.set(d)
    return d


def set_user(user_id) -> None:
    _ctx().update(user_id=user_id, portal_user_id=None, source="ecran")


def set_portal_user(portal_user_id) -> None:
    _ctx().update(user_id=None, portal_user_id=portal_user_id, source="portail")


def set_service(name: str = "sipv") -> None:
    _ctx().update(user_id=None, portal_user_id=None, source=name)


WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
MAX_BODY = 8192


class ActorMiddleware:
    """Un « qui » neuf pour chaque requete (ASGI pur : la requete et ses dependances partagent ce meme dict).

    Une action reussie d'un employe ou d'un client du portail qui ne change rien dans la base d'ERPCRM (ex. son poste ou
    sa boite vocale, gardes dans SIPV) est inscrite quand meme : « quoi » = l'action et ce qui a ete envoye (sans secret)."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        d: dict = {}
        token = _actor.set(d)
        method = scope.get("method", "GET")
        body = bytearray()
        status: dict = {}

        async def recv():
            msg = await receive()
            if method in WRITE_METHODS and msg["type"] == "http.request" and len(body) < MAX_BODY:
                body.extend(msg.get("body", b"")[: MAX_BODY - len(body)])
            return msg

        async def snd(msg):
            if msg["type"] == "http.response.start":
                status["code"] = msg["status"]
            await send(msg)

        try:
            await self.app(scope, recv, snd)
        finally:
            _actor.reset(token)
        if method in WRITE_METHODS and status.get("code", 500) < 400 and not d.get("logged") and d.get("source") in ("ecran", "portail"):
            headers = {k.decode().lower(): v.decode(errors="replace") for k, v in scope.get("headers", [])}
            try:
                await _log_request(d, method, scope.get("path", ""), headers.get("content-type", ""), bytes(body))
            except Exception as e:                      # le journal ne doit jamais casser une action deja faite
                print(f"[audit] action non inscrite ({method} {scope.get('path')}): {e}")


def _mask(v):
    if isinstance(v, dict):
        return {k: ("•••" if _SECRET.search(str(k)) and v[k] not in (None, "") else _mask(x)) for k, x in v.items()}
    if isinstance(v, list):
        return [_mask(x) for x in v]
    return v


async def _log_request(d: dict, method: str, path: str, ctype: str, body: bytes) -> None:
    import json
    from app.core.database import AsyncSessionLocal
    from app.models.entity_log import EntityLog
    sent = None
    if "multipart" in ctype:
        sent = "(formulaire avec fichier)"
    elif body:
        try:
            sent = json.dumps(_mask(json.loads(body)), ensure_ascii=False)
        except Exception:
            sent = "(contenu non lisible)"
    if sent and len(sent) > MAX_VALUE:
        sent = sent[:MAX_VALUE] + "…"
    row = _row({"user_id": d.get("user_id"), "portal_user_id": d.get("portal_user_id"), "source": d.get("source")},
               "requete", None, "request", new=sent, description=f"{method} {path.removeprefix('/api/v1')}",
               now=datetime.now(timezone.utc))
    async with AsyncSessionLocal() as s:
        await s.execute(EntityLog.__table__.insert(), [row])
        await s.commit()


def _note_logged(n: int) -> None:
    d = _actor.get()
    if d is not None:
        d["logged"] = d.get("logged", 0) + n


def _who() -> dict:
    d = _actor.get() or {}
    return {"user_id": d.get("user_id"), "portal_user_id": d.get("portal_user_id"), "source": d.get("source") or "automatique"}


# ── Ce qui n'est pas inscrit ──────────────────────────────────────────────────
SKIP_TABLES = {"entity_logs", "alembic_version", "backup_run_logs", "backup_cycles", "cdr_report_run_logs", "email_opens", "telephony_locks"}
SKIP_WHEN_AUTOMATIC = {"mail_messages"}           # copie automatique des courriels ; un courriel envoye ou classe par quelqu'un est inscrit
SKIP_COLUMNS = {"created_at", "updated_at"}
INTERNAL_TABLES = {"entities"}                   # base commune compagnie/contact : la fiche elle-meme est inscrite
SKIP_TABLE_COLUMNS = {
    "mailboxes": {"uidvalidity", "last_uid", "last_sync_at", "sync_error", "last_check_at", "last_error"},
    "mail_messages": {"is_read", "flag_pending", "signature_status"},   # lu/non lu = consultation, pas une modification
}
_SECRET = re.compile(r"(password|passwd|secret|token|hash|_enc$|api_key|private|(^|_)pin($|_)|passcode)", re.I)
MAX_VALUE = 1000
GROUP_OVER = 25                                    # plus de 25 creations/suppressions d'une meme sorte d'un coup -> une ligne resume
_LABEL_ATTRS = ("number", "name", "title", "subject", "full_name", "email", "description", "key", "filename", "label")


def _fmt(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, enum.Enum):
        v = v.value
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"(fichier, {len(v)} octets)"
    s = str(v) if not isinstance(v, (Decimal, uuid.UUID)) else str(v)
    return s if len(s) <= MAX_VALUE else s[:MAX_VALUE] + "…"


def _secret(table: str, field: str, obj=None) -> bool:
    if _SECRET.search(field):
        return True
    return table == "app_settings" and field == "value" and bool(_SECRET.search(getattr(obj, "key", "") or ""))


def _label(obj) -> str | None:
    get = obj.get if isinstance(obj, dict) else (lambda a: getattr(obj, a, None))
    if get("first_name") is not None or get("last_name") is not None:
        return f"{get('first_name') or ''} {get('last_name') or ''}".strip() or None
    for a in _LABEL_ATTRS:
        v = get(a)
        if isinstance(v, str) and v.strip():
            return v.strip()[:200]
    return None


def _key(obj, mapper) -> str | None:
    pk = mapper.primary_key_from_instance(obj)
    if not pk or any(p is None for p in pk):
        return None
    return str(pk[0]) if len(pk) == 1 else "/".join(str(p) for p in pk)


def _entity_id(obj):
    from app.models.company import Company
    from app.models.contact import Contact
    return obj.id if isinstance(obj, (Company, Contact)) else None


def _row(who, table, object_id, action, *, field=None, old=None, new=None, description=None, entity_id=None, now=None):
    return {"id": uuid.uuid4(), "entity_id": entity_id, "contact_id": None, "user_id": who["user_id"],
            "portal_user_id": who["portal_user_id"], "source": who["source"], "action": action, "field_name": field,
            "old_value": old, "new_value": new, "description": description, "object_type": table, "object_id": object_id,
            "created_at": now}


def _skip_table(table: str, who: dict, bulk: bool = False) -> bool:
    return table in SKIP_TABLES or (table in INTERNAL_TABLES and not bulk) or (table in SKIP_WHEN_AUTOMATIC and who["source"] == "automatique")


@event.listens_for(Session, "after_flush")
def _after_flush(session, flush_context):
    from app.models.entity_log import EntityLog
    who = _who()
    now = datetime.now(timezone.utc)
    # entrees ecrites a la main dans ce meme envoi (fiches compagnie/contact) : on ne les double pas
    manual = [o for o in session.new if isinstance(o, EntityLog)]
    hand = {(o.entity_id, o.field_name) for o in manual}
    hand_created = {o.entity_id for o in manual if o.action == "created"}
    rows: list[dict] = []
    created: dict[str, list] = {}
    deleted: dict[str, list] = {}

    for obj in session.new:
        if isinstance(obj, EntityLog):
            continue
        mapper = inspect(obj).mapper
        table = mapper.persist_selectable.name
        if _skip_table(table, who) or _entity_id(obj) in hand_created and _entity_id(obj) is not None:
            continue
        created.setdefault(table, []).append(obj)

    for obj in session.deleted:
        mapper = inspect(obj).mapper
        table = mapper.persist_selectable.name
        if not _skip_table(table, who):
            deleted.setdefault(table, []).append(obj)

    for kind, groups in (("created", created), ("deleted", deleted)):
        for table, objs in groups.items():
            if len(objs) > GROUP_OVER:
                labels = [l for l in (_label(o) for o in objs[:20]) if l]
                rows.append(_row(who, table, None, kind, now=now,
                                 description=f"{len(objs)} lignes " + ("créées" if kind == "created" else "supprimées")
                                 + (f" : {', '.join(labels)}…" if labels else "")))
                continue
            for o in objs:
                m = inspect(o).mapper
                # une fiche supprimee n'existe plus : la ligne garde seulement sa sorte et sa cle
                rows.append(_row(who, table, _key(o, m), kind, description=_label(o),
                                 entity_id=_entity_id(o) if kind == "created" else None, now=now))

    for obj in session.dirty:
        if not session.is_modified(obj, include_collections=False):
            continue
        state = inspect(obj)
        mapper = state.mapper
        table = mapper.persist_selectable.name
        if _skip_table(table, who):
            continue
        skip_cols = SKIP_COLUMNS | SKIP_TABLE_COLUMNS.get(table, set())
        ent = _entity_id(obj)
        oid = _key(obj, mapper)
        for attr in mapper.column_attrs:
            if attr.key in skip_cols or (ent is not None and (ent, attr.key) in hand):
                continue
            hist = state.attrs[attr.key].history
            if not hist.has_changes():
                continue
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            if old == new:
                continue
            field = attr.key if table != "app_settings" else (getattr(obj, "key", None) or attr.key)
            if _secret(table, attr.key, obj):
                rows.append(_row(who, table, oid, "field_change", field=field, description="Modifié (valeur secrète, non inscrite)",
                                 entity_id=ent, now=now))
            else:
                rows.append(_row(who, table, oid, "field_change", field=field, old=_fmt(old), new=_fmt(new), entity_id=ent, now=now))

    conn = session.connection()
    if rows or manual:
        _note_logged(len(rows) + len(manual))
    if rows:
        conn.execute(EntityLog.__table__.insert(), rows)
    # entrees ecrites a la main : qui (employe ou automatique) et sur quelle fiche
    if manual:
        from sqlalchemy import text
        conn.execute(text("""UPDATE entity_logs l SET object_type = CASE e.entity_type WHEN 'company' THEN 'companies' ELSE 'contacts' END,
                                    object_id = l.entity_id::text,
                                    source = CASE WHEN l.user_id IS NULL THEN :src ELSE 'ecran' END,
                                    portal_user_id = COALESCE(l.portal_user_id, :pu)
                             FROM entities e WHERE e.id = l.entity_id AND l.id = ANY(:ids) AND l.object_type IS NULL"""),
                     {"ids": [o.id for o in manual], "src": who["source"], "pu": who["portal_user_id"]})


@event.listens_for(Session, "do_orm_execute")
def _bulk(state):
    """Modification ou suppression « en lot » (update()/delete() sans passer par les objets) : les lignes visees sont lues
    avant, pour inscrire ce qui change."""
    if not (state.is_update or state.is_delete) or state.execution_options.get("_audit_skip"):
        return
    from app.models.entity_log import EntityLog
    stmt = state.statement
    from app.core.database import Base
    table = Base.metadata.tables.get(stmt.table.name, stmt.table)     # la table elle-meme (pas sa version annotee par l'ORM)
    who = _who()
    if _skip_table(table.name, who, bulk=True) or stmt.whereclause is None:
        return
    now = datetime.now(timezone.utc)
    names = [c.name for c in table.c]
    found = [dict(zip(names, row))
             for row in state.session.execute(select(table).where(stmt.whereclause).limit(500),
                                              execution_options={"_audit_skip": True}).all()]
    pk = [c.name for c in table.primary_key.columns]
    rows = []
    for r in found:
        oid = "/".join(str(r[c]) for c in pk) if pk else None
        ent = r.get("id") if table.name in ("companies", "contacts") else None
        if state.is_delete:
            label, kind = _label(r), table.name
            if table.name == "entities":          # fiche compagnie/contact supprimee par sa base : retrouver son nom
                from app.models.company import Company
                from app.models.contact import Contact
                for model in (Contact, Company):
                    t = model.__table__
                    hit = state.session.execute(select(t).where(t.c.id == r["id"]), execution_options={"_audit_skip": True}).first()
                    if hit:
                        label, kind = _label(dict(zip([c.name for c in t.c], hit))), t.name
                        break
            rows.append(_row(who, kind, oid, "deleted", description=label, now=now))
            continue
        skip_cols = SKIP_COLUMNS | SKIP_TABLE_COLUMNS.get(table.name, set())
        for col, val in (stmt._values or {}).items():
            name = getattr(col, "key", None) or getattr(col, "name", None) or str(col)
            if name in skip_cols:
                continue
            new = getattr(val, "value", "(calculé)")
            old = r.get(name)
            if old == new:
                continue
            if _secret(table.name, name):
                rows.append(_row(who, table.name, oid, "field_change", field=name, description="Modifié (valeur secrète, non inscrite)", entity_id=ent, now=now))
            else:
                rows.append(_row(who, table.name, oid, "field_change", field=name, old=_fmt(old), new=_fmt(new), entity_id=ent, now=now))
    if rows:
        _note_logged(len(rows))
        state.session.connection().execute(EntityLog.__table__.insert(), rows)
