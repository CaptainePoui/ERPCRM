#!/usr/bin/env bash
# Installe le service systemd qui reprend/termine le backfill Graphiti de
# PLATFORM_TASKS.md/ERRORS_LESSONS.md, meme apres un reboot ou un crash --
# voir ERRORS_LESSONS.md et scripts/backfill_platform_tasks.py pour le
# contexte (queue MCP en memoire qui a perdu le run precedent le 2026-08-27).
#
# Copie la recette versionnee ici vers les emplacements systeme reels,
# recharge systemd, active + demarre le service.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo install -m 755 "$SCRIPT_DIR/run-graphiti-backfill.sh" /usr/local/bin/run-graphiti-backfill.sh
sudo install -m 644 "$SCRIPT_DIR/graphiti-backfill.service" /etc/systemd/system/graphiti-backfill.service

sudo systemctl daemon-reload
sudo systemctl enable graphiti-backfill.service
# --no-block : le service est "oneshot" et peut tourner plusieurs jours (voir
# backfill_platform_tasks.py) -- "systemctl start" sans --no-block attendrait
# sa fin complete avant de rendre la main.
sudo systemctl start --no-block graphiti-backfill.service

echo "Installe et demarre en arriere-plan. Verification :"
systemctl status graphiti-backfill --no-pager || true
