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


PHOTO = "photo:"      # TASK-024.2 : l'image est gardée dans les Photos de la compagnie, le ticket n'en garde que le lien


def save(db, message_id, data: bytes, original_name: str | None, content_type: str | None, ticket=None, user=None):
    """Ecrit le fichier et ajoute le TicketAttachment (sans commit).

    TASK-024.2 (Philippe 2026-11-03 : « les images des tickets se gardent dans Photos, comme ça le ticket n'est pas lourd,
    avec le nom de la photo avec les infos d'où elle a été copiée et la date ») : une IMAGE d'un ticket qui a une compagnie
    est enregistrée une seule fois, dans les Photos de la compagnie (légende : ticket, titre, date et heure, qui) ; la
    pièce jointe du ticket pointe ce fichier (filename « photo:<nom> »). Les autres fichiers (PDF, texte) restent ici."""
    from app.models.ticket import TicketAttachment
    ext = Path(original_name or "").suffix.lower()
    if ext not in TYPES:
        ext = EXT_OF.get((content_type or "").lower(), ".bin")
    att_id = uuid.uuid4()
    if ticket is not None and ticket.company_id and TYPES.get(ext, "").startswith("image/"):
        from datetime import datetime
        from app.api.v1.endpoints.companies import PHOTO_UPLOAD_DIR
        from app.core import clock
        from app.models.installation_photo import InstallationPhoto
        fname = f"ticket-{att_id}{ext}"
        (PHOTO_UPLOAD_DIR / fname).write_bytes(data)
        when = datetime.now(clock.business_tz()).strftime("%Y-%m-%d %H:%M")
        who = f" par {user.full_name}" if user is not None and getattr(user, "full_name", None) else ""
        db.add(InstallationPhoto(company_id=ticket.company_id, filename=fname, uploaded_by_id=getattr(user, "id", None),
                                 caption=f"Collée dans le ticket {ticket.number or ''} « {(ticket.title or '')[:80]} » le {when}{who}"
                                         + (f" ({original_name})" if original_name and not original_name.startswith("capture-") else "")))
        att = TicketAttachment(id=att_id, message_id=message_id, filename=PHOTO + fname, original_name=(original_name or "")[:255] or None,
                               media_type=TYPES.get(ext, "application/octet-stream"), size=len(data))
        db.add(att)
        return att
    DIR.mkdir(parents=True, exist_ok=True)
    name = f"{att_id}{ext}"
    (DIR / name).write_bytes(data)
    att = TicketAttachment(id=att_id, message_id=message_id, filename=name, original_name=(original_name or "")[:255] or None,
                           media_type=TYPES.get(ext, "application/octet-stream"), size=len(data))
    db.add(att)
    return att


def path_of(att) -> Path:
    if (att.filename or "").startswith(PHOTO):      # gardée dans les Photos de la compagnie (TASK-024.2)
        from app.api.v1.endpoints.companies import PHOTO_UPLOAD_DIR
        return PHOTO_UPLOAD_DIR / Path(att.filename[len(PHOTO):]).name
    return DIR / Path(att.filename).name          # jamais de chemin fourni de l'exterieur


def remove(att) -> None:
    if (att.filename or "").startswith(PHOTO):      # la photo reste dans les Photos de la compagnie
        return
    try:
        path_of(att).unlink()
    except FileNotFoundError:
        pass
