#!/usr/bin/env bash
# Reconstruit l'image graphiti-mcp-standalone depuis la release officielle
# Graphiti v0.29.3, commit immuable 021d3a57d511f21b10adaf7fa923bd5c1fce5e9d.
# Ne construit PAS depuis le HEAD mouvant de main -- decision explicite
# (voir MEMORY / echange 2026-08-21).
set -euo pipefail

COMMIT=021d3a57d511f21b10adaf7fa923bd5c1fce5e9d
TAG=v0.29.3-021d3a5
GRAPHITI_CORE_VERSION=0.29.3
EXPECTED_SHA256=261607de05c63149574448de3120033dc296709e620ad1524a6aa7b44f816914

cd "$(dirname "$0")"

if [ ! -f "graphiti-${COMMIT:0:7}.tar.gz" ]; then
  curl -fsSL "https://github.com/getzep/graphiti/archive/${COMMIT}.tar.gz" -o "graphiti-${COMMIT:0:7}.tar.gz"
fi

echo "${EXPECTED_SHA256}  graphiti-${COMMIT:0:7}.tar.gz" | sha256sum -c -

rm -rf "graphiti-${COMMIT}"
tar xzf "graphiti-${COMMIT:0:7}.tar.gz"

# Patches Simple IP Platform (appliques sur l'extraction, jamais sur le tarball source
# verifie SHA256 ci-dessus). Voir patches/*.patch pour le detail de chaque correctif.
for p in patches/*.patch; do
  [ -e "$p" ] || continue
  echo "Application du patch : $p"
  patch -p1 -d "graphiti-${COMMIT}" < "$p"
done

cd "graphiti-${COMMIT}/mcp_server"
DOCKER_BUILDKIT=1 docker build \
  -f docker/Dockerfile.standalone \
  --build-arg GRAPHITI_CORE_VERSION="${GRAPHITI_CORE_VERSION}" \
  --build-arg MCP_SERVER_VERSION=1.0.2 \
  --build-arg VCS_REF="${COMMIT}" \
  -t "graphiti-mcp-standalone:${TAG}" \
  .

cd ../..
rm -rf "graphiti-${COMMIT}"

echo "Image construite : graphiti-mcp-standalone:${TAG}"
echo "Verification : docker run --rm graphiti-mcp-standalone:${TAG} cat /app/mcp/.graphiti-core-version"
