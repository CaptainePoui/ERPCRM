from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str
    DATABASE_URL_SYNC: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    API_PORT: int = 8010
    ENVIRONMENT: str = "development"
    # Network — change these when migrating servers
    ERPCRM_HOST: str = "192.168.1.9"
    # URL publique HTTPS (Nginx + Let's Encrypt, TASK infrastructure de suivi) --
    # utilisee pour construire les URLs absolues du pixel de suivi d'ouverture,
    # doit etre joignable depuis Internet par le client courriel du destinataire.
    PUBLIC_BASE_URL: str = "https://portail.simpleip.tel"
    SIPV_API_URL: str = "https://192.168.1.55:8022"
    SIPV_API_KEY: str = ""  # cle que SIPV doit presenter en X-Api-Key pour appeler ERPCRM
    ERPCRM_API_KEY: str = ""  # cle que ERPCRM doit presenter en X-Api-Key pour appeler SIPV
    # Email SMTP (optional — if SMTP_HOST is empty, sending is silently skipped)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "Simple IP Support"
    SMTP_STARTTLS: bool = True
    # Email IMAP (optional — if IMAP_HOST is empty, poller is disabled)
    IMAP_HOST: str = ""
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    # Google Calendar (optional — si aucun refresh token n'est connecte (via le
    # bouton Admin > Google Calendar), la synchro est silencieusement ignoree :
    # lecture des plages occupees retourne vide, creation d'evenement retourne
    # None. Module RDV en ligne, TASK-026. Le refresh token lui-meme n'est PAS un
    # .env -- il est obtenu via le flux OAuth natif et stocke chiffre en base
    # (app_settings), voir app/core/google_calendar.py + endpoints/google_oauth.py.
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    ENCRYPTION_KEY: str = ""  # cle Fernet pour chiffrer le refresh token Google au repos
    # Backup cloud infra (TASK-035) -- Dropbox App Key/Secret (dropbox.com/developers/apps).
    # Google Drive reutilise GOOGLE_CLIENT_ID/SECRET ci-dessus (meme projet Google Cloud,
    # scope supplementaire drive.file) -- pas de credentials separes necessaires.
    DROPBOX_CLIENT_ID: str = ""
    DROPBOX_CLIENT_SECRET: str = ""
    # Voicebox (TTS local, TASK-029) -- conteneur Docker sur ce meme serveur,
    # port 17600 sur l'hote -> 17493 dans le conteneur, lie a 127.0.0.1 uniquement.
    VOICEBOX_API_URL: str = "http://127.0.0.1:17600"

    class Config:
        env_file = ".env"


settings = Settings()
