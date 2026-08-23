#!/usr/bin/env bash
# Installe/reinstalle le binding local d'Ollama pour Graphiti (lie uniquement au
# pont Docker, jamais expose au LAN -- voir tools/knowledge/graphiti/docker-compose.yml
# et la decision documentee dans le commit "Graphiti 100% local").
#
# Copie la recette versionnee ici vers les emplacements systeme reels, recharge
# systemd, redemarre ollama.service. Ne modifie aucun autre comportement d'Ollama.
#
# Prerequis : Ollama deja installe (curl -fsSL https://ollama.com/install.sh | sh).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo install -m 755 "$SCRIPT_DIR/ollama-resolve-docker-host.sh" /usr/local/bin/ollama-resolve-docker-host.sh
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo install -m 644 "$SCRIPT_DIR/ollama-override.conf" /etc/systemd/system/ollama.service.d/override.conf

sudo systemctl daemon-reload
sudo systemctl restart ollama

echo "Installe. Verification :"
systemctl is-active ollama
sudo cat /etc/ollama/environment
