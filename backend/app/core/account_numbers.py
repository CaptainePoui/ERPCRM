"""Numero de compte des compagnies (txxxx) -- TASK-002.7, 2026-10-14. Philippe : chaque compagnie a son numero, hebergee
ou pas ; il ne change jamais ; il devient le numero du tenant SIPV si elle est hebergee. Suite : reglage
« next_tenant_number » (depart t1046, l'ancien systeme allait jusqu'a t1045)."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.app_settings import AppSetting

KEY = "next_tenant_number"
DEFAULT = 1046


async def peek(db: AsyncSession) -> str:
    s = (await db.execute(select(AppSetting).where(AppSetting.key == KEY))).scalar_one_or_none()
    return f"t{int(s.value) if s else DEFAULT}"


async def advance(db: AsyncSession, used: str) -> None:
    n = int(used.lstrip("tT")) + 1
    s = (await db.execute(select(AppSetting).where(AppSetting.key == KEY))).scalar_one_or_none()
    if s:
        s.value = str(n)
    else:
        db.add(AppSetting(key=KEY, value=str(n), description="Prochain numero de compte auto-assigne (format t####)"))


async def assign(db: AsyncSession) -> str:
    """Prend le prochain numero et avance la suite."""
    n = await peek(db)
    await advance(db, n)
    return n
