"""Images et fichiers colles dans la conversation d'un ticket (TASK-006.5, 2026-10-17).

Fichier dans storage/ticket_attachments/<id>.<ext> (hors du dossier public, inclus dans la sauvegarde) ;
lu seulement par l'API avec le jeton.
"""
import uuid
from pathlib import Path

DIR = Path(__file__).resolve().parents[2] / "storage" / "ticket_attachments"
MAX_BYTES = 15 * 1024 * 1024
TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
         ".pdf": "application/pdf", ".txt": "text/plain", ".log": "text/plain"}
EXT_OF = {v: k for k, v in reversed(list(TYPES.items()))}


def save(db, message_id, data: bytes, original_name: str | None, content_type: str | None):
    """Ecrit le fichier et ajoute le TicketAttachment (sans commit)."""
    from app.models.ticket import TicketAttachment
    ext = Path(original_name or "").suffix.lower()
    if ext not in TYPES:
        ext = EXT_OF.get((content_type or "").lower(), ".bin")
    att_id = uuid.uuid4()
    DIR.mkdir(parents=True, exist_ok=True)
    name = f"{att_id}{ext}"
    (DIR / name).write_bytes(data)
    att = TicketAttachment(id=att_id, message_id=message_id, filename=name, original_name=(original_name or "")[:255] or None,
                           media_type=TYPES.get(ext, "application/octet-stream"), size=len(data))
    db.add(att)
    return att


def path_of(att) -> Path:
    return DIR / Path(att.filename).name          # jamais de chemin fourni de l'exterieur


def remove(att) -> None:
    try:
        path_of(att).unlink()
    except FileNotFoundError:
        pass
