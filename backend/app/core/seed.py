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
]

DEFAULT_STATUSES = [
    {"name": "client",          "color": "#184FA0", "is_system": True},
    {"name": "prospect",        "color": "#1C51A5", "is_system": True},
    {"name": "fournisseur",     "color": "#6B7280", "is_system": True},
    {"name": "vendeur",         "color": "#8B5CF6", "is_system": True},
    {"name": "mauvais payeur",  "color": "#DC2626", "is_system": True},
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

    for data in DEFAULT_STATUSES:
        result = await db.execute(select(Status).where(Status.name == data["name"]))
        if not result.scalar_one_or_none():
            db.add(Status(**data))

    for name in DEFAULT_FUNCTIONS:
        result = await db.execute(select(Function).where(Function.name == name))
        if not result.scalar_one_or_none():
            db.add(Function(name=name))

    result = await db.execute(select(User).where(User.email == "admin@simpleip.ca"))
    if not result.scalar_one_or_none():
        db.add(User(
            email="admin@simpleip.ca",
            full_name="Administrateur",
            hashed_password=hash_password("SimpleIP2026!"),
            role=UserRole.admin,
        ))

    result = await db.execute(select(User).where(User.email == "philippe@simpleip.ca"))
    if not result.scalar_one_or_none():
        db.add(User(
            email="philippe@simpleip.ca",
            full_name="Philippe Normandeau",
            hashed_password=hash_password("SimpleIP2026!"),
            role=UserRole.manager,
        ))

    await db.commit()
