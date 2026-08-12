"""Chiffrement au repos (Fernet) pour les secrets stockes en base (ex: refresh
token Google Calendar) -- meme principe que le chiffrement des mots de passe de
trunk cote SIPV, mais implemente ici car ERPCRM n'a pas ce module."""
from cryptography.fernet import Fernet
from app.core.config import settings


def _fernet() -> Fernet:
    return Fernet(settings.ENCRYPTION_KEY.encode())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()
