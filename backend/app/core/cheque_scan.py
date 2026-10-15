"""Cheques numerises de Philippe (TASK-042.8, 2026-10-15) : une photo ou un PDF avec plusieurs cheques poses sur un
fond fonce -> une image par cheque, remise a l'endroit, et le texte imprime lu par Tesseract (local, sans IA).

Philippe : « je vais en faire des PDF de plusieurs chèques, est-ce que tu es capable de les séparer après (image) et
les mettre dans le fichier client ? ». Le jumelage au depot BNC se fait ensuite (montant + date), pas ici.
"""
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

MIN_AREA = 0.03          # un cheque couvre au moins 3 % de la page (le reste : poussiere, reflets, bords)


def pages_of(path: Path) -> list[np.ndarray]:
    """Images d'un fichier (photo ou PDF, une image par page, 200 dpi)."""
    if path.suffix.lower() != ".pdf":
        img = cv2.imread(str(path))
        return [img] if img is not None else []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", "200", "-png", str(path), f"{tmp}/p"], check=True, capture_output=True)
        return [cv2.imread(str(p)) for p in sorted(Path(tmp).glob("p-*.png"))]


def split(img: np.ndarray) -> list[np.ndarray]:
    """Les cheques (zones claires) sur le fond fonce, chacun redresse, du haut-gauche au bas-droite."""
    grey = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(cv2.GaussianBlur(grey, (9, 9), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    area = img.shape[0] * img.shape[1]
    out = []
    for c in contours:
        if cv2.contourArea(c) < MIN_AREA * area:
            continue
        rect = cv2.minAreaRect(c)
        box = cv2.boxPoints(rect).astype("float32")
        w, h = int(rect[1][0]), int(rect[1][1])
        # coins dans l'ordre : haut-gauche, haut-droit, bas-droit, bas-gauche
        s, d = box.sum(1), np.diff(box, axis=1).ravel()
        src = np.array([box[s.argmin()], box[d.argmin()], box[s.argmax()], box[d.argmax()]], dtype="float32")
        w = int(max(np.linalg.norm(src[0] - src[1]), np.linalg.norm(src[3] - src[2])))
        h = int(max(np.linalg.norm(src[0] - src[3]), np.linalg.norm(src[1] - src[2])))
        dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype="float32")
        crop = cv2.warpPerspective(img, cv2.getPerspectiveTransform(src, dst), (w, h))
        x, y = cv2.boundingRect(c)[:2]
        out.append(((y // 200, x), crop))
    return [crop for _, crop in sorted(out, key=lambda t: t[0])]


def _ocr(img: np.ndarray) -> tuple[str, float]:
    """(texte, assurance) : assurance = somme des confiances Tesseract des mots lus a plus de 60 %."""
    with tempfile.NamedTemporaryFile(suffix=".png") as f:
        cv2.imwrite(f.name, img)
        tsv = subprocess.run(["tesseract", f.name, "-", "--psm", "6", "-l", "fra+eng", "tsv"], capture_output=True, text=True).stdout
    words, score, lines, cur = [], 0.0, [], None
    for row in tsv.splitlines()[1:]:
        c = row.split("\t")
        if len(c) < 12 or not c[11].strip():
            continue
        conf = float(c[10])
        key = (c[2], c[3], c[4])
        if key != cur:
            lines.append([])
            cur = key
        lines[-1].append(c[11])
        if conf > 60 and len(c[11]) > 1:
            score += conf
    return "\n".join(" ".join(l) for l in lines), score


def upright(crop: np.ndarray) -> tuple[np.ndarray, str]:
    """Un cheque est plus large que haut ; des deux sens possibles, garde celui que Tesseract lit avec le plus
    d'assurance (le texte a l'envers donne des mots incertains)."""
    if crop.shape[0] > crop.shape[1]:
        crop = cv2.rotate(crop, cv2.ROTATE_90_CLOCKWISE)
    best = None
    for cand in (crop, cv2.rotate(crop, cv2.ROTATE_180)):
        txt, score = _ocr(cand)
        if best is None or score > best[0]:
            best = (score, cand, txt)
    return best[1], best[2]


def cheques(path: Path) -> list[tuple[np.ndarray, str]]:
    """[(image du cheque a l'endroit, texte lu)] pour toutes les pages du fichier."""
    return [upright(c) for page in pages_of(path) for c in split(page)]
