"""Images collees, glissees ou choisies dans la conversation avec Zeko (TASK-006.18, Philippe 2026-11-01 : « je ne peux
pas copier cette image dans Zéko, il me semblait que j'allais pouvoir une fois avec ma carte GPU »).

Fichier dans storage/zeko_images/<id>.jpg|png (hors du dossier public, inclus dans la sauvegarde) ; lu seulement par
l'API avec le jeton, par la personne qui a acces a la conversation. Une grande image est reduite (MAX_SIDE) avant
d'etre gardee : le modele visuel n'en voit pas plus et la conversation reste legere.
"""
import base64
import io
import re
import uuid
from pathlib import Path

DIR = Path(__file__).resolve().parents[2] / "storage" / "zeko_images"
MAX_BYTES = 15 * 1024 * 1024          # avant reduction
MAX_PER_MESSAGE = 4
MAX_SIDE = 1600
_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp|gif));base64,(.+)$", re.S)
MEDIA = {".jpg": "image/jpeg", ".png": "image/png"}


def save(data_url: str) -> str:
    """Ecrit l'image (adresse data: du navigateur) et renvoie son nom de fichier. ValueError si ce n'est pas une image."""
    from PIL import Image, ImageOps
    m = _DATA_URL.match(data_url or "")
    if not m:
        raise ValueError("Seules les images (PNG, JPEG, WebP, GIF) sont acceptées")
    try:
        raw = base64.b64decode(m.group(2), validate=False)
    except ValueError:
        raise ValueError("Image illisible")
    if len(raw) > MAX_BYTES:
        raise ValueError("Image trop grosse (15 Mo maximum)")
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception:
        raise ValueError("Image illisible")
    img = ImageOps.exif_transpose(img)                 # photo de cellulaire : dans le bon sens
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    keep_alpha = img.mode in ("RGBA", "LA", "P") and m.group(1) != "image/jpeg"
    out = io.BytesIO()
    if keep_alpha:                                      # capture d'écran avec transparence : PNG
        img.convert("RGBA").save(out, "PNG", optimize=True)
        ext = ".png"
    else:
        img.convert("RGB").save(out, "JPEG", quality=88)
        ext = ".jpg"
    DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4()}{ext}"
    (DIR / name).write_bytes(out.getvalue())
    return name


def path_of(name: str) -> Path:
    return DIR / Path(name).name                        # jamais de chemin fourni de l'exterieur


def data_url(name: str) -> str | None:
    """L'image telle qu'envoyee au modele (format OpenAI image_url) ; None si le fichier n'existe plus."""
    p = path_of(name)
    if not p.exists():
        return None
    return f"data:{MEDIA.get(p.suffix, 'image/jpeg')};base64,{base64.b64encode(p.read_bytes()).decode()}"


def remove(names) -> None:
    for n in names or []:
        try:
            path_of(n).unlink()
        except FileNotFoundError:
            pass
