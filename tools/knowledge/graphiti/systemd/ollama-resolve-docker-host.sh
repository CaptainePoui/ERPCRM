#!/usr/bin/env bash
# Resout dynamiquement l'IP de la passerelle du pont Docker "bridge" par defaut
# et l'ecrit dans un fichier d'environnement pour ollama.service (OLLAMA_HOST).
# Pas d'IP codee en dur : si le sous-reseau du pont Docker change un jour,
# ce script s'adapte automatiquement au prochain demarrage.
set -euo pipefail
OUT=/etc/ollama/environment
mkdir -p /etc/ollama

for i in $(seq 1 30); do
  IP=$(ip -4 addr show docker0 2>/dev/null | grep -oP 'inet \K[\d.]+' || true)
  if [ -n "$IP" ]; then
    echo "OLLAMA_HOST=${IP}:11434" > "$OUT"
    exit 0
  fi
  sleep 1
done

echo "ERREUR: interface docker0 introuvable apres 30s" >&2
exit 1
