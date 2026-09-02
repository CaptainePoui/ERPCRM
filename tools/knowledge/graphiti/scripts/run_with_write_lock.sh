#!/usr/bin/env bash
# Enveloppe tout script qui ecrit directement dans Graphiti (add_episode(),
# hors file d'attente/hors MCP add_memory) avec le meme verrou que
# graphiti_queue_consumer.py -- pour que jamais deux ecritures directes ne se
# chevauchent (voir avertissement dans backfill_platform_tasks.py).
#
# Usage : ./run_with_write_lock.sh docker exec graphiti-graphiti-mcp-1 \
#           /app/mcp/.venv/bin/python3 /app/mcp/scripts/backfill_platform_tasks.py
#
# Le verrou est cote HOTE (tools/knowledge/graphiti/scripts/.graphiti_write.lock),
# pas dans le conteneur (mount ./scripts en lecture seule).

set -euo pipefail

LOCK_FILE="$(dirname "$0")/.graphiti_write.lock"

if [ -f "$LOCK_FILE" ]; then
    echo "REFUS : verrou deja tenu (contenu : $(cat "$LOCK_FILE"))." >&2
    echo "Un autre script ecrit deja directement dans Graphiti -- attends qu'il termine." >&2
    exit 1
fi

echo "PID:$$
reason:$*
started_at:$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK_FILE"

cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

"$@"
