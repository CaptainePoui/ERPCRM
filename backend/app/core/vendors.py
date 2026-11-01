"""Un fournisseur = une compagnie avec la pastille « fournisseur » (TASK-044.6, Philippe 2026-11-01 : « pourquoi ce n'est
pas dans Compagnies, avec la pastille fournisseur ? Parce qu'ils peuvent être clients. On garde l'onglet Achats ->
Fournisseurs, mais c'est juste un filtre, pas une catégorie à part »).

La fiche `vendors` reste la partie comptable du fournisseur (catégorie de dépense par défaut, notes, actif), liée une pour
une à sa compagnie (index unique sur `vendors.company_id`) : les factures, dépenses, paiements, avoirs, transactions et
règles de la banque, commissions continuent de pointer vers elle, rien de l'historique ne bouge. Son nom suit celui de la
compagnie. Une fiche sans compagnie (ancienne, désactivée) reste lisible, jamais supprimée."""
import uuid

from sqlalchemy import func, select, text, update

from app.models.company import Company
from app.models.entity import Entity, EntityType
from app.models.entity_log import EntityLog
from app.models.purchases import Vendor
from app.models.status import EntityStatus, Status

SUPPLIER = "fournisseur"

# Tout ce qui pointe vers une fiche fournisseur (fusion de deux fournisseurs)
VENDOR_REFS = [("expenses", "vendor_id"), ("recurring_expenses", "vendor_id"), ("bills", "vendor_id"),
               ("recurring_bills", "vendor_id"), ("vendor_payments", "vendor_id"), ("vendor_credits", "vendor_id"),
               ("bank_transactions", "vendor_id"), ("bank_payee_rules", "vendor_id"), ("sales_reps", "vendor_id")]


async def supplier_status_id(db) -> uuid.UUID | None:
    """La pastille « fournisseur » (pastille de base, is_system : son nom ne change pas sans le vouloir)."""
    return (await db.execute(select(Status.id).where(func.lower(Status.name) == SUPPLIER))).scalar()


async def supplier_company_ids(db) -> set[uuid.UUID]:
    sid = await supplier_status_id(db)
    if not sid:
        return set()
    return set((await db.execute(select(EntityStatus.entity_id).where(EntityStatus.status_id == sid))).scalars().all())


async def _free_name(db, name: str, company: Company, exclude: uuid.UUID | None = None) -> str:
    """vendors.name est unique : si une autre fiche porte deja ce nom, on ajoute le numero de compte."""
    q = select(Vendor.id).where(func.lower(Vendor.name) == name.lower())
    if exclude:
        q = q.where(Vendor.id != exclude)
    if not (await db.execute(q)).first():
        return name[:255]
    return f"{name} ({company.account_number or str(company.id)[:8]})"[:255]


async def ensure_vendor(db, company: Company) -> Vendor:
    """La fiche fournisseur de cette compagnie ; une fiche sans compagnie au meme nom est reliee (fournisseur importe
    avant la compagnie), sinon une fiche est creee. Ne fait pas le commit."""
    v = (await db.execute(select(Vendor).where(Vendor.company_id == company.id))).scalar_one_or_none()
    if v:
        return v
    v = (await db.execute(select(Vendor).where(Vendor.company_id.is_(None),
                                               func.lower(Vendor.name) == company.name.strip().lower()))).scalar_one_or_none()
    if v:
        v.company_id = company.id
        v.is_active = True
    else:
        v = Vendor(name=await _free_name(db, company.name.strip(), company), company_id=company.id)
        db.add(v)
    await db.flush()
    return v


async def add_supplier_status(db, company: Company, user_id=None) -> None:
    """Pose la pastille « fournisseur » (et la fiche comptable). Ne fait pas le commit."""
    sid = await supplier_status_id(db)
    if sid and not (await db.execute(select(EntityStatus).where(EntityStatus.entity_id == company.id,
                                                                EntityStatus.status_id == sid))).scalar_one_or_none():
        db.add(EntityStatus(entity_id=company.id, status_id=sid))
        db.add(EntityLog(entity_id=company.id, user_id=user_id, action="status_added",
                         description="Pastille « fournisseur » ajoutée"))
    await ensure_vendor(db, company)


async def new_supplier_company(db, name: str, user_id=None) -> Company:
    """Nouveau fournisseur tape dans Achats (ou lu sur un recu) : la compagnie au meme nom s'il y en a une (sans egard a la
    casse), sinon une nouvelle compagnie, avec la pastille. Ne fait pas le commit."""
    from app.core import account_numbers
    name = name.strip()[:255]
    co = (await db.execute(select(Company).where(func.lower(Company.name) == name.lower())
                           .order_by(Company.is_active.desc(), Company.account_number))).scalars().first()
    if not co:
        entity = Entity(entity_type=EntityType.company)
        db.add(entity)
        await db.flush()
        co = Company(id=entity.id, name=name, account_number=await account_numbers.assign(db))
        db.add(co)
        db.add(EntityLog(entity_id=co.id, user_id=user_id, action="created",
                         description=f"Compagnie « {name} » créée comme fournisseur"))
        await db.flush()
    await add_supplier_status(db, co, user_id)
    return co


async def sync_name(db, company: Company) -> None:
    """Le nom de la fiche fournisseur suit celui de la compagnie (renommage, fusion). Ne fait pas le commit."""
    v = (await db.execute(select(Vendor).where(Vendor.company_id == company.id))).scalar_one_or_none()
    if v and v.name != company.name:
        v.name = await _free_name(db, company.name.strip(), company, exclude=v.id)
        await db.flush()


async def merge_vendor_of(db, keep: Company, drop: Company) -> None:
    """Fusion de compagnies : si les deux sont fournisseurs, tout ce qui pointait vers la fiche de l'autre passe a celle
    qu'on garde ; l'autre fiche est desactivee et detachee (jamais supprimee). Avant le deplacement de vendors.company_id."""
    kv = (await db.execute(select(Vendor).where(Vendor.company_id == keep.id))).scalar_one_or_none()
    dv = (await db.execute(select(Vendor).where(Vendor.company_id == drop.id))).scalar_one_or_none()
    if not (kv and dv):
        return
    for table, col in VENDOR_REFS:
        await db.execute(text(f"update {table} set {col} = :k where {col} = :d"), {"k": kv.id, "d": dv.id})
    if not kv.default_category_id and dv.default_category_id:
        kv.default_category_id = dv.default_category_id
    if dv.notes:
        kv.notes = "\n\n".join(x for x in (kv.notes, f"(Fusionné, notes de {dv.name}) {dv.notes}") if x)
    await db.execute(update(Vendor).where(Vendor.id == dv.id).values(
        company_id=None, is_active=False, notes=f"Fusionné dans « {kv.name} »"))
    await db.flush()
