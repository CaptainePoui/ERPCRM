"""Privileges des employes (TASK-007.4, 2026-10-25).

Chaque section d'ERPCRM se voit (lecture) ou se modifie (tout le reste). Un profil (Administration > Privileges) dit ce
qu'il permet ; chaque employe a un profil et ses exceptions (Employes > Privileges). Le verrou est ici, cote serveur, sur
TOUTES les routes (avant : quelques routes seulement verifiaient le role, et le menu etait le meme pour tous).

Une nouvelle section d'ERPCRM = une ligne dans SECTIONS et ses chemins dans _ROUTES ; un chemin inconnu est reserve a
l'Administration (jamais ouvert par oubli).
"""
import re
import uuid

from fastapi import HTTPException, Request
from jose import JWTError
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import decode_token

AUCUN, VOIR, MODIFIER = "aucun", "voir", "modifier"
_RANG = {AUCUN: 0, VOIR: 1, MODIFIER: 2}

# (cle, libelle, explication) -- l'ordre est celui de l'ecran
SECTIONS = [
    ("clients", "Compagnies et contacts", "fiches des clients, leurs contacts, équipements, anciennes infos"),
    ("acces_clients", "Accès des clients", "mots de passe et accès conservés pour les clients"),
    ("telephonie", "Téléphonie des clients", "postes, numéros, IVR, groupes, provisionnement, migrations"),
    ("tickets", "Tickets", "tickets, temps, conversations enregistrées"),
    ("courriels", "Courriels", "boîtes de courriel partagées"),
    ("catalogue", "Catalogue", "articles, services, boutique"),
    ("ventes", "Ventes", "devis, factures, factures périodiques, paiements reçus, avoirs, troc"),
    ("achats", "Achats", "fournisseurs, dépenses, factures fournisseurs, paiements effectués"),
    ("banque", "Banque", "comptes, relevés, règles de la banque"),
    ("fiscalite", "Fiscalité", "taxes, déclarations, rajustements"),
    ("commandes", "Commandes", "commandes aux fournisseurs"),
    ("employes", "Employés", "fiches des employés"),
    ("salaires", "Salaires", "paies des employés"),
    ("commissions", "Commissions des vendeurs", "ristournes, taux, soldes"),
    ("agenda", "Tâches et agenda", "tâches, agenda, rendez-vous"),
    ("zeko", "Zéko", "parler avec Zéko, ce qu'il a appris"),
    ("serveur", "Serveur", "serveurs téléphoniques, sauvegardes"),
    ("administration", "Administration", "utilisateurs, privilèges, réglages, journal, intégrations"),
]
KEYS = [k for k, _l, _e in SECTIONS]

# Chemin (apres /api/v1/) -> section ; le premier qui correspond gagne. None = libre pour tout employe connecte
# (sa propre session, recherche, listes de reference, routes du portail client / de SIPV qui ont leur propre acces).
_TEL = r"(sip-extensions?|extensions|ivrs|queues|ring-groups|paging-groups|parking-lots|pickup-groups|moh|button-templates|global-templates|key-catalog|phone-options|connectivity|phone-templates)"
_ROUTES = [
    (r"(auth|ref|search|track|sipv|billing|portal|rdv|speech|entities)(/|$)", None),
    (r"employees/me(/|$)", None),
    (r"google-calendar/callback", None),
    (r"zeko/status$", None),
    (r"tickets/timers/(heartbeat|active)$", None),     # presence de l'ecran ouvert et ses propres chronos
    (r"(admin/statuses|admin/payment-methods|settings)(/|$)", "lecture_libre"),
    (rf"companies/[^/]+/{_TEL}", "telephonie"),
    (r"companies/[^/]+/(recurring-billing|finance)", "ventes"),
    (r"contacts/[^/]+/(sip-extension|office-phone)", "telephonie"),
    (r"(companies|contacts|former-infos|equipment)(/|$)", "clients"),
    (r"maintenance(/|$)", "acces_clients"),
    (r"(telephony|migration)(/|$)", "telephonie"),
    (r"(catalogue|ecom)(/|$)", "catalogue"),
    (r"(invoices|recurring-billing|payments|devis|barter)(/|$)", "ventes"),
    (r"zeko/tickets(/|$)", "tickets"),
    (r"(tickets|conversations)(/|$)", "tickets"),
    (r"zeko/(conversations|projects|rules|proposals)(/|$)", "zeko"),
    (r"zeko(/|$)", "administration"),
    (r"mail(/|$)", "courriels"),
    (r"purchase-orders(/|$)", "commandes"),
    (r"purchases(/|$)", "achats"),
    (r"bank(/|$)", "banque"),
    (r"taxes(/|$)", "fiscalite"),
    (r"employees/[^/]+/(privileges|account)(/|$)", "administration"),
    (r"employees/payments(/|$)", "salaires"),
    (r"(employees/commissions|sales-reps)(/|$)", "commissions"),
    (r"employees(/|$)", "employes"),
    (r"(tasks|google-calendar)(/|$)", "agenda"),
    (r"(server|backup)(/|$)", "serveur"),
]
_ROUTES = [(re.compile(p), s) for p, s in _ROUTES]


