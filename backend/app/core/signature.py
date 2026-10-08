"""Signature des courriels de communication, par employe (TASK-007.1, 2026-10-08).

La signature est du HTML fait dans l'editeur de la fiche Employe ; ses images y sont gardees en data: (l'editeur les
affiche sans rien heberger). A l'envoi, chaque image data: devient une piece integree (Content-ID) : elle s'affiche
meme quand le client bloque les images distantes, et Gmail ne retire pas les images data:. Seulement les courriels de
communication (tickets, taches) -- jamais les factures, devis ni avis de retard (demande de Philippe).
"""
from __future__ import annotations

import base64
import re
import uuid

from sqlalchemy import select

_DATA_IMG = re.compile(r'src=(["\'])data:image/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)\1')


def is_empty(html: str | None) -> bool:
    if not html:
        return True
    if re.search(r"<img\b", html, re.I):
        return False
    return not re.sub(r"<[^>]+>|&nbsp;|\s", "", html)


async def for_user(db, user_id) -> str | None:
    """Signature de l'employe relie a ce compte de connexion (None si aucun)."""
    from app.models.employee import Employee
    if not user_id:
        return None
    html = (await db.execute(select(Employee.email_signature).where(
        Employee.user_id == user_id, Employee.is_active == True))).scalar_one_or_none()
    return None if is_empty(html) else html


def _email_friendly(html: str) -> str:
    # paragraphes de l'editeur : sans marge (les logiciels de courriel en ajoutent une grosse) ; vide = ligne vide
    html = re.sub(r"<p([^>]*)>\s*</p>", r"<p\1><br></p>", html)

    def margin(m):
        attrs = m.group(1) or ""
        if "style=" in attrs:
            return "<p" + re.sub(r'style=(["\'])', r'style=\1margin:0;', attrs, count=1) + ">"
        return f'<p{attrs} style="margin:0">'
    return re.sub(r"<p(\s[^>]*)?>", margin, html)


def add_to_email(body: str, signature: str) -> tuple[str, list[tuple[str, bytes, str]]]:
    """Ajoute la signature au courriel (avant le pied de page du gabarit, sinon a la fin). Retourne le HTML et les
    images a joindre : [(content_id, octets, sous-type)]."""
    images: list[tuple[str, bytes, str]] = []

    def to_cid(m):
        cid = f"sig-{uuid.uuid4().hex}@erpcrm"
        images.append((cid, base64.b64decode(re.sub(r"\s", "", m.group(3))), m.group(2).lower()))
        return f"src={m.group(1)}cid:{cid}{m.group(1)}"
    sig = _DATA_IMG.sub(to_cid, _email_friendly(signature))
    block = f'<div style="padding:4px 28px 24px;font-family:Arial,sans-serif;font-size:14px;color:#333">{sig}</div>'
    for marker in ('<div class="footer">', "</body>"):
        if marker in body:
            return body.replace(marker, block + marker, 1), images
    return body + block, images
