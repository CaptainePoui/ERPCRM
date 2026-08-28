#!/usr/bin/env bash
# Lance backfill_platform_tasks.py dans le conteneur graphiti-mcp deja en cours
# d'execution (voir tools/knowledge/graphiti/scripts/backfill_platform_tasks.py
# pour le detail). Attend que le conteneur reponde avant de lancer -- au boot,
# docker.service peut etre actif avant que docker-compose n'ait fini de
# remonter le conteneur.
set -euo pipefail

CONTAINER=graphiti-graphiti-mcp-1
PYTHON=/app/mcp/.venv/bin/python3
SCRIPT=/app/mcp/scripts/backfill_platform_tasks.py

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" true 2>/dev/null; then
    exec docker exec "$CONTAINER" "$PYTHON" "$SCRIPT"
  fi
  sleep 10
done

echo "Conteneur $CONTAINER injoignable apres 5 minutes, abandon (systemd retentera)." >&2
exit 1
