"""Numerotation des documents -- un compteur par type, qui ne fait que monter.

- Verrou de ligne (SELECT ... FOR UPDATE) : deux creations simultanees ne recoivent jamais le meme numero.
- Le compteur avance dans la meme transaction que le document : si la creation echoue (rollback),
  le numero n'est pas consomme (pas de trou) ; une fois le document enregistre, plus jamais redonne,
  meme si le document est supprime ensuite.
- Garde-fou : jamais en dessous du plus grand numero deja present avec ce prefixe (ex. documents importes).
- Un changement manuel du prochain numero (set_next_number) est refuse s'il fait reculer le compteur.
"""
import re
from datetime import date

from fastapi import HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_counter import DocumentCounter

# type -> (valeurs par defaut, modele/colonne ou vivent les numeros)
DEFAULTS = {
    "invoice": ("{year}-", 4),
    "credit": ("CN-", 5),          # avoirs : suite separee, comme dans l'ancien logiciel (CN-00308 importe)
    "devis": ("{year}-D", 4),
    "payment": ("PAY-{year}-", 4),
    "purchase_order": ("BC-", 5),
    "ecom_order": ("WEB-", 5),
}


def _column(key: str):
    if key in ("invoice", "credit"):
        from app.models.invoice import Invoice
        return Invoice.number
    if key == "devis":
        from app.models.devis import Devis
        return Devis.number
    if key == "payment":
        from app.models.client_payment import ClientPayment
        return ClientPayment.reference
    if key == "purchase_order":
        from app.models.purchase_order import PurchaseOrder
        return PurchaseOrder.po_number
    if key == "ecom_order":
        from app.models.ecom import EcomOrder
        return EcomOrder.order_number
    raise ValueError(key)


def render_prefix(prefix: str) -> str:
    return prefix.replace("{year}", str(date.today().year))


async def _highest(db: AsyncSession, key: str, prefix: str) -> int:
    """Plus grand numero deja utilise avec ce prefixe (0 si aucun)."""
    col = _column(key)
    values = (await db.execute(select(col).where(col.like(prefix.replace("%", r"\%") + "%")))).scalars().all()
    best = 0
    for v in values:
        rest = v[len(prefix):]
        if re.fullmatch(r"\d+", rest or ""):
            best = max(best, int(rest))
    return best


async def _counter(db: AsyncSession, key: str) -> DocumentCounter:
    c = (await db.execute(select(DocumentCounter).where(DocumentCounter.key == key).with_for_update())).scalar_one_or_none()
    if c is None:
        prefix, padding = DEFAULTS[key]
        c = DocumentCounter(key=key, prefix=prefix, padding=padding, next_value=1)
        db.add(c)
        await db.flush()
        c = (await db.execute(select(DocumentCounter).where(DocumentCounter.key == key).with_for_update())).scalar_one()
    return c


async def next_document_number(db: AsyncSession, key: str) -> str:
    """Attribue le prochain numero du type `key` (dans la transaction en cours)."""
    c = await _counter(db, key)
    prefix = render_prefix(c.prefix)
    value = max(c.next_value, await _highest(db, key, prefix) + 1)
    c.next_value = value + 1
    await db.flush()
    return f"{prefix}{value:0{c.padding}d}" if c.padding else f"{prefix}{value}"


async def preview_next(db: AsyncSession, key: str) -> dict:
    c = await _counter(db, key)
    prefix = render_prefix(c.prefix)
    value = max(c.next_value, await _highest(db, key, prefix) + 1)
    return {"key": key, "prefix": c.prefix, "padding": c.padding, "next_value": value,
            "next_number": f"{prefix}{value:0{c.padding}d}" if c.padding else f"{prefix}{value}"}


async def set_next_number(db: AsyncSession, key: str, prefix: str, next_value: int, padding: int) -> None:
    """Change le format ou le prochain numero. Refuse tout recul : avec le meme prefixe, le prochain
    numero ne peut pas etre plus petit que le compteur actuel ; avec un autre prefixe, il ne peut pas
    retomber sur un numero deja utilise avec ce prefixe."""
    if next_value < 1 or not (0 <= padding <= 10) or not prefix or len(prefix) > 30:
        raise HTTPException(status_code=400, detail="Format de numérotation invalide")
    c = await _counter(db, key)
    floor = await _highest(db, key, render_prefix(prefix)) + 1
    if prefix == c.prefix:
        floor = max(floor, c.next_value)
    if next_value < floor:
        raise HTTPException(status_code=400, detail=f"Le compteur ne peut pas reculer : prochain numéro minimum {floor}")
    c.prefix, c.next_value, c.padding = prefix, next_value, padding
    await db.flush()
