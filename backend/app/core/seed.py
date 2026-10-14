from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.status import Status
from app.models.function import Function
from app.models.user import User, UserRole
from app.models.payment import PaymentMethod
from app.core.security import hash_password


DEFAULT_PAYMENT_METHODS = [
    {"code": "cash",          "name": "Comptant",       "discount_rate": 0.0},
    {"code": "cheque",        "name": "Chèque",         "discount_rate": 0.0},
    {"code": "virement",      "name": "Virement",       "discount_rate": 0.0},
    {"code": "interac",       "name": "Interac",        "discount_rate": 0.0},
    {"code": "carte_credit",  "name": "Carte de crédit","discount_rate": 0.0},
    {"code": "elavon",        "name": "Elavon",         "discount_rate": 0.0},
    {"code": "authorizenet",  "name": "Authorize.Net",  "discount_rate": 0.0},
    {"code": "troc",          "name": "Troc",           "discount_rate": 0.0},   # echanges (TASK-005.13)
]

DEFAULT_STATUSES = [
    {"name": "client",          "color": "#184FA0", "is_system": True},
    {"name": "prospect",        "color": "#1C51A5", "is_system": True},
    {"name": "fournisseur",     "color": "#6B7280", "is_system": True},
    {"name": "vendeur",         "color": "#8B5CF6", "is_system": True},
    {"name": "mauvais payeur",  "color": "#DC2626", "is_system": True},
    {"name": "sous-traitant",          "color": "#D97706", "is_system": False},   # TASK-002.3
    {"name": "fournisseur internet",   "color": "#0891B2", "is_system": False},
    {"name": "réseau / informatique",  "color": "#059669", "is_system": False},
]

DEFAULT_FUNCTIONS = [
    "comptes payables",
    "comptes a recevoir",
    "technique",
    "TI",
    "administration",
    "securite",
    "reseau",
    "direction",
    "achats",
    "facturation",
    "proprietaire",
    "reception",
    "gestionnaire",
    "responsable telephonie",
    "responsable 911",
    "responsable informatique",
]


async def seed_defaults(db: AsyncSession) -> None:
    for data in DEFAULT_PAYMENT_METHODS:
        result = await db.execute(select(PaymentMethod).where(PaymentMethod.code == data["code"]))
        if not result.scalar_one_or_none():
            db.add(PaymentMethod(**data))

    # Pastilles de depart : seulement sur une installation neuve -- elles se gerent ensuite dans Administration ->
    # Pastilles (TASK-002.3) ; une pastille renommee ne doit pas revenir sous son ancien nom au redemarrage.
    if not (await db.execute(select(Status.id).limit(1))).first():
        for data in DEFAULT_STATUSES:
            db.add(Status(**data))

    # Compagnie du proprietaire (TASK-002.5) : sur une installation neuve (aucune compagnie), creee tout de suite --
    # ses coordonnees se remplissent dans Administration -> Entreprise ; jamais facturee
    from app.models.company import Company
    from app.models.entity import Entity, EntityType
    if not (await db.execute(select(Company.id).limit(1))).first():
        ent = Entity(entity_type=EntityType.company)
        db.add(ent)
        await db.flush()
        from app.core import account_numbers   # chaque compagnie a son numero (TASK-002.7)
        db.add(Company(id=ent.id, name="Mon entreprise", is_owner=True, account_number=await account_numbers.assign(db)))

    for name in DEFAULT_FUNCTIONS:
        result = await db.execute(select(Function).where(Function.name == name))
        if not result.scalar_one_or_none():
            db.add(Function(name=name))

    # Premier compte : seulement sur une installation neuve (aucun utilisateur). Jamais recree ensuite -- un compte
    # retire ou renomme ne doit pas revenir au redemarrage avec un mot de passe connu (2026-10-09). A changer des la
    # premiere connexion (clic sur son nom, en haut a droite).
    if not (await db.execute(select(User.id).limit(1))).first():
        db.add(User(
            email="admin@simpleip.ca",
            full_name="Administrateur",
            hashed_password=hash_password("SimpleIP2026!"),
            role=UserRole.admin,
        ))

    await db.commit()
