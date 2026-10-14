"""Taches de fond dans UN SEUL processus (TASK-042.2, 2026-10-14).

ERPCRM tourne en deux services (erpcrm-backend :8010 et erpcrm-backend-tls :8011) qui chargent la meme
application. Sans verrou, chaque tache de fond tournait deux fois en meme temps : le 2026-10-08, l'association
automatique a cree 13 encaissements en double a quelques millisecondes d'ecart. Le processus qui obtient le verrou
consultatif PostgreSQL (session) fait tourner les taches ; l'autre attend et prend la releve si le premier s'arrete
(connexion fermee = verrou libere).
"""
import asyncio
import logging

from sqlalchemy import text

from app.core.database import engine

log = logging.getLogger(__name__)

LOCK_KEY = 4210142026       # identifiant fixe du verrou « taches de fond ERPCRM »
_RETRY = 30
_HEARTBEAT = 60


async def run_as_leader(pollers: list) -> None:
    """Attend le verrou, puis lance les taches ; si la connexion qui tient le verrou tombe, les arrete et recommence."""
    while True:
        try:
            conn = await engine.connect()
        except Exception:
            log.exception("Taches de fond : connexion a la base impossible")
            await asyncio.sleep(_RETRY)
            continue
        try:
            got = (await conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY})).scalar()
            await conn.commit()
            if not got:
                await asyncio.sleep(_RETRY)
                continue
            log.info("Taches de fond : ce processus les fait tourner (verrou obtenu)")
            tasks = [asyncio.create_task(p()) for p in pollers]
            try:
                while True:
                    await asyncio.sleep(_HEARTBEAT)
                    await conn.execute(text("SELECT 1"))
                    await conn.commit()
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Taches de fond : connexion du verrou perdue, arret des taches")
            finally:
                for t in tasks:
                    t.cancel()
                for t in tasks:
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass
        finally:
            try:
                await conn.close()
            except Exception:
                pass
