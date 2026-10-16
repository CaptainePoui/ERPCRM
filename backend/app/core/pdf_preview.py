"""Pages d'un PDF en images (affichage du document dans l'ecran, fiable partout, cellulaire compris)."""
import base64
import subprocess
import tempfile
from pathlib import Path


def pdf_pages(pdf_bytes: bytes, dpi: int = 110) -> list[str]:
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / "f.pdf").write_bytes(pdf_bytes)
        subprocess.run(["pdftoppm", "-r", str(dpi), "-png", f"{tmp}/f.pdf", f"{tmp}/p"], check=True, capture_output=True)
        return ["data:image/png;base64," + base64.b64encode(p.read_bytes()).decode() for p in sorted(Path(tmp).glob("p-*.png"))]


_CACHE = Path(__file__).resolve().parents[2] / "storage" / "preview_cache"


def cached_pdf_pages(key: str, pdf_bytes: bytes) -> list[str]:
    """Pages d'un PDF qui ne change jamais (original de l'ancien logiciel) : faites une fois, gardees sur disque."""
    import hashlib, json
    f = _CACHE / f"{hashlib.sha256((key + str(len(pdf_bytes))).encode()).hexdigest()}.json"
    if f.is_file():
        return json.loads(f.read_text())
    pages = pdf_pages(pdf_bytes)
    _CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(pages))
    return pages
