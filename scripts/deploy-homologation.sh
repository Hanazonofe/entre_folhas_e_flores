#!/usr/bin/env bash
# Invoked on garden-prd with the validated full commit SHA; production is read-only.
set -euo pipefail
umask 077
SHA=${1:?Informe o SHA completo}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA inválido.' >&2; exit 1; }
APP_DIR=/home/felipe/entre_folhas_homol
cd "$APP_DIR"
exec 9>/home/felipe/.entre-folhas-homol.lock
flock -n 9 || { echo 'Outra operação de homologação está em andamento.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Checkout de homologação possui alterações locais.' >&2; exit 1; }
[[ -f .env.homol-sandbox ]] || { echo 'Execute configure-homologation.py primeiro.' >&2; exit 1; }
available=$(awk '/MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
disk=$(df -Pm . | awk 'NR==2 {print $4}')
(( available >= 1536 && disk >= 3072 )) || { echo 'Sem margem de recursos para homologação.' >&2; exit 1; }
# Old installations may have been cloned with --single-branch (main only).
# Fetch every branch explicitly before checking candidate reachability.
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*'
git cat-file -e "${SHA}^{commit}"
git for-each-ref --contains "$SHA" --format='%(refname)' refs/remotes/origin/ | grep -q . || { echo 'Commit não pertence às branches remotas.' >&2; exit 1; }
previous=$(git rev-parse HEAD)
echo "Versão anterior: $previous; candidata: $SHA"
git checkout --detach "$SHA"
export HOMOL_SHA=$SHA
export HOMOL_CADDY_TAG
HOMOL_CADDY_TAG=$(sha256sum deployment/Dockerfile.caddy deployment/caddy-entrypoint.sh | sha256sum | cut -c1-16)
compose=(docker compose --env-file .env.homol-sandbox -f compose.homol.yaml)
"${compose[@]}" config --quiet
"${compose[@]}" build migrate
if ! docker image inspect "entre-folhas-pdv-homol-caddy:$HOMOL_CADDY_TAG" >/dev/null 2>&1; then
  # Reuse the identical Caddy binary, but give homologation its own image tag.
  if cmp -s deployment/Dockerfile.caddy /home/felipe/entre_folhas_prod/deployment/Dockerfile.caddy \
     && cmp -s deployment/caddy-entrypoint.sh /home/felipe/entre_folhas_prod/deployment/caddy-entrypoint.sh \
     && docker image inspect entre-folhas-pdv-caddy >/dev/null 2>&1; then
    docker tag entre-folhas-pdv-caddy "entre-folhas-pdv-homol-caddy:$HOMOL_CADDY_TAG"
  else
    "${compose[@]}" build web
  fi
fi
# Stop sandbox ingress before migrations; never run down or touch production.
docker ps -q --filter label=com.docker.compose.project=entre-folhas-pdv-homol \
  --filter label=com.docker.compose.service=web | xargs -r docker stop
docker ps -q --filter label=com.docker.compose.project=entre-folhas-pdv-homol \
  --filter label=com.docker.compose.service=api | xargs -r docker stop
"${compose[@]}" up -d --wait --wait-timeout 120 --no-build db
"${compose[@]}" run --rm --no-deps migrate
# The one-off migration above is the gate; do not run it again through depends_on.
"${compose[@]}" up -d --no-build --no-deps api web
for attempt in $(seq 1 60); do
  if payload=$(curl --max-time 5 -fsS --resolve entre-folhas-homol.duckdns.org:8443:100.101.186.24 \
      https://entre-folhas-homol.duckdns.org:8443/api/health) \
      && printf '%s' "$payload" | python3 -c 'import json,sys; p=json.load(sys.stdin); assert p["status"]=="ok" and p["environment"]=="homologation" and p["release_sha"]==sys.argv[1]' "$SHA"; then
    printf 'HOMOL_SHA=%s\nHOMOL_CADDY_TAG=%s\n' "$SHA" "$HOMOL_CADDY_TAG" > .homol-release.env
    echo "Homologação publicada: $SHA"
    exit 0
  fi
  sleep 2
done
echo "Falha ao validar $SHA. Versão anterior: $previous. Não foi feito rollback de migrations." >&2
"${compose[@]}" ps
exit 1
