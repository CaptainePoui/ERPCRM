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
