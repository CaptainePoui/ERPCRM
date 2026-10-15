"""Pieces attachees aux encaissements (TASK-005.24 / TASK-042.8, 2026-10-15) : cheques numerises de Philippe
(« c'est cool de les avoir dans ERPCRM aussi » ; « on devrait les mettre dans paiement lié au client »).

Fichier dans storage/payment_documents/<id du document>.<ext> (hors du dossier public /uploads, inclus dans la
sauvegarde) ; jamais montre au portail (le cheque porte le numero de compte bancaire du client).
"""
import uuid
from pathlib import Path

DOCS_DIR = Path(__file__).resolve().parents[2] / "storage" / "payment_documents"
TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf"}


def save(db, payment_id, data: bytes, ext: str, original_name: str | None = None, kind: str = "cheque"):
    """Ecrit le fichier et ajoute le PaymentDocument (sans commit)."""
    from app.models.client_payment import PaymentDocument
    ext = ext.lower() if ext.lower() in TYPES else ".jpg"
    doc_id = uuid.uuid4()
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{doc_id}{ext}"
    (DOCS_DIR / name).write_bytes(data)
    doc = PaymentDocument(id=doc_id, payment_id=payment_id, kind=kind, filename=name, original_name=(original_name or "")[:255] or None)
    db.add(doc)
    return doc


def path_of(doc) -> Path:
    return DOCS_DIR / Path(doc.filename).name          # jamais de chemin fourni de l'exterieur


def media_type(doc) -> str:
    return TYPES.get(Path(doc.filename).suffix.lower(), "application/octet-stream")
