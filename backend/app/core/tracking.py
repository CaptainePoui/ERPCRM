import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.email_open import EmailOpen


async def get_open_stats(db: AsyncSession, entity_type: str, entity_ids: list[uuid.UUID]) -> dict[uuid.UUID, tuple]:
    """
    Retourne {entity_id: (last_opened_at, open_count)} pour un lot d'entites en UNE
    seule requete agregee (evite le N+1 dans les listes -- Tickets/Invoices/Devis).
    Une entite absente du resultat n'a jamais ete ouverte.
    """
    if not entity_ids:
        return {}
    result = await db.execute(
        select(EmailOpen.entity_id, func.max(EmailOpen.opened_at), func.count())
        .where(EmailOpen.entity_type == entity_type, EmailOpen.entity_id.in_(entity_ids))
        .group_by(EmailOpen.entity_id)
    )
    return {row[0]: (row[1], row[2]) for row in result.all()}
