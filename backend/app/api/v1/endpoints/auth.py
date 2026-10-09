from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Header, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from jose import JWTError
from app.core.database import get_db
from app.core import audit
from app.core.config import settings
from app.core.security import verify_password, create_access_token, decode_token, hash_password
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserMe

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(func.lower(User.email) == (payload.email or "").strip().lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")

    audit.set_user(user.id)          # la connexion est inscrite au nom de la personne
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    expires = 60 * 24 * 30 if payload.remember_me else 480
    token = create_access_token({"sub": str(user.id), "role": user.role.value}, expires_minutes=expires)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        full_name=user.full_name,
        role=user.role,
    )


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")

    audit.set_user(user.id)          # journal des actions (TASK-049) : qui fait cette requete
    return user


async def get_current_user_media(
    token_header: str | None = Depends(oauth2_scheme_optional),
    token: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Comme get_current_user, mais accepte aussi le token en query param
    (?token=...) -- necessaire pour les balises <audio src="..."> natives,
    qui ne peuvent pas envoyer d'en-tete Authorization. Utilise UNIQUEMENT
    pour servir des fichiers audio en lecture (jamais pour muter des
    donnees)."""
    real_token = token_header or token
    if not real_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Non authentifié")
    try:
        payload = decode_token(real_token)
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
    return user


async def get_current_user_or_service(
    token: str | None = Depends(oauth2_scheme_optional),
    x_api_key: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """
    Accepte soit un JWT utilisateur normal, soit la cle de service SIPV (X-Api-Key).
    Retourne un User pour un login normal, None pour un appel de service (SIPV).
    Utilise sur les endpoints que SIPV doit pouvoir appeler sans compte utilisateur.
    """
    if x_api_key:
        if not settings.SIPV_API_KEY or x_api_key != settings.SIPV_API_KEY:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Cle API invalide")
        audit.set_service("sipv")
        return None
    if token:
        try:
            payload = decode_token(token)
            user_id = payload.get("sub")
        except JWTError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur introuvable")
        audit.set_user(user.id)
        return user
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentification requise")


@router.get("/me", response_model=UserMe)
async def me(current_user: User = Depends(get_current_user)):
    return UserMe(
        id=str(current_user.id),
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
    )


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/change-password")
async def change_password(payload: PasswordChange, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Chaque utilisateur change son propre mot de passe (en haut a droite, clic sur son nom -- 2026-10-09)."""
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    new = payload.new_password
    if len(new) < 10:
        raise HTTPException(status_code=400, detail="Au moins 10 caractères")
    if new == payload.current_password:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit être différent de l'actuel")
    user.hashed_password = hash_password(new)
    await db.commit()
    return {"ok": True}
