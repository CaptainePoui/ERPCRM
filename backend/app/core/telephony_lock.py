"""Verrou d'edition telephonie par compagnie (TASK-020).

Regle (confirmee par Philippe, 2026-09-11) :
- Premier arrive/premier servi ENTRE PAIRS du meme type (tech vs tech,
  client vs client) -- le 2e du meme type est bloque tant que le 1er n'a
  pas relache ou que son inactivite depasse le timeout.
- Un TECH preempte toujours un verrou detenu par un CLIENT (priorite
  instantanee), jamais l'inverse.
- Timeout : 30 minutes d'inactivite glissante (chaque acquisition reussie
  ou refresh avance last_activity_at).
"""

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.telephony_lock import TelephonyLock

LOCK_TIMEOUT = timedelta(minutes=30)


async def acquire_telephony_lock(
    db: AsyncSession, company_id: UUID, holder_type: str, holder_id: UUID, holder_label: str,
) -> None:
    """Verifie/acquiert le verrou pour cette compagnie, ou leve HTTPException(423)
    si un autre detenteur du meme rang (ou un tech en place) bloque l'acces."""
    now = datetime.now(timezone.utc)
    result = await db.execute(select(TelephonyLock).where(TelephonyLock.company_id == company_id))
    lock = result.scalar_one_or_none()

    if lock is None or (now - lock.last_activity_at) > LOCK_TIMEOUT:
        if lock is None:
            lock = TelephonyLock(company_id=company_id)
            db.add(lock)
        lock.holder_type = holder_type
        lock.holder_id = holder_id
        lock.holder_label = holder_label
        lock.acquired_at = now
        lock.last_activity_at = now
        await db.commit()
        return

    if lock.holder_type == holder_type and lock.holder_id == holder_id:
        lock.last_activity_at = now
        await db.commit()
        return

    if lock.holder_type == "client" and holder_type == "tech":
        lock.holder_type = holder_type
        lock.holder_id = holder_id
        lock.holder_label = holder_label
        lock.acquired_at = now
        lock.last_activity_at = now
        await db.commit()
        return

    remaining = LOCK_TIMEOUT - (now - lock.last_activity_at)
    minutes = max(1, int(remaining.total_seconds() // 60) + 1)
    raise HTTPException(
        status_code=status.HTTP_423_LOCKED,
        detail=f"Verrouillé par {lock.holder_label} -- réessayez dans environ {minutes} min ou attendez la libération.",
    )


async def release_telephony_lock(db: AsyncSession, company_id: UUID, holder_type: str, holder_id: UUID) -> None:
    """Libere le verrou seulement si c'est bien ce detenteur qui le tient."""
    result = await db.execute(select(TelephonyLock).where(TelephonyLock.company_id == company_id))
    lock = result.scalar_one_or_none()
    if lock and lock.holder_type == holder_type and lock.holder_id == holder_id:
        await db.delete(lock)
        await db.commit()