def section_for(path: str, method: str) -> tuple[str | None, str]:
    """(section, niveau requis) pour une requete ; section None = libre."""
    p = path.split("/api/v1/", 1)[1] if "/api/v1/" in path else None
    if p is None:
        return None, VOIR
    lecture = method in ("GET", "HEAD", "OPTIONS")
    for rx, sec in _ROUTES:
        if rx.match(p):
            if sec == "lecture_libre":
                return (None, VOIR) if lecture else ("administration", MODIFIER)
            return sec, VOIR if lecture else MODIFIER
    return "administration", VOIR if lecture else MODIFIER


def effective(user, profile) -> dict:
    """{section: niveau} de cet employe : son profil, puis ses exceptions. Administrateur ou profil « Tout » = tout."""
    role = str(getattr(user.role, "value", user.role))
    if role == "admin" or (profile and profile.full_access):
        return {k: MODIFIER for k in KEYS}
    base = dict((profile.grants if profile else None) or {})
    base.update(user.privilege_overrides or {})
    return {k: base.get(k, AUCUN) if base.get(k) in _RANG else AUCUN for k in KEYS}


def allows(privs: dict, section: str, level: str = VOIR) -> bool:
    return _RANG.get(privs.get(section, AUCUN), 0) >= _RANG[level]


async def for_user_id(db, user_id) -> dict:
    from app.models.user import User
    from app.models.privilege import PrivilegeProfile
    user = await db.get(User, user_id) if user_id else None
    if not user:
        return {k: AUCUN for k in KEYS}
    profile = await db.get(PrivilegeProfile, user.privilege_profile_id) if user.privilege_profile_id else None
    return effective(user, profile)


def _token(request: Request) -> str | None:
    h = request.headers.get("authorization") or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return request.query_params.get("token")


async def guard(request: Request):
    """Dependance de toute l'application : refuse a un employe ce que ses privileges ne permettent pas. Les jetons qui
    ne sont pas ceux d'un employe (portail client, cle de service SIPV, aucun) passent : la route fait sa propre
    verification, comme avant."""
    section, level = section_for(request.url.path, request.method)
    if section is None:
        return
    tok = _token(request)
    if not tok:
        return
    try:
        sub = decode_token(tok).get("sub")
        uid = uuid.UUID(str(sub))
    except (JWTError, ValueError, TypeError, AttributeError):
        return
    async with AsyncSessionLocal() as db:
        from app.models.user import User
        if not await db.get(User, uid):
            return                       # pas un employe (ex. jeton du portail client)
        privs = await for_user_id(db, uid)
    if not allows(privs, section, level):
        label = next(l for k, l, _e in SECTIONS if k == section)
        raise HTTPException(status_code=403, detail=f"Tes privilèges ne permettent pas de {'modifier' if level == MODIFIER else 'voir'} : {label}")


async def ensure_someone_full(db):
    """Toujours au moins un compte actif avec tout (administrateur ou profil « Tout ») : on ne peut jamais se bloquer
    soi-meme hors d'ERPCRM. A appeler apres le changement, avant le commit."""
    from sqlalchemy import or_, func
    from app.models.user import User, UserRole
    from app.models.privilege import PrivilegeProfile
    await db.flush()
    n = (await db.execute(select(func.count()).select_from(User).outerjoin(PrivilegeProfile, PrivilegeProfile.id == User.privilege_profile_id)
                          .where(User.is_active.is_(True), or_(User.role == UserRole.admin, PrivilegeProfile.full_access.is_(True))))).scalar()
    if not n:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Il doit toujours rester au moins un compte actif qui a tout (profil « Tout ») : rien n'a été changé")
