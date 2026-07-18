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
    SIPV_API_URL: str = "http://192.168.1.55:8020"
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

    class Config:
        env_file = ".env"


settings = Settings()
